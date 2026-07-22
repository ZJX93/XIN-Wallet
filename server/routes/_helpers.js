/* ============================================
   鑫钱包 · 公共辅助函数（从 routes.js 提取）
   供所有路由模块复用
   ============================================ */

const db = require('../db');
const { calcDebtDueSummary } = require('../services/debt-summary');

function success(data, msg = '') {
    return { success: true, data, message: msg };
}

function fail(msg, code = 400) {
    return { success: false, message: msg, code };
}

// ==========================================
// 语义化错误码常量
// 400 = 参数缺失/格式错误（请求语义错误）
// 401 = 未授权（鉴权失败，token 缺失/过期）
// 403 = 无权限（资源不允许该用户访问）
// 404 = 资源不存在
// 409 = 冲突（如余额不足、唯一键冲突）
// 422 = 业务校验失败（请求合法但业务规则不允许）
// 429 = 频率超限
// 500 = 服务器错误
// 502 = 外部依赖不可用
// ==========================================
const ErrorCodes = {
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    VALIDATION_FAILED: 422,
    RATE_LIMITED: 429,
    SERVER_ERROR: 500,
    UPSTREAM_ERROR: 502
};

// 语义快捷方法（推荐使用以保持一致性）
const failValidation = (msg) => fail(msg, ErrorCodes.VALIDATION_FAILED); // 业务规则拒绝
const failNotFound = (msg = '资源不存在') => fail(msg, ErrorCodes.NOT_FOUND);
const failConflict = (msg) => fail(msg, ErrorCodes.CONFLICT);
const failForbidden = (msg = '无权访问该资源') => fail(msg, ErrorCodes.FORBIDDEN);
const failBadRequest = (msg) => fail(msg, ErrorCodes.BAD_REQUEST);

function fmtDateOnly(v) {
    if (v === null || v === undefined) return null;
    if (v instanceof Date) {
        return v.getFullYear() + '-' +
            String(v.getMonth() + 1).padStart(2, '0') + '-' +
            String(v.getDate()).padStart(2, '0');
    }
    return String(v).slice(0, 10);
}

function fmtDateTime(v) {
    if (v === null || v === undefined) return null;
    if (v instanceof Date) {
        return v.getFullYear() + '-' +
            String(v.getMonth() + 1).padStart(2, '0') + '-' +
            String(v.getDate()).padStart(2, '0') + ' ' +
            String(v.getHours()).padStart(2, '0') + ':' +
            String(v.getMinutes()).padStart(2, '0') + ':' +
            String(v.getSeconds()).padStart(2, '0');
    }
    const s = String(v).replace('T', ' ').replace('Z', '');
    return s.slice(0, 19);
}

function handleServerError(res, err, label = '操作') {
    console.error(`[ERROR] ${label}:`, err && err.stack ? err.stack : err);
    return res.status(500).json(fail('服务器内部错误，请稍后重试', 500));
}

function maskKey(key) {
    if (!key) return '';
    // 加密后的 hex 密文通常超过 64 字符，展示前后几位不直观；统一显示为已加密占位符
    if (key.length >= 48) return '已加密 (AES-256-GCM)';
    if (key.length <= 8) return '***';
    return key.slice(0, 6) + '...' + key.slice(-4);
}

/**
 * 尝试解密凭证，并返回是否成功 + 解密后的明文（用于诊断密钥是否匹配）
 * @param {string} key 密文（hex）
 * @returns {{ ok: boolean, value: string, error?: string }}
 */
function tryDecrypt(key) {
    if (!key) return { ok: true, value: '' };
    try {
        const buf = Buffer.from(key, 'hex');
        if (buf.length < 32) {
            // 不是加密格式（旧数据明文），直接返回
            return { ok: true, value: key };
        }
        // 通过 _helpers 暴露的内部解密（这里用相对路径的 crypto 模块）
        const { decrypt } = require('../crypto');
        const decrypted = decrypt(key);
        // 如果解密返回原密文（说明失败 fallback），则不 ok
        if (decrypted === key) {
            return { ok: false, value: '', error: '密钥不匹配或数据已损坏' };
        }
        return { ok: true, value: decrypted };
    } catch (err) {
        return { ok: false, value: '', error: err.message };
    }
}

