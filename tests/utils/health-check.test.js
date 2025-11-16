const { performHealthCheck } = require('../../utils/health-check');
const path = require('path');

// Mock数据库模块
jest.mock('../../db/database', () => ({
  getAsync: jest.fn()
}));

const { getAsync } = require('../../db/database');

// Mock fs模块
jest.mock('fs', () => ({
  statSync: jest.fn()
}));

const fs = require('fs');

describe('Health Check', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('performHealthCheck', () => {
    it('should return healthy status when all checks pass', async () => {
      // Mock数据库查询成功
      getAsync.mockResolvedValue({});

      // Mock文件系统
      const mockStats = {
        size: 1024 * 1024 * 10 // 10MB
      };
      fs.statSync = jest.fn().mockReturnValue(mockStats);

      // Mock内存使用（正常范围）
      const originalMemoryUsage = process.memoryUsage;
      process.memoryUsage = jest.fn(() => ({
        rss: 50 * 1024 * 1024,
        heapTotal: 100 * 1024 * 1024,
        heapUsed: 40 * 1024 * 1024
      }));

      const result = await performHealthCheck();

      expect(result.status).toBe('healthy');
      expect(result.checks.database.status).toBe('healthy');
      expect(result.checks.disk.status).toBe('healthy');
      expect(result.checks.memory.status).toBe('healthy');
      expect(result.timestamp).toBeDefined();

      // 恢复原始函数
      process.memoryUsage = originalMemoryUsage;
    });

    it('should return unhealthy status when database check fails', async () => {
      // Mock数据库查询失败
      getAsync.mockRejectedValue(new Error('Database connection failed'));

      // Mock文件系统
      const mockStats = {
        size: 1024 * 1024 * 10
      };
      fs.statSync.mockReturnValue(mockStats);

      // Mock内存使用
      const originalMemoryUsage = process.memoryUsage;
      process.memoryUsage = jest.fn(() => ({
        rss: 50 * 1024 * 1024,
        heapTotal: 100 * 1024 * 1024,
        heapUsed: 40 * 1024 * 1024
      }));

      const result = await performHealthCheck();

      expect(result.status).toBe('unhealthy');
      expect(result.checks.database.status).toBe('unhealthy');
      expect(result.checks.database.message).toContain('Database connection failed');

      process.memoryUsage = originalMemoryUsage;
    });

    it('should return warning status when database size is too large', async () => {
      getAsync.mockResolvedValue({});

      // Mock大数据库文件（超过1GB）
      const mockStats = {
        size: 1024 * 1024 * 1024 * 1.5 // 1.5GB
      };
      fs.statSync = jest.fn().mockReturnValue(mockStats);

      const originalMemoryUsage = process.memoryUsage;
      process.memoryUsage = jest.fn(() => ({
        rss: 50 * 1024 * 1024,
        heapTotal: 100 * 1024 * 1024,
        heapUsed: 40 * 1024 * 1024
      }));

      const result = await performHealthCheck();

      expect(result.status).toBe('warning');
      expect(result.checks.disk.status).toBe('warning');
      expect(result.checks.disk.message).toContain('consider archiving');

      process.memoryUsage = originalMemoryUsage;
    });

    it('should return warning status when memory usage is high', async () => {
      getAsync.mockResolvedValue({});

      const mockStats = {
        size: 1024 * 1024 * 10
      };
      fs.statSync.mockReturnValue(mockStats);

      // Mock高内存使用（超过500MB）
      const originalMemoryUsage = process.memoryUsage;
      process.memoryUsage = jest.fn(() => ({
        rss: 600 * 1024 * 1024,
        heapTotal: 800 * 1024 * 1024,
        heapUsed: 600 * 1024 * 1024
      }));

      const result = await performHealthCheck();

      expect(result.status).toBe('warning');
      expect(result.checks.memory.status).toBe('warning');

      process.memoryUsage = originalMemoryUsage;
    });

    it('should handle file system errors gracefully', async () => {
      getAsync.mockResolvedValue({});

      // Mock文件系统错误
      fs.statSync = jest.fn().mockImplementation(() => {
        throw new Error('File not found');
      });

      const originalMemoryUsage = process.memoryUsage;
      process.memoryUsage = jest.fn(() => ({
        rss: 50 * 1024 * 1024,
        heapTotal: 100 * 1024 * 1024,
        heapUsed: 40 * 1024 * 1024
      }));

      const result = await performHealthCheck();

      expect(result.checks.disk.status).toBe('unknown');
      expect(result.checks.disk.message).toContain('Cannot check disk');

      process.memoryUsage = originalMemoryUsage;
    });

    it('should handle memory check errors gracefully', async () => {
      getAsync.mockResolvedValue({});

      const mockStats = {
        size: 1024 * 1024 * 10
      };
      fs.statSync.mockReturnValue(mockStats);

      // Mock内存检查错误
      const originalMemoryUsage = process.memoryUsage;
      process.memoryUsage = jest.fn(() => {
        throw new Error('Memory check failed');
      });

      const result = await performHealthCheck();

      expect(result.checks.memory.status).toBe('unknown');
      expect(result.checks.memory.message).toContain('Cannot check memory');

      process.memoryUsage = originalMemoryUsage;
    });
  });
});

