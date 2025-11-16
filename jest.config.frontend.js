/**
 * 前端测试配置
 * 使用jsdom环境来模拟DOM
 */
module.exports = {
  testEnvironment: 'jsdom',
  testMatch: ['**/tests/frontend/**/*.test.js'],
  setupFilesAfterEnv: ['<rootDir>/tests/frontend/setup.js'],
  collectCoverageFrom: [
    'public/**/*.js',
    '!public/**/*.min.js',
    '!**/node_modules/**',
    '!**/logs/**',
    '!**/tests/**'
  ],
  coverageDirectory: 'coverage/frontend',
  coverageReporters: ['text', 'lcov', 'html'],
  setupFilesAfterEnv: ['<rootDir>/tests/frontend/setup.js'],
  verbose: true,
  testTimeout: 10000
};

