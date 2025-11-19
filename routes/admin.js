const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// 支持 fly.io 持久化卷
const DATA_DIR = fs.existsSync('/data') ? '/data' : path.join(__dirname, '..');
const { runAsync, getAsync, allAsync, beginTransaction, commit, rollback } = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { 
  productValidation, 
  categoryValidation, 
  discountValidation,
  validate
} = require('../middleware/validation');
const { logAction, logger } = require('../utils/logger');
const { body } = require('express-validator');
const { findOrderCycle, findOrderCyclesBatch, isActiveCycle, isOrderExpired } = require('../utils/cycle-helper');
const { batchGetOrderItems } = require('../utils/order-helper');
const cache = require('../utils/cache');
const { backupDatabase, backupFull, getBackupList, restoreDatabase, deleteBackup } = require('../utils/backup');
const { cleanupOldFiles, getCleanupInfo } = require('../utils/cleanup');
const { 
  pushBackupToRemote, 
  shouldPushNow, 
  scheduleNextPush,
  getReceivedBackupDir 
} = require('../utils/remote-backup');
const { requireRemoteBackupAuth } = require('../middleware/remote-backup-auth');

const router = express.Router();

// 清除相关缓存的辅助函数
function clearRelatedCache() {
  cache.delete('public:settings');
  cache.delete('public:categories');
  cache.delete('public:discount-rules');
  // 注意：products缓存需要根据category_id动态清除，这里只清除通用缓存
}

// ==================== 远程备份接收 API（需要在 requireAuth 之前注册）====================
/**
 * POST /api/admin/remote-backup/receive
 * 接收远程推送的备份文件（需要token验证，不需要管理员登录）
 */
const receiveBackupUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const receivedDir = getReceivedBackupDir();
      if (!fs.existsSync(receivedDir)) {
        fs.mkdirSync(receivedDir, { recursive: true });
      }
      cb(null, receivedDir);
    },
    filename: (req, file, cb) => {
      // 保持原始文件名，添加时间戳前缀避免冲突
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const ext = path.extname(file.originalname);
      const baseName = path.basename(file.originalname, ext);
      cb(null, `${timestamp}-${baseName}${ext}`);
    }
  }),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
  fileFilter: (req, file, cb) => {
    // 只允许 .zip 文件（完整备份）
    if (file.originalname.endsWith('.zip')) {
      cb(null, true);
    } else {
      cb(new Error('Only .zip backup files are allowed'));
    }
  }
});

router.post('/remote-backup/receive', requireRemoteBackupAuth, receiveBackupUpload.single('backupFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    const fileName = req.file.filename;
    const filePath = req.file.path;
    const fileSize = req.file.size;
    const sourceUrl = req.headers['x-source-url'] || req.headers['X-Source-URL'] || 'unknown';

    // 验证ZIP文件格式
    try {
      const AdmZip = require('adm-zip');
      const zip = new AdmZip(filePath);
      zip.getEntries(); // 尝试读取ZIP内容
    } catch (error) {
      fs.unlinkSync(filePath);
      return res.status(400).json({
        success: false,
        message: 'Invalid ZIP file format'
      });
    }

    // 记录接收到的备份
    await runAsync(
      `INSERT INTO backup_received (backup_file_name, source_url, file_size, status)
       VALUES (?, ?, ?, 'received')`,
      [fileName, sourceUrl, fileSize]
    );

    // 获取接收配置
    const receiveConfig = await getAsync('SELECT * FROM backup_receive_config LIMIT 1');
    const autoRestore = receiveConfig && receiveConfig.auto_restore === 1;

    let restoreResult = null;
    if (autoRestore) {
      // 自动恢复
      try {
        // 将接收到的文件移动到备份目录以便恢复
        const { BACKUP_DIR } = require('../utils/backup');
        const targetPath = path.join(BACKUP_DIR, fileName);
        fs.renameSync(filePath, targetPath);

        restoreResult = await restoreDatabase(fileName);

        if (restoreResult.success) {
          await runAsync(
            `UPDATE backup_received 
             SET status = 'restored', restored_at = datetime('now', 'localtime')
             WHERE backup_file_name = ?`,
            [fileName]
          );
        } else {
          await runAsync(
            `UPDATE backup_received 
             SET status = 'failed'
             WHERE backup_file_name = ?`,
            [fileName]
          );
        }
      } catch (error) {
        logger.error('自动恢复失败', { fileName, error: error.message });
        await runAsync(
          `UPDATE backup_received 
           SET status = 'failed'
           WHERE backup_file_name = ?`,
          [fileName]
        );
        restoreResult = { success: false, message: error.message };
      }
    }

    logger.info('接收备份文件成功', { 
      fileName, 
      sourceUrl, 
      fileSize, 
      autoRestore,
      restoreSuccess: restoreResult ? restoreResult.success : null
    });

    res.json({
      success: true,
      fileName: fileName,
      sizeMB: (fileSize / 1024 / 1024).toFixed(2),
      autoRestore: autoRestore,
      restoreResult: restoreResult
    });
  } catch (error) {
    logger.error('接收备份文件失败', { error: error.message });
    
    // 如果上传失败，删除文件
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({
      success: false,
      message: 'Failed to receive backup file: ' + error.message
    });
  }
});

// ==================== 其他路由（需要管理员登录）====================
// 所有其他管理员路由都需要认证
router.use(requireAuth);

