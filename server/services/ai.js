/* ============================================
   鑫钱包 · AI 服务调用模块
   封装 OpenAI 兼容 / Anthropic 接口调用
   ============================================ */

const https = require('https');
const http = require('http');
const db = require('../db');
const { decrypt } = require('../crypto');

// HTTP POST JSON 请求（通用）
function httpsPostJson(url, headers, body) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const mod = u.protocol === 'https:' ? https : http;
        const data = JSON.stringify(body);
        const opts = {
            hostname: u.hostname, port: u.port || (u.protocol === 'https:' ? 443 : 80),
            path: u.pathname + u.search, method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), ...headers },
            timeout: 60000
        };
        const req = mod.request(opts, (res) => {
            let buf = '';
            res.on('data', c => buf += c);
            res.on('end', () => { try { resolve(JSON.parse(buf)); } catch { resolve(buf); } });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('AI 请求超时（60s）')); });
        req.write(data);
        req.end();
    });
}

// 获取当前激活的 AI 服务商（含解密 api_key）
async function getActiveProvider(userId) {
    const provider = await db.queryOne('SELECT * FROM ai_providers WHERE user_id = ? AND is_active = TRUE LIMIT 1', [userId]);
    if (provider && provider.api_key) {
        provider.api_key = decrypt(provider.api_key);
    }
    return provider;
}

// 调用 OpenAI 兼容接口
async function callOpenAICompatible(baseUrl, apiKey, model, messages) {
    const url = (baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '') + '/chat/completions';
    const data = await httpsPostJson(url, {
        'Authorization': `Bearer ${apiKey}`
    }, {
        model: model || 'gpt-4o-mini',
        messages,
        temperature: 0.7
    });
    return data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
}

// 调用 Anthropic Messages
async function callAnthropic(baseUrl, apiKey, model, messages) {
    let system = '';
    const userMessages = messages.filter(m => {
        if (m.role === 'system') { system = m.content; return false; }
        return true;
    }).map(m => ({ role: m.role, content: m.content }));
    const url = (baseUrl || 'https://api.anthropic.com/v1').replace(/\/+$/, '') + '/messages';

    const isMiniMax = url.includes('minimaxi.com');
    const headers = isMiniMax
        ? { 'Authorization': `Bearer ${apiKey}` }
        : { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' };

    const body = {
        model: model || 'claude-3-haiku-20240307',
        max_tokens: 2048,
        system,
        messages: userMessages
    };
    const data = await httpsPostJson(url, headers, body);
    return data && data.content && data.content[0] && data.content[0].text;
}

// 通用调用：根据服务商 api_type 分发
async function callProvider(provider, messages) {
    if (!provider) throw new Error('未配置 AI 服务商');
    if (!provider.api_key) throw new Error('服务商未设置 API Key');
    if (provider.api_type === 'anthropic') {
        return await callAnthropic(provider.base_url, provider.api_key, provider.model, messages);
    }
    return await callOpenAICompatible(provider.base_url, provider.api_key, provider.model, messages);
}

module.exports = { httpsPostJson, getActiveProvider, callOpenAICompatible, callAnthropic, callProvider };
