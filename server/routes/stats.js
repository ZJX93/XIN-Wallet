/* ============================================
   鑫钱包 · 综合统计路由模块
   包含：仪表盘数据、仪表盘卡片明细
   ============================================ */

const express = require('express');
const db = require('../db');
const { success, fail, handleServerError, fmtDateOnly, calcDebtDueSummary, ensureWeeklySnapshots } = require('./_helpers');

const router = express.Router();

// ==========================================
// 综合统计 API
// ==========================================

router.get('/dashboard', async (req, res) => {
    try {
        const now = new Date();
        const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const today = now.toISOString().slice(0, 10); // YYYY-MM-DD
        const currentYear = now.getFullYear().toString();

        // 计算本周起止（周一 ~ 周日）
        const dayOfWeek = now.getDay();
        const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // 周日修正
        const monday = new Date(now);
        monday.setDate(now.getDate() + mondayOffset);
        const weekStart = monday.toISOString().slice(0, 10);
        const weekEnd = today;

        // 今日支出
        const todayData = await db.queryOne(
            `SELECT COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as expense
       FROM transactions WHERE user_id = ? AND date = ?`,
            [req.userId, today]
        );

        // 本周收支（周一~今天）
        const weekData = await db.queryOne(
            `SELECT COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as income,
                    COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as expense
       FROM transactions WHERE user_id = ? AND date >= ? AND date <= ?`,
            [req.userId, weekStart, weekEnd]
        );

        // 本月收支
        const monthData = await db.queryOne(
            `SELECT
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as income,
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as expense
       FROM transactions WHERE user_id = ? AND date LIKE ?`,
            [req.userId, currentMonth + '%']
        );

        // 本年收支
        const yearData = await db.queryOne(
            `SELECT
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as income,
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as expense
       FROM transactions WHERE user_id = ? AND date LIKE ?`,
            [req.userId, currentYear + '%']
        );

        // 最近6月趋势
        const months = await db.query(
            `SELECT DATE_FORMAT(date, '%Y-%m') as month,
        SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as income,
        SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as expense
       FROM transactions WHERE user_id = ?
       GROUP BY month ORDER BY month DESC LIMIT 6`,
            [req.userId]
        );

        // 趋势增强：储蓄额/储蓄率 + 与上月环比
        const monthsAsc = [...months].sort((a, b) => a.month.localeCompare(b.month));
        let prevMonth = null;
        const monthsEnhanced = monthsAsc.map(m => {
            const income = parseFloat(m.income);
            const expense = parseFloat(m.expense);
            const savings = income - expense;
            const savingsRate = income > 0 ? (savings / income * 100) : 0;
            const rec = {
                month: m.month, income, expense, savings,
                savingsRate: Math.round(savingsRate * 10) / 10,
                incomeMoM: null, expenseMoM: null, balanceMoM: null
            };
            if (prevMonth) {
                rec.incomeMoM = prevMonth.income > 0 ? ((income - prevMonth.income) / prevMonth.income * 100) : null;
                rec.expenseMoM = prevMonth.expense > 0 ? ((expense - prevMonth.expense) / prevMonth.expense * 100) : null;
                const prevBal = prevMonth.income - prevMonth.expense;
                const bal = income - expense;
                rec.balanceMoM = prevBal !== 0 ? ((bal - prevBal) / Math.abs(prevBal) * 100) : null;
            }
            prevMonth = { income, expense };
            return rec;
        });
        const monthsOut = monthsEnhanced.reverse();

        // 账户总览
        const accounts = await db.query(
            'SELECT * FROM accounts WHERE user_id = ? AND status = "active" ORDER BY sort_order',
            [req.userId]
        );
        const totalAssets = accounts.reduce((s, a) => s + parseFloat(a.balance), 0);

        // 理财总资产
        const invSummary = await db.queryOne(
            `SELECT COALESCE(SUM(total_cost), 0) as total_cost, COALESCE(SUM(current_value), 0) as total_value
       FROM investments WHERE user_id = ? AND status = 'holding'`,
            [req.userId]
        );

        // 当前月区间
        const monthStart = currentMonth + '-01';
        const [msYear, msMonth] = currentMonth.split('-').map(Number);
        const monthEnd = `${currentMonth}-${String(new Date(msYear, msMonth, 0).getDate()).padStart(2, '0')}`;

        // 预算执行
        const budgetRows = await db.query(
            `SELECT b.*,
                    (SELECT COALESCE(SUM(amount), 0) FROM transactions
                      WHERE user_id = b.user_id AND type = 'expense'
                        AND date BETWEEN b.start_date AND b.end_date) as actual
             FROM budgets b
             WHERE b.user_id = ? AND b.start_date <= ? AND b.end_date >= ?
             ORDER BY b.start_date`,
            [req.userId, monthEnd, monthStart]
        );
        const budgetMonthLastDay = parseInt(monthEnd.slice(8, 10));
        const budgetDayOfMonth = now.getDate();
        const budgetDaysLeft = Math.max(budgetMonthLastDay - budgetDayOfMonth, 0);

        const budgets = budgetRows.map(b => {
            const amount = parseFloat(b.amount);
            const actual = parseFloat(b.actual || 0);
            const ratio = amount > 0 ? Math.min(actual / amount * 100, 999) : 0;
            const remain = Math.max(amount - actual, 0);
            const over = actual > amount;
            const dailyAvg = budgetDayOfMonth > 0 ? actual / budgetDayOfMonth : 0;
            const projectedMonthEnd = dailyAvg * budgetMonthLastDay;
            const willOver = !over && amount > 0 && projectedMonthEnd > amount;
            const overBy = willOver ? projectedMonthEnd - amount : (over ? actual - amount : 0);
            const safeDaily = budgetDaysLeft > 0 ? remain / budgetDaysLeft : 0;
            let alertLevel = 'safe';
            if (over || willOver) alertLevel = 'danger';
            else if (ratio >= 80) alertLevel = 'warning';
            return {
                name: b.name, amount, actual,
                ratio: Math.round(ratio * 10) / 10,
                remain, over,
                daysLeft: budgetDaysLeft, daysTotal: budgetMonthLastDay,
                dailyAvg: Math.round(dailyAvg * 100) / 100,
                projectedMonthEnd: Math.round(projectedMonthEnd * 100) / 100,
                willOver, overBy: Math.round(overBy * 100) / 100,
                safeDaily: Math.round(safeDaily * 100) / 100,
                alertLevel
            };
        });

        // 储蓄目标（active）
        const goalRows = await db.query(
            `SELECT id, name, icon, target_amount, current_amount, status
             FROM savings_goals WHERE user_id = ? AND status = 'active'
             ORDER BY (current_amount / NULLIF(target_amount, 0)) DESC`,
            [req.userId]
        );
        const savingsGoals = goalRows.map(g => {
            const target = parseFloat(g.target_amount);
            const current = parseFloat(g.current_amount);
            return { id: g.id, name: g.name, icon: g.icon, target_amount: target, current_amount: current, ratio: target > 0 ? Math.round(current / target * 1000) / 10 : 0 };
        });

        // 理财持仓（holding）
        const holdingRows = await db.query(
            `SELECT i.name, i.code, i.total_cost, i.current_value,
                    (i.current_value - i.total_cost) as profit,
                    it.icon as type_icon, it.name as type_name
             FROM investments i
             JOIN investment_types it ON i.investment_type_id = it.id
             WHERE i.user_id = ? AND i.status = 'holding'
             ORDER BY i.current_value DESC`,
            [req.userId]
        );
        const investmentHoldings = holdingRows.map(h => {
            const cost = parseFloat(h.total_cost);
            const value = parseFloat(h.current_value);
            const profit = parseFloat(h.profit);
            return { name: h.name, code: h.code, total_cost: cost, current_value: value, profit, profit_rate: cost > 0 ? Math.round(profit / cost * 1000) / 10 : 0, type_icon: h.type_icon, type_name: h.type_name };
        });

        // 最近交易
        const recentTrans = await db.query(
            `SELECT t.*, c.name as cat_name, c.icon as cat_icon,
        a.name as acc_name, a.icon as acc_icon
       FROM transactions t
       JOIN categories c ON t.category_id = c.id
       LEFT JOIN accounts a ON t.account_id = a.id
       WHERE t.user_id = ? AND t.type IN ('expense','income','transfer_in','transfer_out')
       ORDER BY t.date DESC, t.id DESC LIMIT 8`,
            [req.userId]
        );

        // 债务汇总
        const debtSum = await db.queryOne(
            `SELECT COALESCE(SUM(remaining), 0) as total_remaining,
                    COALESCE(SUM(CASE WHEN status != 'paid_off' THEN monthly_payment ELSE 0 END), 0) as total_monthly
             FROM debts WHERE user_id = ? AND status != 'paid_off'`,
            [req.userId]
        );

        // 全部历史累计收入/支出（用于计算总体储蓄率 = 累计净结余 / 累计收入）
        const lifetimeTotals = await db.queryOne(
            `SELECT
              COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as total_income,
              COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as total_expense
             FROM transactions WHERE user_id = ?`,
            [req.userId]
        );
        const totalIncome = parseFloat(lifetimeTotals.total_income || 0);
        const totalExpense = parseFloat(lifetimeTotals.total_expense || 0);
        const activeDebts = await db.query(
            'SELECT id, monthly_payment, remaining, payment_day, billing_day, min_payment, start_date, type FROM debts WHERE user_id = ? AND status = "active"',
            [req.userId]
        );
        const allReps = await db.query(
            'SELECT debt_id, amount, paid_at FROM debt_repayments WHERE user_id = ?',
            [req.userId]
        );
        const repaymentsByDebt = {};
        allReps.forEach(r => {
            (repaymentsByDebt[r.debt_id] = repaymentsByDebt[r.debt_id] || []).push({
                amount: parseFloat(r.amount),
                paid_at: fmtDateOnly(r.paid_at)
            });
        });
        const dueSummary = calcDebtDueSummary(activeDebts, repaymentsByDebt, today);
        const debtCount = await db.queryOne(
            `SELECT COUNT(*) as cnt, SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) as active_cnt FROM debts WHERE user_id = ?`,
            [req.userId]
        );

        // 本月储蓄净额
        let monthNetSavings = 0;
        try {
            const savingsData = await db.queryOne(
                `SELECT COALESCE(SUM(CASE WHEN type='deposit' THEN amount ELSE -amount END), 0) as net_savings
                 FROM savings_transactions WHERE user_id = ? AND date LIKE ?`,
                [req.userId, currentMonth + '%']
            );
            monthNetSavings = parseFloat(savingsData.net_savings || 0);
        } catch (e) { /* savings_transactions 表可能还未创建 */ }
        const monthIncome = parseFloat(monthData.income);
        const savingsRate = monthIncome > 0 ? (monthNetSavings / monthIncome * 100) : 0;

        res.json(success({
            currentMonth,
            today: { expense: parseFloat(todayData.expense) },
            week: { income: parseFloat(weekData.income), expense: parseFloat(weekData.expense), start: weekStart, end: weekEnd },
            month: {
                income: monthIncome,
                expense: parseFloat(monthData.expense),
                balance: monthIncome - parseFloat(monthData.expense),
                savings: Math.round(monthNetSavings * 100) / 100,
                savingsRate: Math.round(savingsRate * 10) / 10
            },
            year: {
                income: parseFloat(yearData.income),
                expense: parseFloat(yearData.expense),
                balance: parseFloat(yearData.income) - parseFloat(yearData.expense)
            },
            netWorth: totalAssets - parseFloat(debtSum.total_remaining || 0),
            income: parseFloat(monthData.income),
            expense: parseFloat(monthData.expense),
            balance: parseFloat(monthData.income) - parseFloat(monthData.expense),
            // 全部历史累计金额（前端用于储蓄率 = 累计净储蓄 / 总资产）
            totalIncome,
            totalExpense,
            totalSavings: totalIncome - totalExpense,
            months: monthsOut,
            accounts: accounts.map(a => ({ ...a, balance: parseFloat(a.balance) })),
            totalAssets,
            budgets,
            savingsGoals,
            investments: {
                totalCost: parseFloat(invSummary.total_cost),
                totalValue: parseFloat(invSummary.total_value),
                totalProfit: parseFloat(invSummary.total_value) - parseFloat(invSummary.total_cost),
                holdings: investmentHoldings
            },
            recentTransactions: recentTrans.map(t => ({
                id: t.id, type: t.type, amount: parseFloat(t.amount), date: t.date,
                note: t.note, transfer_id: t.transfer_id,
                category: { id: t.category_id, name: t.cat_name, icon: t.cat_icon },
                account: { id: t.account_id, name: t.acc_name, icon: t.acc_icon }
            })),
            debts: {
                totalRemaining: parseFloat(debtSum.total_remaining),
                totalMonthly: parseFloat(debtSum.total_monthly),
                dueThisMonth: dueSummary.dueThisMonth,
                dueAmount: dueSummary.dueAmount,
                overdue: dueSummary.overdue,
                overdueAmount: dueSummary.overdueAmount,
                count: parseInt(debtCount.cnt),
                activeCount: parseInt(debtCount.active_cnt)
            }
        }));
    } catch (err) {
        handleServerError(res, err);
    }
});

