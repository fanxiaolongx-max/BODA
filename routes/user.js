const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { runAsync, getAsync, allAsync, beginTransaction, commit, rollback } = require('../db/database');
const { requireUserAuth } = require('../middleware/auth');
const { logger } = require('../utils/logger');
const { findOrderCycle, findOrderCyclesBatch, isActiveCycle, isOrderExpired } = require('../utils/cycle-helper');
const { calculateItemPrice, batchGetToppingProducts, batchGetOrderItems, roundAmount } = require('../utils/order-helper');

const router = express.Router();

// ==================== Stripe 配置管理 ====================
/**
 * 从环境变量或 settings 表读取 Stripe 私钥
 * @returns {Promise<string>} Stripe 私钥
 */
async function getStripeSecretKey() {
  // 优先从环境变量读取
  if (process.env.STRIPE_SECRET_KEY) {
    return process.env.STRIPE_SECRET_KEY;
  }
  // 从设置表读取
  try {
    const setting = await getAsync("SELECT value FROM settings WHERE key = 'stripe_secret_key'");
    return setting?.value || '';
  } catch (error) {
    logger.error('读取 Stripe 私钥失败', { error: error.message });
    return '';
  }
}

/**
 * 从环境变量或 settings 表读取 Stripe 公钥
 * @returns {Promise<string>} Stripe 公钥
 */
async function getStripePublishableKey() {
  // 优先从环境变量读取
  if (process.env.STRIPE_PUBLISHABLE_KEY) {
    return process.env.STRIPE_PUBLISHABLE_KEY;
  }
  // 从设置表读取
  try {
    const setting = await getAsync("SELECT value FROM settings WHERE key = 'stripe_publishable_key'");
    return setting?.value || '';
  } catch (error) {
    logger.error('读取 Stripe 公钥失败', { error: error.message });
    return '';
  }
}

/**
 * 从环境变量或 settings 表读取 Stripe Webhook Secret
 * @returns {Promise<string>} Stripe Webhook Secret
 */
async function getStripeWebhookSecret() {
  // 优先从环境变量读取
  if (process.env.STRIPE_WEBHOOK_SECRET) {
    return process.env.STRIPE_WEBHOOK_SECRET;
  }
  // 从设置表读取
  try {
    const setting = await getAsync("SELECT value FROM settings WHERE key = 'stripe_webhook_secret'");
    return setting?.value || '';
  } catch (error) {
    logger.error('读取 Stripe Webhook Secret 失败', { error: error.message });
    return '';
  }
}

/**
 * POST /api/user/stripe-webhook
 * Stripe Webhook 处理（用于处理支付成功回调）
 * 注意：这个接口需要配置在 Stripe Dashboard 的 Webhooks 中
 * 注意：这个接口不需要用户认证，需要放在 requireUserAuth 之前
 */
router.post('/stripe-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const stripeSecretKey = await getStripeSecretKey();
    if (!stripeSecretKey) {
      logger.warn('Stripe Webhook: Stripe 未配置');
      return res.status(400).json({ success: false, message: 'Stripe 未配置' });
    }
    
    const stripe = require('stripe')(stripeSecretKey);
    const sig = req.headers['stripe-signature'];
    const webhookSecret = await getStripeWebhookSecret();
    
    let event;
    
    try {
      if (webhookSecret) {
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
      } else {
        // 如果没有配置 webhook secret，记录警告但继续处理（仅用于开发环境）
        logger.warn('Stripe Webhook: 未配置 Webhook Secret，跳过签名验证');
        event = JSON.parse(req.body.toString());
      }
    } catch (err) {
      logger.error('Stripe Webhook 验证失败', { error: err.message });
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }
    
    // 处理支付成功事件
    if (event.type === 'payment_intent.succeeded') {
      const paymentIntent = event.data.object;
      const orderId = paymentIntent.metadata.order_id;
      
      if (orderId) {
        try {
          // 检查订单是否存在且状态为 pending
          const order = await getAsync('SELECT * FROM orders WHERE id = ? AND status = ?', [orderId, 'pending']);
          
          if (order) {
            // 验证金额
            const amountInCents = Math.round(order.final_amount * 100);
            if (paymentIntent.amount === amountInCents) {
              // 更新订单状态
              await runAsync(
                `UPDATE orders SET 
                 status = 'paid', 
                 payment_method = 'stripe',
                 payment_time = datetime('now', 'localtime'),
                 updated_at = datetime('now', 'localtime') 
                 WHERE id = ? AND status = 'pending'`,
                [orderId]
              );
              
              logger.info('Stripe Webhook: 订单支付成功', { 
                orderId: orderId, 
                paymentIntentId: paymentIntent.id 
              });
            } else {
              logger.warn('Stripe Webhook: 支付金额不匹配', { 
                orderId: orderId,
                expected: amountInCents,
                received: paymentIntent.amount
              });
            }
          } else {
            logger.warn('Stripe Webhook: 订单不存在或已处理', { orderId: orderId });
          }
        } catch (error) {
          logger.error('Stripe Webhook: 更新订单状态失败', { 
            error: error.message, 
            orderId: orderId 
          });
        }
      }
    }
    
    res.json({ received: true });
  } catch (error) {
    logger.error('Stripe Webhook 处理失败', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, message: 'Webhook 处理失败' });
  }
});

// 用户需要登录
router.use(requireUserAuth);

// 支持 fly.io 持久化卷：如果 /data 目录存在，使用 /data，否则使用本地目录
const DATA_DIR = fs.existsSync('/data') ? '/data' : path.join(__dirname, '..');

