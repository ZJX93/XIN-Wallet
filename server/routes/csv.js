const express = require('express');
const router = express.Router();

const db = require('../db');
const { parseCsvLine } = require('../validate');
const { success, fail, handleServerError } = require('./_helpers');
const { encrypt, decrypt } = require('../crypto');

// ==========================================
// CSV 导入/导出 API
// ==========================================
function toCsvCell(v) {
    const s = String(v == null ? '' : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

router.get('/export/csv', async (req, res) => {
    try {
        const { type } = req.query;
        let rows = [], header = [];
        if (type === 'accounts') {
            header = ['id', 'name', 'type', 'balance', 'credit_limit', 'icon'];
            const data = await db.query('SELECT * FROM accounts WHERE user_id = ? AND status = "active"', [req.userId]);
            rows = data.map(a => [a.id, a.name, a.type, a.balance, a.credit_limit, a.icon]);
        } else if (type === 'investments') {
            header = ['id', 'name', 'code', 'type', 'buy_price', 'current_price', 'quantity', 'total_cost', 'current_value'];
            const data = await db.query('SELECT i.*, it.name as type FROM investments i JOIN investment_types it ON i.investment_type_id = it.id WHERE i.user_id = ?', [req.userId]);
            rows = data.map(i => [i.id, i.name, i.type, i.code, i.buy_price, i.current_price, i.quantity, i.total_cost, i.current_value]);
        } else {
            const t = 'transactions';
            header = ['date', 'type', 'amount', 'account', 'category', 'note'];
            const data = await db.query(
                `SELECT t.date, t.type, t.amount, a.name as acc, c.name as cat, t.note
                 FROM transactions t LEFT JOIN accounts a ON t.account_id = a.id
                 LEFT JOIN categories c ON t.category_id = c.id WHERE t.user_id = ? ORDER BY t.date DESC`,
                [req.userId]
            );
            rows = data.map(x => [x.date, x.type, x.amount, x.acc, x.cat, x.note]);
            var exportType = t;
        }
        const csv = [header.join(',')].concat(rows.map(r => r.map(toCsvCell).join(','))).join('\n');
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="xinwallet_${(type === 'accounts' || type === 'investments') ? type : 'transactions'}.csv"`);
        res.status(200).send('' + csv);
    } catch (err) { handleServerError(res, err); }
});

router.post('/import/csv', async (req, res) => {
    try {
        const { type, csv } = req.body;
        if (type !== 'transactions' || !csv) return res.status(400).json(fail('仅支持导入交易 CSV'));
        // CSV 内容大小限制：防止 DoS（单次最多 10000 行，每行最多 500 字符）
        if (csv.length > 5 * 1024 * 1024) return res.status(400).json(fail('CSV 文件过大，请限制在 5MB 以内'));
        const lines = csv.split(/\r?\n/).filter(l => l.trim() !== '');
        if (lines.length < 2) return res.status(400).json(fail('CSV 无数据行'));
        if (lines.length > 10001) return res.status(400).json(fail('CSV 行数超过限制（最多 10000 行）'));
        const header = parseCsvLine(lines[0]).map(h => h.trim());
        // 校验必要列头
        const requiredHeaders = ['date', 'amount', 'type', 'account', 'category'];
        const missingHeaders = requiredHeaders.filter(h => !header.includes(h));
        if (missingHeaders.length > 0) return res.status(400).json(fail(`CSV 缺少必要列：${missingHeaders.join(', ')}`));
        let imported = 0;
        const errors = [];
        for (let i = 1; i < lines.length; i++) {
            try {
                const cols = parseCsvLine(lines[i]);
                if (cols.length !== header.length) {
                    errors.push(`第 ${i} 行列数不匹配（预期 ${header.length}，实际 ${cols.length}）`);
                    continue;
                }
                const row = {};
                header.forEach((h, idx) => row[h] = (cols[idx] || '').trim());
                const date = row['date'] || new Date().toISOString().split('T')[0];
                const amount = parseFloat(row['amount']);
                if (!amount || amount <= 0) continue;
                const typeVal = (row['type'] === '收入' || row['type'] === 'income') ? 'income' : 'expense';
                const acc = await db.queryOne('SELECT id FROM accounts WHERE user_id = ? AND name = ?', [req.userId, row['account'] || '']);
                if (!acc) { errors.push(`第 ${i} 行：账户 "${row['account']}" 不存在`); continue; }
                const cat = await db.queryOne('SELECT id FROM categories WHERE name = ?', [row['category'] || '']);
                const categoryId = cat ? cat.id : (typeVal === 'income' ? 21 : 14);
                await db.transaction(async (conn) => {
                    const r = await conn.query(
                        'INSERT INTO transactions (user_id, account_id, category_id, type, amount, note, date) VALUES (?, ?, ?, ?, ?, ?, ?)',
                        [req.userId, acc.id, categoryId, typeVal, amount, row['note'] || '', date]
                    );
                    if (typeVal === 'income') await conn.query('UPDATE accounts SET balance = balance + ? WHERE id = ?', [amount, acc.id]);
                    else await conn.query('UPDATE accounts SET balance = balance - ? WHERE id = ?', [amount, acc.id]);
                    return r.insertId;
                });
                imported++;
            } catch (rowErr) {
                errors.push(`第 ${i} 行处理失败: ${rowErr.message}`);
            }
        }
        res.json(success({ imported, errors: errors.slice(0, 20) }, `成功导入 ${imported} 条交易${errors.length > 0 ? `，${errors.length} 条失败` : ''}`));
    } catch (err) { handleServerError(res, err); }
});

// ==========================================
// 完整账本导出/导入（JSON 格式，跨实例迁移）
// ==========================================

router.get('/export/full', async (req, res) => {
    try {
        const userId = req.userId;
        const [accounts, cats, transactions, transfers, budgets, goals, investments, tags] = await Promise.all([
            db.query('SELECT name, type, icon, balance, opening_balance, credit_limit FROM accounts WHERE user_id = ? AND status = "active"', [userId]),
            db.query('SELECT name, type, icon, parent_id FROM categories'),
            db.query('SELECT CAST(t.date AS CHAR) AS date, t.type, t.amount, a.name AS account, c.name AS category, t.note FROM transactions t LEFT JOIN accounts a ON t.account_id = a.id LEFT JOIN categories c ON t.category_id = c.id WHERE t.user_id = ?', [userId]),
            db.query('SELECT CAST(t.date AS CHAR) AS date, t.amount, t.note, a1.name AS from_account, a2.name AS to_account FROM transfers t LEFT JOIN accounts a1 ON t.from_account_id = a1.id LEFT JOIN accounts a2 ON t.to_account_id = a2.id WHERE t.user_id = ?', [userId]),
            db.query('SELECT name, period_type, amount, CAST(start_date AS CHAR) AS start_date, CAST(end_date AS CHAR) AS end_date FROM budgets WHERE user_id = ?', [userId]),
            db.query('SELECT name, target_amount, current_amount, icon, note, status FROM savings_goals WHERE user_id = ?', [userId]),
            db.query('SELECT i.name, i.code, i.buy_price, i.current_price, i.quantity, i.total_cost, i.current_value, i.fee, CAST(i.buy_date AS CHAR) AS buy_date, i.expected_rate, i.note, i.status, a.name AS account, it.name AS type_name FROM investments i LEFT JOIN accounts a ON i.account_id = a.id LEFT JOIN investment_types it ON i.investment_type_id = it.id WHERE i.user_id = ?', [userId]),
            db.query('SELECT name, color, icon FROM tags WHERE user_id = ?', [userId])
        ]);

        const fmtNum = v => Math.round(parseFloat(v || 0) * 100) / 100;
        const backup = {
            version: 1, exportedAt: new Date().toISOString(),
            accounts: accounts.map(a => ({ ...a, balance: fmtNum(a.balance), opening_balance: fmtNum(a.opening_balance || 0), credit_limit: fmtNum(a.credit_limit || 0) })),
            categories: cats,
            transactions: transactions.map(t => ({ ...t, amount: fmtNum(t.amount) })),
            transfers: transfers.map(t => ({ ...t, amount: fmtNum(t.amount) })),
            budgets: budgets.map(b => ({ ...b, amount: fmtNum(b.amount) })),
            savings_goals: goals.map(g => ({ ...g, target_amount: fmtNum(g.target_amount), current_amount: fmtNum(g.current_amount) })),
            investments: investments.map(i => ({ ...i, buy_price: fmtNum(i.buy_price), current_price: fmtNum(i.current_price), quantity: fmtNum(i.quantity), total_cost: fmtNum(i.total_cost), current_value: fmtNum(i.current_value), fee: fmtNum(i.fee || 0), expected_rate: fmtNum(i.expected_rate || 0) })),
            tags
        };

        const json = JSON.stringify(backup, null, 2);
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="xinwallet_backup_${new Date().toISOString().slice(0,10)}.json"`);
        res.status(200).send(json);
    } catch (err) { handleServerError(res, err); }
});

router.post('/import/full', async (req, res) => {
    try {
        const userId = req.userId;
        const data = req.body;
        if (!data || !data.transactions) return res.status(400).json(fail('无效的备份文件'));

        let imported = { accounts: 0, transactions: 0, budgets: 0, goals: 0, investments: 0, transfers: 0 };

        if (data.tags) for (const tag of data.tags) {
            const e = await db.queryOne('SELECT id FROM tags WHERE user_id = ? AND name = ?', [userId, tag.name]);
            if (!e) { await db.query('INSERT INTO tags (user_id, name, color, icon) VALUES (?,?,?,?)', [userId, tag.name, tag.color || '#6366f1', tag.icon || '🏷️']); imported.tags = (imported.tags || 0) + 1; }
        }

        const acMap = {};
        for (const a of (data.accounts || [])) {
            const e = await db.queryOne('SELECT id FROM accounts WHERE user_id = ? AND name = ?', [userId, a.name]);
            if (e) { acMap[a.name] = e.id; continue; }
            const r = await db.query('INSERT INTO accounts (user_id, name, type, icon, balance, opening_balance, credit_limit) VALUES (?,?,?,?,?,?,?)', [userId, a.name, a.type || 'bank', a.icon || '🏦', a.balance || 0, a.opening_balance || 0, a.credit_limit || 0]);
            acMap[a.name] = r.insertId; imported.accounts++;
        }

        for (const t of (data.transactions || [])) {
            const aid = acMap[t.account]; if (!aid) continue;
            const c = await db.queryOne('SELECT id FROM categories WHERE name = ?', [t.category || '其他支出']);
            const date = t.date; // 导出时已规范为 YYYY-MM-DD
            await db.query('INSERT INTO transactions (user_id, account_id, category_id, type, amount, note, date) VALUES (?,?,?,?,?,?,?)', [userId, aid, c ? c.id : 14, t.type || 'expense', t.amount, t.note || '', date]);
            imported.transactions++;
        }

        for (const t of (data.transfers || [])) {
            const fa = acMap[t.from_account], ta = acMap[t.to_account];
            if (!fa || !ta) continue;
            await db.query('INSERT INTO transfers (user_id, from_account_id, to_account_id, amount, note, date, status) VALUES (?,?,?,?,?,?,"completed")', [userId, fa, ta, t.amount, t.note || '', t.date || new Date().toISOString().slice(0, 10)]);
            imported.transfers++;
        }

        for (const b of (data.budgets || [])) {
            await db.query('INSERT IGNORE INTO budgets (user_id, name, period_type, amount, start_date, end_date) VALUES (?,?,?,?,?,?)', [userId, b.name, b.period_type || 'month', b.amount, b.start_date, b.end_date || b.start_date]);
            imported.budgets++;
        }

        for (const g of (data.savings_goals || [])) {
            const aid = g.account ? acMap[g.account] : null;
            await db.query('INSERT IGNORE INTO savings_goals (user_id, name, target_amount, current_amount, icon, note, status, account_id) VALUES (?,?,?,?,?,?,?,?)', [userId, g.name, g.target_amount, g.current_amount || 0, g.icon || '🎯', g.note || '', g.status || 'active', aid]);
            imported.goals++;
        }

        for (const i of (data.investments || [])) {
            const aid = i.account ? acMap[i.account] : null;
            const it = await db.queryOne('SELECT id FROM investment_types WHERE name = ?', [i.type_name || '其他']);
            await db.query('INSERT IGNORE INTO investments (user_id, account_id, investment_type_id, name, code, buy_price, current_price, quantity, total_cost, current_value, fee, buy_date, expected_rate, status, note) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [userId, aid, it ? it.id : 1, i.name, i.code || '', i.buy_price, i.current_price, i.quantity, i.total_cost, i.current_value, i.fee || 0, i.buy_date, i.expected_rate || 0, i.status || 'holding', i.note || '']);
            imported.investments++;
        }

        res.json(success({ imported }, '账本导入完成'));
    } catch (err) { handleServerError(res, err, '账本导入'); }
});

module.exports = router;