// 配置文件上传（菜单图片）
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(DATA_DIR, 'uploads/products');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
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
    
    // 清除相关缓存
    clearRelatedCache();

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
    
    // 清除相关缓存
    clearRelatedCache();

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
    
    // 清除相关缓存
    clearRelatedCache();

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
    
    // 清除相关缓存
    clearRelatedCache();

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
    
    // 安全更新：先检查字段是否存在，然后动态构建 UPDATE 语句
    const { allAsync } = require('../db/database');
    const tableInfo = await allAsync("PRAGMA table_info(products)");
    const columns = tableInfo.map(col => col.name);
    
    // 构建 UPDATE 语句，只更新存在的字段
    const updateFields = [];
    const updateValues = [];
    
    if (columns.includes('name')) updateFields.push('name = ?'), updateValues.push(name);
    if (columns.includes('description')) updateFields.push('description = ?'), updateValues.push(description || '');
    if (columns.includes('price')) updateFields.push('price = ?'), updateValues.push(price);
    if (columns.includes('category_id')) updateFields.push('category_id = ?'), updateValues.push(category_id || null);
    if (columns.includes('image_url')) updateFields.push('image_url = ?'), updateValues.push(image_url);
    if (columns.includes('sort_order')) updateFields.push('sort_order = ?'), updateValues.push(sort_order || 0);
    if (columns.includes('status')) updateFields.push('status = ?'), updateValues.push(status || 'active');
    if (columns.includes('sizes')) updateFields.push('sizes = ?'), updateValues.push(sizesJson);
    if (columns.includes('available_toppings')) updateFields.push('available_toppings = ?'), updateValues.push(availableToppingsJson);
    if (columns.includes('ice_options')) updateFields.push('ice_options = ?'), updateValues.push(iceOptionsJson);
    if (columns.includes('updated_at')) updateFields.push("updated_at = datetime('now', 'localtime')");
    
    updateValues.push(id);
    
    await runAsync(
      `UPDATE products SET ${updateFields.join(', ')} WHERE id = ?`,
      updateValues
    );
    
    // 验证更新是否成功（精简日志）
    const updatedProduct = await getAsync('SELECT id, name, sizes FROM products WHERE id = ?', [id]);
    logger.info('Product updated', { id, name: updatedProduct.name });

    await logAction(req.session.adminId, 'UPDATE', 'product', id, { name, price, sizes: sizesJson }, req);
    
    // 清除相关缓存
    clearRelatedCache();

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
    
    // 清除相关缓存
    clearRelatedCache();

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
      
      // 清除相关缓存
      clearRelatedCache();

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
        // 生成周期号：CYCLE + 时间戳 + 随机后缀（提高唯一性）
        const timestamp = Date.now().toString();
        const random = Math.random().toString(36).substring(2, 6);
        const cycleNumber = 'CYCLE' + timestamp + '-' + random;
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
          // 使用SQLite的datetime函数获取当前时间，确保格式一致
          const nowResult = await getAsync("SELECT datetime('now', 'localtime') as now");
          const orders = await allAsync(
            `SELECT * FROM orders 
             WHERE created_at >= ? AND created_at <= ? AND status = 'pending'`,
            [activeCycle.start_time, nowResult.now]
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
          
          // 批量更新所有订单的折扣（已经在事务中，不需要再开启新事务）
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
      
      // 清除相关缓存
      clearRelatedCache();

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
        // 生成周期号：CYCLE + 时间戳 + 随机后缀（提高唯一性）
        const timestamp = Date.now().toString();
        const random = Math.random().toString(36).substring(2, 6);
        const cycleNumber = 'CYCLE' + timestamp + '-' + random;
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
          // 使用SQLite的datetime函数获取当前时间，确保格式一致
          const nowResult = await getAsync("SELECT datetime('now', 'localtime') as now");
          const orders = await allAsync(
            `SELECT * FROM orders 
             WHERE created_at >= ? AND created_at <= ? AND status = 'pending'`,
            [activeCycle.start_time, nowResult.now]
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
          
          // 批量更新所有订单的折扣（已经在事务中，不需要再开启新事务）
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

// 获取所有订单（只显示最近N个周期的订单，N由设置决定）
router.get('/orders', async (req, res) => {
  try {
    // 先执行归档检查
    await archiveOldCycles();
    
    const { status, phone, date, cycle_id } = req.query;
    
    // 获取最大可见周期数设置
    const maxVisibleSetting = await getAsync("SELECT value FROM settings WHERE key = 'max_visible_cycles'");
    const maxVisibleCycles = parseInt(maxVisibleSetting?.value || '10', 10);
    
    // 获取最近N个周期
    const recentCycles = await allAsync(
      'SELECT * FROM ordering_cycles ORDER BY start_time DESC LIMIT ?',
      [maxVisibleCycles]
    );
    
    if (recentCycles.length === 0) {
      return res.json({ success: true, orders: [] });
    }
    
    // 构建周期时间范围
    const cycleTimeRanges = [];
    for (const cycle of recentCycles) {
      let endTime = cycle.end_time;
      if (!endTime) {
        // 对于活跃周期，使用当前本地时间作为结束时间
        const nowResult = await getAsync("SELECT datetime('now', 'localtime') as now");
        endTime = nowResult.now;
      }
      cycleTimeRanges.push({ start: cycle.start_time, end: endTime });
    }
    
    let sql = 'SELECT * FROM orders WHERE (';
    const params = [];
    
    // 构建时间范围条件
    const timeConditions = [];
    for (const range of cycleTimeRanges) {
      timeConditions.push('(created_at >= ? AND created_at <= ?)');
      params.push(range.start);
      params.push(range.end);
    }
    
    sql += timeConditions.join(' OR ') + ')';

    // 按周期筛选（只允许筛选最近N个周期内的）
    if (cycle_id) {
      const cycle = recentCycles.find(c => c.id == cycle_id);
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
        
        // 替换之前的时间范围条件，使用指定的周期
        sql = 'SELECT * FROM orders WHERE (created_at >= ? AND created_at <= ?)';
        params.length = 0;
        params.push(cycle.start_time);
        params.push(endTime);
      } else {
        // 如果指定的周期不在最近N个周期内，返回空结果
        return res.json({ success: true, orders: [] });
      }
    }

    // 添加状态过滤（在周期筛选之后，确保状态条件被保留）
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

    // 批量获取订单详情和周期信息
    if (orders.length > 0) {
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
          order.isActiveCycle = false;
        }
        
        // 检查订单是否已过期
        order.isExpired = isOrderExpired(order, activeCycle, latestEndedCycle);
      }
    }

    res.json({ success: true, orders });
  } catch (error) {
    logger.error('获取订单失败', { error: error.message });
    res.status(500).json({ success: false, message: '获取订单失败' });
  }
});

