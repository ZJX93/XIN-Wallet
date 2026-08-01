/**
 * 鑫钱包 · 输入校验与解析工具（双用途）
 *
 * 1) 纯函数工具：toNumber / toAmount / parseCsvLine — 供单元测试和路由层复用
 * 2) Express 中间件：validate(schema) — 自动验证 body/query/params
 *
 * 零依赖，避免引入新 npm 包
 */

// ============================================
// 纯函数工具
// ============================================

// 安全数值转换：空值 / 非数字统一返回 null，调用方据此返回 400，
// 避免 NaN 被写入余额或金额字段导致账目错乱。
function toNumber(value) {
    if (value === undefined || value === null || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

// 安全金额转换：基于 toNumber，额外限制非负且不超过 max（默认 1e10）。
// 空值 / 非数字 / 负数 / 越界统一返回 null，调用方据此返回 400，
// 防止异常大额或 NaN 被写入金额字段导致账目错乱或存储异常。
function toAmount(value, max = 1e10) {
    const n = toNumber(value);
    if (n === null) return null;
    if (n < 0 || n > max) return null;
    return n;
}

// 合法交易类型枚举（与 schema 中 transactions.type 对齐）
const TRANSACTION_TYPES = ['income', 'expense', 'transfer_in', 'transfer_out'];

// 解析单行 CSV：支持双引号包裹、字段内逗号与转义引号（""），
// 避免含逗号/换行的备注被错位切分。
function parseCsvLine(line) {
    const out = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuotes) {
            if (ch === '"') {
                if (line[i + 1] === '"') { cur += '"'; i++; }
                else inQuotes = false;
            } else {
                cur += ch;
            }
        } else if (ch === '"') {
            inQuotes = true;
        } else if (ch === ',') {
            out.push(cur);
            cur = '';
        } else {
            cur += ch;
        }
    }
    out.push(cur);
    return out;
}

// ============================================
// Express 验证中间件
// ============================================
const TYPES = {
    string: (v) => typeof v === 'string',
    number: (v) => typeof v === 'number' && !isNaN(v),
    int: (v) => Number.isInteger(v),
    boolean: (v) => typeof v === 'boolean',
    array: (v) => Array.isArray(v),
    object: (v) => typeof v === 'object' && v !== null && !Array.isArray(v),
    date: (v) => v instanceof Date || /^\d{4}-\d{2}-\d{2}/.test(String(v)),
    email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v)),
};

/**
 * 验证一个值是否符合规则
 */
function validateValue(value, rule, fieldPath) {
    if (value === undefined || value === null || value === '') {
        if (rule.required) return `${fieldPath} is required`;
        return null;
    }
    const typeCheck = TYPES[rule.type];
    if (!typeCheck) throw new Error(`Unknown type: ${rule.type}`);
    if (!typeCheck(value)) return `${fieldPath} must be of type ${rule.type}`;

    if (rule.min !== undefined) {
        const len = typeof value === 'string' ? value.length : value;
        if (len < rule.min) return `${fieldPath} must be >= ${rule.min}`;
    }
    if (rule.max !== undefined) {
        const len = typeof value === 'string' ? value.length : value;
        if (len > rule.max) return `${fieldPath} must be <= ${rule.max}`;
    }
    if (rule.pattern && !rule.pattern.test(String(value))) {
        return `${fieldPath} format invalid`;
    }
    if (rule.enum && !rule.enum.includes(value)) {
        return `${fieldPath} must be one of: ${rule.enum.join(', ')}`;
    }
    if (rule.type === 'object' && rule.fields) {
        for (const [k, r] of Object.entries(rule.fields)) {
            const err = validateValue(value[k], r, `${fieldPath}.${k}`);
            if (err) return err;
        }
    }
    if (rule.type === 'array' && rule.items) {
        for (let i = 0; i < value.length; i++) {
            const err = validateValue(value[i], rule.items, `${fieldPath}[${i}]`);
            if (err) return err;
        }
    }
    return null;
}

function validate(schema) {
    return (req, res, next) => {
        const errors = [];
        for (const source of ['body', 'query', 'params']) {
            const rules = schema[source];
            if (!rules) continue;
            for (const [field, rule] of Object.entries(rules)) {
                const err = validateValue(req[source][field], rule, `${source}.${field}`);
                if (err) errors.push(err);
            }
        }
        if (errors.length > 0) {
            return res.status(400).json({
                success: false,
                message: '参数验证失败',
                errors,
            });
        }
        next();
    };
}

// 常用规则预设
const rules = {
    username: { type: 'string', required: true, min: 3, max: 32, pattern: /^[a-zA-Z0-9_-]+$/ },
    password: { type: 'string', required: true, min: 6, max: 128 },
    id: { type: 'int', required: true, min: 1 },
    month: { type: 'string', required: true, pattern: /^\d{4}-\d{2}$/ },
    date: { type: 'string', required: true, pattern: /^\d{4}-\d{2}-\d{2}$/ },
    amount: { type: 'number', required: true, min: 0, max: 1e10 },
    email: { type: 'email', required: false },
    // 路径参数 id / rid：非 required —— 仅当路由含该参数且传入值时校验，
    // 确保为正整数，挡掉 NaN / 负数 / 0（防越权与错误查询）
    routeId: { type: 'int', min: 1 },
    // GET 分页上限：1..1000，防大查询 DoS
    limit: { type: 'int', min: 1, max: 1000 },
};

module.exports = {
    toNumber,
    toAmount,
    parseCsvLine,
    TRANSACTION_TYPES,
    validate,
    validateValue,
    rules,
};