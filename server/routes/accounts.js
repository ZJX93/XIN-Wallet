/* ============================================
   鑫钱包 · 账户与对账路由
   ============================================ */

const express = require('express');
const router = express.Router();
const db = require('../db');
const { success, fail, handleServerError, sumLedgerEffects, computeAccountBalance, fmtDateTime } = require('./_helpers');

// 获取所有账户
router.get('/', async (req, res) => {
    try {
        const accounts = await db.query(
            'SELECT * FROM accounts WHERE user_id = ? AND status = "active" ORDER BY sort_order',
            [req.userId]
        );
        const total = accounts.reduce((s, a) => s + parseFloat(a.balance || 0), 0);
        res.json(success({ accounts, totalAssets: total }));
    } catch (err) {
        handleServerError(res, err);
    }
});

// 新增账户
router.post('/', async (req, res) => {
    try {
        const { name, type, icon, balance, credit_limit } = req.body;
        if (!name || !type) return res.status(400).json(fail('名称和类型必填'));

        const result = await db.query(
            `INSERT INTO accounts (user_id, name, type, icon, balance, opening_balance, credit_limit) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [req.userId, name, type, icon || '💰', parseFloat(balance) || 0, parseFloat(balance) || 0, parseFloat(credit_limit) || 0]
        );
        res.json(success({ id: result.insertId }, '账户已创建'));
    } catch (err) {
        handleServerError(res, err);
    }
});

// 更新账户
router.put('/:id', async (req, res) => {
    try {
        const { name, type, icon, balance, credit_limit } = req.body;
        const newBalance = parseFloat(balance) || 0;
        const effects = await sumLedgerEffects(db, req.userId, parseInt(req.params.id));
        const newOpening = newBalance - effects;
        await db.query(
            `UPDATE accounts SET name=?, type=?, icon=?, balance=?, opening_balance=?, credit_limit=? WHERE id=? AND user_id=?`,
            [name, type, icon, newBalance, newOpening, parseFloat(credit_limit || 0), req.params.id, req.userId]
        );
        res.json(success(null, '账户已更新'));
    } catch (err) {
        handleServerError(res, err);
    }
});

// 关闭账户
router.delete('/:id', async (req, res) => {
    try {
        await db.query(
            'UPDATE accounts SET status = "closed" WHERE id = ? AND user_id = ?',
            [req.params.id, req.userId]
        );
        res.json(success(null, '账户已关闭'));
    } catch (err) {
        handleServerError(res, err);
    }
});

// 复式记账对账
router.post('/reconcile', async (req, res) => {
    try {
        const accounts = await db.query(
            "SELECT id, name, balance FROM accounts WHERE user_id = ? AND status = 'active'",
            [req.userId]
        );
        let fixed = 0;
        let totalDiff = 0;
        for (const acc of accounts) {
            const computed = await computeAccountBalance(db, req.userId, acc.id);
            const stored = parseFloat(acc.balance);
            if (Math.abs(computed - stored) > 0.005) {
                await db.query('UPDATE accounts SET balance = ? WHERE id = ? AND user_id = ?', [computed, acc.id, req.userId]);
                fixed++;
                totalDiff += (computed - stored);
            }
        }
        res.json(success(
            { reconciled: fixed, totalAdjusted: Math.round(totalDiff * 100) / 100 },
            fixed > 0 ? `已对账，修正 ${fixed} 个账户余额` : '账户余额与账本一致，无需修正'
        ));
    } catch (err) {
        handleServerError(res, err);
    }
});

// 账户资金明细（全部资金变动流水：收入/支出/转账/还款）
router.get('/:id/transactions', async (req, res) => {
    try {
        const accId = parseInt(req.params.id);
        if (!accId) return res.status(400).json(fail('账户ID无效'));
        const acc = await db.queryOne('SELECT id, name, icon, type FROM accounts WHERE id = ? AND user_id = ?', [accId, req.userId]);
        if (!acc) return res.status(404).json(fail('账户不存在'));
        const lim = Math.min(parseInt(req.query.limit) || 200, 1000);
        const off = parseInt(req.query.offset) || 0;

        // 1) 关联该账户的交易（收入/支出/转账，account_id 即展示账户）
        const txns = await db.query(
            `SELECT t.id, t.type, t.amount, t.note, t.date,
                    c.name as cat_name, c.icon as cat_icon,
                    tr.from_account_id as tr_from, tr.to_account_id as tr_to,
                    fa.name as tr_from_name, fa.icon as tr_from_icon,
                    ta.name as tr_to_name, ta.icon as tr_to_icon
             FROM transactions t
             LEFT JOIN categories c ON t.category_id = c.id
             LEFT JOIN transfers tr ON t.transfer_id = tr.id
             LEFT JOIN accounts fa ON tr.from_account_id = fa.id
             LEFT JOIN accounts ta ON tr.to_account_id = ta.id
             WHERE t.user_id = ? AND t.account_id = ?
             ORDER BY t.date DESC, t.id DESC
             LIMIT ? OFFSET ?`,
            [req.userId, accId, lim, off]
        );

        // 2) 该账户作为还款来源的还款流水
        const reps = await db.query(
            `SELECT r.id, r.amount, r.principal_part, r.interest_part, r.note, r.paid_at,
                    d.name as debt_name
             FROM debt_repayments r
             LEFT JOIN debts d ON r.debt_id = d.id
             WHERE r.user_id = ? AND r.account_id = ?
             ORDER BY r.paid_at DESC, r.id DESC
             LIMIT ? OFFSET ?`,
            [req.userId, accId, lim, off]
        );

        const items = [
            ...txns.map(t => ({
                kind: 'transaction',
                id: t.id,
                type: t.type,
                amount: parseFloat(t.amount),
                date: fmtDateTime(t.date),
                note: t.note || '',
                category: (t.cat_name || t.cat_icon) ? { name: t.cat_name, icon: t.cat_icon } : null,
                counterparty: t.type === 'transfer_out'
                    ? (t.tr_to_name ? { dir: '→', name: t.tr_to_name, icon: t.tr_to_icon } : null)
                    : t.type === 'transfer_in'
                    ? (t.tr_from_name ? { dir: '←', name: t.tr_from_name, icon: t.tr_from_icon } : null)
                    : null,
                debt: null
            })),
            ...reps.map(r => ({
                kind: 'repayment',
                id: r.id,
                type: 'repayment',
                amount: parseFloat(r.amount),
                date: fmtDateTime(r.paid_at),
                note: r.note || '',
                category: null,
                counterparty: null,
                debt: { name: r.debt_name, icon: r.debt_icon }
            }))
        ];
        // 合并后整体按时间倒序
        items.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

        res.json(success({
            account: { id: acc.id, name: acc.name, icon: acc.icon, type: acc.type },
            transactions: items,
            count: items.length
        }));
    } catch (err) { handleServerError(res, err); }
});

module.exports = router;
