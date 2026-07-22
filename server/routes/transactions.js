/* ============================================
   鑫钱包 · 交易管理路由
   ============================================ */

const express = require('express');
const router = express.Router();
const db = require('../db');
const { toNumber, TRANSACTION_TYPES } = require('../validate');
const {
    success, fail, handleServerError, fmtDateTime, computeAccountBalance,
    ErrorCodes, failBadRequest, failValidation, failNotFound
} = require('./_helpers');
const { ensureCategory, syncCreditCardDebt } = require('./utils');

// ==========================================
// 交易管理 API
// ==========================================

// 获取交易列表
router.get('/', async (req, res) => {
    try {
        const { month, type, category_id, search, limit, offset, tag_id, amount_op, amount_val, amount_val2 } = req.query;
        let sql = `SELECT t.*, c.name as cat_name, c.icon as cat_icon, c.type as cat_type,
      a.name as acc_name, a.icon as acc_icon,
      sa.name as src_name, sa.icon as src_icon,
      da.name as dst_name, da.icon as dst_icon,
      tr.from_account_id as tr_from, tr.to_account_id as tr_to,
      fa.name as tr_from_name, fa.icon as tr_from_icon,
      ta.name as tr_to_name, ta.icon as tr_to_icon,
      b.name as budget_name
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      LEFT JOIN accounts a ON t.account_id = a.id
      LEFT JOIN accounts sa ON t.source_account_id = sa.id
      LEFT JOIN accounts da ON t.destination_account_id = da.id
      LEFT JOIN transfers tr ON t.transfer_id = tr.id
      LEFT JOIN accounts fa ON tr.from_account_id = fa.id
      LEFT JOIN accounts ta ON tr.to_account_id = ta.id
      LEFT JOIN budgets b ON t.budget_id = b.id
      WHERE t.user_id = ?`;
        const params = [req.userId];

        if (month && month !== 'all') {
            sql += ' AND t.date LIKE ?';
            params.push(month + '%');
        }
        if (type && type !== 'all') {
            if (type === 'transfer') {
                // 前端类型筛选中的"转账"需要同时匹配复式记账的转出/转入记录
                sql += " AND t.type IN ('transfer_in', 'transfer_out')";
            } else {
                sql += ' AND t.type = ?';
                params.push(type);
            }
        }
        if (category_id && category_id !== 'all') {
            sql += ' AND t.category_id = ?';
            params.push(parseInt(category_id));
        }
        if (search) {
            sql += ' AND (t.note LIKE ? OR c.name LIKE ?)';
            params.push('%' + search + '%', '%' + search + '%');
        }
        if (tag_id && tag_id !== 'all') {
            sql += ' AND t.id IN (SELECT transaction_id FROM transaction_tags WHERE tag_id = ?)';
            params.push(parseInt(tag_id));
        }
        if (amount_op && amount_op !== 'all') {
            const v1 = parseFloat(amount_val);
            if (!isNaN(v1)) {
                if (amount_op === 'gt') {
                    sql += ' AND t.amount > ?';
                    params.push(v1);
                } else if (amount_op === 'lt') {
                    sql += ' AND t.amount < ?';
                    params.push(v1);
                } else if (amount_op === 'eq') {
                    sql += ' AND t.amount = ?';
                    params.push(v1);
                } else if (amount_op === 'ne') {
                    sql += ' AND t.amount != ?';
                    params.push(v1);
                } else if (amount_op === 'bt' || amount_op === 'nb') {
                    const v2 = parseFloat(amount_val2);
                    if (!isNaN(v2)) {
                        const lo = Math.min(v1, v2);
                        const hi = Math.max(v1, v2);
                        if (amount_op === 'bt') {
                            sql += ' AND t.amount BETWEEN ? AND ?';
                        } else {
                            sql += ' AND t.amount NOT BETWEEN ? AND ?';
                        }
                        params.push(lo, hi);
                    }
                }
            }
        }

        sql += ' ORDER BY t.date DESC, t.id DESC';

        if (limit) {
            sql += ' LIMIT ?';
            params.push(parseInt(limit));
            if (offset) {
                sql += ' OFFSET ?';
                params.push(parseInt(offset));
            }
        }

        const transactions = await db.query(sql, params);

        // 加载交易标签
        let tagMap = {};
        if (transactions.length) {
            const ids = transactions.map(t => t.id);
            const placeholders = ids.map(() => '?').join(',');
            const tagRows = await db.query(
                `SELECT tt.transaction_id, tg.id as tag_id, tg.name as tag_name, tg.color, tg.icon
                 FROM transaction_tags tt JOIN tags tg ON tt.tag_id = tg.id
                 WHERE tt.transaction_id IN (${placeholders})`,
                ids
            );
            tagRows.forEach(r => {
                if (!tagMap[r.transaction_id]) tagMap[r.transaction_id] = [];
                tagMap[r.transaction_id].push({ id: r.tag_id, name: r.tag_name, color: r.color, icon: r.icon });
            });
        }

        // 格式化
        const formatted = transactions.map(t => ({
            id: t.id,
            type: t.type,
            amount: parseFloat(t.amount),
            date: fmtDateTime(t.date),
            note: t.note || '',
            category: { id: t.category_id, name: t.cat_name, icon: t.cat_icon },
            account: { id: t.account_id, name: t.acc_name, icon: t.acc_icon },
            source: t.source_account_id ? { id: t.source_account_id, name: t.src_name, icon: t.src_icon } : null,
            destination: t.destination_account_id ? { id: t.destination_account_id, name: t.dst_name, icon: t.dst_icon } : null,
            // 转账对方账户（复式记账：每笔转账展示借贷对方）
            counterparty: t.type === 'transfer_out'
                ? (t.tr_to_name ? { dir: '→', name: t.tr_to_name, icon: t.tr_to_icon } : null)
                : t.type === 'transfer_in'
                ? (t.tr_from_name ? { dir: '←', name: t.tr_from_name, icon: t.tr_from_icon } : null)
                : null,
            transfer_id: t.transfer_id,
            budget_id: t.budget_id,
            budget_name: t.budget_name,
            tags: tagMap[t.id] || []
        }));

        res.json(success(formatted));
    } catch (err) {
        handleServerError(res, err);
    }
});

