const express = require('express');
const { getAsync, allAsync, runAsync } = require('../db/database');
const { logger } = require('../utils/logger');

const router = express.Router();

// ==================== 公开接口（无需登录） ====================

// 获取系统设置
router.get('/settings', async (req, res) => {
  try {
    const settings = await allAsync('SELECT * FROM settings');
    const settingsObj = {};
    settings.forEach(s => {
      settingsObj[s.key] = s.value;
    });
    res.json({ success: true, settings: settingsObj });
  } catch (error) {
    logger.error('获取系统设置失败', { error: error.message });
    res.status(500).json({ success: false, message: '获取系统设置失败' });
  }
});

// 获取所有分类
router.get('/categories', async (req, res) => {
  try {
    const categories = await allAsync(
      'SELECT * FROM categories WHERE status = ? ORDER BY sort_order, id',
      ['active']
    );
    res.json({ success: true, categories });
  } catch (error) {
    logger.error('获取分类失败', { error: error.message });
    res.status(500).json({ success: false, message: '获取分类失败' });
  }
});

// 获取菜品列表（仅激活状态）
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

// 根据订单号获取订单详情（用于扫码查询）
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

// 获取折扣规则
router.get('/discount-rules', async (req, res) => {
  try {
    const rules = await allAsync(
      'SELECT * FROM discount_rules WHERE status = ? ORDER BY min_amount',
      ['active']
    );
    res.json({ success: true, rules });
  } catch (error) {
    logger.error('获取折扣规则失败', { error: error.message });
    res.status(500).json({ success: false, message: '获取折扣规则失败' });
  }
});

// 计算折扣（点单关闭后）
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
          discountRate = rule.discount_rate;
          break;
        }
      }
    }

    // 更新所有待付款订单的折扣
    const pendingOrders = await allAsync(
      "SELECT * FROM orders WHERE status = 'pending'"
    );

    for (const order of pendingOrders) {
      const discountAmount = order.total_amount * discountRate;
      const finalAmount = order.total_amount - discountAmount;

      await runAsync(
        "UPDATE orders SET discount_amount = ?, final_amount = ?, updated_at = datetime('now', 'localtime') WHERE id = ?",
        [discountAmount, finalAmount, order.id]
      );
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

// 获取当前周期的折扣信息
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

module.exports = router;

