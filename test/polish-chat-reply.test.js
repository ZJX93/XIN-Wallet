/* test/polish-chat-reply.test.js
 * 覆盖 AI 记账回复修饰器 polishChatReply：
 *  - 去除「机械化前缀」（"好的，我来帮你…", "下面我将…"）
 *  - 隐藏工具名 / 函数调用 JSON 块 / 占位调试字样
 *  - 当真的落账且回复没有"已记好"等口吻时，追加自然口语
 *  - 不会"假成功"——当安全网已把回复改写为"其实没有记录成功"，不应再追加"已记好"
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const _helpers = require('../server/routes/_helpers');
const { polishChatReply } = _helpers;

test('polishChatReply 剥除「好的，我来…」等机械化前缀', () => {
    assert.equal(
        polishChatReply('好的，我来帮您记这笔支出', false),
        '帮您记这笔支出'
    );
    assert.equal(
        polishChatReply('下面我将为您创建一个交易', false),
        '将为您创建一个交易'
    );
});

test('polishChatReply 把内部工具名映射为口语', () => {
    assert.equal(
        polishChatReply('create_transaction 已执行', false),
        '记一笔 已执行'
    );
    assert.equal(
        polishChatReply('list_accounts 拿到 5 条', false),
        '查账户 拿到 5 条'
    );
});

test('polishChatReply 隐藏函数调用风格 JSON 整段', () => {
    // 实现上 JSON 隐藏后左右各保留一个空格，便于在中间留出普通分隔；测试用 trim 容错对比。
    assert.equal(
        polishChatReply('我去查一下 {"name":"list_accounts","q":""} 行不行', false).replace(/\s+/g, ' ').trim(),
        '我去查一下 行不行'
    );
});

test('polishChatReply 在真的落账时追加自然「已记好啦」', () => {
    assert.equal(
        polishChatReply('午餐 38.5（招商银行）', true),
        '午餐 38.5（招商银行），已记好啦~'
    );
});

test('polishChatReply 安全网已写过「没记录成功」时不追加「已记好啦」', () => {
    // 模拟主循环的安全网改写结果：hasWrite=false 不能强行追加"已记好"
    const rep = '很抱歉，这笔其实没有记录成功：请确认金额。';
    assert.equal(polishChatReply(rep, false), rep);
});

test('polishChatReply 已含「已记」类口吻时不重复追加', () => {
    assert.equal(
        polishChatReply('已记一笔，午餐 38.5', true),
        '已记一笔，午餐 38.5'
    );
});

test('polishChatReply 处理 null/空字符串稳定', () => {
    assert.equal(polishChatReply(null, false), null);
    assert.equal(polishChatReply('', false), '');
});

test('polishChatReply 折叠 3+ 连续空行 + 合并重复终止符', () => {
    // 输入含 "好的，…" 前缀 + 中部 3+ 连续空行 + 结尾中文句号；剥离前缀后应折叠空行
    const got = polishChatReply('好的，我来帮你记一笔\n\n\n\n中午 38.5。', false);
    assert.equal(got, '帮你记一笔\n\n中午 38.5。');
});
