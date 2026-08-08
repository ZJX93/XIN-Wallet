/* ============================================
   鑫钱包 · 账户资金明细回归测试
   覆盖：GET /accounts/:id/transactions 不再因引用不存在的列崩溃。
   回归点：还款流水 SQL 曾写 `d.icon as debt_icon`（debts 表无 icon 列），
           导致任何账户点"资金明细"都 500（column d.icon does not exist）。
           修复：改为常量图标，不再引用不存在的列。
   运行前置：需 PostgreSQL（与 CI postgres:16 服务一致）
   ============================================ */
const test = require('node:test');
const assert = require('node:assert');
const express = require('express');

require('dotenv').config({ path: __dirname + '/../.env' });

const db = require('../server/db');
const accountsRouter = require('../server/routes/accounts');

const TEST_USER_ID = 987654;
const app = express();
app.use(express.json());
// mock 鉴权：直接注入固定 userId（本测试不验证鉴权本身）
app.use((req, res, next) => { req.userId = TEST_USER_ID; next(); });
app.use('/api/accounts', accountsRouter);

let server;
let base;
let accId;

async function listen() {
    return new Promise(resolve => {
        server = app.listen(0, () => {
            base = `http://127.0.0.1:${server.address().port}`;
            resolve();
        });
    });
}
async function req(method, path, body) {
    const res = await fetch(base + path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json };
}

test.before(async () => {
    await listen();
    const create = await req('POST', '/api/accounts', {
        name: '回归测试账户', type: 'cash', icon: '💵', balance: 0, opening_balance: 0
    });
    accId = create.json.data && create.json.data.id;
    assert.ok(accId, '测试账户应创建成功并拿到 id');
});

test.after(async () => {
    try { await db.query('DELETE FROM accounts WHERE user_id = ?', [TEST_USER_ID]); } catch (_) {}
    if (server) server.close();
});

test('账户资金明细接口返回 200（回归 column d.icon does not exist 500）', async () => {
    const r = await req('GET', `/api/accounts/${accId}/transactions`);
    assert.strictEqual(r.status, 200, '修复前会因 debts.icon 不存在返回 500');
    assert.ok(r.json.success, '响应应标记为成功');
    assert.ok(Array.isArray(r.json.data.transactions), '应返回 transactions 数组');
});
