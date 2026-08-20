/* 服务端 ai.js chat prompt 关键规则文本快照测试（防回归）。
 *
 * 历史教训：
 *   - 62d5315 引入"场景-对象"备注 + 第10条末尾措辞让 LLM 误以为系统不再下发账户/类目列表
 *   - 2015ea7 修正第10条措辞，加"补充"段
 *   - 2026-08-20 用户反馈 AI 反复因账户名差一点就拒绝记，本文件新增 5.5 软匹配 + 历史复用指引
 *
 * 凡是这几条核心规则被改回去，本测试即失败，提醒维护者重新评估。
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'server', 'routes', 'ai.js'), 'utf8');

test('chat prompt 第 3 条说明可用工具含 list_transactions', () => {
    assert.match(src, /list_transactions（查找交易）/);
});

test('chat prompt 第 4 条引导修改/删除前先 list_transactions 定位', () => {
    assert.match(src, /先调用 list_transactions 定位目标交易/);
});

test('chat prompt 第 5 条禁止凭空编造 id', () => {
    assert.match(src, /禁止(凭空编造|编造)\s*不在列表里的\s*id/);
});

test('chat prompt 第 5.5 条：账户/类目不能完全匹配时优先复用历史同类交易', () => {
    // 必须存在
    assert.match(src, /5\.5\s*创建交易时若用户提到的账户\/类目名在下方列表里找不到完全一致/);
    assert.match(src, /复用其\s*account_id\/category_id/);
    assert.match(src, /从下方列表选「名字最相近」的项/);
    assert.match(src, /明确告诉用户/);
});

test('chat prompt 第 10 条：自己生成「场景-对象」备注格式', () => {
    assert.match(src, /\*\*(你)?自己\*\*在 note 字段写入完整「场景-对象」格式/);
    assert.match(src, /场景 X 由你根据语境自由决定/);
    assert.match(src, /对象 Y 是商家或个人姓名/);
    // 不要残留旧措辞"系统不再拼接"
    assert.doesNotMatch(src, /不再由系统拼接/);
});

test('chat prompt 补充段：明确区分"工具调用"与"内嵌数据列表"', () => {
    assert.match(src, /类目\/账户的 ID 列表.*已在下方「可用类目」「可用账户」两节直接在对话中下发给你/);
    assert.match(src, /不是工具调用结果/);
});

test('list_transactions 工具描述：同时支持定位目标 + 复用历史同类交易 id', () => {
    // 既支持改/删前的目标定位，也支持建账时复用历史同类交易
    assert.match(src, /\(a\)\s*定位用户想修改或删除的目标交易/);
    assert.match(src, /\(b\)\s*创建交易时若账户\/类目不能确定/);
    assert.match(src, /复用其\s*account_id\/category_id/);
});

test('OCR prompt 第 9 条：自己生成完整「场景-对象」备注', () => {
    assert.match(src, /note 由你\*\*自己生成完整\*\*「场景-对象」格式/);
});
