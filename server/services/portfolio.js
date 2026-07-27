/* ============================================
   鑫钱包 · 理财组合计算服务
   持仓收益率、年化、集中度、预期收益加权等纯函数
   ============================================ */

/**
 * 单持仓年化收益率（基于买入日持有期）
 * 公式: ((当前值/成本)^(365/持有天数) - 1) * 100
 */
function annualizedRate(totalCost, currentValue, buyDate) {
  const cost = parseFloat(totalCost);
  const value = parseFloat(currentValue);
  if (!(cost > 0) || !(value > 0) || !buyDate) return 0;

  const start = new Date(buyDate);
  if (isNaN(start.getTime())) return 0;

  const days = (Date.now() - start.getTime()) / 86400000;
  if (days <= 0) return 0;

  return (Math.pow(value / cost, 365 / days) - 1) * 100;
}

/**
 * 持仓收益率
 */
function profitRate(totalCost, currentValue) {
  const cost = parseFloat(totalCost);
  const value = parseFloat(currentValue);
  return cost > 0 ? ((value - cost) / cost * 100) : 0;
}

/**
 * 持仓盈亏金额
 */
function profit(totalCost, currentValue) {
  return parseFloat(currentValue) - parseFloat(totalCost);
}

/**
 * 组合进阶指标
 * @param {Array} investments - 持仓记录数组（含 total_cost, current_value, buy_date, expected_rate）
 * @returns {{ totalCost: number, totalValue: number, totalProfit: number, annualizedRate: number, concentration: number, expectedRateAvg: number }}
 */
function calcPortfolioMetrics(investments) {
  if (!investments || investments.length === 0) {
    return {
      totalCost: 0, totalValue: 0, totalProfit: 0,
      annualizedRate: 0, concentration: 0, expectedRateAvg: 0
    };
  }

  const tCost = investments.reduce((s, i) => s + parseFloat(i.total_cost), 0);
  const tVal  = investments.reduce((s, i) => s + parseFloat(i.current_value), 0);

  // 最早买入日期（用于年化计算）
  const earliest = investments.reduce((min, i) => {
    const d = i.buy_date ? new Date(i.buy_date) : null;
    return (d && (!min || d < min)) ? d : min;
  }, null);

  const days = earliest ? Math.max((Date.now() - earliest.getTime()) / 86400000, 1) : 0;
  const annualized = (tCost > 0 && tVal > 0 && days > 0)
    ? (Math.pow(tVal / tCost, 365 / days) - 1) * 100
    : 0;

  // 集中度：最大持仓占比
  const maxHolding = investments.reduce((m, i) => Math.max(m, parseFloat(i.current_value)), 0);
  const concentration = tVal > 0 ? (maxHolding / tVal * 100) : 0;

  // 预期收益加权平均
  const expectedRateAvg = tCost > 0
    ? investments.reduce((s, i) => s + (parseFloat(i.expected_rate || 0) * parseFloat(i.total_cost)), 0) / tCost
    : 0;

  return {
    totalCost: Math.round(tCost * 100) / 100,
    totalValue: Math.round(tVal * 100) / 100,
    totalProfit: Math.round((tVal - tCost) * 100) / 100,
    annualizedRate: Math.round(annualized * 100) / 100,
    concentration: Math.round(concentration * 10) / 10,
    expectedRateAvg: Math.round(expectedRateAvg * 100) / 100
  };
}

/**
 * 格式化持仓记录为前端友好的 JSON
 */
function formatHolding(raw) {
  return {
    ...raw,
    buy_price:     parseFloat(raw.buy_price),
    current_price: parseFloat(raw.current_price),
    quantity:      parseFloat(raw.quantity),
    total_cost:    parseFloat(raw.total_cost),
    current_value: parseFloat(raw.current_value),
    fee:           parseFloat(raw.fee || 0),
    profit:        profit(raw.total_cost, raw.current_value),
    profit_rate:   profitRate(raw.total_cost, raw.current_value),
    expected_rate: parseFloat(raw.expected_rate),
    actual_rate:   parseFloat(raw.actual_rate),
    annualizedRate: Math.round(annualizedRate(raw.total_cost, raw.current_value, raw.buy_date) * 100) / 100
  };
}

module.exports = {
  annualizedRate,
  profitRate,
  profit,
  calcPortfolioMetrics,
  formatHolding
};