// 配置付款截图上传
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(DATA_DIR, 'uploads/payments');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `payment-${Date.now()}-${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error('只支持图片格式'));
    }
  }
});

// ==================== 余额管理 ====================

/**
 * GET /api/user/balance
 * Get current user balance
 * @returns {Object} Balance information
 */
router.get('/balance', async (req, res) => {
  try {
    const user = await getAsync('SELECT balance FROM users WHERE id = ?', [req.session.userId]);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.json({ success: true, balance: user.balance || 0 });
  } catch (error) {
    logger.error('获取用户余额失败', { error: error.message });
    res.status(500).json({ success: false, message: '获取余额失败' });
  }
});

// ==================== 订单管理 ====================

/**
 * POST /api/user/orders
 * Create a new order
 * @body {Array} items - Order items array
 * @body {string} [customer_name] - Customer name (optional)
 * @body {string} [notes] - Order notes (optional)
 * @returns {Object} Order object with id, order_number, total_amount, and items
 */
router.post('/orders', async (req, res) => {
  try {
    const { items, customer_name, notes, use_balance } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: '订单不能为空' });
    }

    // 检查点单是否开放
    const setting = await getAsync("SELECT value FROM settings WHERE key = 'ordering_open'");
    if (!setting || setting.value !== 'true') {
      return res.status(400).json({ success: false, message: '点单时间未开放' });
    }

    await beginTransaction();

    try {
      // 收集所有需要查询的产品ID和加料ID
      const productIds = items.map(item => item.product_id);
      const allToppingIds = [];
      items.forEach(item => {
        if (item.toppings && Array.isArray(item.toppings)) {
          allToppingIds.push(...item.toppings);
        }
      });

      // 批量查询所有产品
      const uniqueProductIds = [...new Set(productIds)];
      const placeholders = uniqueProductIds.map(() => '?').join(',');
      const products = await allAsync(
        `SELECT * FROM products WHERE id IN (${placeholders}) AND status = ?`,
        [...uniqueProductIds, 'active']
      );
      const productsMap = new Map(products.map(p => [p.id, p]));

      // 批量查询所有加料产品
      const toppingProductsMap = await batchGetToppingProducts(allToppingIds);

      // 计算订单总额
      let totalAmount = 0;
      const orderItems = [];

      for (const item of items) {
        const product = productsMap.get(item.product_id);

        if (!product) {
          throw new Error(`商品不存在或已下架: ${item.product_id}`);
        }

        const quantity = parseInt(item.quantity);
        if (quantity <= 0) {
          throw new Error('商品数量必须大于0');
        }

        // 使用helper函数计算价格
        const { price: finalPrice, toppingNames, toppingsWithPrice, sizePrice } = await calculateItemPrice(
          product,
          item.size || null,
          item.toppings || [],
          toppingProductsMap
        );

        // 使用精度处理，避免浮点数误差
        const subtotal = roundAmount(finalPrice * quantity);
        totalAmount = roundAmount(totalAmount + subtotal);

        orderItems.push({
          product_id: product.id,
          product_name: product.name,
          product_price: finalPrice,
          quantity: quantity,
          subtotal: subtotal,
          size: item.size || null,
          size_price: sizePrice || null, // 保存Size的基础价格
          sugar_level: item.sugar_level || '100',
          // 保存包含价格信息的加料数组（优先使用 toppingsWithPrice，如果没有则使用 toppingNames）
          toppings: (toppingsWithPrice && toppingsWithPrice.length > 0) 
            ? JSON.stringify(toppingsWithPrice) 
            : (toppingNames.length > 0 ? JSON.stringify(toppingNames) : null),
          ice_level: item.ice_level || null
        });
      }

      // 计算最终金额（先不考虑折扣，折扣在周期确认时计算）
      let finalAmount = roundAmount(totalAmount);
      let balanceUsed = 0;
      let orderStatus = 'pending';

      // 处理余额抵扣
      if (use_balance === true) {
        const user = await getAsync('SELECT balance FROM users WHERE id = ?', [req.session.userId]);
        if (!user) {
          throw new Error('用户不存在');
        }
        const userBalance = user.balance || 0;
        
        // 检查余额是否大于0
        if (userBalance <= 0) {
          await rollback();
          return res.status(400).json({ 
            success: false, 
            message: '余额不足，无法使用余额支付'
          });
        }
        
        // 计算实际使用的余额（取余额和订单金额中的较小值）
        balanceUsed = Math.min(userBalance, finalAmount);
        
        // 使用余额后，最终金额需要减去已使用的余额
        finalAmount = roundAmount(finalAmount - balanceUsed);
        
        // 如果余额完全覆盖订单，订单状态为已支付
        if (balanceUsed >= roundAmount(totalAmount)) {
          orderStatus = 'paid';
        } else {
          // 余额部分覆盖，订单状态仍为待支付
          orderStatus = 'pending';
        }
        
        // 扣除余额
        const balanceBefore = userBalance;
        const balanceAfter = roundAmount(balanceBefore - balanceUsed);
        
        await runAsync(
          'UPDATE users SET balance = ? WHERE id = ?',
          [balanceAfter, req.session.userId]
        );
        
        // 记录余额变动（订单ID稍后更新）
        await runAsync(
          `INSERT INTO balance_transactions (user_id, type, amount, balance_before, balance_after, order_id, notes, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))`,
          [
            req.session.userId,
            'use',
            -balanceUsed, // 负数表示减少
            balanceBefore,
            balanceAfter,
            null, // 订单ID稍后更新
            balanceUsed >= finalAmount ? '订单使用余额全额支付' : `订单使用余额部分支付（${balanceUsed.toFixed(2)} LE）`
          ]
        );
      }

      // 创建订单
      const orderId = uuidv4();
      
      // 生成订单号：BO + 时间戳后8位 + 3位随机字符（提高唯一性）
      // 添加冲突重试机制，最多重试3次
      let orderNumber;
      let attempts = 0;
      const maxAttempts = 3;
      
      do {
        const timestamp = Date.now().toString().slice(-8);
        const random = Math.random().toString(36).substring(2, 5).toUpperCase();
        // 如果重试，添加重试次数后缀
        orderNumber = 'BO' + timestamp + (attempts > 0 ? attempts.toString() : '') + random;
        attempts++;
        
        try {
          // 检查orders表是否有balance_used字段
          const ordersTableInfo = await allAsync("PRAGMA table_info(orders)");
          const ordersColumns = ordersTableInfo.map(col => col.name);
          
          if (ordersColumns.includes('balance_used')) {
            await runAsync(
              `INSERT INTO orders (id, order_number, user_id, customer_name, customer_phone, 
               total_amount, discount_amount, final_amount, balance_used, status, notes, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))`,
              [
                orderId,
                orderNumber,
                req.session.userId,
                customer_name || req.session.userName || '',
                req.session.userPhone,
                roundAmount(totalAmount),
                0,
                finalAmount,
                balanceUsed,
                orderStatus,
                notes || null
              ]
            );
          } else {
          await runAsync(
            `INSERT INTO orders (id, order_number, user_id, customer_name, customer_phone, 
             total_amount, discount_amount, final_amount, status, notes, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))`,
            [
              orderId,
              orderNumber,
              req.session.userId,
              customer_name || req.session.userName || '',
              req.session.userPhone,
                roundAmount(totalAmount),
              0,
                finalAmount,
                orderStatus,
              notes || null
            ]
          );
          }
          break; // 成功插入，退出循环
        } catch (error) {
          // 如果是 UNIQUE 约束冲突且还有重试次数，则重试
          if (error.code === 'SQLITE_CONSTRAINT' && attempts < maxAttempts) {
            // 等待10ms后重试，避免时间戳相同
            await new Promise(resolve => setTimeout(resolve, 10));
            continue;
          }
          // 其他错误或重试次数用完，抛出错误
          throw error;
        }
      } while (attempts < maxAttempts);
      
      // 如果使用了余额，更新余额变动记录中的订单ID
      if (balanceUsed > 0) {
        // SQLite 不支持 UPDATE ... ORDER BY ... LIMIT，需要使用子查询
        await runAsync(
          `UPDATE balance_transactions 
           SET order_id = ? 
           WHERE id = (
             SELECT id FROM balance_transactions 
             WHERE user_id = ? AND order_id IS NULL AND type = ? 
             ORDER BY id DESC LIMIT 1
           )`,
          [orderId, req.session.userId, 'use']
        );
      }
      
      if (!orderNumber) {
        throw new Error('生成订单号失败，请重试');
      }

      // 插入订单详情
      for (const item of orderItems) {
        await runAsync(
          `INSERT INTO order_items (order_id, product_id, product_name, product_price, quantity, subtotal, size, size_price, sugar_level, toppings, ice_level)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [orderId, item.product_id, item.product_name, item.product_price, item.quantity, item.subtotal, item.size, item.size_price || null, item.sugar_level, item.toppings, item.ice_level]
        );
      }

      // 更新当前周期的总金额（添加异步补偿机制，确保数据一致性）
      const activeCycle = await getAsync(
        "SELECT * FROM ordering_cycles WHERE status = 'active' ORDER BY id DESC LIMIT 1"
      );
      
      if (activeCycle) {
        try {
          await runAsync(
            "UPDATE ordering_cycles SET total_amount = total_amount + ?, updated_at = datetime('now', 'localtime') WHERE id = ?",
            [totalAmount, activeCycle.id]
          );
        } catch (error) {
          // 如果是数据库繁忙错误，异步补偿更新（不阻塞订单创建）
          if (error.code === 'SQLITE_BUSY') {
            logger.warn('周期总金额更新失败（数据库繁忙），将异步补偿', { 
              cycleId: activeCycle.id, 
              orderId,
              amount: totalAmount 
            });
            
            // 异步补偿更新（不阻塞订单创建，提升用户体验）
            setImmediate(async () => {
              let retries = 0;
              const maxRetries = 5;
              while (retries < maxRetries) {
                try {
                  await runAsync(
                    "UPDATE ordering_cycles SET total_amount = total_amount + ?, updated_at = datetime('now', 'localtime') WHERE id = ?",
                    [totalAmount, activeCycle.id]
                  );
                  logger.info('周期总金额补偿更新成功', { cycleId: activeCycle.id, orderId, retries });
                  break;
                } catch (retryError) {
                  retries++;
                  if (retries < maxRetries) {
                    // 指数退避：1秒、2秒、3秒、4秒、5秒
                    await new Promise(resolve => setTimeout(resolve, 1000 * retries));
                  } else {
                    logger.error('周期总金额补偿更新失败（已重试5次）', { 
                      cycleId: activeCycle.id, 
                      orderId,
                      amount: totalAmount,
                      error: retryError.message 
                    });
                  }
                }
              }
            });
          } else {
            // 其他错误继续抛出
            throw error;
          }
        }
      }

      await commit();

      logger.info('订单创建成功', { 
        orderId, 
        orderNumber, 
        userId: req.session.userId,
        totalAmount,
        balanceUsed,
        orderStatus
      });

      res.json({ 
        success: true, 
        message: orderStatus === 'paid' ? '订单创建成功，已使用余额支付' : '订单创建成功', 
        order: {
          id: orderId,
          order_number: orderNumber,
          total_amount: roundAmount(totalAmount),
          final_amount: finalAmount,
          balance_used: balanceUsed,
          status: orderStatus,
          notes: notes || null,
          items: orderItems
        }
      });
    } catch (error) {
      await rollback();
      throw error;
    }
  } catch (error) {
    logger.error('创建订单失败', { error: error.message, userId: req.session.userId });
    res.status(500).json({ success: false, message: error.message || '创建订单失败' });
  }
});

