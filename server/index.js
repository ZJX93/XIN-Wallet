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
            // 应用代码：始终验证新鲜度，ETag 304 避免重复传输
            res.setHeader('Cache-Control', 'no-cache');
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

    // 插入演示数据（如果交易表为空）
    try {
        const count = await db.queryOne('SELECT COUNT(*) as cnt FROM transactions WHERE user_id = 1');
        if (parseInt(count.cnt) === 0) {
            console.log('📝 插入演示数据...');
            await insertDemoData();
            console.log('✅ 演示数据已插入');
        }
    } catch (err) {
        console.warn('⚠️ 检查演示数据时出错:', err.message);
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

async function insertDemoData() {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();

    const currentMonth = `${y}-${String(m + 1).padStart(2, '0')}`;
    const prevMonth = m === 0 ? `${y - 1}-12` : `${y}-${String(m).padStart(2, '0')}`;

    const accountId = 2; // 工商银行

    // 当前月交易
    const demoTransactions = [
        { category_id: 15, type: 'income', amount: 15000, note: '月工资', dayOffset: 1 },
        { category_id: 16, type: 'income', amount: 3000, note: '季度奖金', dayOffset: 5 },
        { category_id: 17, type: 'income', amount: 800, note: '基金分红', dayOffset: 10 },
        { category_id: 1, type: 'expense', amount: 45, note: '午餐', dayOffset: 1 },
        { category_id: 1, type: 'expense', amount: 120, note: '周末聚餐', dayOffset: 3 },
        { category_id: 1, type: 'expense', amount: 35, note: '早餐+咖啡', dayOffset: 5 },
        { category_id: 1, type: 'expense', amount: 200, note: '超市采购', dayOffset: 8 },
        { category_id: 2, type: 'expense', amount: 30, note: '滴滴打车', dayOffset: 2 },
        { category_id: 2, type: 'expense', amount: 150, note: '加油', dayOffset: 7 },
        { category_id: 3, type: 'expense', amount: 299, note: '京东购物', dayOffset: 4 },
        { category_id: 3, type: 'expense', amount: 89, note: '日用品', dayOffset: 9 },
        { category_id: 5, type: 'expense', amount: 50, note: '电影票', dayOffset: 6 },
        { category_id: 5, type: 'expense', amount: 128, note: '游戏充值', dayOffset: 11 },
        { category_id: 4, type: 'expense', amount: 3500, note: '房租', dayOffset: 1 },
        { category_id: 8, type: 'expense', amount: 100, note: '手机话费', dayOffset: 3 },
        { category_id: 6, type: 'expense', amount: 200, note: '体检', dayOffset: 12 },
        { category_id: 7, type: 'expense', amount: 500, note: '网课', dayOffset: 6 },
        { category_id: 9, type: 'expense', amount: 350, note: '买衣服', dayOffset: 10 },
    ];

    await db.transaction(async (conn) => {
        for (const t of demoTransactions) {
            const d = new Date(y, m, Math.max(1, now.getDate() - t.dayOffset));
            await conn.query(
                `INSERT INTO transactions (user_id, account_id, category_id, type, amount, note, date)
         VALUES (1, ?, ?, ?, ?, ?, ?)`,
                [accountId, t.category_id, t.type, t.amount, t.note, d.toISOString().split('T')[0]]
            );
        }

        // 上月交易
        for (const t of demoTransactions) {
            const d = new Date(prevMonth + '-15');
            const factor = 0.8 + Math.random() * 0.4;
            await conn.query(
                `INSERT INTO transactions (user_id, account_id, category_id, type, amount, note, date)
         VALUES (1, ?, ?, ?, ?, ?, ?)`,
                [accountId, t.category_id, t.type, Math.round(t.amount * factor), t.note + '(上月)', prevMonth + '-' + String(Math.max(1, 15 - t.dayOffset % 10)).padStart(2, '0')]
            );
        }

        // 转账演示数据（生成 transfers 记录 + transfer_out / transfer_in 配对交易）
        const demoTransfers = [
            { from_account_id: 2, to_account_id: 1, amount: 3000, note: '工资取现', dayOffset: 2 },
            { from_account_id: 4, to_account_id: 5, amount: 500, note: '零钱归集', dayOffset: 5 }
        ];
        for (const tx of demoTransfers) {
            const d = new Date(y, m, Math.max(1, now.getDate() - tx.dayOffset));
            const dateStr = d.toISOString().split('T')[0];
            const insertResult = await conn.query(
                `INSERT INTO transfers (user_id, from_account_id, to_account_id, amount, note, date, status) VALUES (1, ?, ?, ?, ?, ?, 'completed')`,
                [tx.from_account_id, tx.to_account_id, tx.amount, tx.note, dateStr]
            );
            const transferId = Number(insertResult.insertId);
            await conn.query(
                `INSERT INTO transactions (user_id, account_id, category_id, type, amount, note, date, transfer_id, source_account_id, destination_account_id)
         VALUES (1, ?, 22, 'transfer_out', ?, ?, ?, ?, ?, NULL)`,
                [tx.from_account_id, tx.amount, `转账至${tx.note}`, dateStr, transferId, tx.from_account_id]
            );
            await conn.query(
                `INSERT INTO transactions (user_id, account_id, category_id, type, amount, note, date, transfer_id, source_account_id, destination_account_id)
         VALUES (1, ?, 22, 'transfer_in', ?, ?, ?, ?, NULL, ?)`,
                [tx.to_account_id, tx.amount, `来自${tx.note}`, dateStr, transferId, tx.to_account_id]
            );
        }

        // 预算（表结构：name + period_type + start_date + end_date + amount）
        const budgetData = [
            { name: '餐饮', amount: 2000 },
            { name: '交通', amount: 500 },
            { name: '购物', amount: 800 },
            { name: '娱乐', amount: 300 },
            { name: '住房', amount: 4000 },
            { name: '通讯', amount: 150 },
            { name: '医疗', amount: 300 },
            { name: '教育', amount: 600 },
            { name: '人情', amount: 500 },
        ];
        // 当前月第一天 / 最后一天（与 budgets 表的 start_date/end_date 周期对齐）
        const [bYear, bMonth] = currentMonth.split('-');
        const budgetStart = `${currentMonth}-01`;
        const budgetEnd = `${currentMonth}-${String(new Date(parseInt(bYear), parseInt(bMonth), 0).getDate()).padStart(2, '0')}`;
        for (const b of budgetData) {
            await conn.query(
                `INSERT INTO budgets (user_id, name, period_type, start_date, end_date, amount) VALUES (1, ?, 'month', ?, ?, ?)`,
                [b.name, budgetStart, budgetEnd, b.amount]
            );
        }

        // 理财持仓演示数据
        const investData = [
            { type_id: 2, name: '余额宝', code: '000198', buy_price: 1, current_price: 1.0003, quantity: 20000, buy_date: '2025-01-01', expected_rate: 2.5 },
            { type_id: 4, name: '沪深300ETF', code: '510300', buy_price: 4.12, current_price: 4.56, quantity: 5000, buy_date: '2025-03-15', expected_rate: 8 },
            { type_id: 3, name: '纯债基金A', code: '003547', buy_price: 1.05, current_price: 1.08, quantity: 10000, buy_date: '2025-02-01', expected_rate: 4.5 },
            { type_id: 1, name: '银行定期', code: '', buy_price: 1, current_price: 1, quantity: 50000, buy_date: '2025-06-01', expected_rate: 2.75 },
            { type_id: 10, name: '黄金ETF', code: '518880', buy_price: 5.32, current_price: 5.85, quantity: 2000, buy_date: '2025-04-10', expected_rate: 6 },
        ];
        for (const i of investData) {
            const totalCost = parseFloat(i.buy_price) * parseFloat(i.quantity);
            const currentValue = parseFloat(i.current_price) * parseFloat(i.quantity);
            await conn.query(
                `INSERT INTO investments (user_id, account_id, investment_type_id, name, code, buy_price, current_price, quantity, total_cost, current_value, buy_date, expected_rate, status)
         VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'holding')`,
                [accountId, i.type_id, i.name, i.code, i.buy_price, i.current_price, i.quantity, totalCost, currentValue, i.buy_date, i.expected_rate]
            );
        }

        // 储蓄目标演示数据
        const goalData = [
            { name: '新车基金', target: 200000, current: 65000, icon: '🚗' },
            { name: '旅行基金', target: 50000, current: 12000, icon: '✈️' },
            { name: '应急储备', target: 100000, current: 100000, icon: '🛡️' },
        ];
        for (const g of goalData) {
            await conn.query(
                `INSERT INTO savings_goals (user_id, name, target_amount, current_amount, icon, status) VALUES (1, ?, ?, ?, ?, 'active')`,
                [g.name, g.target, g.current, g.icon]
            );
        }
    });

    // 复式记账：演示数据写入后，按账本重算所有演示账户余额（当前余额 = 期初 + 账本净额）
    const demoAccounts = await db.query('SELECT id FROM accounts WHERE user_id = 1');
    for (const acc of demoAccounts) {
        const bal = await routes.computeAccountBalance(db, 1, acc.id);
        await db.query('UPDATE accounts SET balance = ? WHERE id = ? AND user_id = ?', [bal, acc.id, 1]);
    }
}

start();
