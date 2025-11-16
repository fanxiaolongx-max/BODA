const cache = require('../../utils/cache');

describe('Cache Utility', () => {
  beforeEach(() => {
    // 每个测试前清空缓存
    cache.clear();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    cache.clear();
  });

  describe('set and get', () => {
    it('should set and get a value', () => {
      cache.set('test-key', 'test-value');
      expect(cache.get('test-key')).toBe('test-value');
    });

    it('should return null for non-existent key', () => {
      expect(cache.get('non-existent')).toBeNull();
    });

    it('should return null for expired key', () => {
      cache.set('test-key', 'test-value', 1000); // 1 second TTL
      expect(cache.get('test-key')).toBe('test-value');
      
      // 快进时间超过TTL
      jest.advanceTimersByTime(1001);
      expect(cache.get('test-key')).toBeNull();
    });

    it('should use default TTL of 5 minutes', () => {
      cache.set('test-key', 'test-value');
      expect(cache.get('test-key')).toBe('test-value');
      
      // 快进4分59秒，应该还在
      jest.advanceTimersByTime(4 * 60 * 1000 + 59 * 1000);
      expect(cache.get('test-key')).toBe('test-value');
      
      // 快进到5分1秒，应该过期
      jest.advanceTimersByTime(2000);
      expect(cache.get('test-key')).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete a key', () => {
      cache.set('test-key', 'test-value');
      expect(cache.get('test-key')).toBe('test-value');
      
      cache.delete('test-key');
      expect(cache.get('test-key')).toBeNull();
    });

    it('should clear timer when deleting', () => {
      cache.set('test-key', 'test-value', 1000);
      cache.delete('test-key');
      
      // 即使时间过去，也不应该触发过期
      jest.advanceTimersByTime(2000);
      expect(cache.get('test-key')).toBeNull();
    });
  });

  describe('clear', () => {
    it('should clear all cache', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      expect(cache.size()).toBe(2);
      
      cache.clear();
      expect(cache.size()).toBe(0);
      expect(cache.get('key1')).toBeNull();
      expect(cache.get('key2')).toBeNull();
    });
  });

  describe('has', () => {
    it('should return true for existing key', () => {
      cache.set('test-key', 'test-value');
      expect(cache.has('test-key')).toBe(true);
    });

    it('should return false for non-existent key', () => {
      expect(cache.has('non-existent')).toBe(false);
    });

    it('should return false for expired key', () => {
      cache.set('test-key', 'test-value', 1000);
      jest.advanceTimersByTime(1001);
      expect(cache.has('test-key')).toBe(false);
    });
  });

  describe('size', () => {
    it('should return correct cache size', () => {
      expect(cache.size()).toBe(0);
      cache.set('key1', 'value1');
      expect(cache.size()).toBe(1);
      cache.set('key2', 'value2');
      expect(cache.size()).toBe(2);
      cache.delete('key1');
      expect(cache.size()).toBe(1);
    });
  });

  describe('update existing key', () => {
    it('should update existing key and reset timer', () => {
      cache.set('test-key', 'value1', 1000);
      expect(cache.get('test-key')).toBe('value1');
      
      // 快进500ms
      jest.advanceTimersByTime(500);
      
      // 更新值，应该重置定时器
      cache.set('test-key', 'value2', 1000);
      expect(cache.get('test-key')).toBe('value2');
      
      // 再快进500ms，应该还在（因为定时器被重置了）
      jest.advanceTimersByTime(500);
      expect(cache.get('test-key')).toBe('value2');
      
      // 再快进500ms，应该过期
      jest.advanceTimersByTime(500);
      expect(cache.get('test-key')).toBeNull();
    });
  });
});

