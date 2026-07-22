/* ============================================
   鑫钱包 · 全栈 App (MariaDB API版)
   ============================================ */

// 统一 API 调用、格式化函数：来自 utils.js（已挂载 window.api / window.fmt）
// 这样 app.js / auth.js 共用同一份 api() 实现，避免行为分裂。

// API 基址
const API = window.XIN_API_BASE || '/api';

// 全局缓存
let cache = { accounts: [], categories: [], investmentTypes: [], investments: [], tags: [], currentMonth: '' };

// ==========================================
// api() / fmt() / escapeHtml() 已通过 utils.js 注入到 window，无需重复定义
// ==========================================

// ==========================================
// Toast
// ==========================================
function showToast(msg, type = 'info') {
    const c = document.getElementById('toastContainer');
    if (!c) { console.log(`[toast:${type}]`, msg); return; }
    // error 走 role=alert 让屏幕阅读器立刻播报；其他用 role=status 走 polite
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.setAttribute('role', type === 'error' ? 'alert' : 'status');
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(() => { t.classList.add('fade-out'); setTimeout(() => t.remove(), 300); }, 3000);
}

// 金额格式化：千分位 + 固定两位小数，如 ¥1,234,567.00
const _moneyFmt = new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function fmt(n) {
    const v = Number(n);
    if (!isFinite(v)) return '¥0.00';
    return '¥' + _moneyFmt.format(v);
}
// 带符号金额（收入 + / 支出 -），用于列表右侧
function fmtSigned(n, type) {
    const v = Number(n);
    if (!isFinite(v)) return '¥0.00';
    const sign = type === 'expense' ? '-' : type === 'transfer_in' || type === 'transfer_out' ? '' : '+';
    return sign + '¥' + _moneyFmt.format(v);
}
// 无符号 ¥ 前缀的纯数字（用于已含 ¥ 的拼接场景，避免双重符号）
function fmtNum(n) {
    const v = Number(n);
    if (!isFinite(v)) return '0.00';
    return _moneyFmt.format(v);
}
function fmtDate(d) {
    // 返回 datetime-local 格式：YYYY-MM-DDTHH:mm
    if (d) {
        // 如果是后端返回的 datetime 字符串（含 T 或空格）
        const s = String(d).replace(' ', 'T');
        return s.slice(0, 16); // YYYY-MM-DDTHH:mm
    }
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const h = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${day}T${h}:${min}`;
}
// 显示用：datetime → 短格式（精确到秒）
function fmtDateTime(s) {
    if (!s) return '';
    const str = String(s).replace('T', ' ').replace('Z', '').trim();
    // 如果有秒就显示到秒
    if (str.length >= 19) return str.slice(0, 19);
    if (str.length >= 16) return str.slice(0, 16);
    return str.slice(0, 10);
}
function parseDateParts(s) {
    const str = String(s).replace('T', ' ').replace('Z', '').trim();
    const [datePart, timePart = ''] = str.split(' ');
    const [y, m, d] = datePart.split('-').map(Number);
    return { y, m, d, time: timePart.slice(0, 5) };
}
// 本地日期 → YYYY-MM-DD（避免 toISOString 的 UTC 偏移问题）
function fmtLocalDate(y, m, d) {
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
function fmtDateGroupHeader(s) {
    const { y, m, d } = parseDateParts(s);
    const weekdays = ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];
    const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    return `${y}年${m}月${d}日 ${weekdays[day]}`;
}
function fmtTransTime(s) {
    const { time } = parseDateParts(s);
    return time || '00:00';
}
function escapeHtml(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// 合并转账配对：将 transfer_in/transfer_out 合并为一条转账记录
function mergeTransferPairs(transactions) {
    const result = [];
    const pairedIds = new Set();
    for (const t of transactions) {
        if (pairedIds.has(t.id)) continue;
        if ((t.type === 'transfer_in' || t.type === 'transfer_out') && t.transfer_id) {
            const pair = transactions.find(
                x => x.transfer_id === t.transfer_id && x.id !== t.id && !pairedIds.has(x.id)
            );
            if (pair) {
                const out = t.type === 'transfer_out' ? t : pair;
                const inn = t.type === 'transfer_in' ? t : pair;
                pairedIds.add(out.id);
                pairedIds.add(inn.id);
                result.push({ ...out, _pairOut: out, _pairIn: inn, _transferOut: out, _transferIn: inn, amount: out.amount, _merged: true });
                continue;
            }
        }
        result.push(t);
    }
    return result;
}

// 骨架屏：数据加载中展示的微光占位
function showSkeleton(el, rows = 3, variant = 'list') {
    if (!el) return;
    let html = '';
    if (variant === 'list') {
        for (let i = 0; i < rows; i++) {
            html += `<div class="skeleton-row"><div class="skeleton-avatar shimmer"></div><div class="skeleton-lines"><div class="skeleton-line shimmer" style="width:45%"></div><div class="skeleton-line shimmer" style="width:70%"></div></div><div class="skeleton-amt shimmer"></div></div>`;
        }
    } else if (variant === 'grid') {
        for (let i = 0; i < rows; i++) html += `<div class="skeleton-card shimmer"></div>`;
    } else if (variant === 'text') {
        for (let i = 0; i < rows; i++) html += `<div class="skeleton-line shimmer" style="width:${60 + (i % 3) * 12}%"></div>`;
    }
    el.innerHTML = `<div class="skeleton-wrap" data-skeleton="${variant}">${html}</div>`;
}

// 空状态：图标 + 文案，比纯文字更友好
function showEmpty(el, text, icon = '🗂️') {
    if (!el) return;
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">${icon}</div><div class="empty-text">${escapeHtml(text)}</div></div>`;
}

