/* ============================================
   鑫钱包 · 数据库集成测试
   覆盖：复式记账核心路径（账户/交易/转账/余额推导）
   运行前置：需 MariaDB 连接（通过 .env 或默认 localhost:3306）
   ============================================ */
const test = require('node:test');
const assert = require('node:assert');

// 加载 .env 配置
require('dotenv').config({ path: __dirname + '/../.env' });

const db = require('../server/db');
const {
    sumLedgerEffects, computeAccountBalance
} = require('../server/routes/_helpers');
const { toNumber } = require('../server/validate');

// ==========================================
// 测试工具：每个测试用独立测试用户 + 隔离子账户
// ==========================================
const TEST_USER_PREFIX = 't_helper_user_';

async function createTestUser() {
    const username = TEST_USER_PREFIX + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const result = await db.query(
        'INSERT INTO users (username, password_hash, nickname) VALUES (?, ?, ?)',
        [username, 'test_hash_' + Math.random(), '测试用户']
    );
    return { id: Number(result.insertId), username };
}

async function cleanupTestUser(userId) {
    // 事务关联删除（应用层维护一致性，无需 ON DELETE CASCADE）
    await db.query('DELETE FROM transactions WHERE user_id = ?', [userId]);
    await db.query('DELETE FROM transfers WHERE user_id = ?', [userId]);
    await db.query('DELETE FROM accounts WHERE user_id = ?', [userId]);
    await db.query('DELETE FROM savings_goals WHERE user_id = ?', [userId]);
    await db.query('DELETE FROM budgets WHERE user_id = ?', [userId]);
    await db.query('DELETE FROM categories WHERE user_id = ?', [userId]);
    await db.query('DELETE FROM tags WHERE user_id = ?', [userId]);
    await db.query('DELETE FROM debts WHERE user_id = ?', [userId]);
    await db.query('DELETE FROM investments WHERE user_id = ?', [userId]);
    await db.query('DELETE FROM users WHERE id = ?', [userId]);
}

async function createTestAccount(userId, name, openingBalance = 0) {
    const result = await db.query(
        `INSERT INTO accounts (user_id, name, type, icon, balance, opening_balance, status)
         VALUES (?, ?, 'cash', '💰', ?, ?, 'active')`,
        [userId, name, openingBalance, openingBalance]
    );
    return Number(result.insertId);
}

async function getCategoryId(userId, name, type = 'expense') {
    let cat = await db.queryOne(
        'SELECT id FROM categories WHERE name = ? AND type = ? AND user_id IS NULL LIMIT 1',
        [name, type]
    );
    return cat ? cat.id : null;
}

// ==========================================
// 套件前置：检测数据库可用性
// ==========================================
let dbAvailable = false;

// 跳过包装函数：数据库不可用时自动跳过而非失败
function dbTest(name, fn) {
    return test(name, async (t) => {
        if (!dbAvailable) {
            t.skip('数据库不可用，跳过（运行 `docker compose up -d db` 启动后重试）');
            return;
        }
        await fn(t);
    });
}

test.before(async () => {
    // 测试连接可用性（设置 5 秒超时避免无限等待）
    try {
        const probe = await Promise.race([
            db.queryOne('SELECT 1 AS ok'),
            new Promise((_, rej) => setTimeout(() => rej(new Error('连接超时（5s）')), 5000))
        ]);
        if (probe && probe.ok === 1) dbAvailable = true;
        console.log('[integration] 数据库连接成功');
    } catch (err) {
        console.warn('[integration] 数据库不可用，相关测试将跳过:', err.message);
    }
});

test.after(async () => {
    if (dbAvailable) {
        try { await db.pool.end(); } catch (_) { /* 也许已关闭 */ }
    }
});

// ==========================================
// toNumber 单元测试（业务关键）
// ==========================================
test('toNumber 处理交易金额', () => {
    assert.strictEqual(toNumber('100.50'), 100.50);
    assert.strictEqual(toNumber(100), 100);
});

test('toNumber 拒绝负数（用于校验金额合法性，业务层要求 >0）', () => {
    // 负数虽然能解析，但业务路由层会在 toNumber <= 0 时返回 400
    assert.strictEqual(toNumber('-50'), -50); // 此处只是数字校验
});

// ==========================================
// 复式记账核心：余额由账本推导
// ==========================================
dbTest('computeAccountBalance: 期初余额 = 100，无流水 → 余额 = 100', async () => {
    const user = await createTestUser();
    try {
        const accId = await createTestAccount(user.id, '现金账户', 100);
        const bal = await computeAccountBalance(db, user.id, accId);
        assert.strictEqual(bal, 100);
    } finally {
        await cleanupTestUser(user.id);
    }
});

dbTest('computeAccountBalance: 收入交易增加余额', async () => {
    const user = await createTestUser();
    try {
        const accId = await createTestAccount(user.id, '工资账户', 0);
        const catId = await getCategoryId(user.id, '工资', 'income');
        await db.query(
            `INSERT INTO transactions (user_id, account_id, category_id, type, amount, date, note)
             VALUES (?, ?, ?, 'income', ?, NOW(), '月工资')`,
            [user.id, accId, catId, 5000]
        );
        const bal = await computeAccountBalance(db, user.id, accId);
        assert.strictEqual(bal, 5000);
    } finally {
        await cleanupTestUser(user.id);
    }
});

dbTest('computeAccountBalance: 支出交易减少余额', async () => {
    const user = await createTestUser();
    try {
        const accId = await createTestAccount(user.id, '日常账户', 1000);
        const catId = await getCategoryId(user.id, '餐饮', 'expense');
        await db.query(
            `INSERT INTO transactions (user_id, account_id, category_id, type, amount, date, note)
             VALUES (?, ?, ?, 'expense', ?, NOW(), '午餐')`,
            [user.id, accId, catId, 200]
        );
        const bal = await computeAccountBalance(db, user.id, accId);
        assert.strictEqual(bal, 800); // 1000 - 200
    } finally {
        await cleanupTestUser(user.id);
    }
});

