/* ============================================
   鑫钱包 · 认证模块 (ES Module)
   职责：自动附加 JWT、处理 401 跳转、登出。
   登录/注册 UI 已迁移到独立 login.html，本模块不再管理弹窗。
   ============================================ */

const TOKEN_KEY = 'zhicai_token';
const USER_KEY = 'zhicai_user';

export function getToken() { return localStorage.getItem(TOKEN_KEY); }
export function setSession(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
}
export function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
}
export function getStoredUser() {
    try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch { return null; }
}

// 拦截全局 fetch，自动附加 Authorization 头；业务接口 401 则清会话并跳登录页
const _origFetch = window.fetch ? window.fetch.bind(window) : null;
let _redirecting = false;  // 防止 401 → 跳转 → 重载 → 再次 401 的递归
if (_origFetch) {
    window.fetch = async (input, init = {}) => {
        const url = typeof input === 'string' ? input : (input.url || '');
        const token = getToken();
        // 兼容反向代理/子路径：API 路径可能带前缀（如 /xin/api/...）
        if (token && url.includes('/api/') && !url.includes('/api/auth')) {
            init.headers = { ...(init.headers || {}), Authorization: 'Bearer ' + token };
        }
        const res = await _origFetch(input, init);
        if (res.status === 401 && !_redirecting) {
            _redirecting = true;
            clearSession();
            window.location.href = '/login';
        }
        return res;
    };
}

export function renderUserMenu() {
    const menu = document.getElementById('userMenu');
    const name = document.getElementById('userName');
    const u = getStoredUser();
    if (menu && name) {
        if (u) { name.textContent = u.nickname || u.username; menu.style.display = 'flex'; }
        else { menu.style.display = 'none'; }
    }
}

export function bindLogout() {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', () => {
        clearSession();
        window.location.href = '/login';
    });
}
