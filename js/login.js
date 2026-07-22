/* ============================================
   鑫钱包 · 独立登录/注册页逻辑
   ============================================ */

const TOKEN_KEY = 'zhicai_token';
const USER_KEY = 'zhicai_user';

function setSession(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
}

function setHint(msg, isError) {
    const el = document.getElementById('authHint');
    if (!el) return;
    el.textContent = msg || '';
    el.className = 'auth-hint' + (isError ? ' error' : '');
    // 错误提示升级为 role=alert 以便屏幕阅读器立刻播报
    el.setAttribute('role', isError ? 'alert' : 'status');
}

async function api(path, method = 'GET', body = null) {
    // 复用 utils.js 统一实现：自动注入 Authorization + 401 派发 auth:unauthorized + silent 模式
    return window.api(path, method, body, { silent: true });
}

function applyTheme() {
    const saved = localStorage.getItem('zhicai_theme') || 'light';
    document.documentElement.setAttribute('data-theme', saved);
}
applyTheme();

// 已登录直接进应用
if (localStorage.getItem(TOKEN_KEY)) {
    location.href = '/';
}

document.addEventListener('DOMContentLoaded', () => {
    const tabs = document.querySelectorAll('.auth-tab');
    const nickGroup = document.getElementById('authNickGroup');
    const submitBtn = document.getElementById('authSubmit');
    const demoBtn = document.getElementById('demoLoginBtn');
    let mode = 'login';

    tabs.forEach(t => t.addEventListener('click', () => {
        tabs.forEach(x => x.classList.remove('active'));
        t.classList.add('active');
        mode = t.dataset.tab;
        if (nickGroup) nickGroup.style.display = mode === 'register' ? 'block' : 'none';
        if (submitBtn) submitBtn.textContent = mode === 'login' ? '登 录' : '注 册';
        setHint('');
    }));

    const form = document.getElementById('authForm');
    if (form) form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('authUser').value.trim();
        const password = document.getElementById('authPass').value;
        const nickname = document.getElementById('authNick').value.trim();
        if (!username || !password) { setHint('请输入用户名和密码', true); return; }
        if (submitBtn) submitBtn.disabled = true;

        try {
            let data;
            if (mode === 'login') {
                data = await api('/auth/login', 'POST', { username, password });
                setHint('登录成功，正在进入...');
            } else {
                data = await api('/auth/register', 'POST', { username, password, nickname });
                setHint('注册成功，正在进入...');
            }
            setSession(data.token, data.user);
            location.href = '/';
        } catch (err) {
            setHint(err.message || '操作失败，请重试', true);
            if (submitBtn) submitBtn.disabled = false;
        }
    });

    if (demoBtn) demoBtn.addEventListener('click', async () => {
        setHint('正在登录演示账号...');
        if (submitBtn) submitBtn.disabled = true;
        try {
            const data = await api('/auth/demo', 'POST');
            setSession(data.token, data.user);
            location.href = '/';
        } catch (err) {
            setHint(err.message || '演示账号登录失败', true);
            if (submitBtn) submitBtn.disabled = false;
        }
    });
});
