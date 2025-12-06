const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// 支持 fly.io 持久化卷：如果 /data 目录存在，使用 /data，否则使用本地 db 目录
const DB_DIR = fs.existsSync('/data') ? '/data' : path.join(__dirname);
const DB_PATH = path.join(DB_DIR, 'boda.db');

// 确保数据库目录存在
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// 创建数据库连接
// 使用 WAL 模式需要保持连接打开，不要过早关闭
// 注意：这个连接必须在整个服务器运行期间保持打开
let db = null;
let dbReady = false;
let dbReadyPromise = null;
let dbReadyResolve = null;
let dbReadyReject = null;

// 创建 Promise 来等待数据库连接建立
dbReadyPromise = new Promise((resolve, reject) => {
  dbReadyResolve = resolve;
  dbReadyReject = reject;
});

try {
  console.log('正在创建数据库连接...', { DB_PATH, DB_DIR, exists: fs.existsSync(DB_DIR) });
  
  db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
    if (err) {
      console.error('数据库连接失败:', err);
      console.error('数据库路径:', DB_PATH);
      console.error('数据库目录存在:', fs.existsSync(DB_DIR));
      console.error('数据库文件存在:', fs.existsSync(DB_PATH));
      dbReady = false;
      if (dbReadyReject) {
        dbReadyReject(err);
      }
      process.exit(1); // 如果数据库连接失败，退出进程
    } else {
      console.log('数据库连接成功:', DB_PATH);
      dbReady = true;
      if (dbReadyResolve) {
        dbReadyResolve();
      }
    }
  });

  // 处理数据库错误
  db.on('error', (err) => {
    console.error('数据库错误:', err);
    getLogger().error('数据库错误', { error: err.message });
    dbReady = false;
  });
} catch (error) {
  console.error('创建数据库连接时出错:', error);
  console.error('错误堆栈:', error.stack);
  if (dbReadyReject) {
    dbReadyReject(error);
  }
  process.exit(1);
}

// 等待数据库连接就绪的函数
async function waitForDbReady() {
  if (dbReady) {
    return;
  }
  await dbReadyPromise;
}

// 启用外键约束（需要等待数据库连接建立）
if (db) {
  db.run('PRAGMA foreign_keys = ON', (err) => {
    if (err) {
      console.error('设置外键约束失败:', err);
    }
  });

  // 启用WAL模式提高并发性能
  db.run('PRAGMA journal_mode = WAL', (err) => {
    if (err) {
      console.error('设置WAL模式失败:', err);
    } else {
      console.log('数据库WAL模式已启用');
    }
  });
  
  // 设置busy_timeout：当数据库被锁定时，自动等待最多5秒（提升并发能力）
  db.run('PRAGMA busy_timeout = 5000', (err) => {
    if (err) {
      console.error('设置busy_timeout失败:', err);
    } else {
      console.log('数据库busy_timeout已设置为5秒');
    }
  });
  
  // 设置synchronous：NORMAL模式平衡性能和安全性（提升写入性能）
  db.run('PRAGMA synchronous = NORMAL', (err) => {
    if (err) {
      console.error('设置synchronous失败:', err);
    } else {
      console.log('数据库synchronous已设置为NORMAL');
    }
  });
}

// 设置时区为本地时间（SQLite默认使用UTC）
// 注意：SQLite的CURRENT_TIMESTAMP返回UTC时间，我们需要使用datetime('now', 'localtime')