/**
 * GET /api/user/orders
 * Get current user's order list
 * @returns {Object} Orders array with items and cycle information
 */
router.get('/orders', async (req, res) => {
  try {
    // 检查session
    if (!req.session.userId) {
      return res.status(401).json({ success: false, message: '请先登录' });
    }

    // 支持分页参数
    const limit = parseInt(req.query.limit) || null; // 默认返回所有
    const offset = parseInt(req.query.offset) || 0;

    // 获取订单总数
    const totalResult = await getAsync(
      'SELECT COUNT(*) as total FROM orders WHERE user_id = ?',
      [req.session.userId]
    );
    const total = totalResult ? totalResult.total : 0;

    // 构建查询SQL
    let query = 'SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC';
    const params = [req.session.userId];
    
    if (limit !== null) {
      query += ' LIMIT ? OFFSET ?';
      params.push(limit, offset);
    }

    const orders = await allAsync(query, params);

    if (orders.length === 0) {
      return res.json({ success: true, orders: [], total: total, hasMore: false });
    }

    // 获取当前活跃周期
    const activeCycle = await getAsync(
      "SELECT * FROM ordering_cycles WHERE status = 'active' ORDER BY id DESC LIMIT 1"
    );

    // 批量获取订单项
    const orderIds = orders.map(o => o.id);
    const orderItemsMap = await batchGetOrderItems(orderIds);

    // 批量查找订单所属的周期
    const orderCreatedAts = orders.map(o => o.created_at);
    const orderCyclesMap = await findOrderCyclesBatch(orderCreatedAts);

    // 为每个订单添加详情和周期信息
    for (const order of orders) {
      // 从批量查询结果中获取订单项
      order.items = orderItemsMap.get(order.id) || [];
      
      // 从批量查询结果中获取周期信息
      const orderCycle = orderCyclesMap.get(order.created_at);
      if (orderCycle) {
        order.cycle_id = orderCycle.id;
        order.cycle_number = orderCycle.cycle_number;
        order.cycle_start_time = orderCycle.start_time;
        order.cycle_end_time = orderCycle.end_time;
        order.isActiveCycle = isActiveCycle(orderCycle, activeCycle);
      } else {
        order.cycle_id = null;
        order.cycle_number = null;
        order.cycle_start_time = null;
        order.cycle_end_time = null;
        order.isActiveCycle = isActiveCycle(null, activeCycle);
      }
      
      // 检查订单是否已过期
      order.isExpired = isOrderExpired(order, activeCycle, null);
    }

    // 判断是否还有更多订单
    const hasMore = limit !== null ? (offset + orders.length < total) : false;

    res.json({ success: true, orders, total, hasMore });
  } catch (error) {
    logger.error('获取订单列表失败', { error: error.message, userId: req.session.userId });
    res.status(500).json({ success: false, message: '获取订单列表失败' });
  }
});