// ==========================================
// 初始化缓存
// ==========================================
async function initCache() {
    const now = new Date();
    cache.currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const accData = await api('/accounts');
    cache.accounts = accData ? accData.accounts : [];

    const catData = await api('/categories?flat=1');
    cache.categories = catData || [];

    const invTypes = await api('/investment-types');
    cache.investmentTypes = invTypes || [];

    const tagsData = await api('/tags');
    cache.tags = tagsData || [];

    // 加载预算列表（用于交易表单关联下拉）— 加载当前日期范围内的所有预算
    const budgetsData = await api(`/budgets?period=${cache.currentMonth}-01`);
    cache.budgets = budgetsData || [];
}

function getCat(id) { return cache.categories.find(c => c.id === id) || { id, name: '未知', icon: '📌' }; }
function getAcc(id) { return cache.accounts.find(a => a.id === id) || { id, name: '未知', icon: '💰' }; }
function getExpCats() { return cache.categories.filter(c => c.type === 'expense'); }
function getIncCats() { return cache.categories.filter(c => c.type === 'income'); }

// ==========================================
// 页面标题映射
// ==========================================
const PAGE_META = {
    dashboard: { title: '仪表盘', subtitle: '财务总览与快速洞察' },
    accounts: { title: '账户管理', subtitle: '管理您的资金账户' },
    transfers: { title: '内部转账', subtitle: '账户间资金转移' },
    transactions: { title: '交易管理', subtitle: '记录每一笔收支' },
    budget: { title: '预算管理', subtitle: '设定目标，合理规划' },
    investments: { title: '理财管理', subtitle: '资产配置与收益追踪' },
    debts: { title: '债务管理', subtitle: '贷款·信用卡·借贷跟踪' },
    'ai-recognition': { title: 'AI 识别', subtitle: '智能识别，轻松记账' },
    reports: { title: '报表中心', subtitle: '专业报表，深度回顾' },
    analysis: { title: '消费分析', subtitle: '洞察消费模式' },
    tags: { title: '标签管理', subtitle: '分类标签，灵活筛选' },
    'data-center': { title: '基础数据', subtitle: '分类、投资类型与标签维护' },
    'ai-config': { title: 'AI配置', subtitle: 'AI 服务商配置' }
};

