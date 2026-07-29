// ============================================================
// AccountManager —— 账户管理模块
// ------------------------------------------------------------
// 拆分来源：C:\Users\XIN\WorkBuddy\XIN-Wallet\js\app.js
// 原始位置：第 1104 行 ~ 第 1253 行（共 150 行）
// 拆分日期：2026-07-22
// 拆分原因：将单体 app.js 按职责拆分为 ES Module，便于按需加载与维护
// 依赖（运行时全局）：api、escapeHtml、fmt、showToast、showSkeleton、
//                    getAcc、initCache、cache，以及 DOM 元素
//                    （addAccountBtn、accModalClose、accCancelBtn、
//                    accForm、reconcileBtn、accountDetailModalClose、
//                    accountDetailModal、accountList、accTotalAssets、
//                    accountModal、accEditId、accName、accType、
//                    accIcon、accBalance、accModalTitle、
//                    accountDetailBody 等）
// ============================================================

const AccountManager = {
    init() {
        document.getElementById('addAccountBtn').addEventListener('click', () => this.openModal());
        document.getElementById('accModalClose').addEventListener('click', () => this.closeModal());
        document.getElementById('accCancelBtn').addEventListener('click', () => this.closeModal());
        document.getElementById('accForm').addEventListener('submit', (e) => { e.preventDefault(); this.save(); });
        document.getElementById('reconcileBtn').addEventListener('click', () => this.reconcile());
        // 账户资金明细模态框
        document.getElementById('accountDetailModalClose').addEventListener('click', () => this.closeDetail());
        document.getElementById('accountDetailModal').addEventListener('click', (e) => { if (e.target === document.getElementById('accountDetailModal')) this.closeDetail(); });
    },
    // 复式记账对账：以账本为唯一真相，重算并修正账户余额
    async reconcile() {
        showToast('正在以账本重算余额…', 'info');
        const r = await api('/accounts/reconcile', 'POST');
        if (r) {
            if (r.reconciled > 0) showToast(`已对账：修正 ${r.reconciled} 个账户，差额合计 ${fmt(r.totalAdjusted)}`, 'success');
            else showToast('账户余额与账本一致，无需修正', 'success');
            await initCache();
            await this.refresh();
        }
    },
    async refresh() {
        const container = document.getElementById('accountList');
        showSkeleton(container, 4, 'list');
        const data = await api('/accounts');
        if (!data) return;
        cache.accounts = data.accounts;
        document.getElementById('accTotalAssets').textContent = fmt(data.totalAssets);
        const typeLabels = { cash: '现金', bank_card: '银行卡', credit_card: '信用卡', electronic_payment: '电子支付', financial_account: '金融账户', digital: '数字货币', other: '其他' };
        container.innerHTML = data.accounts.map(a => `
            <div class="account-item">
                <div class="account-item-icon">${escapeHtml(a.icon)}</div>
                <div class="account-item-name">${escapeHtml(a.name)}</div>
                <span class="account-type-label">${typeLabels[a.type] || a.type}</span>
                <div class="account-item-balance">${fmt(a.balance)}</div>
                <div class="account-item-actions">
                    <button data-action="acc-detail" data-id="${a.id}" title="资金明细">📊</button>
                    <button data-action="edit-acc" data-id="${a.id}" title="编辑">✏️</button>
                    <button data-action="delete-acc" data-id="${a.id}" title="关闭">🗑️</button>
                </div>
            </div>
        `).join('');

        // 事件委托：明细、编辑和删除按钮
        container.querySelectorAll('[data-action="acc-detail"]').forEach(btn => {
            btn.addEventListener('click', () => this.openDetail(parseInt(btn.dataset.id)));
        });
        container.querySelectorAll('[data-action="edit-acc"]').forEach(btn => {
            btn.addEventListener('click', () => this.openModal(parseInt(btn.dataset.id)));
        });
        container.querySelectorAll('[data-action="delete-acc"]').forEach(btn => {
            btn.addEventListener('click', () => this.deleteAccount(parseInt(btn.dataset.id)));
        });
    },
    async openModal(id = null) {
        document.getElementById('accountModal').classList.add('show');
        if (id) {
            const a = getAcc(id);
            document.getElementById('accEditId').value = a.id;
            document.getElementById('accName').value = a.name;
            document.getElementById('accType').value = a.type;
            document.getElementById('accIcon').value = a.icon;
            document.getElementById('accBalance').value = a.balance;
            document.getElementById('accModalTitle').textContent = '编辑账户';
        } else {
            document.getElementById('accEditId').value = '';
            document.getElementById('accName').value = '';
            document.getElementById('accType').value = 'bank_card';
            document.getElementById('accIcon').value = '💰';
            document.getElementById('accBalance').value = 0;
            document.getElementById('accModalTitle').textContent = '新增账户';
        }
    },
    closeModal() { document.getElementById('accountModal').classList.remove('show'); },
    async save() {
        const id = document.getElementById('accEditId').value;
        const body = {
            name: document.getElementById('accName').value,
            type: document.getElementById('accType').value,
            icon: document.getElementById('accIcon').value,
            balance: parseFloat(document.getElementById('accBalance').value)
        };
        if (id) {
            await api(`/accounts/${id}`, 'PUT', body);
            showToast('账户已更新', 'success');
        } else {
            await api('/accounts', 'POST', body);
            showToast('账户已创建', 'success');
        }
        this.closeModal();
        await initCache();
        await this.refresh();
    },
    async deleteAccount(id) {
        try {
            await api(`/accounts/${id}`, 'DELETE');
            showToast('账户已关闭', 'warning');
            await initCache();
            await this.refresh();
        } catch (err) {
            // api() 已显示错误 toast
        }
    },
    async openDetail(id) {
        const modal = document.getElementById('accountDetailModal');
        const body = document.getElementById('accountDetailBody');
        modal.classList.add('show');
        body.innerHTML = '<div class="empty-state">⏳ 加载中…</div>';
        const res = await api(`/accounts/${id}/transactions`);
        if (!res) { body.innerHTML = '<div class="empty-state">⚠️ 加载失败，请检查网络</div>'; return; }
        const acc = res.account || {};
        const list = res.transactions || [];
        const head = `<div class="rh-head">
            <div class="rh-debt">${escapeHtml(acc.icon || '')} ${escapeHtml(acc.name || '账户')} · 资金明细</div>
            <div class="rh-sub">共 ${list.length} 笔资金变动</div>
        </div>`;
        if (!list.length) {
            body.innerHTML = head + '<div class="empty-state">📭 该账户暂无资金变动记录</div>';
            return;
        }
        const typeMeta = {
            expense: { dir: '−', cls: 'negative', label: '支出' },
            income: { dir: '+', cls: 'positive', label: '收入' },
            transfer_out: { dir: '−', cls: 'negative', label: '转出' },
            transfer_in: { dir: '+', cls: 'positive', label: '转入' },
            repayment: { dir: '−', cls: 'negative', label: '还款' }
        };
        const rows = list.map(t => {
            const m = typeMeta[t.type] || { dir: '', cls: '', label: t.type };
            const sub = t.kind === 'repayment'
                ? (t.debt ? `还 ${escapeHtml(t.debt.name || '债务')}` : '还款')
                : (t.category ? `${escapeHtml(t.category.icon || '')} ${escapeHtml(t.category.name || '')}` : '')
                    + (t.counterparty ? ` ${t.counterparty.dir} ${escapeHtml(t.counterparty.name || '')}` : '');
            return `
            <div class="rh-item">
                <div class="rh-row1">
                    <span class="rh-amount ${m.cls}">${m.dir}${fmt(t.amount)}</span>
                    <span class="rh-date">${t.date || ''}</span>
                </div>
                <div class="rh-row2">
                    <span class="rh-tag">${m.label}${sub ? ' · ' + sub : ''}</span>
                </div>
                ${t.note ? `<div class="rh-note">📝 ${escapeHtml(t.note)}</div>` : ''}
            </div>`;
        }).join('');
        body.innerHTML = head + `<div class="rh-list">${rows}</div>`;
    },
    closeDetail() { document.getElementById('accountDetailModal').classList.remove('show'); }
};

export default AccountManager;
