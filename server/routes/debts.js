const express = require('express');
const router = express.Router();

const db = require('../db');
const { success, fail, handleServerError, fmtDateOnly, calcDebtDueSummary, computeAccountBalance } = require('./_helpers');

// 创建债务时同步生成台账交易（仅"应收/借出"从关联账户流出资金）
// 返回生成的交易 id；不满足条件时返回 null
async function createDebtCreateTxn(db, userId, accId, principal, name, dateStr) {
  if (!accId || !(principal > 0)) return null;
  // 借出分类（无则创建）
  const catName = '借出', catType = 'expense', catIcon = '🤝';
  let cat = await db.queryOne('SELECT id FROM categories WHERE name=? AND type=?', [catName, catType]);
  if (!cat) {
    const catResult = await db.query('INSERT INTO categories (name, type, icon, color, is_system) VALUES (?, ?, ?, ?, TRUE)', [catName, catType, catIcon, '#f59e0b']);
    cat = { id: catResult.insertId };
  }
  const txDate = (dateStr || new Date().toISOString().slice(0, 10)) + ' 00:00:00';
  const txResult = await db.query(
    'INSERT INTO transactions (user_id, account_id, category_id, type, amount, note, date, source_account_id, destination_account_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)',
    [userId, accId, cat.id, 'expense', principal, `借出·${name}`, txDate, accId]
  );
  // 以账本为准重算关联账户余额
  const newBalance = await computeAccountBalance(db, userId, accId);
  await db.query('UPDATE accounts SET balance = ? WHERE id = ?', [newBalance, accId]);
  return txResult.insertId;
}

