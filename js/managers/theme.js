// 从 C:\Users\XIN\WorkBuddy\XIN-Wallet\js\app.js 拆分而来（原文件第 199-215 行）
// ThemeManager: 主题切换管理（light / dark / system）
const ThemeManager = {
    init() {
        const saved = localStorage.getItem('zhicai_theme') || 'light';
        this.apply(saved);
        document.querySelectorAll('.theme-btn').forEach(btn => {
            btn.addEventListener('click', () => this.apply(btn.dataset.theme));
        });
    },
    apply(theme) {
        let eff = theme;
        if (theme === 'system') eff = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', eff);
        localStorage.setItem('zhicai_theme', theme);
        document.querySelectorAll('.theme-btn').forEach(b => b.classList.toggle('active', b.dataset.theme === theme));
        setTimeout(() => { ChartManager.refreshAll(); }, 200);
    }
};

export default ThemeManager;