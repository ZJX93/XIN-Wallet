/* ============================================
   鑫钱包 · 敏感数据加密模块
   使用 AES-256-GCM 对 API Key / Secret 进行加密存储。
   密钥优先级（从高到低）：
     1) 环境变量 ENCRYPTION_KEY（运维显式设置，最稳）
     2) /app/data/.encryption-key（容器启动时从数据卷读取，跨重启稳定）
     3) 首次启动自动生成并写入数据卷（最方便）
   这样：
     - docker-compose up -d → 密钥保持稳定（数据可解密）
     - docker-compose down -v → 数据+密钥一起清除（安全）
   ============================================ */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const TAG_POSITION = IV_LENGTH;

// 短密钥派生：使用 PBKDF2 替代单次 SHA256（密钥强化 + 抵御暴力）
const PBKDF2_SALT = Buffer.from('xin-wallet-v1-encryption-key', 'utf8');
const PBKDF2_ITERATIONS = 100000;

// 密钥持久化路径：放在数据卷内（/app/data/）
// 第一次启动生成并写入，后续启动读取——保证容器重启后密钥稳定
const KEY_FILE = process.env.ENCRYPTION_KEY_FILE || '/app/data/.encryption-key';

function readKeyFile() {
    try {
        return fs.readFileSync(KEY_FILE, 'utf8').trim();
    } catch {
        return null;
    }
}

function writeKeyFile(keyHex) {
    try {
        const dir = path.dirname(KEY_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(KEY_FILE, keyHex, { mode: 0o600 }); // 仅 owner 可读
    } catch (err) {
        console.warn(`⚠️  无法写入加密密钥文件 ${KEY_FILE}: ${err.message}`);
    }
}

function getKey() {
    // 优先级 1：环境变量（非空字符串）
    let keyHex = process.env.ENCRYPTION_KEY;
    if (keyHex && keyHex.trim()) {
        return deriveKey(keyHex.trim());
    }
    // 优先级 2：从数据卷读取
    keyHex = readKeyFile();
    if (keyHex) {
        if (process.env.NODE_ENV !== 'production') {
            console.log('🔐 从数据卷读取 ENCRYPTION_KEY');
        }
        return deriveKey(keyHex);
    }
    // 优先级 3：首次启动自动生成 + 持久化
    keyHex = crypto.randomBytes(32).toString('hex');
    writeKeyFile(keyHex);
    console.warn('🔐 首次启动自动生成 ENCRYPTION_KEY（已写入 ' + KEY_FILE + '）');
    console.warn('   后续容器重启将自动使用此密钥');
    if (process.env.NODE_ENV === 'production') {
        console.warn('   ⚠️  生产环境建议显式设置 ENCRYPTION_KEY 环境变量以增强可控性');
        console.warn(`      密钥: ENCRYPTION_KEY=${keyHex}`);
    }
    return deriveKey(keyHex);
}

function deriveKey(keyHex) {
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