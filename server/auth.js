/* ============================================
   鑫钱包 · 认证模块 (Auth)
   提供密码哈希、JWT 签发与校验、路由鉴权中间件
   ============================================ */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// 安全检查：生产环境下不允许使用默认 JWT 密钥
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET === 'zhicai-dev-secret-change-me' || JWT_SECRET === 'please-change-this-to-a-long-random-secret-string') {
    if (process.env.NODE_ENV === 'production') {
        console.error('❌ 安全错误：生产环境必须设置 JWT_SECRET 环境变量（不得使用默认值）');
        console.error('   请运行: openssl rand -hex 32  生成一个随机密钥，并写入 .env 文件的 JWT_SECRET');
        process.exit(1);
    } else {
        console.warn('⚠️ 安全警告：JWT_SECRET 未配置或使用默认值，仅开发环境允许。');
        console.warn('   生产环境请务必设置 JWT_SECRET 环境变量。');
    }
}
const EFFECTIVE_SECRET = JWT_SECRET || 'zhicai-dev-secret-change-me';
const JWT_EXPIRES = '7d';

// 生成密码哈希
function hashPassword(plain) {
    return bcrypt.hashSync(plain, 10);
}

// 校验密码
function verifyPassword(plain, hash) {
    try {
        return bcrypt.compareSync(plain, hash);
    } catch {
        return false;
    }
}

// 签发 JWT
function signToken(user) {
    return jwt.sign(
        { id: Number(user.id), username: user.username },
        EFFECTIVE_SECRET,
        { expiresIn: JWT_EXPIRES }
    );
}

// 路由鉴权中间件：校验 Bearer Token，注入 req.userId
function authMiddleware(req, res, next) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) {
        return res.status(401).json({ success: false, message: '未授权，请先登录' });
    }
    try {
        const payload = jwt.verify(token, EFFECTIVE_SECRET);
        req.userId = payload.id;
        next();
    } catch {
        return res.status(401).json({ success: false, message: '登录已过期，请重新登录' });
    }
}

module.exports = { hashPassword, verifyPassword, signToken, authMiddleware };
