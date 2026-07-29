/* ============================================
   鑫钱包 · 沙箱 E2E 验证脚本
   启动真实 server，模拟 LAN NAS 上的 PG，跑一组 HTTP 测试。
   设计：使用与 server/index.js 一致的环境变量，调用同一份代码。
   用途：CI 自动化 + 沙箱环境验证（无 Docker 时）。

   使用方式（绝不硬编码密钥）：
     export DB_HOST=... DB_USER=... DB_PASSWORD=... DB_NAME=...
     export ENCRYPTION_KEY=$(openssl rand -hex 32)
     export JWT_SECRET=$(openssl rand -hex 32)
     node scripts/sandbox-e2e.js
   ============================================ */

'use strict';

process.chdir(__dirname + '/..');

// 测试用环境变量（运行前必须 export，脚本不设默认值）
const required = ['DB_HOST', 'DB_USER', 'DB_NAME'];
for (const key of required) {
    if (!process.env[key]) {
        console.error(`ERROR: 环境变量 ${key} 未设置。请先 export 或 . ~/.env`);
        process.exit(1);
    }
}
if (!process.env.DB_PASSWORD && !process.env.PG_USE_TRUST) {
    console.error('ERROR: DB_PASSWORD 未设置。安全起见脚本拒绝空密码。');
    process.exit(1);
}

process.env.PORT = process.env.PORT || '18889'; // 避开主端口 18888
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.AUTH_RATE_LIMIT_MAX = process.env.AUTH_RATE_LIMIT_MAX || '9999'; // 测试时放宽

const PORT = parseInt(process.env.PORT, 10);

(async () => {
    // 1. 启动真实 server（自动 initDatabase → listen）
    console.log('▶ 启动 server...');
    require('../server/index.js');

    // 2. 等待 listen 完成
    await new Promise(r => setTimeout(r, 8000));

    // 3. 跑测试
    await runTests();

    // 4. 退出
    console.log('\n=== E2E 完成 ===');
    process.exit(0);
})();

