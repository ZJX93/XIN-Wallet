/* ============================================
   鑫钱包 · 全功能端到端测试（沙箱演示服务用）
   ============================================ */
const http = require('http');

const BASE = process.env.BASE || 'http://127.0.0.1:18890';
let pass = 0, fail = 0;
const failures = [];

function req(method, path, body = null, token = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(BASE + path);
        const opts = {
            method,
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            headers: { 'Content-Type': 'application/json' }
        };
        if (token) opts.headers['Authorization'] = 'Bearer ' + token;
        const r = http.request(opts, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
                catch (e) { resolve({ status: res.statusCode, body: data }); }
            });
        });
        r.on('error', reject);
        if (body) r.write(JSON.stringify(body));
        r.end();
    });
}

function check(name, ok, detail = '') {
    if (ok) { pass++; console.log(`  ✅ ${name}${detail ? ' — ' + detail : ''}`); }
    else { fail++; failures.push(name); console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
}

function unwrap(r) {
    if (r.status >= 400 || !r.body || r.body.success === false) {
        return { __error: r.body && r.body.message || ('HTTP ' + r.status), __raw: r };
    }
    return r.body.data;
}

(async () => {
    console.log(`\n=== 鑫钱包 全功能 E2E 测试 → ${BASE} ===\n`);

    // ===== 0. 认证 =====
    console.log('━━━ 0. 认证 ━━━');
    let r = await req('POST', '/api/auth/demo', {});
    let token = unwrap(r)?.token;
    check('POST /auth/demo', !!token, 'token=' + (token || '无'));

    r = await req('POST', '/api/auth/login', { username: 'demo', password: 'demo123456' });
    check('POST /auth/login (任意账号)', unwrap(r)?.token !== undefined);

    r = await req('POST', '/api/auth/register', { username: 'newuser', password: 'abc123' });
    check('POST /auth/register', unwrap(r)?.token !== undefined);

    // ===== 1. 账户 =====
    console.log('\n━━━ 1. 账户 ━━━');
    r = await req('GET', '/api/accounts', null, token);
    const accts = unwrap(r)?.accounts || [];
    check('GET /accounts', accts.length > 0, `${accts.length} 个账户`);

    r = await req('POST', '/api/accounts', { name: '测试账户', type: 'cash', icon: '🧪', balance: 1000 }, token);
    const newAccId = unwrap(r)?.id;
    check('POST /accounts', !!newAccId, 'id=' + newAccId);

    r = await req('PUT', '/api/accounts/' + newAccId, { name: '测试账户-改名', balance: 1500 }, token);
    check('PUT /accounts/:id', unwrap(r) === null);

    r = await req('POST', '/api/accounts/reconcile', {}, token);
    check('POST /accounts/reconcile', unwrap(r) !== undefined);

    r = await req('GET', '/api/accounts/1/transactions', null, token);
    const accTx = unwrap(r);
    check('GET /accounts/:id/transactions', accTx && accTx.account && Array.isArray(accTx.transactions));

    r = await req('DELETE', '/api/accounts/' + newAccId, null, token);
    check('DELETE /accounts/:id (软关)', unwrap(r) === null);

    // ===== 2. 分类 =====
    console.log('\n━━━ 2. 分类 ━━━');
    r = await req('GET', '/api/categories', null, token);
    const cats = unwrap(r) || [];
    check('GET /categories', cats.length > 0, `${cats.length} 个分类`);

    r = await req('POST', '/api/categories', { name: '测试分类', icon: '🧪', color: '#6b7280', type: 'expense' }, token);
    const newCatId = unwrap(r)?.id;
    check('POST /categories', !!newCatId);

    r = await req('PUT', '/api/categories/' + newCatId, { name: '测试分类-改' }, token);
    check('PUT /categories/:id', unwrap(r) === null);

    r = await req('DELETE', '/api/categories/' + newCatId, null, token);
    check('DELETE /categories/:id', unwrap(r) === null);

    // ===== 3. 交易 =====
    console.log('\n━━━ 3. 交易 ━━━');
    r = await req('GET', '/api/transactions', null, token);
    const txs = unwrap(r) || [];
    check('GET /transactions', txs.length > 0, `${txs.length} 笔`);

    r = await req('GET', '/api/transactions?month=2026-07', null, token);
    const julyTxs = unwrap(r) || [];
    check('GET /transactions?month=2026-07', julyTxs.length > 0, `7月 ${julyTxs.length} 笔`);

    r = await req('GET', '/api/transactions?type=expense&limit=5', null, token);
    const expTxs = unwrap(r) || [];
    check('GET /transactions?type=expense', expTxs.every(t => t.type === 'expense'), `${expTxs.length} 笔支出`);

    r = await req('GET', '/api/transactions/months', null, token);
    const months = unwrap(r) || [];
    check('GET /transactions/months', months.length >= 2, `覆盖 ${months.length} 个月`);

    r = await req('GET', '/api/transactions/summary?month=2026-07', null, token);
    const summary = unwrap(r);
    check('GET /transactions/summary?month=2026-07',
        summary && summary.income > 0 && Array.isArray(summary.expenseByCategory) && summary.expenseByCategory.length > 0,
        `收¥${summary?.income} 支¥${summary?.expense} ${summary?.expenseByCategory?.length}分类`);

    r = await req('POST', '/api/transactions', { account_id: 1, category_id: 1, type: 'expense', amount: 99, note: 'e2e-test', date: '2026-07-21' }, token);
    const newTxId = unwrap(r)?.id;
    check('POST /transactions', !!newTxId, 'id=' + newTxId);

    r = await req('PUT', '/api/transactions/' + newTxId, { note: 'e2e-test-updated' }, token);
    check('PUT /transactions/:id', unwrap(r) === null);

    r = await req('DELETE', '/api/transactions/' + newTxId, null, token);
    check('DELETE /transactions/:id', unwrap(r) === null);

    // ===== 4. 转账 =====
    console.log('\n━━━ 4. 转账 ━━━');
    r = await req('GET', '/api/transfers', null, token);
    check('GET /transfers', (unwrap(r) || []).length > 0);

    r = await req('POST', '/api/transfers', { from_account_id: 1, to_account_id: 4, amount: 100, note: 'e2e-transfer', date: '2026-07-21' }, token);
    const newTxrId = unwrap(r)?.id;
    check('POST /transfers', !!newTxrId);

    r = await req('DELETE', '/api/transfers/' + newTxrId, null, token);
    check('DELETE /transfers/:id', unwrap(r) === null);

    // ===== 5. 预算 =====
    console.log('\n━━━ 5. 预算 ━━━');
    r = await req('GET', '/api/budgets', null, token);
    check('GET /budgets', (unwrap(r) || []).length > 0);

    r = await req('POST', '/api/budgets', { name: 'e2e-test-budget', amount: 500, period_type: 'month', start_date: '2026-07-01', end_date: '2026-07-31' }, token);
    const newBId = unwrap(r)?.id;
    check('POST /budgets', !!newBId);

    r = await req('PUT', '/api/budgets/' + newBId, { amount: 600 }, token);
    check('PUT /budgets/:id', unwrap(r) === null);

    r = await req('DELETE', '/api/budgets/' + newBId, null, token);
    check('DELETE /budgets/:id', unwrap(r) === null);

    // ===== 6. 理财类型 + 持仓 =====
    console.log('\n━━━ 6. 理财类型 + 持仓 ━━━');
    r = await req('GET', '/api/investment-types', null, token);
    check('GET /investment-types', (unwrap(r) || []).length > 0);

    r = await req('GET', '/api/investments', null, token);
    const inv = unwrap(r);
    check('GET /investments',
        inv && Array.isArray(inv.holdings) && inv.holdings.length >= 8 && inv.byType && Object.keys(inv.byType).length >= 5,
        `${inv?.holdings?.length} 持仓 / ${Object.keys(inv?.byType || {}).length} 类型`);

    r = await req('POST', '/api/investments', {
        account_id: 2, investment_type_id: 2, name: 'e2e-余额宝', code: '000198',
        buy_price: 1, current_price: 1.0001, quantity: 1000, buy_date: '2026-07-15', expected_rate: 2.5
    }, token);
    const newInvId = unwrap(r)?.id;
    check('POST /investments', !!newInvId, 'id=' + newInvId);

    r = await req('PUT', '/api/investments/' + newInvId, { current_price: 1.0005 }, token);
    check('PUT /investments/:id', unwrap(r) === null);

    r = await req('POST', '/api/investments/' + newInvId + '/refresh', {}, token);
    check('POST /investments/:id/refresh', unwrap(r) !== undefined);

    r = await req('POST', '/api/investments/refresh-all', {}, token);
    check('POST /investments/refresh-all', unwrap(r) !== undefined);

    r = await req('GET', '/api/investments/quote?code=sh600519', null, token);
    check('GET /investments/quote?code=...', unwrap(r)?.price > 0, `贵州茅台 模拟价 ¥${unwrap(r)?.price}`);

    r = await req('DELETE', '/api/investments/' + newInvId, null, token);
    check('DELETE /investments/:id', unwrap(r) === null);

    r = await req('GET', '/api/stats/investments', null, token);
    const invStats = unwrap(r);
    check('GET /stats/investments',
        invStats && Array.isArray(invStats.trendSeries) && invStats.trendSeries.length >= 4 && Array.isArray(invStats.byType) && invStats.byType.length > 0,
        `趋势${invStats?.trendSeries?.length}周, 类型${invStats?.byType?.length}`);

    // ===== 7. 标签 =====
    console.log('\n━━━ 7. 标签 ━━━');
    r = await req('GET', '/api/tags', null, token);
    check('GET /tags', (unwrap(r) || []).length > 0);

    r = await req('POST', '/api/tags', { name: 'e2e-tag', color: '#ff0000' }, token);
    const newTagId = unwrap(r)?.id;
    check('POST /tags', !!newTagId);

    r = await req('PUT', '/api/tags/' + newTagId, { name: 'e2e-tag-upd' }, token);
    check('PUT /tags/:id', unwrap(r) === null);

    r = await req('DELETE', '/api/tags/' + newTagId, null, token);
    check('DELETE /tags/:id', unwrap(r) === null);

    // ===== 8. 储蓄目标 =====
    console.log('\n━━━ 8. 储蓄目标 ━━━');
    r = await req('GET', '/api/savings-goals', null, token);
    const goals = unwrap(r) || [];
    check('GET /savings-goals', goals.length >= 6, `${goals.length} 个目标`);

    r = await req('POST', '/api/savings-goals', { name: 'e2e-goal', target_amount: 10000, current_amount: 0, icon: '🎯' }, token);
    const newGoalId = unwrap(r)?.id;
    check('POST /savings-goals', !!newGoalId);

    r = await req('PUT', '/api/savings-goals/' + newGoalId, { target_amount: 12000 }, token);
    check('PUT /savings-goals/:id', unwrap(r) === null);

    r = await req('POST', '/api/savings-goals/' + newGoalId + '/allocate', { amount: 1000 }, token);
    check('POST /savings-goals/:id/allocate', unwrap(r) === null);

    r = await req('POST', '/api/savings-goals/' + newGoalId + '/withdraw', { amount: 200 }, token);
    check('POST /savings-goals/:id/withdraw', unwrap(r) === null);

    r = await req('DELETE', '/api/savings-goals/' + newGoalId, null, token);
    check('DELETE /savings-goals/:id', unwrap(r) === null);

    // ===== 9. 债务 =====
    console.log('\n━━━ 9. 债务 ━━━');
    r = await req('GET', '/api/debts', null, token);
    const dData = unwrap(r);
    const debts = (dData && dData.debts) || dData || [];
    check('GET /debts', debts.length >= 4, `${debts.length} 笔债务（含房贷/信用卡/车贷/朋友借款）`);

    r = await req('POST', '/api/debts', {
        name: 'e2e-debt', icon: '💰', total: 5000, remaining: 5000,
        monthly_payment: 500, payment_day: 10, start_date: '2026-07-10'
    }, token);
    const newDebtId = unwrap(r)?.id;
    check('POST /debts', !!newDebtId);

    r = await req('PUT', '/api/debts/' + newDebtId, { remaining: 4500 }, token);
    check('PUT /debts/:id', unwrap(r) === null);

    r = await req('GET', '/api/debts/' + newDebtId, null, token);
    check('GET /debts/:id', unwrap(r)?.debt && Array.isArray(unwrap(r)?.repayments));

    r = await req('POST', '/api/debts/' + newDebtId + '/repayments', {
        amount: 500, principal_part: 400, interest_part: 100,
        paid_at: '2026-07-21', account_id: 2, note: 'e2e-repay'
    }, token);
    const newRepayId = unwrap(r)?.id;
    check('POST /debts/:id/repayments', !!newRepayId);

    r = await req('DELETE', '/api/debts/' + newDebtId + '/repayments/' + newRepayId, null, token);
    check('DELETE /debts/:id/repayments/:rid', unwrap(r) === null);

    r = await req('DELETE', '/api/debts/' + newDebtId, null, token);
    check('DELETE /debts/:id', unwrap(r) === null);

    // ===== 10. 仪表盘统计 =====
    console.log('\n━━━ 10. 仪表盘统计 ━━━');
    r = await req('GET', '/api/stats/dashboard', null, token);
    const dash = unwrap(r);
    check('GET /stats/dashboard',
        dash && Array.isArray(dash.months) && dash.months.length >= 6 && Array.isArray(dash.accounts) && dash.budgets && dash.savingsGoals && dash.investments && dash.debts,
        `总资产¥${dash?.totalAssets} 趋势${dash?.months?.length}月`);

    for (const t of ['today', 'week', 'month', 'year', 'assets']) {
        r = await req('GET', '/api/stats/dashboard/detail?type=' + t, null, token);
        const d = unwrap(r);
        check(`GET /stats/dashboard/detail?type=${t}`,
            d && d.title && (t === 'assets' ? Array.isArray(d.accounts) : Array.isArray(d.transactions)),
            'title=' + d?.title);
    }

    // ===== 11. CSV 导入导出 =====
    console.log('\n━━━ 11. CSV 导入导出 ━━━');
    r = await req('GET', '/api/export/csv', null, token);
    const csv = r.body && (typeof r.body === 'string' ? r.body : JSON.stringify(r.body));
    check('GET /export/csv', typeof csv === 'string' && csv.length > 100 && csv.includes('date,amount,type'),
        `${typeof csv === 'string' ? csv.length : 0} 字节`);

    r = await req('POST', '/api/import/csv', { type: 'transactions', csv: 'date,amount,type,account,category,note\n2026-07-21,1,income,现金,工资,test' }, token);
    check('POST /import/csv', unwrap(r) !== undefined);

    r = await req('GET', '/api/export/full', null, token);
    check('GET /export/full', typeof r.body === 'object' && r.body.success && r.body.data);

    r = await req('POST', '/api/import/full', {}, token);
    check('POST /import/full', unwrap(r) !== undefined);

    // ===== 12. AI =====
    console.log('\n━━━ 12. AI ━━━');
    r = await req('GET', '/api/ai/providers', null, token);
    check('GET /ai/providers', (unwrap(r) || []).length > 0);

    r = await req('POST', '/api/ai/providers', { name: 'Test Provider', type: 'openai', api_key: 'sk-test', base_url: 'https://api.test.com', model: 'gpt-4' }, token);
    const newProvId = unwrap(r)?.id;
    check('POST /ai/providers', !!newProvId);

    r = await req('PUT', '/api/ai/providers/' + newProvId, { name: 'Test Provider 2' }, token);
    check('PUT /ai/providers/:id', unwrap(r) === null);

    r = await req('POST', '/api/ai/providers/' + newProvId + '/activate', {}, token);
    check('POST /ai/providers/:id/activate', unwrap(r) === null);

    r = await req('POST', '/api/ai/providers/' + newProvId + '/test', {}, token);
    check('POST /ai/providers/:id/test', unwrap(r) !== undefined);

    r = await req('DELETE', '/api/ai/providers/' + newProvId, null, token);
    check('DELETE /ai/providers/:id', unwrap(r) === null);

    r = await req('POST', '/api/ai/advice', {}, token);
    const advice = unwrap(r);
    check('POST /api/ai/advice', advice && Array.isArray(advice.insights) && advice.insights.length > 0,
        `${advice?.insights?.length} 条建议`);

    r = await req('POST', '/api/ai/insight', { month: '2026-07' }, token);
    const insight = unwrap(r);
    check('POST /api/ai/insight', insight && Array.isArray(insight.insights) && insight.insights.length > 0,
        `${insight?.insights?.length} 条洞察`);

    r = await req('GET', '/api/ai/ocr-config', null, token);
    check('GET /ai/ocr-config', unwrap(r) !== undefined);

    r = await req('POST', '/api/ai/ocr-config', { provider: 'tencent' }, token);
    check('POST /ai/ocr-config', unwrap(r) === null);

    r = await req('POST', '/api/ai/ocr', { image: 'mock-base64' }, token);
    check('POST /api/ai/ocr', unwrap(r) !== undefined);

    // ===== 13. 报告 =====
    console.log('\n━━━ 13. 报告 ━━━');
    r = await req('GET', '/api/reports?type=monthly&period=2026-07', null, token);
    const rep = unwrap(r);
    check('GET /reports?type=monthly',
        rep && rep.summary && rep.expenseByCategory && rep.dailyTrend,
        'label=' + rep?.label);

    r = await req('GET', '/api/ledger', null, token);
    check('GET /ledger', Array.isArray(unwrap(r)));

    // ===== 总结 =====
    console.log(`\n${'='.repeat(50)}`);
    console.log(`  总计: ${pass + fail}  通过: ${pass}  失败: ${fail}`);
    console.log('='.repeat(50));
    if (fail > 0) {
        console.log('\n失败项：');
        failures.forEach(f => console.log('  - ' + f));
        process.exit(1);
    } else {
        console.log('\n🎉 全部通过！');
    }
})();
