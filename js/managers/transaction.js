// ============================================================
// TransactionManager —— 交易模块
// ------------------------------------------------------------
// 拆分来源：C:\Users\XIN\WorkBuddy\XIN-Wallet\js\app.js
// 原始位置：第 1371 行 ~ 第 1740 行（共 370 行）
// 拆分日期：2026-07-22
// 拆分原因：将单体 app.js 按职责拆分为 ES Module，便于按需加载与维护
// 依赖（运行时全局）：api、escapeHtml、fmt、fmtDate、fmtSigned、
//                    fmtTransTime、fmtDateGroupHeader、showToast、
//                    showEmpty、cache、initCache、getExpCats、
//                    getIncCats、mergeTransferPairs、parseDateParts、
//                    DOM 元素（transSearch / transCatFilter /
//                    transTypeFilter / transMonthFilter / transAccFilter /
//                    transAmountBtn / transAmountPanel / transAmountLabel /
//                    transAmountInputs / transAmountActions / transAmountVal /
//                    transAmountVal2 / transAmountSep / transAmountApply /
//                    transAmountClear / transTagFilter / transNoteFilter /
//                    addTransBtn / transModal / transModalClose /
//                    transCancelBtn / transModalTitle / transEditId /
//                    transAmount / transDate / transNote / transAccount /
//                    transCategory / transBudget / transForm /
//                    transTagPicker / transTbody）
// ============================================================

