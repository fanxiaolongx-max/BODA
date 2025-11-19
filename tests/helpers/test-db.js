const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const TEST_DB_PATH = path.join(__dirname, '../../db/test-boda.db');

let testDb = null;
let transactionInProgress = false;
let transactionQueue = [];

// 创建测试数据库连接
function createTestDatabase() {
  return new Promise((resolve, reject) => {
    // 如果测试数据库已存在，先删除
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }

    testDb = new sqlite3.Database(TEST_DB_PATH, (err) => {
      if (err) {
        reject(err);
      } else {
        // 启用外键约束
        testDb.run('PRAGMA foreign_keys = ON');
        // 启用WAL模式
        testDb.run('PRAGMA journal_mode = WAL');
        // 设置busy_timeout：当数据库被锁定时，自动等待最多5秒（提升并发能力）
        testDb.run('PRAGMA busy_timeout = 5000');
        // 设置synchronous：NORMAL模式平衡性能和安全性（提升写入性能）
        testDb.run('PRAGMA synchronous = NORMAL');
        resolve(testDb);
      }
    });
  });
}

// 初始化测试数据库表
function initTestDatabase() {
  return new Promise((resolve, reject) => {
    if (!testDb) {
      reject(new Error('Test database not created'));
      return;
    }

    testDb.serialize(() => {
      // 管理员表
      testDb.run(`
        CREATE TABLE IF NOT EXISTS admins (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          name TEXT,
          email TEXT,
          role TEXT DEFAULT 'admin',
          status TEXT DEFAULT 'active',
          created_at DATETIME DEFAULT (datetime('now', 'localtime')),
          updated_at DATETIME DEFAULT (datetime('now', 'localtime'))
        )
      `);

      // 用户表
      testDb.run(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          phone TEXT UNIQUE NOT NULL,
          name TEXT,
          created_at DATETIME DEFAULT (datetime('now', 'localtime')),
          last_login DATETIME
        )
      `);

      // 分类表
      testDb.run(`
        CREATE TABLE IF NOT EXISTS categories (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          description TEXT,
          sort_order INTEGER DEFAULT 0,
          status TEXT DEFAULT 'active',
          created_at DATETIME DEFAULT (datetime('now', 'localtime')),
          updated_at DATETIME DEFAULT (datetime('now', 'localtime'))
        )
      `);

      // 产品表
      testDb.run(`
        CREATE TABLE IF NOT EXISTS products (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          description TEXT,
          price REAL NOT NULL,
          category_id INTEGER,
          image_url TEXT,
          status TEXT DEFAULT 'active',
          sort_order INTEGER DEFAULT 0,
          sizes TEXT DEFAULT '{}',
          sugar_levels TEXT DEFAULT '["0","30","50","70","100"]',
          available_toppings TEXT DEFAULT '[]',
          ice_options TEXT DEFAULT '["normal","less","no","room","hot"]',
          created_at DATETIME DEFAULT (datetime('now', 'localtime')),
          updated_at DATETIME DEFAULT (datetime('now', 'localtime')),
          FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
        )
      `);

      // 折扣规则表
      testDb.run(`
        CREATE TABLE IF NOT EXISTS discount_rules (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          min_amount REAL NOT NULL,
          max_amount REAL,
          discount_rate REAL NOT NULL,
          description TEXT,
          status TEXT DEFAULT 'active',
          created_at DATETIME DEFAULT (datetime('now', 'localtime')),
          updated_at DATETIME DEFAULT (datetime('now', 'localtime'))
        )
      `);

      // 设置表
      testDb.run(`
        CREATE TABLE IF NOT EXISTS settings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          key TEXT UNIQUE NOT NULL,
          value TEXT,
          description TEXT,
          updated_at DATETIME DEFAULT (datetime('now', 'localtime'))
        )
      `);

      // 订单表
      testDb.run(`
        CREATE TABLE IF NOT EXISTS orders (
          id TEXT PRIMARY KEY,
          order_number TEXT UNIQUE NOT NULL,
          user_id INTEGER,
          customer_name TEXT,
          customer_phone TEXT NOT NULL,
          total_amount REAL NOT NULL,
          discount_amount REAL DEFAULT 0,
          final_amount REAL NOT NULL,
          status TEXT DEFAULT 'pending',
          payment_image TEXT,
          payment_time DATETIME,
          notes TEXT,
          cycle_id INTEGER,
          created_at DATETIME DEFAULT (datetime('now', 'localtime')),
          updated_at DATETIME DEFAULT (datetime('now', 'localtime')),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        )
      `);

      // 订单详情表
      testDb.run(`
        CREATE TABLE IF NOT EXISTS order_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          order_id TEXT NOT NULL,
          product_id INTEGER NOT NULL,
          product_name TEXT NOT NULL,
          product_price REAL NOT NULL,
          quantity INTEGER NOT NULL,
          subtotal REAL NOT NULL,
          size TEXT,
          sugar_level TEXT,
          ice_level TEXT,
          toppings TEXT,
          unit_price REAL,
          FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
          FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
        )
      `);

      // 日志表
      testDb.run(`
        CREATE TABLE IF NOT EXISTS logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          admin_id INTEGER,
          action TEXT NOT NULL,
          target_type TEXT,
          target_id TEXT,
          details TEXT,
          ip_address TEXT,
          user_agent TEXT,
          created_at DATETIME DEFAULT (datetime('now', 'localtime')),
          FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE SET NULL
        )
      `);

      // 周期表
      testDb.run(`
        CREATE TABLE IF NOT EXISTS ordering_cycles (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          cycle_number TEXT UNIQUE NOT NULL,
          start_time DATETIME NOT NULL,
          end_time DATETIME,
          status TEXT DEFAULT 'active',
          total_amount REAL DEFAULT 0,
          discount_rate REAL DEFAULT 0,
          confirmed_at DATETIME,
          created_at DATETIME DEFAULT (datetime('now', 'localtime')),
          updated_at DATETIME DEFAULT (datetime('now', 'localtime'))
        )
      `, (err) => {
        if (err) {
          reject(err);
          return;
        }

        // 创建索引
        testDb.run('CREATE INDEX IF NOT EXISTS idx_orders_phone ON orders(customer_phone)', (err) => {
          if (err && !err.message.includes('no such table')) {
            reject(err);
            return;
          }
          testDb.run('CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)', (err) => {
            if (err && !err.message.includes('no such table')) {
              reject(err);
              return;
            }
            testDb.run('CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at)', (err) => {
              if (err && !err.message.includes('no such table')) {
                reject(err);
                return;
              }
              testDb.run('CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id)', (err) => {
                if (err && !err.message.includes('no such table')) {
                  reject(err);
                  return;
                }
                testDb.run('CREATE INDEX IF NOT EXISTS idx_logs_admin ON logs(admin_id)', (err) => {
                  if (err && !err.message.includes('no such table')) {
                    reject(err);
                    return;
                  }
                  testDb.run('CREATE INDEX IF NOT EXISTS idx_logs_created ON logs(created_at)', (err) => {
                    if (err && !err.message.includes('no such table')) {
                      reject(err);
                      return;
                    }
                    // 等待所有操作完成
                    testDb.wait((err) => {
                      if (err) {
                        reject(err);
                      } else {
                        resolve();
                      }
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  });
}

// 清理测试数据库（只删除数据，保留表结构）
function clearTestDatabase() {
  return new Promise((resolve, reject) => {
    if (!testDb) {
      resolve();
      return;
    }

    testDb.serialize(() => {
      // 按顺序删除，考虑外键约束
      // 忽略表不存在的错误（可能在初始化前调用）
      const deleteTable = (tableName, callback) => {
        testDb.run(`DELETE FROM ${tableName}`, (err) => {
          // 忽略表不存在的错误
          if (err && !err.message.includes('no such table')) {
            console.error(`Error deleting ${tableName}:`, err);
          }
          if (callback) callback(err);
        });
      };

      deleteTable('order_items');
      deleteTable('orders');
      deleteTable('logs');
      deleteTable('ordering_cycles');
      deleteTable('products');
      deleteTable('categories');
      deleteTable('discount_rules');
      deleteTable('settings');
      deleteTable('users');
      deleteTable('admins', (err) => {
        // 即使有错误也resolve，因为可能是表不存在
        resolve();
      });
    });
  });
}

// 关闭测试数据库
function closeTestDatabase() {
  return new Promise((resolve, reject) => {
    if (!testDb) {
      resolve();
      return;
    }

    testDb.close((err) => {
      if (err) {
        reject(err);
      } else {
        // 删除测试数据库文件
        if (fs.existsSync(TEST_DB_PATH)) {
          fs.unlinkSync(TEST_DB_PATH);
        }
        testDb = null;
        resolve();
      }
    });
  });
}

// Promise化的数据库操作
function runAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    testDb.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function getAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    testDb.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function allAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    testDb.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

// 事务队列管理（确保事务串行执行，避免并发冲突）
async function beginTransaction() {
  // 如果已经有事务在进行，等待它完成（最多等待5秒，避免死锁）
  let waitCount = 0;
  const maxWait = 500; // 最多等待5秒（500 * 10ms）
  
  while (transactionInProgress && waitCount < maxWait) {
    await new Promise(resolve => setTimeout(resolve, 10));
    waitCount++;
  }
  
  // 如果等待超时，强制重置（可能是之前的测试没有正确清理）
  if (transactionInProgress && waitCount >= maxWait) {
    console.warn('事务队列等待超时，强制重置 transactionInProgress 标志');
    transactionInProgress = false;
  }
  
  transactionInProgress = true;
  try {
    // 使用 BEGIN IMMEDIATE 来避免并发事务冲突
    // IMMEDIATE 模式会立即获取写锁，避免 "cannot start a transaction within a transaction" 错误
    await runAsync('BEGIN IMMEDIATE TRANSACTION');
  } catch (error) {
    transactionInProgress = false;
    throw error;
  }
}

function commit() {
  transactionInProgress = false;
  return runAsync('COMMIT');
}

function rollback() {
  transactionInProgress = false;
  return runAsync('ROLLBACK');
}


module.exports = {
  createTestDatabase,
  initTestDatabase,
  clearTestDatabase,
  closeTestDatabase,
  runAsync,
  getAsync,
  allAsync,
  beginTransaction,
  commit,
  rollback,
  getDb: () => testDb
};

