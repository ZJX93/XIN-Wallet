/* 服务端 ai.js chat prompt + 工具定义关键规则文本快照测试（防回归）。
 *
 * 历史教训：
 *   - 62d5315 引入"场景-对象"备注 + 第10条末尾措辞让 LLM 误以为系统不再下发账户/类目列表
 *   - 2015ea7 修正第10条措辞，加"补充"段
 *   - 446b12c 引入 5.5「软匹配+历史复用」规则——结果用户实际场景证明靠 prompt 投喂 ID 列表
 *     不够，AI 还是会在用户提到的账户名跟预投喂不完全一致时拒绝记账。
 *   - v0.0.44 起（重构版）：新增 list_accounts / list_categories 两个**真实工具**，prompt
 *     明确告诉 AI「不知道就调工具」而不是靠预投喂/软匹配。
 *
 * 凡是这几条核心规则被改回去，本测试即失败，提醒维护者重新评估。
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'server', 'routes', 'ai.js'), 'utf8');

test('chat prompt 第 3 条：可用工具共 8 个（含 list_accounts / list_categories）', () => {
    assert.match(src, /可用工具（共\s*8\s*个）/);
    assert.match(src, /list_accounts（查账户）/);
    assert.match(src, /list_categories（查类目）/);
    // 不能残留旧的"6 个工具"措辞
    assert.doesNotMatch(src, /可用工具：create_transaction.*create_transfer.*query_stats/);
});

test('chat prompt 第 4 条：修改/删除前先 list_transactions 定位', () => {
    assert.match(src, /先调 list_transactions 拿到 transaction_id/);
});

test('chat prompt 第 5 条：不知道账户/类目 id 时先调工具，不得瞎猜或软匹配', () => {
    assert.match(src, /不知道账户\/类目 id 时不要瞎猜、不要做软匹配/);
    assert.match(src, /先调 list_accounts \/ list_categories 拿到全量再选/);
    assert.match(src, /不要自作主张用名字相近的项顶替/);
});

test('chat prompt 第 6 条：query 参数是模糊匹配', () => {
    assert.match(src, /query 参数是\*?\*?模糊匹配\*?\*?/);
});

test('chat prompt 补充段：明确"工具"才是查账户/类目的可靠方式', () => {
    assert.match(src, /下方「可用类目」「可用账户」两节是\*?\*?预投喂\*?\*?的快速参考/);
    assert.match(src, /\*\*必须\*\*调 list_accounts \/ list_categories 实时确认/);
});

test('chat prompt 第 11 条：「场景-对象」备注格式（兼容旧版 AI 期望）', () => {
    assert.match(src, /\*\*(你)?自己\*\*在 note 字段写入完整「场景-对象」格式/);
    assert.match(src, /场景 X 由你根据语境自由决定/);
    assert.match(src, /对象 Y 是商家或个人姓名/);
    // 不要再有"系统不再拼接"这种反向措辞
    assert.doesNotMatch(src, /不再由系统拼接/);
});

test('list_accounts 工具定义存在且说明文字准确', () => {
    assert.match(src, /name: 'list_accounts'/);
    assert.match(src, /查当前账本下所有可用账户/);
    assert.match(src, /必须先调本工具\*?\*?/);
    assert.match(src, /绝不要凭「预投喂列表」硬猜/);
    // 参数 query 是字符串，可省略
    assert.match(src, /query:\s*\{\s*type:\s*'string',\s*description:[^}]*可省略/);
});

test('list_categories 工具定义存在且说明文字准确', () => {
    assert.match(src, /name: 'list_categories'/);
    assert.match(src, /查当前账本下所有可用分类/);
    assert.match(src, /必须先调本工具\*?\*?/);
    assert.match(src, /type_filter/);
});

test('list_accounts 工具实现：SQL 包含 user_id / book_id / status active 三重过滤', () => {
    // 紧跟在 if (name === 'list_accounts') 后
    const m = src.match(/if \(name === 'list_accounts'\)\s*\{([\s\S]*?)\n\s\s\s\s\}/);
    assert.ok(m, 'list_accounts 实现分支必须存在');
    const body = m[1];
    assert.match(body, /user_id\s*=\s*\$1/);
    assert.match(body, /book_id\s*=\s*\$2/);
    assert.match(body, /status\s*=\s*'active'/);
    assert.match(body, /ORDER BY/);
    assert.match(body, /LIMIT/);
});

test('list_categories 工具实现：支持模糊匹配 + 类型过滤 + 全局账本通用', () => {
    const m = src.match(/if \(name === 'list_categories'\)\s*\{([\s\S]*?)\n\s\s\s\s\}/);
    assert.ok(m, 'list_categories 实现分支必须存在');
    const body = m[1];
    assert.match(body, /user_id\s+IS\s+NULL/);
    assert.match(body, /book_id\s+IS\s+NULL\s+OR\s+book_id\s+=\s*\$2/);
    assert.match(body, /name LIKE \$3/);
    assert.match(body, /type_filter/);
});

test('OCR prompt 第 9 条：自己生成完整「场景-对象」备注（与 chat 一致）', () => {
    assert.match(src, /note 由你\*\*自己生成完整\*\*「场景-对象」格式/);
});

test('OCR prompt：分类名允许自由选（OCR 流程与 chat 不同——OCR 输出分类字符串由后端解析）', () => {
    // OCR 不依赖 list_categories 工具，因为后端按字符串解析分类
    assert.match(src, /category 必须从下面列表中选择最合适的/);
});
