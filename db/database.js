const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'boda.db');

// 确保数据库目录存在
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// 创建数据库连接
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('数据库连接失败:', err);
  } else {
    console.log('数据库连接成功');
  }
});

// 启用外键约束
db.run('PRAGMA foreign_keys = ON');

// 启用WAL模式提高并发性能
db.run('PRAGMA journal_mode = WAL');

// 设置时区为本地时间（SQLite默认使用UTC）
// 注意：SQLite的CURRENT_TIMESTAMP返回UTC时间，我们需要使用datetime('now', 'localtime')

// 初始化数据库表
function initDatabase() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // 管理员表
      db.run(`
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

      // 用户表（普通点单用户）
      db.run(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          phone TEXT UNIQUE NOT NULL,
          name TEXT,
          created_at DATETIME DEFAULT (datetime('now', 'localtime')),
          last_login DATETIME
        )
      `);

      // 菜单分类表
      db.run(`
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

      // 菜单表
      db.run(`
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
          created_at DATETIME DEFAULT (datetime('now', 'localtime')),
          updated_at DATETIME DEFAULT (datetime('now', 'localtime')),
          FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
        )
      `);

      // 折扣规则表
      db.run(`
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

      // 系统设置表
      db.run(`
        CREATE TABLE IF NOT EXISTS settings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          key TEXT UNIQUE NOT NULL,
          value TEXT,
          description TEXT,
          updated_at DATETIME DEFAULT (datetime('now', 'localtime'))
        )
      `);

      // 订单表
      db.run(`
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
          created_at DATETIME DEFAULT (datetime('now', 'localtime')),
          updated_at DATETIME DEFAULT (datetime('now', 'localtime')),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        )
      `);

      // 订单详情表
      db.run(`
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
          toppings TEXT,
          FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
          FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
        )
      `);

      // 操作日志表
      db.run(`
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

      // 周期管理表
      db.run(`
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
      `);

      // 创建索引
      db.run('CREATE INDEX IF NOT EXISTS idx_orders_phone ON orders(customer_phone)');
      db.run('CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)');
      db.run('CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at)');
      db.run('CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id)');
      db.run('CREATE INDEX IF NOT EXISTS idx_logs_admin ON logs(admin_id)');
      db.run('CREATE INDEX IF NOT EXISTS idx_logs_created ON logs(created_at)');

      console.log('数据库表初始化完成');
      resolve();
    });
  });
}

// Promise化的数据库操作
function runAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function getAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function allAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

// 事务支持
function beginTransaction() {
  return runAsync('BEGIN TRANSACTION');
}

function commit() {
  return runAsync('COMMIT');
}

function rollback() {
  return runAsync('ROLLBACK');
}

// 关闭数据库连接
function closeDatabase() {
  return new Promise((resolve, reject) => {
    db.close((err) => {
      if (err) {
        reject(err);
      } else {
        console.log('数据库连接已关闭');
        resolve();
      }
    });
  });
}

// 获取当前本地时间（用于替换CURRENT_TIMESTAMP）
function getCurrentLocalTime() {
  return "datetime('now', 'localtime')";
}

module.exports = {
  db,
  initDatabase,
  runAsync,
  getAsync,
  allAsync,
  beginTransaction,
  commit,
  rollback,
  closeDatabase,
  getCurrentLocalTime
};