// 初始化数据库表
async function initDatabase() {
  // 等待数据库连接就绪
  await waitForDbReady();
  
  try {
    // 管理员表
    await runAsync(`
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
    await runAsync(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        phone TEXT UNIQUE NOT NULL,
        name TEXT,
        balance REAL DEFAULT 0,
        created_at DATETIME DEFAULT (datetime('now', 'localtime')),
        last_login DATETIME
      )
    `);

    // 菜单分类表
    await runAsync(`
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
    await runAsync(`
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
        sugar_levels TEXT DEFAULT '[]',
        available_toppings TEXT DEFAULT '[]',
        ice_options TEXT DEFAULT '[]',
        created_at DATETIME DEFAULT (datetime('now', 'localtime')),
        updated_at DATETIME DEFAULT (datetime('now', 'localtime')),
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
      )
    `);

    // 折扣规则表
    await runAsync(`
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
    await runAsync(`
      CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT UNIQUE NOT NULL,
        value TEXT,
        description TEXT,
        updated_at DATETIME DEFAULT (datetime('now', 'localtime'))
      )
    `);

    // 订单表
    await runAsync(`
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
    await runAsync(`
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
        ice_level TEXT,
        notes TEXT,
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
      )
    `);

    // 操作日志表
    await runAsync(`
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

    // 管理员登录失败记录表（用于渐进式锁定）
    await runAsync(`
      CREATE TABLE IF NOT EXISTS admin_login_attempts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL,
        failed_count INTEGER DEFAULT 0,
        locked_until DATETIME,
        first_attempt_at DATETIME DEFAULT (datetime('now', 'localtime')),
        last_attempt_at DATETIME DEFAULT (datetime('now', 'localtime')),
        created_at DATETIME DEFAULT (datetime('now', 'localtime')),
        updated_at DATETIME DEFAULT (datetime('now', 'localtime'))
      )
    `);
    
    // 创建索引以提高查询性能
    await runAsync(`
      CREATE INDEX IF NOT EXISTS idx_admin_login_attempts_username 
      ON admin_login_attempts(username)
    `);

    // 用户登录失败记录表（用于渐进式锁定）
    await runAsync(`
      CREATE TABLE IF NOT EXISTS user_login_attempts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        phone TEXT NOT NULL,
        failed_count INTEGER DEFAULT 0,
        locked_until DATETIME,
        first_attempt_at DATETIME DEFAULT (datetime('now', 'localtime')),
        last_attempt_at DATETIME DEFAULT (datetime('now', 'localtime')),
        created_at DATETIME DEFAULT (datetime('now', 'localtime')),
        updated_at DATETIME DEFAULT (datetime('now', 'localtime'))
      )
    `);
    
    // 创建索引以提高查询性能
    await runAsync(`
      CREATE INDEX IF NOT EXISTS idx_user_login_attempts_phone 
      ON user_login_attempts(phone)
    `);

    // IP登录失败记录表（用于IP级别的速率限制）
    await runAsync(`
      CREATE TABLE IF NOT EXISTS ip_login_attempts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ip_address TEXT NOT NULL,
        failed_count INTEGER DEFAULT 0,
        blocked_until DATETIME,
        first_attempt_at DATETIME DEFAULT (datetime('now', 'localtime')),
        last_attempt_at DATETIME DEFAULT (datetime('now', 'localtime')),
        created_at DATETIME DEFAULT (datetime('now', 'localtime')),
        updated_at DATETIME DEFAULT (datetime('now', 'localtime'))
      )
    `);
    
    // 创建索引以提高查询性能
    await runAsync(`
      CREATE INDEX IF NOT EXISTS idx_ip_login_attempts_ip 
      ON ip_login_attempts(ip_address)
    `);
    await runAsync(`
      CREATE INDEX IF NOT EXISTS idx_ip_login_attempts_blocked 
      ON ip_login_attempts(blocked_until)
    `);

    // 登录尝试审计表（记录所有登录尝试，用于安全分析）
    await runAsync(`
      CREATE TABLE IF NOT EXISTS login_attempts_audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_type TEXT NOT NULL,
        account_identifier TEXT NOT NULL,
        ip_address TEXT,
        user_agent TEXT,
        success INTEGER DEFAULT 0,
        failure_reason TEXT,
        created_at DATETIME DEFAULT (datetime('now', 'localtime'))
      )
    `);
    
    // 创建索引以提高查询性能
    await runAsync(`
      CREATE INDEX IF NOT EXISTS idx_login_audit_account 
      ON login_attempts_audit(account_type, account_identifier)
    `);
    await runAsync(`
      CREATE INDEX IF NOT EXISTS idx_login_audit_ip 
      ON login_attempts_audit(ip_address)
    `);
    await runAsync(`
      CREATE INDEX IF NOT EXISTS idx_login_audit_created 
      ON login_attempts_audit(created_at)
    `);

    // 周期管理表
    await runAsync(`
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

    // 验证码表
    await runAsync(`
      CREATE TABLE IF NOT EXISTS verification_codes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        phone TEXT NOT NULL,
        code TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'login',
        expires_at DATETIME NOT NULL,
        used INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT (datetime('now', 'localtime'))
      )
    `);

    // 余额变动历史表
    await runAsync(`
      CREATE TABLE IF NOT EXISTS balance_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        amount REAL NOT NULL,
        balance_before REAL NOT NULL,
        balance_after REAL NOT NULL,
        order_id TEXT,
        admin_id INTEGER,
        notes TEXT,
        created_at DATETIME DEFAULT (datetime('now', 'localtime')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE SET NULL
      )
    `);

    // 配送地址表
    await runAsync(`
      CREATE TABLE IF NOT EXISTS delivery_addresses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        sort_order INTEGER DEFAULT 0,
        status TEXT DEFAULT 'active',
        created_at DATETIME DEFAULT (datetime('now', 'localtime')),
        updated_at DATETIME DEFAULT (datetime('now', 'localtime'))
      )
    `);

    // 堂食二维码表
    await runAsync(`
      CREATE TABLE IF NOT EXISTS dine_in_qr_codes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        table_number TEXT UNIQUE NOT NULL,
        qr_code_url TEXT NOT NULL,
        created_at DATETIME DEFAULT (datetime('now', 'localtime')),
        updated_at DATETIME DEFAULT (datetime('now', 'localtime'))
      )
    `);

    // 创建索引
    await runAsync('CREATE INDEX IF NOT EXISTS idx_orders_phone ON orders(customer_phone)');
    await runAsync('CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)');
    await runAsync('CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at)');
    await runAsync('CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id)');
    await runAsync('CREATE INDEX IF NOT EXISTS idx_logs_admin ON logs(admin_id)');
    await runAsync('CREATE INDEX IF NOT EXISTS idx_logs_created ON logs(created_at)');
    await runAsync('CREATE INDEX IF NOT EXISTS idx_verification_phone_code ON verification_codes(phone, code, used)');
    await runAsync('CREATE INDEX IF NOT EXISTS idx_verification_expires ON verification_codes(expires_at)');
    await runAsync('CREATE INDEX IF NOT EXISTS idx_dine_in_qr_table ON dine_in_qr_codes(table_number)');

    console.log('数据库表初始化完成');
    
    // 自动迁移：检查并添加缺失的字段
    await migrateDatabaseSchema();
    
    // 迁移远程备份表
    const { migrateRemoteBackup } = require('./migrate-remote-backup');
    await migrateRemoteBackup();
    
    // 迁移系统设置（检查并创建缺失的设置项）
    const { migrateSettings } = require('./migrate-settings');
    await migrateSettings();
    
    // 迁移自定义API表
    const { migrateCustomApis } = require('./migrate-custom-apis');
    await migrateCustomApis();
  } catch (error) {
    console.error('数据库表初始化失败:', error);
    console.error('错误堆栈:', error.stack);
    throw error;
  }
}

// 自动迁移数据库架构（添加缺失的字段）
async function migrateDatabaseSchema() {
  try {
    // 获取表信息的辅助函数
    async function getTableInfo(tableName) {
      return new Promise((resolve, reject) => {
        if (!db) {
          return reject(new Error('Database connection not available'));
        }
        db.all(`PRAGMA table_info(${tableName})`, (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
    }

    // 检查 products 表的字段
    const productsInfo = await getTableInfo('products');
    const productColumns = productsInfo.map(col => col.name);
    
    if (!productColumns.includes('sizes')) {
      console.log('自动迁移: 添加 products.sizes 字段...');
      await runAsync('ALTER TABLE products ADD COLUMN sizes TEXT DEFAULT "{}"');
    }
    
    if (!productColumns.includes('sugar_levels')) {
      console.log('自动迁移: 添加 products.sugar_levels 字段...');
      await runAsync('ALTER TABLE products ADD COLUMN sugar_levels TEXT DEFAULT \'[]\'');
    }
    
    if (!productColumns.includes('available_toppings')) {
      console.log('自动迁移: 添加 products.available_toppings 字段...');
      await runAsync('ALTER TABLE products ADD COLUMN available_toppings TEXT DEFAULT "[]"');
    }
    
    if (!productColumns.includes('ice_options')) {
      console.log('自动迁移: 添加 products.ice_options 字段...');
      await runAsync('ALTER TABLE products ADD COLUMN ice_options TEXT DEFAULT \'[]\'');
    }

    // 检查 order_items 表的字段
    const orderItemsInfo = await getTableInfo('order_items');
    const orderItemsColumns = orderItemsInfo.map(col => col.name);
    
    if (!orderItemsColumns.includes('size')) {
      console.log('自动迁移: 添加 order_items.size 字段...');
      await runAsync('ALTER TABLE order_items ADD COLUMN size TEXT');
    }
    
    if (!orderItemsColumns.includes('sugar_level')) {
      console.log('自动迁移: 添加 order_items.sugar_level 字段...');
      await runAsync('ALTER TABLE order_items ADD COLUMN sugar_level TEXT');
    }
    
    if (!orderItemsColumns.includes('toppings')) {
      console.log('自动迁移: 添加 order_items.toppings 字段...');
      await runAsync('ALTER TABLE order_items ADD COLUMN toppings TEXT');
    }
    
    if (!orderItemsColumns.includes('ice_level')) {
      console.log('自动迁移: 添加 order_items.ice_level 字段...');
      await runAsync('ALTER TABLE order_items ADD COLUMN ice_level TEXT');
    }
    
    if (!orderItemsColumns.includes('notes')) {
      console.log('自动迁移: 添加 order_items.notes 字段...');
      await runAsync('ALTER TABLE order_items ADD COLUMN notes TEXT');
    }
    
    if (!orderItemsColumns.includes('size_price')) {
      console.log('自动迁移: 添加 order_items.size_price 字段...');
      await runAsync('ALTER TABLE order_items ADD COLUMN size_price REAL');
    }

    // 检查 orders 表的字段
    const ordersInfo = await getTableInfo('orders');
    const ordersColumns = ordersInfo.map(col => col.name);
    
    if (!ordersColumns.includes('notes')) {
      console.log('自动迁移: 添加 orders.notes 字段...');
      await runAsync('ALTER TABLE orders ADD COLUMN notes TEXT');
    }
    
    if (!ordersColumns.includes('cycle_id')) {
      console.log('自动迁移: 添加 orders.cycle_id 字段...');
      await runAsync('ALTER TABLE orders ADD COLUMN cycle_id INTEGER');
    }
    
    if (!ordersColumns.includes('balance_used')) {
      console.log('自动迁移: 添加 orders.balance_used 字段...');
      await runAsync('ALTER TABLE orders ADD COLUMN balance_used REAL DEFAULT 0');
    }
    
    // Stripe 支付相关字段迁移
    if (!ordersColumns.includes('payment_method')) {
      console.log('自动迁移: 添加 orders.payment_method 字段...');
      await runAsync('ALTER TABLE orders ADD COLUMN payment_method TEXT DEFAULT NULL');
    }
    
    if (!ordersColumns.includes('stripe_payment_intent_id')) {
      console.log('自动迁移: 添加 orders.stripe_payment_intent_id 字段...');
      await runAsync('ALTER TABLE orders ADD COLUMN stripe_payment_intent_id TEXT DEFAULT NULL');
    }
    
    if (!ordersColumns.includes('stripe_session_id')) {
      console.log('自动迁移: 添加 orders.stripe_session_id 字段...');
      await runAsync('ALTER TABLE orders ADD COLUMN stripe_session_id TEXT DEFAULT NULL');
    }
    
    // 配送地址字段迁移
    if (!ordersColumns.includes('delivery_address_id')) {
      console.log('自动迁移: 添加 orders.delivery_address_id 字段...');
      await runAsync('ALTER TABLE orders ADD COLUMN delivery_address_id INTEGER DEFAULT NULL');
    }

    // 添加订单类型字段（dine_in: 堂食, delivery: 外卖）
    if (!ordersColumns.includes('order_type')) {
      console.log('自动迁移: 添加 orders.order_type 字段...');
      await runAsync('ALTER TABLE orders ADD COLUMN order_type TEXT DEFAULT \'delivery\'');
    }

    // 添加桌号字段（用于堂食订单）
    if (!ordersColumns.includes('table_number')) {
      console.log('自动迁移: 添加 orders.table_number 字段...');
      await runAsync('ALTER TABLE orders ADD COLUMN table_number TEXT DEFAULT NULL');
    }

    // 检查 users 表的字段
    const usersInfo = await getTableInfo('users');
    const usersColumns = usersInfo.map(col => col.name);
    
    if (!usersColumns.includes('balance')) {
      console.log('自动迁移: 添加 users.balance 字段...');
      await runAsync('ALTER TABLE users ADD COLUMN balance REAL DEFAULT 0');
    }
    
    if (!usersColumns.includes('pin')) {
      console.log('自动迁移: 添加 users.pin 字段...');
      await runAsync('ALTER TABLE users ADD COLUMN pin TEXT');
    }

    // 检查 balance_transactions 表是否存在
    const tablesInfo = await allAsync("SELECT name FROM sqlite_master WHERE type='table' AND name='balance_transactions'");
    if (tablesInfo.length === 0) {
      console.log('自动迁移: 创建 balance_transactions 表...');
      await runAsync(`
        CREATE TABLE IF NOT EXISTS balance_transactions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          type TEXT NOT NULL,
          amount REAL NOT NULL,
          balance_before REAL NOT NULL,
          balance_after REAL NOT NULL,
          order_id TEXT,
          admin_id INTEGER,
          notes TEXT,
          created_at DATETIME DEFAULT (datetime('now', 'localtime')),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE SET NULL
        )
      `);
      await runAsync('CREATE INDEX IF NOT EXISTS idx_balance_transactions_user ON balance_transactions(user_id)');
      await runAsync('CREATE INDEX IF NOT EXISTS idx_balance_transactions_order ON balance_transactions(order_id)');
      await runAsync('CREATE INDEX IF NOT EXISTS idx_balance_transactions_created ON balance_transactions(created_at)');
    }

    // 检查 delivery_addresses 表是否存在
    const deliveryAddressesTableInfo = await allAsync("SELECT name FROM sqlite_master WHERE type='table' AND name='delivery_addresses'");
    if (deliveryAddressesTableInfo.length === 0) {
      console.log('自动迁移: 创建 delivery_addresses 表...');
      await runAsync(`
        CREATE TABLE IF NOT EXISTS delivery_addresses (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          description TEXT,
          sort_order INTEGER DEFAULT 0,
          status TEXT DEFAULT 'active',
          created_at DATETIME DEFAULT (datetime('now', 'localtime')),
          updated_at DATETIME DEFAULT (datetime('now', 'localtime'))
        )
      `);
    } else {
      // 检查 balance_transactions 表是否有所有必要的列
      const balanceTransactionsInfo = await allAsync("PRAGMA table_info(balance_transactions)");
      const balanceTransactionsColumns = balanceTransactionsInfo.map(col => col.name);
      
      // 检查并添加缺失的列（按顺序检查，确保依赖列先添加）
      if (!balanceTransactionsColumns.includes('balance_before')) {
        console.log('自动迁移: 添加 balance_transactions.balance_before 字段...');
        await runAsync('ALTER TABLE balance_transactions ADD COLUMN balance_before REAL NOT NULL DEFAULT 0');
      }
      
      if (!balanceTransactionsColumns.includes('balance_after')) {
        console.log('自动迁移: 添加 balance_transactions.balance_after 字段...');
        await runAsync('ALTER TABLE balance_transactions ADD COLUMN balance_after REAL NOT NULL DEFAULT 0');
      }
      
      if (!balanceTransactionsColumns.includes('admin_id')) {
        console.log('自动迁移: 添加 balance_transactions.admin_id 字段...');
        await runAsync('ALTER TABLE balance_transactions ADD COLUMN admin_id INTEGER');
      }
      
      if (!balanceTransactionsColumns.includes('order_id')) {
        console.log('自动迁移: 添加 balance_transactions.order_id 字段...');
        await runAsync('ALTER TABLE balance_transactions ADD COLUMN order_id TEXT');
      }
      
      if (!balanceTransactionsColumns.includes('notes')) {
        console.log('自动迁移: 添加 balance_transactions.notes 字段...');
        await runAsync('ALTER TABLE balance_transactions ADD COLUMN notes TEXT');
      }
    }

    // 检查并添加 first_attempt_at 字段到 admin_login_attempts
    try {
      const adminAttemptsInfo = await getTableInfo('admin_login_attempts');
      const adminAttemptsColumns = adminAttemptsInfo.map(col => col.name);
      if (!adminAttemptsColumns.includes('first_attempt_at')) {
        console.log('自动迁移: 添加 admin_login_attempts.first_attempt_at 字段...');
        await runAsync('ALTER TABLE admin_login_attempts ADD COLUMN first_attempt_at DATETIME');
        // 为现有记录设置 first_attempt_at = created_at
        await runAsync('UPDATE admin_login_attempts SET first_attempt_at = created_at WHERE first_attempt_at IS NULL');
      }
    } catch (error) {
      console.error('迁移 admin_login_attempts.first_attempt_at 失败:', error.message);
    }

    // 检查并添加 first_attempt_at 字段到 user_login_attempts
    try {
      const userAttemptsInfo = await getTableInfo('user_login_attempts');
      const userAttemptsColumns = userAttemptsInfo.map(col => col.name);
      if (!userAttemptsColumns.includes('first_attempt_at')) {
        console.log('自动迁移: 添加 user_login_attempts.first_attempt_at 字段...');
        await runAsync('ALTER TABLE user_login_attempts ADD COLUMN first_attempt_at DATETIME');
        // 为现有记录设置 first_attempt_at = created_at
        await runAsync('UPDATE user_login_attempts SET first_attempt_at = created_at WHERE first_attempt_at IS NULL');
      }
    } catch (error) {
      console.error('迁移 user_login_attempts.first_attempt_at 失败:', error.message);
    }

    // 检查并创建 ip_login_attempts 表
    try {
      const ipAttemptsTables = await allAsync("SELECT name FROM sqlite_master WHERE type='table' AND name='ip_login_attempts'");
      if (ipAttemptsTables.length === 0) {
        console.log('自动迁移: 创建 ip_login_attempts 表...');
        await runAsync(`
          CREATE TABLE IF NOT EXISTS ip_login_attempts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ip_address TEXT NOT NULL,
            failed_count INTEGER DEFAULT 0,
            blocked_until DATETIME,
            first_attempt_at DATETIME DEFAULT (datetime('now', 'localtime')),
            last_attempt_at DATETIME DEFAULT (datetime('now', 'localtime')),
            created_at DATETIME DEFAULT (datetime('now', 'localtime')),
            updated_at DATETIME DEFAULT (datetime('now', 'localtime'))
          )
        `);
        await runAsync('CREATE INDEX IF NOT EXISTS idx_ip_login_attempts_ip ON ip_login_attempts(ip_address)');
        await runAsync('CREATE INDEX IF NOT EXISTS idx_ip_login_attempts_blocked ON ip_login_attempts(blocked_until)');
      }
    } catch (error) {
      console.error('迁移 ip_login_attempts 表失败:', error.message);
    }

    // 检查并创建 login_attempts_audit 表
    try {
      const auditTables = await allAsync("SELECT name FROM sqlite_master WHERE type='table' AND name='login_attempts_audit'");
      if (auditTables.length === 0) {
        console.log('自动迁移: 创建 login_attempts_audit 表...');
        await runAsync(`
          CREATE TABLE IF NOT EXISTS login_attempts_audit (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_type TEXT NOT NULL,
            account_identifier TEXT NOT NULL,
            ip_address TEXT,
            user_agent TEXT,
            success INTEGER DEFAULT 0,
            failure_reason TEXT,
            created_at DATETIME DEFAULT (datetime('now', 'localtime'))
          )
        `);
        await runAsync('CREATE INDEX IF NOT EXISTS idx_login_audit_account ON login_attempts_audit(account_type, account_identifier)');
        await runAsync('CREATE INDEX IF NOT EXISTS idx_login_audit_ip ON login_attempts_audit(ip_address)');
        await runAsync('CREATE INDEX IF NOT EXISTS idx_login_audit_created ON login_attempts_audit(created_at)');
      }
    } catch (error) {
      console.error('迁移 login_attempts_audit 表失败:', error.message);
    }

    console.log('数据库架构迁移完成');
  } catch (error) {
    console.error('数据库架构迁移失败:', error);
    // 不抛出错误，允许继续运行
  }
}

// Promise化的数据库操作
async function runAsync(sql, params = []) {
  // 等待数据库连接就绪
  await waitForDbReady();
  
  return new Promise((resolve, reject) => {
    if (!db) {
      const error = new Error('Database connection is not initialized');
      console.error('数据库操作失败: 连接未初始化', { sql: sql.substring(0, 50) });
      return reject(error);
    }
    try {
      db.run(sql, params, function(err) {
        if (err) {
          // 精简错误日志，避免打印完整 SQL（可能包含大量数据）
          const sqlPreview = sql.length > 100 ? sql.substring(0, 100) + '...' : sql;
          console.error('数据库执行错误:', { 
            sql: sqlPreview, 
            error: err.message, 
            code: err.code,
            paramsCount: params.length
          });
          reject(err);
        } else {
          resolve({ id: this.lastID, changes: this.changes });
        }
      });
    } catch (error) {
      console.error('数据库操作异常:', { sql: sql.substring(0, 50), error: error.message });
      reject(error);
    }
  });
}

async function getAsync(sql, params = []) {
  // 等待数据库连接就绪
  await waitForDbReady();
  
  return new Promise((resolve, reject) => {
    if (!db) {
      const error = new Error('Database connection is not initialized');
      console.error('数据库查询失败: 连接未初始化', { sql: sql.substring(0, 50) });
      return reject(error);
    }
    try {
      db.get(sql, params, (err, row) => {
        if (err) {
          console.error('数据库查询错误:', { sql: sql.substring(0, 50), error: err.message, code: err.code });
          reject(err);
        } else {
          resolve(row);
        }
      });
    } catch (error) {
      console.error('数据库查询异常:', { sql: sql.substring(0, 50), error: error.message });
      reject(error);
    }
  });
}

async function allAsync(sql, params = []) {
  // 等待数据库连接就绪
  await waitForDbReady();
  
  return new Promise((resolve, reject) => {
    if (!db) {
      const error = new Error('Database connection is not initialized');
      console.error('数据库查询失败: 连接未初始化', { sql: sql.substring(0, 50) });
      return reject(error);
    }
    try {
      db.all(sql, params, (err, rows) => {
        if (err) {
          console.error('数据库查询错误:', { sql: sql.substring(0, 50), error: err.message, code: err.code });
          reject(err);
        } else {
          resolve(rows);
        }
      });
    } catch (error) {
      console.error('数据库查询异常:', { sql: sql.substring(0, 50), error: error.message });
      reject(error);
    }
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

// 关闭数据库连接（仅在服务器关闭时调用）
function closeDatabase() {
  return new Promise((resolve, reject) => {
    if (!db) {
      console.log('数据库连接不存在，无需关闭');
      dbReady = false;
      return resolve();
    }
    db.close((err) => {
      if (err) {
        // 如果已经关闭，err 可能是 "SQLITE_MISUSE: Database is closed"
        if (err.message && err.message.includes('closed')) {
          console.log('数据库连接已经关闭');
          db = null;
          dbReady = false;
          return resolve();
        }
        reject(err);
      } else {
        console.log('数据库连接已关闭');
        db = null;
        dbReady = false;
        resolve();
      }
    });
  });
}

// 重新创建数据库连接（用于恢复数据库后）
function createDatabaseConnection() {
  return new Promise((resolve, reject) => {
    // 如果数据库连接已存在，先关闭
    if (db) {
      db.close((err) => {
        if (err && !err.message.includes('closed')) {
          console.warn('关闭旧数据库连接时出错:', err.message);
        }
        db = null;
        dbReady = false;
        initializeConnection(resolve, reject);
      });
    } else {
      initializeConnection(resolve, reject);
    }
  });
}

// 初始化数据库连接的内部函数
function initializeConnection(resolve, reject) {
  // 重新创建 Promise
  dbReadyPromise = new Promise((res, rej) => {
    dbReadyResolve = res;
    dbReadyReject = rej;
  });

  try {
    console.log('正在重新创建数据库连接...', { DB_PATH, DB_DIR: path.dirname(DB_PATH), exists: fs.existsSync(DB_PATH) });
    
    db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
      if (err) {
        console.error('数据库连接失败:', err);
        dbReady = false;
        if (dbReadyReject) {
          dbReadyReject(err);
        }
        reject(err);
      } else {
        console.log('数据库连接成功:', DB_PATH);
        dbReady = true;
        
        // 启用外键约束
        db.run('PRAGMA foreign_keys = ON', (err) => {
          if (err) {
            console.error('设置外键约束失败:', err);
          }
        });

        // 启用WAL模式
        db.run('PRAGMA journal_mode = WAL', (err) => {
          if (err) {
            console.error('设置WAL模式失败:', err);
          } else {
            console.log('数据库WAL模式已启用');
          }
        });
        
        // 设置busy_timeout：当数据库被锁定时，自动等待最多5秒（提升并发能力）
        db.run('PRAGMA busy_timeout = 5000', (err) => {
          if (err) {
            console.error('设置busy_timeout失败:', err);
          } else {
            console.log('数据库busy_timeout已设置为5秒');
          }
        });
        
        // 设置synchronous：NORMAL模式平衡性能和安全性（提升写入性能）
        db.run('PRAGMA synchronous = NORMAL', (err) => {
          if (err) {
            console.error('设置synchronous失败:', err);
          } else {
            console.log('数据库synchronous已设置为NORMAL');
          }
        });

        if (dbReadyResolve) {
          dbReadyResolve();
        }
        resolve();
      }
    });

    // 处理数据库错误
    db.on('error', (err) => {
      console.error('数据库错误:', err);
      getLogger().error('数据库错误', { error: err.message });
      dbReady = false;
    });
  } catch (error) {
    console.error('创建数据库连接时出错:', error);
    if (dbReadyReject) {
      dbReadyReject(error);
    }
    reject(error);
  }
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
  createDatabaseConnection, // 导出重新创建连接的函数
  getCurrentLocalTime,
  waitForDbReady, // 导出等待函数
  DB_PATH, // 导出数据库路径
  DB_DIR // 导出数据库目录
};