/**
 * GET /api/user/orders/by-phone
 * Get orders by phone number
 * @returns {Object} Orders array with items and cycle information
 */
router.get('/orders/by-phone', async (req, res) => {
  try {
    // 检查session
    if (!req.session.userPhone) {
      return res.status(401).json({ success: false, message: '请先登录' });
    }

    const orders = await allAsync(
      'SELECT * FROM orders WHERE customer_phone = ? ORDER BY created_at DESC',
      [req.session.userPhone]
    );

    if (orders.length === 0) {
      return res.json({ success: true, orders: [] });
    }

    // 获取当前活跃周期
    const activeCycle = await getAsync(
      "SELECT * FROM ordering_cycles WHERE status = 'active' ORDER BY id DESC LIMIT 1"
    );

    // 批量获取订单项
    const orderIds = orders.map(o => o.id);
    const orderItemsMap = await batchGetOrderItems(orderIds);

    // 批量查找订单所属的周期
    const orderCreatedAts = orders.map(o => o.created_at);
    const orderCyclesMap = await findOrderCyclesBatch(orderCreatedAts);

    // 为每个订单添加详情和周期信息
    for (const order of orders) {
      // 从批量查询结果中获取订单项
      order.items = orderItemsMap.get(order.id) || [];
      
      // 从批量查询结果中获取周期信息
      const orderCycle = orderCyclesMap.get(order.created_at);
      if (orderCycle) {
        order.cycle_id = orderCycle.id;
        order.cycle_number = orderCycle.cycle_number;
        order.cycle_start_time = orderCycle.start_time;
        order.cycle_end_time = orderCycle.end_time;
        order.isActiveCycle = isActiveCycle(orderCycle, activeCycle);
      } else {
        order.cycle_id = null;
        order.cycle_number = null;
        order.cycle_start_time = null;
        order.cycle_end_time = null;
        order.isActiveCycle = isActiveCycle(null, activeCycle);
      }
      
      // 检查订单是否已过期
      order.isExpired = isOrderExpired(order, activeCycle, null);
    }

    res.json({ success: true, orders });
  } catch (error) {
    logger.error('获取订单列表失败', { error: error.message, phone: req.session.userPhone });
    res.status(500).json({ success: false, message: '获取订单列表失败' });
  }
});

