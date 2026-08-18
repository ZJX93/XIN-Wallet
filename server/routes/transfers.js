const express = require('express');
const router = express.Router();
const db = require('../db');
const { toNumber } = require('../validate');
const {
    success, handleServerError, computeAccountBalance, enforceBalanceLimit,
    ErrorCodes, failValidation, failNotFound, failBadRequest, failConflict, fail
} = require('./_helpers');
const { ensureCategory } = require('./utils');

// 业务错误 → HTTP code 智能映射（用于 catch 块）
// 仅白名单的已知业务错误使用 err.message；未识别错误统一返回通用提示，避免泄露数据库堆栈/内部细节
function classifyError(err) {
    const msg = err.message || '';
    if (msg.includes('余额不能低于') || msg.includes('余额不足')) return failConflict(msg); // 409（余额下限）
    if (msg.includes('账户不存在')) return failNotFound(msg);            // 404
    if (msg.includes('金额')) return failValidation(msg);                // 422
    // 未识别的错误：记录到控制台，但对外不暴露原始消息
    console.error('[transfer] 未分类错误:', err);
    return failBadRequest('操作失败，请稍后重试');
}

// ==========================================
// 转账路由（错误码语义化版本）
// ==========================================

// 获取转账记录
router.get('/', async (req, res) => {
    try {
        const { month } = req.query;
        let sql = `SELECT t.*,
      a1.name as from_name, a1.icon as from_icon, a1.type as from_type,
      a2.name as to_name, a2.icon as to_icon, a2.type as to_type
      FROM transfers t
      LEFT JOIN accounts a1 ON t.from_account_id = a1.id
      LEFT JOIN accounts a2 ON t.to_account_id = a2.id
      WHERE t.user_id = ? AND t.book_id = ?`;
        const params = [req.userId, req.bookId];

        if (month) {
            sql += ' AND CAST(t.date AS CHAR(10)) LIKE ?';
            params.push(month + '%');
        }

        sql += ' ORDER BY t.date DESC, t.id DESC';

        const transfers = await db.query(sql, params);
        res.json(success(transfers));
    } catch (err) {
        handleServerError(res, err);
    }
});

// 执行转账
router.post('/', async (req, res) => {
    try {
        const { from_account_id, to_account_id, amount, note, date } = req.body;

        const amountNum = toNumber(amount);
        // 参数缺失 → 400（请求格式错误）
        if (!from_account_id || !to_account_id) return res.status(ErrorCodes.BAD_REQUEST).json(failBadRequest('请选择转出和转入账户'));
        // 账户相同 → 422（业务规则不允许）
        if (from_account_id === to_account_id) return res.status(ErrorCodes.VALIDATION_FAILED).json(failValidation('转出和转入账户不能相同'));
        // 金额非法 → 422（业务校验）
        if (amountNum === null || amountNum <= 0) return res.status(ErrorCodes.VALIDATION_FAILED).json(failValidation('请输入有效金额'));

        const transferDate = date || new Date().toISOString().replace('T', ' ').slice(0, 19);

        // 使用事务确保一致性
        const result = await db.transaction(async (conn) => {
            // 检查转出账户
            const fromAcc = await conn.query('SELECT * FROM accounts WHERE id = $1 AND user_id = $2 AND book_id = $3', [from_account_id, req.userId, req.bookId]);
            if (!fromAcc[0]) throw new Error('转出账户不存在');

            // 转账分类兜底：优先复用种子「一般转账」(id=22, type=transfer)，缺失则自动创建，避免硬编码 category_id
            const transferCatId = await ensureCategory(conn, req.userId, '一般转账', 'transfer', '🏦');

            // 创建转账记录
            const insertResult = await conn.query(
                `INSERT INTO transfers (user_id, book_id, from_account_id, to_account_id, amount, note, date, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'completed')`,
                [req.userId, req.bookId, from_account_id, to_account_id, amountNum, note || '', transferDate]
            );

            // 余额由账本推导（复式记账 single source of truth）
            await conn.query(
                `INSERT INTO transactions (user_id, book_id, account_id, category_id, type, amount, note, date, transfer_id, source_account_id, destination_account_id)
         VALUES (?, ?, ?, ?, 'transfer_out', ?, ?, ?, ?, ?, NULL)`,
                [req.userId, req.bookId, from_account_id, transferCatId, amountNum, `转账至${fromAcc[0].name}`, transferDate, insertResult.insertId, from_account_id]
            );

            const toAcc = await conn.query('SELECT name FROM accounts WHERE id = $1', [to_account_id]);
            await conn.query(
                `INSERT INTO transactions (user_id, book_id, account_id, category_id, type, amount, note, date, transfer_id, source_account_id, destination_account_id)
         VALUES (?, ?, ?, ?, 'transfer_in', ?, ?, ?, ?, NULL, ?)`,
                [req.userId, req.bookId, to_account_id, transferCatId, amountNum, `来自${toAcc[0]?.name || '转账'}`, transferDate, insertResult.insertId, to_account_id]
            );

            const fromBal = await computeAccountBalance(conn, req.userId, from_account_id);
            const toBal = await computeAccountBalance(conn, req.userId, to_account_id);
            await enforceBalanceLimit(conn, req.userId, from_account_id, fromBal);
            await enforceBalanceLimit(conn, req.userId, to_account_id, toBal);
            await conn.query('UPDATE accounts SET balance = $1 WHERE id = $2', [fromBal, from_account_id]);
            await conn.query('UPDATE accounts SET balance = $1 WHERE id = $2', [toBal, to_account_id]);

            return insertResult.insertId;
        });

        res.json(success({ id: result }, '转账成功'));
    } catch (err) {
        // 智能分类：业务错误返回正确状态码
        const errRes = classifyError(err);
        res.status(errRes.code).json(errRes);
    }
});

