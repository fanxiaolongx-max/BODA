const express = require('express');
const fs = require('fs');
const path = require('path');
const { getAsync, allAsync, runAsync, beginTransaction, commit, rollback } = require('../db/database');
const { logger } = require('../utils/logger');
const cache = require('../utils/cache');

const router = express.Router();

// HTML转义函数
function escapeHtml(text) {
  if (!text) return '';
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return String(text).replace(/[&<>"']/g, m => map[m]);
}

// 缓存过期时间（5分钟）
const CACHE_TTL = 5 * 60 * 1000;

// ==================== 公开接口（无需登录） ====================

// 获取系统设置
router.get('/settings', async (req, res) => {
  try {
    // 尝试从缓存获取
    const cacheKey = 'public:settings';
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json({ success: true, settings: cached });
    }

    const settings = await allAsync('SELECT * FROM settings');
    const settingsObj = {};
    settings.forEach(s => {
      settingsObj[s.key] = s.value;
    });
    
    // 存入缓存
    cache.set(cacheKey, settingsObj, CACHE_TTL);
    
    res.json({ success: true, settings: settingsObj });
  } catch (error) {
    logger.error('获取系统设置失败', { error: error.message });
    res.status(500).json({ success: false, message: '获取系统设置失败' });
  }
});

/**
 * GET /api/public/categories
 * Get all active categories
 * @returns {Object} Categories array
 */
router.get('/categories', async (req, res) => {
  try {
    // 尝试从缓存获取
    const cacheKey = 'public:categories';
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json({ success: true, categories: cached });
    }

    const categories = await allAsync(
      'SELECT * FROM categories WHERE status = ? ORDER BY sort_order, id',
      ['active']
    );
    
    // 存入缓存
    cache.set(cacheKey, categories, CACHE_TTL);
    
    res.json({ success: true, categories });
  } catch (error) {
    logger.error('获取分类失败', { error: error.message });
    res.status(500).json({ success: false, message: '获取分类失败' });
  }
});

/**
 * GET /api/public/products
 * Get all active products
 * @query {string} [category_id] - Filter by category ID
 * @returns {Object} Products array
 */
router.get('/products', async (req, res) => {
  try {
    const { category_id } = req.query;
    let sql = `
      SELECT p.*, c.name as category_name 
      FROM products p 
      LEFT JOIN categories c ON p.category_id = c.id 
      WHERE p.status = 'active'
    `;
    const params = [];

    if (category_id) {
      sql += ' AND p.category_id = ?';
      params.push(category_id);
    }

    sql += ' ORDER BY p.category_id, p.sort_order, p.id';

    const products = await allAsync(sql, params);
    res.json({ success: true, products });
  } catch (error) {
    logger.error('获取菜品失败', { error: error.message });
    res.status(500).json({ success: false, message: '获取菜品失败' });
  }
});

/**
 * GET /api/public/orders/:orderNumber
 * Get order details by order number (for QR code query)
 * @param {string} orderNumber - Order number (e.g., BO12345678)
 * @returns {Object} Order object with items
 */
router.get('/orders/:orderNumber', async (req, res) => {
  try {
    const { orderNumber } = req.params;

    const order = await getAsync(
      'SELECT * FROM orders WHERE order_number = ?',
      [orderNumber]
    );

    if (!order) {
      return res.status(404).json({ success: false, message: '订单不存在' });
    }

    order.items = await allAsync(
      'SELECT * FROM order_items WHERE order_id = ?',
      [order.id]
    );

    res.json({ success: true, order });
  } catch (error) {
    logger.error('获取订单详情失败', { error: error.message });
    res.status(500).json({ success: false, message: '获取订单详情失败' });
  }
});

/**
 * GET /api/public/discount-rules
 * Get all active discount rules
 * @returns {Object} Discount rules array
 */
router.get('/discount-rules', async (req, res) => {
  try {
    // 尝试从缓存获取
    const cacheKey = 'public:discount-rules';
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json({ success: true, rules: cached });
    }

    const rules = await allAsync(
      'SELECT * FROM discount_rules WHERE status = ? ORDER BY min_amount',
      ['active']
    );
    
    // 存入缓存
    cache.set(cacheKey, rules, CACHE_TTL);
    
    res.json({ success: true, rules });
  } catch (error) {
    logger.error('获取折扣规则失败', { error: error.message });
    res.status(500).json({ success: false, message: '获取折扣规则失败' });
  }
});