/**
 * GET /api/user/orders/:id
 * Get order details by ID
 * @param {string} id - Order ID
 * @returns {Object} Order object with items
 */
router.get('/orders/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const order = await getAsync(
      'SELECT * FROM orders WHERE id = ? AND (user_id = ? OR customer_phone = ?)',
      [id, req.session.userId, req.session.userPhone]
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
 * DELETE /api/user/orders/:id
 * Delete an order (only pending status and when ordering is open)
 * @param {string} id - Order ID
 * @returns {Object} Success message
 */
router.delete('/orders/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // 检查订单是否存在且属于当前用户
    const order = await getAsync(
      'SELECT * FROM orders WHERE id = ? AND (user_id = ? OR customer_phone = ?)',
      [id, req.session.userId, req.session.userPhone]
    );

    if (!order) {
      return res.status(404).json({ success: false, message: '订单不存在' });
    }

    // 只能删除pending状态的订单
    if (order.status !== 'pending') {
      return res.status(400).json({ success: false, message: '只能删除待付款的订单' });
    }

    // 检查点单是否开放
    const setting = await getAsync("SELECT value FROM settings WHERE key = 'ordering_open'");
    if (!setting || setting.value !== 'true') {
      return res.status(400).json({ success: false, message: '点单已关闭，无法删除订单' });
    }

    // 删除订单详情和订单
    await beginTransaction();
    try {
      // 如果订单使用了余额，需要退还余额
      const ordersTableInfo = await allAsync("PRAGMA table_info(orders)");
      const ordersColumns = ordersTableInfo.map(col => col.name);
      const balanceUsed = ordersColumns.includes('balance_used') && order.balance_used ? (order.balance_used || 0) : 0;
      
      if (balanceUsed > 0) {
        // 获取用户当前余额
        const user = await getAsync('SELECT balance FROM users WHERE id = ?', [req.session.userId]);
        if (user) {
          const balanceBefore = user.balance || 0;
          const balanceAfter = roundAmount(balanceBefore + balanceUsed);
          
          // 退还余额
          await runAsync(
            'UPDATE users SET balance = ? WHERE id = ?',
            [balanceAfter, req.session.userId]
          );
          
          // 记录余额变动
          await runAsync(
            `INSERT INTO balance_transactions (user_id, type, amount, balance_before, balance_after, order_id, notes, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))`,
            [
              req.session.userId,
              'refund',
              balanceUsed, // 正数表示增加
              balanceBefore,
              balanceAfter,
              order.id,
              '订单取消，退还余额'
            ]
          );
        }
      }

      // 从周期总金额中减去订单金额
      if (order.cycle_id) {
        const cycle = await getAsync('SELECT * FROM ordering_cycles WHERE id = ?', [order.cycle_id]);
        if (cycle) {
          await runAsync(
            "UPDATE ordering_cycles SET total_amount = total_amount - ?, updated_at = datetime('now', 'localtime') WHERE id = ?",
            [order.total_amount, order.cycle_id]
          );
        }
      }

      await runAsync('DELETE FROM order_items WHERE order_id = ?', [id]);
      await runAsync('DELETE FROM orders WHERE id = ?', [id]);
      await commit();

      logger.info('订单删除成功', { orderId: id, userId: req.session.userId });

      res.json({ success: true, message: '订单删除成功' });
    } catch (error) {
      await rollback();
      throw error;
    }
  } catch (error) {
    logger.error('删除订单失败', { error: error.message });
    res.status(500).json({ success: false, message: '删除订单失败' });
  }
});

/**
 * PUT /api/user/orders/:id
 * Update an order (only pending status and when ordering is open)
 * @param {string} id - Order ID
 * @body {Array} items - Updated order items array
 * @body {string} [notes] - Updated order notes (optional)
 * @returns {Object} Updated order object
 */
