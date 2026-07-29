// 本文件从 app.js 中拆分而来，保留 CsvManager 对象。

const CsvManager = {
    init() {
        // 导入导出按钮已移除，保留管理器以备将来使用
    },
    async handleImport(e) {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const text = await file.text();
        const res = await api('/import/csv', 'POST', { type: 'transactions', csv: text });
        if (res && res.imported != null) {
            showToast(`成功导入 ${res.imported} 条交易`, 'success');
            await initCache();
            await TransactionManager.refresh();
        }
        e.target.value = '';
    },
    async exportCsv() {
        try {
            const token = localStorage.getItem('zhicai_token');
            const res = await fetch(`${API}/export/csv?type=transactions`, {
                headers: token ? { Authorization: 'Bearer ' + token } : {}
            });
            if (!res.ok) { showToast('导出失败', 'error'); return; }
            const csv = await res.text();
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `zhicai_transactions_${fmtDate()}.csv`;
            document.body.appendChild(a); a.click(); a.remove();
            URL.revokeObjectURL(url);
            showToast('已导出交易 CSV', 'success');
        } catch (err) {
            showToast(err.message || '导出失败', 'error');
        }
    }
};

export default CsvManager;
