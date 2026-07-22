/* ============================================
   鑫钱包 · 理财管理路由模块
   包含：理财类型 CRUD、持仓管理、行情 API
   ============================================ */

const express = require('express');
const https = require('https');
const http = require('http');
const db = require('../db');
const { toNumber } = require('../validate');
const { success, fail, handleServerError, fmtDateOnly, fmtDateTime, ensureWeeklySnapshots } = require('./_helpers');
const quoteCache = require('../services/quote-cache');

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

// 更新理财类型
router.put('/:id', async (req, res) => {
    try {
        const { name, icon, risk_level, description, category } = req.body;
        await db.query(
            `UPDATE investment_types SET name=?, icon=?, risk_level=?, description=?, category=? WHERE id=?`,
            [name, icon, risk_level, description, category, req.params.id]
        );
        res.json(success(null, '类型已更新'));
    } catch (err) {
        handleServerError(res, err);
    }
});

// 删除理财类型
router.delete('/:id', async (req, res) => {
    try {
        const count = await db.queryOne(
            'SELECT COUNT(*) as cnt FROM investments WHERE investment_type_id = ?',
            [req.params.id]
        );
        if (count.cnt > 0) return res.status(400).json(fail('该类型下仍有持仓，无法删除'));
        
        await db.query('DELETE FROM investment_types WHERE id = ?', [req.params.id]);
        res.json(success(null, '类型已删除'));
    } catch (err) {
        handleServerError(res, err);
    }
});

// 获取所有持仓
// 理财进阶指标：单持仓年化收益率（基于买入日持有期）
function calcAnnualizedRate(totalCost, currentValue, buyDate) {
    const c = parseFloat(totalCost), v = parseFloat(currentValue);
    if (!(c > 0) || !(v > 0) || !buyDate) return 0;
    const start = new Date(buyDate);
    if (isNaN(start.getTime())) return 0;
    const days = (Date.now() - start.getTime()) / 86400000;
    if (days <= 0) return 0;
    return (Math.pow(v / c, 365 / days) - 1) * 100;
}
// 组合进阶指标：年化、集中度(top1 占比)、预期收益加权
function calcPortfolioMetrics(investments) {
    const tCost = investments.reduce((s, i) => s + parseFloat(i.total_cost), 0);
    const tVal = investments.reduce((s, i) => s + parseFloat(i.current_value), 0);
    const earliest = investments.reduce((min, i) => {
        const d = i.buy_date ? new Date(i.buy_date) : null;
        return (d && (!min || d < min)) ? d : min;
    }, null);
    const days = earliest ? Math.max((Date.now() - earliest.getTime()) / 86400000, 1) : 0;
    const annualizedRate = (tCost > 0 && tVal > 0 && days > 0) ? (Math.pow(tVal / tCost, 365 / days) - 1) * 100 : 0;
    const maxHolding = investments.reduce((m, i) => Math.max(m, parseFloat(i.current_value)), 0);
    const concentration = tVal > 0 ? (maxHolding / tVal * 100) : 0;
    const expectedRateAvg = tCost > 0
        ? investments.reduce((s, i) => s + (parseFloat(i.expected_rate || 0) * parseFloat(i.total_cost)), 0) / tCost : 0;
    return {
        totalCost: tCost, totalValue: tVal, totalProfit: tVal - tCost,
        annualizedRate: Math.round(annualizedRate * 100) / 100,
        concentration: Math.round(concentration * 10) / 10,
        expectedRateAvg: Math.round(expectedRateAvg * 100) / 100
    };
}

