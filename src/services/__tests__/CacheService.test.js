const cacheService = require('../CacheService');

describe('CacheService', () => {
  beforeEach(() => {
    cacheService.clear();
  });

  test('Should set and get cache values', () => {
    cacheService.set('test-key', { data: 123 }, 5);
    expect(cacheService.get('test-key')).toEqual({ data: 123 });
  });

  test('Should return null for missing or expired keys', async () => {
    cacheService.set('short-key', 'value', 0.1); // 100ms
    expect(cacheService.get('short-key')).toBe('value');

    // Wait 150ms for expiration
    await new Promise(resolve => setTimeout(resolve, 150));
    expect(cacheService.get('short-key')).toBeNull();
  });

  test('Should clear all keys on clear call', () => {
    cacheService.set('k1', 'v1');
    cacheService.set('k2', 'v2');
    cacheService.clear();
    expect(cacheService.get('k1')).toBeNull();
    expect(cacheService.get('k2')).toBeNull();
  });
});
