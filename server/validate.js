/* ============================================
   鑫钱包 · 输入校验与解析工具
   纯函数，便于单元测试，不依赖 Express / 数据库
   ============================================ */

// 安全数值转换：空值 / 非数字统一返回 null，调用方据此返回 400，
// 避免 NaN 被写入余额或金额字段导致账目错乱。
function toNumber(value) {
    if (value === undefined || value === null || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
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

module.exports = { toNumber, TRANSACTION_TYPES, parseCsvLine };
