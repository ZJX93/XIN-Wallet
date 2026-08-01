// ==========================================
// 综合报表 API
// ==========================================

const express = require('express');
const router = express.Router();
const db = require('../db');
const { success, fail, handleServerError, fmtDateOnly } = require('./_helpers');

// ==========================================
// 轻量内存缓存：避免同一周期内重复聚合
// ==========================================
// 报表端点一次性聚合 15+ 条查询（transactions / accounts / investments / debts / budgets
// 以及资产负债表与现金流量表）。仪表盘往往在同一周期反复拉取，短 TTL 缓存可直接吃掉重复聚合，
// 把"数据库 15+ 次查询"降为"命中缓存时 0 次查询"。
// - TTL 默认 30s：个人财务数据近实时，30s 陈旧可忽略；可通过 ?fresh=1 强制刷新。
// - 按 userId 隔离键，杜绝跨用户数据泄漏；仅缓存成功结果，不缓存异常。
// - 单容器部署（docker-compose 单 app 实例）下内存缓存有效；多实例需换为共享缓存（如 Redis）。
const REPORT_CACHE_TTL_MS = 30 * 1000;
const REPORT_CACHE_MAX = 200;
const reportCache = new Map();

function reportCacheKey(userId, type, period) {
    return `${userId}:${type}:${period}`;
}

function getCachedReport(key) {
    const hit = reportCache.get(key);
    if (!hit) return null;
    if (hit.expires > Date.now()) return hit.data;
    reportCache.delete(key); // 过期则顺手清理
    return null;
}

function setCachedReport(key, data) {
    reportCache.set(key, { data, expires: Date.now() + REPORT_CACHE_TTL_MS });
    // 容量保护：超过上限时清理最旧的一部分，避免长会话内存膨胀
    if (reportCache.size > REPORT_CACHE_MAX) {
        const oldKeys = Array.from(reportCache.keys()).slice(0, 50);
        oldKeys.forEach(k => reportCache.delete(k));
    }
}

// ==========================================
// 辅助函数
// ==========================================

