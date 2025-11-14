const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { runAsync, getAsync, allAsync, beginTransaction, commit, rollback } = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { 
  productValidation, 
  categoryValidation, 
  discountValidation 
} = require('../middleware/validation');
const { logAction, logger } = require('../utils/logger');
const { body } = require('express-validator');

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

// 所有管理员路由都需要认证
router.use(requireAuth);

// 配置文件上传（菜单图片）
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/products');
  },
  filename: (req, file, cb) => {
    const uniqueName = `product-${Date.now()}-${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
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

// ==================== 菜单分类管理 ====================

// 获取所有分类
router.get('/categories', async (req, res) => {
  try {
    const categories = await allAsync(
      'SELECT * FROM categories ORDER BY sort_order, id'
    );
    res.json({ success: true, categories });
  } catch (error) {
    logger.error('获取分类失败', { error: error.message });
    res.status(500).json({ success: false, message: '获取分类失败' });
  }
});

// 创建分类
router.post('/categories', categoryValidation, async (req, res) => {
  try {
    const { name, description, sort_order, status } = req.body;
    
    const result = await runAsync(
      'INSERT INTO categories (name, description, sort_order, status) VALUES (?, ?, ?, ?)',
      [name, description || '', sort_order || 0, status || 'active']
    );

    await logAction(req.session.adminId, 'CREATE', 'category', result.id, { name }, req);

    res.json({ success: true, message: '分类创建成功', id: result.id });
  } catch (error) {
    logger.error('创建分类失败', { error: error.message });
    res.status(500).json({ success: false, message: '创建分类失败' });
  }
});

// 更新分类
router.put('/categories/:id', categoryValidation, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, sort_order, status } = req.body;

    await runAsync(
      "UPDATE categories SET name = ?, description = ?, sort_order = ?, status = ?, updated_at = datetime('now', 'localtime') WHERE id = ?",
      [name, description || '', sort_order || 0, status || 'active', id]
    );

    await logAction(req.session.adminId, 'UPDATE', 'category', id, { name }, req);

    res.json({ success: true, message: '分类更新成功' });
  } catch (error) {
    logger.error('更新分类失败', { error: error.message });
    res.status(500).json({ success: false, message: '更新分类失败' });
  }
});

// 删除分类
router.delete('/categories/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // 检查是否有商品使用此分类
    const productCount = await getAsync(
      'SELECT COUNT(*) as count FROM products WHERE category_id = ?',
      [id]
    );

    if (productCount.count > 0) {
      return res.status(400).json({ 
        success: false, 
        message: '该分类下还有商品，无法删除' 
      });
    }

    await runAsync('DELETE FROM categories WHERE id = ?', [id]);
    await logAction(req.session.adminId, 'DELETE', 'category', id, null, req);

    res.json({ success: true, message: '分类删除成功' });
  } catch (error) {
    logger.error('删除分类失败', { error: error.message });
    res.status(500).json({ success: false, message: '删除分类失败' });
  }
});

// ==================== 菜单管理 ====================

// 获取所有菜品
router.get('/products', async (req, res) => {
  try {
    const { category_id, status } = req.query;
    let sql = `
      SELECT p.*, c.name as category_name 
      FROM products p 
      LEFT JOIN categories c ON p.category_id = c.id 
      WHERE 1=1
    `;
    const params = [];

    if (category_id) {
      sql += ' AND p.category_id = ?';
      params.push(category_id);
    }

    if (status) {
      sql += ' AND p.status = ?';
      params.push(status);
    }

    sql += ' ORDER BY p.category_id, p.sort_order, p.id';

    const products = await allAsync(sql, params);
    res.json({ success: true, products });
  } catch (error) {
    logger.error('获取菜品失败', { error: error.message });
    res.status(500).json({ success: false, message: '获取菜品失败' });
  }
});

// 创建菜品
router.post('/products', upload.single('image'), async (req, res) => {
  try {
    const { name, description, price, category_id, sort_order, status, sizes, ice_options } = req.body;
    const image_url = req.file ? `/uploads/products/${req.file.filename}` : null;
    
    // 处理杯型价格
    let sizesJson = '{}';
    if (sizes !== undefined && sizes !== null && sizes !== '') {
      try {
        // FormData 中的字段都是字符串，需要解析 JSON
        const parsedSizes = typeof sizes === 'string' ? JSON.parse(sizes) : sizes;
        // 确保解析后的对象有效
        if (parsedSizes && typeof parsedSizes === 'object') {
          sizesJson = JSON.stringify(parsedSizes);
        } else {
          sizesJson = '{}';
        }
      } catch (e) {
        logger.error('Invalid sizes format', { error: e.message, sizes, body: req.body });
        sizesJson = '{}';
      }
    }

    // 处理可选加料
    let availableToppingsJson = '[]';
    if (req.body.available_toppings !== undefined) {
      const toppingsValue = req.body.available_toppings;
      if (toppingsValue && toppingsValue !== '' && toppingsValue !== '[]') {
        try {
          const parsedToppings = typeof toppingsValue === 'string' ? JSON.parse(toppingsValue) : toppingsValue;
          if (Array.isArray(parsedToppings)) {
            availableToppingsJson = JSON.stringify(parsedToppings);
          }
        } catch (e) {
          logger.error('Invalid available_toppings format', { error: e.message, toppingsValue });
          availableToppingsJson = '[]';
        }
      }
    }
    
    // 处理冰度选项
    let iceOptionsJson = '["normal","less","no","room","hot"]'; // 默认所有选项
    if (req.body.ice_options !== undefined) {
      const iceOptionsValue = req.body.ice_options;
      if (iceOptionsValue && iceOptionsValue !== '' && iceOptionsValue !== '[]') {
        try {
          const parsedIceOptions = typeof iceOptionsValue === 'string' ? JSON.parse(iceOptionsValue) : iceOptionsValue;
          if (Array.isArray(parsedIceOptions)) {
            iceOptionsJson = JSON.stringify(parsedIceOptions);
          }
        } catch (e) {
          logger.error('Invalid ice_options format', { error: e.message, iceOptionsValue });
          iceOptionsJson = '["normal","less","no","room","hot"]';
        }
      } else if (iceOptionsValue === '[]') {
        iceOptionsJson = '[]'; // 不允许选择冰度
      }
    }

    const result = await runAsync(
      `INSERT INTO products (name, description, price, category_id, image_url, sort_order, status, sizes, available_toppings, ice_options) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, description || '', price, category_id || null, image_url, sort_order || 0, status || 'active', sizesJson, availableToppingsJson, iceOptionsJson]
    );

    await logAction(req.session.adminId, 'CREATE', 'product', result.id, { name, price, sizes: sizesJson }, req);

    res.json({ success: true, message: '菜品创建成功', id: result.id });
  } catch (error) {
    logger.error('创建菜品失败', { error: error.message });
    res.status(500).json({ success: false, message: '创建菜品失败' });
  }
});