// 从模型输出中安全提取 JSON（兼容 markdown 代码块包裹）
function extractJson(text) {
    if (!text) return null;
    try { return JSON.parse(text); } catch (e) { }
    const m = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (m) { try { return JSON.parse(m[1]); } catch (e) { } }
    const m2 = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (m2) { try { return JSON.parse(m2[1]); } catch (e) { } }
    return null;
}

// 复式记账：仅账本流水净额（不含期初）
async function sumLedgerEffects(conn, userId, accountId) {
    const rows = await conn.query(
        `SELECT COALESCE(SUM(
            CASE
                WHEN source_account_id = ? THEN -amount
                WHEN destination_account_id = ? THEN amount
                WHEN account_id = ? AND type IN ('income','transfer_in') THEN amount
                WHEN account_id = ? AND type IN ('expense','transfer_out') THEN -amount
                ELSE 0
            END), 0) AS bal
        FROM transactions
        WHERE user_id = ? AND (source_account_id = ? OR destination_account_id = ? OR account_id = ?)`,
        [accountId, accountId, accountId, accountId, userId, accountId, accountId, accountId]
    );
    return parseFloat(rows[0] && rows[0].bal != null ? rows[0].bal : 0);
}

// 当前余额 = 期初余额 + 账本净额 - 已分配储蓄目标
async function computeAccountBalance(conn, userId, accountId) {
    const acc = await conn.query('SELECT opening_balance FROM accounts WHERE id = ? AND user_id = ?', [accountId, userId]);
    const opening = acc[0] ? parseFloat(acc[0].opening_balance || 0) : 0;
    const effects = await sumLedgerEffects(conn, userId, accountId);
    const goal = await conn.query(
        'SELECT COALESCE(SUM(current_amount), 0) AS alloc FROM savings_goals WHERE account_id = ? AND user_id = ? AND status != "archived"',
        [accountId, userId]
    );
    const allocated = parseFloat(goal[0] && goal[0].alloc != null ? goal[0].alloc : 0);
    return opening + effects - allocated;
}

// 理财净值快照
async function ensureWeeklySnapshots(userId, investments) {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const lastSunday = new Date(today);
    lastSunday.setDate(today.getDate() - dayOfWeek);
    const lastSundayStr = lastSunday.toISOString().slice(0, 10);

    for (const inv of investments) {
        const existing = await db.queryOne(
            'SELECT id FROM investment_snapshots WHERE investment_id = ? AND nav_date = ?',
            [inv.id, lastSundayStr]
        );
        if (!existing) {
            await db.query(
                'INSERT IGNORE INTO investment_snapshots (user_id, investment_id, total_value, total_cost, nav_date) VALUES (?, ?, ?, ?, ?)',
                [userId, inv.id, parseFloat(inv.current_value), parseFloat(inv.total_cost), lastSundayStr]
            );
        }

        const firstTx = await db.queryOne(
            'SELECT MIN(date) as first_date FROM investment_transactions WHERE investment_id = ?',
            [inv.id]
        );
        if (firstTx && firstTx.first_date) {
            const start = new Date(firstTx.first_date);
            start.setDate(start.getDate() + (7 - start.getDay()) % 7);
            const end = new Date(lastSunday);
            end.setDate(end.getDate() - 7);

            while (start <= end) {
                const snapDate = start.toISOString().slice(0, 10);
                await db.query(
                    'INSERT IGNORE INTO investment_snapshots (user_id, investment_id, total_value, total_cost, nav_date) VALUES (?, ?, ?, ?, ?)',
                    [userId, inv.id, parseFloat(inv.current_value), parseFloat(inv.total_cost), snapDate]
                );
                start.setDate(start.getDate() + 7);
            }
        }
    }
}

module.exports = {
    success, fail, fmtDateOnly, fmtDateTime, handleServerError, maskKey,
    extractJson, sumLedgerEffects, computeAccountBalance, ensureWeeklySnapshots,
    calcDebtDueSummary,
    ErrorCodes, failValidation, failNotFound, failConflict, failForbidden, failBadRequest,
    tryDecrypt
};