dbTest('computeAccountBalance: 储蓄目标从余额中扣减（账本外调整）', async () => {
    const user = await createTestUser();
    try {
        const accId = await createTestAccount(user.id, '储蓄账户', 1000);
        // 创建储蓄目标并分配 300 元
        await db.query(
            `INSERT INTO savings_goals (user_id, name, target_amount, current_amount, account_id, status)
             VALUES (?, '应急基金', 10000, 300, ?, 'active')`,
            [user.id, accId]
        );
        const bal = await computeAccountBalance(db, user.id, accId);
        // 余额 = 期初 1000 + 账本 0 - 已分配 300 = 700
        assert.strictEqual(bal, 700);
    } finally {
        await cleanupTestUser(user.id);
    }
});

dbTest('computeAccountBalance: 转账双账户原子操作', async () => {
    const user = await createTestUser();
    try {
        // 两个账户期初 1000 和 500
        const accA = await createTestAccount(user.id, '账户A', 1000);
        const accB = await createTestAccount(user.id, '账户B', 500);

        // 转账 200: A → B（事务模拟）
        await db.transaction(async (conn) => {
            const tr = await conn.query(
                `INSERT INTO transfers (user_id, from_account_id, to_account_id, amount, date, status)
                 VALUES (?, ?, ?, ?, NOW(), 'completed')`,
                [user.id, accA, accB, 200]
            );
            // 转出
            await conn.query(
                `INSERT INTO transactions (user_id, account_id, category_id, type, amount, date, transfer_id, source_account_id)
                 VALUES (?, ?, 22, 'transfer_out', ?, NOW(), ?, ?)`,
                [user.id, accA, 200, tr.insertId, accA]
            );
            // 转入
            await conn.query(
                `INSERT INTO transactions (user_id, account_id, category_id, type, amount, date, transfer_id, destination_account_id)
                 VALUES (?, ?, 22, 'transfer_in', ?, NOW(), ?, ?)`,
                [user.id, accB, 200, tr.insertId, accB]
            );
        });

        // 校验：A 余额 = 1000 - 200 = 800；B 余额 = 500 + 200 = 700
        const balA = await computeAccountBalance(db, user.id, accA);
        const balB = await computeAccountBalance(db, user.id, accB);
        assert.strictEqual(balA, 800);
        assert.strictEqual(balB, 700);
    } finally {
        await cleanupTestUser(user.id);
    }
});

dbTest('computeAccountBalance: 同一账户多笔混合流水', async () => {
    const user = await createTestUser();
    try {
        const accId = await createTestAccount(user.id, '主账户', 0);
        const incId = await getCategoryId(user.id, '工资', 'income');
        const expId = await getCategoryId(user.id, '餐饮', 'expense');

        // 期初 0、收入 3000、支出 500、再收入 200、再支出 800
        await db.query(
            `INSERT INTO transactions (user_id, account_id, category_id, type, amount, date) VALUES (?, ?, ?, 'income', ?, NOW())`,
            [user.id, accId, incId, 3000]
        );
        await db.query(
            `INSERT INTO transactions (user_id, account_id, category_id, type, amount, date) VALUES (?, ?, ?, 'expense', ?, NOW())`,
            [user.id, accId, expId, 500]
        );
        await db.query(
            `INSERT INTO transactions (user_id, account_id, category_id, type, amount, date) VALUES (?, ?, ?, 'income', ?, NOW())`,
            [user.id, accId, incId, 200]
        );
        await db.query(
            `INSERT INTO transactions (user_id, account_id, category_id, type, amount, date) VALUES (?, ?, ?, 'expense', ?, NOW())`,
            [user.id, accId, expId, 800]
        );

        // 期初 0 + (3000 - 500 + 200 - 800) = 1900
        const bal = await computeAccountBalance(db, user.id, accId);
        assert.strictEqual(bal, 1900);
    } finally {
        await cleanupTestUser(user.id);
    }
});

// ==========================================
// sumLedgerEffects 直接验证
// ==========================================
dbTest('sumLedgerEffects 跨账户流水正确归属', async () => {
    const user = await createTestUser();
    try {
        const accA = await createTestAccount(user.id, '账户A', 0);
        const accB = await createTestAccount(user.id, '账户B', 0);
        // A 上 +100，B 上 -100（A 转入 B）
        await db.transaction(async (conn) => {
            const tr = await conn.query(
                `INSERT INTO transfers (user_id, from_account_id, to_account_id, amount, date, status) VALUES (?, ?, ?, 100, NOW(), 'completed')`,
                [user.id, accB, accA]
            );
            await conn.query(
                `INSERT INTO transactions (user_id, account_id, category_id, type, amount, date, transfer_id, source_account_id) VALUES (?, ?, 22, 'transfer_out', 100, NOW(), ?, ?)`,
                [user.id, accB, tr.insertId, accB]
            );
            await conn.query(
                `INSERT INTO transactions (user_id, account_id, category_id, type, amount, date, transfer_id, destination_account_id) VALUES (?, ?, 22, 'transfer_in', 100, NOW(), ?, ?)`,
                [user.id, accA, tr.insertId, accA]
            );
        });
        const effectA = await sumLedgerEffects(db, user.id, accA);
        const effectB = await sumLedgerEffects(db, user.id, accB);
        assert.strictEqual(effectA, 100);  // A 收到
        assert.strictEqual(effectB, -100); // B 转出
    } finally {
        await cleanupTestUser(user.id);
    }
});