// 更新菜品
router.put('/products/:id', upload.single('image'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, price, category_id, sort_order, status, sizes, available_toppings, ice_options } = req.body;

    // 获取原有数据
    const oldProduct = await getAsync('SELECT * FROM products WHERE id = ?', [id]);
    if (!oldProduct) {
      return res.status(404).json({ success: false, message: '菜品不存在' });
    }

    const image_url = req.file ? `/uploads/products/${req.file.filename}` : oldProduct.image_url;
    
    // 处理杯型价格
    // 注意：使用 multer 时，req.body 中的字段都是字符串
    let sizesJson = oldProduct.sizes || '{}';
    
    // 检查 sizes 字段是否存在（即使是空字符串也要处理）
    if (req.body.sizes !== undefined) {
      const sizesValue = req.body.sizes;
      logger.info('Received sizes from form data', { sizesValue, type: typeof sizesValue });
      
      if (sizesValue && sizesValue !== '' && sizesValue !== '{}') {
        try {
          // FormData 中的字段都是字符串，需要解析 JSON
          const parsedSizes = typeof sizesValue === 'string' ? JSON.parse(sizesValue) : sizesValue;
          // 确保解析后的对象有效
          if (parsedSizes && typeof parsedSizes === 'object' && !Array.isArray(parsedSizes)) {
            sizesJson = JSON.stringify(parsedSizes);
          } else {
            logger.warn('Parsed sizes is not a valid object', { parsedSizes });
            sizesJson = oldProduct.sizes || '{}';
          }
        } catch (e) {
          logger.error('Invalid sizes format', { error: e.message, sizesValue, body: req.body });
          sizesJson = oldProduct.sizes || '{}';
        }
      } else if (sizesValue === '{}' || sizesValue === '') {
        // 如果 sizes 是空对象或空字符串，保存为空对象
        sizesJson = '{}';
      }
    }
    
    // 处理可选加料
    let availableToppingsJson = oldProduct.available_toppings || '[]';
    if (req.body.available_toppings !== undefined) {
      const toppingsValue = req.body.available_toppings;
      if (toppingsValue && toppingsValue !== '' && toppingsValue !== '[]') {
        try {
          const parsedToppings = typeof toppingsValue === 'string' ? JSON.parse(toppingsValue) : toppingsValue;
          if (Array.isArray(parsedToppings)) {
            availableToppingsJson = JSON.stringify(parsedToppings);
          }
        } catch (e) {
          logger.error('Invalid available_toppings format', { error: e.message, toppingsValue });
          availableToppingsJson = oldProduct.available_toppings || '[]';
        }
      } else if (toppingsValue === '[]' || toppingsValue === '') {
        availableToppingsJson = '[]';
      }
    }
    
    // 处理冰度选项
    let iceOptionsJson = oldProduct.ice_options || '["normal","less","no","room","hot"]';
    if (req.body.ice_options !== undefined) {
      const iceOptionsValue = req.body.ice_options;
      if (iceOptionsValue && iceOptionsValue !== '' && iceOptionsValue !== '[]') {
        try {
          const parsedIceOptions = typeof iceOptionsValue === 'string' ? JSON.parse(iceOptionsValue) : iceOptionsValue;
          if (Array.isArray(parsedIceOptions)) {
            iceOptionsJson = JSON.stringify(parsedIceOptions);
          }
        } catch (e) {
          logger.error('Invalid ice_options format', { error: e.message, iceOptionsValue });
          iceOptionsJson = oldProduct.ice_options || '["normal","less","no","room","hot"]';
        }
      } else if (iceOptionsValue === '[]' || iceOptionsValue === '') {
        iceOptionsJson = '[]'; // 不允许选择冰度
      }
    }
    
    logger.info('Updating product sizes, toppings and ice options', { id, sizesJson, availableToppingsJson, iceOptionsJson, receivedSizes: sizes, receivedToppings: available_toppings, receivedIceOptions: ice_options });

    await runAsync(
      `UPDATE products 
       SET name = ?, description = ?, price = ?, category_id = ?, image_url = ?, 
           sort_order = ?, status = ?, sizes = ?, available_toppings = ?, ice_options = ?, updated_at = datetime('now', 'localtime') 
       WHERE id = ?`,
      [name, description || '', price, category_id || null, image_url, sort_order || 0, status || 'active', sizesJson, availableToppingsJson, iceOptionsJson, id]
    );
    
    // 验证更新是否成功
    const updatedProduct = await getAsync('SELECT * FROM products WHERE id = ?', [id]);
    logger.info('Product updated', { id, savedSizes: updatedProduct.sizes });

    await logAction(req.session.adminId, 'UPDATE', 'product', id, { name, price, sizes: sizesJson }, req);

    res.json({ success: true, message: '菜品更新成功' });
  } catch (error) {
    logger.error('更新菜品失败', { error: error.message });
    res.status(500).json({ success: false, message: '更新菜品失败' });
  }
});