/**
 * POST /api/public/calculate-discount
 * Calculate and apply discount to all pending orders (only when ordering is closed)
 * @returns {Object} Discount calculation result with discount_rate and total_amount
 */
router.post('/calculate-discount', async (req, res) => {
  try {
    // 检查点单是否已关闭
    const setting = await getAsync("SELECT value FROM settings WHERE key = 'ordering_open'");
    if (setting && setting.value === 'true') {
      return res.json({ 
        success: true, 
        message: '点单时间未关闭，暂不计算折扣',
        discount_applied: false 
      });
    }

    // 获取所有待付款订单的总金额
    const result = await getAsync(
      "SELECT SUM(total_amount) as total FROM orders WHERE status = 'pending'"
    );

    const totalAmount = result.total || 0;

    // 获取折扣规则
    const rules = await allAsync(
      'SELECT * FROM discount_rules WHERE status = ? ORDER BY min_amount DESC',
      ['active']
    );

    // 找到适用的折扣规则
    let discountRate = 0;
    for (const rule of rules) {
      if (totalAmount >= rule.min_amount) {
        if (!rule.max_amount || totalAmount < rule.max_amount) {
          discountRate = rule.discount_rate / 100; // 数据库存储的是百分比，需要转换为小数
          break;
        }
      }
    }

    // 批量更新所有待付款订单的折扣
    const pendingOrders = await allAsync(
      "SELECT * FROM orders WHERE status = 'pending'"
    );

    if (pendingOrders.length > 0) {
      // 使用事务确保数据一致性
      try {
        await beginTransaction();
        const { roundAmount } = require('../utils/order-helper');
        for (const order of pendingOrders) {
          const discountAmount = roundAmount(order.total_amount * discountRate);
          const finalAmount = roundAmount(order.total_amount - discountAmount);

          await runAsync(
            "UPDATE orders SET discount_amount = ?, final_amount = ?, updated_at = datetime('now', 'localtime') WHERE id = ?",
            [discountAmount, finalAmount, order.id]
          );
        }
        await commit();
      } catch (error) {
        await rollback();
        logger.error('批量更新订单折扣失败', { error: error.message });
        throw error;
      }
    }

    logger.info('折扣计算完成', { 
      totalAmount, 
      discountRate, 
      orderCount: pendingOrders.length 
    });

    res.json({ 
      success: true, 
      message: '折扣计算完成',
      discount_applied: true,
      discount_rate: discountRate,
      total_amount: totalAmount
    });
  } catch (error) {
    logger.error('计算折扣失败', { error: error.message });
    res.status(500).json({ success: false, message: '计算折扣失败' });
  }
});

/**
 * GET /api/public/cycle-discount
 * Get current cycle discount information
 * @returns {Object} Cycle object with currentDiscount and nextDiscount information
 */
router.get('/cycle-discount', async (req, res) => {
  try {
    // 获取当前活跃周期
    const cycle = await getAsync(
      "SELECT * FROM ordering_cycles WHERE status = 'active' ORDER BY id DESC LIMIT 1"
    );
    
    if (!cycle) {
      return res.json({ success: true, cycle: null, nextDiscount: null, currentDiscount: null });
    }
    
    // 获取折扣规则（按金额从低到高排序，用于找下一个折扣）
    const rulesAsc = await allAsync(
      'SELECT * FROM discount_rules WHERE status = ? ORDER BY min_amount ASC',
      ['active']
    );
    
    // 获取折扣规则（按金额从高到低排序，用于找当前折扣）
    const rulesDesc = await allAsync(
      'SELECT * FROM discount_rules WHERE status = ? ORDER BY min_amount DESC',
      ['active']
    );
    
    // 计算当前已达到的折扣（从高到低查找，找到第一个符合条件的）
    let currentDiscount = null;
    for (const rule of rulesDesc) {
      if (cycle.total_amount >= rule.min_amount) {
        if (!rule.max_amount || cycle.total_amount < rule.max_amount) {
          currentDiscount = rule;
          break;
        }
      }
    }
    
    // 找到下一个可达到的折扣（从低到高查找，找到第一个未达到的）
    let nextDiscount = null;
    for (const rule of rulesAsc) {
      if (cycle.total_amount < rule.min_amount) {
        nextDiscount = rule;
        break;
      }
    }
    
    res.json({ success: true, cycle, nextDiscount, currentDiscount });
  } catch (error) {
    logger.error('获取周期折扣失败', { error: error.message });
    res.status(500).json({ success: false, message: '获取周期折扣失败' });
  }
});

