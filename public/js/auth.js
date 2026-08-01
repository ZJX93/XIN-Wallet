/* ============================================
   鑫钱包 · 认证模块 (ES Module)
   职责：自动附加 JWT、处理 401 跳转、登出。
   登录/注册 UI 已迁移到独立 login.html，本模块不再管理弹窗。
   ============================================ */

const TOKEN_KEY = 'zhicai_token';
const REFRESH_TOKEN_KEY = 'zhicai_refresh_token';
const USER_KEY = 'zhicai_user';

export function getToken() { return localStorage.getItem(TOKEN_KEY); }
export function getRefreshToken() { return localStorage.getItem(REFRESH_TOKEN_KEY); }
export function setSession(token, refreshToken, user) {
    localStorage.setItem(TOKEN_KEY, token);
    if (refreshToken) localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
}
export function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
}
export function getStoredUser() {
    try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch { return null; }
}

// 拦截全局 fetch，自动附加 Authorization 头；业务接口 401 时尝试 refresh token 自动续期
const _origFetch = window.fetch ? window.fetch.bind(window) : null;
let _redirecting = false;  // 防止 401 → 跳转 → 重载 → 再次 401 的递归
let _refreshing = null;

function apiBase() {
    return window.XIN_API_BASE || '/api';
}