// 删除菜品
router.delete('/products/:id', async (req, res) => {
  try {
    const { id } = req.params;

    await runAsync('UPDATE products SET status = ? WHERE id = ?', ['deleted', id]);
    await logAction(req.session.adminId, 'DELETE', 'product', id, null, req);

    res.json({ success: true, message: '菜品删除成功' });
  } catch (error) {
    logger.error('删除菜品失败', { error: error.message });
    res.status(500).json({ success: false, message: '删除菜品失败' });
  }
});

// ==================== 折扣规则管理 ====================

// 获取所有折扣规则
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

// 批量更新折扣规则
router.post('/discount-rules/batch', async (req, res) => {
  try {
    const { rules } = req.body;

    if (!Array.isArray(rules)) {
      return res.status(400).json({ success: false, message: '规则格式错误' });
    }

    await beginTransaction();

    try {
      // 删除旧规则
      await runAsync('DELETE FROM discount_rules');

      // 插入新规则
      for (const rule of rules) {
        await runAsync(
          'INSERT INTO discount_rules (min_amount, max_amount, discount_rate, description, status) VALUES (?, ?, ?, ?, ?)',
          [rule.min_amount, rule.max_amount || null, rule.discount_rate, rule.description || '', 'active']
        );
      }

      await commit();
      await logAction(req.session.adminId, 'UPDATE', 'discount_rules', null, { count: rules.length }, req);

      res.json({ success: true, message: '折扣规则更新成功' });
    } catch (error) {
      await rollback();
      throw error;
    }
  } catch (error) {
    logger.error('更新折扣规则失败', { error: error.message });
    res.status(500).json({ success: false, message: '更新折扣规则失败' });
  }
});

// ==================== 系统设置管理 ====================

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

// 更新系统设置
router.post('/settings', async (req, res) => {
  try {
    const settings = req.body;
    const { beginTransaction, commit, rollback } = require('../db/database');

    await beginTransaction();
    
    try {
      // 检查点单开放状态是否改变
      const oldSetting = await getAsync("SELECT value FROM settings WHERE key = 'ordering_open'");
      const newOrderingOpen = settings.ordering_open === 'true';
      const oldOrderingOpen = oldSetting && oldSetting.value === 'true';
      
      for (const [key, value] of Object.entries(settings)) {
        await runAsync(
          `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now', 'localtime'))
           ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = datetime('now', 'localtime')`,
          [key, value, value]
        );
      }

      // 如果点单从关闭变为开放，创建新周期
      if (!oldOrderingOpen && newOrderingOpen) {
        const cycleNumber = 'CYCLE' + Date.now().toString();
        await runAsync(
          `INSERT INTO ordering_cycles (cycle_number, start_time, status, total_amount, discount_rate)
           VALUES (?, datetime('now', 'localtime'), 'active', 0, 0)`,
          [cycleNumber]
        );
        logger.info('新周期已创建', { cycleNumber, adminId: req.session.adminId });
      }
      
      // 如果点单从开放变为关闭，结束当前周期并自动计算折扣
      if (oldOrderingOpen && !newOrderingOpen) {
        const activeCycle = await getAsync(
          "SELECT * FROM ordering_cycles WHERE status = 'active' ORDER BY id DESC LIMIT 1"
        );
        
        // 只有当存在活跃周期时才处理，避免重复结束
        if (activeCycle) {
          // 更新周期结束时间
          await runAsync(
            `UPDATE ordering_cycles SET end_time = datetime('now', 'localtime'), status = 'ended' 
             WHERE id = ? AND status = 'active'`,
            [activeCycle.id]
          );
          
          // 自动计算并应用折扣
          const orders = await allAsync(
            `SELECT * FROM orders 
             WHERE created_at >= ? AND created_at <= ? AND status = 'pending'`,
            [activeCycle.start_time, new Date().toISOString()]
          );
          
          // 获取折扣规则
          const rules = await allAsync(
            'SELECT * FROM discount_rules WHERE status = ? ORDER BY min_amount DESC',
            ['active']
          );
          
          // 计算适用的折扣率
          let discountRate = 0;
          for (const rule of rules) {
            if (activeCycle.total_amount >= rule.min_amount) {
              discountRate = rule.discount_rate / 100;
              break;
            }
          }
          
          // 更新所有订单的折扣
          for (const order of orders) {
            const discountAmount = order.total_amount * discountRate;
            const finalAmount = order.total_amount - discountAmount;
            
            await runAsync(
              "UPDATE orders SET discount_amount = ?, final_amount = ?, updated_at = datetime('now', 'localtime') WHERE id = ?",
              [discountAmount, finalAmount, order.id]
            );
          }
          
          // 更新周期折扣率
          await runAsync(
            `UPDATE ordering_cycles SET discount_rate = ? WHERE id = ?`,
            [discountRate * 100, activeCycle.id]
          );
          
          logger.info('周期已结束并自动计算折扣', { 
            cycleId: activeCycle.id, 
            discountRate: discountRate * 100,
            orderCount: orders.length 
          });
        }
      }

      await commit();
      await logAction(req.session.adminId, 'UPDATE', 'settings', null, settings, req);

      

      res.json({ success: true, message: '设置更新成功' });
    } catch (error) {
      await rollback();
      throw error;
    }
  } catch (error) {
    logger.error('更新系统设置失败', { error: error.message });
    res.status(500).json({ success: false, message: '更新系统设置失败' });
  }
});