function fmtDateISO(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function lastDayOfMonth(y, m) {
    return new Date(y, m, 0).getDate();
}

function parseReportPeriod(type, period) {
    if (type === 'monthly') {
        const match = period.match(/^(\d{4})-(\d{2})$/);
        if (!match) throw new Error('月份格式错误');
        const y = parseInt(match[1]), m = parseInt(match[2]);
        return {
            start: `${y}-${String(m).padStart(2, '0')}-01`,
            end: `${y}-${String(m).padStart(2, '0')}-${lastDayOfMonth(y, m)}`,
            label: `${y}年${m}月`
        };
    }
    if (type === 'quarterly') {
        const match = period.match(/^(\d{4})-Q(\d)$/);
        if (!match) throw new Error('季度格式错误');
        const y = parseInt(match[1]), q = parseInt(match[2]);
        const sm = (q - 1) * 3 + 1, em = q * 3;
        return {
            start: `${y}-${String(sm).padStart(2, '0')}-01`,
            end: `${y}-${String(em).padStart(2, '0')}-${lastDayOfMonth(y, em)}`,
            label: `${y}年 Q${q}`
        };
    }
    if (type === 'annual') {
        if (!/^\d{4}$/.test(period)) throw new Error('年份格式错误');
        const y = parseInt(period);
        return { start: `${y}-01-01`, end: `${y}-12-31`, label: `${y}年` };
    }
    throw new Error('不支持的报表类型');
}

function prevPeriod(type, period) {
    if (type === 'monthly') {
        const [y, m] = period.split('-').map(Number);
        const d = new Date(y, m - 2, 1);
        return { type: 'monthly', period: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` };
    }
    if (type === 'quarterly') {
        const match = period.match(/^(\d{4})-Q(\d)$/);
        let y = parseInt(match[1]), q = parseInt(match[2]);
        q--;
        if (q < 1) { y--; q = 4; }
        return { type: 'quarterly', period: `${y}-Q${q}` };
    }
    if (type === 'annual') {
        return { type: 'annual', period: String(parseInt(period) - 1) };
    }
    return null;
}

function monthsInRange(start, end) {
    const months = [];
    const [sy, sm] = start.split('-').map(Number);
    const [ey, em] = end.split('-').map(Number);
    let y = sy, m = sm;
    while (y < ey || (y === ey && m <= em)) {
        months.push(`${y}-${String(m).padStart(2, '0')}`);
        m++;
        if (m > 12) { m = 1; y++; }
    }
    return months;
}

function daysInRange(start, end) {
    const a = new Date(start), b = new Date(end);
    return Math.max(1, Math.round((b - a) / (1000 * 60 * 60 * 24)) + 1);
}

async function buildReport(userId, type, period) {
    const range = parseReportPeriod(type, period);
    const start = range.start, end = range.end;
    const days = daysInRange(start, end);
    const periodMonths = monthsInRange(start, end);

    const prev = prevPeriod(type, period);
    const prevRange = prev ? parseReportPeriod(prev.type, prev.period) : null;
    const hasMonths = periodMonths.length > 0;

    // 性能优化：原实现串行执行约 13 次 DB 查询（接口延迟≈各查询耗时之和）。
    // 这些查询彼此独立、仅依赖 userId/start/end 等已知参数，统一用 Promise.all 并发执行，
    // 接口延迟降为「最慢一次查询」，在交易量大时收益明显。输出结构与重构前完全一致。
    const [
        summaryRow, dailyRows, expByCat, incByCat, accountFlows, topExpenses,
        budgetRows, actualByBudgetCat,
        accountAssets, invAssets,
        prevRow,
        debtAll, debtRepayments,
    ] = await Promise.all([
        db.queryOne(
            `SELECT
                COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as income,
                COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as expense,
                COUNT(*) as tx_count
             FROM transactions
             WHERE user_id = ? AND date >= ? AND date <= ? AND type IN ('expense','income','transfer_in','transfer_out')`,
            [userId, start, end]
        ),
        db.query(
            `SELECT TO_CHAR(date, 'YYYY-MM-DD') as date,
                COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as income,
                COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as expense
             FROM transactions
             WHERE user_id = ? AND date >= ? AND date <= ? AND type IN ('expense','income','transfer_in','transfer_out')
             GROUP BY TO_CHAR(date, 'YYYY-MM-DD') ORDER BY date`,
            [userId, start, end]
        ),
        db.query(
            `SELECT c.id, c.name, c.icon, COALESCE(SUM(t.amount), 0) as total
             FROM transactions t JOIN categories c ON t.category_id = c.id
             WHERE t.user_id = ? AND t.type = 'expense' AND t.date >= ? AND t.date <= ?
             GROUP BY c.id ORDER BY total DESC`,
            [userId, start, end]
        ),
        db.query(
            `SELECT c.id, c.name, c.icon, COALESCE(SUM(t.amount), 0) as total
             FROM transactions t JOIN categories c ON t.category_id = c.id
             WHERE t.user_id = ? AND t.type = 'income' AND t.date >= ? AND t.date <= ?
             GROUP BY c.id ORDER BY total DESC`,
            [userId, start, end]
        ),
        db.query(
            `SELECT a.id, a.name, a.icon, a.type,
                COALESCE(SUM(CASE WHEN t.type IN ('income','transfer_in') THEN t.amount ELSE -t.amount END), 0) as net
             FROM transactions t JOIN accounts a ON t.account_id = a.id
             WHERE t.user_id = ? AND t.date >= ? AND t.date <= ? AND t.type IN ('expense','income','transfer_in','transfer_out')
             GROUP BY a.id, a.name, a.icon, a.type
             ORDER BY ABS(COALESCE(SUM(CASE WHEN t.type IN ('income','transfer_in') THEN t.amount ELSE -t.amount END), 0)) DESC`,
            [userId, start, end]
        ),
        db.query(
            `SELECT t.id, t.date, t.amount, t.note, c.name as category_name, c.icon as category_icon
             FROM transactions t JOIN categories c ON t.category_id = c.id
             WHERE t.user_id = ? AND t.type = 'expense' AND t.date >= ? AND t.date <= ?
             ORDER BY t.amount DESC LIMIT 5`,
            [userId, start, end]
        ),
        // 仅当周期含月份时才查预算（无月份范围时预算执行无意义）
        hasMonths
            ? db.query(
                `SELECT b.id, b.name, b.amount as budget_amount, b.period_type,
                        c.id as cat_id, c.icon
                 FROM budgets b
                 LEFT JOIN categories c ON c.name = b.name AND c.type = 'expense'
                 WHERE b.user_id = ? AND b.start_date <= ? AND b.end_date >= ?
                 ORDER BY b.amount DESC`,
                [userId, end, start]
            )
            : Promise.resolve([]),
        hasMonths
            ? db.query(
                `SELECT c.id, COALESCE(SUM(t.amount), 0) as actual
                 FROM transactions t JOIN categories c ON t.category_id = c.id
                 WHERE t.user_id = ? AND t.type = 'expense' AND t.date >= ? AND t.date <= ?
                 GROUP BY c.id`,
                [userId, start, end]
            )
            : Promise.resolve([]),
        db.query(
            'SELECT COALESCE(SUM(balance), 0) as total FROM accounts WHERE user_id = ? AND status = \'active\'',
            [userId]
        ),
        db.queryOne(
            'SELECT COALESCE(SUM(current_value), 0) as total FROM investments WHERE user_id = ? AND status = \'holding\'',
            [userId]
        ),
        prev
            ? db.queryOne(
                `SELECT
                    COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as income,
                    COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as expense
                 FROM transactions
                 WHERE user_id = ? AND date >= ? AND date <= ?`,
                [userId, prevRange.start, prevRange.end]
            )
            : Promise.resolve({ income: 0, expense: 0 }),
        db.query(
            `SELECT id, name, type, principal, remaining, monthly_payment, status, due_date
             FROM debts WHERE user_id = ? AND status != 'paid_off'`,
            [userId]
        ),
        db.query(
            `SELECT debt_id, amount, principal_part, interest_part, paid_at, note
             FROM debt_repayments WHERE user_id = ? AND paid_at >= ? AND paid_at <= ? ORDER BY paid_at DESC`,
            [userId, start, end]
        ),
    ]);

    const income = parseFloat(summaryRow.income);
    const expense = parseFloat(summaryRow.expense);
    const balance = income - expense;

    // 补齐无交易日期
    const trendMap = new Map(dailyRows.map(r => [r.date, { income: parseFloat(r.income), expense: parseFloat(r.expense) }]));
    const dailyTrend = [];
    const cur = new Date(start), last = new Date(end);
    while (cur <= last) {
        const iso = fmtDateISO(cur);
        const v = trendMap.get(iso) || { income: 0, expense: 0 };
        dailyTrend.push({ date: iso, ...v });
        cur.setDate(cur.getDate() + 1);
    }

    // 预算执行（按预算名称匹配类别，按日期范围筛选当期预算）
    let budgetExecution = [];
    if (hasMonths) {
        const actualMap = new Map(actualByBudgetCat.map(r => [r.id, parseFloat(r.actual)]));
        // 按预算名称去重合并（同一名称可能有不同周期的预算，取时间重叠的）
        const seen = new Set();
        for (const b of budgetRows) {
            const key = b.name;
            if (seen.has(key)) continue;
            seen.add(key);
            const actual = (b.cat_id ? actualMap.get(b.cat_id) : 0) || 0;
            const budget = parseFloat(b.budget_amount);
            budgetExecution.push({
                id: b.cat_id || b.id,
                name: b.name,
                icon: b.icon || '💰',
                budget, actual,
                usage: budget > 0 ? (actual / budget * 100) : 0
            });
        }
        budgetExecution = budgetExecution
            .filter(b => b.budget > 0 || b.actual > 0)
            .sort((a, b) => b.actual - a.actual);
    }

    const totalAssets = parseFloat(accountAssets[0].total) + parseFloat(invAssets.total);

    // 环比
    let compare = null;
    if (prev) {
        const pi = parseFloat(prevRow.income), pe = parseFloat(prevRow.expense);
        compare = {
            period: prev.period, label: prevRange.label,
            income: pi, expense: pe, balance: pi - pe
        };
    }

    // 债务数据汇总（本期）—— debtAll / debtRepayments 已在上方 Promise.all 并发获取，此处直接消费
    const repByDebt = {};
    let periodPaid = 0;
    debtRepayments.forEach(r => {
        periodPaid += parseFloat(r.amount);
        (repByDebt[r.debt_id] = repByDebt[r.debt_id] || []).push({
            amount: parseFloat(r.amount),
            principal_part: parseFloat(r.principal_part || 0),
            interest_part: parseFloat(r.interest_part || 0),
            paid_at: r.paid_at.toISOString ? r.paid_at.toISOString().slice(0, 10) : String(r.paid_at).slice(0, 10),
            note: r.note || ''
        });
    });
    const todayStr = new Date().toISOString().slice(0, 10);
    let overdueCount = 0;
    const debtList = debtAll.map(d => {
        const reps = repByDebt[d.id] || [];
        const periodPaidForDebt = reps.reduce((s, r) => s + r.amount, 0);
        if (d.status === 'overdue') overdueCount++;
        return {
            id: d.id,
            name: d.name,
            type: d.type,
            principal: parseFloat(d.principal),
            remaining: parseFloat(d.remaining),
            monthly_payment: parseFloat(d.monthly_payment || 0),
            status: d.status,
            due_date: d.due_date ? (d.due_date.toISOString ? d.due_date.toISOString().slice(0, 10) : String(d.due_date).slice(0, 10)) : null,
            periodRepayments: reps.length,
            periodPaid: Math.round(periodPaidForDebt * 100) / 100
        };
    });
    const totalRemaining = debtList.reduce((s, d) => s + d.remaining, 0);
    const flatRepayments = [];
    Object.keys(repByDebt).forEach(did => {
        const debt = debtAll.find(d => d.id == did);
        repByDebt[did].forEach(r => {
            flatRepayments.push({
                debt_id: parseInt(did),
                debt_name: debt ? debt.name : '',
                amount: r.amount,
                principal_part: r.principal_part,
                interest_part: r.interest_part,
                paid_at: r.paid_at,
                note: r.note
            });
        });
    });

    // 资产负债表与现金流量表彼此独立，与上方查询也无依赖，并发执行进一步压缩延迟
    const [balanceSheet, cashFlow] = await Promise.all([
        buildBalanceSheet(userId, start, end, totalAssets),
        buildCashFlow(userId, start, end, income, expense, periodPaid),
    ]);

    return {
        type, period,
        label: range.label,
        start, end, days,
        summary: {
            income, expense, balance,
            savingsRate: income > 0 ? ((balance / income) * 100) : 0,
            transactionCount: parseInt(summaryRow.tx_count),
            avgDailyExpense: expense / days
        },
        dailyTrend,
        expenseByCategory: expByCat.map(r => ({ ...r, total: parseFloat(r.total) })),
        incomeByCategory: incByCat.map(r => ({ ...r, total: parseFloat(r.total) })),
        accountFlows: accountFlows.map(r => ({ ...r, net: parseFloat(r.net) })),
        topExpenses: topExpenses.map(t => ({ ...t, amount: parseFloat(t.amount) })),
        budgetExecution,
        assets: {
            totalAssets,
            netWorth: totalAssets - totalRemaining,
            accounts: parseFloat(accountAssets[0].total),
            investments: parseFloat(invAssets.total)
        },
        debts: {
            count: debtList.length,
            totalRemaining,
            paidInPeriod: Math.round(periodPaid * 100) / 100,
            repaymentCount: debtRepayments.length,
            overdue: overdueCount,
            list: debtList,
            repayments: flatRepayments
        },
        compare,
        balanceSheet,
        cashFlow,
        // ===== 关键财务比率 =====
        ratios: {
            savingsRate: income > 0 ? Math.round((balance / income * 100) * 10) / 10 : 0,
            debtRatio: totalAssets > 0 ? Math.round((totalRemaining / totalAssets * 100) * 10) / 10 : 0,
            debtPaymentRatio: income > 0 ? Math.round((periodPaid / income * 100) * 10) / 10 : 0,
            assetLiabilityRatio: totalAssets > 0 ? Math.round((totalRemaining / totalAssets * 100) * 10) / 10 : 0,
            currentRatio: totalAssets > 0 ? Math.round((parseFloat(accountAssets[0].total) / Math.max(0.01, totalRemaining)) * 100) / 100 : 0
        }
    };
}

// ==================== 资产负债表（期末快照+期初对比）====================
async function buildBalanceSheet(userId, periodStart, periodEnd, currentTotalAssets) {
    // 资产明细 / 投资持仓 / 长期负债 / 期初前交易净额 —— 彼此独立，并发查询压缩延迟
    const [accounts, investments, longTermDebts, txBefore] = await Promise.all([
        db.query(
            'SELECT id, name, type, balance, credit_limit FROM accounts WHERE user_id = ? AND status = \'active\' ORDER BY balance DESC',
            [userId]
        ),
        db.query(
            `SELECT id, name, total_cost, current_value, investment_type_id FROM investments WHERE user_id = ? AND status = 'holding'`,
            [userId]
        ),
        db.query(
            `SELECT id, name, type, remaining, term_months FROM debts
             WHERE user_id = ? AND status != 'paid_off'
             ORDER BY term_months DESC`,
            [userId]
        ),
        db.queryOne(
            `SELECT
                COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE -amount END), 0) as net,
                COUNT(*) as cnt
             FROM transactions WHERE user_id = ? AND date < ?`,
            [userId, periodStart]
        ),
    ]);

    // 现金 = 余额为正的账户
    const liquidAssets = accounts.filter(a => parseFloat(a.balance) > 0);
    const liquidTotal = liquidAssets.reduce((s, a) => s + parseFloat(a.balance), 0);

    // 投资资产
    const investTotal = investments.reduce((s, i) => s + parseFloat(i.current_value), 0);

    // 流动负债 = 信用卡未用额度（债务表的贷款视作非流动）
    const ccDebt = accounts.filter(a => a.credit_limit).reduce((s, a) => {
        const limit = parseFloat(a.credit_limit) || 0;
        const bal = parseFloat(a.balance) || 0;
        return s + (limit > 0 && bal < limit ? (limit - bal) : 0);
    }, 0);

    // 非流动负债 = 长期贷款（>1年）
    // 长期负债：term >= 12 个月的贷款（含 loan 类型）
    const longTermDebt = longTermDebts.filter(d => (parseInt(d.term_months) || 0) >= 12)
        .reduce((s, d) => s + parseFloat(d.remaining), 0);
    // 短期负债：term < 12 个月 或 term = 0（如个人借款、无期限）且 type != credit_card
    const shortTermDebt = longTermDebts.filter(d => (parseInt(d.term_months) || 0) < 12 && d.type !== 'credit_card')
        .reduce((s, d) => s + parseFloat(d.remaining), 0);
    // 信用卡已用部分 = 信用卡的负债（按 credit_limit 减去可用余额）
    const creditCardLiab = ccDebt;

    const totalLiabilities = longTermDebt + shortTermDebt + creditCardLiab;
    const totalAssets = liquidTotal + investTotal;
    const netWorth = totalAssets - totalLiabilities;

    // 期末/期初对比：通过查 periodStart 之前的资产估算期初
    // 简化方案：期初资产 ≈ 期末 - 净变化（用本期交易净额 + 还款 + 投资变化估算）
    // 为了精确，需要逐账户快照；这里用简化算法（基于本期净额）
    const netBefore = parseFloat(txBefore.net);
    const openingAssets = totalAssets - netBefore; // 极简估算
    const openingNetWorth = openingAssets - totalLiabilities;

    return {
        period: { start: periodStart, end: periodEnd },
        assets: {
            current: {
                items: liquidAssets.map(a => ({
                    name: a.name, type: a.type, balance: parseFloat(a.balance),
                    credit_limit: parseFloat(a.credit_limit) || 0
                })),
                total: Math.round(liquidTotal * 100) / 100
            },
            investment: {
                items: investments.map(i => ({
                    name: i.name, current_value: parseFloat(i.current_value),
                    total_cost: parseFloat(i.total_cost)
                })),
                total: Math.round(investTotal * 100) / 100
            },
            total: Math.round(totalAssets * 100) / 100,
            opening: Math.round(openingAssets * 100) / 100
        },
        liabilities: {
            shortTerm: {
                items: longTermDebts.filter(d => (parseInt(d.term_months) || 0) < 12 && d.type !== 'credit_card').map(d => ({
                    id: d.id, name: d.name, type: d.type, remaining: parseFloat(d.remaining), term_months: d.term_months
                })),
                total: Math.round(shortTermDebt * 100) / 100
            },
            creditCard: {
                total: Math.round(creditCardLiab * 100) / 100,
                note: '信用卡已用额度（credit_limit - 可用余额）'
            },
            longTerm: {
                items: longTermDebts.filter(d => (parseInt(d.term_months) || 0) >= 12 || d.type === 'loan').filter((d, idx, arr) => arr.findIndex(x => x.id === d.id) === idx).map(d => ({
                    id: d.id, name: d.name, type: d.type, remaining: parseFloat(d.remaining), term_months: d.term_months
                })),
                total: Math.round(longTermDebt * 100) / 100
            },
            total: Math.round(totalLiabilities * 100) / 100
        },
        netWorth: Math.round(netWorth * 100) / 100,
        openingNetWorth: Math.round(openingNetWorth * 100) / 100,
        change: Math.round((netWorth - openingNetWorth) * 100) / 100
    };
}

// ==================== 现金流量表（按活动分类）====================
async function buildCashFlow(userId, start, end, income, expense, debtRepayment) {
    // 经营活动：日常收支（expense + income，不含投资交易和转账的净额）
    const operatingIncome = income;
    const operatingExpense = expense;
    const operatingNet = operatingIncome - operatingExpense;

    // 投资活动：投资增减（买入/卖出/新借债务彼此独立，并发查询）
    const [investBuy, investSell, debtNew] = await Promise.all([
        db.query(
            `SELECT COALESCE(SUM(amount), 0) as total FROM investment_transactions
             WHERE user_id = ? AND type = 'buy' AND date BETWEEN ? AND ?`,
            [userId, start, end]
        ),
        db.query(
            `SELECT COALESCE(SUM(amount), 0) as total FROM investment_transactions
             WHERE user_id = ? AND type = 'sell' AND date BETWEEN ? AND ?`,
            [userId, start, end]
        ),
        db.query(
            `SELECT COALESCE(SUM(principal), 0) as total FROM debts
             WHERE user_id = ? AND status != 'paid_off' AND created_at BETWEEN ? AND ?`,
            [userId, start + ' 00:00:00', end + ' 23:59:59']
        ),
    ]);
    const investInflow = parseFloat(investSell[0]?.total || 0);  // 卖出 = 现金流入
    const investOutflow = parseFloat(investBuy[0]?.total || 0);  // 买入 = 现金流出
    const investNet = investInflow - investOutflow; // 正数表示投资变现>投入

    // 筹资活动：债务增减 + 转账净额
    const financingInflow = parseFloat(debtNew[0]?.total || 0); // 借入
    const financingOutflow = debtRepayment; // 还款流出
    const financingNet = financingInflow - financingOutflow;

    const netChange = operatingNet + investNet + financingNet;

    return {
        operating: {
            inflow: Math.round(operatingIncome * 100) / 100,
            outflow: Math.round(operatingExpense * 100) / 100,
            net: Math.round(operatingNet * 100) / 100,
            label: '日常收支'
        },
        investing: {
            inflow: Math.round(investInflow * 100) / 100,
            outflow: Math.round(investOutflow * 100) / 100,
            net: Math.round(investNet * 100) / 100,
            label: '投资活动'
        },
        financing: {
            inflow: Math.round(financingInflow * 100) / 100,
            outflow: Math.round(financingOutflow * 100) / 100,
            net: Math.round(financingNet * 100) / 100,
            label: '筹资活动（债务）'
        },
        netChange: Math.round(netChange * 100) / 100,
        note: '净变化 = 经营 + 投资 + 筹资；正值表示现金增加'
    };
}

// ==========================================
// 路由
// ==========================================

router.get('/', async (req, res) => {
    try {
        const { type = 'monthly', period } = req.query;
        if (!period) return res.status(400).json(fail('请指定报表周期'));

        const fresh = req.query.fresh === '1' || req.query.fresh === 'true';
        const key = reportCacheKey(req.userId, type, period);

        if (!fresh) {
            const cached = getCachedReport(key);
            if (cached) {
                res.set('X-Cache', 'HIT');
                res.set('Cache-Control', `public, max-age=${Math.floor(REPORT_CACHE_TTL_MS / 1000)}`);
                return res.json(success(cached));
            }
        }

        const data = await buildReport(req.userId, type, period);
        setCachedReport(key, data);
        res.set('X-Cache', fresh ? 'BYPASS' : 'MISS');
        res.set('Cache-Control', `public, max-age=${Math.floor(REPORT_CACHE_TTL_MS / 1000)}`);
        res.json(success(data));
    } catch (err) {
        if (err.message && (err.message.includes('格式错误') || err.message.includes('不支持的报表类型'))) {
            return res.status(400).json(fail(err.message));
        }
        handleServerError(res, err, '生成报表');
    }
});

module.exports = router;
