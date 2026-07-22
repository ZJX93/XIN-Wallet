// ==========================================
// AnalysisManager — 消费分析
// 拆分自 C:\Users\XIN\WorkBuddy\XIN-Wallet\js\app.js
// 原始位置: 第 3724 行 — 第 3915 行 (const AnalysisManager = { ... };)
// ==========================================

const AnalysisManager = {
    // localStorage key 前缀：AI 生成结果持久化，刷新不丢失
    _LS_KEY_INSIGHTS: 'xin_ai_insights',
    _LS_KEY_ADVICE: 'xin_ai_advice',

    _loadInsights() { try { const v = localStorage.getItem(this._LS_KEY_INSIGHTS); return v ? JSON.parse(v) : null; } catch(e) { return null; } },
    _saveInsights(data) { try { localStorage.setItem(this._LS_KEY_INSIGHTS, JSON.stringify(data)); } catch(e) {} },
    _loadAdvice() { try { const v = localStorage.getItem(this._LS_KEY_ADVICE); return v ? JSON.parse(v) : null; } catch(e) { return null; } },
    _saveAdvice(data) { try { localStorage.setItem(this._LS_KEY_ADVICE, JSON.stringify(data)); } catch(e) {} },

    renderCachedInsights() {
        const items = this._loadInsights();
        if (!items || !items.length) return;
        const list = document.getElementById('insightList');
        if (!list) return;
        this._cachedInsights = items; // 同步内存缓存
        const lvLabel = { warning: '需重视', info: '关注', tip: '小建议' };
        const lvClass = { warning: 'lv-warning', info: 'lv-info', tip: 'lv-tip' };
        list.innerHTML = items.map(i => `<div class="insight-item ${lvClass[i.level] || ''}">
            <div class="insight-head"><span class="insight-title">🧠 ${escapeHtml(i.title || '洞察')}</span>${i.level ? `<span class="lv-badge ${lvClass[i.level]}">${lvLabel[i.level]}</span>` : ''}</div>
            <div class="insight-desc">${escapeHtml(i.description || '')}</div>
            ${i.action ? `<div class="insight-action">💡 ${escapeHtml(i.action)}</div>` : ''}
        </div>`).join('');
    },

    renderCachedAdvice() {
        const items = this._loadAdvice();
        if (!items || !items.length) return;
        const container = document.getElementById('aiAdviceList');
        if (!container) return;
        this._cachedAdvice = items;
        const prLabel = { high: '重要', medium: '中等', low: '可选' };
        const prClass = { high: 'pr-high', medium: 'pr-medium', low: 'pr-low' };
        container.innerHTML = items.map(a => `<div class="ai-advice-item ${prClass[a.priority] || ''}">
            <div class="advice-head"><span class="advice-type">💡 ${escapeHtml(a.title || '建议')}</span>${a.priority ? `<span class="pr-badge ${prClass[a.priority]}">${prLabel[a.priority]}</span>` : ''}</div>
            <div class="advice-content">${escapeHtml(a.content || '')}</div>
            ${a.impact ? `<div class="advice-impact">预期影响：${escapeHtml(a.impact)}</div>` : ''}
        </div>`).join('');
    },
    async refresh() {
        // 顶部月度概览
        await this.renderOverview();
        // 消费结构 + 异常检测
        const container = document.getElementById('analysisStructure');
        const anomalyList = document.getElementById('anomalyList');
        showSkeleton(container, 5, 'text');
        showSkeleton(anomalyList, 2, 'text');
        // 洞察和建议：从 localStorage 恢复 AI 生成结果（刷新不丢失）
        const hasAI = await AIRecognition.checkProvider();
        if (!hasAI) {
            AIRecognition.renderNoProvider('insightList');
            AIRecognition.renderNoProvider('aiAdviceList');
        } else {
            // 有 localStorage 缓存就渲染，没有才显示空态
            this._cachedInsights = this._loadInsights();
            if (this._cachedInsights) {
                this.renderCachedInsights();
            } else {
                showEmpty(document.getElementById('insightList'), '点击「生成洞察」获取 AI 消费分析', '🧠');
            }
            this._cachedAdvice = this._loadAdvice();
            if (this._cachedAdvice) {
                this.renderCachedAdvice();
            } else {
                showEmpty(document.getElementById('aiAdviceList'), '点击「生成建议」获取 AI 财务建议', '💡');
            }
        }

        const summary = await api(`/transactions/summary?month=${cache.currentMonth}`);
        if (!summary) return;

        // 消费结构
        container.className = '';
        const colors = ['#6366f1','#f43f5e','#10b981','#f59e0b','#3b82f6','#8b5cf6','#ec4899','#14b8a6'];
        container.innerHTML = summary.expenseByCategory.map((e, i) => `
            <div class="analysis-structure-item">
                <div class="analysis-structure-cat">${e.icon} ${escapeHtml(e.name)}</div>
                <div class="analysis-structure-bar"><div class="analysis-structure-fill" style="width:${summary.expense > 0 ? (e.total / summary.expense * 100).toFixed(1) : 0}%;background:${colors[i % colors.length]}"></div></div>
                <div class="analysis-structure-percent" style="color:${colors[i % colors.length]}">${summary.expense > 0 ? (e.total / summary.expense * 100).toFixed(1) : 0}%</div>
            </div>
        `).join('');

        // 异常检测
        const bigItems = summary.expenseByCategory.filter(e => e.total > summary.expense * 0.3);
        anomalyList.innerHTML = bigItems.length > 0 ?
            bigItems.map(e => `<div class="anomaly-item"><div class="anomaly-icon">⚠️</div><div class="anomaly-info"><div class="anomaly-title">${e.icon} ${escapeHtml(e.name)} 占比过高</div><div class="anomaly-desc">占比 ${(e.total / summary.expense * 100).toFixed(0)}%，金额 ${fmt(e.total)}</div></div></div>`).join('') :
            '<div class="empty-state ok"><div class="empty-icon">✅</div><div class="empty-text">消费分布较为均衡</div></div>';

        // 趋势图
        this.renderTrend();
    },

    async renderOverview() {
        const overview = document.getElementById('analysisOverview');
        showSkeleton(overview, 3, 'text');
        const dash = await api('/stats/dashboard');
        if (!dash) return;

        const income = dash.month?.income || 0;
        const expense = dash.month?.expense || 0;
        const balance = income - expense;

        // 预算总使用率
        const budgets = dash.budgets || [];
        const totalBudget = budgets.reduce((s, b) => s + (parseFloat(b.amount) || 0), 0);
        const totalActual = budgets.reduce((s, b) => s + (parseFloat(b.actual) || 0), 0);
        const budgetPct = totalBudget > 0 ? Math.min(100, Math.round(totalActual / totalBudget * 100)) : 0;
        const budgetOver = totalActual > totalBudget;

        overview.innerHTML = `
            <div class="analysis-overview-card income">
                <div class="overview-icon">💰</div>
                <div class="overview-value">${fmt(income)}</div>
                <div class="overview-label">本月收入</div>
            </div>
            <div class="analysis-overview-card expense">
                <div class="overview-icon">💳</div>
                <div class="overview-value">${fmt(expense)}</div>
                <div class="overview-label">本月支出</div>
            </div>
            <div class="analysis-overview-card balance">
                <div class="overview-icon">📊</div>
                <div class="overview-value">${fmt(balance)}</div>
                <div class="overview-label">本月结余</div>
            </div>
            ${totalBudget > 0 ? `
            <div class="analysis-budget-bar">
                <span class="budget-label">📋 预算使用</span>
                <div class="budget-progress-wrap">
                    <div class="budget-progress-fill" style="width:${budgetPct}%;background:${budgetOver ? 'var(--expense)' : 'var(--accent-500)'}"></div>
                </div>
                <span class="budget-text" style="color:${budgetOver ? 'var(--expense)' : 'var(--accent-500)'}">${fmt(totalActual)} / ${fmt(totalBudget)} (${budgetPct}%)</span>
            </div>` : ''}
        `;
    },

    async genAdvice() {
        if (!(await AIRecognition.checkProvider())) {
            AIRecognition.renderNoProvider('aiAdviceList');
            return;
        }
        const container = document.getElementById('aiAdviceList');
        container.innerHTML = '<div class="skeleton-wrap" data-skeleton="text"><div class="skeleton-line shimmer" style="width:60%"></div><div class="skeleton-line shimmer" style="width:72%"></div><div class="skeleton-line shimmer" style="width:84%"></div></div>';
        const btn = document.getElementById('aiGenAdviceBtn');
        btn.disabled = true;
        try {
            const res = await api('/ai/advice', 'POST');
            if (!res || !res.advice) {
                container.innerHTML = `<div class="empty-hint"><div class="empty-icon">⚠️</div><p>${res && res.message ? escapeHtml(res.message) : '获取建议失败，请检查 AI 配置'}</p></div>`;
                return;
            }
            const items = res.advice || [];
            if (!items.length) {
                container.innerHTML = '<div class="empty-hint"><div class="empty-icon">💡</div><p>AI 未生成有效建议，可尝试调整提示词或稍后重试</p></div>';
                return;
            }
            const prLabel = { high: '重要', medium: '中等', low: '可选' };
            const prClass = { high: 'pr-high', medium: 'pr-medium', low: 'pr-low' };
            container.innerHTML = items.map(a => `<div class="ai-advice-item ${prClass[a.priority] || ''}">
                <div class="advice-head"><span class="advice-type">💡 ${escapeHtml(a.title || '建议')}</span>${a.priority ? `<span class="pr-badge ${prClass[a.priority]}">${prLabel[a.priority]}</span>` : ''}</div>
                <div class="advice-content">${escapeHtml(a.content || '')}</div>
                ${a.impact ? `<div class="advice-impact">预期影响：${escapeHtml(a.impact)}</div>` : ''}
            </div>`).join('');
            // 持久化到 localStorage + 内存缓存，刷新不丢失
            AnalysisManager._cachedAdvice = items;
            AnalysisManager._saveAdvice(items);
        } catch (err) {
            container.innerHTML = `<div class="empty-hint"><div class="empty-icon">⚠️</div><p>${escapeHtml(err.message || '获取建议失败')}</p></div>`;
        } finally {
            btn.disabled = false;
        }
    },

    async renderTrend() {
        const dash = await api('/stats/dashboard');
        if (!dash || !dash.months) return;
        const c = ChartManager.colors();
        ChartManager.destroy('analysisTrend');
        const ctx = document.getElementById('analysisTrendChart').getContext('2d');
        const ms = [...dash.months].reverse();
        const avg = ms.length > 0 ? ms.reduce((s, m) => s + m.expense, 0) / ms.length : 0;
        ChartManager.charts['analysisTrend'] = new Chart(ctx, {
            type: 'line', data: {
                labels: ms.map(m => m.month.substring(5) + '月'),
                datasets: [
                    { label: '月支出', data: ms.map(m => m.expense), borderColor: c.exp, backgroundColor: c.exp + '15', fill: true, tension: 0.4, pointRadius: 5 },
                    { label: '平均线', data: Array(ms.length).fill(avg), borderColor: c.war + '80', borderDash: [8, 4], pointRadius: 0, fill: false }
                ]
            }, options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { labels: { color: c.text, usePointStyle: true, boxWidth: 8 } } }, scales: { x: { ticks: { color: c.text, font: { size: 10 } }, grid: { color: c.grid } }, y: { ticks: { color: c.text, font: { size: 10 } }, grid: { color: c.grid } } } }
        });
    }
};

export default AnalysisManager;