// ============================================================
// DataManager —— 基础数据维护模块（分类 / 理财类型 / 通用编辑弹窗）
// ------------------------------------------------------------
// 拆分来源：C:\Users\XIN\WorkBuddy\XIN-Wallet\js\app.js
// 原始位置：第 4089 行 ~ 第 4326 行（共 238 行）
// 拆分日期：2026-07-22
// 拆分原因：将单体 app.js 按职责拆分为 ES Module，便于按需加载与维护
// 依赖（运行时全局）：api、escapeHtml、showToast、confirm，
//                    TagManager（跨模块调用 refresh），
//                    initColorSwatches（全局函数），
//                    以及 DOM 元素（dcEditModal、dcEditForm、dcEditKind、
//                    dcEditId、dcEditTitle、dcEditParentId、dcEditName、
//                    dcEditIcon、dcEditCatType、dcEditSort、dcEditColor、
//                    dcEditRisk、dcEditInvSort、dcEditDesc、dcRowCatExtra、
//                    dcRowInvExtra、dcRowDesc、dcRowColor、catTableBody、
//                    catFilterType、addCatBtn、invTypeTableBody、
//                    addInvTypeBtn、dcColorSwatches、dcEditClose、
//                    dcEditCancel 等）
// ============================================================

const DataManager = {
    init() {
        // Tab 切换
        document.querySelectorAll('.dc-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.dc-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.dc-panel').forEach(p => p.classList.remove('active'));
                tab.classList.add('active');
                document.getElementById('dcPanel-' + tab.dataset.dctab).classList.add('active');
                if (tab.dataset.dctab === 'tags') TagManager.refresh();
            });
        });

        // 分类
        document.getElementById('addCatBtn').addEventListener('click', () => this.openCatModal());
        document.getElementById('catFilterType').addEventListener('change', () => this.refreshCats());
        document.getElementById('dcEditClose').addEventListener('click', () => this.closeEditModal());
        document.getElementById('dcEditCancel').addEventListener('click', () => this.closeEditModal());
        document.getElementById('dcEditForm').addEventListener('submit', e => { e.preventDefault(); this.saveEdit(); });
        initColorSwatches('dcColorSwatches', 'dcEditColor');

        // 理财类型
        document.getElementById('addInvTypeBtn').addEventListener('click', () => this.openInvTypeModal());

        // 弹窗遮罩关闭
        document.getElementById('dcEditModal').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) this.closeEditModal();
        });

        // 分类表格操作委托
        document.getElementById('catTableBody').addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-action]');
            if (!btn) return;
            const action = btn.dataset.action;
            if (action === 'edit-cat') this.openCatModal(parseInt(btn.dataset.id));
            else if (action === 'add-subcat') this.openCatModal(null, parseInt(btn.dataset.pid));
            else if (action === 'del-cat') this.deleteCat(parseInt(btn.dataset.id), btn.dataset.name);
        });

        // 理财类型表格操作委托
        document.getElementById('invTypeTableBody').addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-action]');
            if (!btn) return;
            const action = btn.dataset.action;
            if (action === 'edit-invtype') this.openInvTypeModal(parseInt(btn.dataset.id));
            else if (action === 'del-invtype') this.deleteInvType(parseInt(btn.dataset.id), btn.dataset.name);
        });
    },

    async refresh() {
        await this.refreshCats();
        await this.refreshInvTypes();
    },

    // ---- 分类 ----
    async refreshCats() {
        const filter = document.getElementById('catFilterType').value;
        const qs = filter ? `?type=${filter}` : '';
        const data = await api('/categories' + qs);
        const tbody = document.getElementById('catTableBody');
        if (!data || !data.tree || data.tree.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">📂</div><div class="empty-text">暂无分类数据</div></div></td></tr>';
            return;
        }
        const typeLabel = { expense: '支出', income: '收入' };

        const renderRow = (c, depth) => `
            <tr class="${depth > 0 ? 'dc-sub-row' : 'dc-parent-row'}">
                <td><span style="font-size:${depth > 0 ? '16' : '20'}px;padding-left:${depth * 20}px;display:inline-block">${depth > 0 ? '└ ' : ''}${c.icon}</span></td>
                <td>${escapeHtml(c.name)}${c.children && c.children.length > 0 ? ` <span class="dc-child-count">(${c.children.length}个子类)</span>` : ''}</td>
                <td><span class="badge ${c.type === 'income' ? 'badge-income' : 'badge-expense'}">${typeLabel[c.type] || c.type}</span></td>
                <td><span class="color-dot" style="background:${c.color}"></span></td>
                <td>${c.sort_order}</td>
                <td class="dc-actions">
                    <button class="btn-ghost-sm" data-action="edit-cat" data-id="${c.id}">✏️</button>
                    <button class="btn-ghost-sm" data-action="add-subcat" data-pid="${c.id}">➕</button>
                    <button class="btn-ghost-sm btn-danger-sm" data-action="del-cat" data-id="${c.id}" data-name="${escapeHtml(c.name)}">🗑️</button>
                </td>
            </tr>
            ${(c.children || []).map(ch => renderRow(ch, depth + 1)).join('')}
        `;

        tbody.innerHTML = data.tree.map(c => renderRow(c, 0)).join('');
    },

    openCatModal(id, parentId) {
        document.getElementById('dcEditKind').value = 'category';
        document.getElementById('dcRowCatExtra').style.display = '';
        document.getElementById('dcRowInvExtra').style.display = 'none';
        document.getElementById('dcRowDesc').style.display = 'none';
        document.getElementById('dcRowColor').style.display = '';
        if (id) {
            this._loadCat(id);
        } else {
            document.getElementById('dcEditTitle').textContent = parentId ? '新增子分类' : '新增分类';
            document.getElementById('dcEditId').value = '';
            document.getElementById('dcEditParentId').value = parentId || '';
            document.getElementById('dcEditName').value = '';
            document.getElementById('dcEditIcon').value = '📌';
            document.getElementById('dcEditCatType').value = 'expense';
            document.getElementById('dcEditSort').value = '0';
            document.getElementById('dcEditColor').value = '#6366f1';
            document.getElementById('dcEditModal').classList.add('show');
        }
    },

    async _loadCat(id) {
        const data = await api('/categories?flat=1');
        const cat = data.find(c => c.id === id);
        if (!cat) return;
        document.getElementById('dcEditTitle').textContent = cat.parent_id ? '编辑子分类' : '编辑分类';
        document.getElementById('dcEditId').value = cat.id;
        document.getElementById('dcEditParentId').value = cat.parent_id || '';
        document.getElementById('dcEditName').value = cat.name;
        document.getElementById('dcEditIcon').value = cat.icon;
        document.getElementById('dcEditCatType').value = cat.type;
        document.getElementById('dcEditSort').value = cat.sort_order;
        document.getElementById('dcEditColor').value = cat.color || '#6366f1';
        document.getElementById('dcEditModal').classList.add('show');
    },

    async deleteCat(id, name) {
        if (!confirm(`确定删除分类「${name}」？有交易记录或子分类的分类无法删除。`)) return;
        try {
            await api('/categories/' + id, 'DELETE');
            showToast('分类已删除', 'success');
            this.refreshCats();
        } catch (err) {
            // api() 已显示错误 toast
        }
    },

    // ---- 理财类型 ----
    async refreshInvTypes() {
        const data = await api('/investment-types');
        const tbody = document.getElementById('invTypeTableBody');
        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">💹</div><div class="empty-text">暂无理财类型</div></div></td></tr>';
            return;
        }
        const riskLabel = { low: '低风险', medium: '中风险', high: '高风险', very_high: '极高风险' };
        tbody.innerHTML = data.map(t => `
            <tr>
                <td><span style="font-size:20px">${t.icon}</span></td>
                <td>${escapeHtml(t.name)}</td>
                <td><span class="badge badge-risk ${t.risk_level}">${riskLabel[t.risk_level] || t.risk_level}</span></td>
                <td>${escapeHtml(t.description || '-')}</td>
                <td>${t.sort_order}</td>
                <td class="dc-actions">
                    <button class="btn-ghost-sm" data-action="edit-invtype" data-id="${t.id}">✏️</button>
                    <button class="btn-ghost-sm btn-danger-sm" data-action="del-invtype" data-id="${t.id}" data-name="${escapeHtml(t.name)}">🗑️</button>
                </td>
            </tr>
        `).join('');
    },

    openInvTypeModal(id) {
        document.getElementById('dcEditKind').value = 'invtype';
        document.getElementById('dcRowCatExtra').style.display = 'none';
        document.getElementById('dcRowInvExtra').style.display = '';
        document.getElementById('dcRowDesc').style.display = '';
        document.getElementById('dcRowColor').style.display = 'none';
        if (id) {
            this._loadInvType(id);
        } else {
            document.getElementById('dcEditTitle').textContent = '新增理财类型';
            document.getElementById('dcEditId').value = '';
            document.getElementById('dcEditName').value = '';
            document.getElementById('dcEditIcon').value = '💰';
            document.getElementById('dcEditRisk').value = 'medium';
            document.getElementById('dcEditInvSort').value = '0';
            document.getElementById('dcEditDesc').value = '';
            document.getElementById('dcEditModal').classList.add('show');
        }
    },

    async _loadInvType(id) {
        const data = await api('/investment-types');
        const t = data.find(x => x.id === id);
        if (!t) return;
        document.getElementById('dcEditTitle').textContent = '编辑理财类型';
        document.getElementById('dcEditId').value = t.id;
        document.getElementById('dcEditName').value = t.name;
        document.getElementById('dcEditIcon').value = t.icon;
        document.getElementById('dcEditRisk').value = t.risk_level;
        document.getElementById('dcEditInvSort').value = t.sort_order;
        document.getElementById('dcEditDesc').value = t.description || '';
        document.getElementById('dcEditModal').classList.add('show');
    },

    async deleteInvType(id, name) {
        if (!confirm(`确定删除理财类型「${name}」？有持仓记录的类型无法删除。`)) return;
        try {
            await api('/investment-types/' + id, 'DELETE');
            showToast('理财类型已删除', 'success');
            this.refreshInvTypes();
        } catch (err) {
            // api() 已显示错误 toast
        }
    },

    // ---- 通用保存 ----
    async saveEdit() {
        const kind = document.getElementById('dcEditKind').value;
        const id = document.getElementById('dcEditId').value;
        if (kind === 'category') {
            const parentVal = document.getElementById('dcEditParentId').value;
            const body = {
                parent_id: parentVal ? parseInt(parentVal) : null,
                name: document.getElementById('dcEditName').value,
                icon: document.getElementById('dcEditIcon').value,
                type: document.getElementById('dcEditCatType').value,
                color: document.getElementById('dcEditColor').value,
                sort_order: parseInt(document.getElementById('dcEditSort').value) || 0
            };
            if (id) await api('/categories/' + id, 'PUT', body);
            else await api('/categories', 'POST', body);
            this.closeEditModal();
            this.refreshCats();
        } else if (kind === 'invtype') {
            const body = {
                name: document.getElementById('dcEditName').value,
                icon: document.getElementById('dcEditIcon').value,
                risk_level: document.getElementById('dcEditRisk').value,
                description: document.getElementById('dcEditDesc').value,
                sort_order: parseInt(document.getElementById('dcEditInvSort').value) || 0
            };
            if (id) await api('/investment-types/' + id, 'PUT', body);
            else await api('/investment-types', 'POST', body);
            this.closeEditModal();
            this.refreshInvTypes();
        }
    },

    closeEditModal() {
        document.getElementById('dcEditModal').classList.remove('show');
    }
};

export default DataManager;