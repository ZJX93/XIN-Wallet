/* ============================================
   鑫钱包 · 沙箱演示服务（仅用于沙箱预览）
   ============================================
   沙箱没有 MariaDB，所以用纯 Node stdlib 实现一个内存版 API：
   - 复用前端的响应包络 { success, data, message }
   - 种子数据与 server/index.js 的 insertDemoData 等价（演示账号 / 账户 / 交易 / 预算 / 理财 / 储蓄目标）
   - 所有写操作修改内存对象，刷新页面后状态重置
   - 自动签发 demo token，浏览器无需登录即可访问内部页面
   - 真实部署请用 `npm start`（server/index.js）连接 MariaDB
   ============================================ */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');

const PORT = parseInt(process.env.PORT || '18890', 10);
const HOST = '127.0.0.1';
const ROOT = path.join(__dirname, '..');

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.ico': 'image/x-icon',
    '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.eot': 'application/vnd.ms-fontobject'
};

// ============================================================
// 内存数据（按 server/index.js insertDemoData 等价种子）
// ============================================================
function seed() {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const currentMonth = `${y}-${String(m + 1).padStart(2, '0')}`;
    const prevMonth = m === 0 ? `${y - 1}-12` : `${y}-${String(m).padStart(2, '0')}`;

    const accounts = [
        { id: 1, user_id: 1, name: '现金', type: 'cash', icon: '💵', balance: 3200, opening_balance: 5000, credit_limit: 0, sort_order: 1, status: 'active' },
        { id: 2, user_id: 1, name: '工商银行', type: 'bank', icon: '🏦', balance: 58230.5, opening_balance: 30000, credit_limit: 0, sort_order: 2, status: 'active' },
        { id: 3, user_id: 1, name: '招商信用卡', type: 'credit', icon: '💳', balance: -2340.5, opening_balance: 0, credit_limit: 20000, sort_order: 3, status: 'active' },
        { id: 4, user_id: 1, name: '微信零钱', type: 'wallet', icon: '💚', balance: 1280, opening_balance: 500, credit_limit: 0, sort_order: 4, status: 'active' },
        { id: 5, user_id: 1, name: '支付宝', type: 'wallet', icon: '💙', balance: 4560, opening_balance: 1000, credit_limit: 0, sort_order: 5, status: 'active' }
    ];

    const categories = [
        { id: 1, parent_id: null, name: '餐饮', icon: '🍜', color: '#f97316', type: 'expense', sort_order: 1 },
        { id: 2, parent_id: null, name: '交通', icon: '🚗', color: '#3b82f6', type: 'expense', sort_order: 2 },
        { id: 3, parent_id: null, name: '购物', icon: '🛍️', color: '#ec4899', type: 'expense', sort_order: 3 },
        { id: 4, parent_id: null, name: '住房', icon: '🏠', color: '#8b5cf6', type: 'expense', sort_order: 4 },
        { id: 5, parent_id: null, name: '娱乐', icon: '🎮', color: '#10b981', type: 'expense', sort_order: 5 },
        { id: 6, parent_id: null, name: '医疗', icon: '💊', color: '#ef4444', type: 'expense', sort_order: 6 },
        { id: 7, parent_id: null, name: '教育', icon: '📚', color: '#6366f1', type: 'expense', sort_order: 7 },
        { id: 8, parent_id: null, name: '通讯', icon: '📱', color: '#14b8a6', type: 'expense', sort_order: 8 },
        { id: 9, parent_id: null, name: '服饰', icon: '👕', color: '#f59e0b', type: 'expense', sort_order: 9 },
        { id: 10, parent_id: null, name: '人情', icon: '🎁', color: '#a855f7', type: 'expense', sort_order: 10 },
        { id: 22, parent_id: null, name: '转账', icon: '🔁', color: '#6b7280', type: 'transfer', sort_order: 99 },
        { id: 15, parent_id: null, name: '工资', icon: '💼', color: '#22c55e', type: 'income', sort_order: 1 },
        { id: 16, parent_id: null, name: '奖金', icon: '🎉', color: '#84cc16', type: 'income', sort_order: 2 },
        { id: 17, parent_id: null, name: '投资', icon: '📈', color: '#06b6d4', type: 'income', sort_order: 3 }
    ];

    const investmentTypes = [
        { id: 1, name: '银行存款', icon: '🏦', color: '#3b82f6', risk_level: 'low', sort_order: 1 },
        { id: 2, name: '货币基金', icon: '💰', color: '#10b981', risk_level: 'low', sort_order: 2 },
        { id: 3, name: '债券基金', icon: '📜', color: '#8b5cf6', risk_level: 'low', sort_order: 3 },
        { id: 4, name: '股票基金', icon: '📊', color: '#ef4444', risk_level: 'high', sort_order: 4 },
        { id: 5, name: '股票', icon: '📈', color: '#f59e0b', risk_level: 'very_high', sort_order: 5 },
        { id: 6, name: '黄金', icon: '🥇', color: '#eab308', risk_level: 'medium', sort_order: 6 },
        { id: 7, name: 'REITs', icon: '🏢', color: '#6366f1', risk_level: 'medium', sort_order: 7 },
        { id: 10, name: '黄金 ETF', icon: '🪙', color: '#fbbf24', risk_level: 'medium', sort_order: 10 }
    ];

    const investments = [
        { id: 1, user_id: 1, account_id: 2, investment_type_id: 2, name: '余额宝', code: '000198', buy_price: 1, current_price: 1.0003, quantity: 20000, total_cost: 20000, current_value: 20006, buy_date: '2025-01-01', expected_rate: 2.5, risk_level: 'low', status: 'holding' },
        { id: 2, user_id: 1, account_id: 2, investment_type_id: 4, name: '沪深300ETF', code: '510300', buy_price: 4.12, current_price: 4.56, quantity: 5000, total_cost: 20600, current_value: 22800, buy_date: '2025-03-15', expected_rate: 8, risk_level: 'high', status: 'holding' },
        { id: 3, user_id: 1, account_id: 2, investment_type_id: 3, name: '纯债基金A', code: '003547', buy_price: 1.05, current_price: 1.08, quantity: 10000, total_cost: 10500, current_value: 10800, buy_date: '2025-02-01', expected_rate: 4.5, risk_level: 'low', status: 'holding' },
        { id: 4, user_id: 1, account_id: 2, investment_type_id: 1, name: '银行定期', code: '', buy_price: 1, current_price: 1, quantity: 50000, total_cost: 50000, current_value: 50000, buy_date: '2025-06-01', expected_rate: 2.75, risk_level: 'low', status: 'holding' },
        { id: 5, user_id: 1, account_id: 2, investment_type_id: 10, name: '黄金ETF', code: '518880', buy_price: 5.32, current_price: 5.85, quantity: 2000, total_cost: 10640, current_value: 11700, buy_date: '2025-04-10', expected_rate: 6, risk_level: 'medium', status: 'holding' },
        // 进阶：股票（亏损中）
        { id: 6, user_id: 1, account_id: 2, investment_type_id: 5, name: '贵州茅台', code: 'sh600519', buy_price: 1820, current_price: 1655, quantity: 10, total_cost: 18200, current_value: 16550, buy_date: '2025-09-15', expected_rate: 12, risk_level: 'very_high', status: 'holding' },
        // 进阶：股票（盈利中）
        { id: 7, user_id: 1, account_id: 2, investment_type_id: 5, name: '招商银行', code: 'sh600036', buy_price: 28.5, current_price: 38.7, quantity: 500, total_cost: 14250, current_value: 19350, buy_date: '2024-12-10', expected_rate: 15, risk_level: 'very_high', status: 'holding' },
        // 进阶：REITs
        { id: 8, user_id: 1, account_id: 2, investment_type_id: 7, name: '中金普洛斯REIT', code: '508056', buy_price: 3.85, current_price: 4.12, quantity: 3000, total_cost: 11550, current_value: 12360, buy_date: '2025-05-20', expected_rate: 6, risk_level: 'medium', status: 'holding' }
    ];

    const budgets = [
        { id: 1, user_id: 1, name: '餐饮', amount: 2000, period_type: 'month', start_date: `${currentMonth}-01`, end_date: `${currentMonth}-${new Date(y, m + 1, 0).getDate()}` },
        { id: 2, user_id: 1, name: '交通', amount: 500, period_type: 'month', start_date: `${currentMonth}-01`, end_date: `${currentMonth}-${new Date(y, m + 1, 0).getDate()}` },
        { id: 3, user_id: 1, name: '购物', amount: 800, period_type: 'month', start_date: `${currentMonth}-01`, end_date: `${currentMonth}-${new Date(y, m + 1, 0).getDate()}` },
        { id: 4, user_id: 1, name: '娱乐', amount: 300, period_type: 'month', start_date: `${currentMonth}-01`, end_date: `${currentMonth}-${new Date(y, m + 1, 0).getDate()}` },
        { id: 5, user_id: 1, name: '住房', amount: 4000, period_type: 'month', start_date: `${currentMonth}-01`, end_date: `${currentMonth}-${new Date(y, m + 1, 0).getDate()}` }
    ];

    const tags = [
        { id: 1, name: '家庭', color: '#ef4444' },
        { id: 2, name: '工作', color: '#3b82f6' },
        { id: 3, name: '出差', color: '#10b981' },
        { id: 4, name: '日常', color: '#8b5cf6' },
        { id: 5, name: '学习', color: '#f59e0b' }
    ];

    const savingsGoals = [
        { id: 1, user_id: 1, name: '新车基金', target_amount: 200000, current_amount: 65000, icon: '🚗', status: 'active' },
        { id: 2, user_id: 1, name: '旅行基金', target_amount: 50000, current_amount: 12000, icon: '✈️', status: 'active' },
        { id: 3, user_id: 1, name: '应急储备', target_amount: 100000, current_amount: 100000, icon: '🛡️', status: 'active' },
        // 进阶：装修 / 教育 / 退休
        { id: 4, user_id: 1, name: '装修基金', target_amount: 80000, current_amount: 35000, icon: '🏠', status: 'active' },
        { id: 5, user_id: 1, name: '子女教育金', target_amount: 300000, current_amount: 28000, icon: '🎓', status: 'active' },
        { id: 6, user_id: 1, name: '退休基金', target_amount: 1000000, current_amount: 150000, icon: '👴', status: 'active' }
    ];

    // 演示交易（当月 + 5 个月历史，趋势图更真实）
    const transactions = [];
    let txId = 1;
    const templates = [
        { category_id: 15, type: 'income', amount: 15000, note: '月工资' },
        { category_id: 16, type: 'income', amount: 3000, note: '季度奖金' },
        { category_id: 17, type: 'income', amount: 800, note: '基金分红' },
        { category_id: 1, type: 'expense', amount: 45, note: '午餐' },
        { category_id: 1, type: 'expense', amount: 120, note: '周末聚餐' },
        { category_id: 1, type: 'expense', amount: 35, note: '早餐+咖啡' },
        { category_id: 1, type: 'expense', amount: 200, note: '超市采购' },
        { category_id: 2, type: 'expense', amount: 30, note: '滴滴打车' },
        { category_id: 2, type: 'expense', amount: 150, note: '加油' },
        { category_id: 3, type: 'expense', amount: 299, note: '京东购物' },
        { category_id: 3, type: 'expense', amount: 89, note: '日用品' },
        { category_id: 5, type: 'expense', amount: 50, note: '电影票' },
        { category_id: 5, type: 'expense', amount: 128, note: '游戏充值' },
        { category_id: 4, type: 'expense', amount: 3500, note: '房租' },
        { category_id: 8, type: 'expense', amount: 100, note: '手机话费' },
        { category_id: 6, type: 'expense', amount: 200, note: '体检' },
        { category_id: 7, type: 'expense', amount: 500, note: '网课' },
        { category_id: 9, type: 'expense', amount: 350, note: '买衣服' }
    ];
    // 当月交易
    templates.forEach((t, i) => {
        const d = new Date(y, m, Math.max(1, now.getDate() - i));
        transactions.push({
            id: txId++, user_id: 1, account_id: 2, category_id: t.category_id, type: t.type,
            amount: t.amount, note: t.note, date: d.toISOString().slice(0, 10), tag_ids: []
        });
    });
    // 历史 5 个月，每月 8~10 笔（趋势图更好看）
    for (let monthsAgo = 1; monthsAgo <= 5; monthsAgo++) {
        const dt = new Date(y, m - monthsAgo, 1);
        const ym = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
        const variance = 0.75 + (monthsAgo % 3) * 0.12; // 0.75-0.99 之间浮动
        const slice = templates.slice(0, 10 + (monthsAgo % 3));
        slice.forEach((t, i) => {
            const day = Math.min(28, Math.max(1, 5 + i * 2));
            transactions.push({
                id: txId++, user_id: 1, account_id: 2, category_id: t.category_id, type: t.type,
                amount: Math.round(t.amount * variance),
                note: t.note + ` (${ym})`,
                date: `${ym}-${String(day).padStart(2, '0')}`, tag_ids: []
            });
        });
    }

    // 转账
    const transfers = [
        { id: 1, user_id: 1, from_account_id: 2, to_account_id: 1, amount: 3000, note: '工资取现', date: new Date(y, m, 2).toISOString().slice(0, 10), status: 'completed', from_name: '工商银行', from_icon: '🏦', to_name: '现金', to_icon: '💵' },
        { id: 2, user_id: 1, from_account_id: 4, to_account_id: 5, amount: 500, note: '零钱归集', date: new Date(y, m, 5).toISOString().slice(0, 10), status: 'completed', from_name: '微信零钱', from_icon: '💚', to_name: '支付宝', to_icon: '💙' }
    ];

    const debts = [
        // 房贷：长周期 30 年，剩余较多
        { id: 1, user_id: 1, name: '房贷', icon: '🏠', type: 'loan', creditor: '建设银行', total: 800000, principal: 800000, remaining: 796540.27, interest_rate: 4.2, term_months: 360, method: 'equal_installment', monthly_payment: 3459.73, start_date: '2026-01-20', due_date: '2046-01-20', payment_day: 20, status: 'active' },
        // 招行信用卡：每月最低还款
        { id: 2, user_id: 1, name: '招行信用卡', icon: '💳', type: 'credit_card', creditor: '招商银行', total: 5000, principal: 5000, remaining: 2340.5, interest_rate: 18, method: 'minimum', monthly_payment: 500, start_date: '2025-09-15', due_date: '2027-09-15', payment_day: 15, billing_day: 5, status: 'active' },
        // 车贷：36 期，已还 12 期
        { id: 3, user_id: 1, name: '车贷', icon: '🚗', type: 'loan', creditor: '工商银行', total: 120000, principal: 120000, remaining: 84000, interest_rate: 5.5, term_months: 36, method: 'equal_installment', monthly_payment: 3500, start_date: '2025-08-05', due_date: '2028-08-05', payment_day: 5, status: 'active' },
        // 朋友借款：无息，剩 2 期
        { id: 4, user_id: 1, name: '朋友借款', icon: '🤝', type: 'personal', creditor: '张三', total: 10000, principal: 10000, remaining: 4000, interest_rate: 0, term_months: 5, method: 'lump_sum', monthly_payment: 2000, start_date: '2026-05-28', due_date: '2026-10-28', payment_day: 28, status: 'active' }
    ];
    // 房贷 7 期历史（按月）
    const debtRepayments = [
        // 房贷 7 月
        { id: 1, debt_id: 1, amount: 3459.73, principal_part: 1500, interest_part: 1959.73, paid_at: '2026-07-20', account_id: 2, account_name: '工商银行', account_icon: '🏦', note: '7月房贷' },
        { id: 2, debt_id: 1, amount: 3459.73, principal_part: 1480, interest_part: 1979.73, paid_at: '2026-06-20', account_id: 2, account_name: '工商银行', account_icon: '🏦', note: '6月房贷' },
        { id: 3, debt_id: 1, amount: 3459.73, principal_part: 1460, interest_part: 1999.73, paid_at: '2026-05-20', account_id: 2, account_name: '工商银行', account_icon: '🏦', note: '5月房贷' },
        { id: 4, debt_id: 1, amount: 3459.73, principal_part: 1440, interest_part: 2019.73, paid_at: '2026-04-20', account_id: 2, account_name: '工商银行', account_icon: '🏦', note: '4月房贷' },
        { id: 5, debt_id: 1, amount: 3459.73, principal_part: 1420, interest_part: 2039.73, paid_at: '2026-03-20', account_id: 2, account_name: '工商银行', account_icon: '🏦', note: '3月房贷' },
        { id: 6, debt_id: 1, amount: 3459.73, principal_part: 1400, interest_part: 2059.73, paid_at: '2026-02-20', account_id: 2, account_name: '工商银行', account_icon: '🏦', note: '2月房贷' },
        // 招行信用卡：按月部分还款
        { id: 7, debt_id: 2, amount: 500, principal_part: 500, interest_part: 0, paid_at: '2026-07-15', account_id: 3, account_name: '招商信用卡', account_icon: '💳', note: '7月最低还款' },
        { id: 8, debt_id: 2, amount: 800, principal_part: 800, interest_part: 0, paid_at: '2026-06-10', account_id: 3, account_name: '招商信用卡', account_icon: '💳', note: '6月部分还款' },
        { id: 9, debt_id: 2, amount: 500, principal_part: 500, interest_part: 0, paid_at: '2026-05-15', account_id: 3, account_name: '招商信用卡', account_icon: '💳', note: '5月最低还款' },
        // 车贷：8 期历史
        { id: 10, debt_id: 3, amount: 3500, principal_part: 3000, interest_part: 500, paid_at: '2026-07-05', account_id: 2, account_name: '工商银行', account_icon: '🏦', note: '7月车贷' },
        { id: 11, debt_id: 3, amount: 3500, principal_part: 3000, interest_part: 500, paid_at: '2026-06-05', account_id: 2, account_name: '工商银行', account_icon: '🏦', note: '6月车贷' },
        { id: 12, debt_id: 3, amount: 3500, principal_part: 3000, interest_part: 500, paid_at: '2026-05-05', account_id: 2, account_name: '工商银行', account_icon: '🏦', note: '5月车贷' },
        // 朋友借款：已还部分
        { id: 13, debt_id: 4, amount: 2000, principal_part: 2000, interest_part: 0, paid_at: '2026-06-28', account_id: 5, account_name: '支付宝', account_icon: '💙', note: '微信朋友借款首期' }
    ];

    return {
        now, y, m, currentMonth, prevMonth,
        accounts, categories, investmentTypes, investments, budgets, tags,
        savingsGoals, transactions, transfers, debts, debtRepayments,
        // 计数器（用于自增 ID）
        nextId: { account: 100, category: 100, invType: 100, investment: 100, budget: 100, tag: 100, goal: 100, transaction: 1000, transfer: 100, debt: 100, debtRepay: 100 },
        aiProviders: [
            { id: 1, name: '内置关键词', type: 'builtin', active: 1, api_key: '', base_url: '', model: 'builtin' }
        ],
        ocrConfig: { provider: 'tencent', secret_id: '', secret_key: '' }
    };
}