// 归档超过最大可见周期数的订单
async function archiveOldCycles() {
  try {
    // 获取最大可见周期数设置
    const maxVisibleSetting = await getAsync("SELECT value FROM settings WHERE key = 'max_visible_cycles'");
    const maxVisibleCycles = parseInt(maxVisibleSetting?.value || '10', 10);
    
    // 获取所有周期，按开始时间降序排列
    const allCycles = await allAsync(
      'SELECT * FROM ordering_cycles WHERE status IN ("ended", "confirmed") ORDER BY start_time DESC'
    );
    
    // 如果周期数超过最大可见数，归档超过的部分
    if (allCycles.length > maxVisibleCycles) {
      const cyclesToArchive = allCycles.slice(maxVisibleCycles); // 获取超过最大可见数的周期
      
      // 确保导出目录存在
      const exportDir = path.join(DATA_DIR, 'logs', 'export');
      if (!fs.existsSync(exportDir)) {
        fs.mkdirSync(exportDir, { recursive: true });
      }
      
      // 为每个需要归档的周期导出订单
      for (const cycle of cyclesToArchive) {
        // 检查是否已经归档过（通过检查文件是否存在）
        // 清理文件名中的特殊字符
        const safeCycleNumber = (cycle.cycle_number || '').replace(/[^a-zA-Z0-9]/g, '_');
        const safeStartTime = cycle.start_time.replace(/[: ]/g, '-').replace(/[^0-9-]/g, '');
        const archiveFileName = `orders_cycle_${cycle.id}_${safeCycleNumber}_${safeStartTime}.csv`;
        const archiveFilePath = path.join(exportDir, archiveFileName);
        
        if (fs.existsSync(archiveFilePath)) {
          logger.info('Cycle already archived', { cycleId: cycle.id, cycleNumber: cycle.cycle_number });
          continue; // 已经归档过，跳过
        }
        
        // 获取该周期的所有订单
        let endTime = cycle.end_time;
        if (!endTime) {
          const nowResult = await getAsync("SELECT datetime('now', 'localtime') as now");
          endTime = nowResult.now;
        }
        
        const orders = await allAsync(
          'SELECT * FROM orders WHERE created_at >= ? AND created_at <= ? ORDER BY created_at DESC',
          [cycle.start_time, endTime]
        );
        
        if (orders.length === 0) {
          logger.info('No orders to archive for cycle', { cycleId: cycle.id, cycleNumber: cycle.cycle_number });
          continue;
        }
        
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
          'Order Number',
          'Customer Name',
          'Customer Phone',
          'Order Status',
          'Product Name',
          'Quantity',
          'Size',
          'Sugar Level',
          'Ice Level',
          'Toppings',
          'Unit Price',
          'Subtotal',
          'Total Amount',
          'Discount Amount',
          'Final Amount',
          'Order Notes',
          'Created At',
          'Updated At',
          'Cycle ID',
          'Cycle Number'
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
                `"${order.status === 'pending' ? 'Pending Payment' : order.status === 'paid' ? 'Paid' : order.status === 'completed' ? 'Completed' : 'Cancelled'}"`,
                `"${item.product_name || ''}"`,
                item.quantity || 0,
                `"${item.size || ''}"`,
                `"${item.sugar_level || ''}"`,
                `"${item.ice_level ? (iceLabels[item.ice_level] || item.ice_level) : ''}"`,
                `"${item.toppings ? (typeof item.toppings === 'string' ? item.toppings : JSON.stringify(item.toppings)).replace(/"/g, '""') : ''}"`,
                (item.product_price || 0).toFixed(2),
                (item.subtotal || 0).toFixed(2),
                (order.total_amount || 0).toFixed(2),
                (order.discount_amount || 0).toFixed(2),
                (order.final_amount || 0).toFixed(2),
                `"${(order.notes || '').replace(/"/g, '""')}"`,
                `"${order.created_at || ''}"`,
                `"${order.updated_at || ''}"`,
                `"${cycle.id}"`,
                `"${cycle.cycle_number || ''}"`
              ];
              csvRows.push(row.join(','));
            }
          } else {
            // 如果没有商品详情，至少输出订单基本信息
            const row = [
              `"${order.order_number || ''}"`,
              `"${order.customer_name || ''}"`,
              `"${order.customer_phone || ''}"`,
              `"${order.status === 'pending' ? 'Pending Payment' : order.status === 'paid' ? 'Paid' : order.status === 'completed' ? 'Completed' : 'Cancelled'}"`,
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
              `"${(order.notes || '').replace(/"/g, '""')}"`,
              `"${order.created_at || ''}"`,
              `"${order.updated_at || ''}"`,
              `"${cycle.id}"`,
              `"${cycle.cycle_number || ''}"`
            ];
            csvRows.push(row.join(','));
          }
        }
        
        const csvContent = csvRows.join('\n');
        
        // 写入文件
        fs.writeFileSync(archiveFilePath, '\ufeff' + csvContent, 'utf8');
        
        logger.info('Cycle archived successfully', {
          cycleId: cycle.id,
          cycleNumber: cycle.cycle_number,
          orderCount: orders.length,
          filePath: archiveFilePath
        });
      }
    }
  } catch (error) {
    logger.error('归档旧周期失败', { error: error.message });
  }
}

// 获取所有周期（只返回最近N个，包括活跃周期，N由设置决定）
router.get('/cycles', async (req, res) => {
  try {
    // 先执行归档检查
    await archiveOldCycles();
    
    // 获取最大可见周期数设置
    const maxVisibleSetting = await getAsync("SELECT value FROM settings WHERE key = 'max_visible_cycles'");
    const maxVisibleCycles = parseInt(maxVisibleSetting?.value || '10', 10);
    
    // 只返回最近N个周期（包括活跃周期）
    const cycles = await allAsync(
      'SELECT * FROM ordering_cycles ORDER BY start_time DESC LIMIT ?',
      [maxVisibleCycles]
    );
    res.json({ success: true, cycles });
  } catch (error) {
    logger.error('获取周期列表失败', { error: error.message });
    res.status(500).json({ success: false, message: '获取周期列表失败' });
  }
});

