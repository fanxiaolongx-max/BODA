const express = require('express');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { runAsync, getAsync, allAsync, beginTransaction, commit, rollback } = require('../db/database');
const { requireUserAuth } = require('../middleware/auth');
const { logger } = require('../utils/logger');

const router = express.Router();

// 辅助函数：查找订单所属的周期
async function findOrderCycle(orderCreatedAt) {
  // 查找包含订单时间的周期
  const cycle = await getAsync(
    `SELECT * FROM ordering_cycles 
     WHERE start_time <= ? 
     AND (end_time IS NULL OR end_time >= ?)
     ORDER BY start_time DESC LIMIT 1`,
    [orderCreatedAt, orderCreatedAt]
  );
  return cycle;
}

// 用户需要登录
router.use(requireUserAuth);

// 配置付款截图上传
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/payments');
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

// ==================== 订单管理 ====================

// 创建订单
router.post('/orders', async (req, res) => {
  try {
    const { items, customer_name } = req.body;

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
      // 计算订单总额
      let totalAmount = 0;
      const orderItems = [];

      for (const item of items) {
        const product = await getAsync(
          'SELECT * FROM products WHERE id = ? AND status = ?',
          [item.product_id, 'active']
        );

        if (!product) {
          throw new Error(`商品不存在或已下架: ${item.product_id}`);
        }

        const quantity = parseInt(item.quantity);
        if (quantity <= 0) {
          throw new Error('商品数量必须大于0');
        }

        // 计算基础价格（根据杯型）
        let itemPrice = product.price;
        if (item.size) {
          try {
            const sizes = JSON.parse(product.sizes || '{}');
            if (sizes[item.size]) {
              itemPrice = sizes[item.size];
            }
          } catch (e) {
            // 如果解析失败，使用默认价格
          }
        }

        // 计算加料价格
        let toppingPrice = 0;
        let toppingNames = [];
        if (item.toppings && Array.isArray(item.toppings) && item.toppings.length > 0) {
          for (const toppingId of item.toppings) {
            const topping = await getAsync('SELECT * FROM products WHERE id = ?', [toppingId]);
            if (topping) {
              toppingPrice += topping.price;
              toppingNames.push(topping.name);
            }
          }
        }

        // 最终单价 = 基础价格 + 加料价格
        const finalPrice = itemPrice + toppingPrice;
        const subtotal = finalPrice * quantity;
        totalAmount += subtotal;

        orderItems.push({
          product_id: product.id,
          product_name: product.name,
          product_price: finalPrice,
          quantity: quantity,
          subtotal: subtotal,
          size: item.size || null,
          sugar_level: item.sugar_level || '100',
          toppings: toppingNames.length > 0 ? JSON.stringify(toppingNames) : null
        });
      }

      // 创建订单
      const orderId = uuidv4();
      const orderNumber = 'BO' + Date.now().toString().slice(-8);

      await runAsync(
        `INSERT INTO orders (id, order_number, user_id, customer_name, customer_phone, 
         total_amount, discount_amount, final_amount, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))`,
        [
          orderId,
          orderNumber,
          req.session.userId,
          customer_name || req.session.userName || '',
          req.session.userPhone,
          totalAmount,
          0,
          totalAmount,
          'pending'
        ]
      );

      // 插入订单详情
      for (const item of orderItems) {
        await runAsync(
          `INSERT INTO order_items (order_id, product_id, product_name, product_price, quantity, subtotal, size, sugar_level, toppings)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [orderId, item.product_id, item.product_name, item.product_price, item.quantity, item.subtotal, item.size, item.sugar_level, item.toppings]
        );
      }

      // 更新当前周期的总金额
      const activeCycle = await getAsync(
        "SELECT * FROM ordering_cycles WHERE status = 'active' ORDER BY id DESC LIMIT 1"
      );
      
      if (activeCycle) {
        await runAsync(
          "UPDATE ordering_cycles SET total_amount = total_amount + ?, updated_at = datetime('now', 'localtime') WHERE id = ?",
          [totalAmount, activeCycle.id]
        );
      }

      await commit();

      logger.info('订单创建成功', { 
        orderId, 
        orderNumber, 
        userId: req.session.userId,
        totalAmount 
      });

      res.json({ 
        success: true, 
        message: '订单创建成功', 
        order: {
          id: orderId,
          order_number: orderNumber,
          total_amount: totalAmount,
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

// 获取我的订单列表
router.get('/orders', async (req, res) => {
  try {
    // 检查session
    if (!req.session.userId) {
      return res.status(401).json({ success: false, message: '请先登录' });
    }

    const orders = await allAsync(
      'SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC',
      [req.session.userId]
    );

    // 获取当前活跃周期
    const activeCycle = await getAsync(
      "SELECT * FROM ordering_cycles WHERE status = 'active' ORDER BY id DESC LIMIT 1"
    );

    // 获取订单详情并检查周期状态
    for (const order of orders) {
      order.items = await allAsync(
        'SELECT * FROM order_items WHERE order_id = ?',
        [order.id]
      );
      
      // 查找订单所属的周期
      const orderCycle = await findOrderCycle(order.created_at);
      if (orderCycle) {
        order.cycle_id = orderCycle.id;
        order.cycle_number = orderCycle.cycle_number;
        order.cycle_start_time = orderCycle.start_time;
        order.cycle_end_time = orderCycle.end_time;
        // 判断是否属于当前活跃周期
        // 如果没有活跃周期，所有订单都属于"当前周期"（不显示为灰色）
        order.isActiveCycle = activeCycle ? (orderCycle.id === activeCycle.id) : true;
      } else {
        order.cycle_id = null;
        order.cycle_number = null;
        order.cycle_start_time = null;
        order.cycle_end_time = null;
        // 如果没有找到周期，且没有活跃周期，则认为是当前周期
        order.isActiveCycle = !activeCycle;
      }
      
      // 检查订单是否属于历史周期
      // 只有开始下一个周期时，上一个周期的订单才标记为过期
      order.isExpired = false;
      if (activeCycle) {
        // 如果存在活跃周期，检查订单是否在当前活跃周期之前
        const orderTime = new Date(order.created_at);
        const cycleStart = new Date(activeCycle.start_time);
        
        // 只有订单在当前活跃周期开始时间之前，才标记为过期
        if (orderTime < cycleStart) {
          order.isExpired = true;
        }
      }
      // 如果没有活跃周期，说明还没有开始下一个周期，不标记为过期
    }

    res.json({ success: true, orders });
  } catch (error) {
    logger.error('获取订单列表失败', { error: error.message, userId: req.session.userId });
    res.status(500).json({ success: false, message: '获取订单列表失败' });
  }
});

// 根据手机号获取订单
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

    // 获取当前活跃周期
    const activeCycle = await getAsync(
      "SELECT * FROM ordering_cycles WHERE status = 'active' ORDER BY id DESC LIMIT 1"
    );

    // 获取订单详情并检查周期状态
    for (const order of orders) {
      order.items = await allAsync(
        'SELECT * FROM order_items WHERE order_id = ?',
        [order.id]
      );
      
      // 查找订单所属的周期
      const orderCycle = await findOrderCycle(order.created_at);
      if (orderCycle) {
        order.cycle_id = orderCycle.id;
        order.cycle_number = orderCycle.cycle_number;
        order.cycle_start_time = orderCycle.start_time;
        order.cycle_end_time = orderCycle.end_time;
        // 判断是否属于当前活跃周期
        // 如果没有活跃周期，所有订单都属于"当前周期"（不显示为灰色）
        order.isActiveCycle = activeCycle ? (orderCycle.id === activeCycle.id) : true;
      } else {
        order.cycle_id = null;
        order.cycle_number = null;
        order.cycle_start_time = null;
        order.cycle_end_time = null;
        // 如果没有找到周期，且没有活跃周期，则认为是当前周期
        order.isActiveCycle = !activeCycle;
      }
      
      // 检查订单是否属于历史周期
      // 只有开始下一个周期时，上一个周期的订单才标记为过期
      order.isExpired = false;
      if (activeCycle) {
        // 如果存在活跃周期，检查订单是否在当前活跃周期之前
        const orderTime = new Date(order.created_at);
        const cycleStart = new Date(activeCycle.start_time);
        
        // 只有订单在当前活跃周期开始时间之前，才标记为过期
        if (orderTime < cycleStart) {
          order.isExpired = true;
        }
      }
      // 如果没有活跃周期，说明还没有开始下一个周期，不标记为过期
    }

    res.json({ success: true, orders });
  } catch (error) {
    logger.error('获取订单列表失败', { error: error.message, phone: req.session.userPhone });
    res.status(500).json({ success: false, message: '获取订单列表失败' });
  }
});

// 获取订单详情
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

// 删除订单（仅限pending状态且点单开放期间）
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

// 更新订单（仅限pending状态且点单开放期间）
router.put('/orders/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { items } = req.body;

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
      // 计算新的订单总额
      let totalAmount = 0;
      const orderItems = [];

      for (const item of items) {
        const product = await getAsync(
          'SELECT * FROM products WHERE id = ? AND status = ?',
          [item.product_id, 'active']
        );

        if (!product) {
          throw new Error(`商品不存在或已下架: ${item.product_id}`);
        }

        const quantity = parseInt(item.quantity);
        if (quantity <= 0) {
          throw new Error('商品数量必须大于0');
        }

        // 计算价格（考虑杯型和加料）
        let itemPrice = product.price;
        
        // 如果指定了杯型，使用杯型价格
        if (item.size) {
          try {
            const sizes = JSON.parse(product.sizes || '{}');
            if (sizes[item.size]) {
              itemPrice = sizes[item.size];
            }
          } catch (e) {
            // 使用默认价格
          }
        }
        
        // 计算加料价格
        let toppingPrice = 0;
        let toppingNames = [];
        if (item.toppings && Array.isArray(item.toppings)) {
          for (const toppingId of item.toppings) {
            const topping = await getAsync('SELECT * FROM products WHERE id = ?', [toppingId]);
            if (topping) {
              toppingPrice += topping.price;
              toppingNames.push(topping.name);
            }
          }
        }
        
        const finalPrice = itemPrice + toppingPrice;
        const subtotal = finalPrice * quantity;
        totalAmount += subtotal;

        orderItems.push({
          product_id: product.id,
          product_name: product.name,
          product_price: finalPrice,
          quantity: quantity,
          subtotal: subtotal,
          size: item.size || null,
          sugar_level: item.sugar_level || '100',
          toppings: toppingNames.length > 0 ? JSON.stringify(toppingNames) : null
        });
      }

      // 删除旧的订单详情
      await runAsync('DELETE FROM order_items WHERE order_id = ?', [id]);

      // 插入新的订单详情
      for (const item of orderItems) {
        await runAsync(
          `INSERT INTO order_items (order_id, product_id, product_name, product_price, quantity, subtotal, size, sugar_level, toppings)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, item.product_id, item.product_name, item.product_price, item.quantity, item.subtotal, item.size, item.sugar_level, item.toppings]
        );
      }

      // 更新订单总额
      await runAsync(
        "UPDATE orders SET total_amount = ?, final_amount = ?, updated_at = datetime('now', 'localtime') WHERE id = ?",
        [totalAmount, totalAmount, id]
      );

      await commit();

      logger.info('订单更新成功', { orderId: id, userId: req.session.userId, totalAmount });

      res.json({ 
        success: true, 
        message: '订单更新成功',
        order: {
          id,
          total_amount: totalAmount,
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

// 上传付款截图
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

// ==================== 获取订单汇总（含折扣） ====================
router.get('/orders-summary', async (req, res) => {
  try {
    // 获取所有订单
    const orders = await allAsync(
      'SELECT * FROM orders WHERE user_id = ? OR customer_phone = ? ORDER BY created_at DESC',
      [req.session.userId, req.session.userPhone]
    );

    // 获取订单详情
    for (const order of orders) {
      order.items = await allAsync(
        'SELECT * FROM order_items WHERE order_id = ?',
        [order.id]
      );
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