const DB = seed();

// ============================================================
// 路由处理（极简 stdlib router）
// ============================================================
function ok(res, data, message) {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ success: true, data, message: message || '' }));
}
function bad(res, message, code = 400) {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ success: false, message, code }));
}

const routes = [];
function route(method, pattern, handler) {
    // pattern 形如 '/accounts/:id'，编译为正则
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:[a-zA-Z]+/g, (m) => {
        keys.push(m.slice(1));
        return '([^/]+)';
    }).replace(/\//g, '\\/') + '\\/?$');
    routes.push({ method, re, keys, handler });
}

// 辅助：生成新 ID
function nextId(kind) { return DB.nextId[kind]++; }

// 鉴权：演示模式直接放行（沙箱用）
function authOk(req, res) {
    const auth = req.headers.authorization || '';
    if (!auth.startsWith('Bearer ')) { bad(res, '未授权', 401); return false; }
    return true;
}

// ---------- 路由表 ----------

// 认证
route('POST', '/auth/login', (req, res) => {
    const { username } = req.body || {};
    const user = { id: 1, username: username || 'demo', nickname: '演示用户' };
    ok(res, { token: 'demo-token-' + Date.now(), user }, '登录成功');
});
route('POST', '/auth/register', (req, res) => {
    const { username, nickname } = req.body || {};
    ok(res, { token: 'demo-token-' + Date.now(), user: { id: 1, username, nickname } }, '注册成功');
});
route('POST', '/auth/demo', (req, res) => {
    ok(res, { token: 'demo-token-' + Date.now(), user: { id: 1, username: 'demo', nickname: '演示用户' } }, '演示登录');
});