// 导出订单（CSV格式，只导出最近N个周期的订单，N由设置决定）
router.get('/orders/export', async (req, res) => {
  try {
    // 先执行归档检查
    await archiveOldCycles();
    
    const { status, phone, date, cycle_id } = req.query;
    
    // 获取最大可见周期数设置
    const maxVisibleSetting = await getAsync("SELECT value FROM settings WHERE key = 'max_visible_cycles'");
    const maxVisibleCycles = parseInt(maxVisibleSetting?.value || '10', 10);
    
    // 获取最近N个周期
    const recentCycles = await allAsync(
      'SELECT * FROM ordering_cycles ORDER BY start_time DESC LIMIT ?',
      [maxVisibleCycles]
    );
    
    if (recentCycles.length === 0) {
      return res.status(404).json({ success: false, message: 'No cycles found' });
    }
    
    // 构建周期时间范围
    const cycleTimeRanges = [];
    for (const cycle of recentCycles) {
      let endTime = cycle.end_time;
      if (!endTime) {
        const nowResult = await getAsync("SELECT datetime('now', 'localtime') as now");
        endTime = nowResult.now;
      }
      cycleTimeRanges.push({ start: cycle.start_time, end: endTime });
    }
    
    let sql = 'SELECT * FROM orders WHERE (';
    const params = [];
    
    // 构建时间范围条件
    const timeConditions = [];
    for (const range of cycleTimeRanges) {
      timeConditions.push('(created_at >= ? AND created_at <= ?)');
      params.push(range.start);
      params.push(range.end);
    }
    
    sql += timeConditions.join(' OR ') + ')';

    // 按周期筛选（只允许筛选最近N个周期内的）
    if (cycle_id) {
      const cycle = recentCycles.find(c => c.id == cycle_id);
      if (cycle) {
        // 如果周期没有结束时间，使用当前本地时间
        let endTime = cycle.end_time;
        if (!endTime) {
          const nowResult = await getAsync("SELECT datetime('now', 'localtime') as now");
          endTime = nowResult.now;
        }
        
        // 替换之前的时间范围条件，使用指定的周期
        sql = 'SELECT * FROM orders WHERE (created_at >= ? AND created_at <= ?)';
        params.length = 0;
        params.push(cycle.start_time);
        params.push(endTime);
      } else {
        // 如果指定的周期不在最近N个周期内，返回空结果
        return res.status(404).json({ success: false, message: `Cycle not found in recent ${maxVisibleCycles} cycles` });
      }
    }

    // 添加状态过滤（在周期筛选之后，确保状态条件被保留）
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
    
    // 获取已付款订单统计（排除未付款订单）
    const paidStats = await getAsync(`
      SELECT 
        COUNT(*) as paid_orders,
        COALESCE(SUM(total_amount), 0) as paid_total_amount,
        COALESCE(SUM(discount_amount), 0) as paid_total_discount,
        COALESCE(SUM(final_amount), 0) as paid_final_amount
      FROM orders
      WHERE created_at >= ? AND created_at <= ? AND status IN ('paid', 'completed')
    `, [cycle.start_time, endTime]);
    
    // 合并统计结果
    stats.paid_orders = paidStats.paid_orders || 0;
    stats.paid_total_amount = paidStats.paid_total_amount || 0;
    stats.paid_total_discount = paidStats.paid_total_discount || 0;
    stats.paid_final_amount = paidStats.paid_final_amount || 0;
    
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
// 注意：只有super_admin可以管理其他admin

// 检查是否为super_admin的中间件
function requireSuperAdmin(req, res, next) {
  if (!req.session || !req.session.adminId) {
    return res.status(401).json({ 
      success: false, 
      message: 'Please login first' 
    });
  }
  
  if (req.session.adminRole !== 'super_admin') {
    return res.status(403).json({ 
      success: false, 
      message: 'Access denied. Super admin privileges required.' 
    });
  }
  
  next();
}

// 获取所有管理员
router.get('/admins', requireAuth, async (req, res) => {
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

// 创建管理员（只有super_admin可以）
router.post('/admins', requireSuperAdmin, [
  body('username').trim().isLength({ min: 3, max: 50 }),
  body('password').isLength({ min: 6 }),
  body('name').optional({ nullable: true, checkFalsy: false }).trim(),
  body('email').optional({ nullable: true, checkFalsy: false }).normalizeEmail(),
  validate
], async (req, res) => {
  try {
    const { username, password, name, email, role } = req.body;

    // 记录接收到的数据（用于调试）
    logger.info('创建管理员请求', { 
      receivedData: { username, name, email, role, hasPassword: !!password },
      body: req.body 
    });

    // 检查用户名是否已存在
    const existing = await getAsync('SELECT id FROM admins WHERE username = ?', [username]);
    if (existing) {
      return res.status(400).json({ success: false, message: '用户名已存在' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    
    // 处理name和email字段（确保即使是空字符串也保存）
    const nameValue = name !== undefined ? (name || '') : '';
    const emailValue = email !== undefined ? (email || '') : '';
    
    logger.info('执行管理员创建', { 
      username, 
      name: nameValue, 
      email: emailValue, 
      role: role || 'admin' 
    });
    
    const result = await runAsync(
      'INSERT INTO admins (username, password, name, email, role) VALUES (?, ?, ?, ?, ?)',
      [username, hashedPassword, nameValue, emailValue, role || 'admin']
    );

    // 验证创建是否成功
    const createdAdmin = await getAsync('SELECT * FROM admins WHERE id = ?', [result.id]);
    logger.info('管理员创建后的数据', { id: result.id, name: createdAdmin?.name, email: createdAdmin?.email });

    // 记录详细的操作日志
    const logDetails = {
      username: username,
      name: nameValue,
      email: emailValue,
      role: role || 'admin'
    };
    await logAction(req.session.adminId, 'CREATE', 'admin', result.id, JSON.stringify(logDetails), req);

    res.json({ success: true, message: '管理员创建成功', id: result.id });
  } catch (error) {
    logger.error('创建管理员失败', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, message: '创建管理员失败' });
  }
});

// 更新管理员（只有super_admin可以）
router.put('/admins/:id', requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, role, status, password, username } = req.body;

    // 记录接收到的数据（用于调试）
    logger.info('更新管理员请求', { 
      id, 
      receivedData: { name, email, role, status, username, hasPassword: !!password },
      body: req.body 
    });

    const updates = [];
    const params = [];

    // 处理name字段（允许空字符串，但要明确处理）
    if (name !== undefined) {
      updates.push('name = ?');
      params.push(name || ''); // 如果name是null或undefined，保存为空字符串
    }
    if (email !== undefined) {
      updates.push('email = ?');
      params.push(email || ''); // 如果email是null或undefined，保存为空字符串
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

    // 记录要执行的SQL更新
    logger.info('执行管理员更新', { 
      id, 
      updates, 
      params: params.slice(0, -1) // 不记录id参数
    });

    await runAsync(
      `UPDATE admins SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    // 验证更新是否成功
    const updatedAdmin = await getAsync('SELECT * FROM admins WHERE id = ?', [id]);
    logger.info('管理员更新后的数据', { id, name: updatedAdmin?.name, email: updatedAdmin?.email });

    // 记录详细的操作日志（包含username以便在日志中显示）
    const logDetails = {
      username: username || updatedAdmin?.username || '',
      name: name !== undefined ? (name || '') : (updatedAdmin?.name || ''),
      email: email !== undefined ? (email || '') : (updatedAdmin?.email || ''),
      status: status || updatedAdmin?.status || '',
      role: role || updatedAdmin?.role || ''
    };
    await logAction(req.session.adminId, 'UPDATE', 'admin', id, JSON.stringify(logDetails), req);

    res.json({ success: true, message: '管理员更新成功' });
  } catch (error) {
    logger.error('更新管理员失败', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, message: '更新管理员失败' });
  }
});

// 删除管理员（只有super_admin可以）
router.delete('/admins/:id', requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    // 不能删除自己
    if (req.session.adminId == id) {
      return res.status(400).json({ 
        success: false, 
        message: 'You cannot delete yourself' 
      });
    }
    
    // 检查管理员是否存在
    const admin = await getAsync('SELECT id FROM admins WHERE id = ?', [id]);
    if (!admin) {
      return res.status(404).json({ 
        success: false, 
        message: 'Admin not found' 
      });
    }
    
    await runAsync('DELETE FROM admins WHERE id = ?', [id]);
    
    await logAction(req.session.adminId, 'DELETE', 'admin', id, null, req);
    
    res.json({ success: true, message: '管理员删除成功' });
  } catch (error) {
    logger.error('删除管理员失败', { error: error.message });
    res.status(500).json({ success: false, message: '删除管理员失败' });
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

// ==================== 开发者工具 ====================
// 注意：这些接口只有super_admin可以访问

// 获取所有数据库表
router.get('/developer/tables', requireSuperAdmin, async (req, res) => {
  try {
    // 获取所有表名
    const tables = await allAsync(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    );
    
    // 获取每个表的行数
    const tablesWithCount = await Promise.all(
      tables.map(async (table) => {
        try {
          const countResult = await getAsync(`SELECT COUNT(*) as count FROM ${table.name}`);
          return {
            name: table.name,
            rowCount: countResult.count || 0
          };
        } catch (error) {
          return {
            name: table.name,
            rowCount: 0
          };
        }
      })
    );
    
    res.json({ success: true, tables: tablesWithCount });
  } catch (error) {
    logger.error('获取表列表失败', { error: error.message });
    res.status(500).json({ success: false, message: '获取表列表失败' });
  }
});

// 获取表结构
router.get('/developer/table-schema/:tableName', requireSuperAdmin, async (req, res) => {
  try {
    const { tableName } = req.params;
    
    // 验证表名（防止SQL注入）
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
      return res.status(400).json({ success: false, message: 'Invalid table name' });
    }
    
    const schema = await allAsync(`PRAGMA table_info(${tableName})`);
    
    res.json({ success: true, schema });
  } catch (error) {
    logger.error('获取表结构失败', { error: error.message, tableName: req.params.tableName });
    res.status(500).json({ success: false, message: '获取表结构失败' });
  }
});

// 获取表数据
router.get('/developer/table-data/:tableName', requireSuperAdmin, async (req, res) => {
  try {
    const { tableName } = req.params;
    const { limit = 1000, offset = 0 } = req.query;
    
    // 验证表名（防止SQL注入）
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
      return res.status(400).json({ success: false, message: 'Invalid table name' });
    }
    
    const data = await allAsync(
      `SELECT * FROM ${tableName} LIMIT ? OFFSET ?`,
      [parseInt(limit), parseInt(offset)]
    );
    
    res.json({ success: true, data });
  } catch (error) {
    logger.error('获取表数据失败', { error: error.message, tableName: req.params.tableName });
    res.status(500).json({ success: false, message: '获取表数据失败' });
  }
});

// 更新表数据
router.put('/developer/table-data/:tableName', requireSuperAdmin, async (req, res) => {
  try {
    const { tableName } = req.params;
    const { updates, deletes, inserts } = req.body;
    
    // 验证表名（防止SQL注入）
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
      return res.status(400).json({ success: false, message: 'Invalid table name' });
    }
    
    // 获取表结构
    const schema = await allAsync(`PRAGMA table_info(${tableName})`);
    const primaryKey = schema.find(col => col.pk === 1);
    
    if (!primaryKey) {
      return res.status(400).json({ success: false, message: 'Table must have a primary key' });
    }
    
    await beginTransaction();
    
    try {
      // 执行删除
      if (deletes && deletes.length > 0) {
        for (const pkValue of deletes) {
          await runAsync(`DELETE FROM ${tableName} WHERE ${primaryKey.name} = ?`, [pkValue]);
        }
      }
      
      // 执行更新
      if (updates && updates.length > 0) {
        for (const row of updates) {
          const pkValue = row[primaryKey.name];
          if (!pkValue) continue;
          
          const columns = Object.keys(row).filter(key => key !== primaryKey.name);
          const values = columns.map(col => row[col]);
          const setClause = columns.map(col => `${col} = ?`).join(', ');
          
          await runAsync(
            `UPDATE ${tableName} SET ${setClause} WHERE ${primaryKey.name} = ?`,
            [...values, pkValue]
          );
        }
      }
      
      // 执行插入
      if (inserts && inserts.length > 0) {
        for (const row of inserts) {
          const columns = Object.keys(row).filter(key => {
            const col = schema.find(c => c.name === key);
            return col && col.pk !== 1; // 排除主键
          });
          const values = columns.map(col => row[col] || null);
          const columnsStr = columns.join(', ');
          const placeholders = columns.map(() => '?').join(', ');
          
          await runAsync(
            `INSERT INTO ${tableName} (${columnsStr}) VALUES (${placeholders})`,
            values
          );
        }
      }
      
      await commit();
      
      await logAction(req.session.adminId, 'UPDATE', 'developer_table', tableName, {
        updates: updates?.length || 0,
        deletes: deletes?.length || 0,
        inserts: inserts?.length || 0
      }, req);
      
      res.json({ success: true, message: 'Changes saved successfully' });
    } catch (error) {
      await rollback();
      throw error;
    }
  } catch (error) {
    logger.error('更新表数据失败', { error: error.message, tableName: req.params.tableName });
    res.status(500).json({ success: false, message: '更新表数据失败: ' + error.message });
  }
});

// 执行SQL查询
router.post('/developer/execute-sql', requireSuperAdmin, async (req, res) => {
  try {
    const { sql } = req.body;
    
    if (!sql || typeof sql !== 'string') {
      return res.status(400).json({ success: false, message: 'SQL query is required' });
    }
    
    // 安全检查：只允许SELECT, INSERT, UPDATE, DELETE语句
    const trimmedSql = sql.trim().toUpperCase();
    const allowedKeywords = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'PRAGMA'];
    const firstWord = trimmedSql.split(/\s+/)[0];
    
    if (!allowedKeywords.includes(firstWord)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Only SELECT, INSERT, UPDATE, DELETE, and PRAGMA statements are allowed' 
      });
    }
    
    // 禁止危险操作
    const dangerousKeywords = ['DROP', 'ALTER', 'CREATE', 'TRUNCATE', 'EXEC', 'EXECUTE'];
    for (const keyword of dangerousKeywords) {
      if (trimmedSql.includes(keyword)) {
        return res.status(400).json({ 
          success: false, 
          message: `Dangerous keyword '${keyword}' is not allowed` 
        });
      }
    }
    
    try {
      // 判断是查询还是修改
      if (firstWord === 'SELECT' || firstWord === 'PRAGMA') {
        const result = await allAsync(sql);
        await logAction(req.session.adminId, 'QUERY', 'developer_sql', null, { sql: sql.substring(0, 200) }, req);
        res.json({ success: true, result });
      } else {
        // INSERT, UPDATE, DELETE
        const result = await runAsync(sql);
        await logAction(req.session.adminId, 'EXECUTE', 'developer_sql', null, { sql: sql.substring(0, 200) }, req);
        res.json({ success: true, result: { affectedRows: result.changes || 0 } });
      }
    } catch (sqlError) {
      logger.error('SQL执行失败', { error: sqlError.message, sql: sql.substring(0, 200) });
      res.status(400).json({ success: false, message: 'SQL execution failed: ' + sqlError.message });
    }
  } catch (error) {
    logger.error('执行SQL失败', { error: error.message });
    res.status(500).json({ success: false, message: '执行SQL失败' });
  }
});

/**
 * POST /api/admin/backup/create
 * Create a database backup
 */
router.post('/backup/create', async (req, res) => {
  try {
    const { type = 'db' } = req.body; // 'db' or 'full'
    const result = type === 'full' ? await backupFull() : await backupDatabase();
    
    if (result.success) {
      await logAction(req.session.adminId, 'BACKUP_CREATE', 'system', null, JSON.stringify({
        action: type === 'full' ? '创建完整备份' : '创建数据库备份',
        fileName: result.fileName,
        sizeMB: result.sizeMB,
        type: type
      }), req);
      
      res.json({
        success: true,
        fileName: result.fileName,
        sizeMB: result.sizeMB,
        type: type,
        message: result.message
      });
    } else {
      res.status(500).json({
        success: false,
        message: result.message
      });
    }
  } catch (error) {
    logger.error('创建备份失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to create backup'
    });
  }
});

/**
 * GET /api/admin/backup/list
 * Get list of backup files
 */
router.get('/backup/list', async (req, res) => {
  try {
    const backups = getBackupList();
    
    res.json({
      success: true,
      backups: backups.map(backup => ({
        fileName: backup.fileName,
        size: backup.size,
        sizeMB: backup.sizeMB,
        created: backup.created.toISOString(),
        type: backup.type || 'db'
      }))
    });
  } catch (error) {
    logger.error('获取备份列表失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to get backup list'
    });
  }
});

/**
 * GET /api/admin/backup/download/:fileName
 * Download a backup file
 */
router.get('/backup/download/:fileName', async (req, res) => {
  try {
    const { fileName } = req.params;
    
    // 支持数据库备份(.db)和完整备份(.zip)
    if (!fileName.startsWith('boda-backup-') && !fileName.startsWith('boda-full-backup-')) {
      return res.status(400).json({
        success: false,
        message: 'Invalid backup file name'
      });
    }
    
    if (!fileName.endsWith('.db') && !fileName.endsWith('.zip')) {
      return res.status(400).json({
        success: false,
        message: 'Invalid backup file extension'
      });
    }
    
    const { BACKUP_DIR } = require('../utils/backup');
    const backupPath = path.join(BACKUP_DIR, fileName);
    
    if (!fs.existsSync(backupPath)) {
      return res.status(404).json({
        success: false,
        message: 'Backup file not found'
      });
    }
    
    res.download(backupPath, fileName);
  } catch (error) {
    logger.error('下载备份文件失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to download backup file'
    });
  }
});

/**
 * POST /api/admin/backup/restore
 * Restore database from backup
 */
router.post('/backup/restore', async (req, res) => {
  try {
    const { fileName } = req.body;
    
    // 支持数据库备份(.db)和完整备份(.zip)
    if (!fileName || 
        (!fileName.startsWith('boda-backup-') && !fileName.startsWith('boda-full-backup-')) ||
        (!fileName.endsWith('.db') && !fileName.endsWith('.zip'))) {
      return res.status(400).json({
        success: false,
        message: 'Invalid backup file name'
      });
    }
    
    const backupType = fileName.endsWith('.zip') ? '完整备份' : '数据库备份';
    await logAction(req.session.adminId, 'BACKUP_RESTORE', 'system', null, JSON.stringify({
      action: `恢复${backupType}`,
      fileName: fileName
    }), req);
    
    const result = await restoreDatabase(fileName);
    
    if (result.success) {
      logger.info('备份恢复成功', { fileName, adminId: req.session.adminId, type: backupType });
      res.json({
        success: true,
        message: result.message
      });
    } else {
      res.status(500).json({
        success: false,
        message: result.message
      });
    }
  } catch (error) {
    logger.error('恢复备份失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to restore backup'
    });
  }
});

/**
 * DELETE /api/admin/backup/delete
 * Delete a backup file
 */
router.delete('/backup/delete', async (req, res) => {
  try {
    const { fileName } = req.body;
    
    // 支持数据库备份(.db)和完整备份(.zip)
    if (!fileName || 
        (!fileName.startsWith('boda-backup-') && !fileName.startsWith('boda-full-backup-')) ||
        (!fileName.endsWith('.db') && !fileName.endsWith('.zip'))) {
      return res.status(400).json({
        success: false,
        message: 'Invalid backup file name'
      });
    }
    
    const result = await deleteBackup(fileName);
    
    if (result.success) {
      res.json({
        success: true,
        message: result.message
      });
    } else {
      res.status(500).json({
        success: false,
        message: result.message
      });
    }
  } catch (error) {
    logger.error('删除备份文件失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to delete backup file'
    });
  }
});

/**
 * POST /api/admin/backup/upload
 * Upload a backup file
 */
const backupUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const { BACKUP_DIR } = require('../utils/backup');
      if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
      }
      cb(null, BACKUP_DIR);
    },
    filename: (req, file, cb) => {
      // 保持原始文件名，但如果是备份文件格式，直接使用；否则添加前缀
      const originalName = file.originalname;
      if ((originalName.startsWith('boda-backup-') || originalName.startsWith('boda-full-backup-')) && 
          (originalName.endsWith('.db') || originalName.endsWith('.zip'))) {
        cb(null, originalName);
      } else {
        // 如果不是标准格式，添加时间戳前缀
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const ext = path.extname(originalName);
        const baseName = path.basename(originalName, ext);
        const prefix = ext === '.zip' ? 'boda-full-backup-' : 'boda-backup-';
        cb(null, `${prefix}${timestamp}-${baseName}${ext}`);
      }
    }
  }),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB（完整备份可能较大）
  fileFilter: (req, file, cb) => {
    // 允许 .db 和 .zip 文件（数据库备份和完整备份）
    if (file.originalname.endsWith('.db') || file.originalname.endsWith('.zip')) {
      cb(null, true);
    } else {
      cb(new Error('Only .db or .zip backup files are allowed'));
    }
  }
});

router.post('/backup/upload', backupUpload.single('backupFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    const fileName = req.file.filename;
    const filePath = req.file.path;
    const fileSize = req.file.size;
    const sizeMB = (fileSize / 1024 / 1024).toFixed(2);

    // 验证文件格式
    try {
      if (fileName.endsWith('.db')) {
        // 验证 SQLite 数据库文件
        // SQLite 数据库文件的前16字节是文件头，应该以 "SQLite format 3\000" 开头
        const fileBuffer = fs.readFileSync(filePath, { start: 0, end: 15 });
        const header = fileBuffer.toString('utf8');
        
        if (!header.startsWith('SQLite format 3')) {
          // 如果文件头不正确，删除文件并返回错误
          fs.unlinkSync(filePath);
          return res.status(400).json({
            success: false,
            message: 'Invalid SQLite database file: file header does not match SQLite format'
          });
        }
      } else if (fileName.endsWith('.zip')) {
        // 验证 ZIP 文件（完整备份）
        // ZIP 文件的前4字节是文件头，应该是 "PK\03\04" 或 "PK\05\06"（空ZIP）
        const fileBuffer = fs.readFileSync(filePath, { start: 0, end: 3 });
        const header = fileBuffer.toString('binary');
        
        if (!header.startsWith('PK')) {
          // 如果文件头不正确，删除文件并返回错误
          fs.unlinkSync(filePath);
          return res.status(400).json({
            success: false,
            message: 'Invalid ZIP file: file header does not match ZIP format'
          });
        }
      }
    } catch (error) {
      // 如果文件不存在或无法读取，删除文件
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      return res.status(400).json({
        success: false,
        message: 'Failed to validate backup file: ' + error.message
      });
    }

    const backupType = fileName.endsWith('.zip') ? '完整备份' : '数据库备份';
    await logAction(req.session.adminId, 'BACKUP_UPLOAD', 'system', null, JSON.stringify({
      action: `上传${backupType}`,
      fileName: fileName,
      sizeMB: parseFloat(sizeMB),
      type: fileName.endsWith('.zip') ? 'full' : 'db'
    }), req);

    logger.info('备份文件上传成功', { fileName, sizeMB, adminId: req.session.adminId });

    res.json({
      success: true,
      fileName: fileName,
      sizeMB: parseFloat(sizeMB),
      message: `Backup file uploaded successfully: ${fileName} (${sizeMB}MB)`
    });
  } catch (error) {
    logger.error('上传备份文件失败', { error: error.message });
    
    // 如果上传失败，删除文件
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({
      success: false,
      message: 'Failed to upload backup file: ' + error.message
    });
  }
});

/**
 * GET /api/admin/cleanup/info
 * Get cleanup information (preview what will be deleted)
 */
router.get('/cleanup/info', async (req, res) => {
  try {
    const { days = 30, cleanPaymentScreenshots = false, cleanLogs = false } = req.query;
    
    const info = await getCleanupInfo({
      days: parseInt(days),
      cleanPaymentScreenshots: cleanPaymentScreenshots === 'true',
      cleanLogs: cleanLogs === 'true'
    });
    
    res.json({
      success: true,
      info
    });
  } catch (error) {
    logger.error('获取清理信息失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to get cleanup info'
    });
  }
});

/**
 * POST /api/admin/cleanup/execute
 * Execute cleanup (delete old files)
 */
router.post('/cleanup/execute', async (req, res) => {
  try {
    const { days = 30, cleanPaymentScreenshots = false, cleanLogs = false } = req.body;
    
    await logAction(req.session.adminId, 'CLEANUP_EXECUTE', 'system', null, JSON.stringify({
      action: '执行文件清理',
      days: parseInt(days),
      cleanPaymentScreenshots: cleanPaymentScreenshots === true,
      cleanLogs: cleanLogs === true
    }), req);
    
    const result = await cleanupOldFiles({
      days: parseInt(days),
      cleanPaymentScreenshots: cleanPaymentScreenshots === true,
      cleanLogs: cleanLogs === true
    });
    
    if (result.success) {
      logger.info('文件清理成功', { 
        deletedFiles: result.deletedFiles, 
        freedSpaceMB: result.freedSpaceMB,
        adminId: req.session.adminId 
      });
      res.json({
        success: true,
        deletedFiles: result.deletedFiles,
        freedSpaceMB: result.freedSpaceMB,
        message: result.message
      });
    } else {
      res.status(500).json({
        success: false,
        message: result.message
      });
    }
  } catch (error) {
    logger.error('执行清理失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to execute cleanup'
    });
  }
});

// ==================== 远程备份功能 ====================

/**
 * GET /api/admin/remote-backup/configs
 * 获取所有推送配置
 */
router.get('/remote-backup/configs', async (req, res) => {
  try {
    const configs = await allAsync('SELECT * FROM remote_backup_configs ORDER BY created_at DESC');
    res.json({
      success: true,
      configs: configs.map(config => ({
        ...config,
        enabled: config.enabled === 1
      }))
    });
  } catch (error) {
    logger.error('获取推送配置失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to get backup configs'
    });
  }
});

/**
 * POST /api/admin/remote-backup/configs
 * 创建推送配置
 */
router.post('/remote-backup/configs', async (req, res) => {
  try {
    const { name, target_url, api_token, schedule_type, schedule_time, schedule_day, enabled } = req.body;

    if (!name || !target_url || !api_token) {
      return res.status(400).json({
        success: false,
        message: 'Name, target_url, and api_token are required'
      });
    }

    // 验证URL格式
    try {
      new URL(target_url);
    } catch (e) {
      return res.status(400).json({
        success: false,
        message: 'Invalid target URL format'
      });
    }

    const result = await runAsync(
      `INSERT INTO remote_backup_configs (name, target_url, api_token, schedule_type, schedule_time, schedule_day, enabled)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [name, target_url, api_token, schedule_type || 'manual', schedule_time || null, schedule_day || null, enabled ? 1 : 0]
    );

    await logAction(req.session.adminId, 'REMOTE_BACKUP_CONFIG_CREATE', 'system', result.id.toString(), JSON.stringify({
      name,
      target_url,
      schedule_type: schedule_type || 'manual'
    }), req);

    res.json({
      success: true,
      id: result.id,
      message: 'Backup config created successfully'
    });
  } catch (error) {
    logger.error('创建推送配置失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to create backup config'
    });
  }
});

/**
 * PUT /api/admin/remote-backup/configs/:id
 * 更新推送配置
 */
router.put('/remote-backup/configs/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, target_url, api_token, schedule_type, schedule_time, schedule_day, enabled } = req.body;

    // 检查配置是否存在
    const existing = await getAsync('SELECT * FROM remote_backup_configs WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Config not found'
      });
    }

    // 如果提供了URL，验证格式
    if (target_url) {
      try {
        new URL(target_url);
      } catch (e) {
        return res.status(400).json({
          success: false,
          message: 'Invalid target URL format'
        });
      }
    }

    await runAsync(
      `UPDATE remote_backup_configs 
       SET name = COALESCE(?, name),
           target_url = COALESCE(?, target_url),
           api_token = COALESCE(?, api_token),
           schedule_type = COALESCE(?, schedule_type),
           schedule_time = ?,
           schedule_day = ?,
           enabled = COALESCE(?, enabled),
           updated_at = datetime('now', 'localtime')
       WHERE id = ?`,
      [name || null, target_url || null, api_token || null, schedule_type || null, schedule_time || null, schedule_day || null, enabled !== undefined ? (enabled ? 1 : 0) : null, id]
    );

    await logAction(req.session.adminId, 'REMOTE_BACKUP_CONFIG_UPDATE', 'system', id, JSON.stringify({
      name,
      target_url,
      schedule_type
    }), req);

    res.json({
      success: true,
      message: 'Backup config updated successfully'
    });
  } catch (error) {
    logger.error('更新推送配置失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to update backup config'
    });
  }
});