router.put('/orders/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { items, notes } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: '订单不能为空' });
    }

    // 检查订单是否存在且属于当前用户
    const order = await getAsync(
      'SELECT * FROM orders WHERE id = ? AND (user_id = ? OR customer_phone = ?)',
      [id, req.session.userId, req.session.userPhone]
    );

    if (!order) {
      return res.status(404).json({ success: false, message: '订单不存在' });
    }

    // 只能修改pending状态的订单
    if (order.status !== 'pending') {
      return res.status(400).json({ success: false, message: '只能修改待付款的订单' });
    }

    // 检查点单是否开放
    const setting = await getAsync("SELECT value FROM settings WHERE key = 'ordering_open'");
    if (!setting || setting.value !== 'true') {
      return res.status(400).json({ success: false, message: '点单已关闭，无法修改订单' });
    }

    await beginTransaction();
    try {
      // 收集所有需要查询的产品ID和加料ID
      const productIds = items.map(item => item.product_id);
      const allToppingIds = [];
      items.forEach(item => {
        if (item.toppings && Array.isArray(item.toppings)) {
          allToppingIds.push(...item.toppings);
        }
      });

      // 批量查询所有产品
      const uniqueProductIds = [...new Set(productIds)];
      const placeholders = uniqueProductIds.map(() => '?').join(',');
      const products = await allAsync(
        `SELECT * FROM products WHERE id IN (${placeholders}) AND status = ?`,
        [...uniqueProductIds, 'active']
      );
      const productsMap = new Map(products.map(p => [p.id, p]));

      // 批量查询所有加料产品
      const toppingProductsMap = await batchGetToppingProducts(allToppingIds);

      // 计算新的订单总额
      let totalAmount = 0;
      const orderItems = [];

      for (const item of items) {
        const product = productsMap.get(item.product_id);

        if (!product) {
          throw new Error(`商品不存在或已下架: ${item.product_id}`);
        }

        const quantity = parseInt(item.quantity);
        if (quantity <= 0) {
          throw new Error('商品数量必须大于0');
        }

        // 使用helper函数计算价格
        const { price: finalPrice, toppingNames, toppingsWithPrice, sizePrice } = await calculateItemPrice(
          product,
          item.size || null,
          item.toppings || [],
          toppingProductsMap
        );

        // 使用精度处理，避免浮点数误差
        const subtotal = roundAmount(finalPrice * quantity);
        totalAmount = roundAmount(totalAmount + subtotal);

        orderItems.push({
          product_id: product.id,
          product_name: product.name,
          product_price: finalPrice,
          quantity: quantity,
          subtotal: subtotal,
          size: item.size || null,
          size_price: sizePrice || null, // 保存Size的基础价格
          sugar_level: item.sugar_level || '100',
          // 保存包含价格信息的加料数组（优先使用 toppingsWithPrice，如果没有则使用 toppingNames）
          toppings: (toppingsWithPrice && toppingsWithPrice.length > 0) 
            ? JSON.stringify(toppingsWithPrice) 
            : (toppingNames.length > 0 ? JSON.stringify(toppingNames) : null),
          ice_level: item.ice_level || null
        });
      }

      // 删除旧的订单详情
      await runAsync('DELETE FROM order_items WHERE order_id = ?', [id]);

      // 插入新的订单详情（安全处理，只插入存在的字段）
      const orderItemsTableInfo = await allAsync("PRAGMA table_info(order_items)");
      const orderItemsColumns = orderItemsTableInfo.map(col => col.name);
      
      for (const item of orderItems) {
        const insertFields = ['order_id', 'product_id', 'product_name', 'product_price', 'quantity', 'subtotal'];
        const insertValues = [id, item.product_id, item.product_name, item.product_price, item.quantity, item.subtotal];
        
        if (orderItemsColumns.includes('size')) {
          insertFields.push('size');
          insertValues.push(item.size || null);
        }
        if (orderItemsColumns.includes('size_price')) {
          insertFields.push('size_price');
          insertValues.push(item.size_price || null);
        }
        if (orderItemsColumns.includes('sugar_level')) {
          insertFields.push('sugar_level');
          insertValues.push(item.sugar_level || '100');
        }
        if (orderItemsColumns.includes('toppings')) {
          insertFields.push('toppings');
          insertValues.push(item.toppings || null);
        }
        if (orderItemsColumns.includes('ice_level')) {
          insertFields.push('ice_level');
          insertValues.push(item.ice_level || null);
        }
        
        await runAsync(
          `INSERT INTO order_items (${insertFields.join(', ')}) VALUES (${insertFields.map(() => '?').join(', ')})`,
          insertValues
        );
      }

      // 安全更新订单总额和备注（检查字段是否存在）
      const ordersTableInfo = await allAsync("PRAGMA table_info(orders)");
      const ordersColumns = ordersTableInfo.map(col => col.name);
      
      // 确保 totalAmount 精度正确
      totalAmount = roundAmount(totalAmount);
      
      // 计算 final_amount：如果订单使用了余额，需要减去余额
      const balanceUsed = ordersColumns.includes('balance_used') && order.balance_used ? (order.balance_used || 0) : 0;
      const finalAmount = roundAmount(totalAmount - balanceUsed);
      
      const updateFields = ['total_amount = ?', 'final_amount = ?'];
      const updateValues = [totalAmount, finalAmount];
      
      if (ordersColumns.includes('notes')) {
        updateFields.push('notes = ?');
        updateValues.push(notes || null);
      }
      if (ordersColumns.includes('updated_at')) {
        updateFields.push("updated_at = datetime('now', 'localtime')");
      }
      
      updateValues.push(id);
      
      await runAsync(
        `UPDATE orders SET ${updateFields.join(', ')} WHERE id = ?`,
        updateValues
      );

      await commit();

      logger.info('订单更新成功', { orderId: id, userId: req.session.userId, totalAmount });

      res.json({ 
        success: true, 
        message: '订单更新成功',
        order: {
          id,
          total_amount: roundAmount(totalAmount),
          items: orderItems
        }
      });
    } catch (error) {
      await rollback();
      throw error;
    }
  } catch (error) {
    logger.error('更新订单失败', { error: error.message });
    res.status(500).json({ success: false, message: error.message || '更新订单失败' });
  }
});

/**
 * POST /api/user/orders/:id/payment
 * Upload payment screenshot (only when ordering is closed)
 * @param {string} id - Order ID
 * @body {File} payment_image - Payment screenshot image file
 * @returns {Object} Success message with payment_image URL
 */
