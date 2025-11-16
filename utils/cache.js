/**
 * 简单的内存缓存实现
 * 用于缓存频繁查询的数据，减少数据库访问
 */

class MemoryCache {
  constructor() {
    this.cache = new Map();
    this.timers = new Map();
  }

  /**
   * 设置缓存
   * @param {string} key - 缓存键
   * @param {*} value - 缓存值
   * @param {number} ttl - 过期时间（毫秒），默认5分钟
   */
  set(key, value, ttl = 5 * 60 * 1000) {
    // 清除旧的定时器
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key));
    }

    // 设置缓存
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttl
    });

    // 设置过期定时器
    const timer = setTimeout(() => {
      this.delete(key);
    }, ttl);
    this.timers.set(key, timer);
  }

  /**
   * 获取缓存
   * @param {string} key - 缓存键
   * @returns {*|null} 缓存值，如果不存在或已过期则返回null
   */
  get(key) {
    const item = this.cache.get(key);
    if (!item) {
      return null;
    }

    // 检查是否过期
    if (Date.now() > item.expiresAt) {
      this.delete(key);
      return null;
    }

    return item.value;
  }

  /**
   * 删除缓存
   * @param {string} key - 缓存键
   */
  delete(key) {
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key));
      this.timers.delete(key);
    }
    this.cache.delete(key);
  }

  /**
   * 清空所有缓存
   */
  clear() {
    // 清除所有定时器
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    this.cache.clear();
  }

  /**
   * 检查缓存是否存在且未过期
   * @param {string} key - 缓存键
   * @returns {boolean} 是否存在且未过期
   */
  has(key) {
    const item = this.cache.get(key);
    if (!item) {
      return false;
    }
    if (Date.now() > item.expiresAt) {
      this.delete(key);
      return false;
    }
    return true;
  }

  /**
   * 获取缓存大小
   * @returns {number} 缓存项数量
   */
  size() {
    return this.cache.size;
  }
}

// 创建全局缓存实例
const cache = new MemoryCache();

module.exports = cache;