// ==================== 点单控制API ====================

// 开放点单（供定时任务调用）
router.post('/ordering/open', async (req, res) => {
  try {
    const { beginTransaction, commit, rollback } = require('../db/database');
    
    await beginTransaction();
    try {
      // 检查当前状态
      const currentSetting = await getAsync("SELECT value FROM settings WHERE key = 'ordering_open'");
      const currentOpen = currentSetting && currentSetting.value === 'true';
      
      if (!currentOpen) {
        // 更新状态为开放
        await runAsync(
          `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now', 'localtime'))
           ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = datetime('now', 'localtime')`,
          ['ordering_open', 'true', 'true']
        );
        
        // 创建新周期
        const cycleNumber = 'CYCLE' + Date.now().toString();
        await runAsync(
          `INSERT INTO ordering_cycles (cycle_number, start_time, status, total_amount, discount_rate)
           VALUES (?, datetime('now', 'localtime'), 'active', 0, 0)`,
          [cycleNumber]
        );
        
        await commit();
        logger.info('定时任务：点单已开放', { cycleNumber });
        res.json({ success: true, message: '点单已开放', cycleNumber });
      } else {
        await commit();
        res.json({ success: true, message: '点单已经是开放状态' });
      }
    } catch (error) {
      await rollback();
      throw error;
    }
  } catch (error) {
    logger.error('开放点单失败', { error: error.message });
    res.status(500).json({ success: false, message: '开放点单失败' });
  }
});

// 关闭点单（供定时任务调用）
router.post('/ordering/close', async (req, res) => {
  try {
    const { beginTransaction, commit, rollback } = require('../db/database');
    
    await beginTransaction();
    try {
      // 检查当前状态
      const currentSetting = await getAsync("SELECT value FROM settings WHERE key = 'ordering_open'");
      const currentOpen = currentSetting && currentSetting.value === 'true';
      
      if (currentOpen) {
        // 更新状态为关闭
        await runAsync(
          `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now', 'localtime'))
           ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = datetime('now', 'localtime')`,
          ['ordering_open', 'false', 'false']
        );
        
        // 结束当前周期并自动计算折扣
        const activeCycle = await getAsync(
          "SELECT * FROM ordering_cycles WHERE status = 'active' ORDER BY id DESC LIMIT 1"
        );
        
        if (activeCycle) {
          await runAsync(
            `UPDATE ordering_cycles SET end_time = datetime('now', 'localtime'), status = 'ended' 
             WHERE id = ? AND status = 'active'`,
            [activeCycle.id]
          );
          
          // 自动计算并应用折扣
          const orders = await allAsync(
            `SELECT * FROM orders 
             WHERE created_at >= ? AND created_at <= ? AND status = 'pending'`,
            [activeCycle.start_time, new Date().toISOString()]
          );
          
          const rules = await allAsync(
            'SELECT * FROM discount_rules WHERE status = ? ORDER BY min_amount DESC',
            ['active']
          );
          
          let discountRate = 0;
          for (const rule of rules) {
            if (activeCycle.total_amount >= rule.min_amount) {
              discountRate = rule.discount_rate / 100;
              break;
            }
          }
          
          for (const order of orders) {
            const discountAmount = order.total_amount * discountRate;
            const finalAmount = order.total_amount - discountAmount;
            
            await runAsync(
              "UPDATE orders SET discount_amount = ?, final_amount = ?, updated_at = datetime('now', 'localtime') WHERE id = ?",
              [discountAmount, finalAmount, order.id]
            );
          }
          
          await runAsync(
            `UPDATE ordering_cycles SET discount_rate = ? WHERE id = ?`,
            [discountRate * 100, activeCycle.id]
          );
          
          logger.info('定时任务：点单已关闭并计算折扣', { 
            cycleId: activeCycle.id, 
            discountRate: discountRate * 100,
            orderCount: orders.length 
          });
        }
        
        await commit();
        res.json({ success: true, message: '点单已关闭' });
      } else {
        await commit();
        res.json({ success: true, message: '点单已经是关闭状态' });
      }
    } catch (error) {
      await rollback();
      throw error;
    }
  } catch (error) {
    logger.error('关闭点单失败', { error: error.message });
    res.status(500).json({ success: false, message: '关闭点单失败' });
  }
});