/**
 * GET /api/public/show-images
 * Get showcase images list
 * @returns {Object} Images array with filename and URL
 */
router.get('/show-images', async (req, res) => {
  try {
    // 优先使用 DATA_DIR/show（持久化），如果不存在则回退到项目根目录（兼容性）
    const DATA_DIR = fs.existsSync('/data') ? '/data' : path.join(__dirname, '..');
    const SHOW_DIR = path.join(DATA_DIR, 'show');
    const FALLBACK_SHOW_DIR = path.join(__dirname, '../show');
    const showDir = fs.existsSync(SHOW_DIR) ? SHOW_DIR : FALLBACK_SHOW_DIR;
    
    // 检查目录是否存在，如果不存在则返回空数组（避免错误日志）
    if (!fs.existsSync(showDir)) {
      return res.json({ success: true, images: [] });
    }
    
    const files = fs.readdirSync(showDir);
    const images = files
      .filter(file => /\.(jpg|jpeg|png|gif|webp)$/i.test(file))
      .map(file => ({
        filename: file,
        url: `/show/${file}`
      }))
      .sort(); // 按文件名排序
    
    res.json({ success: true, images });
  } catch (error) {
    logger.error('获取新品图片失败', { error: error.message });
    res.json({ success: true, images: [] }); // 出错时返回空数组
  }
});

/**
 * GET /api/public/dine-in/login
 * Auto-login for dine-in customers by scanning QR code
 * @query {string} table - Table number
 * @returns {Object} Redirect to ordering page with auto-login
 */
