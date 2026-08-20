/* 服务端 resolveNote 单元测试（防回归：旧 buildSceneObjectNote 强制拼接「类目-merchant」） */
const test = require('node:test');
const assert = require('node:assert');

// 抽取工具函数（resolveNote 是 async，依赖 queryOne；这里 mock conn）
// 直接 require 原文件会让 db.js 被加载（side-effect），改成 stub utils 内部依赖较麻烦，
// 故手写最小 mock 测 resolveNote 自身逻辑（生产路径由集成测试覆盖）。

const { resolveNote } = (() => {
    // 直接 require 源文件；它不依赖任何外部 module（只有 mysql2/pg 风格的 queryOne 是参数注入）
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'server', 'routes', 'utils.js'), 'utf8');
    // 提取 resolveNote 函数体（去掉 module.exports 部分）
    const fnSrc = src.match(/async function resolveNote[\s\S]*?\n\}/)[0];
    // eslint-disable-next-line no-new-func
    return { resolveNote: new Function('return ' + fnSrc.replace('async function resolveNote', 'async function resolveNote'))() };
})();

function mockConn(catName) {
    return {
        async queryOne(sql, params) {
            // 真实生产 SQL：`SELECT name FROM categories WHERE id = ? AND (user_id IS NULL OR user_id = ?)`
            // 这里只关心返回值，按参数断言
            assert.ok(params.length === 2, 'expected 2 params');
            return catName ? { name: catName } : null;
        }
    };
}

test('resolveNote: 有 note 就用 note（AI 自填完整「场景-对象」）', async () => {
    const note = await resolveNote(mockConn('早餐'), 1, 100, '早餐-老乡鸡', '老乡鸡');
    assert.strictEqual(note, '早餐-老乡鸡');
});

test('resolveNote: 没 note 有 merchant → fallback merchant', async () => {
    const note = await resolveNote(mockConn('买菜'), 2, '', '张三');
    assert.strictEqual(note, '张三');
});

test('resolveNote: 没 note 没 merchant → 类目名兜底', async () => {
    const note = await resolveNote(mockConn('晚餐'), 3, '', '');
    assert.strictEqual(note, '晚餐');
});

test('resolveNote: 都没有 → 空串', async () => {
    const note = await resolveNote(mockConn(null), 4, '', '');
    assert.strictEqual(note, '');
});

test('resolveNote: 不再拼接「类目-merchant」硬格式', async () => {
    // 即便 AI 只给了 merchant，server 也不会自动拼成「类目-merchant」
    const note = await resolveNote(mockConn('早餐'), 5, 444, null, '老乡鸡');
    assert.notStrictEqual(note, '早餐-老乡鸡', '回归：不应再硬拼「类目-merchant」');
    assert.strictEqual(note, '老乡鸡');
});

test('resolveNote: AI 自定义场景（不是类目名）— 雪糕-邻几', async () => {
    // 类目是「饮料」，AI 仍自由选「雪糕」作场景
    const note = await resolveNote(mockConn('饮料'), 6, 123, '雪糕-邻几', '邻几');
    assert.strictEqual(note, '雪糕-邻几');
});

test('resolveNote: AI 自定义场景（不是类目名）— 买菜-张三', async () => {
    // 类目是「其他」，AI 自由选「买菜」作场景
    const note = await resolveNote(mockConn('其他'), 7, 999, '买菜-张三', '张三');
    assert.strictEqual(note, '买菜-张三');
});

test('resolveNote: 不再硬拼「类目-merchant」— 回归保护', async () => {
    // 即便 AI 只给了 merchant 没给完整 note，server 也不会自动拼成「类目-merchant」
    const note = await resolveNote(mockConn('早餐'), 8, 555, null, '老乡鸡');
    assert.notStrictEqual(note, '早餐-老乡鸡', '回归：不应再硬拼「类目-merchant」');
    assert.strictEqual(note, '老乡鸡');
});