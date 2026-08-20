/* 数据库集成测试：list_accounts / list_categories 工具 SQL 过滤正确性
 *
 * 这两个工具是 v0.0.44 关键功能——AI 真正能查到账户/类目 id 的唯一通道。
 * 必须确保 SQL 行为：
 *   - 只返回当前 user + 当前 book
 *   - 只返回 active 账户（不返回已删除/已停用）
 *   - 模糊匹配 query 对中文生效
 *   - 类型过滤正确
 *
 * 不测试 executeTool 闭包本身（需要 mock provider，复杂度不值），只验证 dispatch 用的 SQL 行为。
 * 本地无 Postgres 时全部跳过（CI 有 DB）。
 */
const test = require('node:test');
const assert = require('node:assert');

require('dotenv').config({ path: __dirname + '/../.env' });
const db = require('../server/db');

let dbAvailable = false;
const TEST_USER_PREFIX = 't_aitools_user_';

async function ensureDb() {
    if (dbAvailable) return true;
    try {
        await db.query('SELECT 1');
        dbAvailable = true;
    } catch (_) {
        dbAvailable = false;
    }
    return dbAvailable;
}

async function createTestUser() {
    const username = TEST_USER_PREFIX + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const result = await db.query(
        'INSERT INTO users (username, password_hash, nickname) VALUES (?, ?, ?)',
        [username, 'test_hash_' + Math.random(), 'AI 测试用户']
    );
    const userId = Number(result.insertId);
    const bookId = await db.ensureDefaultBookId(userId);
    return { id: userId, bookId, username };
}

async function cleanupTestUser(userId) {
    const tables = ['transactions', 'transfers', 'accounts', 'savings_goals', 'budgets', 'categories', 'tags', 'debts', 'investments', 'books'];
    for (const t of tables) {
        try { await db.query(`DELETE FROM ${t} WHERE user_id = ?`, [userId]); } catch (_) { /* column may not exist */ }
    }
    await db.query('DELETE FROM users WHERE id = ?', [userId]);
}

async function ensureAccount(userId, bookId, name, status = 'active') {
    const res = await db.query(
        'INSERT INTO accounts (user_id, book_id, name, type, icon, opening_balance, balance, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [userId, bookId, name, 'cash', '💰', 0, 0, status]
    );
    return Number(res.insertId);
}

async function ensureCategory(userId, bookId, name, type = 'expense') {
    const res = await db.query(
        'INSERT INTO categories (user_id, book_id, name, type, icon, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
        [userId, bookId, name, type, '🧾', 0]
    );
    return Number(res.insertId);
}

test('list_accounts SQL：仅返回当前用户当前账本的 active 账户', async (t) => {
    if (!(await ensureDb())) { t.skip('no Postgres'); return; }
    const userA = await createTestUser();
    const userB = await createTestUser();
    try {
        await ensureAccount(userA.id, userA.bookId, '微信 零钱通');
        await ensureAccount(userA.id, userA.bookId, '招行储蓄卡');
        const a3 = await ensureAccount(userA.id, userA.bookId, '已停用账户');
        await db.query('UPDATE accounts SET status = ? WHERE id = ?', ['inactive', a3]);
        await ensureAccount(userB.id, userB.bookId, '别人的账户');

        // 与 server/routes/ai.js list_accounts 分支 SQL 完全一致
        const rows = await db.query(
            `SELECT id, name FROM accounts
             WHERE user_id = $1 AND book_id = $2 AND status = 'active'
             ORDER BY sort_order, id`,
            [userA.id, userA.bookId]
        );
        const names = rows.map(r => r.name).sort();
        assert.deepStrictEqual(names, ['招行储蓄卡', '微信 零钱通']);
    } finally {
        await cleanupTestUser(userA.id);
        await cleanupTestUser(userB.id);
    }
});

test('list_accounts SQL：query 模糊匹配——"零钱" 命中 "微信 零钱通"', async (t) => {
    if (!(await ensureDb())) { t.skip('no Postgres'); return; }
    const user = await createTestUser();
    try {
        await ensureAccount(user.id, user.bookId, '微信 零钱通');
        await ensureAccount(user.id, user.bookId, '招行储蓄卡');

        const matched = await db.query(
            `SELECT name FROM accounts WHERE user_id = $1 AND book_id = $2 AND status = 'active' AND name LIKE $3`,
            [user.id, user.bookId, '%零钱%']
        );
        assert.strictEqual(matched.length, 1);
        assert.strictEqual(matched[0].name, '微信 零钱通');

        const notMatched = await db.query(
            `SELECT name FROM accounts WHERE user_id = $1 AND book_id = $2 AND status = 'active' AND name LIKE $3`,
            [user.id, user.bookId, '%随便不存在的账户%']
        );
        assert.strictEqual(notMatched.length, 0);
    } finally {
        await cleanupTestUser(user.id);
    }
});

test('list_categories SQL：返回用户私有 + 全局公共，类型过滤正确，跨用户不串', async (t) => {
    if (!(await ensureDb())) { t.skip('no Postgres'); return; }
    const user = await createTestUser();
    const other = await createTestUser();
    try {
        await ensureCategory(user.id, user.bookId, '外卖小吃', 'expense');
        await ensureCategory(user.id, user.bookId, '工资', 'income');
        await db.query(
            "INSERT INTO categories (user_id, book_id, name, type, icon, sort_order) VALUES (NULL, NULL, '公共-早餐', 'expense', '🥐', 0)"
        );
        await ensureCategory(other.id, other.bookId, '别人的私密类目', 'expense');

        const expenseRows = await db.query(
            `SELECT name FROM categories
             WHERE (user_id IS NULL OR (user_id = $1 AND (book_id IS NULL OR book_id = $2)))
               AND type = 'expense'
             ORDER BY type, sort_order`,
            [user.id, user.bookId]
        );
        const names = expenseRows.map(r => r.name).sort();
        assert.ok(names.includes('外卖小吃'), '应包含用户私有 expense');
        assert.ok(names.includes('公共-早餐'), '应包含全局公共 expense');
        assert.ok(!names.includes('别人的私密类目'), '不应包含别人账本');
        assert.ok(!names.includes('工资'), '不应包含 income 类型');

        const incomeRows = await db.query(
            `SELECT name FROM categories
             WHERE (user_id IS NULL OR (user_id = $1 AND (book_id IS NULL OR book_id = $2)))
               AND type = 'income'
             ORDER BY type, sort_order`,
            [user.id, user.bookId]
        );
        const incomeNames = incomeRows.map(r => r.name).sort();
        assert.deepStrictEqual(incomeNames, ['工资']);
    } finally {
        await cleanupTestUser(user.id);
        await cleanupTestUser(other.id);
    }
});

test.after(async () => {
    if (dbAvailable) {
        try { await db.pool.end(); } catch (_) { /* ignore */ }
    }
});
