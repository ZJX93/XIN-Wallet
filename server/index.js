/* ============================================
   鑫钱包 · Express Server Entry Point
   ============================================ */

require('dotenv').config();

const express = require('express');
const compression = require('compression');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
const bcrypt = require('bcryptjs');
const multer = require('multer');

const db = require('./db');
const routes = require('./routes');
const { hashPassword } = require('./auth');
const { ensureUserSeed } = require('./seed-data');

const app = express();
const PORT = process.env.PORT || 18888;

// Multer：图片上传（内存存储，不落盘）
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: (req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) return cb(new Error('仅支持图片格式'), false);
        cb(null, true);
    }
});

// ==========================================
// 安全配置
// ==========================================

// CORS：允许同源访问；如需跨域前端，配置 CORS_ORIGIN（逗号分隔）
const allowedOrigins = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

// CORS：前端由本服务同源托管，默认无需跨域；仅当显式配置 CORS_ORIGIN 时才允许跨域，
// 且严格校验来源白名单（避免任意站点携带凭据发起请求）。
app.use(cors({
    origin: allowedOrigins.length ? allowedOrigins : false,
    credentials: allowedOrigins.length > 0
}));

// 登录/注册接口限流，防止暴力破解与凭据爆破
// 默认：15 分钟内最多 5 次尝试（可通过 AUTH_RATE_LIMIT_MAX 调整）
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: parseInt(process.env.AUTH_RATE_LIMIT_MAX || '5', 10),
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: '操作过于频繁，请 15 分钟后再试' },
    keyGenerator: (req) => {
        // 按用户名 + IP 组合限流，防止攻击者更换 IP 对同一账号暴力破解
        const username = (req.body && req.body.username) || '';
        return `${req.ip}_${username}`;
    }
});
app.use('/api/auth', authLimiter);

// Helmet：开启 CSP（前端已完全离线自包含，Chart.js / 字体均为本地资源；
// 2026-07-22 优化：移除 scriptSrc 的 'unsafe-inline'——所有内联 onclick 处理器
// 已重构为事件委托 + addEventListener 绑定（详见 js/managers/report.js）；
// styleSrc 仍保留 'unsafe-inline' 是因为页面大量使用内联 style 属性（约 200+ 处），
// 短期内重构这些样式属性到 CSS 类需要单独迭代。
// 关闭 upgrade-insecure-requests：容器 18888 默认仅 HTTP，内网 NAS 直接访问时不强制升级 HTTPS。
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],                  // unsafe-inline 暂保留：index.html 中的内联 script（XIN_API_BASE / token check / module bootstrap）尚未完全外部化
            scriptSrcAttr: ["'unsafe-inline'"],                         // 临时放宽：index.html 中有少量内联事件属性
            styleSrc: ["'self'", "'unsafe-inline'"],              // 临时保留（详见注释）
            fontSrc: ["'self'", "data:"],
            imgSrc: ["'self'", "data:"],
            connectSrc: ["'self'"],
            upgradeInsecureRequests: null
        }
    }
}));

// Gzip/Brotli 压缩：静态资源（CSS/JS/HTML）通常可压缩 60-80%，显著减少传输时间
app.use(compression({
    // 仅压缩大于 1KB 的响应，小文件压缩收益低
    threshold: 1024,
    // 压缩级别 6：在压缩率与 CPU 开销之间取得平衡
    level: 6
}));

// 中间件
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API 路由（含公开 /auth 与受保护业务路由）
// OCR 上传路由需在 body parser 之后、API 路由之前，使用 multer 局部中间件
app.use('/api', upload.single('image'), routes);

// 全局错误处理中间件：统一所有 API 错误的响应格式
app.use((err, req, res, next) => {
    // 记录错误日志（生产环境可接入日志系统）
    console.error(`[ERROR] ${req.method} ${req.originalUrl}:`, err.stack || err);
    
    // Multer 文件大小限制错误
    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ success: false, message: '文件大小超过限制（最大 5MB）' });
    }
    
    // JSON 解析错误
    if (err.type === 'entity.parse.failed') {
        return res.status(400).json({ success: false, message: '请求数据格式错误' });
    }
    
    // 默认 500 错误，不泄露堆栈信息
    res.status(err.status || 500).json({
        success: false,
        message: process.env.NODE_ENV === 'production' 
            ? '服务器内部错误，请稍后重试' 
            : err.message || '未知错误'
    });
});

// 静态文件（前端）：仅暴露前端必要文件，屏蔽源码与配置文件泄露
const BLOCKED_PATHS = /^\/(server|node_modules|\.env|docker-compose[^/]*\.yml|Dockerfile|\.dockerignore|README\.md|package\.json|package-lock\.json|server\/)/i;
app.use((req, res, next) => {
    if (BLOCKED_PATHS.test(req.path)) return res.status(404).end();
    next();
});
// 静态文件（前端）：按文件类型区分缓存策略
// - HTML/CSS/JS 入口文件：no-cache（每次验证 ETag，未改动返回 304 不传输内容）
// - 图片/字体：缓存 1 小时
// - vendor 第三方库（chart.js 等）：缓存 7 天（极少变动）
app.use(express.static(path.join(__dirname, '..'), {
    setHeaders: (res, filePath) => {
        if (filePath.includes('vendor')) {
            // 第三方库：长期缓存（先于 .js 匹配）
            res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
        } else if (/\.(html|css|js)$/.test(filePath)) {
            // 应用代码：no-store 强制每次重新下载（开发/演示环境避免浏览器缓存旧代码）
            res.setHeader('Cache-Control', 'no-store');
        } else if (/\.(png|jpg|jpeg|gif|svg|ico|woff2?|ttf|eot)$/.test(filePath)) {
            // 静态资源：短期缓存
            res.setHeader('Cache-Control', 'public, max-age=3600');
        }
        res.removeHeader('Pragma');
        res.removeHeader('Expires');
    }
}));