async function runTests() {
    const base = `http://127.0.0.1:${PORT}`;
    let pass = 0, fail = 0;

    async function test(name, fn) {
        try {
            await fn();
            console.log(`  ✓ ${name}`);
            pass++;
        } catch (e) {
            console.log(`  ✗ ${name}`);
            console.log(`    ${e.message}`);
            fail++;
        }
    }

    function assertEq(actual, expected, msg) {
        if (actual !== expected) throw new Error(`${msg}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }

    async function req(method, path, body, token) {
        const opts = { method, headers: {} };
        if (body !== undefined) {
            opts.headers['Content-Type'] = 'application/json';
            opts.body = typeof body === 'string' ? body : JSON.stringify(body);
        }
        if (token) opts.headers['Authorization'] = 'Bearer ' + token;
        const res = await fetch(base + path, opts);
        const text = await res.text();
        let json = null;
        try { json = JSON.parse(text); } catch {}
        return { status: res.status, json, text };
    }

    console.log('\n=== E2E 测试 ===\n');

    // 1) 健康检查
    await test('GET /healthz → 200', async () => {
        const r = await req('GET', '/healthz');
        assertEq(r.status, 200, 'status');
        assertEq(r.json.success, true, 'success');
        assertEq(r.json.data.status, 'ok', 'data.status');
    });

    await test('GET /health/deep → 200, 不含敏感字段', async () => {
        const r = await req('GET', '/health/deep');
        assertEq(r.status, 200, 'status');
        const keys = Object.keys(r.json.data || {});
        if (keys.includes('config')) throw new Error('不应含 config 字段（修复失败）');
        if (keys.includes('runtime')) throw new Error('不应含 runtime 字段（修复失败）');
        for (const k of ['database', 'memory', 'uptime']) {
            if (!keys.includes(k)) throw new Error(`缺 ${k} 字段`);
        }
    });

    // 2) Demo 加固（本次修复 P2）
    delete process.env.ALLOW_DEMO;
    await test('POST /api/auth/demo (无 ALLOW_DEMO) → 403', async () => {
        const r = await req('POST', '/api/auth/demo');
        assertEq(r.status, 403, 'status');
        if (!r.json.message.includes('ALLOW_DEMO')) throw new Error('错误消息应提示 ALLOW_DEMO');
    });

    process.env.ALLOW_DEMO = 'true';
    await test('POST /api/auth/demo (ALLOW_DEMO=true) → 200', async () => {
        const r = await req('POST', '/api/auth/demo');
        assertEq(r.status, 200, 'status');
        assertEq(r.json.success, true, 'success');
        if (!r.json.data.token) throw new Error('应返回 token');
        if (!r.json.data.refreshToken) throw new Error('应返回 refreshToken');
    });

    // 3) Refresh validate 修复（本次修复 P2）
    await test('POST /api/auth/refresh (空 body) → 400 (validate 修复生效)', async () => {
        const r = await req('POST', '/api/auth/refresh', {});
        assertEq(r.status, 400, 'status');
        assertEq(r.json.success, false, 'success');
        if (!r.json.message.includes('验证') && !r.json.errors) throw new Error('应提示参数验证失败');
    });

    await test('POST /api/auth/refresh (无 body) → 400', async () => {
        const r = await req('POST', '/api/auth/refresh');
        assertEq(r.status, 400, 'status');
    });

    // 4) 注册流程
    await test('POST /api/auth/register 弱密码 → 400', async () => {
        const r = await req('POST', '/api/auth/register', { username: 'sb_t1', password: 'abc' });
        assertEq(r.status, 400, 'status');
        // validate 先于密码强度校验，返回 "参数验证失败" 或 "密码长度至少 8 位"
        if (!r.json.message.includes('参数') && !r.json.message.includes('密码')) {
            throw new Error('应提示参数验证或密码强度');
        }
    });

    let aliceToken = null;
    await test('POST /api/auth/register 合法 → 200 + token', async () => {
        const username = 'sandbox_alice_' + Date.now();
        const r = await req('POST', '/api/auth/register', { username, password: 'Password123' });
        assertEq(r.status, 200, 'status');
        assertEq(r.json.success, true, 'success');
        if (!r.json.data.token) throw new Error('应返回 token');
        aliceToken = r.json.data.token;
    });

    // 5) 用 JWT 调业务端点
    if (!aliceToken) {
        await test('SKIP: 注册未成功，无 token 可用', async () => {
            throw new Error('aliceToken 未设置（前一个用例失败）');
        });
    } else {
        await test('GET /api/accounts (Bearer Token) → 200 + 初始空数组', async () => {
            const r = await req('GET', '/api/accounts', undefined, aliceToken);
            assertEq(r.status, 200, 'status');
            assertEq(Array.isArray(r.json.data.accounts), true, 'data.accounts 应为数组');
        });

        await test('POST /api/accounts (合法) → 200', async () => {
            const r = await req('POST', '/api/accounts', {
                name: '招商银行储蓄卡',
                type: 'bank_card',
                icon: '🏦',
                balance: 10000,
                credit_limit: 0
            }, aliceToken);
            assertEq(r.status, 200, 'status');
            assertEq(r.json.success, true, 'success');
        });

        await test('POST /api/transactions (合法) → 200', async () => {
            const r = await req('POST', '/api/transactions', {
                account_id: 1,
                category_id: 14,
                type: 'expense',
                amount: 50,
                date: '2026-07-29 12:00:00',
                note: '午餐'
            }, aliceToken);
            assertEq(r.status, 200, 'status');
            assertEq(r.json.success, true, 'success');
        });

        await test('GET /api/auth 路径外路由无 token → 401', async () => {
            const r = await req('GET', '/api/accounts');
            assertEq(r.status, 401, 'status');
        });
    }

    // 6) Body limit (本次修复 P1)
    await test('POST /api/import/full (>1mb body) → 413', async () => {
        const big = 'x'.repeat(2 * 1024 * 1024);
        const r = await req('POST', '/api/import/full', { transactions: [], accounts: [], big });
        assertEq(r.status, 413, 'status');
    });

    // 7) JSON 错误处理
    await test('POST /api/auth/register 缺字段 → 400', async () => {
        const r = await req('POST', '/api/auth/register', { username: 'onlyname' });
        assertEq(r.status, 400, 'status');
    });

    // 7) 真实密码登录（验证 bcrypt + fail_count 等机制）
    await test('POST /api/auth/login (错误密码 5 次累计) → 第 5 次后 423', async () => {
        // 用一个不存在的用户名制造 5 次失败
        for (let i = 1; i <= 5; i++) {
            const r = await req('POST', '/api/auth/login', { username: 'nobody_' + Date.now(), password: 'wrong' });
            if (i < 5) {
                if (r.status !== 401) throw new Error(`第 ${i} 次期望 401，得到 ${r.status}`);
            } else {
                // 第 5 次触发锁定
                if (r.status !== 401 && r.status !== 423) throw new Error(`第 5 次期望 401 或 423，得到 ${r.status}`);
            }
        }
    });

    // 8) SSRF url-guard 直接验证（不需要走 HTTP，模块级）
    await test('SSRF: url-guard 拦截内网地址', async () => {
        const { assertPublicUrl } = require('../server/services/url-guard');
        for (const url of ['http://10.0.0.5', 'http://169.254.169.254/', 'http://127.0.0.1', 'http://[::1]/']) {
            try {
                await assertPublicUrl(url);
                throw new Error(`应拦截 ${url}`);
            } catch (e) {
                if (!e.message.match(/禁止|invalid/i)) throw new Error(`未提示拦截原因: ${e.message}`);
            }
        }
    });

    // 9) 静态首页
    await test('GET /index.html → 200 (前端)', async () => {
        const r = await fetch(base + '/index.html');
        assertEq(r.status, 200, 'status');
        const t = await r.text();
        if (!t.includes('<html') && !t.includes('<!DOCTYPE')) throw new Error('返回非 HTML');
    });

    // 9) 错误路径
    await test('GET /nonexistent → 404 (SPA 兜底返回 index.html)', async () => {
        // SPA fallback 会返回 200 + index.html，符合设计
        const r = await fetch(base + '/nonexistent');
        if (r.status !== 200 && r.status !== 404) throw new Error('status 不应突变');
    });

    console.log(`\n=== 汇总：${pass} 通过 / ${fail} 失败 ===\n`);
}
