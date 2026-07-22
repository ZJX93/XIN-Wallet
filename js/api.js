// 鑫钱包 · API 与格式化工具模块 (ES Module)
// 说明：app.js 仍使用其自带的 api()，本模块供 auth.js 等共享层使用，
// 后续可将 app.js 的 API 调用逐步迁移到此处，实现前端模块化。

export async function api(path, method = 'GET', body = null) {
    const token = localStorage.getItem('zhicai_token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;

    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);

    try {
        const res = await fetch(`${(window.XIN_API_BASE || '/api')}${path}`, opts);
        const data = await res.json().catch(() => ({}));

        if (res.status === 401) {
            // 未授权：通知登录层弹出
            window.dispatchEvent(new CustomEvent('auth:unauthorized'));
            throw new Error(data.message || '未授权');
        }
        if (!data.success) throw new Error(data.message || 'API错误');
        return data.data;
    } catch (err) {
        showToast(err.message, 'error');
        return null;
    }
}

export function showToast(msg, type = 'info') {
    const c = document.getElementById('toastContainer');
    if (!c) return;
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(() => { t.classList.add('fade-out'); setTimeout(() => t.remove(), 300); }, 3000);
}

export function fmt(n) {
    return '¥' + parseFloat(n).toFixed(2);
}

export function fmtDate(d) {
    return d || new Date().toISOString().split('T')[0];
}