// 回滚创建债务时生成的台账交易（删除交易并按账本重算账户余额）
async function rollbackDebtCreateTxn(db, userId, txId, accId) {
  if (!txId) return;
  await db.query('DELETE FROM transactions WHERE id = ? AND user_id = ?', [txId, userId]);
  if (accId) {
    const newBalance = await computeAccountBalance(db, userId, accId);
    await db.query('UPDATE accounts SET balance = ? WHERE id = ?', [newBalance, accId]);
  }
}

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
            "DELETE FROM debts WHERE user_id = ? AND status = 'paid_off' AND updated_at < NOW() - INTERVAL '7 days'",
            [req.userId]
        );
        const debts = await db.query(
            'SELECT * FROM debts WHERE user_id = ? ORDER BY status = \'paid_off\', status = \'overdue\', due_date IS NULL, due_date ASC, id DESC',
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
        const payables = list.filter(d => d.direction === 'payable');
        const receivables = list.filter(d => d.direction === 'receivable');
        const activePayables = payables.filter(d => d.status === 'active');
        const activeReceivables = receivables.filter(d => d.status === 'active');
        // 应付总额（我欠别人）= 减项
        const payableRemaining = payables.reduce((s, d) => s + d.remaining, 0);
        const payableMonthly = activePayables.reduce((s, d) => s + d.monthly_payment, 0);
        // 应收总额（别人欠我）= 加项（资产）
        const receivableRemaining = receivables.reduce((s, d) => s + d.remaining, 0);
        const receivableExpected = activeReceivables.reduce((s, d) => s + d.monthly_payment, 0);
        // 净债务 = 应付 - 应收
        const netDebt = payableRemaining - receivableRemaining;

        // 本月需还款 / 逾期：基于全部还款流水逐期核对（仅对应付生效）
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
        // 仅对应付计算 due/overdue
        const dueSummary = calcDebtDueSummary(activePayables, repaymentsByDebt, todayStr);
        // 应收也计算 due/overdue（语义：应收款的"已到期未收回"= "逾期"）
        const recvDueSummary = calcDebtDueSummary(activeReceivables, repaymentsByDebt, todayStr);

        res.json(success({
            debts: list,
            summary: {
                // 总额（兼容旧字段）
                totalRemaining: netDebt,
                totalMonthly: payableMonthly,
                dueThisMonth: dueSummary.dueThisMonth,
                dueAmount: dueSummary.dueAmount,
                overdue: dueSummary.overdue,
                overdueAmount: dueSummary.overdueAmount,
                count: list.length,
                activeCount: active.length,
                // 拆分：应付（我欠别人）
                payable: {
                    remaining: payableRemaining,
                    monthly: payableMonthly,
                    count: payables.length,
                    activeCount: activePayables.length,
                    dueThisMonth: dueSummary.dueThisMonth,
                    dueAmount: dueSummary.dueAmount,
                    overdue: dueSummary.overdue,
                    overdueAmount: dueSummary.overdueAmount
                },
                // 拆分：应收（别人欠我）
                receivable: {
                    remaining: receivableRemaining,
                    expectedMonthly: receivableExpected,
                    count: receivables.length,
                    activeCount: activeReceivables.length,
                    overdue: recvDueSummary.overdue,
                    overdueAmount: recvDueSummary.overdueAmount
                },
                netDebt
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
        const directionV = b.direction === 'receivable' ? 'receivable' : 'payable';
        let monthly = parseFloat(b.monthly_payment) || 0;
        if (!monthly && autoCalcMethods().includes(methodV)) {
            monthly = calcMonthlyPayment(P, b.interest_rate, b.term_months, methodV);
        }
        const rem = b.remaining !== undefined && b.remaining !== '' && b.remaining !== null ? parseFloat(b.remaining) : P;
        const accId = b.account_id ? parseInt(b.account_id) : null;
        const result = await db.query(
            `INSERT INTO debts (user_id, account_id, name, type, direction, creditor, principal, remaining, interest_rate, term_months, method, monthly_payment, start_date, due_date, billing_day, payment_day, min_payment, note, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
            [req.userId, accId, b.name.trim(), b.type || 'loan', directionV, b.creditor || '', P, rem, parseFloat(b.interest_rate) || 0, parseInt(b.term_months) || 0, methodV, Math.round(monthly * 100) / 100, b.start_date || null, b.due_date || null, parseInt(b.billing_day) || null, parseInt(b.payment_day) || null, parseFloat(b.min_payment) || 0, b.note || '']
        );
        const newId = result.insertId;
        // 应收（借出）且关联账户：同步生成支出交易，扣减关联账户余额
        let createTxnId = null;
        if (directionV === 'receivable') {
          createTxnId = await createDebtCreateTxn(db, req.userId, accId, P, b.name.trim(), b.start_date);
          if (createTxnId) await db.query('UPDATE debts SET create_transaction_id = ? WHERE id = ?', [createTxnId, newId]);
        }
        res.json(success({ id: newId }, directionV === 'receivable' ? '借出已记录' : '债务已添加'));
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
        const directionV = b.direction === 'receivable' ? 'receivable' : (b.direction === 'payable' ? 'payable' : debt.direction);
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
        const accId = b.account_id !== undefined && b.account_id !== '' && b.account_id !== null ? parseInt(b.account_id) : (debt.account_id || null);
        const newStatus = b.status || (rem <= 0 ? 'paid_off' : 'active');
        // 回滚旧的创建交易（避免账本残留）
        if (debt.create_transaction_id) {
          await rollbackDebtCreateTxn(db, req.userId, debt.create_transaction_id, debt.account_id);
        }
        // 重算后若仍符合"应收+关联账户+本金>0"，重建创建交易
        let newCreateTxnId = null;
        if (directionV === 'receivable') {
          newCreateTxnId = await createDebtCreateTxn(db, req.userId, accId, newPrincipal, b.name.trim(), b.start_date);
        }
        await db.query(
            `UPDATE debts SET name=?, type=?, direction=?, creditor=?, account_id=?, principal=?, remaining=?, interest_rate=?, term_months=?, method=?, monthly_payment=?, start_date=?, due_date=?, billing_day=?, payment_day=?, min_payment=?, note=?, status=?, create_transaction_id=? WHERE id=? AND user_id=?`,
            [b.name.trim(), b.type || debt.type, directionV, b.creditor || '', accId, newPrincipal, rem, parseFloat(b.interest_rate) || 0, parseInt(b.term_months) || 0, methodV, Math.round(monthly * 100) / 100, b.start_date || null, b.due_date || null, parseInt(b.billing_day) || null, parseInt(b.payment_day) || null, parseFloat(b.min_payment) || 0, b.note || '', newStatus, newCreateTxnId, req.params.id, req.userId]
        );
        res.json(success(null, '债务已更新'));
    } catch (err) { handleServerError(res, err); }
});

// 删除债务（级联删除还款流水 + 创建时生成的台账交易）
router.delete('/:id', async (req, res) => {
    try {
        const debt = await db.queryOne('SELECT * FROM debts WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
        if (!debt) return res.status(404).json(fail('债务不存在'));
        // 回滚创建应收借出时生成的台账交易（恢复账户余额）
        if (debt.create_transaction_id) {
          await rollbackDebtCreateTxn(db, req.userId, debt.create_transaction_id, debt.account_id);
        }
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

// 添加还款/收款记录（按 direction 分叉）
// - payable（应付/我欠别人）：从我的账户扣款，建支出交易
// - receivable（应收/别人欠我）：我的账户入账，建收入交易
router.post('/:id/repayments', async (req, res) => {
    try {
        const { amount, paid_at, note, principal_part, interest_part, account_id } = req.body;
        const amt = parseFloat(amount);
        if (!amt || amt <= 0) return res.status(400).json(fail('金额必填'));
        const debt = await db.queryOne('SELECT * FROM debts WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
        if (!debt) return res.status(404).json(fail('债务不存在'));
        const accId = account_id ? parseInt(account_id) : null;
        if (!accId) return res.status(400).json(fail('请选择账户'));
        const isReceivable = (debt.direction === 'receivable');
        const pp = principal_part !== undefined && principal_part !== '' && principal_part !== null ? parseFloat(principal_part) : amt;
        const ip = interest_part !== undefined && interest_part !== '' && interest_part !== null ? parseFloat(interest_part) : 0;
        // 1) 插入还款/收款记录
        const repResult = await db.query(
            'INSERT INTO debt_repayments (user_id, debt_id, account_id, amount, principal_part, interest_part, paid_at, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [req.userId, debt.id, accId, amt, pp, ip, paid_at || new Date().toISOString().slice(0, 10), note || '']
        );
        const repId = repResult.insertId;
        // 2) 准备分类
        const catName = isReceivable ? '收还款' : '还款';
        const catType = isReceivable ? 'income' : 'expense';
        const catIcon = isReceivable ? '💰' : '💸';
        let cat = await db.queryOne("SELECT id FROM categories WHERE name=? AND type=?", [catName, catType]);
        if (!cat) {
            const catResult = await db.query("INSERT INTO categories (name, type, icon, color, is_system) VALUES (?, ?, ?, ?, TRUE)", [catName, catType, catIcon, isReceivable ? '#10b981' : '#ef4444']);
            cat = { id: catResult.insertId };
        }
        // 3) 建交易：应收建 income + destination_account_id；应付建 expense + source_account_id
        const txDate = (paid_at || new Date().toISOString().slice(0, 10)) + ' 00:00:00';
        const txType = isReceivable ? 'income' : 'expense';
        const txNote = isReceivable ? `收回·${debt.name}` : `还款·${debt.name}`;
        const srcCol = isReceivable ? 'NULL' : '?';
        const dstCol = isReceivable ? '?' : 'NULL';
        const insertSQL = `INSERT INTO transactions (user_id, account_id, category_id, type, amount, note, date, source_account_id, destination_account_id) VALUES (?, ?, ?, ?, ?, ?, ?, ${srcCol}, ${dstCol})`;
        const txParams = [req.userId, accId, cat.id, txType, amt, txNote, txDate];
        if (isReceivable) txParams.push(accId); else txParams.push(accId);
        const txResult = await db.query(insertSQL, txParams);
        await db.query('UPDATE debt_repayments SET transaction_id = ? WHERE id = ?', [txResult.insertId, repId]);
        // 4) 账户余额重算（以账本为准）
        const newAccBalance = await computeAccountBalance(db, req.userId, accId);
        await db.query('UPDATE accounts SET balance = ? WHERE id = ?', [newAccBalance, accId]);
        // 5) 更新剩余本金 + 状态
        const newRemain = isReceivable
            ? Math.max(0, parseFloat(debt.remaining) - pp)   // 收回 = 减少应收
            : Math.max(0, parseFloat(debt.remaining) - pp);  // 还款 = 减少应付
        const newStatus = newRemain <= 0 ? 'paid_off' : 'active';
        await db.query('UPDATE debts SET remaining = ?, status = ? WHERE id = ?', [Math.round(newRemain * 100) / 100, newStatus, debt.id]);
        res.json(success(null, isReceivable ? '收款已记录' : '还款已记录'));
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
