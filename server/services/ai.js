/* ============================================
   鑫钱包 · AI 服务调用模块
   封装 OpenAI 兼容 / Anthropic 接口调用
   ============================================ */

const https = require('https');
const http = require('http');
const db = require('../db');
const { decrypt } = require('../crypto');
const { assertPublicUrl } = require('./url-guard');

// HTTP POST JSON 请求（通用）。
// ⚠️ 调用前必须经 assertPublicUrl() 校验（SSRF 防护）。Node http.request 默认不跟随重定向。
async function httpsPostJson(url, headers, body) {
    await assertPublicUrl(url);
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

// 获取当前激活的 AI 服务商（含解密 api_key）。
// api_key 解密失败（密钥变更/数据损坏）→ 返回 null，让路由层提示用户重新配置。
async function getActiveProvider(userId) {
    const provider = await db.queryOne('SELECT * FROM ai_providers WHERE user_id = ? AND is_active = TRUE LIMIT 1', [userId]);
    if (!provider) return null;
    if (provider.api_key) {
        provider.api_key = decrypt(provider.api_key);
        if (!provider.api_key) {
            console.error(`[AI] 用户 ${userId} 的活跃服务商 API Key 解密失败（密钥不匹配或数据损坏）`);
            return null;
        }
    }
    return provider;
}

// 查找支持语音转写的服务商：优先激活的 OpenAI 兼容服务商，其次查所有服务商
async function getTranscriptionProvider(userId) {
    // 1. 先在激活的服务商中找 OpenAI 兼容的
    let providers = await db.query('SELECT * FROM ai_providers WHERE user_id = ? AND is_active = TRUE ORDER BY id', [userId]);
    for (const p of providers) {
        const url = p.base_url || '';
        if (p.api_type === 'openai' && !url.includes('minimaxi.com') && !url.includes('minimax.chat')) {
            if (p.api_key) { p.api_key = decrypt(p.api_key); if (!p.api_key) continue; }
            return p;
        }
    }
    // 2. 再在所有服务商中找（即使未激活，只要有 Key 就行）
    providers = await db.query('SELECT * FROM ai_providers WHERE user_id = ? ORDER BY is_active DESC, id', [userId]);
    for (const p of providers) {
        const url = p.base_url || '';
        if (p.api_type === 'openai' && !url.includes('minimaxi.com') && !url.includes('minimax.chat')) {
            if (p.api_key) { p.api_key = decrypt(p.api_key); if (!p.api_key) continue; }
            return p;
        }
    }
    return null;
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

    const body = { model: model || 'claude-3-haiku-20240307', max_tokens: 8192, system, messages: userMessages };
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

// ==========================================
// 多模态 + 函数调用（tools）支持
// 归一化消息格式：{ role, content }
//   content: string | parts[]，parts = {type:'text',text} | {type:'image',mime,data(base64)}
// 归一化工具调用结果：{ role:'tool', toolCallId, content }
// 归一化助手消息（含工具调用）：{ role:'assistant', content, toolCalls:[{id,name,arguments(object)}] }
// ==========================================

function safeParseJson(str) {
    if (typeof str !== 'string') return str;
    try { return JSON.parse(str); } catch { return {}; }
}

function mimeToAnthropic(mime) {
    if (!mime) return 'image/jpeg';
    if (mime.includes('png')) return 'image/png';
    if (mime.includes('webp')) return 'image/webp';
    if (mime.includes('gif')) return 'image/gif';
    return 'image/jpeg';
}

function toOpenAIContent(content) {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
        return content.map(p => p.type === 'image'
            ? { type: 'image_url', image_url: { url: `data:${p.mime || 'image/jpeg'};base64,${p.data}` } }
            : { type: 'text', text: p.text || '' });
    }
    return content;
}

function toAnthropicContent(content) {
    if (typeof content === 'string') return [{ type: 'text', text: content }];
    if (Array.isArray(content)) {
        return content.map(p => p.type === 'image'
            ? { type: 'image', source: { type: 'base64', media_type: mimeToAnthropic(p.mime), data: p.data } }
            : { type: 'text', text: p.text || '' });
    }
    return content;
}

function toOpenAITools(tools) {
    return (tools || []).map(t => ({
        type: 'function',
        function: { name: t.name, description: t.description || '', parameters: t.parameters || { type: 'object', properties: {} } }
    }));
}

function toAnthropicTools(tools) {
    return (tools || []).map(t => ({
        name: t.name, description: t.description || '', input_schema: t.parameters || { type: 'object', properties: {} }
    }));
}

// OpenAI 兼容：带 tools 的对话，返回归一化助手消息
async function chatOpenAITools(provider, messages, tools) {
    const baseUrl = (provider.base_url || 'https://api.openai.com/v1').replace(/\/+$/, '');
    const url = baseUrl + '/chat/completions';
    const translated = messages.map(m => {
        if (m.role === 'system') return { role: 'system', content: m.content };
        if (m.role === 'tool') return { role: 'tool', tool_call_id: m.toolCallId, content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) };
        if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length) {
            return {
                role: 'assistant',
                content: m.content || '',
                tool_calls: m.toolCalls.map(tc => ({ id: tc.id, type: 'function', function: { name: tc.name, arguments: JSON.stringify(tc.arguments || {}) } }))
            };
        }
        return { role: m.role, content: toOpenAIContent(m.content) };
    });
    const body = { model: provider.model || 'gpt-4o-mini', messages: translated, temperature: 0.3 };
    if (tools && tools.length) { body.tools = toOpenAITools(tools); body.tool_choice = 'auto'; }
    const data = await httpsPostJson(url, { 'Authorization': `Bearer ${provider.api_key}` }, body);
    const msg = data && data.choices && data.choices[0] && data.choices[0].message;
    if (!msg) throw new Error('AI 返回为空');
    const toolCalls = (msg.tool_calls || []).map(tc => ({ id: tc.id, name: tc.function.name, arguments: safeParseJson(tc.function.arguments) }));
    return { role: 'assistant', content: msg.content || '', toolCalls };
}

