/* ============================================
   鑫钱包 · SSRF 防护模块
   校验外发 URL 拒绝指向内网/链路本地地址的请求。
   适用场景：AI Provider base_url 由用户配置，可能被恶意指向
   云实例元数据服务（169.254.169.254）、本地数据库、内网服务等。
   ============================================ */

const dns = require('dns').promises;
const net = require('net');

// IPv4 私有/回环/链路本地段（采用 start & mask 模式匹配，避免对大数值做位运算时溢出/出错）
const PRIVATE_RANGES_V4 = [
    [ipToLongSafe('10.0.0.0'), 0xff000000],          // 10.0.0.0/8
    [ipToLongSafe('127.0.0.0'), 0xff000000],          // 127.0.0.0/8 (loopback)
    [ipToLongSafe('169.254.0.0'), 0xffff0000],        // 169.254.0.0/16 (link-local + AWS metadata!)
    [ipToLongSafe('172.16.0.0'), 0xfff00000],         // 172.16.0.0/12
    [ipToLongSafe('192.168.0.0'), 0xffff0000],        // 192.168.0.0/16
    [ipToLongSafe('0.0.0.0'), 0xff000000],           // 0.0.0.0/8
    [ipToLongSafe('100.64.0.0'), 0xffc00000],        // 100.64.0.0/10 (CGN)
    [ipToLongSafe('224.0.0.0'), 0xf0000000],         // 224.0.0.0/4 (multicast)
    [ipToLongSafe('240.0.0.0'), 0xf0000000],         // 240.0.0.0/4 (reserved/broadcast)
];

function ipToLongSafe(ip) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) {
        throw new Error(`非法 IP 字面量: ${ip}`);
    }
    return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function isPrivateIPv4(ip) {
    try {
        const long = ipToLongSafe(ip);
        return PRIVATE_RANGES_V4.some(([base, mask]) => (long & mask) === (base & mask));
    } catch {
        return true; // 解析不出按最严格处理
    }
}

function isPrivateIPv6(ip) {
    const norm = ip.toLowerCase();
    // ::1（IPv6 loopback）
    if (norm === '::1' || norm === '0:0:0:0:0:0:0:1') return true;
    // fe80::/10（链路本地）
    if (norm.startsWith('fe8') || norm.startsWith('fe9') || norm.startsWith('fea') || norm.startsWith('feb')) return true;
    // fc00::/7（唯一本地）
    if (/^f[cd]/.test(norm)) return true;
    // ::ffff:0:0/96（IPv4 映射地址）—— 转入 IPv4 链路本地/私网段同样危险
    const v4Mapped = norm.match(/^::ffff:([0-9.]+)$/);
    if (v4Mapped) return isPrivateIPv4(v4Mapped[1]);
    return false;
}

/**
 * 异步校验 URL：协议白名单 + 拒绝内网地址。
 * 域名需 DNS 解析后再次校验（防 DNS rebinding 与字母绕过）。
 *
 * @param {string} urlStr 用户输入的外发 URL
 * @returns {Promise<URL>} 通过校验的 URL 对象
 * @throws 协议非法或地址指向内网/链路本地
 */
async function assertPublicUrl(urlStr) {
    let u;
    try {
        u = new URL(urlStr);
    } catch {
        throw new Error('URL 格式无效');
    }
    if (!['http:', 'https:'].includes(u.protocol)) {
        throw new Error('仅支持 HTTP/HTTPS 协议');
    }

    // 剥去 IPv6 字面量的方括号（http://[::1]/ 这种写法）
    let host = u.hostname.replace(/^\[|\]$/g, '');
    if (!host) throw new Error('URL 缺少主机名');

    if (host === 'localhost') throw new Error('禁止访问 localhost');
    if (net.isIP(host) === 4) {
        if (isPrivateIPv4(host)) throw new Error(`禁止访问内网地址: ${host}`);
        return u;
    }
    if (net.isIP(host) === 6) {
        if (isPrivateIPv6(host)) throw new Error(`禁止访问内网地址: ${host}`);
        return u;
    }

    // 域名：解析所有 A/AAAA 记录，任意一条指向内网即拒绝
    try {
        const records = await dns.lookup(host, { all: true });
        if (!records.length) throw new Error(`域名无法解析: ${host}`);
        for (const r of records) {
            if (net.isIPv4(r.address) && isPrivateIPv4(r.address)) {
                throw new Error(`域名 ${host} 解析到内网地址: ${r.address}`);
            }
            if (net.isIPv6(r.address) && isPrivateIPv6(r.address)) {
                throw new Error(`域名 ${host} 解析到内网地址: ${r.address}`);
            }
        }
    } catch (err) {
        if (err.code === 'ENOTFOUND') throw new Error(`域名无法解析: ${host}`);
        throw err;
    }

    return u;
}

module.exports = { assertPublicUrl, isPrivateIPv4, isPrivateIPv6 };
