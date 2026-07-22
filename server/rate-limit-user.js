/**
 * 鑫钱包 · 用户级速率限制
 * 按 userId 而非 IP 限流（同一个用户多设备共享配额）
 * 对未认证接口退化为按 IP
 */

const rateLimit = require('express-rate-limit');

function userKeyGenerator(req) {
    // 已登录用户用 userId，未登录用 IP
    if (req.user && req.user.id) {
        return `u${req.user.id}`;
    }
    return `ip${req.ip}`;
}

/**
 * 通用 API 限流：每分钟 200 次 / 每用户
 * 用于已认证接口
 */
const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: parseInt(process.env.API_RATE_LIMIT_MAX || '200', 10),
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: userKeyGenerator,
    message: { success: false, message: '操作过于频繁，请稍后再试' },
    skip: (req) => req.path === '/healthz' || req.path === '/readyz',
});

/**
 * 写操作限流：每分钟 60 次 / 每用户（防止刷接口）
 * 用于 POST/PUT/DELETE
 */
const writeLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: parseInt(process.env.WRITE_RATE_LIMIT_MAX || '60', 10),
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: userKeyGenerator,
    method: 'POST',
    message: { success: false, message: '写操作频率过高，请稍后再试' },
});

/**
 * AI 接口限流：每分钟 10 次（成本高）
 */
const aiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: parseInt(process.env.AI_RATE_LIMIT_MAX || '10', 10),
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: userKeyGenerator,
    message: { success: false, message: 'AI 接口调用过于频繁，请稍后再试' },
});

module.exports = { apiLimiter, writeLimiter, aiLimiter, userKeyGenerator };