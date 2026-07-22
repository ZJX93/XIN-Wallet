/* 后端纯函数单元测试：数值校验与 CSV 解析（无需数据库即可运行） */
const test = require('node:test');
const assert = require('node:assert');
const { toNumber, TRANSACTION_TYPES, parseCsvLine } = require('../server/validate');

test('toNumber 处理合法数字', () => {
    assert.strictEqual(toNumber('5'), 5);
    assert.strictEqual(toNumber(5), 5);
    assert.strictEqual(toNumber('3.14'), 3.14);
    assert.strictEqual(toNumber('-2'), -2);
});

test('toNumber 对非法/空值返回 null（防止 NaN 入库）', () => {
    assert.strictEqual(toNumber(''), null);
    assert.strictEqual(toNumber(undefined), null);
    assert.strictEqual(toNumber(null), null);
    assert.strictEqual(toNumber('abc'), null);
    assert.strictEqual(toNumber(NaN), null);
    assert.strictEqual(toNumber('12x'), null);
});

test('TRANSACTION_TYPES 枚举完整', () => {
    assert.deepStrictEqual(TRANSACTION_TYPES, ['income', 'expense', 'transfer_in', 'transfer_out']);
});

test('parseCsvLine 基础解析', () => {
    assert.deepStrictEqual(parseCsvLine('a,b,c'), ['a', 'b', 'c']);
});

test('parseCsvLine 处理引号包裹与字段内逗号', () => {
    assert.deepStrictEqual(parseCsvLine('1,支出,"午饭, 加咖啡",25'), ['1', '支出', '午饭, 加咖啡', '25']);
});

test('parseCsvLine 处理转义引号（""）', () => {
    assert.deepStrictEqual(parseCsvLine('"他说""你好""",x'), ['他说"你好"', 'x']);
});

test('parseCsvLine 处理字段内换行', () => {
    const r = parseCsvLine('1,"第一行\n第二行",3');
    assert.strictEqual(r[1], '第一行\n第二行');
});
