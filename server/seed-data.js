/* ============================================
   鑫钱包 · 种子数据模块
   为每个新用户首次创建后，自动注入覆盖所有功能模块的演示数据
   ============================================ */

const db = require('./db');

// 复式记账账户余额计算（与 routes/_helpers.js 中的逻辑保持一致）
async function sumLedgerEffects(conn, userId, accountId) {
    const rows = await conn.query(
        `SELECT COALESCE(SUM(
            CASE
                WHEN source_account_id = ? THEN -amount
                WHEN destination_account_id = ? THEN amount
                WHEN account_id = ? AND type IN ('income','transfer_in') THEN amount
                WHEN account_id = ? AND type IN ('expense','transfer_out') THEN -amount
                ELSE 0
            END), 0) AS bal
        FROM transactions
        WHERE user_id = ? AND (source_account_id = ? OR destination_account_id = ? OR account_id = ?)`,
        [accountId, accountId, accountId, accountId, userId, accountId, accountId, accountId]
    );
    return parseFloat(rows[0] && rows[0].bal != null ? rows[0].bal : 0);
}

async function computeAccountBalance(conn, userId, accountId) {
    const acc = await conn.query('SELECT opening_balance FROM accounts WHERE id = ? AND user_id = ?', [accountId, userId]);
    const opening = acc[0] ? parseFloat(acc[0].opening_balance || 0) : 0;
    const effects = await sumLedgerEffects(conn, userId, accountId);
    return opening + effects;
}

/**
 * 为指定用户注入完整的种子数据
 * @param {number} userId - 用户 ID
 * @param {object} conn - 数据库连接（事务中）
 */
