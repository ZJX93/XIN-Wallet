/* ============================================
   鑫钱包 · _helpers.js 公共辅助函数单元测试
   不依赖数据库，纯函数直接测试
   ============================================ */
const test = require('node:test');
const assert = require('node:assert');

const {
    success, fail, fmtDateOnly, fmtDateTime, maskKey, extractJson
} = require('../server/routes/_helpers');

// ==========================================
// 响应封装
// ==========================================
test('success() 返回结构化成功响应', () => {
    const r = success({ id: 1 }, 'ok');
    assert.deepStrictEqual(r, { success: true, data: { id: 1 }, message: 'ok' });
});

test('success() 默认 message 为空', () => {
    const r = success({ id: 1 });
    assert.strictEqual(r.message, '');
});

test('fail() 默认 code=400', () => {
    const r = fail('参数错误');
    assert.deepStrictEqual(r, { success: false, message: '参数错误', code: 400 });
});

test('fail() 支持自定义 code', () => {
    const r = fail('未授权', 401);
    assert.strictEqual(r.code, 401);
});

// ==========================================
// 日期格式化
// ==========================================
test('fmtDateOnly 处理 null/undefined 返回 null', () => {
    assert.strictEqual(fmtDateOnly(null), null);
    assert.strictEqual(fmtDateOnly(undefined), null);
});

test('fmtDateOnly 格式化 Date 对象', () => {
    const d = new Date('2026-07-15T10:30:00');
    assert.strictEqual(fmtDateOnly(d), '2026-07-15');
});

test('fmtDateOnly 截取字符串前 10 位', () => {
    assert.strictEqual(fmtDateOnly('2026-07-15 10:30:00'), '2026-07-15');
});

test('fmtDateTime 格式化 Date 对象到秒', () => {
    const d = new Date(2026, 6, 15, 10, 30, 45); // 月份 0-indexed → 7月
    assert.strictEqual(fmtDateTime(d), '2026-07-15 10:30:45');
});

test('fmtDateTime 处理 null/undefined 返回 null', () => {
    assert.strictEqual(fmtDateTime(null), null);
    assert.strictEqual(fmtDateTime(undefined), null);
});

test('fmtDateTime 接受字符串输入', () => {
    assert.strictEqual(fmtDateTime('2026-07-15T10:30:45.000Z'), '2026-07-15 10:30:45');
});

// ==========================================
// maskKey API Key 脱敏
// ==========================================
test('maskKey 空值返回空字符串', () => {
    assert.strictEqual(maskKey(null), '');
    assert.strictEqual(maskKey(''), '');
    assert.strictEqual(maskKey(undefined), '');
});

test('maskKey 加密长 key 显示占位符', () => {
    const longKey = 'a'.repeat(64);
    assert.strictEqual(maskKey(longKey), '已加密 (AES-256-GCM)');
});

test('maskKey 短 key 全部遮蔽', () => {
    assert.strictEqual(maskKey('12345'), '***');
    assert.strictEqual(maskKey('12345678'), '***'); // 8 字符边界
});

test('maskKey 中等长度 key 保留前后几位', () => {
    assert.strictEqual(maskKey('abcdefghijklm1234567'), 'abcdef...4567');
});

// ==========================================
// extractJson: 从模型输出中提取 JSON
// ==========================================
test('extractJson 直接解析 JSON 字符串', () => {
    const result = extractJson('{"foo": 1, "bar": 2}');
    assert.deepStrictEqual(result, { foo: 1, bar: 2 });
});

test('extractJson 从 markdown 代码块中提取', () => {
    const result = extractJson('```json\n{"foo": 1}\n```');
    assert.deepStrictEqual(result, { foo: 1 });
});

test('extractJson 兼容不带语言标识的代码块', () => {
    const result = extractJson('```\n{"foo": 1}\n```');
    assert.deepStrictEqual(result, { foo: 1 });
});

test('extractJson 从混合文本中提取 JSON 对象', () => {
    const text = '这是分析结果：{"category": "餐饮", "amount": 50} 谢谢';
    const result = extractJson(text);
    assert.deepStrictEqual(result, { category: '餐饮', amount: 50 });
});

test('extractJson 从混合文本中提取 JSON 数组', () => {
    const text = '结果：[1, 2, 3]';
    const result = extractJson(text);
    assert.deepStrictEqual(result, [1, 2, 3]);
});

test('extractJson 无法提取时返回 null', () => {
    assert.strictEqual(extractJson('plain text'), null);
    assert.strictEqual(extractJson(null), null);
    assert.strictEqual(extractJson(''), null);
});
