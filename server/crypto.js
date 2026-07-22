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

function getKey() {
    let keyHex = process.env.ENCRYPTION_KEY;
    if (!keyHex) {
        // 首次启动自动生成密钥（仅开发/首次部署场景；生产应手动配置）
        keyHex = crypto.randomBytes(32).toString('hex');
        console.warn('⚠️  ENCRYPTION_KEY 未设置，已自动生成临时密钥。');
        console.warn('   请将以下配置写入 .env 文件以持久化（否则重启后已加密数据无法解密）:');
        console.warn(`   ENCRYPTION_KEY=${keyHex}`);
    }
    // 确保是 32 字节的 Buffer
    if (keyHex.length === 64) {
        return Buffer.from(keyHex, 'hex');
    }
    // 如果用户设置了短字符串，用 sha256 派生 32 字节密钥
    return crypto.createHash('sha256').update(keyHex).digest();
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
