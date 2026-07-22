const express = require('express');
const router = express.Router();

const db = require('../db');
const { success, fail, handleServerError } = require('./_helpers');
const { ensureCategory } = require('./utils');

// 获取储蓄目标列表
router.get('/', async (req, res) => {
    try {
        const goals = await db.query(
            `SELECT g.*, a.name as acc_name, a.icon as acc_icon
             FROM savings_goals g LEFT JOIN accounts a ON g.account_id = a.id
             WHERE g.user_id = ? ORDER BY g.status, g.id`,
            [req.userId]
        );
        res.json(success(goals.map(g => ({ ...g, target_amount: parseFloat(g.target_amount), current_amount: parseFloat(g.current_amount) }))));
    } catch (err) { handleServerError(res, err); }
});

// 新增储蓄目标
router.post('/', async (req, res) => {
    try {
        const { name, target_amount, account_id, icon, note } = req.body;
        if (!name) return res.status(400).json(fail('目标名称必填'));
        const result = await db.query(
            `INSERT INTO savings_goals (user_id, name, target_amount, account_id, icon, note) VALUES (?, ?, ?, ?, ?, ?)`,
            [req.userId, name, parseFloat(target_amount) || 0, parseInt(account_id) || null, icon || '🎯', note || '']
        );
        res.json(success({ id: result.insertId }, '储蓄目标已创建'));
    } catch (err) { handleServerError(res, err); }
});

// 更新储蓄目标
router.put('/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { name, target_amount, account_id, icon, note } = req.body;
        if (!name) return res.status(400).json(fail('目标名称必填'));
        const goal = await db.queryOne('SELECT * FROM savings_goals WHERE id = ? AND user_id = ?', [id, req.userId]);
        if (!goal) return res.status(404).json(fail('储蓄目标不存在'));
        await db.query(
            `UPDATE savings_goals SET name = ?, target_amount = ?, account_id = ?, icon = ?, note = ? WHERE id = ?`,
            [name, parseFloat(target_amount) || 0, parseInt(account_id) || null, icon || '🎯', note || '', id]
        );
        res.json(success(null, '储蓄目标已更新'));
    } catch (err) { handleServerError(res, err); }
});

// 存入目标
router.post('/:id/allocate', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const amount = parseFloat(req.body.amount);
        const accountId = req.body.account_id ? parseInt(req.body.account_id) : null;
        if (!amount || amount <= 0) return res.status(400).json(fail('请输入有效金额'));
        if (!accountId) return res.status(400).json(fail('请选择关联账户'));
        const goal = await db.queryOne('SELECT * FROM savings_goals WHERE id = ? AND user_id = ?', [id, req.userId]);
        if (!goal) return res.status(404).json(fail('目标不存在'));
        const acc = await db.queryOne('SELECT * FROM accounts WHERE id = ? AND user_id = ?', [accountId, req.userId]);
        if (!acc || parseFloat(acc.balance) < amount) return res.status(400).json(fail('账户余额不足'));
        await db.transaction(async (conn) => {
            await conn.query('UPDATE accounts SET balance = balance - ? WHERE id = ?', [amount, accountId]);
            // 创建账本交易
            const catId = await ensureCategory(conn, req.userId, '储蓄存入', 'expense', '🏦');
            await conn.query(
                "INSERT INTO transactions (user_id, account_id, category_id, type, amount, note, date, source_account_id) VALUES (?, ?, ?, 'expense', ?, ?, CURDATE(), ?)",
                [req.userId, accountId, catId, amount, `存入「${goal.name}」`, accountId]
            );
            await conn.query('UPDATE savings_goals SET current_amount = current_amount + ? WHERE id = ?', [amount, id]);
            await conn.query('INSERT INTO savings_transactions (user_id, goal_id, account_id, type, amount, date, note) VALUES (?, ?, ?, "deposit", ?, CURDATE(), ?)',
                [req.userId, id, accountId, amount, `存入「${goal.name}」`]);
        });
        res.json(success(null, '已存入目标'));
    } catch (err) { handleServerError(res, err); }
});

// 取回目标
router.post('/:id/withdraw', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const amount = parseFloat(req.body.amount);
        const accountId = req.body.account_id ? parseInt(req.body.account_id) : null;
        if (!amount || amount <= 0) return res.status(400).json(fail('请输入有效金额'));
        if (!accountId) return res.status(400).json(fail('请选择关联账户'));
        const goal = await db.queryOne('SELECT * FROM savings_goals WHERE id = ? AND user_id = ?', [id, req.userId]);
        if (!goal) return res.status(404).json(fail('目标不存在'));
        if (parseFloat(goal.current_amount) < amount) return res.status(400).json(fail('目标余额不足'));
        await db.transaction(async (conn) => {
            await conn.query('UPDATE savings_goals SET current_amount = current_amount - ? WHERE id = ?', [amount, id]);
            await conn.query('UPDATE accounts SET balance = balance + ? WHERE id = ?', [amount, accountId]);
            // 创建账本交易
            const catId = await ensureCategory(conn, req.userId, '储蓄取出', 'income', '🏦');
            await conn.query(
                "INSERT INTO transactions (user_id, account_id, category_id, type, amount, note, date, destination_account_id) VALUES (?, ?, ?, 'income', ?, ?, CURDATE(), ?)",
                [req.userId, accountId, catId, amount, `取回「${goal.name}」`, accountId]
            );
            await conn.query('INSERT INTO savings_transactions (user_id, goal_id, account_id, type, amount, date, note) VALUES (?, ?, ?, "withdraw", ?, CURDATE(), ?)',
                [req.userId, id, accountId, amount, `取出「${goal.name}」`]);
        });
        res.json(success(null, '已取回'));
    } catch (err) { handleServerError(res, err); }
});

// 删除储蓄目标
router.delete('/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM savings_goals WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
        res.json(success(null, '目标已删除'));
    } catch (err) { handleServerError(res, err); }
});

// 获取储蓄目标交易记录
router.get('/:id/transactions', async (req, res) => {
    try {
        const goal = await db.queryOne('SELECT id, name FROM savings_goals WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
        if (!goal) return res.status(404).json(fail('目标不存在'));
        const transactions = await db.query(
            `SELECT st.type, st.amount, st.date, st.note, st.account_id, a.name AS account_name
             FROM savings_transactions st
             LEFT JOIN accounts a ON st.account_id = a.id
             WHERE st.goal_id = ? AND st.user_id = ?
             ORDER BY st.date DESC, st.id DESC`,
            [req.params.id, req.userId]
        );
        const deposit = transactions.filter(t => t.type === 'deposit').reduce((s, t) => s + parseFloat(t.amount), 0);
        const withdraw = transactions.filter(t => t.type === 'withdraw').reduce((s, t) => s + parseFloat(t.amount), 0);
        res.json(success({
            goal: { id: goal.id, name: goal.name },
            transactions: transactions.map(t => ({ ...t, amount: parseFloat(t.amount) })),
            summary: { deposit, withdraw, net: deposit - withdraw }
        }));
    } catch (err) { handleServerError(res, err); }
});

module.exports = router;
