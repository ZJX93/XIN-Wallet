/* ============================================
   鑫钱包 · 理财管理路由模块
   包含：理财类型 CRUD、持仓管理、行情 API
   ============================================ */

const express = require('express');
const db = require('../db');
const { toNumber } = require('../validate');
const { success, fail, handleServerError, fmtDateOnly, fmtDateTime, ensureWeeklySnapshots, computeAccountBalance } = require('./_helpers');
const quoteCache = require('../services/quote-cache');
const {
  getQuoteStrategy,
  fetchQuoteByCategory,
  fetchPriceForInvestment
} = require('../services/market-data');

const router = express.Router();

// ==========================================
// 理财类型 CRUD
// ==========================================

// 获取理财类型列表
router.get('/', async (req, res) => {
    try {
        const types = await db.query('SELECT * FROM investment_types ORDER BY sort_order, id');
        res.json(success(types));
    } catch (err) {
        handleServerError(res, err);
    }
});

// 新增理财类型
router.post('/', async (req, res) => {
    try {
        const { name, icon, risk_level, description, category } = req.body;
        if (!name) return res.status(400).json(fail('请输入类型名称'));
        
        const result = await db.query(
            `INSERT INTO investment_types (name, icon, risk_level, description, category) VALUES (?, ?, ?, ?, ?)`,
            [name, icon || '📈', risk_level || 'medium', description || '', category || 'fund']
        );
        res.json(success({ id: result.insertId }));
    } catch (err) {
        handleServerError(res, err);
    }
});

/**
 * 安全修复：investment_types 是全局共享表（无 user_id 列），schema 预置 11 条基础类型。
 * 此前 PUT/DELETE 无任何保护 → 任意登录用户可改删全局类型，影响所有用户
 * （与审核报告 C4「系统分类可被任意用户篡改」同构，报告未覆盖此表）。
 * 系统预置类型一律拒绝普通用户改删。
 */
async function assertTypeEditable(id) {
    const t = await db.queryOne('SELECT id, is_system FROM investment_types WHERE id = ?', [id]);
    if (!t) return { ok: false, code: 404, msg: '理财类型不存在' };
    if (t.is_system) return { ok: false, code: 403, msg: '系统预置类型不可修改或删除' };
    return { ok: true };
}

// ==========================================
// 持仓创建时同步生成台账交易，保持账本一致
// ==========================================

// 投资理财一级（支出）：名下挂「投资买入」「理财保险」二级
async function getInvestmentTopCategoryId(conn) {
    const rows = await conn.query('SELECT id FROM categories WHERE code = $1 AND type = $2', ['E1100', 'expense']);
    if (rows[0]) return rows[0].id;
    const r = await conn.query(
        'INSERT INTO categories (code, name, type, icon, color, is_system) VALUES ($1, $2, $3, $4, $5, TRUE)',
        ['E1100', '投资理财', 'expense', '💹', '#22c55e']
    );
    return r.insertId;
}

// 判断是否保险类理财产品（买入应归入「理财保险」而非「投资买入」）
async function isInsuranceType(conn, typeId) {
    if (!typeId) return false;
    const t = await conn.query('SELECT category, name FROM investment_types WHERE id = $1', [typeId]);
    if (!t[0]) return false;
    return t[0].category === 'insurance' || (t[0].name && t[0].name.indexOf('保险') !== -1);
}

// 买入分类（支出）：保险类→理财保险，其余→投资买入；均为「投资理财」二级
async function getOrCreateInvestmentBuyCategory(conn, isInsurance) {
    const name = isInsurance ? '理财保险' : '投资买入';
    const rows = await conn.query('SELECT id, parent_id FROM categories WHERE name = $1 AND type = $2', [name, 'expense']);
    if (rows[0]) {
        // 历史动态创建的「投资买入」可能无 parent，挂回投资理财下
        if (rows[0].parent_id == null) {
            const topId = await getInvestmentTopCategoryId(conn);
            await conn.query('UPDATE categories SET parent_id = $1 WHERE id = $2', [topId, rows[0].id]);
        }
        return rows[0].id;
    }
    const topId = await getInvestmentTopCategoryId(conn);
    const icon = isInsurance ? '🛡️' : '📈';
    const r = await conn.query(
        'INSERT INTO categories (name, type, icon, color, parent_id, is_system) VALUES ($1, $2, $3, $4, $5, TRUE)',
        [name, 'expense', icon, '#22c55e', topId]
    );
    return r.insertId;
}

