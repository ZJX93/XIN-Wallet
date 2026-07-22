/* ============================================
   鑫钱包 · 行情缓存服务
   内存 LRU 缓存，TTL 5 分钟，减少外部 API 请求
   ============================================ */

const CACHE_TTL = 5 * 60 * 1000; // 5 分钟
const CACHE_MAX_SIZE = 100; // 最多缓存 100 个行情

class QuoteCache {
    constructor() {
        this.cache = new Map(); // key -> { data, timestamp }
        this.accessOrder = []; // LRU 访问顺序
    }

    /**
     * 生成缓存键
     */
    _key(type, code) {
        return `${type}:${code}`;
    }

    /**
     * 获取缓存
     * @returns {Object|null} 缓存数据或 null
     */
    get(type, code) {
        const key = this._key(type, code);
        const entry = this.cache.get(key);

        if (!entry) return null;

        // 检查是否过期
        if (Date.now() - entry.timestamp > CACHE_TTL) {
            this.cache.delete(key);
            this.accessOrder = this.accessOrder.filter(k => k !== key);
            return null;
        }

        // 更新访问顺序（LRU）
        this.accessOrder = this.accessOrder.filter(k => k !== key);
        this.accessOrder.push(key);

        return entry.data;
    }

    /**
     * 设置缓存
     */
    set(type, code, data) {
        const key = this._key(type, code);

        // 如果已存在，先删除旧记录
        if (this.cache.has(key)) {
            this.accessOrder = this.accessOrder.filter(k => k !== key);
        }

        // 如果缓存已满，移除最久未使用的
        if (this.cache.size >= CACHE_MAX_SIZE && this.accessOrder.length > 0) {
            const oldestKey = this.accessOrder.shift();
            this.cache.delete(oldestKey);
        }

        // 添加新缓存
        this.cache.set(key, {
            data,
            timestamp: Date.now()
        });
        this.accessOrder.push(key);
    }

    /**
     * 清除所有缓存
     */
    clear() {
        this.cache.clear();
        this.accessOrder = [];
    }

    /**
     * 获取缓存统计
     */
    stats() {
        return {
            size: this.cache.size,
            maxSize: CACHE_MAX_SIZE,
            ttl: CACHE_TTL
        };
    }
}

// 单例导出
module.exports = new QuoteCache();
