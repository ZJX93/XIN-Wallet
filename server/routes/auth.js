/* ============================================
   鑫钱包 · 认证路由
   ============================================ */

const express = require('express');
const router = express.Router();
const db = require('../db');
const { hashPassword, verifyPassword, verifyPasswordSync, signToken } = require('../auth');
const { success, fail, handleServerError } = require('./_helpers');

// 登录失败次数阈值 + 锁定期
const MAX_FAIL_COUNT = 5;
const LOCK_MINUTES = 15;

// 密码强度校验：≥8 位 + 字母 + 数字（避免弱密码）
function validatePasswordStrength(pw) {
    if (typeof pw !== 'string' || pw.length < 8) return '密码长度至少 8 位';
    if (!/[a-zA-Z]/.test(pw)) return '密码必须包含字母';
    if (!/[0-9]/.test(pw)) return '密码必须包含数字';
    return null;
}

// 注册
router.post('/register', async (req, res) => {
    try {
        const { username, password, nickname } = req.body;
        if (!username || !password) return res.status(400).json(fail('用户名和密码必填'));

        const strengthErr = validatePasswordStrength(password);
        if (strengthErr) return res.status(400).json(fail(strengthErr));

        const exists = await db.queryOne('SELECT id FROM users WHERE username = ?', [username]);
        if (exists) return res.status(400).json(fail('用户名已存在'));

        const hash = await hashPassword(password);
        const result = await db.query(
            'INSERT INTO users (username, password_hash, nickname) VALUES (?, ?, ?)',
            [username, hash, nickname || username]
        );
        const user = { id: result.insertId, username, nickname: nickname || username };
        res.json(success({ token: signToken(user), user }, '注册成功'));
    } catch (err) {
        handleServerError(res, err);
    }
});

// 登录：基于 users.fail_count / users.locked_until 持久化锁定（重启不失效）
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json(fail('用户名和密码必填'));

        const user = await db.queryOne(
            'SELECT id, username, password_hash, nickname, fail_count, locked_until FROM users WHERE username = ?',
            [username]
        );

        // 账号被锁定
        if (user && user.locked_until && new Date(user.locked_until) > new Date()) {
            return res.status(423).json(fail(`账号已被锁定，请于 ${new Date(user.locked_until).toLocaleString('zh-CN')} 后再试`));
        }

        const passwordOk = user && await verifyPassword(password, user.password_hash);
        if (!user || !passwordOk) {
            const failCount = (user?.fail_count || 0) + 1;
            const shouldLock = failCount >= MAX_FAIL_COUNT;
            const lockedUntil = shouldLock ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000) : null;
            await db.query(
                'UPDATE users SET fail_count = ?, locked_until = ?, last_fail_at = NOW() WHERE username = ?',
                [failCount, lockedUntil, username]
            );
            const delay = Math.min(Math.pow(2, failCount) * 100, 3000);
            await new Promise(resolve => setTimeout(resolve, delay));
            const msg = shouldLock
                ? `登录失败次数过多，账号已锁定 ${LOCK_MINUTES} 分钟`
                : '用户名或密码错误';
            return res.status(401).json(fail(msg));
        }

        // 成功登录：清除失败计数器与锁定
        if (user.fail_count > 0 || user.locked_until) {
            await db.query('UPDATE users SET fail_count = 0, locked_until = NULL WHERE username = ?', [username]);
        }
        const token = signToken({ id: user.id, username: user.username });
        res.json(success({
            token,
            user: { id: user.id, username: user.username, nickname: user.nickname }
        }, '登录成功'));
    } catch (err) {
        handleServerError(res, err);
    }
});

// 演示账号登录（无密码，仅开发/演示环境使用）
router.post('/demo', async (req, res) => {
    try {
        // 仅在非生产环境或显式开启时允许
        if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO !== 'true') {
            return res.status(403).json(fail('演示登录在生产环境已禁用'));
        }

        let user = await db.queryOne('SELECT * FROM users WHERE username = ?', ['demo']);
        if (!user) {
            // 自动创建演示账号
            const result = await db.query(
                'INSERT INTO users (username, password_hash, nickname) VALUES (?, ?, ?)',
                ['demo', hashPassword('demo123456'), '演示用户']
            );
            user = { id: result.insertId, username: 'demo', nickname: '演示用户' };
        }
        const token = signToken({ id: user.id, username: user.username });
        res.json(success({
            token,
            user: { id: user.id, username: user.username, nickname: user.nickname }
        }, '演示登录成功'));
    } catch (err) {
        handleServerError(res, err);
    }
});

module.exports = router;