// 理财收益分类（收入，隶属于被动收入）：卖出/减仓/清仓共用
async function getInvestmentSellCategoryId(conn) {
    const rows = await conn.query('SELECT id FROM categories WHERE name = $1 AND type = $2', ['理财收益', 'income']);
    if (rows[0]) return rows[0].id;
    // 理财收益缺失时自动补建到「被动收入」下，保证卖出分类口径正确
    const parent = await conn.query('SELECT id FROM categories WHERE name = $1 AND type = $2', ['被动收入', 'income']);
    const parentId = parent[0] ? parent[0].id : null;
    const result = await conn.query(
        'INSERT INTO categories (name, type, icon, color, parent_id, is_system) VALUES ($1, $2, $3, $4, $5, $6, TRUE)',
        ['理财收益', 'income', '📊', '#22c55e', parentId]
    );
    return result.insertId;
}

// 创建持仓时：资金从关联账户流出（支出），扣减余额
async function createInvestmentCreateTxn(conn, userId, accId, cost, name, dateStr, investmentTypeId, investmentTxnId = null) {
    if (!accId || !(cost > 0)) return null;
    const isIns = await isInsuranceType(conn, investmentTypeId);
    const catId = await getOrCreateInvestmentBuyCategory(conn, isIns);
    const txDate = (dateStr || new Date().toISOString().slice(0, 10)) + ' 00:00:00';
    const txResult = await conn.query(
        `INSERT INTO transactions (user_id, account_id, category_id, type, amount, note, date, source_account_id, destination_account_id, investment_txn_id)
         VALUES (?, ?, ?, 'expense', ?, ?, ?, ?, NULL, ?)`,
        [userId, accId, catId, cost, `买入·${name}`, txDate, accId, investmentTxnId]
    );
    // 以账本为准重算关联账户余额
    const newBalance = await computeAccountBalance(conn, userId, accId);
    await conn.query('UPDATE accounts SET balance = $1 WHERE id = $2', [newBalance, accId]);
    return txResult.insertId;
}

// 回滚创建持仓时生成的台账交易（删除交易并按账本重算账户余额）
async function rollbackInvestmentCreateTxn(conn, userId, txId, accId) {
    if (!txId) return;
    await conn.query('DELETE FROM transactions WHERE id = $1 AND user_id = $2', [txId, userId]);
    if (accId) {
        const newBalance = await computeAccountBalance(conn, userId, accId);
        await conn.query('UPDATE accounts SET balance = $1 WHERE id = $2', [newBalance, accId]);
    }
}

// 更新理财类型
router.put('/:id', async (req, res) => {
    try {
        const typeId = parseInt(req.params.id);
        if (!Number.isInteger(typeId)) return res.status(400).json(fail('无效的类型 ID'));
        const guard = await assertTypeEditable(typeId);
        if (!guard.ok) return res.status(guard.code).json(fail(guard.msg));

        const { name, icon, risk_level, description, category } = req.body;
        await db.query(
            `UPDATE investment_types SET name=?, icon=?, risk_level=?, description=?, category=? WHERE id=? AND is_system = FALSE`,
            [name, icon, risk_level, description, category, typeId]
        );
        res.json(success(null, '类型已更新'));
    } catch (err) {
        handleServerError(res, err);
    }
});

// 删除理财类型
router.delete('/:id', async (req, res) => {
    try {
        const typeId = parseInt(req.params.id);
        if (!Number.isInteger(typeId)) return res.status(400).json(fail('无效的类型 ID'));
        const guard = await assertTypeEditable(typeId);
        if (!guard.ok) return res.status(guard.code).json(fail(guard.msg));

        const count = await db.queryOne(
            'SELECT COUNT(*) as cnt FROM investments WHERE investment_type_id = ?',
            [typeId]
        );
        if (count.cnt > 0) return res.status(400).json(fail('该类型下仍有持仓，无法删除'));

        await db.query('DELETE FROM investment_types WHERE id = $1 AND is_system = FALSE', [typeId]);
        res.json(success(null, '类型已删除'));
    } catch (err) {
        handleServerError(res, err);
    }
});

// 获取所有持仓
//
// 修复 m2（重复实现）：calcAnnualizedRate / calcPortfolioMetrics 原先在本文件与
// stats.js 中各存一份逐字节相同的副本，而 services/portfolio.js 早已提供同名实现
// 却无人引用 —— 三份代码各自漂移的隐患。现统一复用共享服务。
const { annualizedRate: calcAnnualizedRate, calcPortfolioMetrics } = require('../services/portfolio');

