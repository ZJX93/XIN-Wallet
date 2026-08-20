/* stripThinkingTokens 纯函数单测：剥离思考模型（deepseek-r1 / qwen 等）
 * 输出中的 <think>...</think> 标记，避免"已记一笔"文案被推理过程污染。
 */
const test = require('node:test');
const assert = require('node:assert');
const { stripThinkingTokens } = require('../server/routes/_helpers');

test('stripThinkingTokens：去除完整 <think>...</think> 整段', () => {
    const out = stripThinkingTokens('我来分析一下<think>用户想记一笔早餐支出</think>已记一笔：早餐 -12（微信零钱）');
    assert.equal(out, '我来分析一下已记一笔：早餐 -12（微信零钱）');
});

test('stripThinkingTokens：去除多行 <think> 推理块', () => {
    const inText = '好的<think>\n第一步：判断金额\n第二步：选类目\n</think>已记一笔：午餐 -38.5';
    const out = stripThinkingTokens(inText);
    assert.equal(out, '好的已记一笔：午餐 -38.5');
});

test('stripThinkingTokens：处理未闭合 <think>（流式截断）', () => {
    const out = stripThinkingTokens('已记一笔：晚餐 -25<think>用户可能用的是信用卡');
    assert.equal(out, '已记一笔：晚餐 -25');
});

test('stripThinkingTokens：无思考标记时原样返回', () => {
    assert.equal(stripThinkingTokens('已记一笔：打车 -18.5（支付宝）'), '已记一笔：打车 -18.5（支付宝）');
});

test('stripThinkingTokens：空 / null / undefined 安全', () => {
    assert.equal(stripThinkingTokens(''), '');
    assert.equal(stripThinkingTokens(null), '');
    assert.equal(stripThinkingTokens(undefined), '');
});

test('stripThinkingTokens：清理多余空行并 trim', () => {
    const out = stripThinkingTokens('<think>x</think>\n\n\n\n已记一笔');
    assert.equal(out, '已记一笔');
});
