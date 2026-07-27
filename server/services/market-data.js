/* ============================================
   鑫钱包 · 行情数据服务
   封装外部行情 API 调用，统一错误处理和降级策略
   ============================================ */

const https = require('https');
const http = require('http');

// ==========================================
// HTTP 工具
// ==========================================

/**
 * 通用 HTTP GET 请求
 * @param {string} url
 * @param {{ timeout?: number, headers?: Record<string,string> }|number} options
 * @returns {Promise<Buffer>}
 */
function httpGet(url, options = {}) {
  const { timeout = 8000, headers = {} } = typeof options === 'number' ? { timeout: options } : options;
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { timeout, headers }, (resp) => {
      // 自动跟随重定向
      if (resp.statusCode >= 300 && resp.statusCode < 400 && resp.headers.location) {
        httpGet(resp.headers.location, options).then(resolve).catch(reject);
        return;
      }
      const chunks = [];
      resp.on('data', chunk => chunks.push(chunk));
      resp.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('行情请求超时')); });
    req.on('error', reject);
  });
}

// ==========================================
// 代码类型检测与行情策略
// ==========================================

/**
 * 自动识别代码类型（纯数字=基金，sh/sz前缀=股票）
 */
function detectCodeType(code) {
  const c = String(code).trim();
  if (/^s[hz]\d{6}$/i.test(c)) return { type: 'stock', code: c };
  if (/^\d{6}$/.test(c)) return { type: 'fund', code: c };
  return { type: 'unknown', code: c };
}

/**
 * 根据投资品类 + 代码决定查询策略
 */
function getQuoteStrategy(invTypeCategory, code) {
  const c = String(code || '').trim();
  if (!c) return null;

  // 存款/其他品类不查行情
  if (invTypeCategory === 'deposit' || invTypeCategory === 'other') return null;

  // 股票类型 → 腾讯证券
  if (invTypeCategory === 'stock') {
    const prefix = /^s[hz]/i.test(c) ? c.substring(0, 2).toLowerCase() : 'sh';
    const numCode = c.replace(/^s[hz]/i, '');
    return { type: 'stock', code: prefix + numCode };
  }

  // 基金类型 → 东方财富（纯数字）；带前缀的走股票
  if (invTypeCategory === 'fund') {
    if (/^\d{6}$/.test(c)) return { type: 'fund', code: c };
    if (/^s[hz]/i.test(c)) return { type: 'stock', code: c };
    return { type: 'fund', code: c };
  }

  // 默认：自动识别
  const detected = detectCodeType(c);
  return detected.type === 'unknown' ? null : detected;
}

// ==========================================
// 基金行情（东方财富 API）
// ==========================================

/**
 * 查询基金最新净值
 */
async function fetchFundQuote(code) {
  const url = `https://api.fund.eastmoney.com/f10/lsjz?fundCode=${code}&pageIndex=1&pageSize=1`;
  const buf = await httpGet(url, {
    timeout: 8000,
    headers: { 'Referer': 'https://fund.eastmoney.com/' }
  });
  const data = JSON.parse(buf.toString('utf8'));

  if (data.ErrCode !== 0 || !data.Data || !data.Data.LSJZList || data.Data.LSJZList.length === 0) {
    throw new Error(data.ErrMsg || '基金数据获取失败');
  }

  const d = data.Data.LSJZList[0];
  return {
    code,
    name: '',
    nav: parseFloat(d.DWJZ) || 0,
    navDate: d.FSRQ || '',
    estimatedNav: parseFloat(d.DWJZ) || 0,
    estimatedChange: parseFloat(d.JZZZL) || 0,
    lastNav: parseFloat(d.DWJZ) || 0
  };
}

// ==========================================
// 股票行情（腾讯证券，GBK 编码）
// ==========================================

/**
 * 查询股票实时行情
 */
async function fetchStockQuote(code) {
  const url = `https://qt.gtimg.cn/q=${code}`;
  const buf = await httpGet(url, 6000);

  // 腾讯接口返回 GBK 编码
  let raw;
  try {
    raw = require('iconv-lite').decode(buf, 'gbk');
  } catch (_) {
    raw = buf.toString('utf8');
  }

  // 格式: v_sh600519="1~贵州茅台~600519~..."
  const vMatch = raw.match(/="([^"]+)"/);
  if (!vMatch) throw new Error('股票数据解析失败');

  const parts = vMatch[1].split('~');
  if (parts.length < 35) throw new Error('股票数据字段不足');

  return {
    code: parts[2] || code,
    name: parts[1] || '',
    price: parseFloat(parts[3]) || 0,
    change: parseFloat(parts[31]) || 0,
    changePercent: parseFloat(parts[32]) || 0,
    high: parseFloat(parts[33]) || 0,
    low: parseFloat(parts[34]) || 0,
    open: parseFloat(parts[5]) || 0
  };
}

// ==========================================
// 持仓行情刷新辅助
// ==========================================

/**
 * 根据投资记录获取行情数据，返回 price / navDate / name
 */
async function fetchPriceForInvestment(inv) {
  const strategy = getQuoteStrategy(inv.type_category, inv.code);
  if (!strategy) throw new Error('该品类不支持行情查询');

  if (strategy.type === 'fund') {
    const q = await fetchFundQuote(strategy.code);
    return { price: q.estimatedNav || q.nav, navDate: q.navDate, name: q.name };
  }

  const q = await fetchStockQuote(strategy.code);
  return { price: q.price, navDate: new Date().toISOString().slice(0, 10), name: q.name };
}

module.exports = {
  httpGet,
  detectCodeType,
  getQuoteStrategy,
  fetchFundQuote,
  fetchStockQuote,
  fetchPriceForInvestment
};