// ==================== 订单管理 ====================

// 获取所有订单
router.get('/orders', async (req, res) => {
  try {
    const { status, phone, date, cycle_id } = req.query;
    let sql = 'SELECT * FROM orders WHERE 1=1';
    const params = [];

    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }

    if (phone) {
      sql += ' AND customer_phone LIKE ?';
      params.push(`%${phone}%`);
    }

    if (date) {
      sql += ' AND DATE(created_at) = ?';
      params.push(date);
    }

    // 按周期筛选
    if (cycle_id) {
      const cycle = await getAsync('SELECT * FROM ordering_cycles WHERE id = ?', [cycle_id]);
      if (cycle) {
        // 如果周期没有结束时间，使用当前本地时间
        let endTime = cycle.end_time;
        if (!endTime) {
          // 使用SQLite的datetime函数获取当前本地时间
          const nowResult = await getAsync("SELECT datetime('now', 'localtime') as now");
          endTime = nowResult.now;
        }
        
        logger.info('Filtering orders by cycle', {
          cycleId: cycle.id,
          cycleNumber: cycle.cycle_number,
          startTime: cycle.start_time,
          endTime: endTime,
          cycleStatus: cycle.status
        });
        
        sql += ' AND created_at >= ? AND created_at <= ?';
        params.push(cycle.start_time);
        params.push(endTime);
      }
    }

    sql += ' ORDER BY created_at DESC';

    const orders = await allAsync(sql, params);

    // 获取当前活跃周期
    const activeCycle = await getAsync(
      "SELECT * FROM ordering_cycles WHERE status = 'active' ORDER BY id DESC LIMIT 1"
    );
    
    // 如果没有活跃周期，获取最近一个已结束的周期
    let latestEndedCycle = null;
    if (!activeCycle) {
      latestEndedCycle = await getAsync(
        "SELECT * FROM ordering_cycles WHERE status IN ('ended', 'confirmed') ORDER BY end_time DESC, id DESC LIMIT 1"
      );
    }

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
        order.isActiveCycle = activeCycle ? (orderCycle.id === activeCycle.id) : false;
      } else {
        order.cycle_id = null;
        order.cycle_number = null;
        order.cycle_start_time = null;
        order.cycle_end_time = null;
        // 如果没有找到周期，且没有活跃周期，则不属于活跃周期
        order.isActiveCycle = false;
      }
      
      // 检查订单是否属于历史周期
      order.isExpired = false;
      if (activeCycle) {
        // 如果存在活跃周期，检查订单是否在当前活跃周期之前
        const orderTime = new Date(order.created_at);
        const cycleStart = new Date(activeCycle.start_time);
        
        // 只有订单在当前活跃周期开始时间之前，才标记为过期
        if (orderTime < cycleStart) {
          order.isExpired = true;
        }
      } else if (latestEndedCycle) {
        // 如果没有活跃周期，但有最近一个已结束的周期
        // 只有属于最近一个已结束周期的订单不标记为过期，其他都标记为过期
        if (orderCycle && orderCycle.id !== latestEndedCycle.id) {
          order.isExpired = true;
        } else if (!orderCycle) {
          // 如果订单不属于任何周期，标记为过期
          order.isExpired = true;
        }
      } else {
        // 如果没有活跃周期，也没有已结束的周期，所有订单都不标记为过期
        order.isExpired = false;
      }
    }

    res.json({ success: true, orders });
  } catch (error) {
    logger.error('获取订单失败', { error: error.message });
    res.status(500).json({ success: false, message: '获取订单失败' });
  }
});

// 获取所有周期
router.get('/cycles', async (req, res) => {
  try {
    const cycles = await allAsync(
      'SELECT * FROM ordering_cycles ORDER BY start_time DESC'
    );
    res.json({ success: true, cycles });
  } catch (error) {
    logger.error('获取周期列表失败', { error: error.message });
    res.status(500).json({ success: false, message: '获取周期列表失败' });
  }
});