const TransactionManager = {
    init() {
        this.populateFilters();
        document.getElementById('transSearch').addEventListener('input', () => this.refresh());
        document.getElementById('transCatFilter').addEventListener('change', () => this.refresh());
        document.getElementById('transTypeFilter').addEventListener('change', () => this.refresh());
        document.getElementById('transMonthFilter').addEventListener('change', () => this.refresh());
        document.getElementById('transAccFilter').addEventListener('change', () => this.refresh());
        // ===== 金额筛选下拉面板 =====
        const amtBtn = document.getElementById('transAmountBtn');
        const amtPanel = document.getElementById('transAmountPanel');
        const amtLabel = document.getElementById('transAmountLabel');
        const amtInputs = document.getElementById('transAmountInputs');
        const amtActions = document.getElementById('transAmountActions');
        this._amtVal = document.getElementById('transAmountVal');
        this._amtVal2 = document.getElementById('transAmountVal2');
        const amtSep = document.getElementById('transAmountSep');
        const amtApply = document.getElementById('transAmountApply');
        const amtClear = document.getElementById('transAmountClear');
        const amtOpBtns = amtPanel?.querySelectorAll('.amt-op-btn');

        this._currentAmtOp = 'all';

        const updateAmtPanel = (op) => {
            this._currentAmtOp = op;
            amtOpBtns.forEach(b => b.classList.toggle('active', b.dataset.op === op));
            const showInputs = op !== 'all';
            const isBetween = op === 'bt' || op === 'nb';
            amtInputs.style.display = showInputs ? '' : 'none';
            amtActions.style.display = showInputs ? '' : 'none';
            this._amtVal.placeholder = isBetween ? '最低' : '金额';
            this._amtVal2.style.display = isBetween ? '' : 'none';
            amtSep.style.display = isBetween ? '' : 'none';
            if (op === 'all') {
                this._amtVal.value = ''; this._amtVal2.value = '';
                amtLabel.textContent = '金额';
                closeAmtPanel();
                this.refresh();
            }
        };

        const closeAmtPanel = () => {
            amtPanel.style.display = 'none';
            amtBtn.classList.remove('active');
        };

        const applyAmountFilter = () => {
            const op = this._currentAmtOp;
            if (op === 'all') { clearAmountFilter(); return; }
            const v1 = this._amtVal?.value?.trim();
            if (!v1) { showToast('请输入金额', 'warning'); this._amtVal?.focus(); return; }
            let label;
            if (op === 'bt' || op === 'nb') {
                const v2 = this._amtVal2?.value?.trim();
                if (!v2) { showToast('请输入上限金额', 'warning'); this._amtVal2?.focus(); return; }
                label = (op === 'bt' ? '介于 ' : '不介于 ') + v1 + '~' + v2;
            } else {
                const opLabels = { gt: '大于 ', lt: '小于 ', eq: '等于 ', ne: '不等于 ' };
                label = (opLabels[op] || '') + v1;
            }
            amtLabel.textContent = label;
            closeAmtPanel();
            this.refresh();
        };

        const clearAmountFilter = () => {
            this._amtVal.value = ''; this._amtVal2.value = '';
            updateAmtPanel('all');
        };

        if (amtBtn) {
            amtBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const isOpen = amtPanel.style.display !== 'none';
                if (isOpen) { closeAmtPanel(); }
                else {
                    // 动态定位面板：fixed 定位，避免被 overflow:hidden 裁剪
                    const rect = amtBtn.getBoundingClientRect();
                    amtPanel.style.position = 'fixed';
                    amtPanel.style.top = (rect.bottom + 4) + 'px';
                    amtPanel.style.left = rect.left + 'px';
                    amtPanel.style.minWidth = Math.max(rect.width, 200) + 'px';
                    amtPanel.style.display = '';
                    amtBtn.classList.add('active');
                }
            });
        }
        if (amtOpBtns) {
            amtOpBtns.forEach(b => b.addEventListener('click', (e) => {
                e.stopPropagation();
                updateAmtPanel(b.dataset.op);
            }));
        }
        if (this._amtVal) this._amtVal.addEventListener('keydown', (e) => { if (e.key === 'Enter') applyAmountFilter(); });
        if (this._amtVal2) this._amtVal2.addEventListener('keydown', (e) => { if (e.key === 'Enter') applyAmountFilter(); });
        if (amtApply) amtApply.addEventListener('click', (e) => { e.stopPropagation(); applyAmountFilter(); });
        if (amtClear) amtClear.addEventListener('click', (e) => { e.stopPropagation(); clearAmountFilter(); });
        // 点击面板外部关闭
        document.addEventListener('click', (e) => {
            if (amtPanel && amtPanel.style.display !== 'none' && !amtPanel.contains(e.target) && e.target !== amtBtn && !amtBtn.contains(e.target)) {
                closeAmtPanel();
            }
        });
        // ===== 金额筛选下拉面板结束 =====
        const tagF = document.getElementById('transTagFilter');
        if (tagF) tagF.addEventListener('change', () => this.refresh());
        const noteF = document.getElementById('transNoteFilter');
        if (noteF) noteF.addEventListener('input', () => this.refresh());
        document.getElementById('addTransBtn').addEventListener('click', () => this.openModal());
        document.getElementById('transModalClose').addEventListener('click', () => this.closeModal());
        document.getElementById('transCancelBtn').addEventListener('click', () => this.closeModal());
        document.querySelectorAll('#transForm .type-btn').forEach(b => b.addEventListener('click', () => {
            document.querySelectorAll('#transForm .type-btn').forEach(x => { x.classList.remove('active'); x.setAttribute('aria-pressed', 'false'); });
            b.classList.add('active');
            b.setAttribute('aria-pressed', 'true');
            this.updateCatSelect(b.dataset.type);
        }));
        document.getElementById('transForm').addEventListener('submit', (e) => { e.preventDefault(); this.save(); });
    },
    populateFilters() {
        const catSel = document.getElementById('transCatFilter');
        const parents = cache.categories.filter(c => !c.parent_id);
        const children = cache.categories.filter(c => c.parent_id);
        parents.forEach(p => {
            const subs = children.filter(c => c.parent_id === p.id);
            if (subs.length > 0) {
                catSel.innerHTML += `<optgroup label="${p.icon} ${escapeHtml(p.name)}">${subs.map(s => `<option value="${s.id}">${s.icon} ${escapeHtml(s.name)}</option>`).join('')}</optgroup>`;
            } else {
                catSel.innerHTML += `<option value="${p.id}">${p.icon} ${escapeHtml(p.name)}</option>`;
            }
        });
        const accSel = document.getElementById('transAccFilter');
        cache.accounts.forEach(a => { accSel.innerHTML += `<option value="${a.id}">${escapeHtml(a.icon)} ${escapeHtml(a.name)}</option>`; });
        this.updateCatSelect('expense');
        this.updateAccSelect();
    },
    updateCatSelect(type) {
        const sel = document.getElementById('transCategory');
        const cats = type === 'expense' ? getExpCats() : getIncCats();
        // 构建树形选项：一级分类作为 optgroup，二级分类作为 option
        const parents = cats.filter(c => !c.parent_id);
        const children = cats.filter(c => c.parent_id);
        sel.innerHTML = parents.map(p => {
            const subs = children.filter(c => c.parent_id === p.id);
            if (subs.length > 0) {
                return `<optgroup label="${p.icon} ${escapeHtml(p.name)}">${subs.map(s => `<option value="${s.id}">${s.icon} ${escapeHtml(s.name)}</option>`).join('')}</optgroup>`;
            }
            return `<option value="${p.id}">${p.icon} ${escapeHtml(p.name)}</option>`;
        }).join('');
    },
    updateAccSelect() {
        const sel = document.getElementById('transAccount');
        sel.innerHTML = cache.accounts.map(a => `<option value="${a.id}">${escapeHtml(a.icon)} ${escapeHtml(a.name)}</option>`).join('');
    },
    renderTagPicker(selectedIds = []) {
        const picker = document.getElementById('transTagPicker');
        if (!picker) return;
        const sel = new Set(selectedIds);
        const tags = cache.tags || [];
        if (tags.length === 0) { picker.innerHTML = '<span class="empty-hint">暂无标签，去「标签管理」创建</span>'; return; }
        picker.innerHTML = tags.map(tg => `<span class="tag-chip ${sel.has(tg.id) ? 'selected' : ''}" data-id="${tg.id}" style="--tag-color:${tg.color}">${escapeHtml(tg.icon)} ${escapeHtml(tg.name)}</span>`).join('');
        picker.querySelectorAll('.tag-chip').forEach(chip => chip.addEventListener('click', () => chip.classList.toggle('selected')));
    },
    async openModal(editId = null) {
        document.getElementById('transModal').classList.add('show');
        // 加载预算下拉选项
        this.updateBudgetSelect();
        if (editId) {
            document.getElementById('transModalTitle').textContent = '编辑交易';
            const trans = await api(`/transactions?limit=999`);
            const t = trans?.find(x => x.id === editId);
            if (t) {
                document.getElementById('transEditId').value = t.id;
                document.getElementById('transAmount').value = t.amount;
                document.getElementById('transDate').value = fmtDate(t.date);
                document.getElementById('transNote').value = t.note;
                document.getElementById('transAccount').value = t.account?.id || cache.accounts[0]?.id;
                document.getElementById('transCategory').value = t.category?.id;
                document.getElementById('transBudget').value = t.budget_id || '';
                document.querySelectorAll('#transForm .type-btn').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-pressed','false'); if (b.dataset.type === t.type) { b.classList.add('active'); b.setAttribute('aria-pressed','true'); } });
                this.updateCatSelect(t.type);
                this.renderTagPicker(t.tags ? t.tags.map(x => x.id) : []);
            }
        } else {
            document.getElementById('transModalTitle').textContent = '新增交易';
            document.getElementById('transEditId').value = '';
            document.getElementById('transAmount').value = '';
            document.getElementById('transDate').value = fmtDate();
            document.getElementById('transNote').value = '';
            document.getElementById('transBudget').value = '';
            document.querySelectorAll('#transForm .type-btn').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-pressed','false'); if (b.dataset.type === 'expense') { b.classList.add('active'); b.setAttribute('aria-pressed','true'); } });
            this.updateCatSelect('expense');
            this.updateAccSelect();
            this.renderTagPicker([]);
        }
    },
    updateBudgetSelect() {
        const sel = document.getElementById('transBudget');
        const transDate = document.getElementById('transDate')?.value || fmtDate();
        // 从缓存获取预算列表，按交易日期匹配时间范围
        const budgets = cache.budgets || [];
        sel.innerHTML = '<option value="">不关联</option>' +
            budgets.filter(b => transDate >= b.start_date && transDate <= b.end_date).map(b =>
                `<option value="${b.id}">${escapeHtml(b.name)} (${fmt(b.amount)})</option>`
            ).join('');
    },
    closeModal() { document.getElementById('transModal').classList.remove('show'); },
    async save() {
        const editId = document.getElementById('transEditId').value;
        const type = document.querySelector('#transForm .type-btn.active').dataset.type;
        const budgetVal = document.getElementById('transBudget').value;
        const body = {
            account_id: parseInt(document.getElementById('transAccount').value),
            category_id: parseInt(document.getElementById('transCategory').value),
            budget_id: budgetVal ? parseInt(budgetVal) : null,
            type, amount: parseFloat(document.getElementById('transAmount').value),
            date: document.getElementById('transDate').value,
            note: document.getElementById('transNote').value,
            tags: Array.from(document.querySelectorAll('#transTagPicker .tag-chip.selected')).map(c => parseInt(c.dataset.id))
        };
        if (!body.amount || body.amount <= 0) { showToast('请输入有效金额', 'error'); return; }
        if (editId) {
            await api(`/transactions/${editId}`, 'PUT', body);
            showToast('交易已更新', 'success');
        } else {
            await api('/transactions', 'POST', body);
            showToast('交易已添加', 'success');
        }
        this.closeModal();
        await initCache();
        await this.refresh();
    },
    async delete(id) {
        try {
            await api(`/transactions/${id}`, 'DELETE');
            showToast('交易已删除', 'warning');
            await initCache();
            await this.refresh();
        } catch (err) {
            // api() 已显示错误 toast
        }
    },
    async refresh() {
        const search = document.getElementById('transSearch').value;
        const cat = document.getElementById('transCatFilter').value;
        const type = document.getElementById('transTypeFilter').value;
        const month = document.getElementById('transMonthFilter').value;
        const acc = document.getElementById('transAccFilter').value;
        const tag = document.getElementById('transTagFilter')?.value;
        let params = `limit=200`;
        if (month && month !== 'all') params += `&month=${month}`;
        if (type && type !== 'all') params += `&type=${type}`;
        if (cat && cat !== 'all') params += `&category_id=${cat}`;
        if (tag && tag !== 'all') params += `&tag_id=${tag}`;
        if (this._currentAmtOp && this._currentAmtOp !== 'all') {
            params += `&amount_op=${this._currentAmtOp}`;
            params += `&amount_val=${encodeURIComponent(this._amtVal?.value || '')}`;
            if (this._currentAmtOp === 'bt' || this._currentAmtOp === 'nb') {
                params += `&amount_val2=${encodeURIComponent(this._amtVal2?.value || '')}`;
            }
        }
        if (search) params += `&search=${encodeURIComponent(search)}`;
        const list = await api(`/transactions?${params}`);
        const tbodyEl = document.getElementById('transTbody');
        if (!list || list.length === 0) { showEmpty(tbodyEl, '暂无交易记录', '📭'); return; }

        // 合并配对转账
        const merged = mergeTransferPairs(list);

        // 按日期降序 + id降序排序
        merged.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);

        // 前端备注筛选
        const noteFilter = (document.getElementById('transNoteFilter')?.value || '').trim().toLowerCase();
        let filtered = noteFilter
            ? merged.filter(t => {
                const note = (t.note || '').toLowerCase();
                const outNote = t._transferOut ? (t._transferOut.note || '').toLowerCase() : '';
                const inNote = t._transferIn ? (t._transferIn.note || '').toLowerCase() : '';
                return note.includes(noteFilter) || outNote.includes(noteFilter) || inNote.includes(noteFilter);
              })
            : merged;

        if (filtered.length === 0) {
            const emptyMsg = noteFilter ? '没有匹配备注的交易' : '暂无交易记录';
            showEmpty(tbodyEl, emptyMsg, '📭');
            return;
        }

        // 按日期分组（使用日期字符串避免时区偏移）
        const groups = {};
        filtered.forEach(t => {
            const { y, m, d } = parseDateParts(t.date);
            const key = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            if (!groups[key]) groups[key] = { date: t.date, items: [] };
            groups[key].items.push(t);
        });
        const groupKeys = Object.keys(groups).sort((a, b) => b.localeCompare(a));

        const renderRow = (t) => {
            const isTransfer = t.type === 'transfer_in' || t.type === 'transfer_out';
            const time = fmtTransTime(t.date);
            const typeLabel = isTransfer ? '转账' : (t.type === 'income' ? '收入' : '支出');
            const typeClass = isTransfer ? 'transfer' : t.type;
            const categoryHtml = `<span class="trans-cat-icon">${t.category.icon}</span><span>${escapeHtml(t.category.name)}</span>`;
            const tagsHtml = (t.tags && t.tags.length)
                ? t.tags.map(tg => `<span class="tag-badge" style="--tag-color:${tg.color}">${escapeHtml(tg.icon)} ${escapeHtml(tg.name)}</span>`).join('')
                : '';

                        if (isTransfer) {
                const outAcc = t._transferOut ? t._transferOut.account : null;
                const inAcc = t._transferIn ? t._transferIn.account : null;
                const fromName = outAcc ? `${escapeHtml(outAcc.name || '')}` : '?';
                const toName = inAcc ? `${escapeHtml(inAcc.name || '')}` : '?';
                const fromNote = t._transferOut ? t._transferOut.note : '';
                const noteText = fromNote || t.note || '';
                const id = t._transferOut ? t._transferOut.id : t.id;
                return `
                    <div class="trans-row transfer" data-id="${id}">
                        <div class="trans-td trans-time">${time}</div>
                        <div class="trans-td trans-type">${typeLabel}</div>
                        <div class="trans-td trans-category">${categoryHtml}</div>
                        <div class="trans-td trans-amount transfer">${fmtSigned(t.amount, 'transfer_in')}</div>
                        <div class="trans-td trans-account">${fromName} → ${toName}</div>
                        <div class="trans-td trans-tags">${tagsHtml}</div>
                        <div class="trans-td trans-desc">${escapeHtml(noteText)}</div>
                        <div class="trans-td trans-actions">
                            <button data-action="delete-trans" data-id="${id}" title="删除">🗑️</button>
                        </div>
                    </div>`;
            }

            const accountName = `${escapeHtml(t.account?.name || '-')}`;
            return `
                <div class="trans-row ${t.type}" data-id="${t.id}">
                    <div class="trans-td trans-time">${time}</div>
                    <div class="trans-td trans-type">${typeLabel}</div>
                    <div class="trans-td trans-category">${categoryHtml}</div>
                    <div class="trans-td trans-amount ${t.type}">${fmtSigned(t.amount, t.type)}</div>
                    <div class="trans-td trans-account">${accountName}</div>
                    <div class="trans-td trans-tags">${tagsHtml}</div>
                    <div class="trans-td trans-desc">${escapeHtml(t.note || '')}</div>
                    <div class="trans-td trans-actions">
                        <button data-action="edit-trans" data-id="${t.id}" title="编辑">✏️</button>
                        <button data-action="delete-trans" data-id="${t.id}" title="删除">🗑️</button>
                    </div>
                </div>`;
        };

        const tbody = groupKeys.map(key => {
            const g = groups[key];
            return `
                <div class="trans-date-group">
                    <div class="trans-date-header">${fmtDateGroupHeader(g.date)}</div>
                    ${g.items.map(t => renderRow(t)).join('')}
                </div>
            `;
        }).join('');

        tbodyEl.innerHTML = tbody;

        // 事件委托：编辑和删除按钮
        tbodyEl.querySelectorAll('[data-action="edit-trans"]').forEach(btn => {
            btn.addEventListener('click', () => this.openModal(parseInt(btn.dataset.id)));
        });
        tbodyEl.querySelectorAll('[data-action="delete-trans"]').forEach(btn => {
            btn.addEventListener('click', () => this.delete(parseInt(btn.dataset.id)));
        });
    }
};

export default TransactionManager;
