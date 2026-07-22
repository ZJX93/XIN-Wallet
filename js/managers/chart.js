// 从 app.js 拆分而来，保留原始 ChartManager 对象实现。

const ChartManager = {
    charts: {},
    destroy(id) { if (this.charts[id]) { this.charts[id].destroy(); this.charts[id] = null; } },

    // 读取 CSS 变量或回退硬编码值
    _cssVar(name, fallback) {
        try {
            const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
            return v || fallback;
        } catch (e) { return fallback; }
    },

    fontFamily() {
        return this._cssVar('--font-sans', 'system-ui, -apple-system, "Segoe UI", sans-serif');
    },

    reduceMotion() {
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    },

    colors() {
        const dk = document.documentElement.getAttribute('data-theme') === 'dark';
        // Chart.js 无法解析 oklch() 格式，需要转为 rgb 或 hex
        // 读取 CSS 变量后检查是否为 oklch 开头，如果是则用 fallback
        const resolve = (cssVar, fallback) => {
            const v = this._cssVar(cssVar, fallback);
            return (v && !v.startsWith('oklch')) ? v : fallback;
        };
        return {
            text:   resolve('--text-primary',   dk ? '#b0b0c8' : '#3a3028'),
            textSec:resolve('--text-secondary',  dk ? '#8888a8' : '#6a6058'),
            grid:   resolve('--border-subtle',    dk ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)'),
            inc:    resolve('--income',           '#c0392b'),
            exp:    resolve('--expense',           '#27ae60'),
            pri:    resolve('--accent-500',        '#8B6B4A'),
            war:    resolve('--warning-500',       '#f59e0b'),
            info:   resolve('--info-500',          '#3b82f6'),
            cats:   ['#8B6B4A','#c0392b','#27ae60','#f59e0b','#3b82f6','#8b5cf6','#ec4899','#14b8a6','#64748b','#e74c3c','#22c55e','#a855f7','#0ea5e9','#f97316','#6b7280']
        };
    },

    refreshAll() { this.renderDash(); },

    async renderDash() {
        const data = await api('/stats/dashboard');
        if (!data) return;
        const c = this.colors();
        // 趋势图
        this.destroy('dashTrend');
        const trendCanvas = document.getElementById('dashTrendChart');
        if (!trendCanvas) { console.warn('[chart] dashTrendChart canvas not found, skipping'); return; }
        const ctx1 = trendCanvas.getContext('2d');
        const months = [...data.months].reverse();
        this.charts['dashTrend'] = new Chart(ctx1, {
            type: 'line',
            data: {
                labels: months.map(m => m.month.substring(5) + '月'),
                datasets: [
                    { label: '收入', data: months.map(m => m.income), borderColor: c.inc, backgroundColor: c.inc + '20', fill: true, tension: 0.4, pointRadius: 4 },
                    { label: '支出', data: months.map(m => m.expense), borderColor: c.exp, backgroundColor: c.exp + '20', fill: true, tension: 0.4, pointRadius: 4 },
                    { label: '储蓄率', data: months.map(m => m.savingsRate), borderColor: c.info, backgroundColor: c.info + '20', yAxisID: 'y1', tension: 0.4, pointRadius: 3, borderDash: [5, 4] }
                ]
            },
            options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { labels: { color: c.text, usePointStyle: true, boxWidth: 8 } } }, scales: { x: { ticks: { color: c.text, font: { size: 10 } }, grid: { color: c.grid } }, y: { ticks: { color: c.text, font: { size: 10 } }, grid: { color: c.grid } }, y1: { position: 'right', ticks: { color: c.text, font: { size: 10 }, callback: v => v + '%' }, grid: { drawOnChartArea: false } } } }
        });

        // 最新月环比（months 已升序，最新在末尾）
        const latest = months[months.length - 1];
        const momEl = document.getElementById('dashTrendMoM');
        if (momEl && latest) {
            const f = v => v == null ? '—' : (v >= 0 ? '▲' : '▼') + Math.abs(v).toFixed(1) + '%';
            momEl.innerHTML = `环比 收${f(latest.incomeMoM)} 支${f(latest.expenseMoM)}`;
        }

        // 饼图
        this.destroy('dashPie');
        const pieCanvas = document.getElementById('dashPieChart');
        if (!pieCanvas) { console.warn('[chart] dashPieChart canvas not found'); return; }
        const ctx2 = pieCanvas.getContext('2d');
        const summary = await api(`/transactions/summary?month=${cache.currentMonth}`);
        if (summary && summary.expenseByCategory && summary.expenseByCategory.length > 0) {
            this.charts['dashPie'] = new Chart(ctx2, {
                type: 'doughnut',
                data: {
                    labels: summary.expenseByCategory.map(e => e.icon + ' ' + e.name),
                    datasets: [{ data: summary.expenseByCategory.map(e => e.total), backgroundColor: summary.expenseByCategory.map((_, i) => c.cats[i % c.cats.length]), borderWidth: 0 }]
                },
                options: { responsive: true, maintainAspectRatio: true, cutout: '55%', plugins: { legend: { position: 'right', labels: { color: c.text, font: { family: ChartManager.fontFamily(), size: 11 }, padding: 8, boxWidth: 12, usePointStyle: true } } } }
            });
        }
    },

    async renderInvestPie(byType) {
        this.destroy('invAllocation');
        const canvas = document.getElementById('invAllocationPie');
        if (!canvas) { console.warn('[chart] invAllocationPie canvas not found, skipping'); return; }
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const c = this.colors();
        const entries = Object.entries(byType);
        if (entries.length === 0) return;

        const labels = entries.map(([, v]) => v.icon + ' ' + v.type_name);
        const data = entries.map(([, v]) => v.total_value);
        const total = data.reduce((s, v) => s + v, 0);
        const colors = entries.map((_, i) => c.cats[i % c.cats.length]);

        this.charts['invAllocation'] = new Chart(ctx, {
            type: 'doughnut',
            data: { labels, datasets: [{ data, backgroundColor: colors, borderColor: colors.map(cl => cl + '33'), borderWidth: 3, hoverBorderWidth: 4, hoverBorderColor: colors }] },
            options: {
                responsive: true, maintainAspectRatio: true, cutout: '62%',
                animation: this.reduceMotion() ? false : { animateScale: true, animateRotate: true, duration: 800 },
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: c.text, font: { family: ChartManager.fontFamily(), size: 10 }, padding: 10, boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyleWidth: 10, generateLabels: function(chart) { const d = chart.data; return d.labels.map((l, i) => ({ text: l + '  ' + (d.datasets[0].data[i] / total * 100).toFixed(1) + '%', fillStyle: d.datasets[0].backgroundColor[i], strokeStyle: d.datasets[0].backgroundColor[i], pointStyle: 'circle', index: i })); } }
                    },
                    tooltip: {
                        backgroundColor: dk => dk ? '#1e1e3a' : '#fff',
                        titleColor: c.text, bodyColor: c.text,
                        borderColor: c.grid, borderWidth: 1,
                        cornerRadius: 8, padding: 12,
                        callbacks: {
                            label: ctx => ` ${ctx.label.split(' ').slice(1).join(' ')}: ¥${ctx.parsed.toLocaleString()}（${(ctx.parsed / total * 100).toFixed(1)}%）`
                        }
                    }
                }
            }
        });
    },

    // 理财市值趋势折线图 — 渐变填充 + 平滑曲线
    async renderInvTrend(trendSeries) {
        this.destroy('invTrend');
        const canvas = document.getElementById('invTrendChart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const c = this.colors();
        if (!trendSeries || trendSeries.length === 0) return;

        const allDates = [...new Set(trendSeries.flatMap(s => s.points.map(p => p.date)))].sort();
        if (allDates.length === 0) return;

        // 数据点不足时显示提示
        if (allDates.length < 2) {
            canvas.style.display = 'none';
            const wrap = canvas.parentElement;
            let hint = wrap.querySelector('.chart-hint');
            if (!hint) {
                hint = document.createElement('div');
                hint.className = 'chart-hint';
                hint.style.cssText = 'display:flex;align-items:center;justify-content:center;height:220px;color:var(--text-muted);font-size:14px;';
                wrap.appendChild(hint);
            }
            hint.textContent = '暂无足够的历史数据，买入后次日将显示趋势';
            hint.style.display = 'flex';
            return;
        }
        // 恢复 canvas 显示，隐藏提示
        canvas.style.display = '';
        const wrap = canvas.parentElement;
        const hint = wrap.querySelector('.chart-hint');
        if (hint) hint.style.display = 'none';

        // 为每条线生成渐变色
        const datasets = trendSeries.map((s, i) => {
            const baseColor = c.cats[i % c.cats.length];
            const grad = ctx.createLinearGradient(0, 0, 0, 220);
            grad.addColorStop(0, baseColor + '40');
            grad.addColorStop(1, baseColor + '02');
            return {
                label: s.name,
                data: allDates.map(d => { const pt = s.points.find(p => p.date === d); return pt ? pt.value : null; }),
                borderColor: baseColor,
                backgroundColor: grad,
                tension: 0.4,
                fill: true,
                pointRadius: 0,
                pointHoverRadius: 5,
                pointHoverBackgroundColor: baseColor,
                pointHoverBorderColor: '#fff',
                pointHoverBorderWidth: 2,
                borderWidth: 2.5,
                spanGaps: true
            };
        });

        this.charts['invTrend'] = new Chart(ctx, {
            type: 'line',
            data: { labels: allDates.map(d => d.slice(5)), datasets },
            options: {
                responsive: true, maintainAspectRatio: true,
                animation: this.reduceMotion() ? false : { duration: 1000, easing: 'easeOutQuart' },
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: c.text, font: { family: ChartManager.fontFamily(), size: 9 }, padding: 10, boxWidth: 20, boxHeight: 3, usePointStyle: false, pointStyleWidth: 0, generateLabels: function(chart) { return chart.data.datasets.map((ds, i) => ({ text: ds.label, fillStyle: ds.borderColor, strokeStyle: ds.borderColor, lineWidth: 2, hidden: !chart.isDatasetVisible(i), index: i })); } }
                    },
                    tooltip: {
                        backgroundColor: ctx => ctx.tooltip.opacity === 0 ? 'transparent' : (document.documentElement.getAttribute('data-theme') === 'dark' ? '#1e1e3a' : '#fff'),
                        titleColor: c.text, bodyColor: c.text,
                        borderColor: c.grid, borderWidth: 1,
                        cornerRadius: 10, padding: 12,
                        callbacks: { label: ctx => ` ${ctx.dataset.label}: ¥${ctx.parsed.y.toLocaleString()}` }
                    }
                },
                scales: {
                    x: { ticks: { color: c.textSec, font: { size: 9 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 }, grid: { color: c.grid, drawBorder: false } },
                    y: { ticks: { color: c.textSec, font: { size: 9 }, callback: v => v >= 10000 ? (v / 10000).toFixed(1) + '万' : v, padding: 4 }, grid: { color: c.grid, drawBorder: false }, beginAtZero: false }
                }
            }
        });
    },

    // 理财类型对比柱状图 — 圆角 + 标签 + 渐变
    async renderInvTypeBar(byType) {
        this.destroy('invTypeBar');
        const canvas = document.getElementById('invTypeBarChart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const c = this.colors();
        if (!byType || byType.length === 0) return;

        const labels = byType.map(t => t.icon + ' ' + t.type_name);
        const costData = byType.map(t => t.total_cost);
        const valueData = byType.map(t => t.total_value);

        // 渐变色
        const costGrad = ctx.createLinearGradient(0, 0, 0, 220);
        costGrad.addColorStop(0, c.cats[0] + 'cc');
        costGrad.addColorStop(1, c.cats[0] + '66');
        const valGrad = ctx.createLinearGradient(0, 0, 0, 220);
        valGrad.addColorStop(0, c.cats[2] + 'cc');
        valGrad.addColorStop(1, c.cats[2] + '66');

        this.charts['invTypeBar'] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    { label: '投入本金', data: costData, backgroundColor: costGrad, borderColor: c.cats[0], borderWidth: 1, borderRadius: { topLeft: 6, topRight: 6 }, borderSkipped: false },
                    { label: '当前市值', data: valueData, backgroundColor: valGrad, borderColor: c.cats[2], borderWidth: 1, borderRadius: { topLeft: 6, topRight: 6 }, borderSkipped: false }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: true,
                animation: this.reduceMotion() ? false : { duration: 800, easing: 'easeOutQuart' },
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: c.text, font: { family: ChartManager.fontFamily(), size: 10 }, padding: 10, boxWidth: 12, boxHeight: 12, usePointStyle: true, pointStyleWidth: 12 }
                    },
                    tooltip: {
                        backgroundColor: document.documentElement.getAttribute('data-theme') === 'dark' ? '#1e1e3a' : '#fff',
                        titleColor: c.text, bodyColor: c.text,
                        borderColor: c.grid, borderWidth: 1,
                        cornerRadius: 10, padding: 12,
                        callbacks: { label: ctx => ` ${ctx.dataset.label}: ¥${ctx.parsed.y.toLocaleString()}` }
                    }
                },
                scales: {
                    x: { ticks: { color: c.textSec, font: { size: 9 } }, grid: { display: false }, border: { display: false } },
                    y: { ticks: { color: c.textSec, font: { size: 9 }, callback: v => v >= 10000 ? (v / 10000).toFixed(1) + '万' : v, padding: 4 }, grid: { color: c.grid, drawBorder: false }, beginAtZero: true }
                }
            }
        });
    }
};

export default ChartManager;
