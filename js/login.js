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

// 直接调用 utils.js 暴露的 window.api，避免任何命名冲突
function loginApi(path, method = 'GET', body = null) {
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
        console.log('[login] 表单提交, mode='+mode);
        const username = document.getElementById('authUser').value.trim();
        const password = document.getElementById('authPass').value;
        const nickname = document.getElementById('authNick').value.trim();
        console.log('[login] 用户名='+username, '密码长度='+password.length);
        if (!username || !password) { setHint('请输入用户名和密码', true); return; }
        if (submitBtn) submitBtn.disabled = true;

        try {
            let data;
            console.log('[login] 开始 API 调用...');
            if (mode === 'login') {
                data = await loginApi('/auth/login', 'POST', { username, password });
                console.log('[login] 登录响应:', data);
                setHint('登录成功，正在进入...');
            } else {
                data = await loginApi('/auth/register', 'POST', { username, password, nickname });
                setHint('注册成功，正在进入...');
            }
            console.log('[login] setSession token='+data.token+' user='+data.user?.username);
            setSession(data.token, data.user);
            console.log('[login] 跳转到 /');
            location.href = '/';
        } catch (err) {
            console.error('[login] 失败:', err.message, err);
            setHint(err.message || '操作失败，请重试', true);
            if (submitBtn) submitBtn.disabled = false;
        }
    });

    if (demoBtn) demoBtn.addEventListener('click', async () => {
        setHint('正在登录演示账号...');
        if (submitBtn) submitBtn.disabled = true;
        try {
            const data = await loginApi('/auth/demo', 'POST');
            setSession(data.token, data.user);
            location.href = '/';
        } catch (err) {
            setHint(err.message || '演示账号登录失败', true);
            if (submitBtn) submitBtn.disabled = false;
        }
    });
});
