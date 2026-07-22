#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

function normalizePath(p) {
    return '/' + p.replace(/^\/+|\/+$/g, '').replace(/\/+/g, '/');
}

function extractRoutes(filePath) {
    const code = fs.readFileSync(filePath, 'utf8');
    const routes = new Set();
    // 支持单/双/反引号字符串 + 模板字符串（${} 参数归一为 :param）
    const re = /router\.(get|post|put|delete)\s*\(\s*['"`]([^'"`]+)['"`]/g;
    let m;
    while ((m = re.exec(code)) !== null) {
        routes.add(normalizePath(m[2].replace(/\$\{[^}]+\}/g, ':param')));
    }
    return routes;
}

// 后端路由
const mainRoutes = extractRoutes(path.join(ROOT, 'server', 'routes.js'));
const subRoutes = [
    { file: 'server/routes/ai.js', prefix: '/ai' },
    { file: 'server/routes/auth.js', prefix: '/auth' },
    { file: 'server/routes/accounts.js', prefix: '/accounts' },
];
const allBackend = new Set(mainRoutes);
for (const s of subRoutes) {
    const f = path.join(ROOT, s.file);
    if (!fs.existsSync(f)) continue;
    for (const r of extractRoutes(f)) {
        allBackend.add(normalizePath(s.prefix + '/' + r));
    }
}

// 前端调用：把模板字符串中的 ${...} 归一为 :param，避免误报
const jsFiles = ['js/app.js', 'js/auth.js', 'js/login.js'];
const frontendCalls = new Set();
for (const file of jsFiles) {
    const code = fs.readFileSync(path.join(ROOT, file), 'utf8');
    // 匹配 api('...') / api("...") / api(`...`)，里面允许 ${...} 模板插值
    const re = /api\s*\(\s*(['"`])([^'"`]+)\1/g;
    let m;
    while ((m = re.exec(code)) !== null) {
        let p = m[2];
        // 只取 path 部分（问号之前），模板插值归一为 :param
        p = p.split('?')[0].replace(/\$\{[^}]+\}/g, ':param');
        if (!p) continue;
        frontendCalls.add(normalizePath(p));
    }
}

console.log(`后端路由: ${allBackend.size} 个, 前端调用: ${frontendCalls.size} 个\n`);

// 检查缺失
const missing = [];
for (const call of frontendCalls) {
    if (allBackend.has(call)) continue;
    // 模糊匹配 :id
    let found = false;
    for (const route of allBackend) {
        const pattern = route.replace(/\/:id/g, '/:param').replace(/\/:providerId/g, '/:param');
        if (call === pattern) { found = true; break; }
    }
    if (!found) missing.push(call);
}

if (missing.length === 0) {
    console.log('✅ 所有前端 API 调用均有对应后端路由！');
} else {
    console.log(`❌ 缺失 ${missing.length} 个路由:`);
    missing.forEach(m => console.log(`   ${m}`));
    process.exit(1);
}
