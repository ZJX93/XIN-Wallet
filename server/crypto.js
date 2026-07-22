/* ============================================
   鑫钱包 · 敏感数据加密模块
   使用 AES-256-GCM 对 API Key / Secret 进行加密存储。
   密钥从环境变量 ENCRYPTION_KEY 读取（32 字节 hex）。
   首次部署时自动生成并打印密钥，运维需将其写入 .env 持久化。
   ============================================ */

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const TAG_POSITION = IV_LENGTH;

// 短密钥派生：使用 PBKDF2 替代单次 SHA256（密钥强化 + 抵御暴力）
const PBKDF2_SALT = Buffer.from('xin-wallet-v1-encryption-key', 'utf8');
const PBKDF2_ITERATIONS = 100000;

function getKey() {
    let keyHex = process.env.ENCRYPTION_KEY;
    if (!keyHex) {
        if (process.env.NODE_ENV === 'production') {
            // 生产环境：自动生成 + 强烈警告（避免 process.exit 反复打印导致日志洪水）
            keyHex = crypto.randomBytes(32).toString('hex');
            console.warn('⚠️  ⚠️  ⚠️  生产环境未配置 ENCRYPTION_KEY，已自动生成临时密钥！⚠️  ⚠️  ⚠️');
            console.warn('   容器重启后已加密数据将永久无法解密（API Key / Secret 全部丢失）');
            console.warn('   请设置环境变量 ENCRYPTION_KEY=<openssl rand -hex 32> 并重新部署');
            console.warn(`   临时密钥: ENCRYPTION_KEY=${keyHex}`);
        } else {
            // 开发环境：自动生成 + 提示用户持久化
            keyHex = crypto.randomBytes(32).toString('hex');
            console.warn('⚠️  ENCRYPTION_KEY 未设置，已自动生成临时密钥（仅开发场景）。');
            console.warn(`   ENCRYPTION_KEY=${keyHex}`);
        }
    }
    // 64 hex 字符：直接作为 32 字节密钥使用
    if (keyHex.length === 64 && /^[0-9a-fA-F]+$/.test(keyHex)) {
        return Buffer.from(keyHex, 'hex');
    }
    // 短字符串：使用 PBKDF2 派生 32 字节密钥（防暴力破解）
    return crypto.pbkdf2Sync(keyHex, PBKDF2_SALT, PBKDF2_ITERATIONS, 32, 'sha256');
}

const KEY = getKey();

/**
 * 加密明文，返回 hex 编码的密文（格式：IV[16] + TAG[16] + CIPHERTEXT）
 */
function encrypt(plaintext) {
    if (!plaintext) return null;
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const tag = cipher.getAuthTag();
    // 格式: iv + tag + ciphertext (全部 hex)
    return iv.toString('hex') + tag.toString('hex') + encrypted;
}

/**
 * 解密密文，返回原始明文。若解密失败返回 null（兼容明文回退）。
 */
function decrypt(ciphertext) {
    if (!ciphertext) return null;
    try {
        const buf = Buffer.from(ciphertext, 'hex');
        if (buf.length < IV_LENGTH + TAG_LENGTH) {
            // 长度不足，可能是旧版明文存储，直接返回原值
            return ciphertext;
        }
        const iv = buf.subarray(0, IV_LENGTH);
        const tag = buf.subarray(IV_LENGTH, TAG_POSITION + TAG_LENGTH);
        const encrypted = buf.subarray(TAG_POSITION + TAG_LENGTH);
        const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
        decipher.setAuthTag(tag);
        let decrypted = decipher.update(encrypted, undefined, 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch {
        // 解密失败（密钥变更或旧数据），返回原值（可能是明文）
        return ciphertext;
    }
}

module.exports = { encrypt, decrypt };