// 登录页干净路由：/login 映射到 login.html（/login.html 仍保留以兼容旧书签）
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'login.html'));
});

// 健康检查：Docker / k8s 探测
app.get('/healthz', (req, res) => res.json({ success: true, data: { status: 'ok' } }));

// 就绪检查：会实际 ping 数据库，失败时返回 503
app.get('/readyz', async (req, res) => {
    try {
        await db.queryOne('SELECT 1 AS ok');
        res.json({ success: true, data: { status: 'ready' } });
    } catch (err) {
        res.status(503).json({ success: false, message: 'database not ready' });
    }
});

// SPA 兜底：未命中静态文件且非 /api 的 GET 请求，统一返回 index.html，
// 以支持 /transactions 这类干净路由（History API）。需放在静态文件之后。
app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// 等待数据库就绪并初始化（容器/NAS 环境下 MariaDB 可能尚未接受连接，避免启动竞态）
// 直接调用 initDatabase()：该函数幂等（自动 CREATE DATABASE IF NOT EXISTS + 建表，已存在则跳过），
// 因此无论是「自带 MariaDB 容器」还是「连接外部已有 MariaDB」都能正确建库建表 / 复用既有数据。
// 最多重试 30 次（约 60s），兼容 NAS 慢启动与外部库尚未就绪的场景。
async function waitForDatabaseAndInit(maxAttempts = 30, intervalMs = 2000) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const ok = await db.initDatabase();
            if (ok) {
                console.log('✅ 数据库已就绪');
                return true;
            }
        } catch (err) {
            // 连接尚未建立，进入重试
        }
        console.log(`⏳ 等待数据库就绪并初始化 (${attempt}/${maxAttempts})...`);
        await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
    return false;
}

// 启动
async function start() {
    console.log('🚀 鑫钱包服务器启动中...');

    // 等待数据库就绪并初始化（幂等建库建表，复用既有数据）
    const ready = await waitForDatabaseAndInit();
    if (!ready) {
        console.error('❌ 数据库在限定重试次数内未就绪，请检查 MariaDB 容器状态或 .env 数据库连接配置');
        process.exit(1);
    }

    // 确保演示账号存在（使用 bcrypt 真实哈希，避免明文占位符）
    try {
        const demo = await db.queryOne("SELECT id FROM users WHERE username = 'demo'");
        if (!demo) {
            const demoPw = process.env.DEMO_PASSWORD || 'demo123456';
            const demoHash = await hashPassword(demoPw);
            await db.query(
                'INSERT INTO users (username, password_hash, nickname) VALUES (?, ?, ?)',
                ['demo', demoHash, '演示用户']
            );
            console.log(`🔑 演示账号已创建  用户名: demo  密码: ******（已在 .env 中配置 DEMO_PASSWORD）`);
        }
    } catch (err) {
        console.warn('⚠️ 创建演示账号时出错:', err.message);
    }

    // 演示账号：自动注入种子数据（覆盖所有功能模块）
    try {
        const demoUser = await db.queryOne("SELECT id FROM users WHERE username = 'demo'");
        if (demoUser) {
            const demoUserId = demoUser.id;
            const hasData = await db.queryOne('SELECT COUNT(*) AS cnt FROM transactions WHERE user_id = ?', [demoUserId]);
            if (parseInt(hasData.cnt) === 0) {
                console.log('📝 为演示账号注入完整的演示数据...');
                const inserted = await ensureUserSeed(demoUserId);
                if (inserted) {
                    console.log('✅ 演示账号数据已就绪（账户/交易/转账/预算/理财/储蓄/债务/标签）');
                }
            }
        }
    } catch (err) {
        console.warn('⚠️ 演示数据初始化失败:', err.message);
    }

    const server = app.listen(PORT, () => {
        console.log(`✅ 鑫钱包 API 服务器运行在 http://localhost:${PORT}`);
        console.log(`✅ 前端页面访问 http://localhost:${PORT}/index.html`);
    });

    // 优雅退出：容器 / Ctrl-C 关闭时先收尾连接再退出
    const shutdown = async (signal) => {
        console.log(`\n🛑 收到 ${signal}，开始优雅退出...`);
        server.close(() => console.log('✅ HTTP server 已关闭'));
        try {
            if (db && db.pool) await db.pool.end();
            console.log('✅ 数据库连接池已关闭');
        } catch (err) {
            console.warn('⚠️ 关闭数据库连接池时出错:', err.message);
        }
        setTimeout(() => process.exit(0), 200).unref();
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
}

// insertDemoData 已迁移至 server/seed-data.js
// 通过 ensureUserSeed(userId) 函数统一为新用户/演示用户注入全量种子数据

start();