router.get('/investments', async (req, res) => {
    try {
        const investments = await db.query(
            `SELECT i.*, it.name as type_name, it.icon as type_icon, it.risk_level as type_risk_level,
       COALESCE(i.risk_level, it.risk_level) as risk_level,
       a.name as acc_name
       FROM investments i
       JOIN investment_types it ON i.investment_type_id = it.id
       LEFT JOIN accounts a ON i.account_id = a.id
       WHERE i.user_id = ? AND i.status = 'holding'
       ORDER BY i.current_value DESC`,
            [req.userId]
        );

        // 计算汇总
        const totalCost = investments.reduce((s, i) => s + parseFloat(i.total_cost), 0);
        const totalValue = investments.reduce((s, i) => s + parseFloat(i.current_value), 0);
        const totalProfit = totalValue - totalCost;
        const totalProfitRate = totalCost > 0 ? (totalProfit / totalCost * 100) : 0;

        // 按类型分组
        const byType = {};
        investments.forEach(i => {
            const key = i.type_name;
            if (!byType[key]) byType[key] = { type_name: key, icon: i.type_icon, risk_level: i.risk_level, total_cost: 0, total_value: 0, items: [] };
            byType[key].total_cost += parseFloat(i.total_cost);
            byType[key].total_value += parseFloat(i.current_value);
            byType[key].items.push({
                ...i,
                buy_price: parseFloat(i.buy_price),
                current_price: parseFloat(i.current_price),
                quantity: parseFloat(i.quantity),
                total_cost: parseFloat(i.total_cost),
                current_value: parseFloat(i.current_value),
                fee: parseFloat(i.fee || 0),
                profit: parseFloat(i.current_value) - parseFloat(i.total_cost),
                profit_rate: parseFloat(i.total_cost) > 0 ? ((parseFloat(i.current_value) - parseFloat(i.total_cost)) / parseFloat(i.total_cost) * 100) : 0,
                expected_rate: parseFloat(i.expected_rate),
                actual_rate: parseFloat(i.actual_rate)
            });
        });

        res.json(success({
            investments: investments.map(i => ({
                ...i,
                buy_price: parseFloat(i.buy_price),
                current_price: parseFloat(i.current_price),
                quantity: parseFloat(i.quantity),
                total_cost: parseFloat(i.total_cost),
                current_value: parseFloat(i.current_value),
                fee: parseFloat(i.fee || 0),
                profit: parseFloat(i.current_value) - parseFloat(i.total_cost),
                profit_rate: parseFloat(i.total_cost) > 0 ? ((parseFloat(i.current_value) - parseFloat(i.total_cost)) / parseFloat(i.total_cost) * 100) : 0,
                expected_rate: parseFloat(i.expected_rate),
                actual_rate: parseFloat(i.actual_rate),
                annualizedRate: Math.round(calcAnnualizedRate(i.total_cost, i.current_value, i.buy_date) * 100) / 100
            })),
            summary: { ...calcPortfolioMetrics(investments), totalProfitRate: Math.round(totalProfitRate * 100) / 100 },
            byType
        }));
    } catch (err) {
        handleServerError(res, err);
    }
});

