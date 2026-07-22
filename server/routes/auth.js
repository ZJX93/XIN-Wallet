/* ============================================
   鑫钱包 · 认证路由
   ============================================ */

const express = require('express');
const router = express.Router();
const db = require('../db');
const { hashPassword, verifyPassword, signToken } = require('../auth');
const { success, fail, handleServerError } = require('./_helpers');

// 登录失败计数器（内存中，进程重启后清零）
const loginFailures = new Map();

// 注册
router.post('/register', async (req, res) => {
    try {
        const { username, password, nickname } = req.body;
        if (!username || !password) return res.status(400).json(fail('用户名和密码必填'));

        const exists = await db.queryOne('SELECT id FROM users WHERE username = ?', [username]);
        if (exists) return res.status(400).json(fail('用户名已存在'));

        const result = await db.query(
            'INSERT INTO users (username, password_hash, nickname) VALUES (?, ?, ?)',
            [username, hashPassword(password), nickname || username]
        );
        const user = { id: result.insertId, username, nickname: nickname || username };
        res.json(success({ token: signToken(user), user }, '注册成功'));
    } catch (err) {
        handleServerError(res, err);
    }
});

// 登录
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json(fail('用户名和密码必填'));

        const user = await db.queryOne('SELECT * FROM users WHERE username = ?', [username]);
        if (!user || !verifyPassword(password, user.password_hash)) {
            const failCount = (loginFailures.get(username) || 0) + 1;
            loginFailures.set(username, failCount);
            const delay = Math.min(Math.pow(2, failCount) * 100, 3000);
            await new Promise(resolve => setTimeout(resolve, delay));
            return res.status(401).json(fail('用户名或密码错误'));
        }
        loginFailures.delete(username);
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
