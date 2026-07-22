/* 前端纯函数单元测试：HTML 转义与货币格式化（防存储型 XSS 的关键保障） */
const test = require('node:test');
const assert = require('node:assert');
const { escapeHtml, fmt } = require('../js/utils');

test('escapeHtml 转义特殊字符', () => {
    assert.strictEqual(escapeHtml('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
    assert.strictEqual(escapeHtml('a & b "c" \'d\''), 'a &amp; b &quot;c&quot; &#39;d&#39;');
});

test('escapeHtml 处理 null / undefined', () => {
    assert.strictEqual(escapeHtml(null), '');
    assert.strictEqual(escapeHtml(undefined), '');
});

test('escapeHtml 阻止常见 XSS payload', () => {
    const payload = '<img src=x onerror=alert(1)>';
    assert.strictEqual(escapeHtml(payload).includes('<img'), false);
});

test('fmt 货币格式（带千分位）', () => {
    // 新版使用 Intl.NumberFormat('zh-CN') 自动加千分位分隔符
    assert.strictEqual(fmt(1234.5), '¥1,234.50');
    assert.strictEqual(fmt(1234567.89), '¥1,234,567.89');
    assert.strictEqual(fmt(0), '¥0.00');
    assert.strictEqual(fmt('abc'), '¥0.00'); // 非法值兜底
});