// 仪表盘卡片点击明细
router.get('/dashboard/detail', async (req, res) => {
    try {
        const { type } = req.query;
        const now = new Date();
        const today = now.toISOString().slice(0, 10);
        const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const currentYear = now.getFullYear().toString();

        const dayOfWeek = now.getDay();
        const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        const monday = new Date(now);
        monday.setDate(now.getDate() + mondayOffset);
        const weekStart = monday.toISOString().slice(0, 10);

        let dateCondition, dateParams = [];
        switch (type) {
            case 'today':
                dateCondition = 't.date = ?';
                dateParams = [today];
                break;
            case 'week':
                dateCondition = 't.date >= ? AND t.date <= ?';
                dateParams = [weekStart, today];
                break;
            case 'month':
                dateCondition = 't.date LIKE ?';
                dateParams = [currentMonth + '%'];
                break;
            case 'year':
                dateCondition = 't.date LIKE ?';
                dateParams = [currentYear + '%'];
                break;
            case 'assets':
                const accounts = await db.query(
                    `SELECT a.*, COALESCE(SUM(i.current_value), 0) as inv_value
           FROM accounts a
           LEFT JOIN investments i ON i.account_id = a.id AND i.user_id = a.user_id AND i.status = 'holding'
           WHERE a.user_id = ? AND a.status = 'active'
           GROUP BY a.id ORDER BY a.sort_order`,
                    [req.userId]
                );
                const totalAssets = accounts.reduce((s, a) => s + parseFloat(a.balance), 0);
                return res.json(success({
                    type: 'assets', title: '总资产明细',
                    total: totalAssets,
                    accounts: accounts.map(a => ({
                        name: a.name, icon: a.icon, type: a.type,
                        balance: parseFloat(a.balance),
                        inv_value: parseFloat(a.inv_value),
                        ratio: totalAssets > 0 ? (parseFloat(a.balance) / totalAssets * 100) : 0
                    }))
                }));
            default: return res.status(400).json(fail('无效的明细类型'));
        }

        const rows = await db.query(
            `SELECT t.*, c.name as cat_name, c.icon as cat_icon, a.name as acc_name, a.icon as acc_icon
       FROM transactions t
       JOIN categories c ON t.category_id = c.id
       LEFT JOIN accounts a ON t.account_id = a.id
       WHERE t.user_id = ? AND ${dateCondition}
       ORDER BY t.date DESC, t.id DESC`,
            [req.userId, ...dateParams]
        );

        const totalExpense = rows.filter(r => r.type === 'expense').reduce((s, r) => s + parseFloat(r.amount), 0);
        const totalIncome = rows.filter(r => r.type === 'income').reduce((s, r) => s + parseFloat(r.amount), 0);

        const titleMap = {
            today: '今日交易明细', week: '本周交易明细',
            month: '本月交易明细', year: '本年交易明细'
        };

        res.json(success({
            type, title: titleMap[type],
            totalExpense, totalIncome,
            balance: totalIncome - totalExpense,
            transactions: rows.map(t => ({
                id: t.id, type: t.type, amount: parseFloat(t.amount),
                date: t.date, note: t.note || '',
                transfer_id: t.transfer_id,
                category: { id: t.category_id, name: t.cat_name, icon: t.cat_icon },
                account: { id: t.account_id, name: t.acc_name, icon: t.acc_icon }
            }))
        }));
    } catch (err) {
        handleServerError(res, err);
    }
});