// Anthropic：带 tools 的对话
async function chatAnthropicTools(provider, messages, tools) {
    const baseUrl = (provider.base_url || 'https://api.anthropic.com/v1').replace(/\/+$/, '');
    const url = baseUrl + '/messages';
    let system = '';
    const translated = [];
    for (const m of messages) {
        if (m.role === 'system') { system += (system ? '\n' : '') + (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)); continue; }
        if (m.role === 'tool') {
            translated.push({ role: 'user', content: [{ type: 'tool_result', tool_use_id: m.toolCallId, content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }] });
            continue;
        }
        if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length) {
            const blocks = m.content ? toAnthropicContent(m.content) : [];
            m.toolCalls.forEach(tc => blocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.arguments || {} }));
            translated.push({ role: 'assistant', content: blocks });
            continue;
        }
        translated.push({ role: m.role, content: toAnthropicContent(m.content) });
    }
    const body = { model: provider.model || 'claude-3-haiku-20240307', max_tokens: 8192, system, messages: translated };
    if (tools && tools.length) body.tools = toAnthropicTools(tools);
    // MiniMax Anthropic 兼容接口使用 Bearer 认证，标准 Anthropic 使用 x-api-key
    const isMiniMax = url.includes('minimaxi.com');
    const headers = isMiniMax
        ? { 'Authorization': `Bearer ${provider.api_key}` }
        : { 'x-api-key': provider.api_key, 'anthropic-version': '2023-06-01' };
    const data = await httpsPostJson(url, headers, body);
    const content = data && data.content;
    let text = '';
    const toolCalls = [];
    if (Array.isArray(content)) {
        for (const block of content) {
            if (block.type === 'text') text += block.text;
            else if (block.type === 'tool_use') toolCalls.push({ id: block.id, name: block.name, arguments: block.input || {} });
        }
    }
    return { role: 'assistant', content: text, toolCalls };
}

// 通用：根据服务商分发
async function chatWithTools(provider, messages, tools) {
    if (!provider) throw new Error('未配置 AI 服务商');
    if (!provider.api_key) throw new Error('服务商未设置 API Key');
    if (provider.api_type === 'anthropic') return await chatAnthropicTools(provider, messages, tools);
    return await chatOpenAITools(provider, messages, tools);
}

// 发送原始字节 body（multipart 等），用于语音转写
async function httpsPostRaw(url, headers, bufferBody) {
    await assertPublicUrl(url);
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const mod = u.protocol === 'https:' ? https : http;
        const opts = {
            hostname: u.hostname, port: u.port || (u.protocol === 'https:' ? 443 : 80),
            path: u.pathname + u.search, method: 'POST',
            headers: { 'Content-Length': Buffer.byteLength(bufferBody), ...headers },
            timeout: 60000
        };
        const req = mod.request(opts, (res) => {
            let buf = '';
            res.on('data', c => buf += c);
            res.on('end', () => { try { resolve(JSON.parse(buf)); } catch { resolve(buf); } });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('AI 请求超时（60s）')); });
        req.write(bufferBody);
        req.end();
    });
}

module.exports = { httpsPostJson, httpsPostRaw, getActiveProvider, getTranscriptionProvider, callOpenAICompatible, callAnthropic, callProvider, chatWithTools };
