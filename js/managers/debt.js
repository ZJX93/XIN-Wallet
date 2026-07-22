// ==========================================
// DebtManager — 债务管理
// 拆分自 C:\Users\XIN\WorkBuddy\XIN-Wallet\js\app.js
// 原始位置: 第 4984 行 — 第 5200 行 (const DebtManager = { ... };)
// ==========================================

const DebtManager = {
    init() {
        document.getElementById('addDebtBtn').addEventListener('click', () => this.openAddModal());
        document.getElementById('debtModalClose').addEventListener('click', () => this.closeModal());
        document.getElementById('debtCancelBtn').addEventListener('click', () => this.closeModal());
        document.getElementById('debtForm').addEventListener('submit', (e) => { e.preventDefault(); this.save(); });
        // 还款模态框
        document.getElementById('repayModalClose').addEventListener('click', () => this.closeRepayModal());
        document.getElementById('repayCancelBtn').addEventListener('click', () => this.closeRepayModal());
        document.getElementById('repayForm').addEventListener('submit', (e) => { e.preventDefault(); this.saveRepay(); });
        // 还款明细模态框
        document.getElementById('repayHistoryModalClose').addEventListener('click', () => this.closeRepayHistory());
        document.getElementById('repayHistoryModal').addEventListener('click', (e) => { if (e.target === document.getElementById('repayHistoryModal')) this.closeRepayHistory(); });
        // 类型切换 → 信用卡字段
        document.getElementById('debtType').addEventListener('change', () => this.onTypeChange());
    },

    async refresh() {
        const container = document.getElementById('debtList');
        showSkeleton(container, 4, 'grid');
        const res = await api('/debts');
        if (!res) { showEmpty(container, '加载失败，请检查网络', '⚠️'); return; }
        const s = res.summary || {};
        document.getElementById('debtTotalRemaining').textContent = fmt(s.totalRemaining || 0);
        document.getElementById('debtTotalMonthly').textContent = fmt(s.totalMonthly || 0);
        document.getElementById('debtDueThisMonth').textContent = s.dueThisMonth + ' 笔 · ' + fmt(s.dueAmount !== undefined ? s.dueAmount : (s.totalMonthly || 0));
        document.getElementById('debtOverdue').textContent = s.overdue ? (s.overdue + ' 笔 · ' + fmt(s.overdueAmount || 0)) : '0';
        document.getElementById('debtCount').textContent = `共 ${s.count || 0} 笔（${s.activeCount || 0} 笔进行中）`;
        const debts = res.debts || [];
        if (!debts.length) { showEmpty(container, '还没有债务记录，点击「添加债务」开始管理', '🏷️'); return; }
        const tLabel = { credit_card: '信用卡', loan: '贷款', personal: '借贷', other: '应付' };
        const mLabel = { equal_installment: '等额本息', equal_principal: '等额本金', interest_only: '先息后本', minimum: '最低还款', lump_sum: '一次性', manual: '手动' };
        const sLabel = { active: '进行中', paid_off: '已还清', overdue: '逾期' };
        const sCls = { active: 'debt-active', paid_off: 'debt-paid', overdue: 'debt-overdue' };
        container.innerHTML = debts.map(d => {
            const pct = d.principal > 0 ? Math.min(100, Math.round(d.paid_total / d.principal * 100)) : 0;
            const icon = d.type === 'credit_card' ? '💳' : d.type === 'loan' ? '🏦' : d.type === 'personal' ? '👤' : '📄';
            const statusTag = d.status === 'paid_off' ? '<span class="goal-status done">已还清</span>'
                : d.status === 'overdue' ? '<span class="goal-status overdue">⚠️ 逾期</span>'
                : `<span class="goal-status type">${tLabel[d.type] || d.type}</span>`;
            return `
            <div class="goal-card ${d.status === 'paid_off' ? 'completed' : ''} ${d.status === 'overdue' ? 'overdue' : ''}" data-id="${d.id}">
                <div class="goal-head">
                    <div class="goal-icon">${icon}</div>
                    <div class="goal-title">${escapeHtml(d.name)}${d.creditor ? ' <span class="goal-sub">· ' + escapeHtml(d.creditor) + '</span>' : ''}</div>
                    ${statusTag}
                </div>
                <div class="goal-amounts"><span>剩余本金 <strong>${fmt(d.remaining)}</strong></span><span>月供 ${fmt(d.monthly_payment)}${d.interest_rate ? ' · '+d.interest_rate+'%' : ''}</span></div>
                <div class="goal-progress"><div class="goal-progress-fill ${d.status === 'overdue' ? 'danger' : ''}" style="width:${pct}%"></div></div>
                <div class="goal-amounts"><span class="goal-pct">已还 ${pct}%</span><span>${mLabel[d.method] || d.method}${d.due_date ? ' · ' + d.due_date : ''}</span></div>
                <div class="goal-actions">
                    <button class="btn btn-primary" data-action="repay-debt" data-id="${d.id}">💳 还款</button>
                    <button class="btn btn-ghost" data-action="repay-history" data-id="${d.id}" title="查看还款明细">📜</button>
                    <button class="btn btn-ghost" data-action="edit-debt" data-id="${d.id}" title="编辑">✏️</button>
                    <button class="btn btn-ghost" data-action="delete-debt" data-id="${d.id}" title="删除">🗑️</button>
                </div>
            </div>`;
        }).join('');
        // 事件委托
        container.querySelectorAll('[data-action="repay-debt"]').forEach(b => b.addEventListener('click', () => this.openRepayModal(parseInt(b.dataset.id))));
        container.querySelectorAll('[data-action="repay-history"]').forEach(b => b.addEventListener('click', () => this.openRepayHistory(parseInt(b.dataset.id))));
        container.querySelectorAll('[data-action="edit-debt"]').forEach(b => { b.addEventListener('click', () => { const d = debts.find(x => x.id === parseInt(b.dataset.id)); if (d) this.openEditModal(d); }); });
        container.querySelectorAll('[data-action="delete-debt"]').forEach(b => b.addEventListener('click', () => this.delete(parseInt(b.dataset.id))));
    },

    onTypeChange() {
        const type = document.getElementById('debtType').value;
        document.querySelector('.debt-cc-fields').style.display = type === 'credit_card' ? '' : 'none';
    },

    openAddModal() {
        document.getElementById('debtModal').classList.add('show');
        document.getElementById('debtModalTitle').textContent = '添加债务';
        document.getElementById('debtEditId').value = '';
        ['debtName','debtType','debtCreditor','debtPrincipal','debtRate','debtTerm','debtMethod','debtMonthly','debtStart','debtDue','debtBillingDay','debtPaymentDay','debtMinPayment','debtNote'].forEach(id => { document.getElementById(id).value = ''; });
        document.getElementById('debtType').value = 'loan';
        document.getElementById('debtMethod').value = 'equal_installment';
        this.onTypeChange();
    },

    openEditModal(d) {
        document.getElementById('debtModal').classList.add('show');
        document.getElementById('debtModalTitle').textContent = '编辑债务';
        document.getElementById('debtEditId').value = d.id;
        document.getElementById('debtName').value = d.name || '';
        document.getElementById('debtType').value = d.type || 'loan';
        document.getElementById('debtCreditor').value = d.creditor || '';
        document.getElementById('debtPrincipal').value = d.principal || '';
        document.getElementById('debtRate').value = d.interest_rate || '';
        document.getElementById('debtTerm').value = d.term_months || '';
        document.getElementById('debtMethod').value = d.method || 'equal_installment';
        document.getElementById('debtMonthly').value = d.monthly_payment || '';
        document.getElementById('debtStart').value = d.start_date || '';
        document.getElementById('debtDue').value = d.due_date || '';
        document.getElementById('debtBillingDay').value = d.billing_day || '';
        document.getElementById('debtPaymentDay').value = d.payment_day || '';
        document.getElementById('debtMinPayment').value = d.min_payment || '';
        document.getElementById('debtNote').value = d.note || '';
        this.onTypeChange();
    },

    closeModal() { document.getElementById('debtModal').classList.remove('show'); },

    async save() {
        const editId = document.getElementById('debtEditId').value;
        const payload = {
            name: document.getElementById('debtName').value.trim(),
            type: document.getElementById('debtType').value,
            creditor: document.getElementById('debtCreditor').value.trim(),
            principal: parseFloat(document.getElementById('debtPrincipal').value) || 0,
            interest_rate: parseFloat(document.getElementById('debtRate').value) || 0,
            term_months: parseInt(document.getElementById('debtTerm').value) || 0,
            method: document.getElementById('debtMethod').value,
            monthly_payment: parseFloat(document.getElementById('debtMonthly').value) || 0,
            start_date: document.getElementById('debtStart').value || null,
            due_date: document.getElementById('debtDue').value || null,
            billing_day: parseInt(document.getElementById('debtBillingDay').value) || null,
            payment_day: parseInt(document.getElementById('debtPaymentDay').value) || null,
            min_payment: parseFloat(document.getElementById('debtMinPayment').value) || 0,
            note: document.getElementById('debtNote').value.trim()
        };
        if (!payload.name) { showToast('请输入债务名称', 'error'); return; }
        if (payload.principal <= 0) { showToast('请输入有效本金', 'error'); return; }
        if (editId) {
            await api(`/debts/${editId}`, 'PUT', payload);
            showToast('债务已更新', 'success');
        } else {
            await api('/debts', 'POST', payload);
            showToast('债务已添加', 'success');
        }
        this.closeModal();
        await this.refresh();
    },

    async delete(id) {
        if (!confirm('确定删除该债务及其全部还款记录吗？')) return;
        try {
            await api(`/debts/${id}`, 'DELETE');
            showToast('债务已删除');
            await this.refresh();
        } catch (err) {
            showToast('删除失败: ' + (err.message || '未知错误'), 'error');
        }
    },

    openRepayModal(id) {
        document.getElementById('repayModal').classList.add('show');
        document.getElementById('repayDebtId').value = id;
        ['repayAmount','repayPrincipal','repayInterest','repayNote'].forEach(id => { document.getElementById(id).value = ''; });
        document.getElementById('repayDate').value = new Date().toISOString().slice(0, 10);
        // 每次打开都重新填充账户下拉（cache.accounts 可能已更新）
        const sel = document.getElementById('repayAccount');
        sel.innerHTML = '<option value="">-- 请选择还款账户（支出账户）* --</option>';
        (cache.accounts || []).forEach(a => { sel.innerHTML += `<option value="${a.id}">${a.icon || ''} ${escapeHtml(a.name)}</option>`; });
        sel.value = '';
    },

    closeRepayModal() { document.getElementById('repayModal').classList.remove('show'); },

    async saveRepay() {
        try {
        const debtId = document.getElementById('repayDebtId').value;
        const amount = parseFloat(document.getElementById('repayAmount').value) || 0;
        if (amount <= 0) { showToast('请输入有效还款金额', 'error'); return; }
        const ppVal = document.getElementById('repayPrincipal').value;
        const ipVal = document.getElementById('repayInterest').value;
        const accId = document.getElementById('repayAccount').value;
        if (!accId) { showToast('请选择还款账户（支出账户）', 'error'); return; }
        const payload = {
            amount,
            paid_at: document.getElementById('repayDate').value,
            note: document.getElementById('repayNote').value.trim(),
            account_id: accId,
            principal_part: ppVal !== '' ? parseFloat(ppVal) : undefined,
            interest_part: ipVal !== '' ? parseFloat(ipVal) : undefined
        };
        await api(`/debts/${debtId}/repayments`, 'POST', payload);
        showToast('还款已记录', 'success');
        this.closeRepayModal();
        await this.refresh();
        } catch (e) { showToast('还款失败：' + (e.message || '网络错误'), 'error'); }
    },

    async openRepayHistory(id) {
        const modal = document.getElementById('repayHistoryModal');
        const body = document.getElementById('repayHistoryBody');
        modal.classList.add('show');
        body.innerHTML = '<div class="empty-state">⏳ 加载中…</div>';
        const res = await api(`/debts/${id}`);
        if (!res) { body.innerHTML = '<div class="empty-state">⚠️ 加载失败，请检查网络</div>'; return; }
        const d = res.debt || {};
        const list = res.repayments || [];
        const head = `<div class="rh-head">
            <div class="rh-debt">${escapeHtml(d.icon || '🏷️')} ${escapeHtml(d.name || '债务')}</div>
            <div class="rh-sub">剩余本金 ${fmt(d.remaining || 0)} · 累计已还 ${fmt(d.paid_total || 0)} · 共 ${list.length} 笔还款</div>
        </div>`;
        if (!list.length) {
            body.innerHTML = head + '<div class="empty-state">📭 暂无还款记录</div>';
            return;
        }
        const rows = list.map(r => `
            <div class="rh-item">
                <div class="rh-row1">
                    <span class="rh-amount">${fmt(r.amount)}</span>
                    <span class="rh-date">${r.paid_at || ''}</span>
                </div>
                <div class="rh-row2">
                    <span class="rh-tag">本金 ${fmt(r.principal_part)} / 利息 ${fmt(r.interest_part)}</span>
                    ${r.account_name ? `<span class="rh-acc">${escapeHtml(r.account_icon || '')} ${escapeHtml(r.account_name)}</span>` : ''}
                </div>
                ${r.note ? `<div class="rh-note">📝 ${escapeHtml(r.note)}</div>` : ''}
            </div>`).join('');
        body.innerHTML = head + `<div class="rh-list">${rows}</div>`;
    },

    closeRepayHistory() { document.getElementById('repayHistoryModal').classList.remove('show'); }
};

export default DebtManager;