async function seedUserData(userId, conn) {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const currentMonth = `${y}-${String(m + 1).padStart(2, '0')}`;
    const prevMonth = m === 0 ? `${y - 1}-12` : `${y}-${String(m).padStart(2, '0')}`;
    const lastMonth = m === 0 ? 11 : m - 1;
    const lmY = m === 0 ? y - 1 : y;
    const twoMonthsAgo = (() => {
        let mm = m - 2;
        let yy = y;
        if (mm < 0) { mm += 12; yy -= 1; }
        return `${yy}-${String(mm + 1).padStart(2, '0')}`;
    })();

    // ===========================================
    // 1. 账户（覆盖现金/银行卡/微信/支付宝/信用卡）
    // ===========================================
    // 先检查该用户是否已有账户（schema.sql 中的 INSERT IGNORE 会为新用户预先创建 6 个默认账户）
    const existingAccounts = await conn.query(
        'SELECT id, name FROM accounts WHERE user_id = ? ORDER BY id', [userId]
    );

    const accountData = [
        { name: '现金', type: 'cash', icon: '💵', balance: 800.00, credit_limit: 0 },
        { name: '工商银行', type: 'bank_card', icon: '🏦', balance: 35000.00, credit_limit: 0 },
        { name: '招商银行', type: 'bank_card', icon: '🏦', balance: 22000.00, credit_limit: 0 },
        { name: '微信支付', type: 'electronic_payment', icon: '💚', balance: 4500.00, credit_limit: 0 },
        { name: '支付宝', type: 'electronic_payment', icon: '🔵', balance: 6800.00, credit_limit: 0 },
        { name: '信用卡', type: 'credit_card', icon: '💳', balance: -3500.00, credit_limit: 30000 },
    ];

    const accountIds = {};
    if (existingAccounts.length >= 6) {
        // 复用已有账户（schema 默认账户，按 ID 顺序对应种子数据）
        // schema 默认顺序：现金, 工商银行, 招商银行, 微信支付, 支付宝, 信用卡
        for (let i = 0; i < accountData.length; i++) {
            accountIds[accountData[i].name] = existingAccounts[i].id;
        }
        // 更新余额为演示数据中的值（仅在 opening_balance=0 时覆盖，表示 schema 默认占位）
        for (const a of accountData) {
            const acc = await conn.query(
                'SELECT opening_balance FROM accounts WHERE id = ?', [accountIds[a.name]]
            );
            if (acc[0] && parseFloat(acc[0].opening_balance || 0) === 0) {
                await conn.query(
                    'UPDATE accounts SET balance = ?, opening_balance = ?, credit_limit = ?, type = ?, icon = ? WHERE id = ?',
                    [a.balance, a.balance, a.credit_limit, a.type, a.icon, accountIds[a.name]]
                );
            }
        }
    } else {
        // 没有默认账户（如全新用户），插入全部
        for (const a of accountData) {
            const r = await conn.query(
                `INSERT INTO accounts (user_id, name, type, icon, balance, opening_balance, credit_limit, is_default, sort_order, status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
                [userId, a.name, a.type, a.icon, a.balance, a.balance, a.credit_limit,
                 a.name === '工商银行' ? 1 : 0, Object.keys(accountIds).length + 1]
            );
            accountIds[a.name] = Number(r.insertId);
        }
    }

    // ===========================================
    // 2. 交易记录（覆盖本月上月及更多月份，含各一级分类）
    // ===========================================
    const txTemplates = {
        income: [
            { cat: 15, name: '月工资', amount: 15000 },
            { cat: 16, name: '季度奖金', amount: 3000 },
            { cat: 17, name: '基金分红', amount: 850 },
            { cat: 19, name: '房租收入', amount: 4200 },
            { cat: 18, name: '副业收入', amount: 1500 },
            { cat: 21, name: '退款', amount: 89 },
        ],
        expense: [
            { cat: 1, name: '午餐', amount: 45 },
            { cat: 1, name: '周末聚餐', amount: 220 },
            { cat: 1, name: '早餐咖啡', amount: 35 },
            { cat: 1, name: '超市采购', amount: 280 },
            { cat: 1, name: '外卖', amount: 65 },
            { cat: 2, name: '滴滴打车', amount: 38 },
            { cat: 2, name: '加油', amount: 350 },
            { cat: 2, name: '公交地铁', amount: 100 },
            { cat: 2, name: '高铁票', amount: 553 },
            { cat: 3, name: '京东购物', amount: 299 },
            { cat: 3, name: '日用品', amount: 89 },
            { cat: 3, name: '淘宝衣物', amount: 450 },
            { cat: 5, name: '电影票', amount: 80 },
            { cat: 5, name: '游戏充值', amount: 128 },
            { cat: 5, name: '健身房月卡', amount: 199 },
            { cat: 4, name: '房租', amount: 4500 },
            { cat: 4, name: '水电费', amount: 220 },
            { cat: 8, name: '手机话费', amount: 99 },
            { cat: 8, name: '宽带费', amount: 120 },
            { cat: 6, name: '体检', amount: 580 },
            { cat: 6, name: '药品', amount: 85 },
            { cat: 7, name: '网课', amount: 599 },
            { cat: 7, name: '书籍', amount: 78 },
            { cat: 9, name: '买衣服', amount: 350 },
            { cat: 9, name: '朋友婚礼', amount: 666 },
            { cat: 10, name: '护肤', amount: 280 },
            { cat: 11, name: '旅行预订', amount: 1800 },
            { cat: 12, name: '猫粮', amount: 168 },
            { cat: 13, name: '商业保险', amount: 320 },
            { cat: 23, name: '停车费', amount: 45 },
            { cat: 23, name: '维保', amount: 600 },
        ],
    };

    // 当月 + 上月 + 上上月，共 3 个月数据
    const months = [
        { year: y, month: m, prefix: 'currentMonth' },
        { year: lmY, month: lastMonth, prefix: 'prevMonth' },
        { year: twoMonthsAgo.split('-')[0] | 0, month: (parseInt(twoMonthsAgo.split('-')[1]) - 1), prefix: 'twoMonthsAgo' },
    ];

    for (const monthInfo of months) {
        const py = monthInfo.year;
        const pm = monthInfo.month;
        const lastDay = new Date(py, pm + 1, 0).getDate();
        let dayCounter = 1;

        for (const tx of txTemplates.income) {
            const day = Math.min(dayCounter, lastDay);
            const dateStr = `${py}-${String(pm + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            await conn.query(
                `INSERT INTO transactions (user_id, account_id, category_id, type, amount, note, date, source_account_id, destination_account_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
                [userId, accountIds['工商银行'], tx.cat, 'income', tx.amount + Math.floor(Math.random() * 200), tx.name, dateStr, accountIds['工商银行']]
            );
            dayCounter += 1 + Math.floor(Math.random() * 3);
        }

        dayCounter = 1;
        for (const tx of txTemplates.expense) {
            const day = Math.min(dayCounter, lastDay);
            const dateStr = `${py}-${String(pm + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const variance = 0.8 + Math.random() * 0.4;
            await conn.query(
                `INSERT INTO transactions (user_id, account_id, category_id, type, amount, note, date, source_account_id, destination_account_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
                [userId, accountIds['工商银行'], tx.cat, 'expense', Math.round(tx.amount * variance), tx.name, dateStr, accountIds['工商银行']]
            );
            dayCounter += 1 + Math.floor(Math.random() * 2);
            if (dayCounter > lastDay) break;
        }
    }

    // ===========================================
    // 3. 转账演示（跨账户转移资金）
    // ===========================================
    const demoTransfers = [
        { from: '工商银行', to: '现金', amount: 2000, note: '工资取现', daysAgo: 3 },
        { from: '工商银行', to: '微信支付', amount: 1500, note: '日常转账', daysAgo: 7 },
        { from: '招商银行', to: '支付宝', amount: 800, note: '还信用卡', daysAgo: 10 },
        { from: '支付宝', to: '工商银行', amount: 3000, note: '归还借款', daysAgo: 14 },
    ];
    for (const t of demoTransfers) {
        const d = new Date(y, m, Math.max(1, now.getDate() - t.daysAgo));
        const dateStr = d.toISOString().split('T')[0];
        const tr = await conn.query(
            `INSERT INTO transfers (user_id, from_account_id, to_account_id, amount, note, date, status)
             VALUES (?, ?, ?, ?, ?, ?, 'completed')`,
            [userId, accountIds[t.from], accountIds[t.to], t.amount, t.note, dateStr]
        );
        const tid = Number(tr.insertId);
        await conn.query(
            `INSERT INTO transactions (user_id, account_id, category_id, type, amount, note, date, transfer_id, source_account_id, destination_account_id)
             VALUES (?, ?, 22, 'transfer_out', ?, ?, ?, ?, ?, NULL)`,
            [userId, accountIds[t.from], t.amount, `转账至${t.to}`, dateStr, tid, accountIds[t.from]]
        );
        await conn.query(
            `INSERT INTO transactions (user_id, account_id, category_id, type, amount, note, date, transfer_id, source_account_id, destination_account_id)
             VALUES (?, ?, 22, 'transfer_in', ?, ?, ?, ?, NULL, ?)`,
            [userId, accountIds[t.to], t.amount, `来自${t.from}`, dateStr, tid, accountIds[t.to]]
        );
    }

    // ===========================================
    // 4. 预算（覆盖各分类，月度）
    // ===========================================
    const budgetData = [
        { name: '餐饮', amount: 2500 },
        { name: '交通', amount: 800 },
        { name: '购物', amount: 1000 },
        { name: '娱乐', amount: 500 },
        { name: '住房', amount: 5000 },
        { name: '通讯', amount: 250 },
        { name: '医疗', amount: 500 },
        { name: '教育', amount: 800 },
        { name: '人情', amount: 800 },
        { name: '美容', amount: 400 },
        { name: '旅行', amount: 2000 },
        { name: '爱车', amount: 800 },
    ];
    for (const b of budgetData) {
        const startDate = `${currentMonth}-01`;
        const lastDay = new Date(y, m + 1, 0).getDate();
        const endDate = `${currentMonth}-${String(lastDay).padStart(2, '0')}`;
        await conn.query(
            `INSERT INTO budgets (user_id, name, period_type, start_date, end_date, amount)
             VALUES (?, ?, 'month', ?, ?, ?)`,
            [userId, b.name, startDate, endDate, b.amount]
        );
    }

    // ===========================================
    // 5. 理财持仓（覆盖各理财产品类型）
    // ===========================================
    const investmentData = [
        { type: 1, name: '银行定期存款', code: '', buy_price: 1, current_price: 1, quantity: 50000, buy_date: `${y}-01-15`, expected_rate: 2.75 },
        { type: 2, name: '余额宝', code: '000198', buy_price: 1.0, current_price: 1.0018, quantity: 20000, buy_date: `${y}-02-01`, expected_rate: 2.5 },
        { type: 3, name: '纯债基金A', code: '003547', buy_price: 1.05, current_price: 1.0876, quantity: 10000, buy_date: `${y}-03-10`, expected_rate: 4.5 },
        { type: 4, name: '沪深300ETF', code: '510300', buy_price: 4.12, current_price: 4.56, quantity: 5000, buy_date: `${y}-04-15`, expected_rate: 8 },
        { type: 5, name: '混合基金', code: '161725', buy_price: 2.8, current_price: 3.12, quantity: 8000, buy_date: `${y}-05-20`, expected_rate: 10 },
        { type: 6, name: '股票基金', code: '005827', buy_price: 1.5, current_price: 1.68, quantity: 15000, buy_date: `${y}-06-10`, expected_rate: 12 },
        { type: 7, name: '贵州茅台', code: 'sh600519', buy_price: 1680, current_price: 1820, quantity: 10, buy_date: `${y}-07-05`, expected_rate: 8 },
        { type: 8, name: '银行理财', code: '', buy_price: 1, current_price: 1.018, quantity: 100000, buy_date: `${y}-08-01`, expected_rate: 3.5 },
        { type: 9, name: '国债', code: '', buy_price: 100, current_price: 101.5, quantity: 100, buy_date: `${y}-09-15`, expected_rate: 3.0 },
        { type: 10, name: '黄金ETF', code: '518880', buy_price: 5.32, current_price: 5.85, quantity: 2000, buy_date: `${y}-10-10`, expected_rate: 6 },
    ];

    for (const inv of investmentData) {
        const totalCost = inv.buy_price * inv.quantity;
        const currentValue = inv.current_price * inv.quantity;
        await conn.query(
            `INSERT INTO investments (user_id, account_id, investment_type_id, name, code, buy_price, current_price, quantity,
             total_cost, current_value, buy_date, expected_rate, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'holding')`,
            [userId, accountIds['工商银行'], inv.type, inv.name, inv.code || '',
             inv.buy_price, inv.current_price, inv.quantity,
             totalCost, currentValue, inv.buy_date, inv.expected_rate]
        );
    }

    // ===========================================
    // 6. 储蓄目标（多个目标，进度不一）
    // ===========================================
    const savingsGoals = [
        { name: '新车基金', target: 200000, current: 85000, icon: '🚗', status: 'active' },
        { name: '旅行基金', target: 50000, current: 32000, icon: '✈️', status: 'active' },
        { name: '应急储备', target: 100000, current: 100000, icon: '🛡️', status: 'completed' },
        { name: '装修基金', target: 80000, current: 12000, icon: '🏠', status: 'active' },
    ];
    for (const g of savingsGoals) {
        await conn.query(
            `INSERT INTO savings_goals (user_id, name, target_amount, current_amount, icon, status)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [userId, g.name, g.target, g.current, g.icon, g.status]
        );
    }

    // ===========================================
    // 7. 债务（覆盖信用卡/房贷/个人借贷）
    // ===========================================
    const debts = [
        { name: '交通银行信用卡', type: 'credit_card', creditor: '交通银行', principal: 30000, remaining: 3500, interest_rate: 18.25, term_months: 0, method: 'minimum', monthly_payment: 350, billing_day: 5, payment_day: 25, min_payment: 350, status: 'active', start_date: `${y}-01-01` },
        { name: '房贷', type: 'loan', creditor: '建设银行', principal: 800000, remaining: 720000, interest_rate: 4.9, term_months: 240, method: 'equal_installment', monthly_payment: 5235.5, status: 'active', start_date: '2022-06-01', due_date: '2026-07-20' },
        { name: '装修分期', type: 'loan', creditor: '招商银行', principal: 50000, remaining: 35000, interest_rate: 5.4, term_months: 36, method: 'equal_installment', monthly_payment: 1505.2, status: 'active', start_date: '2024-08-01' },
    ];
    for (const d of debts) {
        await conn.query(
            `INSERT INTO debts (user_id, name, type, creditor, principal, remaining, interest_rate, term_months, method,
             monthly_payment, start_date, due_date, billing_day, payment_day, min_payment, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [userId, d.name, d.type, d.creditor, d.principal, d.remaining, d.interest_rate,
             d.term_months || 0, d.method, d.monthly_payment || 0,
             d.start_date || null, d.due_date || null, d.billing_day || null,
             d.payment_day || null, d.min_payment || 0, d.status]
        );
    }

    // ===========================================
    // 8. 标签（覆盖各种用途）
    // ===========================================
    const tags = [
        { name: '必需', color: '#ef4444', icon: '⭐' },
        { name: '可省', color: '#10b981', icon: '💡' },
        { name: '大额', color: '#8b5cf6', icon: '💎' },
        { name: '订阅', color: '#3b82f6', icon: '🔁' },
        { name: '应急', color: '#f59e0b', icon: '🚨' },
        { name: '投资回报', color: '#22c55e', icon: '📈' },
        { name: '家庭', color: '#ec4899', icon: '👨‍👩‍👧' },
    ];
    // 检查用户是否已有标签，避免重复（schema 默认有 5 个系统预设标签）
    const existingTags = await conn.query('SELECT COUNT(*) AS cnt FROM tags WHERE user_id = ?', [userId]);
    if (parseInt(existingTags[0].cnt) === 0) {
        for (const t of tags) {
            await conn.query(
                `INSERT INTO tags (user_id, name, color, icon) VALUES (?, ?, ?, ?)`,
                [userId, t.name, t.color, t.icon]
            );
        }
    }

    // ===========================================
    // 9. 投资净值快照（为趋势图生成历史数据，至少 8 周的周日）
    // ===========================================
    const invList = await conn.query('SELECT id, total_cost, current_value FROM investments WHERE user_id = ?', [userId]);
    const today = new Date();
    for (let w = 8; w >= 0; w--) {
        const d = new Date(today);
        d.setDate(d.getDate() - d.getDay() - w * 7); // 回溯到每个周日
        const snapDate = d.toISOString().slice(0, 10);
        for (const inv of invList) {
            // 模拟市值在成本附近 ±10% 波动的等差数列，让趋势图有变化
            const cost = parseFloat(inv.total_cost);
            const baseValue = parseFloat(inv.current_value);
            const weekProgress = w / 8; // 0=8周前, 1=本周
            const randomFactor = 0.92 + weekProgress * 0.16 + (Math.random() * 0.04 - 0.02); // 从 0.92 稳步收敛
            const snapValue = Math.round(baseValue * randomFactor * 100) / 100;
            const snapCost = Math.round(cost * (0.95 + Math.random() * 0.1) * 100) / 100;
            await conn.query(
                `INSERT IGNORE INTO investment_snapshots (user_id, investment_id, total_value, total_cost, nav_date)
                 VALUES (?, ?, ?, ?, ?)`,
                [userId, inv.id, snapValue, snapCost, snapDate]
            );
        }
    }

    // ===========================================
    // 10. 重新计算所有账户余额（基于账本推导）
    // ===========================================
    for (const aid of Object.values(accountIds)) {
        const bal = await computeAccountBalance(conn, userId, aid);
        await conn.query('UPDATE accounts SET balance = ? WHERE id = ? AND user_id = ?', [bal, aid, userId]);
    }
}

/**
 * 检查用户是否已有数据（用于判断是否需要种子数据）
 */
async function userHasData(userId) {
    const r = await db.queryOne('SELECT COUNT(*) AS cnt FROM transactions WHERE user_id = ?', [userId]);
    return parseInt(r.cnt) > 0;
}

/**
 * 为用户注入种子数据（如果还没有数据）
 */
async function ensureUserSeed(userId) {
    if (await userHasData(userId)) return false;
    await db.transaction(async (conn) => {
        await seedUserData(userId, conn);
    });
    return true;
}

module.exports = { seedUserData, ensureUserSeed, userHasData };
