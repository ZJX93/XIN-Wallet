const express = require('express');
const router = express.Router();

const db = require('../db');
const { success, fail, handleServerError, computeAccountBalance } = require('./_helpers');
const { ensureCategory } = require('./utils');

// 获取储蓄目标列表
router.get('/', async (req, res) => {
    try {
        const goals = await db.query(
            `SELECT g.*, a.name as acc_name, a.icon as acc_icon, a.balance as acc_balance,
                    sa.name as source_acc_name
             FROM savings_goals g
             LEFT JOIN accounts a ON g.account_id = a.id
             LEFT JOIN accounts sa ON g.source_account_id = sa.id
             WHERE g.user_id = ? ORDER BY g.status, g.id`,
            [req.userId]
        );
        res.json(success(goals.map(g => ({
            ...g,
            target_amount: parseFloat(g.target_amount),
            // 关联真实账户时，current_amount 直接镜像该账户余额（single source of truth）
            current_amount: g.account_id ? parseFloat(g.acc_balance || 0) : parseFloat(g.current_amount || 0),
            source_account_id: g.source_account_id || null,
            source_acc_name: g.source_acc_name || null
        }))));
    } catch (err) { handleServerError(res, err); }
});

// 新增储蓄目标（必须关联一个真实账户作为储蓄账户，并指定默认来源账户）
router.post('/', async (req, res) => {
    try {
        const { name, target_amount, account_id, source_account_id, icon, note } = req.body;
        if (!name) return res.status(400).json(fail('目标名称必填'));
        const accId = account_id ? parseInt(account_id) : null;
        if (!accId) return res.status(400).json(fail('请选择储蓄账户'));
        const srcId = source_account_id ? parseInt(source_account_id) : null;
        if (!srcId) return res.status(400).json(fail('请选择来源账户'));
        if (srcId === accId) return res.status(400).json(fail('来源账户不能与储蓄账户相同'));
        const acc = await db.queryOne('SELECT id, balance FROM accounts WHERE id = ? AND user_id = ?', [accId, req.userId]);
        if (!acc) return res.status(400).json(fail('储蓄账户不存在'));
        const src = await db.queryOne('SELECT id FROM accounts WHERE id = ? AND user_id = ?', [srcId, req.userId]);
        if (!src) return res.status(400).json(fail('来源账户不存在'));
        const result = await db.query(
            `INSERT INTO savings_goals (user_id, name, target_amount, current_amount, account_id, source_account_id, icon, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [req.userId, name, parseFloat(target_amount) || 0, parseFloat(acc.balance || 0), accId, srcId, icon || '🎯', note || '']
        );
        res.json(success({ id: result.insertId }, '储蓄目标已创建'));
    } catch (err) { handleServerError(res, err); }
});

// 更新储蓄目标（储蓄账户、来源账户必选）
router.put('/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { name, target_amount, account_id, source_account_id, icon, note } = req.body;
        if (!name) return res.status(400).json(fail('目标名称必填'));
        const accId = account_id ? parseInt(account_id) : null;
        if (!accId) return res.status(400).json(fail('请选择储蓄账户'));
        const srcId = source_account_id ? parseInt(source_account_id) : null;
        if (!srcId) return res.status(400).json(fail('请选择来源账户'));
        if (srcId === accId) return res.status(400).json(fail('来源账户不能与储蓄账户相同'));
        const goal = await db.queryOne('SELECT * FROM savings_goals WHERE id = ? AND user_id = ?', [id, req.userId]);
        if (!goal) return res.status(404).json(fail('储蓄目标不存在'));
        const acc = await db.queryOne('SELECT id, balance FROM accounts WHERE id = ? AND user_id = ?', [accId, req.userId]);
        if (!acc) return res.status(400).json(fail('储蓄账户不存在'));
        const src = await db.queryOne('SELECT id FROM accounts WHERE id = ? AND user_id = ?', [srcId, req.userId]);
        if (!src) return res.status(400).json(fail('来源账户不存在'));
        await db.query(
            `UPDATE savings_goals SET name = ?, target_amount = ?, account_id = ?, source_account_id = ?, current_amount = ?, icon = ?, note = ? WHERE id = ?`,
            [name, parseFloat(target_amount) || 0, accId, srcId, parseFloat(acc.balance || 0), icon || '🎯', note || '', id]
        );
        res.json(success(null, '储蓄目标已更新'));
    } catch (err) { handleServerError(res, err); }
});

// 存入目标：从来源账户转账到目标关联的储蓄账户（真实账户间转账）
router.post('/:id/allocate', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const amount = parseFloat(req.body.amount);
        const srcId = req.body.account_id ? parseInt(req.body.account_id) : null;
        if (!amount || amount <= 0) return res.status(400).json(fail('请输入有效金额'));
        if (!srcId) return res.status(400).json(fail('请选择来源账户'));
        const goal = await db.queryOne('SELECT * FROM savings_goals WHERE id = ? AND user_id = ?', [id, req.userId]);
        if (!goal) return res.status(404).json(fail('目标不存在'));
        if (!goal.account_id) return res.status(400).json(fail('该目标未关联储蓄账户，无法存入'));
        if (srcId === goal.account_id) return res.status(400).json(fail('来源账户不能与储蓄账户相同'));
        const src = await db.queryOne('SELECT * FROM accounts WHERE id = ? AND user_id = ?', [srcId, req.userId]);
        if (!src || parseFloat(src.balance) < amount) return res.status(400).json(fail('来源账户余额不足'));
        await db.transaction(async (conn) => {
            const catId = await ensureCategory(conn, req.userId, '储蓄存入', 'expense', '🏦');
            // 转账记录（来源 -> 储蓄账户）
            const tr = await conn.query(
                'INSERT INTO transfers (user_id, from_account_id, to_account_id, amount, note, date, status) VALUES (?, ?, ?, ?, ?, CURRENT_DATE, \'completed\')',
                [req.userId, srcId, goal.account_id, amount, `存入「${goal.name}」`]
            );
            const tid = tr.insertId;
            await conn.query(
                "INSERT INTO transactions (user_id, account_id, category_id, type, amount, note, date, transfer_id, source_account_id, destination_account_id) VALUES (?, ?, ?, 'transfer_out', ?, ?, CURRENT_DATE, ?, ?, NULL)",
                [req.userId, srcId, catId, amount, `存入「${goal.name}」`, tid, srcId]
            );
            await conn.query(
                "INSERT INTO transactions (user_id, account_id, category_id, type, amount, note, date, transfer_id, source_account_id, destination_account_id) VALUES (?, ?, ?, 'transfer_in', ?, ?, CURRENT_DATE, ?, NULL, ?)",
                [req.userId, goal.account_id, catId, amount, `存入「${goal.name}」`, tid, goal.account_id]
            );
            const srcBal = await computeAccountBalance(conn, req.userId, srcId);
            await conn.query('UPDATE accounts SET balance = ? WHERE id = ?', [srcBal, srcId]);
            const savBal = await computeAccountBalance(conn, req.userId, goal.account_id);
            await conn.query('UPDATE accounts SET balance = ? WHERE id = ?', [savBal, goal.account_id]);
            await conn.query('UPDATE savings_goals SET current_amount = ? WHERE id = ?', [savBal, id]);
            await conn.query('INSERT INTO savings_transactions (user_id, goal_id, account_id, type, amount, date, note) VALUES (?, ?, ?, \'deposit\', ?, CURRENT_DATE, ?)',
                [req.userId, id, srcId, amount, `存入「${goal.name}」`]);
        });
        res.json(success(null, '已存入目标'));
    } catch (err) { handleServerError(res, err); }
});

// 取回目标：从目标关联的储蓄账户转账到目标账户（真实账户间转账）
router.post('/:id/withdraw', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const amount = parseFloat(req.body.amount);
        const destId = req.body.account_id ? parseInt(req.body.account_id) : null;
        if (!amount || amount <= 0) return res.status(400).json(fail('请输入有效金额'));
        if (!destId) return res.status(400).json(fail('请选择目标账户'));
        const goal = await db.queryOne('SELECT * FROM savings_goals WHERE id = ? AND user_id = ?', [id, req.userId]);
        if (!goal) return res.status(404).json(fail('目标不存在'));
        if (!goal.account_id) return res.status(400).json(fail('该目标未关联储蓄账户，无法取回'));
        if (destId === goal.account_id) return res.status(400).json(fail('目标账户不能与储蓄账户相同'));
        const sav = await db.queryOne('SELECT * FROM accounts WHERE id = ? AND user_id = ?', [goal.account_id, req.userId]);
        if (!sav || parseFloat(sav.balance) < amount) return res.status(400).json(fail('储蓄账户余额不足'));
        await db.transaction(async (conn) => {
            const catId = await ensureCategory(conn, req.userId, '储蓄取出', 'income', '🏦');
            // 转账记录（储蓄账户 -> 目标账户）
            const tr = await conn.query(
                'INSERT INTO transfers (user_id, from_account_id, to_account_id, amount, note, date, status) VALUES (?, ?, ?, ?, ?, CURRENT_DATE, \'completed\')',
                [req.userId, goal.account_id, destId, amount, `取回「${goal.name}」`]
            );
            const tid = tr.insertId;
            await conn.query(
                "INSERT INTO transactions (user_id, account_id, category_id, type, amount, note, date, transfer_id, source_account_id, destination_account_id) VALUES (?, ?, ?, 'transfer_out', ?, ?, CURRENT_DATE, ?, ?, NULL)",
                [req.userId, goal.account_id, catId, amount, `取回「${goal.name}」`, tid, goal.account_id]
            );
            await conn.query(
                "INSERT INTO transactions (user_id, account_id, category_id, type, amount, note, date, transfer_id, source_account_id, destination_account_id) VALUES (?, ?, ?, 'transfer_in', ?, ?, CURRENT_DATE, ?, NULL, ?)",
                [req.userId, destId, catId, amount, `取回「${goal.name}」`, tid, destId]
            );
            const savBal = await computeAccountBalance(conn, req.userId, goal.account_id);
            await conn.query('UPDATE accounts SET balance = ? WHERE id = ?', [savBal, goal.account_id]);
            const destBal = await computeAccountBalance(conn, req.userId, destId);
            await conn.query('UPDATE accounts SET balance = ? WHERE id = ?', [destBal, destId]);
            await conn.query('UPDATE savings_goals SET current_amount = ? WHERE id = ?', [savBal, id]);
            await conn.query('INSERT INTO savings_transactions (user_id, goal_id, account_id, type, amount, date, note) VALUES (?, ?, ?, \'withdraw\', ?, CURRENT_DATE, ?)',
                [req.userId, id, destId, amount, `取出「${goal.name}」`]);
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