// ==========================================
// 导航（History API 干净路由：/transactions 而非 #transactions）
// ==========================================
let currentPage = 'dashboard';
const navItems = document.querySelectorAll('.nav-item');
navItems.forEach(item => item.addEventListener('click', () => switchPage(item.dataset.page)));
document.querySelectorAll('.see-all').forEach(el => el.addEventListener('click', () => switchPage(el.dataset.page)));
// 移动端底部导航：点击分组标签展开子菜单
let _bottomNavInited = false;
const initBottomNav = () => {
    if (_bottomNavInited) return;
    _bottomNavInited = true;
    const menu = document.getElementById('sidebar').querySelector('.nav-menu');
    const labels = menu.querySelectorAll('.nav-group-label');
    const items = menu.querySelectorAll('.nav-item');

    // 按分组标签对导航项分组
    const groups = {};
    let currentGroup = null;
    menu.querySelectorAll('li').forEach(el => {
        if (el.classList.contains('nav-group-label')) {
            currentGroup = el.textContent.trim();
            groups[currentGroup] = [];
        } else if (currentGroup && el.classList.contains('nav-item')) {
            groups[currentGroup].push(el);
        }
    });

    // 给每个分组标签映射图标
    const groupIcons = { '总览': '📊', '账本': '💰', '分析': '🔍', '设置': '⚙️' };

    // 更新分组标签显示为图标+文字，保存原始名称到 data-group
    labels.forEach(label => {
        const name = label.textContent.trim();
        label.dataset.group = name;
        label.innerHTML = `<span style="font-size:18px">${groupIcons[name] || '📋'}</span><span style="display:block;font-size:9px;line-height:1">${name}</span>`;
    });

    // 点击分组标签展开子菜单
    let openGroup = null;
    const popup = document.createElement('div');
    popup.className = 'mobile-submenu';
    popup.style.cssText = 'display:none;position:fixed;bottom:60px;left:0;right:0;background:var(--surface-card);border-top:1px solid var(--border-subtle);border-radius:12px 12px 0 0;padding:12px 8px;z-index:51;box-shadow:0 -4px 16px rgba(0,0,0,0.15);max-height:50vh;overflow-y:auto;';
    document.body.appendChild(popup);

    const closeSubmenu = () => { popup.style.display = 'none'; openGroup = null; labels.forEach(l => l.classList.remove('active')); };
    document.addEventListener('click', (e) => {
        if (!popup.contains(e.target) && !Array.from(labels).includes(e.target)) closeSubmenu();
    });

    labels.forEach(label => {
        label.addEventListener('click', (e) => {
            e.stopPropagation();
            const name = label.dataset.group;
            // 总览只有一个子项，直接跳转仪表盘
            if (name === '总览') { closeSubmenu(); switchPage('dashboard'); return; }
            if (openGroup === name) { closeSubmenu(); return; }
            labels.forEach(l => l.classList.remove('active'));
            label.classList.add('active');
            openGroup = name;

            const subItems = groups[name] || [];
            popup.innerHTML = subItems.map(it => {
                const icon = it.querySelector('.nav-icon')?.textContent || '📌';
                const text = it.querySelector('.nav-text')?.textContent || it.dataset.page;
                const page = it.dataset.page;
                return `<div class="mobile-subitem" data-page="${page}" style="display:flex;align-items:center;gap:12px;padding:12px;border-radius:8px;cursor:pointer;font-size:14px;color:var(--text-primary);">
                    <span style="font-size:20px">${icon}</span><span>${text}</span>
                </div>`;
            }).join('');
            popup.style.display = 'block';

            // 子项点击
            popup.querySelectorAll('.mobile-subitem').forEach(sub => {
                sub.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const page = sub.dataset.page;
                    closeSubmenu();
                    if (page) switchPage(page);
                });
            });
        });
    });
};
if (window.innerWidth <= 720) initBottomNav();
window.addEventListener('resize', () => { if (window.innerWidth <= 720) initBottomNav(); });if (window.innerWidth <= 720) initBottomNav();
window.addEventListener('resize', () => { if (window.innerWidth <= 720) initBottomNav(); });