// 修改转账
router.put('/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { from_account_id, to_account_id, amount, note, date } = req.body;

        const amountNum = toNumber(amount);
        if (!from_account_id || !to_account_id) return res.status(ErrorCodes.BAD_REQUEST).json(failBadRequest('请选择转出和转入账户'));
        if (from_account_id === to_account_id) return res.status(ErrorCodes.VALIDATION_FAILED).json(failValidation('转出和转入账户不能相同'));
        if (amountNum === null || amountNum <= 0) return res.status(ErrorCodes.VALIDATION_FAILED).json(failValidation('请输入有效金额'));

        const old = await db.queryOne('SELECT * FROM transfers WHERE id = ? AND user_id = ? AND book_id = ?', [id, req.userId, req.bookId]);
        if (!old) return res.status(ErrorCodes.NOT_FOUND).json(failNotFound('转账记录不存在'));

        const transferDate = date || old.date;
        const affectedAccounts = new Set([old.from_account_id, old.to_account_id, from_account_id, to_account_id]);

        await db.transaction(async (conn) => {
            // 转账分类兜底（同 post 路由）
            const transferCatId = await ensureCategory(conn, req.userId, '一般转账', 'transfer', '🏦');
            await conn.query(
                `UPDATE transfers SET from_account_id=?, to_account_id=?, amount=?, note=?, date=? WHERE id=? AND user_id = ? AND book_id = ?`,
                [from_account_id, to_account_id, amountNum, note || '', transferDate, id, req.userId, req.bookId]
            );

            await conn.query('DELETE FROM transactions WHERE transfer_id = $1 AND user_id = $2 AND book_id = $3', [id, req.userId, req.bookId]);

            const fromAcc = await conn.query('SELECT name FROM accounts WHERE id = $1', [from_account_id]);
            await conn.query(
                `INSERT INTO transactions (user_id, book_id, account_id, category_id, type, amount, note, date, transfer_id, source_account_id, destination_account_id)
         VALUES (?, ?, ?, ?, 'transfer_out', ?, ?, ?, ?, ?, NULL)`,
                [req.userId, req.bookId, from_account_id, transferCatId, amountNum, `转账至${fromAcc[0]?.name || '对方'}`, transferDate, id, from_account_id]
            );

            const toAcc = await conn.query('SELECT name FROM accounts WHERE id = $1', [to_account_id]);
            await conn.query(
                `INSERT INTO transactions (user_id, book_id, account_id, category_id, type, amount, note, date, transfer_id, source_account_id, destination_account_id)
         VALUES (?, ?, ?, ?, 'transfer_in', ?, ?, ?, ?, NULL, ?)`,
                [req.userId, req.bookId, to_account_id, transferCatId, amountNum, `来自${toAcc[0]?.name || '转账'}`, transferDate, id, to_account_id]
            );

            const newBalances = {};
            for (const aid of affectedAccounts) {
                newBalances[aid] = await computeAccountBalance(conn, req.userId, aid);
            }
            for (const aid of affectedAccounts) {
                await enforceBalanceLimit(conn, req.userId, aid, newBalances[aid]);
            }
            for (const aid of affectedAccounts) {
                await conn.query('UPDATE accounts SET balance = $1 WHERE id = $2', [newBalances[aid], aid]);
            }
        });

        res.json(success(null, '转账已更新'));
    } catch (err) {
        const errRes = classifyError(err);
        res.status(errRes.code).json(errRes);
    }
});

// 删除转账
router.delete('/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const transfer = await db.queryOne('SELECT * FROM transfers WHERE id = ? AND user_id = ? AND book_id = ?', [id, req.userId, req.bookId]);
        if (!transfer) return res.status(ErrorCodes.NOT_FOUND).json(failNotFound('转账记录不存在'));

        await db.transaction(async (conn) => {
            await conn.query('DELETE FROM transactions WHERE transfer_id = $1 AND user_id = $2 AND book_id = $3', [id, req.userId, req.bookId]);
            await conn.query('DELETE FROM transfers WHERE id = $1 AND user_id = $2 AND book_id = $3', [id, req.userId, req.bookId]);
            const fromBal = await computeAccountBalance(conn, req.userId, transfer.from_account_id);
            const toBal = await computeAccountBalance(conn, req.userId, transfer.to_account_id);
            await enforceBalanceLimit(conn, req.userId, transfer.from_account_id, fromBal);
            await enforceBalanceLimit(conn, req.userId, transfer.to_account_id, toBal);
            await conn.query('UPDATE accounts SET balance = $1 WHERE id = $2', [fromBal, transfer.from_account_id]);
            await conn.query('UPDATE accounts SET balance = $1 WHERE id = $2', [toBal, transfer.to_account_id]);
        });

        res.json(success(null, '转账已删除'));
    } catch (err) {
        handleServerError(res, err);
    }
});

module.exports = router;