// 理财组合进阶指标：年化、集中度、预期收益加权
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

// 理财趋势数据（折线图：各持仓市值变化 + 柱状图：按类型投入 vs 市值）
router.get('/investments', async (req, res) => {
    try {
        const investments = await db.query(
            `SELECT i.*, it.name as type_name, it.icon as type_icon
             FROM investments i JOIN investment_types it ON i.investment_type_id = it.id
             WHERE i.user_id = ? AND i.status = 'holding'
             ORDER BY i.current_value DESC`,
            [req.userId]
        );

        await ensureWeeklySnapshots(req.userId, investments);

        const trendSeries = [];
        for (const inv of investments) {
            const snaps = await db.query(
                `SELECT nav_date, total_value, total_cost FROM investment_snapshots
                 WHERE user_id = ? AND investment_id = ? ORDER BY nav_date ASC`,
                [req.userId, inv.id]
            );
            const points = snaps.map(s => ({
                date: s.nav_date instanceof Date ? s.nav_date.toISOString().slice(0, 10) : String(s.nav_date).slice(0, 10),
                value: parseFloat(s.total_value)
            }));
            if (points.length > 0) {
                trendSeries.push({
                    id: inv.id, name: inv.name, type_name: inv.type_name, type_icon: inv.type_icon,
                    total_cost: parseFloat(inv.total_cost), current_value: parseFloat(inv.current_value),
                    profit_rate: parseFloat(inv.total_cost) > 0
                        ? ((parseFloat(inv.current_value) - parseFloat(inv.total_cost)) / parseFloat(inv.total_cost) * 100) : 0,
                    points
                });
            }
        }

        const byType = {};
        investments.forEach(i => {
            const key = i.type_name;
            if (!byType[key]) byType[key] = { type_name: key, icon: i.type_icon, total_cost: 0, total_value: 0, count: 0 };
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

module.exports = router;
