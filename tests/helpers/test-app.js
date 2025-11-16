const express = require('express');
const session = require('express-session');
const { getDb } = require('./test-db');

// 创建测试用的Express应用
function createTestApp() {
  const app = express();
  
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  
  // 使用内存存储的session（测试用）
  app.use(session({
    secret: 'test-secret',
    resave: false,
    saveUninitialized: false,
    store: new (require('express-session').MemoryStore)()
  }));

  // 模拟数据库操作 - 使用测试数据库
  const originalRequire = require;
  const Module = require('module');
  const originalRequireModule = Module.prototype.require;
  
  Module.prototype.require = function(...args) {
    if (args[0] === '../db/database' || args[0] === './db/database') {
      // 返回测试数据库操作
      const testDb = getDb();
      if (!testDb) {
        throw new Error('Test database not initialized');
      }
      
      return {
        runAsync: require('./test-db').runAsync,
        getAsync: require('./test-db').getAsync,
        allAsync: require('./test-db').allAsync,
        beginTransaction: require('./test-db').beginTransaction,
        commit: require('./test-db').commit,
        rollback: require('./test-db').rollback,
        db: testDb
      };
    }
    return originalRequireModule.apply(this, args);
  };

  return app;
}

module.exports = { createTestApp };