// 当前站点根路径（兼容反向代理子路径）：XIN_API_BASE 形如 /xin/api → 根为 /xin
function siteBase() {
    return (window.XIN_API_BASE || '/api').replace(/\/api$/, '');
}
// 从 pathname 解析当前路由页（去掉站点根前缀与首尾斜杠）
function currentRoute() {
    let p = window.location.pathname;
    const base = siteBase();
    if (base && p.startsWith(base)) p = p.slice(base.length);
    p = p.replace(/^\/+/, '').replace(/\/+$/, '');
    return p || 'dashboard';
}
// 路由页对应的 URL（所有页面统一为 /<page>，dashboard 也是 /dashboard）
function pageUrl(page) {
    const base = siteBase();
    return base + '/' + page;
}

// 仅负责 DOM 渲染（不修改历史），供 switchPage 与 popstate 复用
async function showPage(page) {
    // 懒加载：若该 page 为占位 section（data-lazy），先 fetch 进来
    await PageLoader.ensureLoaded(`page-${page}`);

    currentPage = page;
    navItems.forEach(i => i.classList.toggle('active', i.dataset.page === page));
    const meta = PAGE_META[page] || {};
    document.getElementById('pageTitle').textContent = meta.title;
    document.getElementById('pageSubtitle').textContent = meta.subtitle;
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const pg = document.getElementById(`page-${page}`);
    if (pg) pg.classList.add('active');
    // 快速记账按钮仅在仪表盘页面显示
    const quickBtn = document.getElementById('quickAddBtn');
    if (quickBtn) quickBtn.style.display = page === 'dashboard' ? '' : 'none';
    // 刷新当前页数据
    refreshPage(page);
}

// 导航：写入历史记录 + 渲染
function switchPage(page) {
    history.pushState({ page }, '', pageUrl(page));
    showPage(page);  // async: fire-and-forget，避免阻塞 click handler
}

// 浏览器前进/后退：仅渲染，不新增历史
window.addEventListener('popstate', () => {
    const page = currentRoute();
    const valid = Object.keys(PAGE_META);
    showPage(valid.includes(page) ? page : 'dashboard');
});

async function refreshPage(page) {
    if (page === 'dashboard') await DashboardManager.refresh();
    if (page === 'accounts') await AccountManager.refresh();
    if (page === 'transfers') await TransferManager.refresh();
    if (page === 'transactions') await TransactionManager.refresh();
    if (page === 'budget') await BudgetManager.refresh();
    if (page === 'investments') { await InvestmentManager.refresh(); await SavingsGoalManager.refresh(); await InvestmentManager.autoRefreshQuotes(); }
    if (page === 'debts') await DebtManager.refresh();
    if (page === 'data-center') await DataManager.refresh();
    if (page === 'tags') await TagManager.refresh();
    if (page === 'ai-config') { await AIProviderManager.refresh(); await AIProviderManager.refreshOcrConfig(); }
    if (page === 'reports') await ReportManager.refresh();
    if (page === 'analysis') await AnalysisManager.refresh();
}

function quickAddFromAI(catId, note) {
    document.getElementById('quickAddModal').classList.add('show');
    document.querySelectorAll('#quickAddForm .type-btn').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-pressed','false'); if (b.dataset.type === 'expense') { b.classList.add('active'); b.setAttribute('aria-pressed','true'); } });
    QuickAdd.updateCatSelect('expense');
    document.getElementById('quickCategory').value = catId;
    document.getElementById('quickNote').value = note;
}

