// ============================================================
// InvestmentManager —— 理财管理模块
// ------------------------------------------------------------
// 拆分来源：C:\Users\XIN\WorkBuddy\XIN-Wallet\js\app.js
// 原始位置：第 1910 行 ~ 第 2271 行（共 362 行）
// 拆分日期：2026-07-22
// 拆分原因：将单体 app.js 按职责拆分为 ES Module，便于按需加载与维护
// 依赖（运行时全局）：api、escapeHtml、fmt、fmtDate、showToast、
//                    showSkeleton、showEmpty、cache、ChartManager，
//                    以及 DOM 元素
//                    （addInvestBtn、investModalClose、investCancelBtn、
//                    investForm、investQuoteBtn、refreshAllBtn、investType、
//                    investAccount、reduceForm、reduceModalClose、
//                    reduceCancelBtn、investBuyDate、investBuyPrice、
//                    investCurrentPrice、investQuantity、investFee、
//                    investTotalCost、investCurrentValue、investModal、
//                    investModalTitle、investName、investCode、
//                    investExpectedRate、investNote、quoteResult、
//                    investList、invTotalCost、invTotalValue、
//                    invTotalProfit、invTotalRate、invAnnualized、
//                    invConcentration、invExpectedRate、reduceInvestId、
//                    reduceModalTitle、reduceMeta、reducePriceLabel、
//                    reduceQtyLabel、reduceSubmitBtn、reduceSellPrice、
//                    reduceQuantity、reduceFee、reduceDate、reduceNote、
//                    reduceModal 等）
// ============================================================

