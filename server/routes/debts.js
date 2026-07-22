const express = require('express');
const router = express.Router();

const db = require('../db');
const { success, fail, handleServerError, fmtDateOnly, calcDebtDueSummary, computeAccountBalance } = require('./_helpers');

// 计算月供（等额本息 / 等额本金 / 先息后本）
function calcMonthlyPayment(principal, annualRate, termMonths, method) {
    const P = parseFloat(principal) || 0;
    const r = (parseFloat(annualRate) || 0) / 100 / 12;
    const n = parseInt(termMonths) || 0;
    if (P <= 0) return 0;
    if (method === 'equal_installment') {
        if (n <= 0) return 0;
        if (r === 0) return P / n;
        const pow = Math.pow(1 + r, n);
        return (P * r * pow) / (pow - 1);
    }
    if (method === 'equal_principal') {
        if (n <= 0) return 0;
        return P / n + P * r;
    }
    if (method === 'interest_only') return P * r;
    return 0;
}

// 生成还款计划（仅等额本息 / 等额本金）
function buildDebtSchedule(debt) {
    const P = parseFloat(debt.principal) || 0;
    const r = (parseFloat(debt.interest_rate) || 0) / 100 / 12;
    const n = parseInt(debt.term_months) || 0;
    const method = debt.method;
    if (P <= 0 || n <= 0 || (method !== 'equal_installment' && method !== 'equal_principal')) return [];
    const schedule = [];
    let remain = P;
    for (let k = 1; k <= n; k++) {
        const interest = remain * r;
        let principalPart, payment;
        if (method === 'equal_principal') {
            principalPart = P / n;
            payment = principalPart + interest;
        } else {
            payment = calcMonthlyPayment(P, debt.interest_rate, n, 'equal_installment');
            principalPart = payment - interest;
        }
        schedule.push({
            period: k,
            payment: Math.round(payment * 100) / 100,
            principal: Math.round(principalPart * 100) / 100,
            interest: Math.round(interest * 100) / 100,
            remainAfter: Math.round((remain - principalPart) * 100) / 100
        });
        remain -= principalPart;
    }
    return schedule;
}

// 自动计算月供应生效的还款方式
function autoCalcMethods() {
    return ['equal_installment', 'equal_principal', 'interest_only'];
}

// 列表 + 汇总
router.get('/', async (req, res) => {
    try {
        // 自动清理已还清超过7天的债务（仅删债务记录，保留还款流水和交易不变）
        await db.query(
            "DELETE FROM debts WHERE user_id = ? AND status = 'paid_off' AND updated_at < DATE_SUB(NOW(), INTERVAL 7 DAY)",
            [req.userId]
        );
        const debts = await db.query(
            'SELECT * FROM debts WHERE user_id = ? ORDER BY status = "paid_off", status = "overdue", due_date IS NULL, due_date ASC, id DESC',
            [req.userId]
        );
        const repayTotals = await db.query('SELECT debt_id, COALESCE(SUM(amount),0) as paid FROM debt_repayments WHERE user_id = ? GROUP BY debt_id', [req.userId]);
        const paidMap = {};
        repayTotals.forEach(r => { paidMap[r.debt_id] = parseFloat(r.paid); });
        const ym = new Date().toISOString().slice(0, 7);
        const now = new Date();
        const list = debts.map(d => {
            const auto = autoCalcMethods().includes(d.method);
            const monthly = auto
                ? (parseFloat(d.monthly_payment) || calcMonthlyPayment(d.principal, d.interest_rate, d.term_months, d.method))
                : (parseFloat(d.monthly_payment) || 0);
            return {
                ...d,
                principal: parseFloat(d.principal),
                remaining: parseFloat(d.remaining),
                interest_rate: parseFloat(d.interest_rate),
                term_months: parseInt(d.term_months) || 0,
                monthly_payment: Math.round(monthly * 100) / 100,
                min_payment: parseFloat(d.min_payment),
                paid_total: paidMap[d.id] || 0,
                start_date: fmtDateOnly(d.start_date),
                due_date: fmtDateOnly(d.due_date)
            };
        });
        const active = list.filter(d => d.status === 'active');
        const totalRemaining = list.reduce((s, d) => s + d.remaining, 0);
        const totalMonthly = active.reduce((s, d) => s + d.monthly_payment, 0);

        // 本月需还款 / 逾期：基于全部还款流水逐期核对（而非仅当前月）
        const todayStr = new Date().toISOString().slice(0, 10);
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
        const dueSummary = calcDebtDueSummary(active, repaymentsByDebt, todayStr);

        res.json(success({
            debts: list,
            summary: {
                totalRemaining,
                totalMonthly,
                dueThisMonth: dueSummary.dueThisMonth,
                dueAmount: dueSummary.dueAmount,
                overdue: dueSummary.overdue,
                overdueAmount: dueSummary.overdueAmount,
                count: list.length,
                activeCount: active.length
            }
        }));
    } catch (err) { handleServerError(res, err); }
});