router.get('/investments', async (req, res) => {
    try {
        const investments = await db.query(
            `SELECT i.*, it.name as type_name, it.icon as type_icon, it.risk_level,
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

// 理财趋势数据（折线图：各持仓市值变化 + 柱状图：按类型投入 vs 市值）
router.get('/stats/investments', async (req, res) => {
    try {
        // 所有持仓
        const investments = await db.query(
            `SELECT i.*, it.name as type_name, it.icon as type_icon
       FROM investments i
       JOIN investment_types it ON i.investment_type_id = it.id
       WHERE i.user_id = ? AND i.status = 'holding'
       ORDER BY i.current_value DESC`,
            [req.userId]
        );

        // 理财净值快照 — 确保本周已有快照（每周日快照，周一~周六可创建到最近周日）
        await ensureWeeklySnapshots(req.userId, investments);

        // 从快照表获取趋势数据
        const trendSeries = [];
        for (const inv of investments) {
            const snaps = await db.query(
                `SELECT nav_date, total_value, total_cost FROM investment_snapshots
         WHERE user_id = ? AND investment_id = ?
         ORDER BY nav_date ASC`,
                [req.userId, inv.id]
            );

            const points = snaps.map(s => ({
                date: s.nav_date instanceof Date ? s.nav_date.toISOString().slice(0, 10) : String(s.nav_date).slice(0, 10),
                value: parseFloat(s.total_value)
            }));

            if (points.length > 0) {
                trendSeries.push({
                    id: inv.id,
                    name: inv.name,
                    type_name: inv.type_name,
                    type_icon: inv.type_icon,
                    total_cost: parseFloat(inv.total_cost),
                    current_value: parseFloat(inv.current_value),
                    profit_rate: parseFloat(inv.total_cost) > 0
                        ? ((parseFloat(inv.current_value) - parseFloat(inv.total_cost)) / parseFloat(inv.total_cost) * 100)
                        : 0,
                    points
                });
            }
        }

        // 按类型汇总（柱状图数据）
        const byType = {};
        investments.forEach(i => {
            const key = i.type_name;
            if (!byType[key]) {
                byType[key] = { type_name: key, icon: i.type_icon, total_cost: 0, total_value: 0, count: 0 };
            }
            byType[key].total_cost += parseFloat(i.total_cost);
            byType[key].total_value += parseFloat(i.current_value);
            byType[key].count++;
        });

        res.json(success({
            trendSeries,
            byType: Object.values(byType).sort((a, b) => b.total_value - a.total_value),
            summary: calcPortfolioMetrics(investments)
        }));
    } catch (err) {
        handleServerError(res, err);
    }
});

// 新增理财持仓
router.post('/investments', async (req, res) => {
    try {
        const { account_id, investment_type_id, name, code, buy_price, current_price, quantity, total_cost, current_value, fee, buy_date, expected_rate, note } = req.body;

        if (!name || !investment_type_id) return res.status(400).json(fail('参数不完整'));

        const feeVal = parseFloat(fee) || 0;
        const costVal = parseFloat(total_cost) || 0;
        const valueVal = parseFloat(current_value) || costVal || 0;

        const result = await db.query(
            `INSERT INTO investments (user_id, account_id, investment_type_id, name, code, buy_price, current_price, quantity, total_cost, current_value, fee, buy_date, expected_rate, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [req.userId, parseInt(account_id) || null, parseInt(investment_type_id), name, code || '',
                parseFloat(buy_price) || 0, parseFloat(current_price) || parseFloat(buy_price) || 0,
                parseFloat(quantity) || 0, costVal,
                valueVal,
                feeVal,
                buy_date || new Date().toISOString().split('T')[0], parseFloat(expected_rate) || 0, note || '']
        );

        // 记录买入操作
        await db.query(
            `INSERT INTO investment_transactions (user_id, investment_id, type, amount, price, quantity, date, note)
       VALUES (?, ?, 'buy', ?, ?, ?, ?, '初始买入')`,
            [req.userId, result.insertId, costVal, parseFloat(buy_price) || 0, parseFloat(quantity) || 0, buy_date || new Date().toISOString().split('T')[0]]
        );

        res.json(success({ id: result.insertId }, '理财持仓已添加'));
    } catch (err) {
        handleServerError(res, err);
    }
});

// 更新理财持仓（编辑/刷新行情）
router.put('/investments/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { account_id, investment_type_id, name, code, buy_price, current_price, quantity, total_cost, current_value, fee, buy_date, expected_rate, actual_rate, note, status } = req.body;

        // 区分行情刷新（仅 current_price/current_value/actual_rate）和完整编辑
        const isQuoteRefresh = name === undefined;

        if (isQuoteRefresh) {
            await db.query(
                'UPDATE investments SET current_price=?, current_value=?, actual_rate=? WHERE id=? AND user_id=?',
                [parseFloat(current_price) || 0, parseFloat(current_value) || 0, parseFloat(actual_rate) || 0, id, req.userId]
            );
        } else {
            await db.query(
                `UPDATE investments SET
                    account_id=?, investment_type_id=?, name=?, code=?,
                    buy_price=?, current_price=?, quantity=?, total_cost=?, current_value=?, fee=?,
                    buy_date=?, expected_rate=?, actual_rate=?, note=?, status=?
                 WHERE id=? AND user_id=?`,
                [
                    parseInt(account_id) || null, parseInt(investment_type_id), name, code || '',
                    parseFloat(buy_price) || 0, parseFloat(current_price) || 0,
                    parseFloat(quantity) || 0, parseFloat(total_cost) || 0, parseFloat(current_value) || 0, parseFloat(fee) || 0,
                    buy_date || new Date().toISOString().split('T')[0],
                    parseFloat(expected_rate) || 0, parseFloat(actual_rate) || 0,
                    note || '', status || 'holding', id, req.userId
                ]
            );
        }
        res.json(success(null, '持仓已更新'));
    } catch (err) {
        handleServerError(res, err);
    }
});