async function refreshAccessToken() {
    if (_refreshing) return _refreshing;
    const refreshToken = getRefreshToken();
    if (!refreshToken) return null;
    _refreshing = _origFetch(`${apiBase()}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken })
    })
        .then(async res => {
            if (!res.ok) return null;
            const payload = await res.json().catch(() => null);
            const token = payload?.data?.token;
            if (!token) return null;
            localStorage.setItem(TOKEN_KEY, token);
            return token;
        })
        .finally(() => { _refreshing = null; });
    return _refreshing;
}

function redirectToLogin() {
    if (_redirecting) return;
    _redirecting = true;
    clearSession();
    window.location.href = '/login';
}

if (_origFetch) {
    window.fetch = async (input, init = {}) => {
        const url = typeof input === 'string' ? input : (input.url || '');
        const isApi = url.includes('/api/') || url.startsWith(apiBase());
        const isAuth = url.includes('/api/auth/login') || url.includes('/api/auth/register') || url.includes('/api/auth/refresh') || url.includes('/api/auth/demo');
        const requestInit = { ...init, headers: { ...(init.headers || {}) } };
        const token = getToken();
        // 兼容反向代理/子路径：API 路径可能带前缀（如 /xin/api/...）
        if (token && isApi && !isAuth) {
            requestInit.headers.Authorization = 'Bearer ' + token;
        }
        let res = await _origFetch(input, requestInit);
        if (res.status === 401 && isApi && !isAuth) {
            const newToken = await refreshAccessToken();
            if (newToken) {
                const retryInit = { ...requestInit, headers: { ...requestInit.headers, Authorization: 'Bearer ' + newToken } };
                res = await _origFetch(input, retryInit);
            }
        }
        if (res.status === 401 && isApi && !isAuth) {
            redirectToLogin();
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

// ============================================
// 个人资料弹窗
// ============================================

const AVATARS = ['👤', '🐱', '🐶', '🐼', '🦊', '🐰', '🐸', '🐧', '🐙', '🦄', '🐳', '🦋', '🌻', '🍀', '⭐', '🔥', '💎', '🎯', '🚀', '🎸'];

function renderAvatarPicker(selected) {
    const picker = document.getElementById('profileAvatarPicker');
    if (!picker) return;
    picker.innerHTML = AVATARS.map(a =>
        `<button type="button" class="avatar-option${a === selected ? ' active' : ''}" data-avatar="${a}">${a}</button>`
    ).join('');
    // 绑定点击事件
    picker.querySelectorAll('.avatar-option').forEach(btn => {
        btn.addEventListener('click', () => {
            const avatar = btn.dataset.avatar;
            document.getElementById('profileAvatarPreview').textContent = avatar;
            picker.querySelectorAll('.avatar-option').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });
}

function getSelectedAvatar() {
    const active = document.querySelector('#profileAvatarPicker .avatar-option.active');
    return active ? active.dataset.avatar : '👤';
}

export function bindProfileModal() {
    const profileBtn = document.getElementById('profileBtn');
    const modal = document.getElementById('profileModal');
    const closeBtn = document.getElementById('profileModalClose');
    const cancelBtn = document.getElementById('profileCancelBtn');
    const form = document.getElementById('profileForm');

    if (!profileBtn || !modal) return;

    // 打开弹窗
    profileBtn.addEventListener('click', async () => {
        // 加载当前用户信息
        try {
            const res = await window.fetch(`${apiBase()}/auth/profile`);
            const data = await res.json();
            if (data.success && data.data.user) {
                const u = data.data.user;
                document.getElementById('profileUsername').value = u.username;
                document.getElementById('profileNickname').value = u.nickname || '';
                // 清空密码字段
                document.getElementById('profileOldPassword').value = '';
                document.getElementById('profileNewPassword').value = '';
                document.getElementById('profileNewPassword2').value = '';
                document.getElementById('profileMsg').textContent = '';
                document.getElementById('profileMsg').className = 'profile-msg';
                // 头像选择器
                const stored = getStoredUser();
                const avatar = (u.avatar) || (stored && stored.avatar) || '👤';
                document.getElementById('profileAvatarPreview').textContent = avatar;
                renderAvatarPicker(avatar);
            }
        } catch (err) {
            console.error('获取用户资料失败:', err);
            showProfileMsg('加载用户信息失败', 'error');
        }
        modal.classList.add('show');
    });

    function close() {
        modal.classList.remove('show');
    }

    closeBtn.addEventListener('click', close);
    cancelBtn.addEventListener('click', close);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) close();
    });

    // 提交表单
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const nickname = document.getElementById('profileNickname').value.trim();
        const oldPassword = document.getElementById('profileOldPassword').value;
        const newPassword = document.getElementById('profileNewPassword').value;
        const newPassword2 = document.getElementById('profileNewPassword2').value;
        const avatar = getSelectedAvatar();

        // 验证
        if (newPassword && newPassword !== newPassword2) {
            showProfileMsg('两次输入的新密码不一致', 'error');
            return;
        }
        if (newPassword && !oldPassword) {
            showProfileMsg('请输入旧密码', 'error');
            return;
        }

        const body = {};
        if (nickname) body.nickname = nickname;
        if (avatar) body.avatar = avatar;
        if (oldPassword && newPassword) {
            body.oldPassword = oldPassword;
            body.newPassword = newPassword;
        }

        try {
            const res = await window.fetch(`${apiBase()}/auth/profile`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const data = await res.json();
            if (data.success) {
                // 更新 localStorage 中的用户信息
                const stored = getStoredUser();
                if (stored) {
                    stored.nickname = data.data.user.nickname;
                    stored.avatar = avatar;
                    localStorage.setItem(USER_KEY, JSON.stringify(stored));
                }
                // 更新头部显示
                renderUserMenu();
                showProfileMsg(data.message || '保存成功', 'success');
                // 清空密码字段
                document.getElementById('profileOldPassword').value = '';
                document.getElementById('profileNewPassword').value = '';
                document.getElementById('profileNewPassword2').value = '';
                // 1.5秒后自动关闭
                setTimeout(close, 1500);
            } else {
                showProfileMsg(data.message || '保存失败', 'error');
            }
        } catch (err) {
            console.error('更新用户资料失败:', err);
            showProfileMsg('网络错误，请重试', 'error');
        }
    });
}

function showProfileMsg(msg, type) {
    const el = document.getElementById('profileMsg');
    if (!el) return;
    el.textContent = msg;
    el.className = 'profile-msg ' + type;
}