router.get('/dine-in/login', async (req, res) => {
  try {
    const { table } = req.query;
    
    if (!table || !table.trim()) {
      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Error</title>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body {
              font-family: Arial, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              min-height: 100vh;
              margin: 0;
              background: #f5f5f5;
            }
            .error-container {
              background: white;
              padding: 40px;
              border-radius: 8px;
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);
              text-align: center;
              max-width: 400px;
            }
            h1 {
              color: #e74c3c;
              margin-bottom: 20px;
            }
            p {
              color: #666;
              line-height: 1.6;
            }
          </style>
        </head>
        <body>
          <div class="error-container">
            <h1>Invalid QR Code</h1>
            <p>Table number parameter is missing. Please scan the QR code again.</p>
          </div>
        </body>
        </html>
      `);
    }
    
    const tableNumber = table.trim();
    
    // 检查桌号是否已由管理员创建（存在于 dine_in_qr_codes 表中）
    const qrCode = await getAsync('SELECT * FROM dine_in_qr_codes WHERE table_number = ?', [tableNumber]);
    
    if (!qrCode) {
      // 桌号不存在，不允许访问
      logger.warn('Attempted to access non-existent table number', { tableNumber, ip: req.ip });
      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Table Not Found</title>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body {
              font-family: Arial, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              min-height: 100vh;
              margin: 0;
              background: #f5f5f5;
            }
            .error-container {
              background: white;
              padding: 40px;
              border-radius: 8px;
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);
              text-align: center;
              max-width: 400px;
            }
            h1 {
              color: #e74c3c;
              margin-bottom: 20px;
            }
            p {
              color: #666;
              line-height: 1.6;
            }
          </style>
        </head>
        <body>
          <div class="error-container">
            <h1>Table Not Found</h1>
            <p>This table number (${escapeHtml(tableNumber)}) has not been registered. Please contact the administrator.</p>
          </div>
        </body>
        </html>
      `);
    }
    
    // 桌号已存在，创建或获取桌号用户（phone格式：TABLE-桌号）
    const tablePhone = `TABLE-${tableNumber}`;
    
    // 检查用户是否存在
    let tableUser = await getAsync('SELECT * FROM users WHERE phone = ?', [tablePhone]);
    
    if (!tableUser) {
      // 创建新的桌号用户（只有桌号存在于二维码表中时才创建）
      await runAsync(
        `INSERT INTO users (phone, name, balance, created_at) 
         VALUES (?, ?, 0, datetime('now', 'localtime'))`,
        [tablePhone, `Table ${tableNumber}`]
      );
      tableUser = await getAsync('SELECT * FROM users WHERE phone = ?', [tablePhone]);
      logger.info('Created table user (table verified)', { phone: tablePhone, tableNumber });
    }
    
    // 获取用户session过期时间配置
    const { getUserSessionTimeoutMs } = require('../utils/session-config');
    const userTimeoutMs = await getUserSessionTimeoutMs();
    
    // 设置session（自动登录）
    req.session.userId = tableUser.id;
    req.session.userPhone = tableUser.phone;
    req.session.userName = tableUser.name;
    req.session._userLoginTime = Date.now();
    req.session._userTimeoutMs = userTimeoutMs;
    
    // 设置堂食标记和桌号
    req.session.isDineIn = true;
    req.session.tableNumber = tableNumber;
    
    // 记录登录日志
    const { logAction: logUserAction } = require('../utils/logger');
    await logUserAction(null, 'USER_LOGIN', 'user', tableUser.id, JSON.stringify({
      action: 'Table QR code login',
      phone: tableUser.phone,
      tableNumber: tableNumber,
      loginMethod: 'dine_in_qr'
    }), req);
    
    logger.info('Table QR code login successful', { phone: tablePhone, tableNumber, userId: tableUser.id });
    
    // 保存session并重定向到主页
    req.session.save((err) => {
      if (err) {
        logger.error('Failed to save session', { error: err.message });
        return res.status(500).send(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Error</title>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
              body {
                font-family: Arial, sans-serif;
                display: flex;
                justify-content: center;
                align-items: center;
                min-height: 100vh;
                margin: 0;
                background: #f5f5f5;
              }
              .error-container {
                background: white;
                padding: 40px;
                border-radius: 8px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                text-align: center;
                max-width: 400px;
              }
              h1 {
                color: #e74c3c;
                margin-bottom: 20px;
              }
              p {
                color: #666;
                line-height: 1.6;
              }
            </style>
          </head>
          <body>
            <div class="error-container">
              <h1>Login Failed</h1>
              <p>System error, please try again later.</p>
            </div>
          </body>
          </html>
        `);
      }
      
      // 重定向到主页（清除URL参数，使用session中的信息）
      res.redirect('/');
    });
  } catch (error) {
    logger.error('Dine-in QR code login failed', { error: error.message, table: req.query.table });
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Error</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body {
            font-family: Arial, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            background: #f5f5f5;
          }
          .error-container {
            background: white;
            padding: 40px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            text-align: center;
            max-width: 400px;
          }
          h1 {
            color: #e74c3c;
            margin-bottom: 20px;
          }
          p {
            color: #666;
            line-height: 1.6;
          }
        </style>
      </head>
      <body>
        <div class="error-container">
          <h1>Login Failed</h1>
          <p>System error, please try again later.</p>
        </div>
      </body>
      </html>
    `);
  }
});

/**
 * GET /api/public/delivery-addresses
 * Get all active delivery addresses (for users to select)
 * @returns {Object} Delivery addresses array
 */
router.get('/delivery-addresses', async (req, res) => {
  try {
    // 尝试从缓存获取
    const cacheKey = 'public:delivery-addresses';
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json({ success: true, addresses: cached });
    }

    const addresses = await allAsync(
      'SELECT * FROM delivery_addresses WHERE status = ? ORDER BY sort_order, id',
      ['active']
    );
    
    // 存入缓存
    cache.set(cacheKey, addresses, CACHE_TTL);
    
    res.json({ success: true, addresses });
  } catch (error) {
    logger.error('获取配送地址失败', { error: error.message });
    res.status(500).json({ success: false, message: '获取配送地址失败' });
  }
});

module.exports = router;