// 导出订单（CSV格式）
router.get('/orders/export', async (req, res) => {
  try {
    const { status, phone, date, cycle_id } = req.query;
    let sql = 'SELECT * FROM orders WHERE 1=1';
    const params = [];

    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }

    if (phone) {
      sql += ' AND customer_phone LIKE ?';
      params.push(`%${phone}%`);
    }

    if (date) {
      sql += ' AND DATE(created_at) = ?';
      params.push(date);
    }

    // 按周期筛选
    if (cycle_id) {
      const cycle = await getAsync('SELECT * FROM ordering_cycles WHERE id = ?', [cycle_id]);
      if (cycle) {
        // 如果周期没有结束时间，使用当前本地时间
        let endTime = cycle.end_time;
        if (!endTime) {
          // 使用SQLite的datetime函数获取当前本地时间
          const nowResult = await getAsync("SELECT datetime('now', 'localtime') as now");
          endTime = nowResult.now;
        }
        
        sql += ' AND created_at >= ? AND created_at <= ?';
        params.push(cycle.start_time);
        params.push(endTime);
      }
    }

    sql += ' ORDER BY created_at DESC';

    const orders = await allAsync(sql, params);

    // 获取订单详情
    for (const order of orders) {
      order.items = await allAsync(
        'SELECT * FROM order_items WHERE order_id = ?',
        [order.id]
      );
    }

    // 生成CSV内容
    const csvRows = [];
    
    // CSV头部
    csvRows.push([
      '订单编号',
      '客户姓名',
      '客户电话',
      '订单状态',
      '商品名称',
      '商品数量',
      '杯型',
      '甜度',
      '冰度',
      '加料',
      '单价',
      '小计',
      '订单总金额',
      '折扣金额',
      '实付金额',
      '订单备注',
      '创建时间',
      '更新时间'
    ].join(','));

    // 订单数据
    for (const order of orders) {
      if (order.items && order.items.length > 0) {
        for (const item of order.items) {
          const iceLabels = {
            'normal': 'Normal Ice',
            'less': 'Less Ice',
            'no': 'No Ice',
            'room': 'Room Temperature',
            'hot': 'Hot'
          };
          
          const row = [
            `"${order.order_number || ''}"`,
            `"${order.customer_name || ''}"`,
            `"${order.customer_phone || ''}"`,
            `"${order.status === 'pending' ? '待付款' : order.status === 'paid' ? '已付款' : order.status === 'completed' ? '已完成' : '已取消'}"`,
            `"${item.product_name || ''}"`,
            item.quantity || 0,
            `"${item.size || ''}"`,
            `"${item.sugar_level || ''}"`,
            `"${item.ice_level ? (iceLabels[item.ice_level] || item.ice_level) : ''}"`,
            `"${item.toppings ? JSON.parse(item.toppings).join('; ') : ''}"`,
            (item.product_price || 0).toFixed(2),
            (item.subtotal || 0).toFixed(2),
            (order.total_amount || 0).toFixed(2),
            (order.discount_amount || 0).toFixed(2),
            (order.final_amount || 0).toFixed(2),
            `"${order.notes || ''}"`,
            `"${order.created_at || ''}"`,
            `"${order.updated_at || ''}"`
          ];
          csvRows.push(row.join(','));
        }
      } else {
        // 如果没有商品详情，至少输出订单基本信息
        const row = [
          `"${order.order_number || ''}"`,
          `"${order.customer_name || ''}"`,
          `"${order.customer_phone || ''}"`,
          `"${order.status === 'pending' ? '待付款' : order.status === 'paid' ? '已付款' : order.status === 'completed' ? '已完成' : '已取消'}"`,
          '""',
          '0',
          '""',
          '""',
          '""',
          '""',
          '0.00',
          '0.00',
          (order.total_amount || 0).toFixed(2),
          (order.discount_amount || 0).toFixed(2),
          (order.final_amount || 0).toFixed(2),
          `"${order.notes || ''}"`,
          `"${order.created_at || ''}"`,
          `"${order.updated_at || ''}"`
        ];
        csvRows.push(row.join(','));
      }
    }

    const csvContent = csvRows.join('\n');
    const filename = `订单导出_${new Date().toISOString().slice(0, 10)}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.send('\ufeff' + csvContent); // 添加BOM以支持Excel正确显示中文
  } catch (error) {
    logger.error('导出订单失败', { error: error.message });
    res.status(500).json({ success: false, message: '导出订单失败' });
  }
});

// 获取订单统计（当前周期或上一个周期）
router.get('/orders/statistics', async (req, res) => {
  try {
    // 获取当前活跃周期
    let cycle = await getAsync(
      "SELECT * FROM ordering_cycles WHERE status = 'active' ORDER BY id DESC LIMIT 1"
    );
    
    // 如果没有活跃周期，获取最近一个已结束的周期
    if (!cycle) {
      cycle = await getAsync(
        "SELECT * FROM ordering_cycles WHERE status = 'ended' ORDER BY id DESC LIMIT 1"
      );
    }
    
    if (!cycle) {
      return res.json({ 
        success: true, 
        statistics: {
          total_orders: 0,
          total_amount: 0,
          total_discount: 0,
          total_final_amount: 0,
          pending_count: 0,
          paid_count: 0,
          completed_count: 0
        },
        cycle: null
      });
    }
    
    // 获取周期内的订单统计
    // 如果周期没有结束时间，使用当前时间（SQLite本地时间格式）
    let endTime = cycle.end_time;
    if (!endTime) {
      // 使用SQLite的datetime函数获取当前本地时间
      const nowResult = await getAsync("SELECT datetime('now', 'localtime') as now");
      endTime = nowResult.now;
    }
    
    logger.info('Dashboard statistics query', { 
      cycleId: cycle.id, 
      cycleNumber: cycle.cycle_number,
      startTime: cycle.start_time, 
      endTime: endTime,
      cycleStatus: cycle.status
    });
    
    // 先查询一下有多少订单在时间范围内（用于调试）
    const orderCountCheck = await getAsync(`
      SELECT COUNT(*) as count FROM orders 
      WHERE created_at >= ? AND created_at <= ?
    `, [cycle.start_time, endTime]);
    
    logger.info('Orders in time range', { 
      count: orderCountCheck.count,
      startTime: cycle.start_time,
      endTime: endTime
    });
    
    const stats = await getAsync(`
      SELECT 
        COUNT(*) as total_orders,
        COALESCE(SUM(total_amount), 0) as total_amount,
        COALESCE(SUM(discount_amount), 0) as total_discount,
        COALESCE(SUM(final_amount), 0) as total_final_amount,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count,
        COUNT(CASE WHEN status = 'paid' THEN 1 END) as paid_count,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_count
      FROM orders
      WHERE created_at >= ? AND created_at <= ?
    `, [cycle.start_time, endTime]);
    
    logger.info('Dashboard statistics result', { 
      stats,
      total_orders: stats.total_orders,
      total_amount: stats.total_amount,
      total_discount: stats.total_discount,
      total_final_amount: stats.total_final_amount
    });
    
    // 更新周期表中的 total_amount 为实际统计值（确保数据一致性）
    // 但只在有订单的情况下更新，避免覆盖为0
    if (stats.total_orders > 0) {
      await runAsync(
        `UPDATE ordering_cycles SET total_amount = ?, updated_at = datetime('now', 'localtime') WHERE id = ?`,
        [stats.total_amount, cycle.id]
      );
      // 更新返回的 cycle 对象，确保前端显示的是实际统计值
      cycle.total_amount = stats.total_amount;
      
      // 如果周期已结束，重新计算并更新折扣率（基于实际统计金额）
      if (cycle.status === 'ended' || cycle.status === 'confirmed') {
        // 获取折扣规则
        const rules = await allAsync(
          'SELECT * FROM discount_rules WHERE status = ? ORDER BY min_amount DESC',
          ['active']
        );
        
        // 基于实际统计金额计算适用的折扣率
        let discountRate = 0;
        for (const rule of rules) {
          if (stats.total_amount >= rule.min_amount) {
            if (!rule.max_amount || stats.total_amount < rule.max_amount) {
              discountRate = rule.discount_rate;
              break;
            }
          }
        }
        
        // 更新周期折扣率
        await runAsync(
          `UPDATE ordering_cycles SET discount_rate = ? WHERE id = ?`,
          [discountRate, cycle.id]
        );
        
        // 更新返回的 cycle 对象
        cycle.discount_rate = discountRate;
        
        logger.info('Updated cycle discount rate based on actual statistics', {
          cycleId: cycle.id,
          actualTotalAmount: stats.total_amount,
          discountRate: discountRate
        });
      }
    }

    res.json({ success: true, statistics: stats, cycle });
  } catch (error) {
    logger.error('获取订单统计失败', { error: error.message });
    res.status(500).json({ success: false, message: '获取订单统计失败' });
  }
});

// 确认周期（计算折扣并结束周期）
router.post('/cycles/:id/confirm', async (req, res) => {
  try {
    const { id } = req.params;
    const { beginTransaction, commit, rollback } = require('../db/database');
    
    await beginTransaction();
    
    try {
      // 获取周期信息
      const cycle = await getAsync('SELECT * FROM ordering_cycles WHERE id = ?', [id]);
      if (!cycle) {
        return res.status(404).json({ success: false, message: '周期不存在' });
      }
      
      if (cycle.status !== 'ended') {
        return res.status(400).json({ success: false, message: '周期尚未结束' });
      }
      
      // 获取周期内的所有待付款订单
      const orders = await allAsync(
        `SELECT * FROM orders 
         WHERE created_at >= ? AND created_at <= ? AND status = 'pending'`,
        [cycle.start_time, cycle.end_time]
      );
      
      // 获取折扣规则
      const rules = await allAsync(
        'SELECT * FROM discount_rules WHERE status = ? ORDER BY min_amount DESC',
        ['active']
      );
      
      // 计算适用的折扣率
      let discountRate = 0;
      for (const rule of rules) {
        if (cycle.total_amount >= rule.min_amount) {
          discountRate = rule.discount_rate / 100;
          break;
        }
      }
      
      // 更新所有订单的折扣
      for (const order of orders) {
        const discountAmount = order.total_amount * discountRate;
        const finalAmount = order.total_amount - discountAmount;
        
        await runAsync(
          "UPDATE orders SET discount_amount = ?, final_amount = ?, updated_at = datetime('now', 'localtime') WHERE id = ?",
          [discountAmount, finalAmount, order.id]
        );
      }
      
      // 更新周期状态
      await runAsync(
        `UPDATE ordering_cycles 
         SET status = 'confirmed', discount_rate = ?, confirmed_at = datetime('now', 'localtime'), updated_at = datetime('now', 'localtime') 
         WHERE id = ?`,
        [discountRate * 100, id]
      );
      
      await commit();
      await logAction(req.session.adminId, 'UPDATE', 'ordering_cycle', id, { discountRate, orderCount: orders.length }, req);
      
      res.json({ 
        success: true, 
        message: '周期确认成功',
        discountRate: discountRate * 100,
        orderCount: orders.length
      });
    } catch (error) {
      await rollback();
      throw error;
    }
  } catch (error) {
    logger.error('确认周期失败', { error: error.message });
    res.status(500).json({ success: false, message: '确认周期失败' });
  }
});

// 更新订单状态
router.put('/orders/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['pending', 'paid', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: '状态值无效' });
    }

    await runAsync(
      "UPDATE orders SET status = ?, updated_at = datetime('now', 'localtime') WHERE id = ?",
      [status, id]
    );

    await logAction(req.session.adminId, 'UPDATE', 'order', id, { status }, req);

    res.json({ success: true, message: '订单状态更新成功' });
  } catch (error) {
    logger.error('更新订单状态失败', { error: error.message });
    res.status(500).json({ success: false, message: '更新订单状态失败' });
  }
});

// ==================== 用户管理 ====================

// 获取所有用户
router.get('/users', async (req, res) => {
  try {
    const users = await allAsync(`
      SELECT u.*, COUNT(o.id) as order_count, SUM(o.final_amount) as total_spent
      FROM users u
      LEFT JOIN orders o ON u.id = o.user_id
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `);

    res.json({ success: true, users });
  } catch (error) {
    logger.error('获取用户列表失败', { error: error.message });
    res.status(500).json({ success: false, message: '获取用户列表失败' });
  }
});

// ==================== 管理员管理 ====================

// 获取所有管理员
router.get('/admins', async (req, res) => {
  try {
    const admins = await allAsync(
      'SELECT id, username, name, email, role, status, created_at FROM admins ORDER BY created_at DESC'
    );
    res.json({ success: true, admins });
  } catch (error) {
    logger.error('获取管理员列表失败', { error: error.message });
    res.status(500).json({ success: false, message: '获取管理员列表失败' });
  }
});

// 创建管理员
router.post('/admins', [
  body('username').trim().isLength({ min: 3, max: 50 }),
  body('password').isLength({ min: 6 }),
  body('name').optional().trim(),
  body('email').optional().isEmail()
], async (req, res) => {
  try {
    const { username, password, name, email, role } = req.body;

    // 检查用户名是否已存在
    const existing = await getAsync('SELECT id FROM admins WHERE username = ?', [username]);
    if (existing) {
      return res.status(400).json({ success: false, message: '用户名已存在' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await runAsync(
      'INSERT INTO admins (username, password, name, email, role) VALUES (?, ?, ?, ?, ?)',
      [username, hashedPassword, name || '', email || '', role || 'admin']
    );

    await logAction(req.session.adminId, 'CREATE', 'admin', result.id, { username }, req);

    res.json({ success: true, message: '管理员创建成功', id: result.id });
  } catch (error) {
    logger.error('创建管理员失败', { error: error.message });
    res.status(500).json({ success: false, message: '创建管理员失败' });
  }
});

// 更新管理员
router.put('/admins/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, role, status, password } = req.body;

    const updates = [];
    const params = [];

    if (name !== undefined) {
      updates.push('name = ?');
      params.push(name);
    }
    if (email !== undefined) {
      updates.push('email = ?');
      params.push(email);
    }
    if (role !== undefined) {
      updates.push('role = ?');
      params.push(role);
    }
    if (status !== undefined) {
      updates.push('status = ?');
      params.push(status);
    }
    if (password) {
      updates.push('password = ?');
      params.push(await bcrypt.hash(password, 10));
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, message: '没有要更新的字段' });
    }

    updates.push("updated_at = datetime('now', 'localtime')");
    params.push(id);

    await runAsync(
      `UPDATE admins SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    await logAction(req.session.adminId, 'UPDATE', 'admin', id, req.body, req);

    res.json({ success: true, message: '管理员更新成功' });
  } catch (error) {
    logger.error('更新管理员失败', { error: error.message });
    res.status(500).json({ success: false, message: '更新管理员失败' });
  }
});