// ==========================================
// 复式记账流水（Firefly III 式：每笔流动展示 来源 → 目标）
// ==========================================
router.get('/ledger', async (req, res) => {
    try {
        const { month } = req.query;
        let sql = `SELECT t.id, t.type, t.amount, t.date, t.note, t.transfer_id,
            sa.name as src_name, sa.icon as src_icon,
            da.name as dst_name, da.icon as dst_icon,
            c.name as cat_name, c.icon as cat_icon
            FROM transactions t
            LEFT JOIN accounts sa ON t.source_account_id = sa.id
            LEFT JOIN accounts da ON t.destination_account_id = da.id
            LEFT JOIN categories c ON t.category_id = c.id
            WHERE t.user_id = ?`;
        const params = [req.userId];
        if (month && month !== 'all') {
            sql += ' AND t.date LIKE ?';
            params.push(month + '%');
        }
        sql += ' ORDER BY t.date DESC, t.id DESC';
        const rows = await db.query(sql, params);
        const formatted = rows.map(t => ({
            id: t.id,
            type: t.type,
            amount: parseFloat(t.amount),
            date: t.date,
            note: t.note || '',
            transfer_id: t.transfer_id,
            category: { name: t.cat_name, icon: t.cat_icon },
            source: t.source_account_id ? { name: t.src_name, icon: t.src_icon } : null,
            destination: t.destination_account_id ? { name: t.dst_name, icon: t.dst_icon } : null
        }));
        res.json(success(formatted));
    } catch (err) {
        handleServerError(res, err);
    }
});

