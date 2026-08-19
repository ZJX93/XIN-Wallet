/* ============================================
   鑫钱包 · 路由辅助函数
   提取自 routes.js 的公共逻辑，供多模块复用
   ============================================ */

// ==========================================
// 辅助：确保分类存在（不存在则自动创建）
// 优先匹配「系统预设（user_id IS NULL）」或「当前用户私有（user_id = ?）」
// 统一唯一权威实现，categories.js / savings.js / utils.js 共用本函数
// ==========================================
async function ensureCategory(conn, userId, name, type, icon) {
    // 匹配：系统预设(user_id IS NULL) 或 用户级共享辅助分类(book_id IS NULL)。
    // 多账本下，用户自建的「本账本专属」分类不参与兜底，避免跨账本误复用。
    let cat = await conn.query(
        "SELECT id FROM categories WHERE name = ? AND type = ? AND (user_id IS NULL OR (user_id = ? AND book_id IS NULL)) LIMIT 1",
        [name, type, userId]
    );
    if (cat.length === 0) {
        // 自动创建的辅助分类归属「用户级共享」(book_id 默认 NULL)，对所有账本可见
        const result = await conn.query(
            "INSERT INTO categories (user_id, name, type, icon, color, is_system) VALUES (?, ?, ?, ?, '#6366f1', TRUE)",
            [userId, name, type, icon]
        );
        return result.insertId;
    }
    return cat[0].id;
}

// ==========================================
// 「场景-对象」备注格式：统一权威实现
// 业务规则：AI/OCR 识别或手动记账时，若传入 merchant（商家/个人对象）但未给完整 note，
// 自动拼接为「类目名-merchant」格式；若 note 已存在则尊重调用方，不强制覆盖。
// 用于 /ai/chat 工具调用、/transactions 创建与更新、客户端 AI 记账等所有入口。
// ==========================================
async function buildSceneObjectNote(conn, userId, categoryId, note, merchant) {
    if (merchant && !note) {
        const catRow = await conn.queryOne(
            'SELECT name FROM categories WHERE id = ? AND (user_id IS NULL OR user_id = ?)',
            [categoryId, userId]
        );
        const scene = catRow ? catRow.name : '';
        return (scene ? scene + '-' : '') + merchant;
    }
    return note || '';
}

// ==========================================
// 信用卡债务自动同步（交易后自动更新 debts 表）
// ==========================================
async function syncCreditCardDebt(conn, userId, accountId) {
    const acctRows = await conn.query(
        'SELECT name, type, balance, credit_limit FROM accounts WHERE id = $1 AND user_id = $2',
        [accountId, userId]
    );
    const account = acctRows[0];
    if (!account || account.type !== 'credit_card') return;

    const balance = parseFloat(account.balance);
    const limit = parseFloat(account.credit_limit) || 0;
    // 欠款：余额为负时 = -balance（欠款额）；余额为正时 = limit - balance（可用额度）
    const owes = balance <= 0
        ? Math.max(0, -balance)
        : Math.max(0, limit - balance);

    // 查找已关联的债务（按名称匹配）
    const debtRows = await conn.query(
        "SELECT id FROM debts WHERE user_id = $1 AND type = 'credit_card' AND name = $2",
        [userId, account.name]
    );
    const debt = debtRows[0];

    if (owes <= 0) {
        if (debt) {
            await conn.query("UPDATE debts SET remaining = 0, monthly_payment = 0, min_payment = 0, status = 'paid_off' WHERE id = $1", [debt.id]);
        }
    } else {
        const minPmt = Math.max(Math.round(owes * 0.1), 500);
        if (debt) {
            await conn.query(
                'UPDATE debts SET remaining = $1, monthly_payment = 0, min_payment = $2, interest_rate = 18.25, method = \'minimum\', status = \'active\' WHERE id = $3',
                [owes, minPmt, debt.id]
            );
        } else {
            await conn.query(
                `INSERT INTO debts (user_id, name, type, creditor, principal, remaining, interest_rate, term_months, method, monthly_payment, billing_day, payment_day, min_payment, status, note)
                 VALUES (?, ?, 'credit_card', ?, 0, ?, 18.25, 0, 'minimum', 0, 15, 5, ?, 'active', '自动同步：信用卡账户')`,
                [userId, account.name, account.name, owes, minPmt]
            );
        }
    }
}

module.exports = {
    ensureCategory,
    syncCreditCardDebt,
    buildSceneObjectNote
};