// ==================== 日志查询 ====================

// 获取操作日志
router.get('/logs', async (req, res) => {
  try {
    const { page = 1, limit = 50, action, admin_id } = req.query;
    const offset = (page - 1) * limit;

    let sql = `
      SELECT l.*, a.username as admin_username 
      FROM logs l 
      LEFT JOIN admins a ON l.admin_id = a.id 
      WHERE 1=1
    `;
    const params = [];

    if (action) {
      sql += ' AND l.action = ?';
      params.push(action);
    }

    if (admin_id) {
      sql += ' AND l.admin_id = ?';
      params.push(admin_id);
    }

    sql += ' ORDER BY l.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const logs = await allAsync(sql, params);

    // 获取总数
    let countSql = 'SELECT COUNT(*) as total FROM logs WHERE 1=1';
    const countParams = [];
    if (action) {
      countSql += ' AND action = ?';
      countParams.push(action);
    }
    if (admin_id) {
      countSql += ' AND admin_id = ?';
      countParams.push(admin_id);
    }

    const { total } = await getAsync(countSql, countParams);

    res.json({ 
      success: true, 
      logs, 
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total
      }
    });
  } catch (error) {
    logger.error('获取日志失败', { error: error.message });
    res.status(500).json({ success: false, message: '获取日志失败' });
  }
});

module.exports = router;