// 新增交易
router.post('/', async (req, res) => {
    try {
        const { account_id, category_id, budget_id, type, amount, date, note } = req.body;

        const amountNum = toNumber(amount);
        if (amountNum === null || amountNum <= 0) return res.status(ErrorCodes.VALIDATION_FAILED).json(failValidation('请输入有效金额'));
        if (!account_id) return res.status(ErrorCodes.BAD_REQUEST).json(failBadRequest('请选择账户'));
        if (!TRANSACTION_TYPES.includes(type)) return res.status(ErrorCodes.VALIDATION_FAILED).json(failValidation('交易类型不合法'));

        const transDate = date || new Date().toISOString().replace('T', ' ').slice(0, 19);
        // 复式记账：支出/转出(source=扣款账户)，收入/转入(dest=入账账户)
        const src = (type === 'expense' || type === 'transfer_out') ? parseInt(account_id) : null;
        const dst = (type === 'income' || type === 'transfer_in') ? parseInt(account_id) : null;
        const bId = budget_id ? parseInt(budget_id) : null;

        // 使用事务确保余额一致
        const result = await db.transaction(async (conn) => {
            const insertResult = await conn.query(
                `INSERT INTO transactions (user_id, account_id, category_id, budget_id, type, amount, note, date, source_account_id, destination_account_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [req.userId, parseInt(account_id), parseInt(category_id), bId, type, amountNum, note || '', transDate, src, dst]
            );

            // 余额由账本推导（复式记账 single source of truth），取代易漂移的增量更新
            const newBalance = await computeAccountBalance(conn, req.userId, parseInt(account_id));
            await conn.query('UPDATE accounts SET balance = ? WHERE id = ?', [newBalance, parseInt(account_id)]);

            // 自动同步信用卡债务
            await syncCreditCardDebt(conn, req.userId, parseInt(account_id));

            // 写入交易标签
            const tags = Array.isArray(req.body.tags) ? req.body.tags.map(t => parseInt(t)).filter(Boolean) : [];
            for (const tid of tags) {
                await conn.query('INSERT IGNORE INTO transaction_tags (transaction_id, tag_id) VALUES (?, ?)', [insertResult.insertId, tid]);
            }

            return insertResult.insertId;
        });

        res.json(success({ id: result }, '交易已添加'));
    } catch (err) {
        handleServerError(res, err);
    }
});

// 更新交易
router.put('/:id', async (req, res) => {
    try {
        const { account_id, category_id, budget_id, type, amount, date, note } = req.body;
        const id = parseInt(req.params.id);

        const amountNum = toNumber(amount);
        if (amountNum === null || amountNum <= 0) return res.status(ErrorCodes.VALIDATION_FAILED).json(failValidation('请输入有效金额'));
        if (!TRANSACTION_TYPES.includes(type)) return res.status(ErrorCodes.VALIDATION_FAILED).json(failValidation('交易类型不合法'));

        // 先获取原交易信息用于回滚余额
        const old = await db.queryOne('SELECT * FROM transactions WHERE id = ? AND user_id = ?', [id, req.userId]);
        if (!old) return res.status(ErrorCodes.NOT_FOUND).json(failNotFound('交易不存在'));

        const src = (type === 'expense' || type === 'transfer_out') ? parseInt(account_id) : null;
        const dst = (type === 'income' || type === 'transfer_in') ? parseInt(account_id) : null;
        const bId = budget_id ? parseInt(budget_id) : null;

        await db.transaction(async (conn) => {
            // 更新交易记录（含复式记账借贷双方字段）
            await conn.query(
                `UPDATE transactions SET account_id=?, category_id=?, budget_id=?, type=?, amount=?, note=?, date=?, source_account_id=?, destination_account_id=? WHERE id=?`,
                [parseInt(account_id), parseInt(category_id), bId, type, amountNum, note || '', date, src, dst, id]
            );

            // 重置交易标签
            await conn.query('DELETE FROM transaction_tags WHERE transaction_id = ?', [id]);
            const tags = Array.isArray(req.body.tags) ? req.body.tags.map(t => parseInt(t)).filter(Boolean) : [];
            for (const tid of tags) {
                await conn.query('INSERT IGNORE INTO transaction_tags (transaction_id, tag_id) VALUES (?, ?)', [id, tid]);
            }

            // 余额由账本重算（旧账户 + 新账户，账户变更时两者都修正），彻底杜绝漂移
            const affected = new Set([parseInt(old.account_id), parseInt(account_id)]);
            for (const aid of affected) {
                const bal = await computeAccountBalance(conn, req.userId, aid);
                await conn.query('UPDATE accounts SET balance = ? WHERE id = ?', [bal, aid]);
                // 自动同步信用卡债务
                await syncCreditCardDebt(conn, req.userId, aid);
            }
        });

        res.json(success(null, '交易已更新'));
    } catch (err) {
        handleServerError(res, err);
    }
});

// 删除交易
router.delete('/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const old = await db.queryOne('SELECT * FROM transactions WHERE id = ? AND user_id = ?', [id, req.userId]);
        if (!old) return res.status(ErrorCodes.NOT_FOUND).json(failNotFound('交易不存在'));

        await db.transaction(async (conn) => {
            // 如果是转账记录，同时删除配对的另一条
            const affectedAccounts = new Set([parseInt(old.account_id)]);
            if (old.transfer_id) {
                // 删除同一 transfer_id 的所有关联交易
                const paired = await conn.query(
                    'SELECT id, account_id FROM transactions WHERE transfer_id = ? AND id != ? AND user_id = ?',
                    [old.transfer_id, id, req.userId]
                );
                paired.forEach(p => affectedAccounts.add(parseInt(p.account_id)));
                await conn.query('DELETE FROM transactions WHERE transfer_id = ? AND user_id = ?', [old.transfer_id, req.userId]);
                // 同时删除 transfers 表记录
                await conn.query('DELETE FROM transfers WHERE id = ? AND user_id = ?', [old.transfer_id, req.userId]);
            } else {
                await conn.query('DELETE FROM transactions WHERE id = ?', [id]);
            }
            // 余额由账本重算，避免增量回滚的漂移
            for (const aid of affectedAccounts) {
                const bal = await computeAccountBalance(conn, req.userId, aid);
                await conn.query('UPDATE accounts SET balance = ? WHERE id = ?', [bal, aid]);
                // 自动同步信用卡债务（删除交易后余额变化）
                await syncCreditCardDebt(conn, req.userId, aid);
            }
        });

        res.json(success(null, '交易已删除'));
    } catch (err) {
        handleServerError(res, err);
    }
});

// 交易月份列表
router.get('/months', async (req, res) => {
    try {
        const months = await db.query(
            `SELECT DISTINCT DATE_FORMAT(date, '%Y-%m') as month
       FROM transactions WHERE user_id = ? ORDER BY month DESC`,
            [req.userId]
        );
        res.json(success(months.map(m => m.month)));
    } catch (err) {
        handleServerError(res, err);
    }
});

// 月度汇总
router.get('/summary', async (req, res) => {
    try {
        const { month } = req.query;
        if (!month) return res.status(ErrorCodes.BAD_REQUEST).json(failBadRequest('请指定月份'));

        const incomeRow = await db.queryOne(
            `SELECT COALESCE(SUM(amount), 0) as total FROM transactions
       WHERE user_id = ? AND type = 'income' AND date LIKE ?`,
            [req.userId, month + '%']
        );
        const expenseRow = await db.queryOne(
            `SELECT COALESCE(SUM(amount), 0) as total FROM transactions
       WHERE user_id = ? AND type = 'expense' AND date LIKE ?`,
            [req.userId, month + '%']
        );

        // 类别汇总
        const expByCat = await db.query(
            `SELECT c.id, c.name, c.icon, SUM(t.amount) as total
       FROM transactions t JOIN categories c ON t.category_id = c.id
       WHERE t.user_id = ? AND t.type = 'expense' AND t.date LIKE ?
       GROUP BY c.id ORDER BY total DESC`,
            [req.userId, month + '%']
        );

        const incByCat = await db.query(
            `SELECT c.id, c.name, c.icon, SUM(t.amount) as total
       FROM transactions t JOIN categories c ON t.category_id = c.id
       WHERE t.user_id = ? AND t.type = 'income' AND t.date LIKE ?
       GROUP BY c.id ORDER BY total DESC`,
            [req.userId, month + '%']
        );

        const income = parseFloat(incomeRow.total);
        const expense = parseFloat(expenseRow.total);

        res.json(success({
            income, expense, balance: income - expense,
            expenseByCategory: expByCat.map(r => ({ ...r, total: parseFloat(r.total) })),
            incomeByCategory: incByCat.map(r => ({ ...r, total: parseFloat(r.total) }))
        }));
    } catch (err) {
        handleServerError(res, err);
    }
});

module.exports = router;