/**
 * DELETE /api/admin/remote-backup/configs/:id
 * 删除推送配置
 */
router.delete('/remote-backup/configs/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await getAsync('SELECT * FROM remote_backup_configs WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Config not found'
      });
    }

    await runAsync('DELETE FROM remote_backup_configs WHERE id = ?', [id]);

    await logAction(req.session.adminId, 'REMOTE_BACKUP_CONFIG_DELETE', 'system', id, JSON.stringify({
      name: existing.name
    }), req);

    res.json({
      success: true,
      message: 'Backup config deleted successfully'
    });
  } catch (error) {
    logger.error('删除推送配置失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to delete backup config'
    });
  }
});

/**
 * POST /api/admin/remote-backup/configs/:id/push
 * 手动触发推送
 */
router.post('/remote-backup/configs/:id/push', async (req, res) => {
  try {
    const { id } = req.params;

    const config = await getAsync('SELECT * FROM remote_backup_configs WHERE id = ?', [id]);
    if (!config) {
      return res.status(404).json({
        success: false,
        message: 'Config not found'
      });
    }

    // 异步执行推送（不阻塞响应）
    pushBackupToRemote(config)
      .then(result => {
        logger.info('手动推送完成', { configId: id, success: result.success });
      })
      .catch(error => {
        logger.error('手动推送失败', { configId: id, error: error.message });
      });

    await logAction(req.session.adminId, 'REMOTE_BACKUP_MANUAL_PUSH', 'system', id, JSON.stringify({
      name: config.name,
      target_url: config.target_url
    }), req);

    res.json({
      success: true,
      message: 'Push started, check logs for status'
    });
  } catch (error) {
    logger.error('手动触发推送失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to trigger push'
    });
  }
});

