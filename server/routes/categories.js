const express = require('express');
const router = express.Router();

const db = require('../db');
const { success, fail, handleServerError } = require('./_helpers');
const { ensureCategory } = require('./utils');

// 获取分类列表
router.get('/', async (req, res) => {
    try {
        const { type, flat } = req.query;
        // 多用户隔离：返回「系统预设 + 当前用户私有」分类
        const params = [req.userId];
        let where = 'WHERE (user_id IS NULL OR user_id = ?)';
        if (type) { where += ' AND type = ?'; params.push(type); }

        const rows = await db.query(
            `SELECT * FROM categories ${where} ORDER BY COALESCE(parent_id, id), parent_id IS NOT NULL, sort_order`,
            params
        );

        // flat 参数：返回扁平列表（交易表单等场景）
        if (flat === '1') return res.json(success(rows));

        // 树形结构
        const map = {};
        const tree = [];
        rows.forEach(c => { c.children = []; map[c.id] = c; });
        rows.forEach(c => {
            if (c.parent_id && map[c.parent_id]) {
                map[c.parent_id].children.push(c);
            } else {
                tree.push(c);
            }
        });
        res.json(success({ tree, flat: rows }));
    } catch (err) {
        handleServerError(res, err);
    }
});

// 新增分类（归属当前用户）
router.post('/', async (req, res) => {
    try {
        const { parent_id, name, icon, type, color } = req.body;
        if (!name || !type) return res.status(400).json(fail('名称和类型必填'));
        const maxSort = await db.queryOne(
            'SELECT COALESCE(MAX(sort_order),0)+1 as n FROM categories WHERE type = ? AND parent_id <=> ? AND (user_id IS NULL OR user_id = ?)',
            [type, parent_id || null, req.userId]
        );
        const result = await db.query(
            'INSERT INTO categories (parent_id, user_id, name, icon, type, color, sort_order, is_system) VALUES (?, ?, ?, ?, ?, ?, ?, FALSE)',
            [parent_id || null, req.userId, name, icon || '📌', type, color || '#6366f1', maxSort.n]
        );
        res.json(success({ id: result.insertId }, '分类已创建'));
    } catch (err) { handleServerError(res, err); }
});

// 更新分类（仅允许编辑当前用户的私有分类）
router.put('/:id', async (req, res) => {
    try {
        const { parent_id, name, icon, type, color, sort_order } = req.body;
        // 检查权限：必须是当前用户的私有分类（系统预设不允许修改）
        const owner = await db.queryOne('SELECT user_id FROM categories WHERE id = ?', [req.params.id]);
        if (!owner) return res.status(404).json(fail('分类不存在'));
        if (owner.user_id !== null && owner.user_id !== req.userId) {
            return res.status(403).json(fail('无权修改该分类'));
        }
        await db.query(
            'UPDATE categories SET parent_id = ?, name = ?, icon = ?, type = ?, color = ?, sort_order = ? WHERE id = ?',
            [parent_id || null, name, icon, type, color, sort_order, req.params.id]
        );
        res.json(success(null, '分类已更新'));
    } catch (err) { handleServerError(res, err); }
});

// 删除分类（仅当前用户的私有分类可删）
router.delete('/:id', async (req, res) => {
    try {
        const owner = await db.queryOne('SELECT user_id FROM categories WHERE id = ?', [req.params.id]);
        if (!owner) return res.status(404).json(fail('分类不存在'));
        if (owner.user_id !== null && owner.user_id !== req.userId) {
            return res.status(403).json(fail('无权删除该分类'));
        }
        const used = await db.queryOne('SELECT COUNT(*) as cnt FROM transactions WHERE category_id = ?', [req.params.id]);
        if (used && used.cnt > 0) return res.status(400).json(fail('该分类下有交易记录，无法删除'));
        const hasChildren = await db.queryOne('SELECT COUNT(*) as cnt FROM categories WHERE parent_id = ?', [req.params.id]);
        if (hasChildren && hasChildren.cnt > 0) return res.status(400).json(fail('该分类下有子分类，请先删除子分类'));
        await db.query('DELETE FROM categories WHERE id = ?', [req.params.id]);
        res.json(success(null, '分类已删除'));
    } catch (err) { handleServerError(res, err); }
});

module.exports = router;
