/**
 * Simple in-memory key-value TTL Cache Service
 */
class CacheService {
  constructor() {
    this.cache = new Map();
  }

  /**
   * Get cached item value if not expired.
   * @param {string} key
   * @returns {*} Cached value or null.
   */
  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return null;
    }
    return entry.value;
  }

  /**
   * Set cache item with expiration.
   * @param {string} key
   * @param {*} value
   * @param {number} ttlSeconds
   */
  set(key, value, ttlSeconds = 60) {
    this.cache.set(key, {
      value,
      expiry: Date.now() + (ttlSeconds * 1000)
    });
  }

  /**
   * Clear all cache entries.
   */
  clear() {
    this.cache.clear();
    console.log('Search Cache cleared successfully.');
  }
}

module.exports = new CacheService();