router.post('/orders/:id/payment', upload.single('payment_image'), async (req, res) => {
  try {
    const { id } = req.params;

    // 检查点单是否已关闭
    const setting = await getAsync("SELECT value FROM settings WHERE key = 'ordering_open'");
    if (setting && setting.value === 'true') {
      return res.status(400).json({ success: false, message: '点单时间未关闭，暂不能付款' });
    }

    const order = await getAsync(
      'SELECT * FROM orders WHERE id = ? AND (user_id = ? OR customer_phone = ?)',
      [id, req.session.userId, req.session.userPhone]
    );

    if (!order) {
      return res.status(404).json({ success: false, message: '订单不存在' });
    }

    if (order.status === 'paid' || order.status === 'completed') {
      return res.status(400).json({ success: false, message: '订单已付款' });
    }

    // 检查订单是否已被取消（周期确认后自动取消）
    if (order.status === 'cancelled') {
      return res.status(400).json({ success: false, message: '订单已取消，无法上传付款截图' });
    }

    // 检查订单所属周期是否已确认（如果周期已确认，禁止上传付款截图）
    if (order.cycle_id) {
      const cycle = await getAsync('SELECT status FROM ordering_cycles WHERE id = ?', [order.cycle_id]);
      if (cycle && cycle.status === 'confirmed') {
        return res.status(400).json({ success: false, message: '该周期已确认，无法上传付款截图' });
      }
    } else {
      // 如果没有 cycle_id，通过订单创建时间查找对应的周期
      const cycle = await getAsync(
        `SELECT status FROM ordering_cycles 
         WHERE start_time <= ? AND (end_time >= ? OR end_time IS NULL) 
         ORDER BY start_time DESC LIMIT 1`,
        [order.created_at, order.created_at]
      );
      if (cycle && cycle.status === 'confirmed') {
        return res.status(400).json({ success: false, message: '该周期已确认，无法上传付款截图' });
      }
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: '请上传付款截图' });
    }

    const paymentImage = `/uploads/payments/${req.file.filename}`;

    await runAsync(
      `UPDATE orders SET payment_image = ?, status = 'paid', payment_time = datetime('now', 'localtime'), 
       updated_at = datetime('now', 'localtime') WHERE id = ?`,
      [paymentImage, id]
    );

    logger.info('付款截图上传成功', { orderId: id, userId: req.session.userId });

    res.json({ 
      success: true, 
      message: '付款截图上传成功',
      payment_image: paymentImage
    });
  } catch (error) {
    logger.error('上传付款截图失败', { error: error.message });
    res.status(500).json({ success: false, message: '上传付款截图失败' });
  }
});

/**
 * GET /api/user/stripe-config
 * 获取 Stripe 配置（仅返回公钥给前端）
 * @returns {Object} Stripe 配置对象
 */
router.get('/stripe-config', async (req, res) => {
  try {
    const publishableKey = await getStripePublishableKey();
    const trimmedKey = publishableKey ? publishableKey.trim() : '';
    const isValid = trimmedKey && trimmedKey.startsWith('pk_');
    
    logger.info('获取 Stripe 配置', { 
      hasKey: !!publishableKey, 
      keyLength: trimmedKey.length,
      isValid: isValid,
      keyPrefix: trimmedKey ? trimmedKey.substring(0, 10) : 'empty'
    });
    
    res.json({
      success: true,
      publishableKey: trimmedKey,
      enabled: isValid
    });
  } catch (error) {
    logger.error('获取 Stripe 配置失败', { error: error.message });
    res.status(500).json({ success: false, message: '获取配置失败' });
  }
});

/**
 * POST /api/user/orders/:id/create-payment-intent
 * 创建 Stripe Payment Intent
 * @param {string} id - Order ID
 * @returns {Object} Payment Intent 信息（包含 clientSecret）
 */
router.post('/orders/:id/create-payment-intent', async (req, res) => {
  try {
    const { id } = req.params;
    const stripeSecretKey = await getStripeSecretKey();
    
    if (!stripeSecretKey) {
      return res.status(400).json({ 
        success: false, 
        message: 'Stripe 未配置，请联系管理员' 
      });
    }
    
    const stripe = require('stripe')(stripeSecretKey);
    
    // 获取订单信息
    const order = await getAsync(
      'SELECT * FROM orders WHERE id = ? AND (user_id = ? OR customer_phone = ?)',
      [id, req.session.userId, req.session.userPhone]
    );
    
    if (!order) {
      return res.status(404).json({ success: false, message: '订单不存在' });
    }
    
    if (order.status === 'paid' || order.status === 'completed') {
      return res.status(400).json({ success: false, message: '订单已付款' });
    }
    
    // 检查订单所属周期是否已确认
    if (order.cycle_id) {
      const cycle = await getAsync('SELECT status FROM ordering_cycles WHERE id = ?', [order.cycle_id]);
      if (cycle && cycle.status === 'confirmed') {
        return res.status(400).json({ success: false, message: '该周期已确认，无法支付' });
      }
    } else {
      // 如果没有 cycle_id，通过订单创建时间查找对应的周期
      const cycle = await getAsync(
        `SELECT status FROM ordering_cycles 
         WHERE start_time <= ? AND (end_time >= ? OR end_time IS NULL) 
         ORDER BY start_time DESC LIMIT 1`,
        [order.created_at, order.created_at]
      );
      if (cycle && cycle.status === 'confirmed') {
        return res.status(400).json({ success: false, message: '该周期已确认，无法支付' });
      }
    }
    
    // 创建 Payment Intent
    // 注意：金额需要转换为最小单位（EGP: 1 EGP = 100 piastres）
    const amountInCents = Math.round(order.final_amount * 100);
    
    // 使用 Payment Element 时，不需要手动指定 payment_method_types
    // Payment Element 会自动检测设备支持的支付方式（包括 Apple Pay、Google Pay、银行卡等）
    // 参考：https://docs.stripe.com/payments/payment-element
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: 'egp', // 埃及镑
      // 不指定 payment_method_types，让 Payment Element 自动处理
      // Payment Element 会自动显示设备支持的所有支付方式
      automatic_payment_methods: {
        enabled: true, // 启用自动支付方式检测
        allow_redirects: 'never' // 不允许重定向（保持在同一页面）
      },
      metadata: {
        order_id: order.id,
        order_number: order.order_number,
        user_id: req.session.userId || '',
        customer_phone: order.customer_phone
      },
      description: `订单 ${order.order_number} - ${order.customer_name || order.customer_phone}`
    });
    
    // 更新订单，保存 payment_intent_id
    await runAsync(
      `UPDATE orders SET 
       stripe_payment_intent_id = ?, 
       payment_method = 'stripe',
       updated_at = datetime('now', 'localtime') 
       WHERE id = ?`,
      [paymentIntent.id, id]
    );
    
    logger.info('Stripe Payment Intent 创建成功', { 
      orderId: id, 
      paymentIntentId: paymentIntent.id 
    });
    
    res.json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id
    });
  } catch (error) {
    logger.error('创建 Payment Intent 失败', { error: error.message, stack: error.stack });
    res.status(500).json({ 
      success: false, 
      message: '创建支付失败: ' + error.message 
    });
  }
});