// 账户
route('GET', '/accounts', (req, res) => {
    const accounts = DB.accounts.filter(a => a.status === 'active');
    const total = accounts.reduce((s, a) => s + parseFloat(a.balance || 0), 0);
    ok(res, { accounts, totalAssets: Math.round(total * 100) / 100 });
});
route('POST', '/accounts', (req, res) => {
    const b = req.body || {};
    if (!b.name || !b.type) return bad(res, '名称和类型必填');
    const id = nextId('account');
    const acc = { id, user_id: 1, name: b.name, type: b.type, icon: b.icon || '💰', balance: parseFloat(b.balance) || 0, opening_balance: parseFloat(b.balance) || 0, credit_limit: parseFloat(b.credit_limit) || 0, sort_order: DB.accounts.length + 1, status: 'active' };
    DB.accounts.push(acc);
    ok(res, { id }, '账户已创建');
});
route('PUT', '/accounts/:id', (req, res) => {
    const acc = DB.accounts.find(a => a.id === parseInt(req.params.id));
    if (!acc) return bad(res, '账户不存在', 404);
    const b = req.body || {};
    acc.name = b.name || acc.name;
    acc.type = b.type || acc.type;
    acc.icon = b.icon || acc.icon;
    if (b.balance != null) acc.balance = parseFloat(b.balance);
    if (b.credit_limit != null) acc.credit_limit = parseFloat(b.credit_limit);
    ok(res, null, '账户已更新');
});
route('DELETE', '/accounts/:id', (req, res) => {
    const acc = DB.accounts.find(a => a.id === parseInt(req.params.id));
    if (!acc) return bad(res, '账户不存在', 404);
    acc.status = 'closed';
    ok(res, null, '账户已关闭');
});
route('POST', '/accounts/reconcile', (req, res) => {
    ok(res, { reconciled: 0, totalAdjusted: 0 }, '账户余额与账本一致，无需修正');
});
route('GET', '/accounts/:id/transactions', (req, res) => {
    const acc = DB.accounts.find(a => a.id === parseInt(req.params.id));
    if (!acc) return bad(res, '账户不存在', 404);
    const list = DB.transactions.filter(t => t.account_id === acc.id);
    list.forEach(t => {
        t.category = DB.categories.find(c => c.id === t.category_id);
    });
    ok(res, { account: acc, transactions: list });
});

// 分类
route('GET', '/categories', (req, res) => {
    ok(res, DB.categories);
});
route('POST', '/categories', (req, res) => {
    const b = req.body || {};
    const cat = { id: nextId('category'), parent_id: b.parent_id || null, name: b.name, icon: b.icon || '🏷️', color: b.color || '#6b7280', type: b.type || 'expense', sort_order: DB.categories.length + 1 };
    DB.categories.push(cat);
    ok(res, { id: cat.id }, '分类已创建');
});
route('PUT', '/categories/:id', (req, res) => {
    const cat = DB.categories.find(c => c.id === parseInt(req.params.id));
    if (!cat) return bad(res, '分类不存在', 404);
    Object.assign(cat, req.body);
    ok(res, null, '分类已更新');
});
route('DELETE', '/categories/:id', (req, res) => {
    const i = DB.categories.findIndex(c => c.id === parseInt(req.params.id));
    if (i === -1) return bad(res, '分类不存在', 404);
    DB.categories.splice(i, 1);
    ok(res, null, '分类已删除');
});

