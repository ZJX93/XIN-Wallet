/**
 * AIProviderManager - AI 服务商与 OCR 配置管理
 *
 * 拆分来源：C:\Users\XIN\WorkBuddy\XIN-Wallet\js\app.js
 * 原始位置：app.js 第 4728 ~ 4979 行（const AIProviderManager = { ... };）
 * 拆分说明：从单体 app.js 按对象真实边界提取，完整保留原代码；
 *          依赖项（api / showToast / cache / AIRecognition / escapeHtml 等）
 *          仍由 app.js 提供，本模块在 app.js 之后加载即可直接使用。
 */

const AIProviderManager = {
    providers: [],
    editingId: null,

    PRESETS: {
        openai: { name: 'OpenAI', api_type: 'openai', base_url: 'https://api.openai.com/v1', model: '' },
        anthropic: { name: 'Anthropic', api_type: 'anthropic', base_url: 'https://api.anthropic.com/v1', model: '' },
        deepseek: { name: 'DeepSeek', api_type: 'openai', base_url: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
        kimi: { name: 'Kimi', api_type: 'openai', base_url: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
        ollama: { name: 'Ollama 本地', api_type: 'openai', base_url: 'http://127.0.0.1:11434/v1', model: 'llama3.1' },
        zhipu: { name: '智谱 AI', api_type: 'openai', base_url: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },
        moonshot: { name: 'Moonshot', api_type: 'openai', base_url: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
        minimax: { name: 'MiniMax', api_type: 'anthropic', base_url: 'https://api.minimaxi.com/anthropic/v1', model: 'MiniMax-M3' }
    },

    init() {
        document.getElementById('aiAddProviderBtn').addEventListener('click', () => this.openModal());
        document.getElementById('aiProviderModalClose').addEventListener('click', () => this.closeModal());
        document.getElementById('aiProviderCancelBtn').addEventListener('click', () => this.closeModal());
        document.getElementById('aiProviderForm').addEventListener('submit', (e) => { e.preventDefault(); this.save(); });
        document.getElementById('aiProviderTestBtn').addEventListener('click', () => this.test());
        document.querySelectorAll('#aiProviderPresets .btn').forEach(btn => {
            btn.addEventListener('click', () => this.applyPreset(btn.dataset.preset));
        });
        document.getElementById('aiProviderList').addEventListener('click', (e) => {
            const btn = e.target.closest('button');
            if (!btn) return;
            const id = parseInt(btn.dataset.id);
            if (btn.classList.contains('ai-provider-edit')) this.openModal(id);
            if (btn.classList.contains('ai-provider-delete')) this.delete(id);
            if (btn.classList.contains('ai-provider-activate')) this.activate(id);
        });
        this.initOcrConfig();
    },

    async refresh() {
        const res = await api('/ai/providers');
        if (!res) return;
        this.providers = res.providers || [];
        this.render();
        // 重置 AI 服务商检测缓存，让分析页面等组件能重新检测
        AIRecognition.hasProvider = null;
    },

    render() {
        const list = document.getElementById('aiProviderList');
        const empty = document.getElementById('aiProviderEmpty');
        if (!this.providers.length) {
            list.innerHTML = '';
            empty.style.display = 'block';
            return;
        }
        empty.style.display = 'none';
        list.innerHTML = this.providers.map(p => `
            <div class="provider-card ${p.is_active ? 'active' : ''}">
                <div class="provider-card-header">
                    <div class="provider-card-title">
                        ${escapeHtml(p.name)}
                        <span class="provider-card-badge ${p.is_active ? 'active' : ''}">${p.is_active ? '当前启用' : p.api_type}</span>
                    </div>
                </div>
                <div class="provider-card-meta">
                    <div>模型：${escapeHtml(p.model)}</div>
                    <div>地址：${escapeHtml(p.base_url)}</div>
                    <div>Key：${p.api_key ? '已保存' : '未设置'}</div>
                </div>
                <div class="provider-card-actions">
                    ${p.is_active ? '<span class="btn btn-ghost btn-sm" disabled>已启用</span>' : `<button class="btn btn-primary btn-sm ai-provider-activate" data-id="${p.id}">启用</button>`}
                    <button class="btn btn-ghost btn-sm ai-provider-edit" data-id="${p.id}">编辑</button>
                    <button class="btn btn-ghost btn-sm ai-provider-delete" data-id="${p.id}">删除</button>
                </div>
            </div>
        `).join('');
    },

    openModal(id) {
        this.editingId = id || null;
        document.getElementById('aiProviderModalTitle').textContent = id ? '编辑服务商' : '添加服务商';
        document.getElementById('aiProviderMsg').textContent = '';
        document.getElementById('aiProviderMsg').className = 'form-msg';
        if (id) {
            const p = this.providers.find(x => x.id === id);
            if (!p) return;
            document.getElementById('aiProviderId').value = p.id;
            document.getElementById('aiProviderName').value = p.name;
            document.getElementById('aiProviderType').value = p.api_type;
            document.getElementById('aiProviderBaseUrl').value = p.base_url;
            document.getElementById('aiProviderModel').value = p.model;
            document.getElementById('aiProviderKey').value = '';
            document.getElementById('aiProviderKey').placeholder = p.api_key ? '已保存（修改请重新输入）' : 'sk-...';
        } else {
            document.getElementById('aiProviderForm').reset();
            document.getElementById('aiProviderId').value = '';
            document.getElementById('aiProviderKey').placeholder = 'sk-...';
            // 默认选择 OpenAI 预设
            this.applyPreset('openai');
        }
        document.getElementById('aiProviderModal').classList.add('show');
    },

    closeModal() {
        document.getElementById('aiProviderModal').classList.remove('show');
        this.editingId = null;
    },

    applyPreset(key) {
        const p = this.PRESETS[key];
        if (!p) return;
        document.getElementById('aiProviderName').value = p.name;
        document.getElementById('aiProviderType').value = p.api_type;
        document.getElementById('aiProviderBaseUrl').value = p.base_url;
        document.getElementById('aiProviderModel').value = p.model;
    },

    collect() {
        return {
            id: document.getElementById('aiProviderId').value || null,
            name: document.getElementById('aiProviderName').value.trim(),
            api_type: document.getElementById('aiProviderType').value,
            base_url: document.getElementById('aiProviderBaseUrl').value.trim(),
            model: document.getElementById('aiProviderModel').value.trim(),
            api_key: document.getElementById('aiProviderKey').value.trim(),
            is_active: true,  // 编辑时默认保留启用；新建首个服务商时自动激活
            sort_order: 0
        };
    },

    async save() {
        const payload = this.collect();
        if (!payload.name) return this.setMsg('请输入服务商名称', 'error');
        if (!payload.base_url) return this.setMsg('请输入接口地址', 'error');
        if (!payload.model) return this.setMsg('请输入模型名', 'error');
        const isEdit = !!this.editingId;
        const res = isEdit
            ? await api(`/ai/providers/${this.editingId}`, 'PUT', payload)
            : await api('/ai/providers', 'POST', payload);
        if (res) {
            showToast(isEdit ? '服务商已更新' : '服务商已创建', 'success');
            this.closeModal();
            await this.refresh();
        } else {
            this.setMsg('保存失败，请检查输入或网络', 'error');
        }
    },

    async activate(id) {
        const res = await api(`/ai/providers/${id}/activate`, 'POST');
        if (res) {
            showToast('已启用该服务商', 'success');
            await this.refresh();
        } else {
            showToast('启用失败', 'error');
        }
    },

    async delete(id) {
        const p = this.providers.find(x => x.id === id);
        if (!p) return;
        if (!confirm(`确定删除服务商「${p.name}」吗？`)) return;
        const res = await api(`/ai/providers/${id}`, 'DELETE');
        if (res) {
            showToast('服务商已删除', 'success');
            await this.refresh();
        } else {
            showToast('删除失败', 'error');
        }
    },

    async test() {
        const payload = this.collect();
        if (!payload.base_url || !payload.model) {
            return this.setMsg('请填写接口地址和模型名后再测试', 'error');
        }
        // 新建时必须填 key；编辑时 key 可留空，后端会保留已保存的 key
        if (!this.editingId && !payload.api_key) {
            return this.setMsg('新建服务商时必须填写 API Key', 'error');
        }
        this.setMsg('正在测试连接...', 'info');
        // 临时保存到后端再调用 insight（确保后端有 key）
        const isEdit = !!this.editingId;
        const saveRes = isEdit
            ? await api(`/ai/providers/${this.editingId}`, 'PUT', { ...payload, is_active: true })
            : await api('/ai/providers', 'POST', { ...payload, is_active: true });
        if (!saveRes) {
            this.setMsg('保存失败，无法测试', 'error');
            return;
        }
        const res = await api('/ai/insight', 'POST', { month: cache.currentMonth });
        if (res) {
            showToast('连接成功，AI 接口可用', 'success');
            this.setMsg('连接成功，AI 接口可用。点击「保存」保留或「取消」关闭。', 'success');
            await this.refresh();
        } else {
            this.setMsg('连接测试失败，请检查 Key、模型名和接口地址', 'error');
        }
    },

    setMsg(text, type = '') {
        const el = document.getElementById('aiProviderMsg');
        el.textContent = text;
        el.className = 'form-msg' + (type ? ' ' + type : '');
    },

    // OCR 配置
    ocrCurrent: {},

    initOcrConfig() {
        const form = document.getElementById('ocrConfigForm');
        form.addEventListener('submit', (e) => { e.preventDefault(); this.saveOcrConfig(); });
        document.getElementById('ocrTestBtn').addEventListener('click', () => this.testOcr());
    },

    async refreshOcrConfig() {
        const res = await api('/ai/ocr-config');
        if (!res) return;
        this.ocrCurrent = res;
        document.getElementById('ocrSecretId').value = res.secret_id || '';
        document.getElementById('ocrSecretKey').value = '';
        document.getElementById('ocrSecretKey').placeholder = res.secret_id ? '已保存（修改请重新输入）' : 'SecretKey';
        document.getElementById('ocrRegion').value = res.region || 'ap-guangzhou';
        document.getElementById('ocrConfigMsg').textContent = '';
        document.getElementById('ocrConfigMsg').className = 'form-msg';
    },

    async saveOcrConfig() {
        const payload = {
            secret_id: document.getElementById('ocrSecretId').value.trim(),
            secret_key: document.getElementById('ocrSecretKey').value.trim(),
            region: document.getElementById('ocrRegion').value.trim()
        };
        if (!payload.secret_id) return this.ocrSetMsg('SecretId 必填', 'error');
        if (!payload.secret_key && !this.ocrCurrent.secret_id) return this.ocrSetMsg('SecretKey 必填', 'error');
        const res = await api('/ai/ocr-config', 'POST', payload);
        if (res) {
            showToast('OCR 配置已保存', 'success');
            await this.refreshOcrConfig();
            this.ocrSetMsg('OCR 配置保存成功', 'success');
        } else {
            this.ocrSetMsg('保存失败', 'error');
        }
    },

    async testOcr() {
        this.ocrSetMsg('请先保存配置，然后使用 AI 识别页的截图上传功能测试', 'info');
    },

    ocrSetMsg(text, type = '') {
        const el = document.getElementById('ocrConfigMsg');
        el.textContent = text;
        el.className = 'form-msg' + (type ? ' ' + type : '');
    }
};

export default AIProviderManager;