/**
 * GET /api/admin/remote-backup/receive-config
 * 获取接收配置
 */
router.get('/remote-backup/receive-config', async (req, res) => {
  try {
    const config = await getAsync('SELECT * FROM backup_receive_config LIMIT 1');
    if (!config) {
      // 如果没有配置，返回默认值
      return res.json({
        success: true,
        config: {
          api_token: '',
          auto_restore: false
        }
      });
    }

    res.json({
      success: true,
      config: {
        api_token: config.api_token,
        auto_restore: config.auto_restore === 1
      }
    });
  } catch (error) {
    logger.error('获取接收配置失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to get receive config'
    });
  }
});

/**
 * PUT /api/admin/remote-backup/receive-config
 * 更新接收配置
 */
router.put('/remote-backup/receive-config', async (req, res) => {
  try {
    const { api_token, auto_restore } = req.body;

    if (!api_token) {
      return res.status(400).json({
        success: false,
        message: 'API token is required'
      });
    }

    // 检查是否已存在配置
    const existing = await getAsync('SELECT * FROM backup_receive_config LIMIT 1');

    if (existing) {
      // 更新现有配置
      await runAsync(
        `UPDATE backup_receive_config 
         SET api_token = ?, auto_restore = ?, updated_at = datetime('now', 'localtime')`,
        [api_token, auto_restore ? 1 : 0]
      );
    } else {
      // 创建新配置
      await runAsync(
        `INSERT INTO backup_receive_config (api_token, auto_restore)
         VALUES (?, ?)`,
        [api_token, auto_restore ? 1 : 0]
      );
    }

    await logAction(req.session.adminId, 'REMOTE_BACKUP_RECEIVE_CONFIG_UPDATE', 'system', null, JSON.stringify({
      auto_restore: auto_restore ? 1 : 0
    }), req);

    res.json({
      success: true,
      message: 'Receive config updated successfully'
    });
  } catch (error) {
    logger.error('更新接收配置失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to update receive config'
    });
  }
});

