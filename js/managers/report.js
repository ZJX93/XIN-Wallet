// ============================================================
// ReportManager —— 财务报表模块
// ------------------------------------------------------------
// 拆分来源：C:\Users\XIN\WorkBuddy\XIN-Wallet\js\app.js
// 原始位置：第 3016 行 ~ 第 3719 行（共 704 行）
// 拆分日期：2026-07-22
// 拆分原因：将单体 app.js 按职责拆分为 ES Module，便于按需加载与维护
// 依赖（运行时全局）：api、escapeHtml、fmt、fmtDateTime、showToast、
//                    showEmpty、showSkeleton、ChartManager、API、
//                    initCache、DashboardManager、DOM 元素
//                    （reportType、reportPeriod、reportContent、importFullInput 等）

const ReportManager = {
    charts: {},
    currentData: null,
    init() {
        const el = document.getElementById('reportType');
        if (!el) return;  // 报表页面通过 PageLoader 惰加载
        document.getElementById('generateReportBtn').addEventListener('click', () => this.generate());
        document.getElementById('printReportBtn').addEventListener('click', () => this.print());
        document.getElementById('reportType').addEventListener('change', () => this.populatePeriods());
        document.getElementById('exportFullBtn').addEventListener('click', () => this.exportFull());
        document.getElementById('importFullBtn').addEventListener('click', () => document.getElementById('importFullInput').click());
        document.getElementById('importFullInput').addEventListener('change', (e) => this.importFull(e.target.files[0]));

        // 事件委托：.bs-detail-card 内部的「关闭」按钮（替代原内联 onclick）
        // 通过给按钮打 .js-bs-close 标记，由这里统一处理
        const reportContent = document.getElementById('reportContent');
        if (reportContent && !reportContent._bsCloseDelegated) {
            reportContent.addEventListener('click', (e) => {
                const btn = e.target.closest('.js-bs-close');
                if (btn) {
                    const card = btn.closest('.bs-detail-card');
                    if (card) card.remove();
                }
            });
            reportContent._bsCloseDelegated = true;
        }
    },
    refresh() { return this.generate(); },
    populatePeriods() {
        const type = document.getElementById('reportType').value;
        const sel = document.getElementById('reportPeriod');
        sel.innerHTML = '';
        const now = new Date();
        if (type === 'monthly') {
            for (let m = 0; m < 12; m++) {
                const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
                const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                sel.innerHTML += `<option value="${val}">${val}</option>`;
            }
        } else if (type === 'quarterly') {
            const y = now.getFullYear();
            for (let q = 1; q <= 4; q++) sel.innerHTML += `<option value="${y}-Q${q}">${y}年 Q${q}</option>`;
            // 上一年季度
            const py = y - 1;
            for (let q = 1; q <= 4; q++) sel.innerHTML += `<option value="${py}-Q${q}">${py}年 Q${q}</option>`;
        } else {
            for (let y = now.getFullYear(); y >= now.getFullYear() - 3; y--) sel.innerHTML += `<option value="${y}">${y}年</option>`;
        }
    },
    async generate() {
        const type = document.getElementById('reportType').value;
        const period = document.getElementById('reportPeriod').value;
        const container = document.getElementById('reportContent');
        showSkeleton(container, 6, 'grid');
        const data = await api(`/reports?type=${type}&period=${period}`);
        if (!data) { showEmpty(container, '暂无数据', '📊'); return; }
        this.currentData = data;
        this.render(data);
    },
    destroyCharts() {
        Object.keys(this.charts).forEach(id => { if (this.charts[id]) { this.charts[id].destroy(); delete this.charts[id]; } });
    },
    render(data) {
        const container = document.getElementById('reportContent');
        this.destroyCharts();
        container.innerHTML = `
            <div class="report-header">
                <h2 class="report-title">📊 ${data.label} 财务报告</h2>
                <span class="report-date">${data.start} ~ ${data.end}</span>
            </div>
            <div class="report-grid">
                ${this.renderKPIs(data)}
                ${this.renderCompare(data)}
                ${this.renderAssets(data)}
            </div>
            ${this.renderRatios(data)}
            ${this.renderBalanceSheet(data)}
            ${this.renderCashFlow(data)}
            ${this.renderCharts(data)}
            <div class="report-sections">
                ${this.renderCategorySection(data)}
                ${this.renderTopExpenses(data)}
                ${this.renderAccountFlows(data)}
                ${this.renderBudgetExecution(data)}
                ${this.renderDebtSection(data)}
            </div>
        `;
        this.initCharts(data);
        this.initInteractions();
    },
    renderKPIs(data) {
        const s = data.summary;
        return `
            <div class="report-kpi-card income">
                <div class="report-kpi-label">总收入</div>
                <div class="report-kpi-value">${fmt(s.income)}</div>
                <div class="report-kpi-sub">${s.transactionCount} 笔交易</div>
            </div>
            <div class="report-kpi-card expense">
                <div class="report-kpi-label">总支出</div>
                <div class="report-kpi-value">${fmt(s.expense)}</div>
                <div class="report-kpi-sub">日均 ${fmt(s.avgDailyExpense)}</div>
            </div>
            <div class="report-kpi-card balance">
                <div class="report-kpi-label">净结余</div>
                <div class="report-kpi-value">${fmt(s.balance)}</div>
                <div class="report-kpi-sub">储蓄率 ${s.savingsRate.toFixed(1)}%</div>
            </div>
            <div class="report-kpi-card rate">
                <div class="report-kpi-label">储蓄率</div>
                <div class="report-kpi-value">${s.savingsRate.toFixed(1)}%</div>
                <div class="report-kpi-sub">${s.balance >= 0 ? '收支健康' : '支出超收入'}</div>
            </div>
        `;
    },
    renderCompare(data) {
        if (!data.compare) return '';
        const c = data.compare, s = data.summary;
        const incDiff = s.income - c.income;
        const expDiff = s.expense - c.expense;
        const balDiff = s.balance - c.balance;
        return `
            <div class="report-compare-card">
                <div class="report-section-title">📈 环比上期（${c.label}）</div>
                <div class="report-compare-grid">
                    <div class="report-compare-row">
                        <span class="report-compare-label">收入</span>
                        <span class="report-compare-value">${fmt(c.income)}</span>
                        <span class="report-compare-diff ${incDiff >= 0 ? 'up' : 'down'}">${incDiff >= 0 ? '↑' : '↓'} ${fmt(Math.abs(incDiff))}</span>
                    </div>
                    <div class="report-compare-row">
                        <span class="report-compare-label">支出</span>
                        <span class="report-compare-value">${fmt(c.expense)}</span>
                        <span class="report-compare-diff ${expDiff <= 0 ? 'up' : 'down'}">${expDiff <= 0 ? '↓' : '↑'} ${fmt(Math.abs(expDiff))}</span>
                    </div>
                    <div class="report-compare-row">
                        <span class="report-compare-label">结余</span>
                        <span class="report-compare-value">${fmt(c.balance)}</span>
                        <span class="report-compare-diff ${balDiff >= 0 ? 'up' : 'down'}">${balDiff >= 0 ? '↑' : '↓'} ${fmt(Math.abs(balDiff))}</span>
                    </div>
                </div>
            </div>
        `;
    },
    renderAssets(data) {
        const a = data.assets;
        return `
            <div class="report-assets-card">
                <div class="report-section-title">💰 资产快照</div>
                <div class="report-assets-value">${fmt(a.totalAssets)}</div>
                <div class="report-assets-sub">账户 ${fmt(a.accounts)} · 理财 ${fmt(a.investments)}</div>
            </div>
        `;
    },
    renderCharts(data) {
        return `
            <div class="report-charts-row">
                <div class="glass-card report-chart-card">
                    <h3 class="card-title">收支趋势</h3>
                    <canvas id="reportTrendChart"></canvas>
                </div>
                <div class="glass-card report-chart-card">
                    <h3 class="card-title">支出类别占比</h3>
                    <canvas id="reportExpPieChart"></canvas>
                </div>
            </div>
            <div class="report-charts-row">
                <div class="glass-card report-chart-card">
                    <h3 class="card-title">收入来源占比</h3>
                    <canvas id="reportIncPieChart"></canvas>
                </div>
                <div class="glass-card report-chart-card">
                    <h3 class="card-title">账户资金流向</h3>
                    <canvas id="reportAccountChart"></canvas>
                </div>
            </div>
        `;
    },
    renderCategorySection(data) {
        const expTotal = data.summary.expense;
        const incTotal = data.summary.income;
        const expRows = data.expenseByCategory.map((e, i) => `
            <tr>
                <td><span class="report-cat-rank">${i + 1}</span> ${e.icon} ${escapeHtml(e.name)}</td>
                <td class="report-amount">${fmt(e.total)}</td>
                <td>
                    <div class="report-progress-wrap">
                        <div class="report-progress"><div class="report-progress-bar" style="width:${expTotal > 0 ? Math.min(100, e.total / expTotal * 100) : 0}%"></div></div>
                        <span class="report-progress-text">${expTotal > 0 ? (e.total / expTotal * 100).toFixed(1) : 0}%</span>
                    </div>
                </td>
            </tr>
        `).join('') || '<tr><td colspan="3" class="report-empty">暂无支出数据</td></tr>';
        const incRows = data.incomeByCategory.map((e, i) => `
            <tr>
                <td><span class="report-cat-rank">${i + 1}</span> ${e.icon} ${escapeHtml(e.name)}</td>
                <td class="report-amount">${fmt(e.total)}</td>
                <td>
                    <div class="report-progress-wrap">
                        <div class="report-progress"><div class="report-progress-bar income" style="width:${incTotal > 0 ? Math.min(100, e.total / incTotal * 100) : 0}%"></div></div>
                        <span class="report-progress-text">${incTotal > 0 ? (e.total / incTotal * 100).toFixed(1) : 0}%</span>
                    </div>
                </td>
            </tr>
        `).join('') || '<tr><td colspan="3" class="report-empty">暂无收入数据</td></tr>';
        return `
            <div class="report-section">
                <h3 class="report-section-title">📋 收支类别明细</h3>
                <div class="report-tables-row">
                    <div class="glass-card report-table-card">
                        <h4 class="report-table-title">支出类别 TOP</h4>
                        <table class="report-table">
                            <thead><tr><th>类别</th><th>金额</th><th>占比</th></tr></thead>
                            <tbody>${expRows}</tbody>
                        </table>
                    </div>
                    <div class="glass-card report-table-card">
                        <h4 class="report-table-title">收入类别 TOP</h4>
                        <table class="report-table">
                            <thead><tr><th>类别</th><th>金额</th><th>占比</th></tr></thead>
                            <tbody>${incRows}</tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    },
    renderTopExpenses(data) {
        if (!data.topExpenses || data.topExpenses.length === 0) return '';
        const items = data.topExpenses.map((t, i) => `
            <div class="report-top-item">
                <div class="report-top-rank">${i + 1}</div>
                <div class="report-top-info">
                    <div class="report-top-name">${t.category_icon} ${escapeHtml(t.category_name)} · ${escapeHtml(t.note || '无备注')}</div>
                    <div class="report-top-meta">${String(t.date).slice(0, 10)}</div>
                </div>
                <div class="report-top-amount">${fmt(t.amount)}</div>
            </div>
        `).join('');
        return `
            <div class="report-section">
                <h3 class="report-section-title">🔥 支出 TOP 5</h3>
                <div class="glass-card report-top-list">${items}</div>
            </div>
        `;
    },
    renderAccountFlows(data) {
        if (!data.accountFlows || data.accountFlows.length === 0) return '';
        const rows = data.accountFlows.map(a => `
            <div class="report-account-flow-row">
                <div class="report-account-flow-name">${a.icon} ${escapeHtml(a.name)}</div>
                <div class="report-account-flow-value ${a.net >= 0 ? 'income' : 'expense'}">${a.net >= 0 ? '+' : ''}${fmt(a.net)}</div>
            </div>
        `).join('');
        return `
            <div class="report-section">
                <h3 class="report-section-title">🏦 账户资金流向</h3>
                <div class="glass-card report-account-flows">${rows}</div>
            </div>
        `;
    },
    renderBudgetExecution(data) {
        if (!data.budgetExecution || data.budgetExecution.length === 0) return '';
        const items = data.budgetExecution.map(b => {
            const over = b.actual > b.budget;
            return `
                <div class="report-budget-item">
                    <div class="report-budget-header">
                        <span class="report-budget-name">${b.icon} ${escapeHtml(b.name)}</span>
                        <span class="report-budget-amount ${over ? 'over' : ''}">${fmt(b.actual)} / ${fmt(b.budget)}</span>
                    </div>
                    <div class="report-progress-wrap">
                        <div class="report-progress"><div class="report-progress-bar ${over ? 'over' : ''}" style="width:${Math.min(100, b.usage)}%"></div></div>
                        <span class="report-progress-text">${b.usage.toFixed(1)}%</span>
                    </div>
                </div>
            `;
        }).join('');
        return `
            <div class="report-section">
                <h3 class="report-section-title">🎯 预算执行情况</h3>
                <div class="glass-card report-budget-list">${items}</div>
            </div>
        `;
    },
    renderDebtSection(data) {
        const d = data.debts;
        if (!d) return '';
        if (d.count === 0) {
            return `
                <div class="report-section">
                    <h3 class="report-section-title">💳 债务情况</h3>
                    <div class="glass-card report-budget-list"><div class="empty-hint"><div class="empty-icon">💳</div><p>本周期无活跃债务</p></div></div>
                </div>
            `;
        }
        const overdueTag = d.overdue > 0 ? `<span style="color:#ef4444;font-weight:bold;">⚠️ 逾期 ${d.overdue} 笔</span>` : '';
        const headerKpi = `
            <div class="report-compare-grid">
                <div class="report-compare-row">
                    <span class="report-compare-label">总负债</span>
                    <span class="report-compare-value">${fmt(d.totalRemaining)}</span>
                </div>
                <div class="report-compare-row">
                    <span class="report-compare-label">本期已还款</span>
                    <span class="report-compare-value">${fmt(d.paidInPeriod || 0)}</span>
                </div>
                <div class="report-compare-row">
                    <span class="report-compare-label">本期还款笔数</span>
                    <span class="report-compare-value">${d.repaymentCount || 0} 笔</span>
                </div>
                <div class="report-compare-row">
                    <span class="report-compare-label">总债务笔数</span>
                    <span class="report-compare-value">${d.count} 笔 · ${overdueTag}</span>
                </div>
            </div>
        `;
        const debtItems = (d.list || []).map(item => `
            <div class="report-budget-item">
                <div class="report-budget-header">
                    <span class="report-budget-name">${item.type === 'credit_card' ? '💳' : item.type === 'loan' ? '🏦' : '📝'} ${escapeHtml(item.name)} <span style="font-size:11px;color:var(--text-tertiary);margin-left:6px">${item.type === 'credit_card' ? '信用卡' : item.type === 'loan' ? '贷款' : item.type === 'personal' ? '个人借款' : '其他'}</span></span>
                    <span class="report-budget-amount">${fmt(item.remaining)} / ${fmt(item.principal)}</span>
                </div>
                <div class="report-progress-wrap">
                    <div class="report-progress"><div class="report-progress-bar" style="width:${item.principal > 0 ? Math.min(100, (item.principal - item.remaining) / item.principal * 100) : 0}%"></div></div>
                    <span class="report-progress-text">${item.principal > 0 ? ((item.principal - item.remaining) / item.principal * 100).toFixed(1) : 0}% 已还</span>
                </div>
                <div class="report-budget-header" style="margin-top:4px;">
                    <span style="font-size:11px;color:var(--text-tertiary);">本期还款 ${item.periodRepayments} 笔 · ${fmt(item.periodPaid)}</span>
                    <span style="font-size:11px;color:var(--text-tertiary);">月供 ${fmt(item.monthly_payment)}</span>
                </div>
            </div>
        `).join('');
        return `
            <div class="report-section">
                <h3 class="report-section-title">💳 债务情况${overdueTag}</h3>
                <div class="glass-card" style="margin-bottom:12px;">${headerKpi}</div>
                ${debtItems ? `<div class="glass-card report-budget-list">${debtItems}</div>` : ''}
                ${(d.repayments || []).length > 0 ? `
                    <div class="glass-card" style="margin-top:12px;">
                        <h4 class="report-table-title">本期还款流水</h4>
                        <table class="report-table">
                            <thead><tr><th>日期</th><th>债务</th><th>金额</th><th>本金</th><th>利息</th><th>备注</th></tr></thead>
                            <tbody>
                                ${d.repayments.map(r => `<tr>
                                    <td>${r.paid_at}</td>
                                    <td>${escapeHtml(r.debt_name || '')}</td>
                                    <td class="report-amount">${fmt(r.amount)}</td>
                                    <td>${fmt(r.principal_part || 0)}</td>
                                    <td>${fmt(r.interest_part || 0)}</td>
                                    <td>${escapeHtml(r.note || '')}</td>
                                </tr>`).join('')}
                            </tbody>
                        </table>
                    </div>
                ` : ''}
            </div>
        `;
    },
    renderRatios(data) {
        const r = data.ratios;
        if (!r) return '';
        const flag = (val, threshold, warn, ok, lowerIsBetter = true) => {
            const bad = lowerIsBetter ? val > threshold : val < threshold;
            return `<span class="ratio-flag ${bad ? 'bad' : 'good'}">${bad ? warn : ok}</span>`;
        };
        return `
            <div class="report-section">
                <h3 class="report-section-title">📊 关键财务比率</h3>
                <div class="glass-card ratio-grid">
                    <div class="ratio-item">
                        <div class="ratio-label">储蓄率 ${flag(r.savingsRate, 30, '偏低', '健康')}</div>
                        <div class="ratio-value">${r.savingsRate.toFixed(1)}%</div>
                        <div class="ratio-bar"><div class="ratio-bar-fill" style="width:${Math.min(100, r.savingsRate)}%"></div></div>
                    </div>
                    <div class="ratio-item">
                        <div class="ratio-label">负债率 ${flag(r.debtRatio, 50, '警戒', '健康')}</div>
                        <div class="ratio-value">${r.debtRatio.toFixed(1)}%</div>
                        <div class="ratio-bar"><div class="ratio-bar-fill warn" style="width:${Math.min(100, r.debtRatio)}%"></div></div>
                    </div>
                    <div class="ratio-item">
                        <div class="ratio-label">还款收入比 ${flag(r.debtPaymentRatio, 40, '过高', '可控')}</div>
                        <div class="ratio-value">${r.debtPaymentRatio.toFixed(1)}%</div>
                        <div class="ratio-bar"><div class="ratio-bar-fill warn" style="width:${Math.min(100, r.debtPaymentRatio)}%"></div></div>
                    </div>
                    <div class="ratio-item">
                        <div class="ratio-label">资产负债率 ${flag(r.assetLiabilityRatio, 50, '警戒', '健康')}</div>
                        <div class="ratio-value">${r.assetLiabilityRatio.toFixed(1)}%</div>
                        <div class="ratio-bar"><div class="ratio-bar-fill warn" style="width:${Math.min(100, r.assetLiabilityRatio)}%"></div></div>
                    </div>
                </div>
            </div>
        `;
    },
    renderBalanceSheet(data) {
        const bs = data.balanceSheet;
        if (!bs) return '';
        const changeColor = bs.change >= 0 ? 'income' : 'expense';
        const changeArrow = bs.change >= 0 ? '↑' : '↓';
        return `
            <div class="report-section">
                <h3 class="report-section-title">🏛️ 资产负债表（${bs.period.end} 快照）</h3>
                <div class="balance-sheet">
                    <!-- 资产 -->
                    <div class="bs-side">
                        <div class="bs-side-header bs-asset-header">资产</div>
                        <div class="bs-section">
                            <div class="bs-section-title">流动资产 <span class="bs-total">${fmt(bs.assets.current.total)}</span></div>
                            ${bs.assets.current.items.length === 0 ? '<div class="bs-empty">无账户</div>' :
                              bs.assets.current.items.map(a => `
                                <div class="bs-row clickable" data-account-id="${a.id || ''}">
                                    <span>${escapeHtml(a.name)}</span>
                                    <span>${fmt(a.balance)}</span>
                                </div>
                              `).join('')}
                        </div>
                        <div class="bs-section">
                            <div class="bs-section-title">投资资产 <span class="bs-total">${fmt(bs.assets.investment.total)}</span></div>
                            ${bs.assets.investment.items.length === 0 ? '<div class="bs-empty">无投资</div>' :
                              bs.assets.investment.items.map(i => `
                                <div class="bs-row">
                                    <span>${escapeHtml(i.name)}</span>
                                    <span>${fmt(i.current_value)}</span>
                                </div>
                              `).join('')}
                        </div>
                        <div class="bs-row bs-total-row">
                            <span><strong>资产合计</strong></span>
                            <span><strong>${fmt(bs.assets.total)}</strong></span>
                        </div>
                        <div class="bs-row bs-meta">
                            <span>期初</span>
                            <span>${fmt(bs.assets.opening)}</span>
                        </div>
                    </div>
                    <!-- 负债+净资产 -->
                    <div class="bs-side">
                        <div class="bs-side-header bs-liab-header">负债 + 净资产</div>
                        <div class="bs-section">
                            <div class="bs-section-title">短期负债 <span class="bs-total">${fmt(bs.liabilities.shortTerm.total)}</span></div>
                            ${bs.liabilities.shortTerm.items.length === 0 ? '<div class="bs-empty">无短期负债</div>' :
                              bs.liabilities.shortTerm.items.map(d => `
                                <div class="bs-row clickable" data-debt-id="${d.id}">
                                    <span>${escapeHtml(d.name)}</span>
                                    <span>${fmt(d.remaining)}</span>
                                </div>
                              `).join('')}
                        </div>
                        <div class="bs-section">
                            <div class="bs-section-title">信用卡 <span class="bs-total">${fmt(bs.liabilities.creditCard.total)}</span></div>
                            <div class="bs-meta-line">${bs.liabilities.creditCard.note || ''}</div>
                        </div>
                        <div class="bs-section">
                            <div class="bs-section-title">长期负债 <span class="bs-total">${fmt(bs.liabilities.longTerm.total)}</span></div>
                            ${bs.liabilities.longTerm.items.length === 0 ? '<div class="bs-empty">无长期负债</div>' :
                              bs.liabilities.longTerm.items.map(d => `
                                <div class="bs-row clickable" data-debt-id="${d.id}">
                                    <span>${escapeHtml(d.name)} <span class="bs-meta-inline">${d.term_months || 0}月</span></span>
                                    <span>${fmt(d.remaining)}</span>
                                </div>
                              `).join('')}
                        </div>
                        <div class="bs-row bs-total-row">
                            <span><strong>负债合计</strong></span>
                            <span><strong>${fmt(bs.liabilities.total)}</strong></span>
                        </div>
                        <div class="bs-row bs-net-worth-row">
                            <span><strong>净资产 = 资产 - 负债</strong></span>
                            <span><strong>${fmt(bs.netWorth)}</strong></span>
                        </div>
                        <div class="bs-row bs-meta">
                            <span>期初净资产</span>
                            <span>${fmt(bs.openingNetWorth)}</span>
                        </div>
                        <div class="bs-row bs-meta">
                            <span>本期变化</span>
                            <span class="${changeColor}">${changeArrow} ${fmt(Math.abs(bs.change))}</span>
                        </div>
                    </div>
                </div>
                <div id="bsDetailContainer"></div>
            </div>
        `;
    },
    renderCashFlow(data) {
        const cf = data.cashFlow;
        if (!cf) return '';
        const flowRow = (label, inflow, outflow, net, color) => `
            <div class="cf-row">
                <div class="cf-label">${label}</div>
                <div class="cf-flows">
                    <span class="cf-inflow">+${fmt(inflow)}</span>
                    <span class="cf-outflow">-${fmt(outflow)}</span>
                </div>
                <div class="cf-net ${color}">${net >= 0 ? '+' : ''}${fmt(net)}</div>
            </div>
        `;
        const totalColor = cf.netChange >= 0 ? 'income' : 'expense';
        return `
            <div class="report-section">
                <h3 class="report-section-title">💧 现金流量表</h3>
                <div class="glass-card">
                    <div class="cf-header">
                        <span></span>
                        <span class="cf-header-inflow">流入</span>
                        <span class="cf-header-outflow">流出</span>
                        <span class="cf-header-net">净额</span>
                    </div>
                    ${flowRow('🏢 经营活动（日常收支）', cf.operating.inflow, cf.operating.outflow, cf.operating.net, cf.operating.net >= 0 ? 'income' : 'expense')}
                    ${flowRow('📈 投资活动', cf.investing.inflow, cf.investing.outflow, cf.investing.net, cf.investing.net >= 0 ? 'income' : 'expense')}
                    ${flowRow('🏦 筹资活动（借还款）', cf.financing.inflow, cf.financing.outflow, cf.financing.net, cf.financing.net >= 0 ? 'income' : 'expense')}
                    <div class="cf-row cf-total">
                        <div class="cf-label"><strong>本期现金净变化</strong></div>
                        <div class="cf-flows"></div>
                        <div class="cf-net ${totalColor}"><strong>${cf.netChange >= 0 ? '+' : ''}${fmt(cf.netChange)}</strong></div>
                    </div>
                    <div class="cf-note">${cf.note || ''}</div>
                </div>
            </div>
        `;
    },
    initInteractions() {
        // 债务行点击：展开还款明细
        const container = document.getElementById('reportContent');
        if (!container) return;
        container.addEventListener('click', async (e) => {
            const debtRow = e.target.closest('.bs-row.clickable[data-debt-id]');
            const accountRow = e.target.closest('.bs-row.clickable[data-account-id]');
            if (debtRow) {
                await this.toggleDebtDetail(debtRow.dataset.debtId);
            } else if (accountRow && accountRow.dataset.accountId) {
                await this.toggleAccountDetail(accountRow.dataset.accountId);
            }
        });
    },
    async toggleDebtDetail(debtId) {
        const target = document.getElementById('bsDetailContainer');
        const existing = target.querySelector(`[data-detail-debt="${debtId}"]`);
        if (existing) { existing.remove(); return; }
        // 收起其他展开项
        target.innerHTML = '';
        const data = await api(`/debts/${debtId}`);
        if (!data || !data.debt) return;
        const d = data.debt;
        const reps = data.repayments || [];
        const totalPaid = reps.reduce((s, r) => s + parseFloat(r.amount || 0), 0);
        const rows = reps.slice(0, 20).map(r => `
            <tr>
                <td>${r.paid_at}</td>
                <td class="report-amount">${fmt(r.amount)}</td>
                <td>${fmt(r.principal_part || 0)}</td>
                <td>${fmt(r.interest_part || 0)}</td>
                <td>${escapeHtml(r.note || '')}</td>
            </tr>
        `).join('');
        target.innerHTML = `
            <div class="bs-detail-card" data-detail-debt="${debtId}">
                <div class="bs-detail-header">
                    <h4>📋 ${escapeHtml(d.name)} 还款明细 <span class="bs-meta-inline">${reps.length} 笔记录</span></h4>
                    <button class="btn-close js-bs-close" aria-label="关闭">✕</button>
                </div>
                <div class="bs-detail-stats">
                    <div><span class="stat-label">本金</span><span>${fmt(d.principal)}</span></div>
                    <div><span class="stat-label">剩余</span><span>${fmt(d.remaining)}</span></div>
                    <div><span class="stat-label">月供</span><span>${fmt(d.monthly_payment)}</span></div>
                    <div><span class="stat-label">已还总额</span><span>${fmt(totalPaid)}</span></div>
                </div>
                ${rows ? `<table class="report-table"><thead><tr><th>日期</th><th>金额</th><th>本金</th><th>利息</th><th>备注</th></tr></thead><tbody>${rows}</tbody></table>` : '<div class="bs-empty">暂无还款记录</div>'}
            </div>
        `;
    },
    async toggleAccountDetail(accountId) {
        const target = document.getElementById('bsDetailContainer');
        const existing = target.querySelector(`[data-detail-account="${accountId}"]`);
        if (existing) { existing.remove(); return; }
        target.innerHTML = '';
        const data = await api(`/accounts/${accountId}/transactions?limit=10`);
        if (!data) return;
        const acc = data.account;
        const rows = (data.transactions || []).map(t => `
            <tr>
                <td>${t.date}</td>
                <td>${t.category_name || ''}</td>
                <td class="report-amount ${t.type === 'expense' ? 'expense' : 'income'}">${t.type === 'expense' ? '-' : '+'}${fmt(t.amount)}</td>
                <td>${escapeHtml(t.note || '')}</td>
            </tr>
        `).join('');
        target.innerHTML = `
            <div class="bs-detail-card" data-detail-account="${accountId}">
                <div class="bs-detail-header">
                    <h4>🏦 ${escapeHtml(acc.name)} 最近流水</h4>
                    <button class="btn-close js-bs-close" aria-label="关闭">✕</button>
                </div>
                ${rows ? `<table class="report-table"><thead><tr><th>日期</th><th>类别</th><th>金额</th><th>备注</th></tr></thead><tbody>${rows}</tbody></table>` : '<div class="bs-empty">暂无流水</div>'}
            </div>
        `;
    },
    initCharts(data) {
        const c = ChartManager.colors();
        // 收支趋势
        const trendCtx = document.getElementById('reportTrendChart');
        if (trendCtx && data.dailyTrend.length > 0) {
            const labels = data.dailyTrend.map(d => d.date.slice(5));
            this.charts.trend = new Chart(trendCtx, {
                type: 'line',
                data: {
                    labels,
                    datasets: [
                        { label: '收入', data: data.dailyTrend.map(d => d.income), borderColor: c.inc, backgroundColor: c.inc + '25', fill: true, tension: 0.4, pointRadius: 3 },
                        { label: '支出', data: data.dailyTrend.map(d => d.expense), borderColor: c.exp, backgroundColor: c.exp + '25', fill: true, tension: 0.4, pointRadius: 3 }
                    ]
                },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: c.text, usePointStyle: true, boxWidth: 8 } } }, scales: { x: { ticks: { color: c.text, font: { size: 10 } }, grid: { color: c.grid } }, y: { ticks: { color: c.text, font: { size: 10 } }, grid: { color: c.grid } } } }
            });
        }
        // 支出饼图
        const expPieCtx = document.getElementById('reportExpPieChart');
        if (expPieCtx && data.expenseByCategory.length > 0) {
            this.charts.expPie = new Chart(expPieCtx, {
                type: 'doughnut',
                data: { labels: data.expenseByCategory.map(e => e.icon + ' ' + e.name), datasets: [{ data: data.expenseByCategory.map(e => e.total), backgroundColor: data.expenseByCategory.map((_, i) => c.cats[i % c.cats.length]), borderWidth: 0 }] },
                options: { responsive: true, maintainAspectRatio: false, cutout: '55%', plugins: { legend: { position: 'right', labels: { color: c.text, font: { family: ChartManager.fontFamily(), size: 11 }, padding: 8, boxWidth: 12, usePointStyle: true } } } }
            });
        }
        // 收入饼图
        const incPieCtx = document.getElementById('reportIncPieChart');
        if (incPieCtx && data.incomeByCategory.length > 0) {
            this.charts.incPie = new Chart(incPieCtx, {
                type: 'doughnut',
                data: { labels: data.incomeByCategory.map(e => e.icon + ' ' + e.name), datasets: [{ data: data.incomeByCategory.map(e => e.total), backgroundColor: data.incomeByCategory.map((_, i) => c.cats[i % c.cats.length]), borderWidth: 0 }] },
                options: { responsive: true, maintainAspectRatio: false, cutout: '55%', plugins: { legend: { position: 'right', labels: { color: c.text, font: { family: ChartManager.fontFamily(), size: 11 }, padding: 8, boxWidth: 12, usePointStyle: true } } } }
            });
        }
        // 账户资金流向
        const accCtx = document.getElementById('reportAccountChart');
        if (accCtx && data.accountFlows.length > 0) {
            this.charts.accFlow = new Chart(accCtx, {
                type: 'bar',
                data: { labels: data.accountFlows.map(a => a.name), datasets: [{ label: '净流入', data: data.accountFlows.map(a => a.net), backgroundColor: data.accountFlows.map(a => a.net >= 0 ? c.inc + '90' : c.exp + '90'), borderRadius: 6 }] },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: c.text, font: { size: 10 } }, grid: { color: c.grid } }, y: { ticks: { color: c.text, font: { size: 10 } }, grid: { color: c.grid } } } }
            });
        }
    },
    async exportCSV() {
        if (!this.currentData) { showToast('请先生成报表', 'warning'); return; }
        const d = this.currentData;
        const period = d.period;
        const s = d.summary;
        let csv = '\uFEFF鑫钱包财务报告,\n';
        csv += `报表周期,${d.label},\n`;
        csv += `总收入,${s.income.toFixed(2)},\n`;
        csv += `总支出,${s.expense.toFixed(2)},\n`;
        csv += `净结余,${s.balance.toFixed(2)},\n`;
        csv += `储蓄率,${s.savingsRate.toFixed(2)}%,\n\n`;
        csv += '支出类别,金额,占比\n';
        d.expenseByCategory.forEach(e => { csv += `${e.name},${e.total.toFixed(2)},${d.summary.expense > 0 ? (e.total / d.summary.expense * 100).toFixed(2) : 0}%\n`; });
        csv += '\n收入类别,金额,占比\n';
        d.incomeByCategory.forEach(e => { csv += `${e.name},${e.total.toFixed(2)},${d.summary.income > 0 ? (e.total / d.summary.income * 100).toFixed(2) : 0}%\n`; });
        csv += '\n日期,收入,支出\n';
        d.dailyTrend.forEach(t => { csv += `${fmtDateTime(t.date)},${t.income.toFixed(2)},${t.expense.toFixed(2)}\n`; });
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `鑫钱包_财务报告_${period}.csv`; a.click();
        URL.revokeObjectURL(url);
        showToast('CSV 已导出', 'success');
    },
    async exportFull() {
        showToast('正在导出完整账本...', 'info');
        try {
            const res = await fetch(`${API}/export/full`, {
                headers: { 'Authorization': 'Bearer ' + localStorage.getItem('zhicai_token') }
            });
            if (!res.ok) throw new Error('导出失败');
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url;
            a.download = `鑫钱包_完整账本_${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
            URL.revokeObjectURL(url);
            showToast('完整账本已导出（含账户/交易/预算/理财/储蓄目标）', 'success');
        } catch (err) {
            showToast('导出失败: ' + err.message, 'error');
        }
    },

    async importFull(file) {
        if (!file) return;
        if (!confirm('导入将合并到当前账本（按名称匹配账户/分类），确认导入？')) {
            document.getElementById('importFullInput').value = ''; return;
        }
        showToast('正在导入...', 'info');
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            const token = localStorage.getItem('zhicai_token');
            const res = await fetch(`${API}/import/full`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                body: JSON.stringify(data)
            });
            const result = await res.json();
            if (!result.success) throw new Error(result.message || '导入失败');
            const imp = result.data.imported;
            showToast(`导入完成：账户${imp.accounts} 交易${imp.transactions} 预算${imp.budgets} 储蓄${imp.goals} 理财${imp.investments} 转账${imp.transfers}`, 'success');
            await initCache();
            await DashboardManager.refresh();
        } catch (err) {
            showToast('导入失败: ' + err.message, 'error');
        }
        document.getElementById('importFullInput').value = '';
    },

    print() {
        // 打印前：强制重绘所有 Chart.js 图表以适应新的容器尺寸
        Object.values(this.charts).forEach(c => { if (c && c.resize) c.resize(); });
        // 短暂延迟后打印（让浏览器布局完成）
        setTimeout(() => window.print(), 200);
    }
};

export default ReportManager;