// 交易
route('GET', '/transactions', (req, res) => {
    let list = DB.transactions.slice();
    if (req.query.month) list = list.filter(t => t.date && t.date.startsWith(req.query.month));
    if (req.query.type) list = list.filter(t => t.type === req.query.type);
    if (req.query.category_id) list = list.filter(t => t.category_id === parseInt(req.query.category_id));
    if (req.query.account_id) list = list.filter(t => t.account_id === parseInt(req.query.account_id));
    if (req.query.search) {
        const kw = String(req.query.search).toLowerCase();
        list = list.filter(t => (t.note || '').toLowerCase().includes(kw));
    }
    if (req.query.limit) list = list.slice(0, parseInt(req.query.limit));
    list.forEach(t => {
        t.category = DB.categories.find(c => c.id === t.category_id);
        t.account = DB.accounts.find(a => a.id === t.account_id);
        t.tags = (t.tag_ids || []).map(id => DB.tags.find(x => x.id === id)).filter(Boolean);
    });
    list.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.id - a.id));
    ok(res, list);
});
route('GET', '/transactions/months', (req, res) => {
    const months = new Set(DB.transactions.map(t => (t.date || '').slice(0, 7)).filter(Boolean));
    ok(res, [...months].sort().reverse());
});
route('GET', '/transactions/summary', (req, res) => {
    const month = req.query.month;
    const list = DB.transactions.filter(t => !month || (t.date && t.date.startsWith(month)));
    const income = list.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expense = list.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

    // 按分类汇总支出 / 收入（图表用）
    const expMap = new Map();
    const incMap = new Map();
    list.forEach(t => {
        if (t.type === 'expense') {
            const c = DB.categories.find(x => x.id === t.category_id);
            if (!c) return;
            const e = expMap.get(c.id) || { id: c.id, name: c.name, icon: c.icon, color: c.color, total: 0, count: 0 };
            e.total += t.amount; e.count += 1;
            expMap.set(c.id, e);
        } else if (t.type === 'income') {
            const c = DB.categories.find(x => x.id === t.category_id);
            if (!c) return;
            const e = incMap.get(c.id) || { id: c.id, name: c.name, icon: c.icon, color: c.color, total: 0, count: 0 };
            e.total += t.amount; e.count += 1;
            incMap.set(c.id, e);
        }
    });
    const expenseByCategory = [...expMap.values()].sort((a, b) => b.total - a.total);
    const incomeByCategory = [...incMap.values()].sort((a, b) => b.total - a.total);

    ok(res, {
        income, expense, net: income - expense, count: list.length,
        expenseByCategory, incomeByCategory
    });
});
route('POST', '/transactions', (req, res) => {
    const b = req.body || {};
    const t = { id: nextId('transaction'), user_id: 1, account_id: b.account_id, category_id: b.category_id, type: b.type, amount: parseFloat(b.amount) || 0, note: b.note || '', date: b.date || new Date().toISOString().slice(0, 10), tag_ids: b.tag_ids || [] };
    DB.transactions.push(t);
    // 更新账户余额
    const acc = DB.accounts.find(a => a.id === t.account_id);
    if (acc) {
        if (t.type === 'income') acc.balance += t.amount;
        else if (t.type === 'expense') acc.balance -= t.amount;
    }
    ok(res, { id: t.id }, '交易已创建');
});
route('PUT', '/transactions/:id', (req, res) => {
    const t = DB.transactions.find(x => x.id === parseInt(req.params.id));
    if (!t) return bad(res, '交易不存在', 404);
    Object.assign(t, req.body);
    ok(res, null, '交易已更新');
});
route('DELETE', '/transactions/:id', (req, res) => {
    const i = DB.transactions.findIndex(x => x.id === parseInt(req.params.id));
    if (i === -1) return bad(res, '交易不存在', 404);
    const t = DB.transactions[i];
    // 回滚账户余额（与新增时反向）
    const acc = DB.accounts.find(a => a.id === t.account_id);
    if (acc) {
        if (t.type === 'income') acc.balance -= t.amount;
        else if (t.type === 'expense') acc.balance += t.amount;
    }
    DB.transactions.splice(i, 1);
    ok(res, null, '交易已删除');
});
route('GET', '/ledger', (req, res) => {
    ok(res, DB.transactions.slice(0, 50));
});
route('GET', '/reports', (req, res) => {
    const type = req.query.type || 'monthly';
    const period = req.query.period || DB.currentMonth;
    const [y, m] = period.split('-').map(Number);
    let start, end, label, prevStart, prevEnd, prevLabel;
    if (type === 'yearly') {
        start = `${y}-01-01`; end = `${y}-12-31`; label = `年报 ${y}`;
        prevStart = `${y - 1}-01-01`; prevEnd = `${y - 1}-12-31`; prevLabel = String(y - 1);
    } else {
        const lastDay = new Date(y, m, 0).getDate();
        start = `${period}-01`; end = `${period}-${String(lastDay).padStart(2, '0')}`;
        label = `月报 ${period}`;
        const pm = m === 1 ? 12 : m - 1, py = m === 1 ? y - 1 : y;
        const prevPeriod = `${py}-${String(pm).padStart(2, '0')}`;
        const pLastDay = new Date(py, pm, 0).getDate();
        prevStart = `${prevPeriod}-01`; prevEnd = `${prevPeriod}-${String(pLastDay).padStart(2, '0')}`;
        prevLabel = prevPeriod;
    }
    const inRange = (t, s, e) => t.date && t.date >= s && t.date <= e;
    const list = DB.transactions.filter(t => inRange(t, start, end));
    const prevList = DB.transactions.filter(t => inRange(t, prevStart, prevEnd));
    const income = list.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expense = list.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const balance = income - expense;
    const prevIncome = prevList.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const prevExpense = prevList.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const prevBalance = prevIncome - prevExpense;
    const days = Math.max(1, Math.round((new Date(end) - new Date(start)) / 86400000) + 1);
    const avgDailyExpense = Math.round(expense / days * 100) / 100;
    const savingsRate = income > 0 ? Math.round((balance / income) * 1000) / 10 : 0;
    const expMap = new Map(), incMap = new Map();
    list.forEach(t => {
        if (t.type !== 'expense' && t.type !== 'income') return;
        const c = DB.categories.find(x => x.id === t.category_id);
        if (!c) return;
        const m = (t.type === 'expense' ? expMap : incMap);
        const e = m.get(c.id) || { id: c.id, name: c.name, icon: c.icon, total: 0, count: 0 };
        e.total += t.amount; e.count += 1;
        m.set(c.id, e);
    });
    const expenseByCategory = [...expMap.values()].sort((a, b) => b.total - a.total);
    const incomeByCategory = [...incMap.values()].sort((a, b) => b.total - a.total);
    const topExpenses = list.filter(t => t.type === 'expense').sort((a, b) => b.amount - a.amount).slice(0, 10)
        .map(t => ({ ...t, category: DB.categories.find(c => c.id === t.category_id), account: DB.accounts.find(a => a.id === t.account_id) }));
    const dailyMap = new Map();
    list.forEach(t => {
        const e = dailyMap.get(t.date) || { date: t.date, income: 0, expense: 0 };
        if (t.type === 'income') e.income += t.amount;
        else if (t.type === 'expense') e.expense += t.amount;
        dailyMap.set(t.date, e);
    });
    const dailyTrend = [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date));
    const accountFlows = DB.accounts.map(a => {
        const al = list.filter(t => t.account_id === a.id);
        const in_ = al.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
        const out = al.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
        return { id: a.id, name: a.name, icon: a.icon, income: in_, expense: out, net: in_ - out };
    }).filter(a => a.income || a.expense);
    const budgetExecution = DB.budgets.map(b => {
        const actual = list.filter(t => t.type === 'expense' && (b.name === '总支出' || (t.note || '').includes(b.name))).reduce((s, t) => s + t.amount, 0);
        const usage = b.amount > 0 ? (actual / b.amount * 100) : 0;
        return { id: b.id, name: b.name, icon: '🎯', budget: b.amount, actual, usage };
    });
    const totalAssets = DB.accounts.reduce((s, a) => s + a.balance, 0);
    const invTotal = DB.investments.reduce((s, i) => s + parseFloat(i.current_value || 0), 0);
    ok(res, {
        label, start, end, period,
        type, period_type: type,
        summary: { income, expense, balance, transactionCount: list.length, avgDailyExpense, savingsRate },
        compare: { label: prevLabel, income: prevIncome, expense: prevExpense, balance: prevBalance },
        assets: { totalAssets, accounts: totalAssets - invTotal, investments: invTotal },
        expenseByCategory, incomeByCategory,
        topExpenses, dailyTrend, accountFlows, budgetExecution
    });
});

// 转账
route('GET', '/transfers', (req, res) => {
    let list = DB.transfers.slice();
    if (req.query.month) list = list.filter(t => (t.date || '').startsWith(req.query.month));
    ok(res, list);
});
route('POST', '/transfers', (req, res) => {
    const b = req.body || {};
    const from = DB.accounts.find(a => a.id === parseInt(b.from_account_id));
    const to = DB.accounts.find(a => a.id === parseInt(b.to_account_id));
    if (!from || !to) return bad(res, '账户不存在');
    const amount = parseFloat(b.amount) || 0;
    from.balance -= amount;
    to.balance += amount;
    const id = nextId('transfer');
    DB.transfers.push({ id, user_id: 1, from_account_id: from.id, to_account_id: to.id, amount, note: b.note || '', date: b.date || new Date().toISOString().slice(0, 10), status: 'completed', from_name: from.name, from_icon: from.icon, to_name: to.name, to_icon: to.icon });
    ok(res, { id }, '转账成功');
});
route('PUT', '/transfers/:id', (req, res) => {
    const t = DB.transfers.find(x => x.id === parseInt(req.params.id));
    if (!t) return bad(res, '转账不存在', 404);
    Object.assign(t, req.body);
    ok(res, null, '转账已更新');
});
route('DELETE', '/transfers/:id', (req, res) => {
    const i = DB.transfers.findIndex(x => x.id === parseInt(req.params.id));
    if (i === -1) return bad(res, '转账不存在', 404);
    DB.transfers.splice(i, 1);
    ok(res, null, '转账已删除');
});

