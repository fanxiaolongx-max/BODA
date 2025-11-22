module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  // 不再排除前端测试，允许在运行全部测试时包含前端测试
  // 前端测试文件会通过 @jest-environment jsdom 注释指定环境
  testPathIgnorePatterns: ['/node_modules/'],
  collectCoverageFrom: [
    'routes/**/*.js',
    'middleware/**/*.js',
    'utils/**/*.js',
    // 排除数据库迁移脚本（这些是初始化脚本，通常不需要测试）
    '!db/**/*.js',
    '!**/node_modules/**',
    '!**/logs/**',
    '!**/tests/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html', 'json-summary'],
  coverageThreshold: {
    global: {
      branches: 60,
      functions: 60,
      lines: 60,
      statements: 60
    }
  },
  testTimeout: 10000,
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  globalTeardown: '<rootDir>/tests/teardown.js',
  verbose: true,
  maxWorkers: 1, // 串行执行测试，避免数据库并发问题
  forceExit: true // 测试完成后强制退出
};

