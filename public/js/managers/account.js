// ============================================================
// AccountManager —— 账户管理模块
// ------------------------------------------------------------
// 拆分来源：public/js/app.js
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
        document.getElementById('accType').addEventListener('change', () => this.toggleCreditLimit());
        document.getElementById('reconcileBtn').addEventListener('click', () => this.reconcile());
        // 账户资金明细模态框
        document.getElementById('accountDetailModalClose').addEventListener('click', () => this.closeDetail());
        document.getElementById('accountDetailModal').addEventListener('click', (e) => { if (e.target === document.getElementById('accountDetailModal')) this.closeDetail(); });
        // 记利息模态框
        document.getElementById('interestModalClose').addEventListener('click', () => this.closeInterestModal());
        document.getElementById('interestCancelBtn').addEventListener('click', () => this.closeInterestModal());
        document.getElementById('interestModal').addEventListener('click', (e) => { if (e.target === document.getElementById('interestModal')) this.closeInterestModal(); });
        document.getElementById('interestForm').addEventListener('submit', (e) => { e.preventDefault(); this.saveInterest(); });
        // 账户删除确认模态框
        document.getElementById('accDelModalClose').addEventListener('click', () => this.closeDeleteModal());
        document.getElementById('accDelCancelBtn').addEventListener('click', () => this.closeDeleteModal());
        document.getElementById('accountDeleteModal').addEventListener('click', (e) => { if (e.target === document.getElementById('accountDeleteModal')) this.closeDeleteModal(); });
        document.getElementById('accDelCloseBtn').addEventListener('click', () => this.closeAccount());
        document.getElementById('accDelHardBtn').addEventListener('click', () => this.hardDeleteAccount());
        // 账户全屏网格
        const accGridClose = document.getElementById('accGridClose');
        if (accGridClose) accGridClose.addEventListener('click', () => this.closeAccGrid());
        const accGridOverlay = document.getElementById('accGridOverlay');
        if (accGridOverlay) accGridOverlay.addEventListener('click', (e) => { if (e.target === accGridOverlay) this.closeAccGrid(); });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { this.closeAccGrid(); this.closeDetail(); this.closeDeleteModal(); this.closeModal(); this.closeInterestModal(); } });
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
        const typeLabels = { cash: '现金', bank_card: '储蓄卡', credit_card: '信用卡', electronic_payment: '电子支付', financial_account: '金融账户', digital: '数字货币', other: '其他' };
        this.typeLabels = typeLabels;
        if (!data.accounts || data.accounts.length === 0) { showEmpty(container, '还没有账户，点击「新增账户」开始记录你的资产', '🏦'); return; }

        // 按类型分组（按语义顺序排），同类型叠成一叠牌，点击封面展开/收起
        const typeOrder = ['cash', 'bank_card', 'credit_card', 'electronic_payment', 'financial_account', 'digital', 'other'];
        const groups = {};
        data.accounts.forEach(a => {
            const key = a.type || 'other';
            (groups[key] = groups[key] || []).push(a);
        });
        const groupList = Object.entries(groups)
            .sort((a, b) => typeOrder.indexOf(a[0]) - typeOrder.indexOf(b[0]));

        const buildCard = (a, idx, n) => `
            <div class="account-card acc-stack-card" data-id="${a.id}" style="--i:${idx}; --n:${n}">
                <div class="account-icon">${escapeHtml(a.icon)}</div>
                <div class="account-content">
                    <div class="account-row">
                        <div class="account-name" title="${escapeHtml(a.name)}">${escapeHtml(a.name)}</div>
                    </div>
                    <div class="account-row">
                        <div class="account-type">${typeLabels[a.type] || a.type}</div>
                        <div class="account-balance">${fmt(a.balance)}</div>
                    </div>
                    <div class="account-row account-actions-row">
                        <div class="account-actions">
                            <button class="btn btn-ghost btn-sm" data-action="acc-detail" data-id="${a.id}" title="资金明细">📊</button>
                            <button class="btn btn-ghost btn-sm" data-action="interest-acc" data-id="${a.id}" title="记利息">💰</button>
                            <button class="btn btn-ghost btn-sm" data-action="edit-acc" data-id="${a.id}" title="编辑">✏️</button>
                            <button class="btn btn-ghost btn-sm" data-action="delete-acc" data-id="${a.id}" title="删除">🗑️</button>
                        </div>
                    </div>
                </div>
            </div>`;

        container.innerHTML = groupList.map(([type, accounts]) => {
            const label = typeLabels[type] || type;
            const total = accounts.reduce((s, a) => s + (Number(a.balance) || 0), 0);
            const icon = accounts[0].icon || '🏦';
            // 封面卡作为牌堆第一张（--i:0，:first-child 在文档流内撑高度），与产品卡一起堆叠偏移，形态同理财封面
            const coverCard = `
                <div class="goal-card acc-stack-card acc-deck-card" data-type="${escapeHtml(type)}" style="--i:0; --n:${accounts.length + 1}">
                    <div class="inv-cover-top">
                        <div class="goal-head">
                            <div class="goal-icon">${escapeHtml(icon)}</div>
                            <div class="goal-title">${escapeHtml(label)}</div>
                            <span class="inv-cover-count">${accounts.length} 个账户</span>
                        </div>
                    </div>
                    <div class="inv-cover-mid">
                        <div class="inv-cover-profit">
                            <div class="inv-cover-profit-label">账户总资产</div>
                            <div class="inv-cover-profit-amount">${fmt(total)}</div>
                        </div>
                    </div>
                    <div class="inv-cover-bottom">
                        <div class="inv-cover-foot"><span class="inv-cover-viewall">查看全部 →</span></div>
                    </div>
                </div>`;
            const cards = accounts.map((a, idx) => buildCard(a, idx + 1, accounts.length + 1)).join('');
            return `
            <div class="acc-stack">
                <div class="acc-stack-cards" style="--n:${accounts.length + 1}">${coverCard}${cards}</div>
            </div>`;
        }).join('');

        // 事件委托：封面卡（牌堆第一张）→ 全屏网格铺开（仅当前类别）
        container.querySelectorAll('.acc-deck-card').forEach(card => {
            card.addEventListener('click', () => this.openAccGrid(card.dataset.type));
        });

        // 事件委托：点击单张账户卡 → 弹出（置顶+上浮，露出操作按钮）；再点收起。点在操作按钮上交给按钮处理
        container.querySelectorAll('.acc-stack-card:not(.acc-deck-card)').forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.closest('[data-action]')) return;
                const wasPopped = card.classList.contains('popped');
                container.querySelectorAll('.acc-stack-card.popped').forEach(c => c.classList.remove('popped'));
                if (!wasPopped) card.classList.add('popped');
            });
        });

        // 事件委托：明细、编辑和删除按钮
        container.querySelectorAll('[data-action="acc-detail"]').forEach(btn => {
            btn.addEventListener('click', () => this.openDetail(parseInt(btn.dataset.id)));
        });
        container.querySelectorAll('[data-action="edit-acc"]').forEach(btn => {
            btn.addEventListener('click', () => this.openModal(parseInt(btn.dataset.id)));
        });
        container.querySelectorAll('[data-action="delete-acc"]').forEach(btn => {
            btn.addEventListener('click', () => this.openDeleteModal(parseInt(btn.dataset.id)));
        });
        container.querySelectorAll('[data-action="interest-acc"]').forEach(btn => {
            btn.addEventListener('click', () => this.openInterestModal(parseInt(btn.dataset.id)));
        });
    },
    toggleCreditLimit() {
        const type = document.getElementById('accType').value;
        const row = document.getElementById('accCreditLimitRow');
        const input = document.getElementById('accCreditLimit');
        const label = document.getElementById('accCreditLimitLabel');
        if (type === 'credit_card' || type === 'electronic_payment') {
            row.style.display = '';
            input.min = '0';
            if (type === 'credit_card') {
                label.childNodes[0].textContent = '信用额度 (¥) * ';
                input.required = true;
            } else {
                label.childNodes[0].textContent = '信用额度 (¥) ';
                input.required = false;
            }
        } else {
            row.style.display = 'none';
            input.required = false;
            input.value = '0';
        }
    },
    async openModal(id = null) {
        document.getElementById('accountModal').classList.add('show');
        if (id) {
            const a = getAcc(id);
            document.getElementById('accEditId').value = a.id;
            document.getElementById('accName').value = a.name;
            document.getElementById('accType').value = a.type;
            document.getElementById('accIcon').value = a.icon;
            // 初始余额可改，实时余额只读展示
            document.getElementById('accBalance').value = a.opening_balance ?? a.balance ?? 0;
            document.getElementById('accRealBalance').value = a.balance ?? 0;
            document.getElementById('accCreditLimit').value = a.credit_limit ?? 0;
            document.getElementById('accAnnualRate').value = a.annual_rate ?? 0;
            document.getElementById('accInterestCycle').value = a.interest_cycle || 'monthly';
            document.getElementById('accModalTitle').textContent = '编辑账户';
        } else {
            document.getElementById('accEditId').value = '';
            document.getElementById('accName').value = '';
            document.getElementById('accType').value = 'bank_card';
            document.getElementById('accIcon').value = '💰';
            document.getElementById('accBalance').value = 0;
            document.getElementById('accRealBalance').value = 0;
            document.getElementById('accCreditLimit').value = 0;
            document.getElementById('accAnnualRate').value = 0;
            document.getElementById('accInterestCycle').value = 'monthly';
            document.getElementById('accModalTitle').textContent = '新增账户';
        }
        this.toggleCreditLimit();
    },
    closeModal() { document.getElementById('accountModal').classList.remove('show'); },
    async save() {
        const id = document.getElementById('accEditId').value;
        const type = document.getElementById('accType').value;
        const limitVal = document.getElementById('accCreditLimit').value;
        const limit = limitVal === '' ? 0 : parseFloat(limitVal);
        if (type === 'credit_card' && (isNaN(limit) || limit <= 0)) {
            showToast('信用卡必须设置大于 0 的信用额度', 'warning');
            return;
        }
        const body = {
            name: document.getElementById('accName').value,
            type: type,
            icon: document.getElementById('accIcon').value,
            // 用户编辑的是「初始余额」，实时余额由服务端按流水重算
            opening_balance: parseFloat(document.getElementById('accBalance').value),
            credit_limit: limit,
            annual_rate: parseFloat(document.getElementById('accAnnualRate').value) || 0,
            interest_cycle: document.getElementById('accInterestCycle').value || 'monthly'
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
    // 删除确认弹窗：先查关联数据，决定「彻底删除」是否可用
    async openDeleteModal(id) {
        const acc = getAcc(id);
        if (!acc) return;
        this._delId = id;
        document.getElementById('accDelName').textContent = `${acc.icon || ''} ${acc.name}（余额 ${fmt(acc.balance)}）`;
        const usageEl = document.getElementById('accDelUsage');
        const hardBtn = document.getElementById('accDelHardBtn');
        usageEl.textContent = '正在检查关联数据…';
        hardBtn.disabled = true;
        document.getElementById('accountDeleteModal').classList.add('show');
        const res = await api(`/accounts/${id}/usage`);
        if (!res) { this.closeDeleteModal(); return; }
        const u = res.usage || {};
        const parts = [
            ['交易', u.transactions], ['转账', u.transfers], ['还款', u.repayments],
            ['储蓄目标', u.goals], ['储蓄流水', u.savings_txns], ['债务', u.debts], ['理财持仓', u.investments]
        ].filter(([, n]) => parseInt(n) > 0);
        if (parts.length === 0) {
            usageEl.innerHTML = '<span class="acc-del-ok">无关联数据，可彻底删除。</span>';
            hardBtn.disabled = false;
            hardBtn.title = '';
        } else {
            const detail = parts.map(([label, n]) => `${label} ${n} 笔`).join('、');
            usageEl.innerHTML = `<span class="acc-del-warn">存在关联数据（${detail}），不可彻底删除。</span>`;
            hardBtn.disabled = true;
            hardBtn.title = '该账户有关联数据，请先清理或使用「关闭账户」';
        }
    },
    closeDeleteModal() {
        document.getElementById('accountDeleteModal').classList.remove('show');
        this._delId = null;
    },
    async hardDeleteAccount() {
        const id = this._delId;
        if (!id) return;
        await api(`/accounts/${id}`, 'DELETE'); // 失败会抛错，api() 已显示错误 toast（含 409 关联数据提示）
        showToast('账户已彻底删除', 'success');
        // 旧 AI 洞察/建议缓存可能仍引用该账户余额，立即失效
        try { localStorage.removeItem('xin_ai_insights'); localStorage.removeItem('xin_ai_advice'); } catch (e) {}
        this.closeDeleteModal();
        await initCache();
        await this.refresh();
    },
    async closeAccount() {
        const id = this._delId;
        if (!id) return;
        await api(`/accounts/${id}/close`, 'POST'); // 失败会抛错
        showToast('账户已关闭（历史保留）', 'warning');
        try { localStorage.removeItem('xin_ai_insights'); localStorage.removeItem('xin_ai_advice'); } catch (e) {}
        this.closeDeleteModal();
        await initCache();
        await this.refresh();
    },
    async openDetail(id) {
        const modal = document.getElementById('accountDetailModal');
        const body = document.getElementById('accountDetailBody');
        const acc0 = getAcc(id);
        const isClosed = !!(acc0 && acc0.closed);
        modal.classList.add('show');
        body.innerHTML = '<div class="empty-state">⏳ 加载中…</div>';
        const res = await api(`/accounts/${id}/transactions`);
        if (!res) { body.innerHTML = '<div class="empty-state">⚠️ 加载失败，请检查网络</div>'; return; }
        const acc = res.account || {};
        const list = res.transactions || [];
        const subBits = [`共 ${list.length} 笔资金变动`];
        if (acc.last_interest_date) subBits.push(`上次计息 <strong>${escapeHtml(acc.last_interest_date)}</strong>`);
        if (Number(acc.annual_rate) > 0) subBits.push(`年利率 <strong>${(Number(acc.annual_rate) || 0).toFixed(4)}%</strong>`);
        const head = `<div class="rh-head">
            <div class="rh-debt">${escapeHtml(acc.icon || '')} ${escapeHtml(acc.name || '账户')} · 资金明细</div>
            <div class="rh-sub">${subBits.join(' · ')}</div>
            ${isClosed ? '' : `<div style="margin-top:10px"><button class="btn btn-ghost btn-sm" id="detailInterestBtn" data-id="${id}">💰 记利息</button></div>`}
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
        // 详情页「记利息」按钮：点击复用计息弹窗（点叉或按 ESC 仍由账户模态统一关闭）
        const ib = document.getElementById('detailInterestBtn');
        if (ib) ib.addEventListener('click', () => { const aid = parseInt(ib.dataset.id); if (!isNaN(aid)) this.openInterestModal(aid); });
    },
    closeDetail() { document.getElementById('accountDetailModal').classList.remove('show'); },

    /* ---- 记一笔利息（与安卓端 AccountDetailScreen.AddInterestDialog 对齐） ---- */
    openInterestModal(id) {
        const a = getAcc(id);
        if (!a) return;
        this._interestAccId = id;
        const today = new Date().toISOString().slice(0, 10);
        document.getElementById('interestModalTitle').textContent = `记利息 · ${a.icon || ''} ${a.name}`;
        document.getElementById('interestAmount').value = '';
        document.getElementById('interestDate').value = today;
        document.getElementById('interestNote').value = '';
        document.getElementById('interestError').style.display = 'none';
        document.getElementById('interestSubmitBtn').disabled = false;
        document.getElementById('interestSubmitBtn').textContent = '确认';
        document.getElementById('interestModal').classList.add('show');
        setTimeout(() => document.getElementById('interestAmount').focus(), 50);
    },
    closeInterestModal() {
        document.getElementById('interestModal').classList.remove('show');
        this._interestAccId = null;
    },
    async saveInterest() {
        const id = this._interestAccId;
        if (!id) return;
        const amt = parseFloat(document.getElementById('interestAmount').value);
        const date = document.getElementById('interestDate').value;
        const note = (document.getElementById('interestNote').value || '').trim();
        const errEl = document.getElementById('interestError');
        const btn = document.getElementById('interestSubmitBtn');
        if (isNaN(amt) || amt <= 0) { errEl.textContent = '请输入大于 0 的利息金额'; errEl.style.display = ''; return; }
        if (!date) { errEl.textContent = '请选择计息日期'; errEl.style.display = ''; return; }
        errEl.style.display = 'none';
        btn.disabled = true; btn.textContent = '提交中…';
        try {
            const res = await api(`/accounts/${id}/interest`, 'POST', { amount: amt, date, note: note || undefined });
            if (res) {
                showToast('利息已记录', 'success');
                this.closeInterestModal();
                await initCache();
                await this.refresh();
            } else {
                btn.disabled = false; btn.textContent = '确认';
            }
        } catch (e) {
            btn.disabled = false; btn.textContent = '确认';
            errEl.textContent = (e && e.message) || '提交失败，请重试';
            errEl.style.display = '';
        }
    },

    /* ---- 账户：全屏网格铺开 ---- */
    buildAccGridCard(a) {
        const typeLabels = { cash: '现金', bank_card: '储蓄卡', credit_card: '信用卡', electronic_payment: '电子支付', financial_account: '金融账户', digital: '数字货币', other: '其他' };
        return `
        <div class="acc-grid-card" data-acc-id="${a.id}" tabindex="0" role="button" aria-label="${escapeHtml(a.name)} 资金明细">
            <div class="goal-head">
                <div class="goal-icon">${escapeHtml(a.icon || '🏦')}</div>
                <div class="goal-title">${escapeHtml(a.name)}</div>
            </div>
            <div class="goal-amounts"><span>${typeLabels[a.type] || a.type}</span><span><strong>${fmt(a.balance)}</strong></span></div>
        </div>`;
    },
    openAccGrid(type) {
        const all = (cache.accounts || []).filter(a => !a.closed);
        const items = type ? all.filter(a => a.type === type) : all;
        if (!items.length) { showToast(type ? '该类型暂无账户' : '暂无账户', 'warning'); return; }
        const grid = document.getElementById('accGridBody');
        grid.innerHTML = items.map(a => this.buildAccGridCard(a)).join('');
        const label = type ? (this.typeLabels[type] || type) : '全部账户';
        document.getElementById('accGridTitle').textContent = label;
        document.getElementById('accGridCount').textContent = items.length;
        grid.querySelectorAll('[data-acc-id]').forEach(card => {
            const handler = () => { const id = parseInt(card.dataset.accId); if (!isNaN(id)) this.openDetail(id); };
            card.addEventListener('click', handler);
            card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handler(); } });
        });
        document.getElementById('accGridOverlay').classList.add('show');
    },
    closeAccGrid() {
        const ov = document.getElementById('accGridOverlay');
        if (ov) ov.classList.remove('show');
    }
};

export default AccountManager;