// 预算
route('GET', '/budgets', (req, res) => {
    ok(res, DB.budgets);
});
route('POST', '/budgets', (req, res) => {
    const b = req.body || {};
    const item = { id: nextId('budget'), user_id: 1, name: b.name, amount: parseFloat(b.amount) || 0, period_type: b.period_type || 'month', start_date: b.start_date, end_date: b.end_date };
    DB.budgets.push(item);
    ok(res, { id: item.id }, '预算已创建');
});
route('PUT', '/budgets/:id', (req, res) => {
    const b = DB.budgets.find(x => x.id === parseInt(req.params.id));
    if (!b) return bad(res, '预算不存在', 404);
    Object.assign(b, req.body);
    ok(res, null, '预算已更新');
});
route('DELETE', '/budgets/:id', (req, res) => {
    const i = DB.budgets.findIndex(x => x.id === parseInt(req.params.id));
    if (i === -1) return bad(res, '预算不存在', 404);
    DB.budgets.splice(i, 1);
    ok(res, null, '预算已删除');
});

// 理财类型 / 持仓
route('GET', '/investment-types', (req, res) => ok(res, DB.investmentTypes));
route('POST', '/investment-types', (req, res) => {
    const b = req.body || {};
    const t = { id: nextId('invType'), name: b.name, icon: b.icon || '💰', color: b.color || '#6b7280', sort_order: DB.investmentTypes.length + 1 };
    DB.investmentTypes.push(t);
    ok(res, { id: t.id }, '类型已创建');
});
route('PUT', '/investment-types/:id', (req, res) => {
    const t = DB.investmentTypes.find(x => x.id === parseInt(req.params.id));
    if (!t) return bad(res, '类型不存在', 404);
    Object.assign(t, req.body);
    ok(res, null, '类型已更新');
});
route('DELETE', '/investment-types/:id', (req, res) => {
    const i = DB.investmentTypes.findIndex(x => x.id === parseInt(req.params.id));
    if (i === -1) return bad(res, '类型不存在', 404);
    DB.investmentTypes.splice(i, 1);
    ok(res, null, '类型已删除');
});
route('GET', '/investments', (req, res) => {
    const list = DB.investments.map(inv => {
        const cost = parseFloat(inv.total_cost || 0);
        const value = parseFloat(inv.current_value || 0);
        const profit = value - cost;
        const profitRate = cost > 0 ? Math.round(profit / cost * 1000) / 10 : 0;
        const itype = DB.investmentTypes.find(t => t.id === inv.investment_type_id);
        // 年化收益率（基于持有天数）
        const days = inv.buy_date ? Math.max(1, Math.floor((Date.now() - new Date(inv.buy_date).getTime()) / 86400000)) : 365;
        const annualizedRate = cost > 0 ? Math.round(profit / cost * (365 / Math.min(days, 365)) * 1000) / 10 : 0;
        return {
            ...inv,
            type: itype,
            account: DB.accounts.find(a => a.id === inv.account_id),
            type_icon: itype ? itype.icon : '📈',
            risk_level: inv.risk_level || (itype ? itype.risk_level : 'medium'),
            profit, profit_rate: profitRate,
            annualizedRate
        };
    });
    // 按类型分组（前端 renderInvestPie 期望 byType 是以类型 id 为 key 的对象）
    const byType = {};
    list.forEach(inv => {
        const t = inv.type;
        if (!t) return;
        if (!byType[t.id]) {
            byType[t.id] = { type_id: t.id, type_name: t.name, icon: t.icon, color: t.color, total_value: 0, total_cost: 0, count: 0 };
        }
        byType[t.id].total_value += parseFloat(inv.current_value || 0);
        byType[t.id].total_cost += parseFloat(inv.total_cost || 0);
        byType[t.id].count += 1;
    });
    const totalCost = list.reduce((s, i) => s + parseFloat(i.total_cost || 0), 0);
    const totalValue = list.reduce((s, i) => s + parseFloat(i.current_value || 0), 0);
    const totalProfit = totalValue - totalCost;
    const totalProfitRate = totalCost > 0 ? totalProfit / totalCost : 0;
    // 集中度：最大单一持仓占组合的比例
    const concentration = list.length > 0 ? Math.max(...list.map(i => totalValue > 0 ? parseFloat(i.current_value) / totalValue : 0)) * 100 : 0;
    // 加权平均预期年化
    const expectedRateAvg = totalCost > 0 ? list.reduce((s, i) => s + parseFloat(i.expected_rate || 0) * parseFloat(i.total_cost || 0), 0) / totalCost : 0;
    // 简化年化（用 profit_rate 平均近似）
    const annualizedRate = list.length > 0 ? list.reduce((s, i) => s + (i.annualizedRate || 0), 0) / list.length : 0;

    // 前端 InvestmentManager.refresh 期望 { investments: [], summary: {...} } 结构
    const summary = {
        totalCost, totalValue, totalProfit,
        totalProfitRate: totalProfitRate * 100,        // 转为百分比
        annualizedRate,                               // 百分比
        concentration,                                // 百分比 0-100
        expectedRateAvg                               // 百分比
    };

    ok(res, {
        list,
        investments: list,                            // 兼容前端
        byType,
        holdings: list,
        totalCost, totalValue, totalProfit,
        rate: totalCost > 0 ? totalProfit / totalCost : 0,
        summary
    });
});
route('GET', '/stats/investments', (req, res) => {
    const list = DB.investments.map(inv => ({ ...inv, type: DB.investmentTypes.find(t => t.id === inv.investment_type_id) }));
    const totalCost = list.reduce((s, i) => s + parseFloat(i.total_cost || 0), 0);
    const totalValue = list.reduce((s, i) => s + parseFloat(i.current_value || 0), 0);
    const totalProfit = totalValue - totalCost;
    const rate = totalCost > 0 ? totalProfit / totalCost : 0;

    // 按类型分组的数组形式（前端 renderInvTypeBar 期望数组）
    const byTypeMap = {};
    list.forEach(inv => {
        const t = inv.type;
        if (!t) return;
        if (!byTypeMap[t.id]) {
            byTypeMap[t.id] = { type_id: t.id, type_name: t.name, icon: t.icon, color: t.color, total_value: 0, total_cost: 0, count: 0 };
        }
        byTypeMap[t.id].total_value += parseFloat(inv.current_value || 0);
        byTypeMap[t.id].total_cost += parseFloat(inv.total_cost || 0);
        byTypeMap[t.id].count += 1;
    });
    const byType = Object.values(byTypeMap);

    // 趋势线：每个类型一个序列，含 name + points[{date, value}]
    const trendSeries = [];
    // 用一个聚合"组合总值"序列
    const allDates = [];
    for (let w = 7; w >= 0; w--) {
        const d = new Date();
        d.setDate(d.getDate() - w * 7);
        allDates.push(d.toISOString().slice(0, 10));
    }
    // 组合总值的 8 周走势
    const portfolioPoints = allDates.map((d, idx) => {
        const wFactor = 1 + (Math.sin(idx * 0.7) * 0.05) + (idx * 0.012);
        return { date: d, value: Math.round(totalValue * wFactor) };
    });
    trendSeries.push({ name: '组合总值', color: '#6366f1', points: portfolioPoints });
    // 投入本金（稳定）
    trendSeries.push({ name: '投入本金', color: '#94a3b8', points: allDates.map((d, idx) => ({ date: d, value: Math.round(totalCost * (0.85 + idx * 0.025)) })) });

    ok(res, { totalCost, totalValue, profit: totalProfit, rate, byType, trendSeries });
});
route('POST', '/investments', (req, res) => {
    const b = req.body || {};
    const inv = { id: nextId('investment'), user_id: 1, account_id: b.account_id, investment_type_id: b.investment_type_id, name: b.name, code: b.code || '', buy_price: parseFloat(b.buy_price) || 0, current_price: parseFloat(b.current_price) || parseFloat(b.buy_price) || 0, quantity: parseFloat(b.quantity) || 0, total_cost: 0, current_value: 0, buy_date: b.buy_date || new Date().toISOString().slice(0, 10), expected_rate: parseFloat(b.expected_rate) || 0, status: 'holding' };
    inv.total_cost = inv.buy_price * inv.quantity;
    inv.current_value = inv.current_price * inv.quantity;
    DB.investments.push(inv);
    ok(res, { id: inv.id }, '持仓已创建');
});
route('PUT', '/investments/:id', (req, res) => {
    const inv = DB.investments.find(x => x.id === parseInt(req.params.id));
    if (!inv) return bad(res, '持仓不存在', 404);
    Object.assign(inv, req.body);
    if (req.body.buy_price) inv.total_cost = inv.buy_price * inv.quantity;
    if (req.body.current_price) inv.current_value = inv.current_price * inv.quantity;
    ok(res, null, '持仓已更新');
});
route('POST', '/investments/:id/transactions', (req, res) => ok(res, { id: 1 }, '已记录'));
route('PUT', '/investments/:id/sell', (req, res) => ok(res, null, '已卖出'));
route('POST', '/investments/:id/reduce', (req, res) => ok(res, null, '已加仓/减仓'));
route('DELETE', '/investments/:id', (req, res) => {
    const i = DB.investments.findIndex(x => x.id === parseInt(req.params.id));
    if (i === -1) return bad(res, '持仓不存在', 404);
    DB.investments.splice(i, 1);
    ok(res, null, '持仓已删除');
});
route('GET', '/investments/quote', (req, res) => {
    const { code, category } = req.query;
    const hash = parseInt(String(code || '0').replace(/\D/g, '0') || '0') % 100;
    const price = (10 + (hash / 100) * 50).toFixed(2);
    const change = (((hash % 30) - 15) / 100).toFixed(4);
    ok(res, { name: `品种 ${code}`, code, price: parseFloat(price), change: parseFloat(change), changePercent: parseFloat(change) * 100, source: 'mock' });
});
route('POST', '/investments/:id/refresh', (req, res) => ok(res, null, '已刷新行情'));
route('POST', '/investments/refresh-all', (req, res) => ok(res, { updated: DB.investments.length }, '已刷新全部'));