const InvestmentManager = {
    refreshTimer: null,
    _initialized: false,
    init() {
        if (this._initialized) return;
        const investForm = document.getElementById('investForm');
        if (!investForm) return;  // DOM 尚未通过 PageLoader 加载
        this._initialized = true;
        document.getElementById('investModalClose').addEventListener('click', () => this.closeModal());
        document.getElementById('investCancelBtn').addEventListener('click', () => this.closeModal());
        document.getElementById('investForm').addEventListener('submit', (e) => { e.preventDefault(); this.save(); });
        // 查行情按钮
        document.getElementById('investQuoteBtn').addEventListener('click', () => this.fetchQuote());
        // 一键刷新按钮
        document.getElementById('refreshAllBtn').addEventListener('click', () => this.refreshAllQuotes());
        // 类型下拉
        const typeSel = document.getElementById('investType');
        cache.investmentTypes.forEach(t => { typeSel.innerHTML += `<option value="${t.id}">${escapeHtml(t.icon)} ${escapeHtml(t.name)} (${escapeHtml(t.risk_level)})</option>`; });
        // 账户下拉
        const accSel = document.getElementById('investAccount');
        cache.accounts.forEach(a => { accSel.innerHTML += `<option value="${a.id}">${escapeHtml(a.icon)} ${escapeHtml(a.name)}</option>`; });
        // 自动联动计算
        this.bindAutoCalc();
        // 加仓/减仓弹窗事件
        document.getElementById('reduceForm').addEventListener('submit', (e) => { e.preventDefault(); this.reduce(); });
        document.getElementById('reduceModalClose').addEventListener('click', () => this.closeReduceModal());
        document.getElementById('reduceCancelBtn').addEventListener('click', () => this.closeReduceModal());
        // 操作类型切换
        document.querySelectorAll('input[name="reduceAction"]').forEach(radio => {
            radio.addEventListener('change', (e) => this.updateReduceUI(e.target.value));
        });
        document.getElementById('investBuyDate').value = fmtDate();
    },
    bindAutoCalc() {
        const buyPriceEl = document.getElementById('investBuyPrice');
        const currentPriceEl = document.getElementById('investCurrentPrice');
        const qtyEl = document.getElementById('investQuantity');
        const feeEl = document.getElementById('investFee');
        const totalCostEl = document.getElementById('investTotalCost');
        const currentValueEl = document.getElementById('investCurrentValue');

        const toNum = (el) => parseFloat(el.value) || 0;
        const set = (el, v) => { if (document.activeElement !== el) el.value = v; };

        // 买入单价 × 数量 + 手续费 = 总投入成本
        const calcCost = () => {
            const bp = toNum(buyPriceEl), qty = toNum(qtyEl), fee = toNum(feeEl);
            if (bp > 0 && qty > 0) set(totalCostEl, (bp * qty + fee).toFixed(2));
        };
        // 当前单价 × 数量 = 当前市值
        const calcValue = () => {
            const cp = toNum(currentPriceEl), qty = toNum(qtyEl);
            if (cp > 0 && qty > 0) set(currentValueEl, (cp * qty).toFixed(2));
        };
        // 总投入成本反推买入单价
        const calcBuyPrice = () => {
            const cost = toNum(totalCostEl), qty = toNum(qtyEl), fee = toNum(feeEl);
            if (cost > 0 && qty > 0) set(buyPriceEl, ((cost - fee) / qty).toFixed(4));
        };

        buyPriceEl.addEventListener('input', () => { calcCost(); calcValue(); });
        currentPriceEl.addEventListener('input', () => { calcValue(); });
        qtyEl.addEventListener('input', () => { calcCost(); calcValue(); });
        feeEl.addEventListener('input', () => { calcCost(); });
        totalCostEl.addEventListener('input', calcBuyPrice);
    },
    openModal() {
        document.getElementById('investModal').classList.add('show');
        document.getElementById('investModalTitle').textContent = '新增理财持仓';
        document.getElementById('investName').value = '';
        document.getElementById('investCode').value = '';
        document.getElementById('investBuyPrice').value = '';
        document.getElementById('investCurrentPrice').value = '';
        document.getElementById('investQuantity').value = '';
        document.getElementById('investFee').value = '';
        document.getElementById('investTotalCost').value = '';
        document.getElementById('investCurrentValue').value = '';
        document.getElementById('investBuyDate').value = fmtDate();
        document.getElementById('investExpectedRate').value = '';
        document.getElementById('investNote').value = '';
        document.getElementById('quoteResult').innerHTML = '';
    },
    closeModal() {
        document.getElementById('investModal').classList.remove('show');
        this.editId = null;
    },
    async edit(id) {
        const data = await api('/investments/investments');
        if (!data) return;   // data = { investments: [...], summary: {...}, byType: [...] }
        const inv = data.investments.find(i => i.id === id);
        if (!inv) { showToast('持仓不存在', 'error'); return; }
        this.editId = id;
        document.getElementById('investModal').classList.add('show');
        document.getElementById('investModalTitle').textContent = '编辑理财持仓';
        document.getElementById('investType').value = inv.investment_type_id;
        document.getElementById('investName').value = inv.name || '';
        document.getElementById('investCode').value = inv.code || '';
        document.getElementById('investAccount').value = inv.account_id || '';
        document.getElementById('investBuyPrice').value = inv.buy_price || '';
        document.getElementById('investCurrentPrice').value = inv.current_price || '';
        document.getElementById('investQuantity').value = inv.quantity || '';
        document.getElementById('investFee').value = inv.fee || '';
        document.getElementById('investTotalCost').value = inv.total_cost || '';
        document.getElementById('investCurrentValue').value = inv.current_value || '';
        document.getElementById('investBuyDate').value = inv.buy_date ? inv.buy_date.slice(0, 10) : fmtDate();
        document.getElementById('investExpectedRate').value = inv.expected_rate || '';
        document.getElementById('investNote').value = inv.note || '';
        document.getElementById('quoteResult').innerHTML = '';
    },
    // 查行情：输入代码 → 自动填充名称和价格
    async fetchQuote() {
        const code = document.getElementById('investCode').value.trim();
        if (!code) { showToast('请输入产品代码', 'warning'); return; }
        const typeId = parseInt(document.getElementById('investType').value);
        const invType = cache.investmentTypes.find(t => t.id === typeId);
        const category = invType?.category || 'fund';
        const resultEl = document.getElementById('quoteResult');
        resultEl.innerHTML = '<span class="quote-loading">⏳ 查询中...</span>';
        const data = await api(`/investments/quote?code=${encodeURIComponent(code)}&category=${category}`);
        if (!data) { resultEl.innerHTML = '<span class="quote-error">❌ 查询失败，请检查代码</span>'; return; }
        let price, quoteClass, quotePrefix;
        if (data.type === 'fund') {
            price = data.estimatedNav || data.nav;
            const change = parseFloat(data.estimatedChange) || 0;
            quoteClass = change > 0 ? 'quote-up' : (change < 0 ? 'quote-down' : 'quote-ok');
            quotePrefix = change > 0 ? '+' : '';
            resultEl.innerHTML = `<span class="${quoteClass}">✅ ${escapeHtml(data.name)} | 净值 ${data.nav} | 估算 ${price} (${quotePrefix}${change}%) | ${data.navDate}</span>`;
        } else {
            price = data.price;
            const change = parseFloat(data.changePercent) || 0;
            quoteClass = change > 0 ? 'quote-up' : (change < 0 ? 'quote-down' : 'quote-ok');
            quotePrefix = change > 0 ? '+' : '';
            resultEl.innerHTML = `<span class="${quoteClass}">✅ ${escapeHtml(data.name)} | 现价 ${price} | ${quotePrefix}${change.toFixed(2)}%</span>`;
        }
        if (!document.getElementById('investName').value) {
            document.getElementById('investName').value = data.name || '';
        }
        if (price > 0) {
            // 行情价作为当前单价；若买入单价为空，也用它填充
            document.getElementById('investCurrentPrice').value = price;
            if (!document.getElementById('investBuyPrice').value) {
                document.getElementById('investBuyPrice').value = price;
            }
            const qty = parseFloat(document.getElementById('investQuantity').value) || 0;
            if (qty > 0) {
                const fee = parseFloat(document.getElementById('investFee').value) || 0;
                document.getElementById('investCurrentValue').value = (price * qty).toFixed(2);
                if (!document.getElementById('investTotalCost').value) {
                    document.getElementById('investTotalCost').value = (price * qty + fee).toFixed(2);
                }
            }
        }
    },
    async save() {
        const body = {
            investment_type_id: parseInt(document.getElementById('investType').value),
            name: document.getElementById('investName').value,
            code: document.getElementById('investCode').value,
            account_id: parseInt(document.getElementById('investAccount').value),
            buy_price: parseFloat(document.getElementById('investBuyPrice').value),
            current_price: parseFloat(document.getElementById('investCurrentPrice').value),
            quantity: parseFloat(document.getElementById('investQuantity').value),
            total_cost: parseFloat(document.getElementById('investTotalCost').value),
            current_value: parseFloat(document.getElementById('investCurrentValue').value),
            fee: parseFloat(document.getElementById('investFee').value) || 0,
            buy_date: document.getElementById('investBuyDate').value,
            expected_rate: parseFloat(document.getElementById('investExpectedRate').value) || 0,
            note: document.getElementById('investNote').value
        };
        if (!body.name) { showToast('请输入产品名称', 'error'); return; }
        const editId = this.editId;
        if (editId) {
            await api(`/investments/${editId}`, 'PUT', body);
            showToast('持仓已更新', 'success');
        } else {
            await api('/investments', 'POST', body);
            showToast('持仓已添加', 'success');
        }
        this.closeModal();
        await this.refresh();
    },
    async delete(id) {
        try {
            await api(`/investments/${id}`, 'DELETE');
            showToast('持仓已删除', 'warning');
            await this.refresh();
        } catch (err) {
            // api() 已显示错误 toast
        }
    },
    // 加仓/减仓弹窗
    openReduceModal(id) {
        this.reduceId = id;
        const data = cache.investments;
        const inv = data && data.find(i => i.id === id);
        if (!inv) { showToast('持仓不存在', 'error'); return; }
        document.getElementById('reduceInvestId').value = id;
        document.getElementById('reduceModalTitle').textContent = `💰 加仓/减仓 · ${inv.name}`;
        document.getElementById('reduceMeta').innerHTML = `当前持有 <b>${inv.quantity}</b>，市值 ${fmt(inv.current_value)}`;
        // 默认选中减仓
        const sellRadio = document.querySelector('input[name="reduceAction"][value="sell"]');
        if (sellRadio) sellRadio.checked = true;
        this.updateReduceUI('sell');
        document.getElementById('reduceSellPrice').value = inv.current_price || inv.buy_price || '';
        document.getElementById('reduceQuantity').value = inv.quantity || '';
        document.getElementById('reduceFee').value = '0';
        document.getElementById('reduceDate').value = fmtDate();
        document.getElementById('reduceNote').value = '';
        document.getElementById('reduceModal').classList.add('show');
    },
    // 更新加仓/减仓 UI
    updateReduceUI(action) {
        const priceLabel = document.getElementById('reducePriceLabel');
        const qtyLabel = document.getElementById('reduceQtyLabel');
        const submitBtn = document.getElementById('reduceSubmitBtn');
        if (action === 'buy') {
            if (priceLabel) priceLabel.textContent = '买入单价 (¥)';
            if (qtyLabel) qtyLabel.textContent = '买入数量';
            if (submitBtn) submitBtn.textContent = '确认加仓';
        } else {
            if (priceLabel) priceLabel.textContent = '卖出单价 (¥)';
            if (qtyLabel) qtyLabel.textContent = '卖出数量';
            if (submitBtn) submitBtn.textContent = '确认卖出';
        }
        // 更新 radio 样式
        document.querySelectorAll('.radio-label').forEach(el => {
            const isActive = el.dataset.action === action;
            el.style.background = isActive ? 'var(--accent-500)' : 'var(--surface-card)';
            el.style.color = isActive ? '#fff' : 'var(--text-primary)';
            el.style.borderColor = isActive ? 'var(--accent-500)' : 'var(--border)';
        });
    },
    closeReduceModal() {
        document.getElementById('reduceModal').classList.remove('show');
        this.reduceId = null;
    },
    async reduce() {
        const id = this.reduceId;
        if (!id) return;
        const action = document.querySelector('input[name="reduceAction"]:checked')?.value || 'sell';
        const body = {
            action,
            price: parseFloat(document.getElementById('reduceSellPrice').value),
            quantity: parseFloat(document.getElementById('reduceQuantity').value),
            fee: parseFloat(document.getElementById('reduceFee').value) || 0,
            date: document.getElementById('reduceDate').value,
            note: document.getElementById('reduceNote').value
        };
        if (!body.price || !body.quantity) { showToast('请填写成交单价和数量', 'error'); return; }
        try {
            const result = await api(`/investments/${id}/reduce`, 'POST', body);
            showToast(result?.message || (action === 'buy' ? '加仓成功' : '卖出成功'), 'success');
            this.closeReduceModal();
            await this.refresh();
        } catch (err) {
            // api() 已在 catch 中显示错误 toast，这里无需重复
        }
    },
    // 单条刷新行情
    async refreshQuote(id, btn) {
        if (btn) { btn.disabled = true; btn.textContent = '⏳'; }
        try {
            await api(`/investments/${id}/refresh`, 'POST');
            showToast('行情已更新', 'success');
            await this.refresh();
        } catch (err) {
            // api() 已显示错误 toast
        }
        if (btn) { btn.disabled = false; btn.textContent = '🔄'; }
    },
    // 一键刷新全部
    async refreshAllQuotes() {
        const btn = document.getElementById('refreshAllBtn');
        btn.disabled = true;
        btn.innerHTML = '<span class="spin">⏳</span> 刷新中...';
        try {
            const result = await api('/investments/refresh-all', 'POST');
            showToast(result?.message || `已更新 ${result?.updated || 0} 个持仓`, 'success');
            await this.refresh();
        } catch (err) {
            // api() 已显示错误 toast
        }
        btn.disabled = false;
        btn.innerHTML = '🔄 一键刷新';
    },
    // 进入页面自动刷新行情
    async autoRefreshQuotes() {
        const lastRefresh = sessionStorage.getItem('inv_last_refresh');
        const now = Date.now();
        // 5分钟内不重复刷新
        if (lastRefresh && now - parseInt(lastRefresh) < 300000) return;
        sessionStorage.setItem('inv_last_refresh', String(now));
        await this.refreshAllQuotes();
    },
    async refresh() {
        this.init();  // 如果 init 之前被 null-guard 跳过，在 refresh 时补上
        const container = document.getElementById('investList');
        showSkeleton(container, 4, 'grid');
        const data = await api('/investments/investments');
        if (!data) return;   // data = { investments: [...], summary: {...}, byType: [...] }
        cache.investments = data.investments || [];
        const s = data.summary;
        document.getElementById('invTotalCost').textContent = fmt(s.totalCost);
        document.getElementById('invTotalValue').textContent = fmt(s.totalValue);
        document.getElementById('invTotalProfit').textContent = fmt(s.totalProfit);
        document.getElementById('invTotalProfit').className = `inv-value ${s.totalProfit >= 0 ? 'profit-positive' : 'profit-negative'}`;
        document.getElementById('invTotalRate').textContent = s.totalProfitRate.toFixed(2) + '%';
        // 进阶指标：组合年化 / 持仓集中度 / 预期年化
        const annEl = document.getElementById('invAnnualized');
        if (annEl) { annEl.textContent = (s.annualizedRate ?? 0).toFixed(2) + '%'; annEl.className = `inv-value ${(s.annualizedRate ?? 0) >= 0 ? 'profit-positive' : 'profit-negative'}`; }
        const conEl = document.getElementById('invConcentration');
        if (conEl) conEl.textContent = (s.concentration ?? 0).toFixed(1) + '%';
        const expEl = document.getElementById('invExpectedRate');
        if (expEl) expEl.textContent = (s.expectedRateAvg ?? 0).toFixed(2) + '%';

        // 持仓列表（与储蓄目标/债务卡片保持一致的大卡样式）
        if (!data.investments || data.investments.length === 0) { showEmpty(container, '还没有理财持仓，点击「新增持仓」记录你的投资', '📈'); return; }
        const riskLabels = { low: '低风险', medium: '中风险', high: '高风险', very_high: '高风险' };
        container.innerHTML = data.investments.map(i => {
            const progress = i.total_cost > 0 ? Math.min(100, (i.current_value / i.total_cost) * 100) : 0;
            const profitCls = i.profit_rate >= 0 ? 'profit-positive' : 'profit-negative';
            const profitSign = i.profit_rate >= 0 ? '+' : '';
            const annualSign = i.annualizedRate >= 0 ? '+' : '';
            return `
            <div class="goal-card" data-id="${i.id}">
                <div class="goal-head">
                    <div class="goal-icon">${i.type_icon}</div>
                    <div class="goal-title">${escapeHtml(i.name)}${i.code ? ' <span class="goal-sub">(' + escapeHtml(i.code) + ')</span>' : ''}</div>
                    <span class="goal-status type">${riskLabels[i.risk_level] || i.risk_level}</span>
                </div>
                <div class="goal-amounts"><span>投入 <strong>${fmt(i.total_cost)}</strong></span><span>市值 <strong>${fmt(i.current_value)}</strong></span></div>
                <div class="goal-progress"><div class="goal-progress-fill ${i.profit < 0 ? 'danger' : ''}" style="width:${progress}%"></div></div>
                <div class="goal-amounts"><span class="goal-pct ${profitCls}">${profitSign}${i.profit_rate.toFixed(2)}%</span><span>年化 ${annualSign}${i.annualizedRate.toFixed(2)}%</span></div>
                <div class="goal-actions">
                    <button class="btn btn-ghost" data-action="refresh-quote" data-id="${i.id}" title="刷新行情">🔄</button>
                    <button class="btn btn-ghost" data-action="edit-inv" data-id="${i.id}" title="编辑">✏️</button>
                    <button class="btn btn-ghost" data-action="reduce-inv" data-id="${i.id}" title="加仓/减仓">💰</button>
                    <button class="btn btn-ghost" data-action="delete-inv" data-id="${i.id}" title="删除">🗑️</button>
                </div>
            </div>`;
        }).join('');

        // 事件委托：刷新、编辑、减持和删除按钮
        container.querySelectorAll('[data-action="refresh-quote"]').forEach(btn => {
            btn.addEventListener('click', () => this.refreshQuote(parseInt(btn.dataset.id), btn));
        });
        container.querySelectorAll('[data-action="edit-inv"]').forEach(btn => {
            btn.addEventListener('click', () => this.edit(parseInt(btn.dataset.id)));
        });
        container.querySelectorAll('[data-action="reduce-inv"]').forEach(btn => {
            btn.addEventListener('click', () => this.openReduceModal(parseInt(btn.dataset.id)));
        });
        container.querySelectorAll('[data-action="delete-inv"]').forEach(btn => {
            btn.addEventListener('click', () => this.delete(parseInt(btn.dataset.id)));
        });

        // 资产配置饼图
        await ChartManager.renderInvestPie(data.byType);

        // 市值趋势折线图 + 类型对比柱状图
        const trendData = await api('/stats/investments');
        if (trendData) {
            await ChartManager.renderInvTrend(trendData.trendSeries);
            await ChartManager.renderInvTypeBar(trendData.byType);
        }
    }
};

export default InvestmentManager;
