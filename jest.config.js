module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  // 排除前端测试（前端测试使用单独的配置）
  testPathIgnorePatterns: ['/node_modules/', '/tests/frontend/'],
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
  coverageReporters: ['text', 'lcov', 'html'],
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