// 标签
route('GET', '/tags', (req, res) => ok(res, DB.tags));
route('POST', '/tags', (req, res) => {
    const b = req.body || {};
    const t = { id: nextId('tag'), name: b.name, color: b.color || '#6b7280' };
    DB.tags.push(t);
    ok(res, { id: t.id }, '标签已创建');
});
route('PUT', '/tags/:id', (req, res) => {
    const t = DB.tags.find(x => x.id === parseInt(req.params.id));
    if (!t) return bad(res, '标签不存在', 404);
    Object.assign(t, req.body);
    ok(res, null, '标签已更新');
});
route('DELETE', '/tags/:id', (req, res) => {
    const i = DB.tags.findIndex(x => x.id === parseInt(req.params.id));
    if (i === -1) return bad(res, '标签不存在', 404);
    DB.tags.splice(i, 1);
    ok(res, null, '标签已删除');
});

// 储蓄目标
route('GET', '/savings-goals', (req, res) => {
    const list = DB.savingsGoals.map(g => {
        const progress = g.target_amount > 0 ? g.current_amount / g.target_amount : 0;
        return { ...g, progress, ratio: Math.round(progress * 100) };
    });
    ok(res, list);
});
route('POST', '/savings-goals', (req, res) => {
    const b = req.body || {};
    const g = { id: nextId('goal'), user_id: 1, name: b.name, target_amount: parseFloat(b.target_amount) || 0, current_amount: parseFloat(b.current_amount) || 0, icon: b.icon || '🎯', status: 'active' };
    DB.savingsGoals.push(g);
    ok(res, { id: g.id }, '目标已创建');
});
route('PUT', '/savings-goals/:id', (req, res) => {
    const g = DB.savingsGoals.find(x => x.id === parseInt(req.params.id));
    if (!g) return bad(res, '目标不存在', 404);
    Object.assign(g, req.body);
    ok(res, null, '目标已更新');
});
route('POST', '/savings-goals/:id/allocate', (req, res) => {
    const g = DB.savingsGoals.find(x => x.id === parseInt(req.params.id));
    if (!g) return bad(res, '目标不存在', 404);
    g.current_amount += parseFloat((req.body || {}).amount) || 0;
    ok(res, null, '已存入');
});
route('POST', '/savings-goals/:id/withdraw', (req, res) => {
    const g = DB.savingsGoals.find(x => x.id === parseInt(req.params.id));
    if (!g) return bad(res, '目标不存在', 404);
    g.current_amount -= parseFloat((req.body || {}).amount) || 0;
    ok(res, null, '已取回');
});
route('DELETE', '/savings-goals/:id', (req, res) => {
    const i = DB.savingsGoals.findIndex(x => x.id === parseInt(req.params.id));
    if (i === -1) return bad(res, '目标不存在', 404);
    DB.savingsGoals.splice(i, 1);
    ok(res, null, '目标已删除');
});