router.post('/investments', async (req, res) => {
    try {
        const { account_id, investment_type_id, name, code, buy_price, current_price, quantity, total_cost, current_value, fee, buy_date, expected_rate, risk_level, note } = req.body;

        if (!name || !investment_type_id) return res.status(400).json(fail('参数不完整'));

        const feeVal = parseFloat(fee) || 0;
        const costVal = parseFloat(total_cost) || 0;
        const valueVal = parseFloat(current_value) || costVal || 0;
        const accId = parseInt(account_id) || null;
        const buyDate = buy_date || new Date().toISOString().split('T')[0];
        const riskVal = ['low', 'medium', 'high', 'very_high'].includes(risk_level) ? risk_level : null;

        const result = await db.transaction(async (conn) => {
            const invResult = await conn.query(
                `INSERT INTO investments (user_id, account_id, investment_type_id, name, code, buy_price, current_price, quantity, total_cost, current_value, fee, buy_date, expected_rate, risk_level, note)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [req.userId, accId, parseInt(investment_type_id), name, code || '',
                    parseFloat(buy_price) || 0, parseFloat(current_price) || parseFloat(buy_price) || 0,
                    parseFloat(quantity) || 0, costVal,
                    valueVal,
                    feeVal,
                    buyDate, parseFloat(expected_rate) || 0, riskVal,
                    note || '']
            );
            const invId = invResult.insertId;

            // 记录买入操作
            const initBuyTxn = await conn.query(
                `INSERT INTO investment_transactions (user_id, investment_id, type, amount, price, quantity, date, note)
                 VALUES (?, ?, 'buy', ?, ?, ?, ?, '初始买入')`,
                [req.userId, invId, costVal, parseFloat(buy_price) || 0, parseFloat(quantity) || 0, buyDate]
            );

            // 关联账户：买入扣款，保持账本一致；并把台账交易关联回理财买入流水(investment_txn_id)
            const createTxnId = await createInvestmentCreateTxn(conn, req.userId, accId, costVal, name, buyDate, parseInt(investment_type_id), initBuyTxn.insertId);
            if (createTxnId) {
                await conn.query('UPDATE investments SET create_transaction_id = $1 WHERE id = $2', [createTxnId, invId]);
            }

            return invResult;
        });

        res.json(success({ id: result.insertId }, '理财持仓已添加'));
    } catch (err) {
        handleServerError(res, err);
    }
});

// 更新理财持仓（编辑/刷新行情）
router.put('/investments/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { account_id, investment_type_id, name, code, buy_price, current_price, quantity, total_cost, current_value, fee, buy_date, expected_rate, actual_rate, risk_level, note, status } = req.body;

        // 区分行情刷新（仅 current_price/current_value/actual_rate）和完整编辑
        const isQuoteRefresh = name === undefined;

        if (isQuoteRefresh) {
            await db.query(
                'UPDATE investments SET current_price=$1, current_value=$2, actual_rate=$3 WHERE id=$4 AND user_id=$5',
                [parseFloat(current_price) || 0, parseFloat(current_value) || 0, parseFloat(actual_rate) || 0, id, req.userId]
            );
            res.json(success(null, '持仓已更新'));
            return;
        }

        const newAccId = parseInt(account_id) || null;
        const newCost = parseFloat(total_cost) || 0;
        const newName = name || '';
        const newBuyDate = buy_date || new Date().toISOString().split('T')[0];

        await db.transaction(async (conn) => {
            // 取出旧持仓，用于回滚旧台账交易
            const oldRows = await conn.query('SELECT * FROM investments WHERE id = $1 AND user_id = $2', [id, req.userId]);
            const old = oldRows[0] || null;

            // 回滚旧的创建交易（避免账本残留）
            if (old && old.create_transaction_id) {
                await rollbackInvestmentCreateTxn(conn, req.userId, old.create_transaction_id, old.account_id);
            }

            await conn.query(
                `UPDATE investments SET
                    account_id=?, investment_type_id=?, name=?, code=?,
                    buy_price=?, current_price=?, quantity=?, total_cost=?, current_value=?, fee=?,
                    buy_date=?, expected_rate=?, actual_rate=?, risk_level=?, note=?, status=?
                 WHERE id=? AND user_id=?`,
                [
                    newAccId, parseInt(investment_type_id), newName, code || '',
                    parseFloat(buy_price) || 0, parseFloat(current_price) || 0,
                    parseFloat(quantity) || 0, newCost, parseFloat(current_value) || 0, parseFloat(fee) || 0,
                    newBuyDate,
                    parseFloat(expected_rate) || 0, parseFloat(actual_rate) || 0,
                    ['low', 'medium', 'high', 'very_high'].includes(risk_level) ? risk_level : null,
                    note || '', status || 'holding', id, req.userId
                ]
            );

            // 按新参数重建创建交易（账户/成本/名称/日期变化时）
            const newTxnId = await createInvestmentCreateTxn(conn, req.userId, newAccId, newCost, newName, newBuyDate, parseInt(investment_type_id));
            await conn.query('UPDATE investments SET create_transaction_id = $1 WHERE id = $2', [newTxnId, id]);
        });

        res.json(success(null, '持仓已更新'));
    } catch (err) {
        handleServerError(res, err);
    }
});

// 理财交易记录（卖出/分红/红利再投等）
router.post('/investments/:id/transactions', async (req, res) => {
    try {
        const { type, amount, price, quantity, date, note } = req.body;
        const investmentId = parseInt(req.params.id);
        if (!Number.isInteger(investmentId)) return res.status(400).json(fail('无效的持仓 ID'));

        // 安全修复（审核报告 C3）：本接口原先完全没有归属校验，
        // 登录用户枚举 id 即可向他人持仓插入流水并篡改其数量/市值。
        // 此处强制先校验持仓归属，后续所有写操作一律带 user_id 条件。
        const ownedInv = await db.queryOne(
            'SELECT * FROM investments WHERE id = ? AND user_id = ?',
            [investmentId, req.userId]
        );
        if (!ownedInv) return res.status(404).json(fail('持仓不存在'));
        if (!['buy', 'sell', 'dividend', 'interest', 'reinvest'].includes(type)) {
            return res.status(400).json(fail('不支持的交易类型'));
        }

        // 红利再投：先算新增份额（金额 / 单位净值），用于流水与持仓更新
        let addedQty = parseFloat(quantity) || 0;
        if (type === 'reinvest') {
            const nav = parseFloat(price) || parseFloat(ownedInv.current_price) || 0;
            const amt = parseFloat(amount) || 0;
            if (!(nav > 0)) return res.status(400).json(fail('红利再投需要有效的单位净值，请在「当前净值」填写'));
            if (!(amt > 0)) return res.status(400).json(fail('红利再投金额需大于 0'));
            addedQty = amt / nav;
        }

        let msg = '操作已记录';
        const invTxn = await db.query(
            `INSERT INTO investment_transactions (user_id, investment_id, type, amount, price, quantity, date, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [req.userId, investmentId, type, parseFloat(amount), parseFloat(price) || 0, addedQty, date, note || '']
        );

        // 如果是卖出，更新持仓
        if (type === 'sell') {
            await db.query(
                'UPDATE investments SET quantity = quantity - $1, current_value = current_value - $2 WHERE id = $3 AND user_id = $4',
                [parseFloat(quantity), parseFloat(amount), investmentId, req.userId]
            );
        }

        // 如果是分红/利息，记录到主交易（现金入账）
        if (type === 'dividend' || type === 'interest') {
            const investment = ownedInv;
            if (investment && investment.account_id) {
                await db.transaction(async (conn) => {
                    const sellCatId = await getInvestmentSellCategoryId(conn);
                    await conn.query(
                            `INSERT INTO transactions (user_id, account_id, category_id, type, amount, note, date, investment_txn_id)
             VALUES (?, ?, ?, 'income', ?, ?, ?, ?)`,
                            [req.userId, investment.account_id, sellCatId, parseFloat(amount), `${type === 'dividend' ? '分红' : '利息'}-${investment.name}`, date, invTxn.insertId]
                        );
                        // 以账本为准重算账户余额（单一真相，避免直接加减导致漂移）
                        const newBalance = await computeAccountBalance(conn, req.userId, investment.account_id);
                        await conn.query('UPDATE accounts SET balance = $1 WHERE id = $2', [newBalance, investment.account_id]);
                });
            }
            msg = type === 'dividend' ? '分红已记录' : '利息已记录';
        }

        // 如果是红利再投，增加持有份额（不进现金、不动账户余额）
        if (type === 'reinvest') {
            const nav = parseFloat(price) || parseFloat(ownedInv.current_price) || 0;
            const newQty = parseFloat(ownedInv.quantity) + addedQty;
            const newCurrentValue = newQty * nav;
            await db.query(
                'UPDATE investments SET quantity = $1, current_value = $2 WHERE id = $3 AND user_id = $4',
                [newQty, newCurrentValue, investmentId, req.userId]
            );
            msg = '红利再投已记录，持有份额已增加';
        }

        res.json(success(null, msg));
    } catch (err) {
        handleServerError(res, err);
    }
});

// 查看某理财持仓的全部交易记录（买入/卖出/分红/利息/红利再投）
const INV_TXN_TYPE_LABEL = {
  buy: '买入', sell: '卖出', dividend: '分红', interest: '利息', reinvest: '红利再投'
};
router.get('/investments/:id/transactions', async (req, res) => {
    try {
        const investmentId = parseInt(req.params.id);
        if (!Number.isInteger(investmentId)) return res.status(400).json(fail('无效的持仓 ID'));

        // 归属校验：禁止跨用户查看他人持仓流水
        const owned = await db.queryOne('SELECT id FROM investments WHERE id = ? AND user_id = ?', [investmentId, req.userId]);
        if (!owned) return res.status(404).json(fail('持仓不存在'));

        const rows = await db.query(
            `SELECT * FROM investment_transactions
             WHERE investment_id = ? AND user_id = ?
             ORDER BY date DESC, id DESC`,
            [investmentId, req.userId]
        );
        const list = rows.map(t => ({
            id: t.id,
            type: t.type,
            type_label: INV_TXN_TYPE_LABEL[t.type] || t.type,
            amount: parseFloat(t.amount),
            price: parseFloat(t.price),
            quantity: parseFloat(t.quantity),
            date: fmtDateTime(t.date),
            note: t.note || ''
        }));
        res.json(success(list));
    } catch (err) {
        handleServerError(res, err);
    }
});

// 卖出/清仓
router.put('/investments/:id/sell', async (req, res) => {
    try {
        const { sell_price, date, note } = req.body;
        const id = parseInt(req.params.id);
        const investment = await db.queryOne('SELECT * FROM investments WHERE id = ? AND user_id = ?', [id, req.userId]);
        if (!investment) return res.status(404).json(fail('持仓不存在'));

        const sellAmount = parseFloat(sell_price) * parseFloat(investment.quantity);

        await db.transaction(async (conn) => {
            // 记录卖出
            const sellTxn = await conn.query(
                `INSERT INTO investment_transactions (user_id, investment_id, type, amount, price, quantity, date, note)
         VALUES (?, ?, 'sell', ?, ?, ?, ?, ?)`,
                [req.userId, id, sellAmount, parseFloat(sell_price), parseFloat(investment.quantity), date || new Date().toISOString().split('T')[0], note || '清仓卖出']
            );

            // 更新持仓状态
            await conn.query(
                `UPDATE investments SET current_price=?, current_value=?, quantity=0, status='sold' WHERE id=? AND user_id=?`,
                [parseFloat(sell_price), sellAmount, id, req.userId]
            );

            // 记录到主交易（如果关联了账户）
            if (investment.account_id) {
                const profit = sellAmount - parseFloat(investment.total_cost);
                const sellCatId = await getInvestmentSellCategoryId(conn);
                await conn.query(
                    `INSERT INTO transactions (user_id, account_id, category_id, type, amount, note, date, investment_txn_id)
           VALUES (?, ?, ?, 'income', ?, ?, ?, ?)`,
                    [req.userId, investment.account_id, sellCatId, sellAmount, `卖出${investment.name}，盈亏${profit >= 0 ? '+' : ''}${profit.toFixed(2)}`, date || new Date().toISOString().split('T')[0], sellTxn.insertId]
                );
                // 以账本为准重算账户余额
                const newBalance = await computeAccountBalance(conn, req.userId, investment.account_id);
                await conn.query('UPDATE accounts SET balance = $1 WHERE id = $2', [newBalance, investment.account_id]);
            }
        });

        res.json(success(null, '已卖出'));
    } catch (err) {
        handleServerError(res, err);
    }
});

// 加仓/减仓（买入/卖出）
router.post('/investments/:id/reduce', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { action, price, quantity: qty, fee: txnFee, date, note } = req.body;
        const isBuy = action === 'buy';
        const q = parseFloat(qty) || 0;
        const p = parseFloat(price) || 0;
        const fee = parseFloat(txnFee) || 0;
        if (q <= 0 || p <= 0) return res.status(400).json(fail('成交价格和数量必须大于0'));

        const investment = await db.queryOne('SELECT * FROM investments WHERE id = ? AND user_id = ?', [id, req.userId]);
        if (!investment) return res.status(404).json(fail('持仓不存在'));

        if (!isBuy && q > parseFloat(investment.quantity)) {
            return res.status(400).json(fail('卖出数量不能超过持仓数量'));
        }

        await db.transaction(async (conn) => {
            if (isBuy) {
                // ===== 加仓 =====
                const buyAmount = p * q + fee;
                const newQty = parseFloat(investment.quantity) + q;
                const newTotalCost = parseFloat(investment.total_cost) + buyAmount;
                const avgCost = newQty > 0 ? newTotalCost / newQty : 0;
                const newCurrentValue = newQty * parseFloat(investment.current_price || p);

                const buyInvTxn = await conn.query(
                    `INSERT INTO investment_transactions (user_id, investment_id, type, amount, price, quantity, date, note)
                     VALUES (?, ?, 'buy', ?, ?, ?, ?, ?)`,
                    [req.userId, id, buyAmount, p, q, date || new Date().toISOString().split('T')[0], note || '加仓']
                );
                await conn.query(
                    `UPDATE investments SET quantity=?, total_cost=?, current_value=?, buy_price=?, status=? WHERE id=? AND user_id=?`,
                    [newQty, newTotalCost, newCurrentValue, avgCost, 'holding', id, req.userId]
                );
                if (investment.account_id) {
                    const isIns = await isInsuranceType(conn, investment.investment_type_id);
                    const buyCatId = await getOrCreateInvestmentBuyCategory(conn, isIns);
                    await conn.query(
                        `INSERT INTO transactions (user_id, account_id, category_id, type, amount, note, date, investment_txn_id)
                         VALUES (?, ?, ?, 'expense', ?, ?, ?, ?)`,
                        [req.userId, investment.account_id, buyCatId, buyAmount, `加仓${investment.name} ${q}份 @ ${p}`, date || new Date().toISOString().split('T')[0], buyInvTxn.insertId]
                    );
                    // 以账本为准重算账户余额
                    const newBalance = await computeAccountBalance(conn, req.userId, investment.account_id);
                    await conn.query('UPDATE accounts SET balance = $1 WHERE id = $2', [newBalance, investment.account_id]);
                }
                res.json(success(null, '已加仓'));
            } else {
                // ===== 减仓/卖出 =====
                const sellAmount = p * q - fee;
                const remainingQty = parseFloat(investment.quantity) - q;
                const costRatio = parseFloat(investment.quantity) > 0 ? (q / parseFloat(investment.quantity)) : 0;
                const reducedCost = parseFloat(investment.total_cost) * costRatio;
                const newTotalCost = parseFloat(investment.total_cost) - reducedCost;
                const newCurrentValue = remainingQty * parseFloat(investment.current_price || p);

                const sellInvTxn = await conn.query(
                    `INSERT INTO investment_transactions (user_id, investment_id, type, amount, price, quantity, date, note)
                     VALUES (?, ?, 'sell', ?, ?, ?, ?, ?)`,
                    [req.userId, id, sellAmount, p, q, date || new Date().toISOString().split('T')[0], note || '部分卖出']
                );
                await conn.query(
                    `UPDATE investments SET quantity=?, total_cost=?, current_value=?, status=? WHERE id=? AND user_id=?`,
                    [remainingQty, newTotalCost, newCurrentValue, remainingQty > 0 ? 'holding' : 'sold', id, req.userId]
                );
                if (investment.account_id) {
                    const profit = sellAmount - reducedCost;
                    const sellCatId = await getInvestmentSellCategoryId(conn);
                    await conn.query(
                        `INSERT INTO transactions (user_id, account_id, category_id, type, amount, note, date, investment_txn_id)
           VALUES (?, ?, ?, 'income', ?, ?, ?, ?)`,
                        [req.userId, investment.account_id, sellCatId, sellAmount, `卖出${investment.name}${remainingQty > 0 ? '（部分）' : '（清仓）'}，盈亏${profit >= 0 ? '+' : ''}${profit.toFixed(2)}`, date || new Date().toISOString().split('T')[0], sellInvTxn.insertId]
                    );
                    // 以账本为准重算账户余额
                    const newBalance = await computeAccountBalance(conn, req.userId, investment.account_id);
                    await conn.query('UPDATE accounts SET balance = $1 WHERE id = $2', [newBalance, investment.account_id]);
                }
                res.json(success(null, remainingQty > 0 ? '已减仓' : '已清仓'));
            }
        });
    } catch (err) {
        handleServerError(res, err);
    }
});

// 删除理财持仓
router.delete('/investments/:id', async (req, res) => {
    try {
        await db.transaction(async (conn) => {
            const invRows = await conn.query('SELECT * FROM investments WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
            const inv = invRows[0] || null;
            // 回滚创建持仓时生成的台账交易（恢复账户余额）
            if (inv && inv.create_transaction_id) {
                await rollbackInvestmentCreateTxn(conn, req.userId, inv.create_transaction_id, inv.account_id);
            }
            await conn.query('DELETE FROM investment_transactions WHERE investment_id = $1 AND user_id = $2', [req.params.id, req.userId]);
            await conn.query('DELETE FROM investments WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
        });
        res.json(success(null, '持仓已删除'));
    } catch (err) {
        handleServerError(res, err);
    }
});
// 查询单个代码行情（自动识别类型）
router.get('/quote', async (req, res) => {
    try {
        const { code, category } = req.query;
        if (!code) return res.status(400).json(fail('请提供产品代码'));
        const c = String(code).trim();
        // category 可以是 fund/stock/deposit/other，默认 fund
        const invCategory = category || 'fund';
        const data = await fetchQuoteByCategory(invCategory, c, { withName: true });
        return res.json(success({ type: data.source, ...data }));
    } catch (err) {
        console.error('[行情查询]', err.message);
        res.status(502).json(fail('行情查询失败：' + err.message));
    }
});

// 刷新单个持仓行情
router.post('/:id/refresh', async (req, res) => {
    try {
        const inv = await db.queryOne(
            `SELECT i.*, it.category as type_category
             FROM investments i JOIN investment_types it ON i.investment_type_id = it.id
             WHERE i.id = ? AND i.user_id = ?`,
            [req.params.id, req.userId]
        );
        if (!inv) return res.status(404).json(fail('持仓不存在'));
        if (!inv.code || !String(inv.code).trim()) return res.status(400).json(fail('该持仓无产品代码'));

        const strategy = getQuoteStrategy(inv.type_category, inv.code);
        if (!strategy) return res.status(400).json(fail('该品类不支持行情查询'));
        // 统一使用 market-data.js 的 fetchPriceForInvestment
        const { price, navDate, name } = await fetchPriceForInvestment(inv);

        const qty = parseFloat(inv.quantity);
        const currentValue = price * qty;
        const totalCost = parseFloat(inv.total_cost);
        const actualRate = totalCost > 0 ? ((currentValue - totalCost) / totalCost * 100) : 0;

        await db.query(
            'UPDATE investments SET current_price=$1, current_value=$2, actual_rate=$3, nav_date=$4 WHERE id=$5 AND user_id=$6',
            [price, currentValue, actualRate, navDate || null, inv.id, req.userId]
        );

        res.json(success({
            id: inv.id, name: name || inv.name,
            current_price: price, current_value: currentValue,
            actual_rate: actualRate, nav_date: navDate
        }, '行情已更新'));
    } catch (err) {
        console.error('[刷新持仓]', err.message);
        res.status(502).json(fail('行情刷新失败：' + err.message));
    }
});

// 一键刷新全部持仓行情
router.post('/refresh-all', async (req, res) => {
    try {
        const investments = await db.query(
            `SELECT i.*, it.category as type_category
             FROM investments i JOIN investment_types it ON i.investment_type_id = it.id
             WHERE i.user_id = ? AND i.status = 'holding' AND i.code IS NOT NULL AND i.code != ''`,
            [req.userId]
        );
        if (investments.length === 0) return res.json(success({ updated: 0, results: [] }, '无需要刷新的持仓'));

        const results = [];
        for (const inv of investments) {
            try {
                const strategy = getQuoteStrategy(inv.type_category, inv.code);
                if (!strategy) {
                    results.push({ id: inv.id, code: inv.code, status: 'skipped', reason: '该品类不支持行情查询' });
                    continue;
                }
                const { price, navDate, name } = await fetchPriceForInvestment(inv);

                const qty = parseFloat(inv.quantity);
                const currentValue = price * qty;
                const totalCost = parseFloat(inv.total_cost);
                const actualRate = totalCost > 0 ? ((currentValue - totalCost) / totalCost * 100) : 0;

                await db.query(
                    'UPDATE investments SET current_price=$1, current_value=$2, actual_rate=$3, nav_date=$4 WHERE id=$5 AND user_id=$6',
                    [price, currentValue, actualRate, navDate || null, inv.id, req.userId]
                );
                results.push({ id: inv.id, code: inv.code, name: name || inv.name, price, currentValue, actualRate, navDate, status: 'ok' });
            } catch (e) {
                results.push({ id: inv.id, code: inv.code, status: 'error', reason: e.message });
            }
        }
        const updated = results.filter(r => r.status === 'ok').length;
        res.json(success({ updated, results }, `已更新 ${updated}/${investments.length} 个持仓`));
    } catch (err) {
        handleServerError(res, err, '批量刷新行情');
    }
});

module.exports = router;
// 导出内部 helper 供集成测试验证台账一致性
module.exports.createInvestmentCreateTxn = createInvestmentCreateTxn;
module.exports.rollbackInvestmentCreateTxn = rollbackInvestmentCreateTxn;