/**
 * GET /api/admin/remote-backup/push-logs
 * 获取推送日志列表
 */
router.get('/remote-backup/push-logs', async (req, res) => {
  try {
    const { config_id, limit = 100, offset = 0 } = req.query;
    
    let sql = 'SELECT * FROM backup_push_logs';
    const params = [];

    if (config_id) {
      sql += ' WHERE config_id = ?';
      params.push(config_id);
    }

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const logs = await allAsync(sql, params);

    res.json({
      success: true,
      logs
    });
  } catch (error) {
    logger.error('获取推送日志失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to get push logs'
    });
  }
});

/**
 * GET /api/admin/remote-backup/received
 * 获取接收到的备份列表
 */
router.get('/remote-backup/received', async (req, res) => {
  try {
    const backups = await allAsync(
      'SELECT * FROM backup_received ORDER BY created_at DESC LIMIT 100'
    );

    res.json({
      success: true,
      backups: backups.map(backup => ({
        ...backup,
        sizeMB: backup.file_size ? (backup.file_size / 1024 / 1024).toFixed(2) : '0'
      }))
    });
  } catch (error) {
    logger.error('获取接收备份列表失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to get received backups'
    });
  }
});

/**
 * POST /api/admin/remote-backup/received/:id/restore
 * 手动恢复接收到的备份
 */