// 仪表盘
route('GET', '/stats/dashboard', (req, res) => {
    const totalAssets = DB.accounts.reduce((s, a) => s + a.balance, 0);
    const month = DB.currentMonth;
    const monthList = DB.transactions.filter(t => (t.date || '').startsWith(month));
    const income = monthList.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expense = monthList.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const todayStr = new Date().toISOString().slice(0, 10);
    const today = monthList.filter(t => t.date === todayStr);
    const todayIncome = today.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const todayExpense = today.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

    // 趋势图：最近 6 个月每月收入/支出/储蓄率 + 环比
    const months = [];
    const [cy, cm] = month.split('-').map(Number);
    for (let i = 5; i >= 0; i--) {
        const d = new Date(cy, cm - 1 - i, 1);
        const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const list = DB.transactions.filter(t => (t.date || '').startsWith(ym));
        const inc = list.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
        const exp = list.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
        const rate = inc > 0 ? Math.round((inc - exp) / inc * 100) : 0;
        months.push({ month: ym, income: inc, expense: exp, savingsRate: rate, incomeMoM: 0, expenseMoM: 0 });
    }
    for (let i = 1; i < months.length; i++) {
        const prev = months[i - 1];
        const cur = months[i];
        if (prev.income > 0) cur.incomeMoM = Math.round((cur.income - prev.income) / prev.income * 1000) / 10;
        if (prev.expense > 0) cur.expenseMoM = Math.round((cur.expense - prev.expense) / prev.expense * 1000) / 10;
    }

    // 理财汇总
    const invTotalCost = DB.investments.reduce((s, i) => s + parseFloat(i.total_cost || 0), 0);
    const invTotalValue = DB.investments.reduce((s, i) => s + parseFloat(i.current_value || 0), 0);
    const invTotalProfit = invTotalValue - invTotalCost;

    // 仪表盘各板块
    const accounts = DB.accounts.filter(a => a.status === 'active');
    // 投资 holdings 加 profit / profit_rate / type_icon
    const investments = DB.investments.map(inv => {
        const cost = parseFloat(inv.total_cost || 0);
        const value = parseFloat(inv.current_value || 0);
        const profit = value - cost;
        const profitRate = cost > 0 ? Math.round(profit / cost * 1000) / 10 : 0;
        const itype = DB.investmentTypes.find(t => t.id === inv.investment_type_id);
        return {
            ...inv,
            inv_type_id: inv.investment_type_id,
            inv_type_name: itype ? itype.name : '',
            inv_type_icon: itype ? itype.icon : '📈',
            type_icon: itype ? itype.icon : '📈',
            account_name: (DB.accounts.find(a => a.id === inv.account_id) || {}).name,
            profit, profit_rate: profitRate
        };
    });

    // 预算：按分类名匹配到支出，加上 actual / ratio / alertLevel / 等指标
    const today2 = new Date();
    const daysInMonth = new Date(today2.getFullYear(), today2.getMonth() + 1, 0).getDate();
    const dayOfMonth = today2.getDate();
    const daysLeft = daysInMonth - dayOfMonth + 1;
    function budgetNameToCatId(name) {
        const c = DB.categories.find(x => x.name === name);
        return c ? c.id : null;
    }
    const budgets = DB.budgets.map(b => {
        // 把交易按备注/分类名映射到预算（这里按 name 模糊匹配：交易 note 含预算名）
        const actual = monthList
            .filter(t => t.type === 'expense' && (b.name === '总支出' || (t.note || '').includes(b.name) || t.category_id === budgetNameToCatId(b.name)))
            .reduce((s, t) => s + t.amount, 0);
        // 简化：没有真匹配时，按比例给一个"已用"值，便于演示
        const fallbackActual = actual > 0 ? actual : Math.round(b.amount * (0.3 + Math.random() * 0.7));
        const ratio = b.amount > 0 ? Math.round(fallbackActual / b.amount * 100) : 0;
        const remain = Math.max(0, b.amount - fallbackActual);
        const over = fallbackActual > b.amount;
        const overBy = over ? fallbackActual - b.amount : 0;
        const dailyAvg = dayOfMonth > 0 ? Math.round(fallbackActual / dayOfMonth) : 0;
        const safeDaily = daysLeft > 0 ? Math.round(remain / daysLeft) : 0;
        const projected = dailyAvg * daysInMonth;
        const willOver = projected > b.amount && !over;
        const willOverBy = willOver ? projected - b.amount : 0;
        const alertLevel = over ? 'danger' : (ratio >= 80 ? 'warning' : 'ok');
        return {
            ...b,
            actual: fallbackActual, ratio, remain, over, overBy,
            dailyAvg, safeDaily, daysLeft, willOver, overBy: willOverBy, alertLevel
        };
    });

    // 储蓄目标
    const savingsGoals = DB.savingsGoals.map(g => {
        const progress = g.target_amount > 0 ? g.current_amount / g.target_amount : 0;
        return { ...g, progress, ratio: Math.round(progress * 100) };
    });

    // 债务
    const debts = DB.debts.map(d => {
        const paid = DB.debtRepayments.filter(r => r.debt_id === d.id).reduce((s, r) => s + r.amount, 0);
        return { ...d, paid_total: paid };
    });
    // 简单算本月需还款：所有 active 债务的 monthly_payment 之和（生产代码更复杂）
    const today_ym = DB.currentMonth;
    const activeDebts = debts.filter(d => d.status === 'active');
    const debtsSummary = {
        count: activeDebts.length,
        totalRemaining: activeDebts.reduce((s, d) => s + parseFloat(d.remaining || 0), 0),
        totalMonthly: activeDebts.reduce((s, d) => s + parseFloat(d.monthly_payment || 0), 0),
        dueThisMonth: activeDebts.length,
        dueAmount: activeDebts.reduce((s, d) => s + parseFloat(d.monthly_payment || 0), 0),
        overdue: 0,
        overdueAmount: 0,
        list: debts
    };

    ok(res, {
        totalAssets: Math.round(totalAssets * 100) / 100,
        netAssets: Math.round(totalAssets * 100) / 100,
        currentMonth: month,
        // 兼容旧字段
        monthIncome: income, monthExpense: expense, monthNet: income - expense,
        todayIncome, todayExpense, todayNet: todayIncome - todayExpense,
        weekIncome: income * 0.3, weekExpense: expense * 0.3,
        yearIncome: income * 8, yearExpense: expense * 8,
        // 新增字段（前端 DashboardManager.refresh 用）
        month: { income, expense, net: income - expense },
        year: { income: income * 8, expense: expense * 8, net: (income - expense) * 8 },
        accounts, total: totalAssets,
        budgets, savingsGoals, debts: debtsSummary,
        investments: {
            totalCost: invTotalCost, totalValue: invTotalValue,
            totalProfit: invTotalProfit, rate: invTotalCost > 0 ? invTotalProfit / invTotalCost : 0,
            holdings: investments
        },
        recentTransactions: monthList.slice(0, 10).map(t => ({ ...t, category: DB.categories.find(c => c.id === t.category_id), account: DB.accounts.find(a => a.id === t.account_id) })),
        months,
        topCategories: DB.categories.slice(0, 5).map(c => ({ ...c, amount: 500 })),
        investmentTotal: invTotalValue, investmentProfit: invTotalProfit
    });
});
route('GET', '/stats/dashboard/detail', (req, res) => {
    const type = req.query.type;
    const todayStr = new Date().toISOString().slice(0, 10);
    const titles = { today: '今日明细', week: '本周明细', month: '本月明细', year: '本年明细', assets: '资产分布', budget: '预算', goal: '储蓄目标', invest: '理财', debt: '债务' };
    if (type === 'assets') {
        const accounts = DB.accounts.filter(a => a.status === 'active');
        const total = accounts.reduce((s, a) => s + a.balance, 0);
        accounts.forEach(a => { a.ratio = total > 0 ? Math.abs(a.balance) / total * 100 : 0; a.inv_value = 0; });
        return ok(res, { type, title: titles[type], total: Math.round(total * 100) / 100, accounts });
    }
    let list = DB.transactions.slice();
    if (type === 'today') list = list.filter(t => t.date === todayStr);
    else if (type === 'week') list = list.slice(0, 15);
    else if (type === 'month') list = list.filter(t => (t.date || '').startsWith(DB.currentMonth));
    else if (type === 'year') list = list;
    list.forEach(t => { t.category = DB.categories.find(c => c.id === t.category_id); t.account = DB.accounts.find(a => a.id === t.account_id); });
    ok(res, { type, title: titles[type] || '明细', transactions: list });
});

// 债务
route('GET', '/debts', (req, res) => {
    const list = DB.debts.map(d => ({ ...d, paid_total: DB.debtRepayments.filter(r => r.debt_id === d.id).reduce((s, r) => s + r.amount, 0) }));
    const activeDebts = list.filter(d => d.status === 'active');
    const summary = {
        count: list.length,
        activeCount: activeDebts.length,
        totalRemaining: activeDebts.reduce((s, d) => s + parseFloat(d.remaining || 0), 0),
        totalMonthly: activeDebts.reduce((s, d) => s + parseFloat(d.monthly_payment || 0), 0),
        dueThisMonth: activeDebts.length,
        dueAmount: activeDebts.reduce((s, d) => s + parseFloat(d.monthly_payment || 0), 0),
        overdue: 0,
        overdueAmount: 0
    };
    ok(res, { debts: list, summary });
});
route('POST', '/debts', (req, res) => {
    const b = req.body || {};
    const d = { id: nextId('debt'), user_id: 1, name: b.name, icon: b.icon || '💳', total: parseFloat(b.total) || 0, remaining: parseFloat(b.remaining) || parseFloat(b.total) || 0, monthly_payment: parseFloat(b.monthly_payment) || 0, payment_day: b.payment_day || 1, start_date: b.start_date || new Date().toISOString().slice(0, 10), status: 'active' };
    DB.debts.push(d);
    ok(res, { id: d.id }, '债务已创建');
});
route('PUT', '/debts/:id', (req, res) => {
    const d = DB.debts.find(x => x.id === parseInt(req.params.id));
    if (!d) return bad(res, '债务不存在', 404);
    Object.assign(d, req.body);
    ok(res, null, '债务已更新');
});
route('DELETE', '/debts/:id', (req, res) => {
    const i = DB.debts.findIndex(x => x.id === parseInt(req.params.id));
    if (i === -1) return bad(res, '债务不存在', 404);
    DB.debts.splice(i, 1);
    ok(res, null, '债务已删除');
});
route('GET', '/debts/:id', (req, res) => {
    const d = DB.debts.find(x => x.id === parseInt(req.params.id));
    if (!d) return bad(res, '债务不存在', 404);
    const repayments = DB.debtRepayments.filter(r => r.debt_id === d.id);
    ok(res, { debt: d, repayments });
});
route('POST', '/debts/:id/repayments', (req, res) => {
    const b = req.body || {};
    const r = { id: nextId('debtRepay'), debt_id: parseInt(req.params.id), amount: parseFloat(b.amount) || 0, principal_part: parseFloat(b.principal_part) || 0, interest_part: parseFloat(b.interest_part) || 0, paid_at: b.paid_at || new Date().toISOString().slice(0, 10), account_id: b.account_id, account_name: (DB.accounts.find(a => a.id === b.account_id) || {}).name, account_icon: (DB.accounts.find(a => a.id === b.account_id) || {}).icon, note: b.note || '' };
    DB.debtRepayments.push(r);
    ok(res, { id: r.id }, '还款已记录');
});
route('DELETE', '/debts/:id/repayments/:rid', (req, res) => {
    const i = DB.debtRepayments.findIndex(x => x.id === parseInt(req.params.rid));
    if (i === -1) return bad(res, '还款不存在', 404);
    DB.debtRepayments.splice(i, 1);
    ok(res, null, '还款已删除');
});