// 理财交易记录（卖出/分红等）
router.post('/investments/:id/transactions', async (req, res) => {
    try {
        const { type, amount, price, quantity, date, note } = req.body;
        const investmentId = parseInt(req.params.id);

        await db.query(
            `INSERT INTO investment_transactions (user_id, investment_id, type, amount, price, quantity, date, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [req.userId, investmentId, type, parseFloat(amount), parseFloat(price) || 0, parseFloat(quantity) || 0, date, note || '']
        );

        // 如果是卖出，更新持仓
        if (type === 'sell') {
            await db.query(
                'UPDATE investments SET quantity = quantity - ?, current_value = current_value - ? WHERE id = ?',
                [parseFloat(quantity), parseFloat(amount), investmentId]
            );
        }

        // 如果是分红/利息，记录到主交易
        if (type === 'dividend' || type === 'interest') {
            const investment = await db.queryOne('SELECT * FROM investments WHERE id = ?', [investmentId]);
            if (investment && investment.account_id) {
                await db.transaction(async (conn) => {
                    await conn.query(
                        `INSERT INTO transactions (user_id, account_id, category_id, type, amount, note, date)
             VALUES (?, ?, 17, 'income', ?, ?, ?)`,
                        [req.userId, investment.account_id, parseFloat(amount), `${type === 'dividend' ? '分红' : '利息'}-${investment.name}`, date]
                    );
                    await conn.query(
                        'UPDATE accounts SET balance = balance + ? WHERE id = ?',
                        [parseFloat(amount), investment.account_id]
                    );
                });
            }
        }

        res.json(success(null, '操作已记录'));
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
            await conn.query(
                `INSERT INTO investment_transactions (user_id, investment_id, type, amount, price, quantity, date, note)
         VALUES (?, ?, 'sell', ?, ?, ?, ?, ?)`,
                [req.userId, id, sellAmount, parseFloat(sell_price), parseFloat(investment.quantity), date || new Date().toISOString().split('T')[0], note || '清仓卖出']
            );

            // 更新持仓状态
            await conn.query(
                `UPDATE investments SET current_price=?, current_value=?, quantity=0, status='sold' WHERE id=?`,
                [parseFloat(sell_price), sellAmount, id]
            );

            // 记录到主交易（如果关联了账户）
            if (investment.account_id) {
                const profit = sellAmount - parseFloat(investment.total_cost);
                await conn.query(
                    `INSERT INTO transactions (user_id, account_id, category_id, type, amount, note, date)
           VALUES (?, ?, 17, 'income', ?, ?, ?)`,
                    [req.userId, investment.account_id, sellAmount, `卖出${investment.name}，盈亏${profit >= 0 ? '+' : ''}${profit.toFixed(2)}`, date || new Date().toISOString().split('T')[0]]
                );
                await conn.query('UPDATE accounts SET balance = balance + ? WHERE id = ?', [sellAmount, investment.account_id]);
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

                await conn.query(
                    `INSERT INTO investment_transactions (user_id, investment_id, type, amount, price, quantity, date, note)
                     VALUES (?, ?, 'buy', ?, ?, ?, ?, ?)`,
                    [req.userId, id, buyAmount, p, q, date || new Date().toISOString().split('T')[0], note || '加仓']
                );
                await conn.query(
                    `UPDATE investments SET quantity=?, total_cost=?, current_value=?, buy_price=?, status=? WHERE id=?`,
                    [newQty, newTotalCost, newCurrentValue, avgCost, 'holding', id]
                );
                if (investment.account_id) {
                    await conn.query(
                        `INSERT INTO transactions (user_id, account_id, category_id, type, amount, note, date)
                         VALUES (?, ?, 17, 'expense', ?, ?, ?)`,
                        [req.userId, investment.account_id, buyAmount, `加仓${investment.name} ${q}份 @ ${p}`, date || new Date().toISOString().split('T')[0]]
                    );
                    await conn.query('UPDATE accounts SET balance = balance - ? WHERE id = ?', [buyAmount, investment.account_id]);
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

                await conn.query(
                    `INSERT INTO investment_transactions (user_id, investment_id, type, amount, price, quantity, date, note)
                     VALUES (?, ?, 'sell', ?, ?, ?, ?, ?)`,
                    [req.userId, id, sellAmount, p, q, date || new Date().toISOString().split('T')[0], note || '部分卖出']
                );
                await conn.query(
                    `UPDATE investments SET quantity=?, total_cost=?, current_value=?, status=? WHERE id=?`,
                    [remainingQty, newTotalCost, newCurrentValue, remainingQty > 0 ? 'holding' : 'sold', id]
                );
                if (investment.account_id) {
                    const profit = sellAmount - reducedCost;
                    await conn.query(
                        `INSERT INTO transactions (user_id, account_id, category_id, type, amount, note, date)
                         VALUES (?, ?, 17, 'income', ?, ?, ?)`,
                        [req.userId, investment.account_id, sellAmount, `卖出${investment.name}${remainingQty > 0 ? '（部分）' : '（清仓）'}，盈亏${profit >= 0 ? '+' : ''}${profit.toFixed(2)}`, date || new Date().toISOString().split('T')[0]]
                    );
                    await conn.query('UPDATE accounts SET balance = balance + ? WHERE id = ?', [sellAmount, investment.account_id]);
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
        await db.query('DELETE FROM investment_transactions WHERE investment_id = ?', [req.params.id]);
        await db.query('DELETE FROM investments WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
        res.json(success(null, '持仓已删除'));
    } catch (err) {
        handleServerError(res, err);
    }
});

// ==========================================
// 理财行情 API（代理外部数据源）
// ==========================================

// 通用 HTTP GET 请求封装（支持 http 和 https，支持 GBK 解码）
function httpGet(url, timeout = 8000) {
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;
        const req = client.get(url, { timeout }, (resp) => {
            if (resp.statusCode >= 300 && resp.statusCode < 400 && resp.headers.location) {
                httpGet(resp.headers.location, timeout).then(resolve).catch(reject);
                return;
            }
            const chunks = [];
            resp.on('data', chunk => chunks.push(chunk));
            resp.on('end', () => resolve(Buffer.concat(chunks)));
        });
        req.on('timeout', () => { req.destroy(); reject(new Error('请求超时')); });
        req.on('error', reject);
    });
}

// 自动识别代码类型
function detectCodeType(code) {
    const c = String(code).trim();
    if (/^s[hz]\d{6}$/i.test(c)) return { type: 'stock', code: c };
    if (/^\d{6}$/.test(c)) return { type: 'fund', code: c };
    return { type: 'unknown', code: c };
}

// 根据理财类型品类 + 代码决定行情查询方式
function getQuoteStrategy(invTypeCategory, code) {
    const c = String(code || '').trim();
    if (!c) return null;
    // 定期/存款/其他 → 不查行情
    if (invTypeCategory === 'deposit' || invTypeCategory === 'other') return null;
    // 股票类型 → 走腾讯证券
    if (invTypeCategory === 'stock') {
        const prefix = /^s[hz]/i.test(c) ? c.substring(0, 2).toLowerCase() : 'sh';
        const numCode = c.replace(/^s[hz]/i, '');
        return { type: 'stock', code: prefix + numCode };
    }
    // 基金类型 → 走天天基金（纯数字）；非纯数字尝试股票
    if (invTypeCategory === 'fund') {
        if (/^\d{6}$/.test(c)) return { type: 'fund', code: c };
        // 带前缀的 → 尝试股票
        if (/^s[hz]/i.test(c)) return { type: 'stock', code: c };
        return { type: 'fund', code: c }; // fallback
    }
    // 默认：自动识别
    const detected = detectCodeType(c);
    if (detected.type === 'unknown') return null;
    return detected;
}

// 查询基金行情（天天基金 fundgz）
async function fetchFundQuote(code) {
    const ts = Date.now();
    const url = `http://fundgz.1234567.com.cn/js/${code}.js?rt=${ts}`;
    const buf = await httpGet(url, 6000);
    const raw = buf.toString('utf8');
    // 格式: jsonpgz({...});
    const jsonMatch = raw.match(/\{.*\}/s);
    if (!jsonMatch) throw new Error('基金数据解析失败');
    // 过滤掉一些非 JSON 前缀（如 jsonpgz 的函数名等）
    let jsonStr = jsonMatch[0].trim();
    if (!jsonStr.startsWith('{')) {
        const braceMatch = jsonStr.match(/\{.*\}/s);
        if (!braceMatch) throw new Error('基金数据解析失败');
        jsonStr = braceMatch[0];
    }
    const d = JSON.parse(jsonStr);
    return {
        code: d.fundcode || code,
        name: d.name || '',
        nav: parseFloat(d.dwjz) || 0,
        navDate: d.jzrq || '',
        estimatedNav: parseFloat(d.gsz) || 0,
        estimatedChange: parseFloat(d.gszzl) || 0,
        lastNav: parseFloat(d.dwjz) || 0
    };
}

// 查询股票行情（腾讯证券，GBK 编码）
async function fetchStockQuote(code) {
    const url = `https://qt.gtimg.cn/q=${code}`;
    const buf = await httpGet(url, 6000);
    // 腾讯接口返回 GBK，用 iconv-lite 解码
    let raw;
    try {
        raw = require('iconv-lite').decode(buf, 'gbk');
    } catch (_) {
        raw = buf.toString('utf8');
    }
    // 格式: v_sh600519="1~贵州茅台~600519~..."
    const vMatch = raw.match(/="([^"]+)"/);
    if (!vMatch) throw new Error('股票数据解析失败');
    const parts = vMatch[1].split('~');
    if (parts.length < 35) throw new Error('股票数据字段不足');
    return {
        code: parts[2] || code,
        name: parts[1] || '',
        price: parseFloat(parts[3]) || 0,
        change: parseFloat(parts[31]) || 0,
        changePercent: parseFloat(parts[32]) || 0,
        high: parseFloat(parts[33]) || 0,
        low: parseFloat(parts[34]) || 0,
        open: parseFloat(parts[5]) || 0
    };
}

// 查询单个代码行情（自动识别类型）
router.get('/investments/quote', async (req, res) => {
    try {
        const { code, category } = req.query;
        if (!code) return res.status(400).json(fail('请提供产品代码'));
        const c = String(code).trim();
        // category 可以是 fund/stock/deposit/other，默认自动识别
        const invCategory = category || 'fund';
        const strategy = getQuoteStrategy(invCategory, c);
        if (!strategy) return res.status(400).json(fail('无法识别代码格式或该品类不支持行情查询'));

        if (strategy.type === 'fund') {
            const data = await fetchFundQuote(strategy.code);
            return res.json(success({ type: 'fund', ...data }));
        } else {
            const data = await fetchStockQuote(strategy.code);
            return res.json(success({ type: 'stock', ...data }));
        }
    } catch (err) {
        console.error('[行情查询]', err.message);
        res.status(502).json(fail('行情查询失败：' + err.message));
    }
});

// 刷新单个持仓行情
router.post('/investments/:id/refresh', async (req, res) => {
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
        let price, navDate, name;
        if (strategy.type === 'fund') {
            const q = await fetchFundQuote(strategy.code);
            price = q.estimatedNav || q.nav;
            navDate = q.navDate;
            name = q.name;
        } else {
            const q = await fetchStockQuote(strategy.code);
            price = q.price;
            navDate = new Date().toISOString().slice(0, 10);
            name = q.name;
        }

        const qty = parseFloat(inv.quantity);
        const currentValue = price * qty;
        const totalCost = parseFloat(inv.total_cost);
        const actualRate = totalCost > 0 ? ((currentValue - totalCost) / totalCost * 100) : 0;

        await db.query(
            'UPDATE investments SET current_price=?, current_value=?, actual_rate=?, nav_date=? WHERE id=?',
            [price, currentValue, actualRate, navDate || null, inv.id]
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
router.post('/investments/refresh-all', async (req, res) => {
    try {
        const investments = await db.query(
            `SELECT i.*, it.category as type_category
             FROM investments i JOIN investment_types it ON i.investment_type_id = it.id
             WHERE i.user_id = ? AND i.status = "holding" AND i.code IS NOT NULL AND i.code != ""`,
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
                let price, navDate, name;
                if (strategy.type === 'fund') {
                    const q = await fetchFundQuote(strategy.code);
                    price = q.estimatedNav || q.nav;
                    navDate = q.navDate;
                    name = q.name;
                } else {
                    const q = await fetchStockQuote(strategy.code);
                    price = q.price;
                    navDate = new Date().toISOString().slice(0, 10);
                    name = q.name;
                }

                const qty = parseFloat(inv.quantity);
                const currentValue = price * qty;
                const totalCost = parseFloat(inv.total_cost);
                const actualRate = totalCost > 0 ? ((currentValue - totalCost) / totalCost * 100) : 0;

                await db.query(
                    'UPDATE investments SET current_price=?, current_value=?, actual_rate=?, nav_date=? WHERE id=?',
                    [price, currentValue, actualRate, navDate || null, inv.id]
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
