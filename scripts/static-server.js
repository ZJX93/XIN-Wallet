// 沙箱专用：纯静态文件服务器（前端预览用，沙箱里没有 MariaDB）
// 仅在沙箱内启动，正式部署请用 `npm start`
const http = require('http');
const fs = require('fs');
const path = require('path');
const PORT = parseInt(process.env.PORT || '18889', 10);
const HOST = '127.0.0.1';
const ROOT = path.join(__dirname, '..');

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
    '.woff': 'font/woff',
    '.ttf': 'font/ttf',
    '.eot': 'application/vnd.ms-fontobject'
};

const server = http.createServer((req, res) => {
    let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    if (urlPath === '/') urlPath = '/login.html';
    // 兼容 Express 的干净路由：/login → login.html；其它非 /api 非静态文件的路径兜底到 index.html
    if (urlPath === '/login') urlPath = '/login.html';
    if (urlPath === '/healthz') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"success":true,"data":{"status":"ok"}}');
        return;
    }
    // 阻止越权读取源码目录
    if (/^\/(server|node_modules|\.env)/i.test(urlPath)) {
        res.writeHead(404);
        res.end('blocked');
        return;
    }
    let filePath = path.join(ROOT, urlPath);
    if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end('forbidden'); return; }
    fs.readFile(filePath, (err, data) => {
        // 文件不存在 + 看起来像 SPA 路径 → 兜底到 index.html（干净路由场景）
        if (err && !path.extname(urlPath) && !urlPath.startsWith('/api')) {
            filePath = path.join(ROOT, 'index.html');
            fs.readFile(filePath, (e2, data2) => {
                if (e2) { res.writeHead(404); res.end('not found: ' + urlPath); return; }
                res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache' });
                res.end(data2);
            });
            return;
        }
        if (err) { res.writeHead(404); res.end('not found: ' + urlPath); return; }
        const ext = path.extname(filePath).toLowerCase();
        const type = MIME[ext] || 'application/octet-stream';
        const cache = ext === '.html' ? 'no-cache'
            : filePath.includes('vendor') ? 'public, max-age=604800'
            : 'public, max-age=3600';
        res.writeHead(200, { 'Content-Type': type, 'Cache-Control': cache });
        res.end(data);
    });
});
server.listen(PORT, HOST, () => {
    console.log(`[sandbox] static server on http://${HOST}:${PORT}`);
});
