// ============================================================
// TransferManager —— 转账模块
// ------------------------------------------------------------
// 拆分来源：C:\Users\XIN\WorkBuddy\XIN-Wallet\js\app.js
// 原始位置：第 1258 行 ~ 第 1366 行（共 109 行）
// 拆分日期：2026-07-22
// 拆分原因：将单体 app.js 按职责拆分为 ES Module，便于按需加载与维护
// 依赖（运行时全局）：api、escapeHtml、fmt、fmtDate、fmtDateTime、
//                    showToast、showEmpty、cache、initCache、getAcc、
//                    DOM 元素（transferForm / transferDate / transferFrom /
//                    transferTo / transferAmount / transferNote /
//                    transferSubmitBtn / transferCancelEditBtn /
//                    transferEditId / transferHistory）
// ============================================================

const TransferManager = {
    init() {
        this.populateAccounts();
        document.getElementById('transferDate').value = fmtDate();
        document.getElementById('transferForm').addEventListener('submit', (e) => { e.preventDefault(); this.transfer(); });
        document.getElementById('transferCancelEditBtn').addEventListener('click', () => this.cancelEdit());
    },
    populateAccounts() {
        ['transferFrom', 'transferTo'].forEach(id => {
            const sel = document.getElementById(id);
            sel.innerHTML = cache.accounts.map(a => `<option value="${a.id}">${escapeHtml(a.icon)} ${escapeHtml(a.name)} (${fmt(a.balance)})</option>`).join('');
        });
    },
    cancelEdit() {
        document.getElementById('transferEditId').value = '';
        document.getElementById('transferAmount').value = '';
        document.getElementById('transferNote').value = '';
        document.getElementById('transferDate').value = fmtDate();
        document.getElementById('transferSubmitBtn').textContent = '确认转账';
        document.getElementById('transferCancelEditBtn').style.display = 'none';
    },
    edit(id) {
        const transfers = this._lastTransfers || [];
        const t = transfers.find(x => x.id === id);
        if (!t) return;
        document.getElementById('transferEditId').value = t.id;
        document.getElementById('transferFrom').value = t.from_account_id;
        document.getElementById('transferTo').value = t.to_account_id;
        document.getElementById('transferAmount').value = t.amount;
        document.getElementById('transferDate').value = fmtDate(t.date);
        document.getElementById('transferNote').value = t.note || '';
        document.getElementById('transferSubmitBtn').textContent = '更新转账';
        document.getElementById('transferCancelEditBtn').style.display = '';
        // 滚动到表单
        document.getElementById('transferForm').scrollIntoView({ behavior: 'smooth' });
    },
    async transfer() {
        const editId = document.getElementById('transferEditId').value;
        const fromId = parseInt(document.getElementById('transferFrom').value);
        const toId = parseInt(document.getElementById('transferTo').value);
        const amount = parseFloat(document.getElementById('transferAmount').value);
        const date = document.getElementById('transferDate').value;
        const note = document.getElementById('transferNote').value;

        try {
            if (editId) {
                await api(`/transfers/${editId}`, 'PUT', { from_account_id: fromId, to_account_id: toId, amount, date, note });
                showToast('转账已更新', 'success');
            } else {
                await api('/transfers', 'POST', { from_account_id: fromId, to_account_id: toId, amount, date, note });
                showToast(`转账成功！${fmt(amount)} 已转出`, 'success');
            }
            this.cancelEdit();
            await initCache();
            await this.refresh();
        } catch (err) {
            // api() 已显示错误 toast
        }
    },
    async refresh() {
        this.populateAccounts();
        const transfers = await api(`/transfers?month=${cache.currentMonth}`);
        this._lastTransfers = transfers || [];
        const container = document.getElementById('transferHistory');
        if (!transfers || transfers.length === 0) {
            showEmpty(container, '暂无转账记录', '🔄');
            return;
        }
        container.innerHTML = transfers.map(t => {
            const fromAcc = getAcc(t.from_account_id);
            const toAcc = getAcc(t.to_account_id);
            return `
            <div class="transfer-item">
                <div class="transfer-icon">${fromAcc?.icon || '💰'}</div>
                <div class="transfer-body">
                    <div class="transfer-accounts">
                        <span class="transfer-acc-name">${escapeHtml(fromAcc?.name || '未知')}</span>
                        <span class="transfer-arrow">→</span>
                        <span class="transfer-acc-name">${escapeHtml(toAcc?.name || '未知')}</span>
                    </div>
                    <div class="transfer-meta">${fmtDateTime(t.date)} · ${escapeHtml(t.note || '无备注')}</div>
                </div>
                <div class="transfer-right">
                    <div class="transfer-amount">${fmt(t.amount)}</div>
                    <button class="transfer-edit" data-id="${t.id}" title="编辑">✏️</button>
                    <button class="transfer-del" data-id="${t.id}" title="删除">🗑️</button>
                </div>
            </div>`;
        }).join('');
        // 编辑按钮事件
        container.querySelectorAll('.transfer-edit').forEach(btn => {
            btn.addEventListener('click', () => this.edit(parseInt(btn.dataset.id)));
        });
        // 删除按钮事件
        container.querySelectorAll('.transfer-del').forEach(btn => {
            btn.addEventListener('click', () => this.delete(parseInt(btn.dataset.id)));
        });
    },
    async delete(id) {
        try {
            await api(`/transfers/${id}`, 'DELETE');
            showToast('转账已删除', 'warning');
            await initCache();
            await this.refresh();
        } catch (err) {
            // api() 已显示错误 toast
        }
    }
};

export default TransferManager;
