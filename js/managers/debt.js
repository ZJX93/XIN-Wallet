// ==========================================
// DebtManager — 债务管理（应付 + 应收双向）
// ==========================================

const DebtManager = {
    _currentDir: 'payable', // 当前模态框选中的方向：payable=应付(我欠) / receivable=应收(借出)
    _filter: 'all',          // 列表筛选：all / payable / receivable

    init() {
        document.getElementById('addDebtBtn').addEventListener('click', () => this.openAddModal());
        document.getElementById('debtModalClose').addEventListener('click', () => this.closeModal());
        document.getElementById('debtCancelBtn').addEventListener('click', () => this.closeModal());
        document.getElementById('debtForm').addEventListener('submit', (e) => { e.preventDefault(); this.save(); });
        // 方向切换（顶部 Tab 切换）
        document.querySelectorAll('[data-debt-dir]').forEach(el => {
            el.addEventListener('click', () => { this._filter = el.dataset.debtDir; this.refresh(); });
        });
        // 模态框内的方向切换
        document.querySelectorAll('[data-form-dir]').forEach(el => {
            el.addEventListener('click', () => { this._currentDir = el.dataset.formDir; this.onDirChange(); });
        });
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
        // 顶部 Tab 高亮
        document.querySelectorAll('[data-debt-dir]').forEach(el => {
            el.classList.toggle('active', el.dataset.debtDir === this._filter);
        });
        // 顶部 summary 卡片（4 个）
        const pEl = document.getElementById('debtPayablePanel');
        const rEl = document.getElementById('debtReceivablePanel');
        if (pEl) pEl.innerHTML = this._renderPayablePanel(s.payable || {});
        if (rEl) rEl.innerHTML = this._renderReceivablePanel(s.receivable || {});
        // 兼容旧字段（顶部剩余总额等）
        const totalEl = document.getElementById('debtTotalRemaining');
        const monthlyEl = document.getElementById('debtTotalMonthly');
        const dueEl = document.getElementById('debtDueThisMonth');
        const overdueEl = document.getElementById('debtOverdue');
        const countEl = document.getElementById('debtCount');
        if (totalEl) totalEl.textContent = fmt(s.netDebt !== undefined ? s.netDebt : (s.totalRemaining || 0));
        if (monthlyEl) monthlyEl.textContent = fmt((s.payable && s.payable.monthly) || s.totalMonthly || 0);
        if (dueEl) dueEl.textContent = (s.payable ? s.payable.dueThisMonth : s.dueThisMonth || 0) + ' 笔 · ' + fmt((s.payable ? s.payable.dueAmount : s.dueAmount) || 0);
        if (overdueEl) overdueEl.textContent = (s.payable ? s.payable.overdue : s.overdue || 0) ? ((s.payable ? s.payable.overdue : s.overdue) + ' 笔 · ' + fmt((s.payable ? s.payable.overdueAmount : s.overdueAmount) || 0)) : '0';
        if (countEl) countEl.textContent = `共 ${s.count || 0} 笔（${s.activeCount || 0} 笔进行中）`;

        // 列表（按当前 _filter 过滤）
        const debts = (res.debts || []).filter(d => this._filter === 'all' || d.direction === this._filter);
        if (!debts.length) {
            const msg = this._filter === 'receivable' ? '还没有借出记录，点击「添加借出」开始管理' : this._filter === 'payable' ? '还没有应付债务记录' : '还没有债务记录，点击「添加」开始管理';
            showEmpty(container, msg, this._filter === 'receivable' ? '📥' : '💳');
            return;
        }
        const tLabel = { credit_card: '信用卡', loan: '贷款', personal: '借贷', other: '其他' };
        const mLabel = { equal_installment: '等额本息', equal_principal: '等额本金', interest_only: '先息后本', minimum: '最低还款', lump_sum: '一次性', manual: '手动' };
        const sLabel = { active: '进行中', paid_off: '已还清', overdue: '逾期' };
        container.innerHTML = debts.map(d => {
            const pct = d.principal > 0 ? Math.min(100, Math.round(d.paid_total / d.principal * 100)) : 0;
            const icon = d.type === 'credit_card' ? '💳' : d.type === 'loan' ? '🏦' : d.type === 'personal' ? '👤' : '📄';
            const isRecv = d.direction === 'receivable';
            const dirBadge = isRecv ? '<span class="debt-dir-badge recv">📥 借出</span>' : '<span class="debt-dir-badge pay">💳 应付</span>';
            const actionBtn = isRecv
                ? `<button class="btn btn-primary" data-action="repay-debt" data-id="${d.id}">💰 收款</button>`
                : `<button class="btn btn-primary" data-action="repay-debt" data-id="${d.id}">💳 还款</button>`;
            const statusTag = d.status === 'paid_off'
                ? `<span class="goal-status done">${isRecv ? '已收回' : '已还清'}</span>`
                : d.status === 'overdue' ? '<span class="goal-status overdue">⚠️ 逾期</span>'
                : `<span class="goal-status type">${tLabel[d.type] || d.type}</span>`;
            return `
            <div class="goal-card ${d.status === 'paid_off' ? 'completed' : ''} ${d.status === 'overdue' ? 'overdue' : ''} ${isRecv ? 'debt-receivable' : 'debt-payable'}" data-id="${d.id}">
                <div class="goal-head">
                    <div class="goal-icon">${icon}</div>
                    <div class="goal-title">${escapeHtml(d.name)}${d.creditor ? ' <span class="goal-sub">· ' + escapeHtml(d.creditor) + '</span>' : ''}</div>
                    ${dirBadge}
                    ${statusTag}
                </div>
                <div class="goal-amounts"><span>${isRecv ? '应收' : '剩余本金'} <strong>${fmt(d.remaining)}</strong></span><span>${isRecv ? '预期月收' : '月供'} ${fmt(d.monthly_payment)}${d.interest_rate ? ' · ' + d.interest_rate + '%' : ''}</span></div>
                <div class="goal-progress"><div class="goal-progress-fill ${d.status === 'overdue' ? 'danger' : (isRecv ? 'recv' : '')}" style="width:${pct}%"></div></div>
                <div class="goal-amounts"><span class="goal-pct">${isRecv ? '已收回' : '已还'} ${pct}%</span><span>${mLabel[d.method] || d.method}${d.due_date ? ' · ' + d.due_date : ''}</span></div>
                <div class="goal-actions">
                    ${actionBtn}
                    <button class="btn btn-ghost" data-action="repay-history" data-id="${d.id}" title="查看明细">📜</button>
                    <button class="btn btn-ghost" data-action="edit-debt" data-id="${d.id}" title="编辑">✏️</button>
                    <button class="btn btn-ghost" data-action="delete-debt" data-id="${d.id}" title="删除">🗑️</button>
                </div>
            </div>`;
        }).join('');
        container.querySelectorAll('[data-action="repay-debt"]').forEach(b => b.addEventListener('click', () => this.openRepayModal(parseInt(b.dataset.id))));
        container.querySelectorAll('[data-action="repay-history"]').forEach(b => b.addEventListener('click', () => this.openRepayHistory(parseInt(b.dataset.id))));
        container.querySelectorAll('[data-action="edit-debt"]').forEach(b => { b.addEventListener('click', () => { const d = debts.find(x => x.id === parseInt(b.dataset.id)); if (d) this.openEditModal(d); }); });
        container.querySelectorAll('[data-action="delete-debt"]').forEach(b => b.addEventListener('click', () => this.delete(parseInt(b.dataset.id))));
    },

    _renderPayablePanel(p) {
        return `
            <div class="dsp-title">💳 我欠别人（应付）</div>
            <div class="dsp-row"><span>未还本金</span><strong>${fmt(p.remaining || 0)}</strong></div>
            <div class="dsp-row"><span>月供合计</span><strong>${fmt(p.monthly || 0)}</strong></div>
            <div class="dsp-row warn"><span>本月待还</span><strong>${p.dueThisMonth || 0} 笔 · ${fmt(p.dueAmount || 0)}</strong></div>
            <div class="dsp-row ${(p.overdue || 0) > 0 ? 'danger' : ''}"><span>逾期</span><strong>${p.overdue || 0} 笔 · ${fmt(p.overdueAmount || 0)}</strong></div>
            <div class="dsp-foot">共 ${p.count || 0} 笔（${p.activeCount || 0} 笔进行中）</div>
        `;
    },
    _renderReceivablePanel(r) {
        return `
            <div class="dsp-title">📥 别人欠我（应收）</div>
            <div class="dsp-row"><span>待收本金</span><strong>${fmt(r.remaining || 0)}</strong></div>
            <div class="dsp-row"><span>预期月收</span><strong>${fmt(r.expectedMonthly || 0)}</strong></div>
            <div class="dsp-row ${(r.overdue || 0) > 0 ? 'danger' : ''}"><span>逾期未收</span><strong>${r.overdue || 0} 笔 · ${fmt(r.overdueAmount || 0)}</strong></div>
            <div class="dsp-foot">共 ${r.count || 0} 笔（${r.activeCount || 0} 笔进行中）</div>
        `;
    },

    onTypeChange() {
        const type = document.getElementById('debtType').value;
        const ccBlock = document.querySelector('.debt-cc-fields');
        if (ccBlock) ccBlock.style.display = type === 'credit_card' ? '' : 'none';
    },

    onDirChange() {
        // 切换模态框内方向 → 改 title / 改 creditor 标签 / 改按钮文案 / 改 account 标签
        const isRecv = this._currentDir === 'receivable';
        const title = document.getElementById('debtModalTitle');
        if (title) title.textContent = (document.getElementById('debtEditId').value ? '编辑' : '添加') + (isRecv ? '借出' : '债务');
        const counterpartyLabel = document.querySelector('[data-counterparty-label]');
        if (counterpartyLabel) counterpartyLabel.textContent = isRecv ? '借款人' : '债权人';
        const accLabel = document.querySelector('[data-account-label]');
        if (accLabel) accLabel.textContent = isRecv ? '收款账户' : '还款账户（支出）';
        // Tab 切换高亮
        document.querySelectorAll('[data-form-dir]').forEach(el => {
            el.classList.toggle('active', el.dataset.formDir === this._currentDir);
        });
        // 同步方向到隐藏字段（HTML 里加 data-form-dir 的元素自带语义，这里用 btn group）
        const hidden = document.getElementById('debtDirection');
        if (hidden) hidden.value = this._currentDir;
    },

    openAddModal() {
        document.getElementById('debtModal').classList.add('show');
        document.getElementById('debtEditId').value = '';
        ['debtName','debtType','debtCreditor','debtPrincipal','debtRate','debtTerm','debtMethod','debtMonthly','debtStart','debtDue','debtBillingDay','debtPaymentDay','debtMinPayment','debtNote'].forEach(id => { document.getElementById(id).value = ''; });
        document.getElementById('debtType').value = 'loan';
        document.getElementById('debtMethod').value = 'manual';
        // 默认沿用当前列表的筛选方向，让用户开模态时一目了然
        this._currentDir = this._filter === 'receivable' ? 'receivable' : 'payable';
        this.onDirChange();
        this.onTypeChange();
    },

    openEditModal(d) {
        document.getElementById('debtModal').classList.add('show');
        document.getElementById('debtModalTitle').textContent = '编辑' + (d.direction === 'receivable' ? '借出' : '债务');
        document.getElementById('debtEditId').value = d.id;
        document.getElementById('debtName').value = d.name || '';
        document.getElementById('debtType').value = d.type || 'loan';
        document.getElementById('debtCreditor').value = d.creditor || '';
        document.getElementById('debtPrincipal').value = d.principal || '';
        document.getElementById('debtRate').value = d.interest_rate || '';
        document.getElementById('debtTerm').value = d.term_months || '';
        document.getElementById('debtMethod').value = d.method || 'manual';
        document.getElementById('debtMonthly').value = d.monthly_payment || '';
        document.getElementById('debtStart').value = d.start_date || '';
        document.getElementById('debtDue').value = d.due_date || '';
        document.getElementById('debtBillingDay').value = d.billing_day || '';
        document.getElementById('debtPaymentDay').value = d.payment_day || '';
        document.getElementById('debtMinPayment').value = d.min_payment || '';
        document.getElementById('debtNote').value = d.note || '';
        this._currentDir = d.direction || 'payable';
        this.onDirChange();
        this.onTypeChange();
    },

    closeModal() { document.getElementById('debtModal').classList.remove('show'); },

    async save() {
        const editId = document.getElementById('debtEditId').value;
        const payload = {
            direction: this._currentDir,
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
        if (!payload.name) { showToast('请输入名称', 'error'); return; }
        if (payload.principal <= 0) { showToast('请输入有效本金', 'error'); return; }
        if (editId) {
            await api(`/debts/${editId}`, 'PUT', payload);
            showToast('已更新', 'success');
        } else {
            await api('/debts', 'POST', payload);
            showToast(payload.direction === 'receivable' ? '借出已记录' : '债务已添加', 'success');
        }
        this.closeModal();
        await this.refresh();
    },

    async delete(id) {
        if (!confirm('确定删除该条记录及其全部明细吗？')) return;
        try {
            await api(`/debts/${id}`, 'DELETE');
            showToast('已删除');
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
        // 查找到对应债务，按方向切换按钮文案
        const debt = (cache._debtListCache || []).find(d => d.id === id) || null;
        const isRecv = debt && debt.direction === 'receivable';
        const titleEl = document.getElementById('repayModalTitle');
        if (titleEl) titleEl.textContent = isRecv ? '💰 记录收款' : '💳 记录还款';
        const submitBtn = document.getElementById('repaySubmitBtn');
        if (submitBtn) submitBtn.textContent = isRecv ? '确认收款' : '确认还款';
        const accLabel = document.querySelector('[data-repay-account-label]');
        if (accLabel) accLabel.textContent = isRecv ? '收款账户（入账）*' : '还款账户（支出）*';
        // 每次打开都重新填充账户下拉
        const sel = document.getElementById('repayAccount');
        sel.innerHTML = '<option value="">-- 请选择账户 * --</option>';
        (cache.accounts || []).forEach(a => { sel.innerHTML += `<option value="${a.id}">${escapeHtml(a.icon || "")} ${escapeHtml(a.name)}</option>`; });
        sel.value = '';
    },

    closeRepayModal() { document.getElementById('repayModal').classList.remove('show'); },

    async saveRepay() {
        try {
        const debtId = document.getElementById('repayDebtId').value;
        const amount = parseFloat(document.getElementById('repayAmount').value) || 0;
        if (amount <= 0) { showToast('请输入有效金额', 'error'); return; }
        const ppVal = document.getElementById('repayPrincipal').value;
        const ipVal = document.getElementById('repayInterest').value;
        const accId = document.getElementById('repayAccount').value;
        if (!accId) { showToast('请选择账户', 'error'); return; }
        const payload = {
            amount,
            paid_at: document.getElementById('repayDate').value,
            note: document.getElementById('repayNote').value.trim(),
            account_id: accId,
            principal_part: ppVal !== '' ? parseFloat(ppVal) : undefined,
            interest_part: ipVal !== '' ? parseFloat(ipVal) : undefined
        };
        const debt = (cache._debtListCache || []).find(d => d.id === parseInt(debtId));
        const isRecv = debt && debt.direction === 'receivable';
        await api(`/debts/${debtId}/repayments`, 'POST', payload);
        showToast(isRecv ? '收款已记录' : '还款已记录', 'success');
        this.closeRepayModal();
        await this.refresh();
        } catch (e) { showToast('失败：' + (e.message || '网络错误'), 'error'); }
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
        const isRecv = d.direction === 'receivable';
        const head = `<div class="rh-head">
            <div class="rh-debt">${isRecv ? '📥' : '🏷️'} ${escapeHtml(d.name || '')} · ${isRecv ? '借出' : '应付'}</div>
            <div class="rh-sub">${isRecv ? '待收' : '剩余'}本金 ${fmt(d.remaining || 0)} · 累计${isRecv ? '已收' : '已还'} ${fmt(d.paid_total || 0)} · 共 ${list.length} 笔</div>
        </div>`;
        if (!list.length) {
            body.innerHTML = head + `<div class="empty-state">📭 暂无${isRecv ? '收款' : '还款'}记录</div>`;
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
