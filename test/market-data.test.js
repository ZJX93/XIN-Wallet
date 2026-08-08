/* 行情服务单元测试：A 股代码交易所前缀推断 */
const test = require('node:test');
const assert = require('node:assert');
const { getQuoteStrategy, detectCodeType } = require('../server/services/market-data');

test('getQuoteStrategy: 深市主板纯数字代码补 sz 前缀', () => {
    assert.deepStrictEqual(getQuoteStrategy('stock', '000516'), { type: 'stock', code: 'sz000516' });
});

test('getQuoteStrategy: 中小板/创业板纯数字代码补 sz 前缀', () => {
    assert.deepStrictEqual(getQuoteStrategy('stock', '002594'), { type: 'stock', code: 'sz002594' });
    assert.deepStrictEqual(getQuoteStrategy('stock', '300750'), { type: 'stock', code: 'sz300750' });
});

test('getQuoteStrategy: 沪市主板纯数字代码补 sh 前缀', () => {
    assert.deepStrictEqual(getQuoteStrategy('stock', '600519'), { type: 'stock', code: 'sh600519' });
    assert.deepStrictEqual(getQuoteStrategy('stock', '601318'), { type: 'stock', code: 'sh601318' });
});

test('getQuoteStrategy: 科创板纯数字代码补 sh 前缀', () => {
    assert.deepStrictEqual(getQuoteStrategy('stock', '688981'), { type: 'stock', code: 'sh688981' });
});

test('getQuoteStrategy: 北交所纯数字代码补 bj 前缀', () => {
    assert.deepStrictEqual(getQuoteStrategy('stock', '430047'), { type: 'stock', code: 'bj430047' });
    assert.deepStrictEqual(getQuoteStrategy('stock', '835305'), { type: 'stock', code: 'bj835305' });
});

test('getQuoteStrategy: 已带前缀的代码保持原样', () => {
    assert.deepStrictEqual(getQuoteStrategy('stock', 'sh600519'), { type: 'stock', code: 'sh600519' });
    assert.deepStrictEqual(getQuoteStrategy('stock', 'SZ000516'), { type: 'stock', code: 'sz000516' });
    assert.deepStrictEqual(getQuoteStrategy('stock', 'BJ430047'), { type: 'stock', code: 'bj430047' });
});

test('getQuoteStrategy: 深交所场内基金/ETF 纯数字补 sz 前缀（含 159363）', () => {
    assert.deepStrictEqual(getQuoteStrategy('stock', '159363'), { type: 'stock', code: 'sz159363' });
    assert.deepStrictEqual(getQuoteStrategy('stock', '150001'), { type: 'stock', code: 'sz150001' });
    assert.deepStrictEqual(getQuoteStrategy('stock', '161725'), { type: 'stock', code: 'sz161725' });
});

test('getQuoteStrategy: 上交所场内基金/ETF 纯数字补 sh 前缀', () => {
    assert.deepStrictEqual(getQuoteStrategy('stock', '510300'), { type: 'stock', code: 'sh510300' });
    assert.deepStrictEqual(getQuoteStrategy('stock', '518880'), { type: 'stock', code: 'sh518880' });
    assert.deepStrictEqual(getQuoteStrategy('stock', '588000'), { type: 'stock', code: 'sh588000' });
});

test('getQuoteStrategy: 沪市主板 605 段也归 sh', () => {
    assert.deepStrictEqual(getQuoteStrategy('stock', '605499'), { type: 'stock', code: 'sh605499' });
});

test('getQuoteStrategy: 基金代码不受交易所推断影响', () => {
    assert.deepStrictEqual(getQuoteStrategy('fund', '005827'), { type: 'fund', code: '005827' });
});

test('detectCodeType: 识别股票前缀', () => {
    assert.deepStrictEqual(detectCodeType('sh600519'), { type: 'stock', code: 'sh600519' });
    assert.deepStrictEqual(detectCodeType('BJ430047'), { type: 'stock', code: 'bj430047' });
});

test('detectCodeType: 纯数字仍视为基金（保持旧逻辑，避免股票/基金混淆）', () => {
    assert.deepStrictEqual(detectCodeType('000516'), { type: 'fund', code: '000516' });
});