// CSV
route('GET', '/export/csv', (req, res) => {
    const rows = ['date,amount,type,account,category,note'];
    DB.transactions.forEach(t => {
        const cat = DB.categories.find(c => c.id === t.category_id);
        const acc = DB.accounts.find(a => a.id === t.account_id);
        rows.push([t.date, t.amount, t.type, acc ? acc.name : '', cat ? cat.name : '', '"' + (t.note || '').replace(/"/g, '""') + '"'].join(','));
    });
    res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="transactions.csv"' });
    res.end(rows.join('\n'));
});
route('POST', '/import/csv', (req, res) => {
    ok(res, { imported: 0 }, '导入完成');
});
route('GET', '/export/full', (req, res) => {
    ok(res, { accounts: DB.accounts, transactions: DB.transactions, transfers: DB.transfers, budgets: DB.budgets, investments: DB.investments, savingsGoals: DB.savingsGoals, debts: DB.debts });
});
route('POST', '/import/full', (req, res) => ok(res, { imported: 0 }, '导入完成'));

// AI
route('GET', '/ai/providers', (req, res) => ok(res, DB.aiProviders));
route('POST', '/ai/providers', (req, res) => {
    const b = req.body || {};
    const p = { id: nextId('invType'), name: b.name, type: b.type, active: 0, api_key: '', base_url: b.base_url || '', model: b.model || '' };
    DB.aiProviders.push(p);
    ok(res, { id: p.id }, 'Provider 已添加');
});
route('PUT', '/ai/providers/:id', (req, res) => {
    const p = DB.aiProviders.find(x => x.id === parseInt(req.params.id));
    if (!p) return bad(res, 'Provider 不存在', 404);
    Object.assign(p, req.body);
    ok(res, null, '已更新');
});
route('DELETE', '/ai/providers/:id', (req, res) => {
    const i = DB.aiProviders.findIndex(x => x.id === parseInt(req.params.id));
    if (i === -1) return bad(res, 'Provider 不存在', 404);
    DB.aiProviders.splice(i, 1);
    ok(res, null, '已删除');
});
route('POST', '/ai/providers/:id/activate', (req, res) => {
    DB.aiProviders.forEach(p => p.active = p.id === parseInt(req.params.id) ? 1 : 0);
    ok(res, null, '已切换');
});
route('POST', '/ai/providers/:id/test', (req, res) => ok(res, { ok: true, message: '演示模式始终成功' }));
route('POST', '/ai/advice', (req, res) => {
    ok(res, {
        insights: [
            { level: 'tip', title: '餐饮略高', description: '本月餐饮支出 ¥1680，已占预算 84%，建议控制外卖频率。', action: '尝试把外卖次数控制在每周 3 次以内' },
            { level: 'info', title: '储蓄表现优秀', description: '本月净结余 ¥12300，储蓄率 36%，高于同类用户平均。', action: '考虑把多出的部分自动转存到「应急储备」目标' },
            { level: 'warning', title: '房贷剩余较多', description: '房贷剩余 ¥796540，建议保持每月按时还款。', action: '设置每月自动扣款避免逾期' }
        ]
    });
});
route('POST', '/ai/insight', (req, res) => {
    ok(res, {
        insights: [
            { level: 'tip', title: '收入多元化', description: '本月有 3 笔不同来源的收入（工资、奖金、基金分红），财务结构健康。', action: '继续维持多元化收入' },
            { level: 'info', title: '餐饮占支出大头', description: '餐饮占月支出 27%，超过建议的 15%。', action: '尝试每周自己做饭 2-3 次' },
            { level: 'warning', title: '信用卡使用率高', description: '招商信用卡使用率 12%，负债水平良好但需关注最低还款。', action: '建议每月全额还款避免利息' }
        ],
        summary: '本月收支概览：收入 ¥18800，支出 ¥7650，结余 ¥11150。',
        trends: '餐饮、娱乐同比增长 12%；住房持平。',
        advice: '建议把月结余的 30% 自动转存到「应急储备」目标。'
    });
});
route('GET', '/ai/ocr-config', (req, res) => ok(res, DB.ocrConfig));
route('POST', '/ai/ocr-config', (req, res) => {
    Object.assign(DB.ocrConfig, req.body || {});
    ok(res, null, '已保存');
});
route('POST', '/ai/ocr', (req, res) => ok(res, { text: '（演示模式）餐饮 ¥45', items: [{ type: 'expense', amount: 45, category: '餐饮', note: '演示识别结果' }] }));

// ============================================================
// 路由分发
// ============================================================
function handleApi(req, res) {
    const method = req.method;
    let pathname = url.parse(req.url).pathname;
    // 去掉 /api 前缀，与生产 server/index.js 的 app.use('/api', routes) 对齐
    if (pathname.startsWith('/api/')) pathname = pathname.slice(4);
    else if (pathname === '/api') pathname = '/';
    for (const r of routes) {
        if (r.method !== method) continue;
        const m = pathname.match(r.re);
        if (m) {
            req.params = {};
            r.keys.forEach((k, i) => { req.params[k] = decodeURIComponent(m[i + 1]); });
            req.query = url.parse(req.url, true).query;
            try { r.handler(req, res); }
            catch (e) { console.error('handler error:', e); bad(res, e.message || '内部错误', 500); }
            return;
        }
    }
    console.warn(`[404] ${method} ${pathname}`);
    bad(res, `未实现的接口: ${method} ${pathname}`, 404);
}

// ============================================================
// HTTP server
// ============================================================
function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', c => chunks.push(c));
        req.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf8');
            if (!text) return resolve({});
            try { resolve(JSON.parse(text)); }
            catch (e) { reject(new Error('invalid json')); }
        });
        req.on('error', reject);
    });
}

const server = http.createServer(async (req, res) => {
    const t0 = Date.now();
    let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);

    // 与生产 server/index.js 对齐：/login → login.html，根路径与其它无后缀路径 → index.html
    if (urlPath === '/login') urlPath = '/login.html';
    res.on('finish', () => {
        const dur = Date.now() - t0;
        if (urlPath.startsWith('/api/') || res.statusCode >= 400) {
            console.log(`[${new Date().toISOString().slice(11,19)}] ${req.method} ${urlPath} → ${res.statusCode} (${dur}ms)`);
        }
    });

    // 健康检查
    if (urlPath === '/healthz') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"success":true,"data":{"status":"ok"}}'); return; }
    if (urlPath === '/readyz') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"success":true,"data":{"status":"ready"}}'); return; }

    // 阻止越权
    if (/^\/(server|node_modules|\.env)/i.test(urlPath)) { res.writeHead(404); res.end('blocked'); return; }

    // API 走内存处理
    if (urlPath.startsWith('/api/')) {
        try {
            if (req.method !== 'GET' && req.method !== 'HEAD') {
                req.body = await readBody(req);
            } else {
                req.body = {};
            }
            handleApi(req, res);
        } catch (e) {
            console.error('api error:', e);
            bad(res, e.message || 'bad request', 400);
        }
        return;
    }

    // 静态文件
    let filePath = path.join(ROOT, urlPath);
    if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end('forbidden'); return; }
    fs.readFile(filePath, (err, data) => {
        if (err && !path.extname(urlPath)) {
            // SPA 兜底：无后缀 + 文件不存在 → index.html（这样登录后跳到 / 才能看到主页）
            filePath = path.join(ROOT, 'index.html');
            fs.readFile(filePath, (e2, data2) => {
                if (e2) { res.writeHead(404); res.end('not found: ' + urlPath); return; }
                res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache' });
                res.end(data2);
            });
            return;
        }
        if (err) { res.writeHead(404); res.end('not found: ' + urlPath); return; }
        const ext = path.extname(filePath).toLowerCase();
        const type = MIME[ext] || 'application/octet-stream';
        const cache = ext === '.html' ? 'no-cache'
            : filePath.includes('vendor') ? 'public, max-age=604800'
            : 'public, max-age=3600';
        res.writeHead(200, { 'Content-Type': type, 'Cache-Control': cache });
        res.end(data);
    });
});

server.listen(PORT, HOST, () => {
    console.log(`[demo] server on http://${HOST}:${PORT}`);
    console.log(`[demo] accounts=${DB.accounts.length} categories=${DB.categories.length} transactions=${DB.transactions.length} investments=${DB.investments.length}`);
});

// 优雅退出
process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));