// AI 洞察 & 建议按钮（消费分析页面内）
document.getElementById('genInsightBtn').addEventListener('click', async () => {
    if (!(await AIRecognition.checkProvider())) {
        AIRecognition.renderNoProvider('insightList');
        return;
    }
    const list = document.getElementById('insightList');
    list.innerHTML = '<div class="skeleton-wrap" data-skeleton="text"><div class="skeleton-line shimmer" style="width:60%"></div><div class="skeleton-line shimmer" style="width:72%"></div><div class="skeleton-line shimmer" style="width:84%"></div></div>';
    const btn = document.getElementById('genInsightBtn');
    btn.disabled = true;
    try {
        const res = await api('/ai/insight', 'POST', { month: cache.currentMonth });
        if (!res || !res.insights) {
            list.innerHTML = `<div class="empty-hint"><div class="empty-icon">⚠️</div><p>${res && res.message ? escapeHtml(res.message) : '获取洞察失败，请检查 AI 配置'}</p></div>`;
            return;
        }
        const items = res.insights || [];
        if (!items.length) {
            list.innerHTML = '<div class="empty-hint"><div class="empty-icon">🧠</div><p>AI 未生成有效洞察，可尝试调整提示词或稍后重试</p></div>';
            return;
        }
        const lvLabel = { warning: '需重视', info: '关注', tip: '小建议' };
        const lvClass = { warning: 'lv-warning', info: 'lv-info', tip: 'lv-tip' };
        list.innerHTML = items.map(i => `<div class="insight-item ${lvClass[i.level] || ''}">
            <div class="insight-head"><span class="insight-title">🧠 ${escapeHtml(i.title || '洞察')}</span>${i.level ? `<span class="lv-badge ${lvClass[i.level]}">${lvLabel[i.level]}</span>` : ''}</div>
            <div class="insight-desc">${escapeHtml(i.description || '')}</div>
            ${i.action ? `<div class="insight-action">💡 ${escapeHtml(i.action)}</div>` : ''}
        </div>`).join('');
        // 持久化到 localStorage + 内存缓存，刷新不丢失
        AnalysisManager._cachedInsights = items;
        AnalysisManager._saveInsights(items);
    } catch (err) {
        list.innerHTML = `<div class="empty-hint"><div class="empty-icon">⚠️</div><p>${escapeHtml(err.message || '获取洞察失败')}</p></div>`;
    } finally {
        btn.disabled = false;
    }
});

document.getElementById('aiGenAdviceBtn').addEventListener('click', () => AnalysisManager.genAdvice());

// ==========================================
// 交易月份筛选选项（原依赖统计页面的 statsMonth，现独立初始化）
(function initTransMonthFilter() {
    const now = new Date();
    let opts = '';
    for (let m = 0; m < 12; m++) {
        const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
        const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        opts += `<option value="${val}">${val}</option>`;
    }
    document.getElementById('transMonthFilter').innerHTML = '<option value="all">所有月份</option>' + opts;
    document.getElementById('transMonthFilter').value = cache.currentMonth;
})();

// ==========================================
// 标签管理（参考 Firefly III tags）
// ==========================================
const TAG_PALETTE = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#22c55e'];

// 颜色选择器渲染（TagManager 和 DataManager 共用）
function initColorSwatches(containerId, inputId) {
    const container = document.getElementById(containerId);
    const input = document.getElementById(inputId);
    if (!container || !input) return;
    container.innerHTML = TAG_PALETTE.map(c =>
        `<span class="color-swatch ${input.value === c ? 'selected' : ''}" style="background:${c}" data-color="${c}"></span>`
    ).join('');
    container.addEventListener('click', (e) => {
        const sw = e.target.closest('.color-swatch');
        if (!sw) return;
        container.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
        sw.classList.add('selected');
        input.value = sw.dataset.color;
    });
}

// ==========================================
// 应用启动
// ==========================================
async function boot() {
    console.log('🚀 鑫钱包启动...');
    await initCache();
    ThemeManager.init();
    AccountManager.init();
    TransferManager.init();
    TransactionManager.init();
    BudgetManager.init();
    InvestmentManager.init();
    DebtManager.init();
    TagManager.init();
    DataManager.init();
    SavingsGoalManager.init();
    CsvManager.init();
    AIRecognition.init();
    AIProviderManager.init();
    ReportManager.init();
    QuickAdd.init();
    await DashboardManager.init();  // async：需先 await PageLoader.ensureLoaded('page-dashboard')

    // 从 URL path 恢复页面状态（干净路由：/transactions）
    const page = currentRoute();
    const validPages = Object.keys(PAGE_META);
    if (validPages.includes(page)) {
        history.replaceState({ page }, '', pageUrl(page));
        await showPage(page);
    } else {
        history.replaceState({ page: 'dashboard' }, '', pageUrl('dashboard'));
        await showPage('dashboard');
    }
    console.log('✅ 鑫钱包系统已就绪');
}

// boot() 由 js/managers/index.js 在 DOMContentLoaded 后直接调用；app.js 加载为普通 script，所有变量已在全局