// 新增债务
router.post('/', async (req, res) => {
    try {
        const b = req.body;
        if (!b.name || !b.name.trim()) return res.status(400).json(fail('债务名称必填'));
        const P = parseFloat(b.principal) || 0;
        const methodV = b.method || 'equal_installment';
        let monthly = parseFloat(b.monthly_payment) || 0;
        if (!monthly && autoCalcMethods().includes(methodV)) {
            monthly = calcMonthlyPayment(P, b.interest_rate, b.term_months, methodV);
        }
        const rem = b.remaining !== undefined && b.remaining !== '' && b.remaining !== null ? parseFloat(b.remaining) : P;
        const result = await db.query(
            `INSERT INTO debts (user_id, name, type, creditor, principal, remaining, interest_rate, term_months, method, monthly_payment, start_date, due_date, billing_day, payment_day, min_payment, note, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
            [req.userId, b.name.trim(), b.type || 'loan', b.creditor || '', P, rem, parseFloat(b.interest_rate) || 0, parseInt(b.term_months) || 0, methodV, Math.round(monthly * 100) / 100, b.start_date || null, b.due_date || null, parseInt(b.billing_day) || null, parseInt(b.payment_day) || null, parseFloat(b.min_payment) || 0, b.note || '']
        );
        res.json(success({ id: result.insertId }, '债务已添加'));
    } catch (err) { handleServerError(res, err); }
});

// 更新债务
router.put('/:id', async (req, res) => {
    try {
        const b = req.body;
        if (!b.name || !b.name.trim()) return res.status(400).json(fail('债务名称必填'));
        const debt = await db.queryOne('SELECT * FROM debts WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
        if (!debt) return res.status(404).json(fail('债务不存在'));
        const methodV = b.method || debt.method;
        let monthly = parseFloat(b.monthly_payment) || 0;
        if (!monthly && autoCalcMethods().includes(methodV)) {
            monthly = calcMonthlyPayment(
                b.principal !== undefined ? b.principal : debt.principal,
                b.interest_rate !== undefined ? b.interest_rate : debt.interest_rate,
                b.term_months !== undefined ? b.term_months : debt.term_months,
                methodV
            );
        }
        const newPrincipal = parseFloat(b.principal) || debt.principal;
        const rem = b.remaining !== undefined && b.remaining !== '' && b.remaining !== null ? parseFloat(b.remaining)
            : (newPrincipal !== parseFloat(debt.principal) ? parseFloat(debt.remaining) + (newPrincipal - parseFloat(debt.principal))
                : parseFloat(debt.remaining));
        const newStatus = b.status || (rem <= 0 ? 'paid_off' : 'active');
        await db.query(
            `UPDATE debts SET name=?, type=?, creditor=?, principal=?, remaining=?, interest_rate=?, term_months=?, method=?, monthly_payment=?, start_date=?, due_date=?, billing_day=?, payment_day=?, min_payment=?, note=?, status=? WHERE id=? AND user_id=?`,
            [b.name.trim(), b.type || debt.type, b.creditor || '', newPrincipal, rem, parseFloat(b.interest_rate) || 0, parseInt(b.term_months) || 0, methodV, Math.round(monthly * 100) / 100, b.start_date || null, b.due_date || null, parseInt(b.billing_day) || null, parseInt(b.payment_day) || null, parseFloat(b.min_payment) || 0, b.note || '', newStatus, req.params.id, req.userId]
        );
        res.json(success(null, '债务已更新'));
    } catch (err) { handleServerError(res, err); }
});

// 删除债务（级联删除还款流水）
router.delete('/:id', async (req, res) => {
    try {
        // 清理关联的入账交易（还款出账记录）
        const txs = await db.query('SELECT transaction_id FROM debt_repayments WHERE debt_id = ? AND user_id = ? AND transaction_id IS NOT NULL', [req.params.id, req.userId]);
        for (const t of txs) {
            if (t.transaction_id) await db.query('DELETE FROM transactions WHERE id = ? AND user_id = ?', [t.transaction_id, req.userId]);
        }
        await db.query('DELETE FROM debt_repayments WHERE debt_id = ? AND user_id = ?', [req.params.id, req.userId]);
        await db.query('DELETE FROM debts WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
        res.json(success(null, '债务已删除'));
    } catch (err) { handleServerError(res, err); }
});

// 债务详情（含还款计划 + 流水）
router.get('/:id', async (req, res) => {
    try {
        const debt = await db.queryOne('SELECT * FROM debts WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
        if (!debt) return res.status(404).json(fail('债务不存在'));
        const repayments = await db.query('SELECT r.*, a.name AS account_name, a.icon AS account_icon FROM debt_repayments r LEFT JOIN accounts a ON r.account_id = a.id WHERE r.debt_id = ? AND r.user_id = ? ORDER BY r.paid_at DESC, r.id DESC', [req.params.id, req.userId]);
        const auto = autoCalcMethods().includes(debt.method);
        const monthly = auto
            ? (parseFloat(debt.monthly_payment) || calcMonthlyPayment(debt.principal, debt.interest_rate, debt.term_months, debt.method))
            : (parseFloat(debt.monthly_payment) || 0);
        const schedule = buildDebtSchedule({ ...debt, monthly_payment: monthly });
        res.json(success({
            debt: { ...debt, principal: parseFloat(debt.principal), remaining: parseFloat(debt.remaining), interest_rate: parseFloat(debt.interest_rate), term_months: parseInt(debt.term_months) || 0, monthly_payment: Math.round(monthly * 100) / 100, min_payment: parseFloat(debt.min_payment), paid_total: repayments.reduce((s, r) => s + parseFloat(r.amount), 0), start_date: fmtDateOnly(debt.start_date), due_date: fmtDateOnly(debt.due_date) },
            repayments: repayments.map(r => ({ ...r, amount: parseFloat(r.amount), principal_part: parseFloat(r.principal_part), interest_part: parseFloat(r.interest_part), paid_at: fmtDateOnly(r.paid_at) })),
            schedule
        }));
    } catch (err) { handleServerError(res, err); }
});

// 添加还款记录
router.post('/:id/repayments', async (req, res) => {
    try {
        const { amount, paid_at, note, principal_part, interest_part, account_id } = req.body;
        const amt = parseFloat(amount);
        if (!amt || amt <= 0) return res.status(400).json(fail('还款金额必填'));
        const debt = await db.queryOne('SELECT * FROM debts WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
        if (!debt) return res.status(404).json(fail('债务不存在'));
        const accId = account_id ? parseInt(account_id) : null;
        if (!accId) return res.status(400).json(fail('请选择还款账户（支出账户）'));
        const pp = principal_part !== undefined && principal_part !== '' && principal_part !== null ? parseFloat(principal_part) : amt;
        const ip = interest_part !== undefined && interest_part !== '' && interest_part !== null ? parseFloat(interest_part) : 0;
        // 1) 插入还款记录
        const repResult = await db.query(
            'INSERT INTO debt_repayments (user_id, debt_id, account_id, amount, principal_part, interest_part, paid_at, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [req.userId, debt.id, accId, amt, pp, ip, paid_at || new Date().toISOString().slice(0, 10), note || '']
        );
        const repId = repResult.insertId;
        // 2) 入账：从支出账户出账（建交易、减余额）
        let cat = await db.queryOne("SELECT id FROM categories WHERE name='还款' AND type='expense'");
        if (!cat) {
            const catResult = await db.query("INSERT INTO categories (name, type, icon, color, is_system) VALUES ('还款', 'expense', '💸', '#ef4444', TRUE)");
            cat = { id: catResult.insertId };
        }
        const txDate = (paid_at || new Date().toISOString().slice(0, 10)) + ' 00:00:00';
        const txResult = await db.query(
            "INSERT INTO transactions (user_id, account_id, category_id, type, amount, note, date, source_account_id) VALUES (?, ?, ?, 'expense', ?, ?, ?, ?)",
            [req.userId, accId, cat.id, amt, `还款·${debt.name}`, txDate, accId]
        );
        await db.query('UPDATE debt_repayments SET transaction_id = ? WHERE id = ?', [txResult.insertId, repId]);
        // 3) 更新支出账户余额（以账本为准，与 POST /transactions 一致）
        const newAccBalance = await computeAccountBalance(db, req.userId, accId);
        await db.query('UPDATE accounts SET balance = ? WHERE id = ?', [newAccBalance, accId]);
        // 4) 更新债务剩余
        const newRemain = Math.max(0, parseFloat(debt.remaining) - pp);
        const newStatus = newRemain <= 0 ? 'paid_off' : 'active';
        await db.query('UPDATE debts SET remaining = ?, status = ? WHERE id = ?', [Math.round(newRemain * 100) / 100, newStatus, debt.id]);
        res.json(success(null, '还款已记录'));
    } catch (err) { handleServerError(res, err); }
});

// 删除还款记录（回滚剩余本金 + 删除关联入账交易）
router.delete('/:id/repayments/:rid', async (req, res) => {
    try {
        const debt = await db.queryOne('SELECT * FROM debts WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
        const rep = await db.queryOne('SELECT * FROM debt_repayments WHERE id = ? AND debt_id = ? AND user_id = ?', [req.params.rid, req.params.id, req.userId]);
        if (!debt || !rep) return res.status(404).json(fail('记录不存在'));
        // 回滚关联的入账交易（恢复账户余额）
        if (rep.transaction_id) {
            await db.query('DELETE FROM transactions WHERE id = ? AND user_id = ?', [rep.transaction_id, req.userId]);
            if (rep.account_id) {
                const restoredBalance = await computeAccountBalance(db, req.userId, rep.account_id);
                await db.query('UPDATE accounts SET balance = ? WHERE id = ?', [restoredBalance, rep.account_id]);
            }
        }
        const newRemain = parseFloat(debt.remaining) + parseFloat(rep.principal_part || 0);
        const newStatus = newRemain > 0 ? 'active' : 'paid_off';
        await db.query('DELETE FROM debt_repayments WHERE id = ?', [req.params.rid]);
        await db.query('UPDATE debts SET remaining = ?, status = ? WHERE id = ?', [Math.round(newRemain * 100) / 100, newStatus, debt.id]);
        res.json(success(null, '还款记录已删除'));
    } catch (err) { handleServerError(res, err); }
});

module.exports = router;