router.post('/remote-backup/received/:id/restore', async (req, res) => {
  try {
    const { id } = req.params;

    const backup = await getAsync('SELECT * FROM backup_received WHERE id = ?', [id]);
    if (!backup) {
      return res.status(404).json({
        success: false,
        message: 'Backup not found'
      });
    }

    if (backup.status === 'restored') {
      return res.status(400).json({
        success: false,
        message: 'Backup already restored'
      });
    }

    // 检查文件是否存在
    const receivedDir = getReceivedBackupDir();
    const filePath = path.join(receivedDir, backup.backup_file_name);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: 'Backup file not found'
      });
    }

    // 将文件移动到备份目录以便恢复
    const { BACKUP_DIR } = require('../utils/backup');
    const targetPath = path.join(BACKUP_DIR, backup.backup_file_name);
    fs.renameSync(filePath, targetPath);

    // 执行恢复
    const restoreResult = await restoreDatabase(backup.backup_file_name);

    if (restoreResult.success) {
      await runAsync(
        `UPDATE backup_received 
         SET status = 'restored', restored_at = datetime('now', 'localtime')
         WHERE id = ?`,
        [id]
      );

      await logAction(req.session.adminId, 'REMOTE_BACKUP_RESTORE', 'system', id.toString(), JSON.stringify({
        fileName: backup.backup_file_name,
        sourceUrl: backup.source_url
      }), req);

      res.json({
        success: true,
        message: 'Backup restored successfully'
      });
    } else {
      await runAsync(
        `UPDATE backup_received 
         SET status = 'failed'
         WHERE id = ?`,
        [id]
      );

      res.status(500).json({
        success: false,
        message: restoreResult.message || 'Restore failed'
      });
    }
  } catch (error) {
    logger.error('恢复接收备份失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to restore backup: ' + error.message
    });
  }
});

module.exports = router;