/**
 * POST /api/user/orders/:id/confirm-stripe-payment
 * 确认 Stripe 支付（前端调用，用于更新订单状态）
 * @param {string} id - Order ID
 * @body {string} paymentIntentId - Payment Intent ID
 * @returns {Object} 确认结果
 */
router.post('/orders/:id/confirm-stripe-payment', async (req, res) => {
  try {
    const { id } = req.params;
    const { paymentIntentId } = req.body;
    
    if (!paymentIntentId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Payment Intent ID 不能为空' 
      });
    }
    
    const stripeSecretKey = await getStripeSecretKey();
    if (!stripeSecretKey) {
      return res.status(400).json({ 
        success: false, 
        message: 'Stripe 未配置' 
      });
    }
    
    const stripe = require('stripe')(stripeSecretKey);
    
    // 验证订单
    const order = await getAsync(
      'SELECT * FROM orders WHERE id = ? AND (user_id = ? OR customer_phone = ?)',
      [id, req.session.userId, req.session.userPhone]
    );
    
    if (!order) {
      return res.status(404).json({ success: false, message: '订单不存在' });
    }
    
    // 验证 Payment Intent
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    
    if (paymentIntent.status !== 'succeeded') {
      return res.status(400).json({ 
        success: false, 
        message: '支付未成功，状态: ' + paymentIntent.status 
      });
    }
    
    // 验证金额
    const amountInCents = Math.round(order.final_amount * 100);
    if (paymentIntent.amount !== amountInCents) {
      return res.status(400).json({ 
        success: false, 
        message: '支付金额不匹配' 
      });
    }
    
    // 验证订单 ID 匹配
    if (paymentIntent.metadata.order_id !== order.id) {
      return res.status(400).json({ 
        success: false, 
        message: '订单 ID 不匹配' 
      });
    }
    
    // 更新订单状态
    await runAsync(
      `UPDATE orders SET 
       status = 'paid', 
       payment_method = 'stripe',
       payment_time = datetime('now', 'localtime'),
       updated_at = datetime('now', 'localtime') 
       WHERE id = ?`,
      [id]
    );
    
    logger.info('Stripe 支付确认成功', { 
      orderId: id, 
      paymentIntentId: paymentIntentId 
    });
    
    res.json({ 
      success: true, 
      message: '支付成功' 
    });
  } catch (error) {
    logger.error('确认 Stripe 支付失败', { error: error.message, stack: error.stack });
    res.status(500).json({ 
      success: false, 
      message: '确认支付失败: ' + error.message 
    });
  }
});

/**
 * GET /api/user/orders-summary
 * Get order summary with total amount, discount, and final amount
 * @returns {Object} Summary object with total_orders, total_amount, total_discount, total_final_amount, and orders array
 */
router.get('/orders-summary', async (req, res) => {
  try {
    // 获取所有订单
    const orders = await allAsync(
      'SELECT * FROM orders WHERE user_id = ? OR customer_phone = ? ORDER BY created_at DESC',
      [req.session.userId, req.session.userPhone]
    );

    // 批量获取订单详情
    if (orders.length > 0) {
      const orderIds = orders.map(o => o.id);
      const orderItemsMap = await batchGetOrderItems(orderIds);
      
      for (const order of orders) {
        order.items = orderItemsMap.get(order.id) || [];
      }
    }

    // 计算汇总
    let totalAmount = 0;
    let totalDiscount = 0;
    let totalFinalAmount = 0;

    orders.forEach(order => {
      totalAmount += order.total_amount || 0;
      totalDiscount += order.discount_amount || 0;
      totalFinalAmount += order.final_amount || 0;
    });

    res.json({
      success: true,
      summary: {
        total_orders: orders.length,
        total_amount: totalAmount,
        total_discount: totalDiscount,
        total_final_amount: totalFinalAmount
      },
      orders
    });
  } catch (error) {
    logger.error('获取订单汇总失败', { error: error.message });
    res.status(500).json({ success: false, message: '获取订单汇总失败' });
  }
});

module.exports = router;

