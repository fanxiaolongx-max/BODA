const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const sharp = require('sharp');

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
const { batchGetOrderItems, roundAmount } = require('../utils/order-helper');
const cache = require('../utils/cache');
const { backupDatabase, backupFull, getBackupList, restoreDatabase, deleteBackup } = require('../utils/backup');
const archiver = require('archiver');
const AdmZip = require('adm-zip');
const ExcelJS = require('exceljs');
const { cleanupOldFiles, getCleanupInfo } = require('../utils/cleanup');
const { sendCycleExportEmail, testEmailConfig } = require('../utils/email');
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

// 图片压缩函数（针对产品图片，用户端显示较小）
async function compressProductImage(imagePath) {
  try {
    const stats = await fs.promises.stat(imagePath);
    const originalSize = stats.size;
    
    // 读取图片信息
    const metadata = await sharp(imagePath).metadata();
    
    // 计算目标尺寸（用户端显示为 80x80，但保留一些余量，设置为 200x200）
    const maxWidth = 200;
    const maxHeight = 200;
    
    // 如果图片已经很小，不需要压缩
    if (metadata.width <= maxWidth && metadata.height <= maxHeight && originalSize < 50 * 1024) {
      return { compressed: false, originalSize, finalSize: originalSize };
    }
    
    // 压缩图片：调整大小、转换为 JPEG 格式、降低质量
    const compressedBuffer = await sharp(imagePath)
      .resize(maxWidth, maxHeight, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .jpeg({ quality: 80, mozjpeg: true }) // 转换为 JPEG，质量 80%
      .toBuffer();
    
    // 覆盖原文件
    await fs.promises.writeFile(imagePath, compressedBuffer);
    
    const finalSize = compressedBuffer.length;
    const compressionRatio = ((1 - finalSize / originalSize) * 100).toFixed(1);
    
    logger.info('图片压缩完成', {
      file: path.basename(imagePath),
      originalSize: `${(originalSize / 1024).toFixed(2)} KB`,
      finalSize: `${(finalSize / 1024).toFixed(2)} KB`,
      compressionRatio: `${compressionRatio}%`
    });
    
    return { compressed: true, originalSize, finalSize, compressionRatio };
  } catch (error) {
    logger.error('图片压缩失败', { error: error.message, file: imagePath });
    // 压缩失败不影响上传，返回原文件
    return { compressed: false, error: error.message };
  }
}

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
    
    // 如果有上传图片，先压缩
    if (req.file) {
      const imagePath = path.join(DATA_DIR, 'uploads/products', req.file.filename);
      await compressProductImage(imagePath);
    }
    
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

    // 处理甜度选项
    let sugarLevelsJson = '["0","30","50","70","100"]';
    if (req.body.sugar_levels !== undefined) {
      const sugarLevelsValue = req.body.sugar_levels;
      if (sugarLevelsValue && sugarLevelsValue !== '' && sugarLevelsValue !== '[]') {
        try {
          const parsedSugarLevels = typeof sugarLevelsValue === 'string' ? JSON.parse(sugarLevelsValue) : sugarLevelsValue;
          if (Array.isArray(parsedSugarLevels)) {
            sugarLevelsJson = JSON.stringify(parsedSugarLevels);
          }
        } catch (e) {
          logger.error('Invalid sugar_levels format', { error: e.message, sugarLevelsValue });
        }
      } else if (sugarLevelsValue === '[]') {
        sugarLevelsJson = '[]'; // 不允许选择甜度
      }
    }
    
    // 处理可选加料
    let availableToppingsJson = '[]';
    if (req.body.available_toppings !== undefined) {
      const toppingsValue = req.body.available_toppings;
      // 重要：即使是空数组也要保存
      if (toppingsValue !== undefined && toppingsValue !== null) {
        try {
          const parsedToppings = typeof toppingsValue === 'string' ? JSON.parse(toppingsValue) : toppingsValue;
          if (Array.isArray(parsedToppings)) {
            availableToppingsJson = JSON.stringify(parsedToppings);
          } else {
            availableToppingsJson = '[]';
          }
        } catch (e) {
          logger.error('Invalid available_toppings format', { error: e.message, toppingsValue });
          availableToppingsJson = '[]';
        }
      } else if (toppingsValue === '[]' || toppingsValue === '') {
        availableToppingsJson = '[]';
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
      `INSERT INTO products (name, description, price, category_id, image_url, sort_order, status, sizes, sugar_levels, available_toppings, ice_options) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, description || '', price, category_id || null, image_url, sort_order || 0, status || 'active', sizesJson, sugarLevelsJson, availableToppingsJson, iceOptionsJson]
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

    // 如果有新上传的图片，先压缩
    if (req.file) {
      const imagePath = path.join(DATA_DIR, 'uploads/products', req.file.filename);
      await compressProductImage(imagePath);
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
    
    // 处理甜度选项
    let sugarLevelsJson = oldProduct.sugar_levels || '["0","30","50","70","100"]';
    if (req.body.sugar_levels !== undefined) {
      const sugarLevelsValue = req.body.sugar_levels;
      if (sugarLevelsValue && sugarLevelsValue !== '' && sugarLevelsValue !== '[]') {
        try {
          const parsedSugarLevels = typeof sugarLevelsValue === 'string' ? JSON.parse(sugarLevelsValue) : sugarLevelsValue;
          if (Array.isArray(parsedSugarLevels)) {
            sugarLevelsJson = JSON.stringify(parsedSugarLevels);
          }
        } catch (e) {
          logger.error('Invalid sugar_levels format', { error: e.message, sugarLevelsValue });
          sugarLevelsJson = oldProduct.sugar_levels || '["0","30","50","70","100"]';
        }
      } else if (sugarLevelsValue === '[]' || sugarLevelsValue === '') {
        sugarLevelsJson = '[]'; // 不允许选择甜度
      }
    }
    
    // 处理可选加料
    let availableToppingsJson = oldProduct.available_toppings || '[]';
    if (req.body.available_toppings !== undefined) {
      const toppingsValue = req.body.available_toppings;
      // 重要：即使是空数组也要保存
      if (toppingsValue !== undefined && toppingsValue !== null) {
        try {
          const parsedToppings = typeof toppingsValue === 'string' ? JSON.parse(toppingsValue) : toppingsValue;
          if (Array.isArray(parsedToppings)) {
            availableToppingsJson = JSON.stringify(parsedToppings);
          } else {
            availableToppingsJson = '[]';
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
    if (columns.includes('sugar_levels')) updateFields.push('sugar_levels = ?'), updateValues.push(sugarLevelsJson);
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

    // 先获取产品信息，以便删除关联的图片
    const product = await getAsync('SELECT image_url FROM products WHERE id = ?', [id]);
    
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    await beginTransaction();
    
    try {
      // 删除关联的订单详情（因为外键约束）
      await runAsync('DELETE FROM order_items WHERE product_id = ?', [id]);
      
      // 删除产品
      await runAsync('DELETE FROM products WHERE id = ?', [id]);
      
      // 删除关联的图片文件
      if (product.image_url) {
        const imagePath = product.image_url.startsWith('/') 
          ? path.join(DATA_DIR, product.image_url.substring(1))
          : path.join(DATA_DIR, product.image_url);
        
        if (fs.existsSync(imagePath)) {
          try {
            fs.unlinkSync(imagePath);
            logger.info('删除产品图片', { imagePath, productId: id });
          } catch (error) {
            logger.warn('删除产品图片失败', { imagePath, error: error.message, productId: id });
            // 图片删除失败不影响产品删除
          }
        }
      }
      
      await commit();
      
      await logAction(req.session.adminId, 'DELETE', 'product', id, JSON.stringify({
        action: '删除产品',
        productId: id,
        imageDeleted: !!product.image_url
      }), req);
      
      // 清除相关缓存
      clearRelatedCache();

      res.json({ success: true, message: 'Product deleted successfully' });
    } catch (error) {
      await rollback();
      throw error;
    }
  } catch (error) {
    logger.error('删除菜品失败', { error: error.message, productId: req.params.id });
    res.status(500).json({ success: false, message: '删除菜品失败: ' + error.message });
  }
});

// 批量更新产品
router.post('/products/batch-update', async (req, res) => {
  try {
    const { product_ids, updates } = req.body;
    
    if (!Array.isArray(product_ids) || product_ids.length === 0) {
      return res.status(400).json({ success: false, message: 'Product IDs are required' });
    }
    
    if (!updates || Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, message: 'At least one update field is required' });
    }
    
    await beginTransaction();
    
    try {
      let updatedCount = 0;
      
      for (const productId of product_ids) {
        // 获取当前产品信息
        const product = await getAsync('SELECT * FROM products WHERE id = ?', [productId]);
        if (!product) {
          continue;
        }
        
        // 构建更新字段
        const updateFields = [];
        const updateValues = [];
        
        if (updates.category_id !== undefined) {
          updateFields.push('category_id = ?');
          updateValues.push(updates.category_id || null);
        }
        
        if (updates.status !== undefined) {
          updateFields.push('status = ?');
          updateValues.push(updates.status);
        }
        
        if (updates.sort_order !== undefined) {
          updateFields.push('sort_order = ?');
          updateValues.push(updates.sort_order);
        }
        
        // 处理价格调整
        if (updates.price_action && updates.price_value !== undefined) {
          let newPrice = product.price;
          if (updates.price_action === 'set') {
            newPrice = updates.price_value;
          } else if (updates.price_action === 'add') {
            newPrice = product.price + updates.price_value;
          } else if (updates.price_action === 'multiply') {
            newPrice = product.price * updates.price_value;
          }
          updateFields.push('price = ?');
          updateValues.push(newPrice);
        }
        
        // 处理杯型价格
        if (updates.sizes !== undefined) {
          const sizesJson = typeof updates.sizes === 'object' 
            ? JSON.stringify(updates.sizes) 
            : updates.sizes;
          updateFields.push('sizes = ?');
          updateValues.push(sizesJson);
        }
        
        // 处理甜度选项
        if (updates.sugar_levels !== undefined) {
          const sugarLevelsJson = Array.isArray(updates.sugar_levels)
            ? JSON.stringify(updates.sugar_levels)
            : updates.sugar_levels;
          updateFields.push('sugar_levels = ?');
          updateValues.push(sugarLevelsJson);
        }
        
        // 处理可选加料
        if (updates.available_toppings !== undefined) {
          const availableToppingsJson = Array.isArray(updates.available_toppings)
            ? JSON.stringify(updates.available_toppings)
            : updates.available_toppings;
          updateFields.push('available_toppings = ?');
          updateValues.push(availableToppingsJson);
        }
        
        // 处理冰度选项
        if (updates.ice_options !== undefined) {
          const iceOptionsJson = Array.isArray(updates.ice_options)
            ? JSON.stringify(updates.ice_options)
            : updates.ice_options;
          updateFields.push('ice_options = ?');
          updateValues.push(iceOptionsJson);
        }
        
        if (updateFields.length > 0) {
          updateFields.push("updated_at = datetime('now', 'localtime')");
          updateValues.push(productId);
          
          await runAsync(
            `UPDATE products SET ${updateFields.join(', ')} WHERE id = ?`,
            updateValues
          );
          updatedCount++;
        }
      }
      
      await commit();
      
      // 清除缓存
      clearRelatedCache();
      
      await logAction(req.session.adminId, 'BATCH_UPDATE', 'product', null, JSON.stringify({
        action: '批量更新产品',
        productIds: product_ids,
        updates: updates,
        updatedCount: updatedCount
      }), req);
      
      res.json({
        success: true,
        message: `Successfully updated ${updatedCount} product(s)`,
        updated: updatedCount
      });
    } catch (error) {
      await rollback();
      throw error;
    }
  } catch (error) {
    logger.error('批量更新产品失败', { error: error.message });
    res.status(500).json({ success: false, message: '批量更新失败: ' + error.message });
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
    const { clearSettingsCache } = require('../utils/log-helper');

    await beginTransaction();
    
    try {
      // 检查点单开放状态是否改变
      const oldSetting = await getAsync("SELECT value FROM settings WHERE key = 'ordering_open'");
      const newOrderingOpen = settings.ordering_open === 'true';
      const oldOrderingOpen = oldSetting && oldSetting.value === 'true';
      
      // 验证 Stripe 密钥格式（如果提供）
      if (settings.stripe_publishable_key && settings.stripe_publishable_key.trim()) {
        const pubKey = settings.stripe_publishable_key.trim();
        if (!pubKey.startsWith('pk_test_') && !pubKey.startsWith('pk_live_')) {
          await rollback();
          return res.status(400).json({ 
            success: false, 
            message: 'Stripe 公钥格式不正确，应以 pk_test_ 或 pk_live_ 开头' 
          });
        }
      }
      
      if (settings.stripe_secret_key && settings.stripe_secret_key.trim()) {
        const secKey = settings.stripe_secret_key.trim();
        if (!secKey.startsWith('sk_test_') && !secKey.startsWith('sk_live_')) {
          await rollback();
          return res.status(400).json({ 
            success: false, 
            message: 'Stripe 私钥格式不正确，应以 sk_test_ 或 sk_live_ 开头' 
          });
        }
      }
      
      if (settings.stripe_webhook_secret && settings.stripe_webhook_secret.trim()) {
        const webhookSecret = settings.stripe_webhook_secret.trim();
        if (!webhookSecret.startsWith('whsec_')) {
          await rollback();
          return res.status(400).json({ 
            success: false, 
            message: 'Stripe Webhook Secret 格式不正确，应以 whsec_ 开头' 
          });
        }
      }
      
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
          
          // 检查orders表是否有balance_used字段
          const ordersTableInfo = await allAsync("PRAGMA table_info(orders)");
          const ordersColumns = ordersTableInfo.map(col => col.name);
          const hasBalanceUsed = ordersColumns.includes('balance_used');
          
          // 批量更新所有订单的折扣（已经在事务中，不需要再开启新事务）
          const { roundAmount } = require('../utils/order-helper');
          for (const order of orders) {
            const discountAmount = roundAmount(order.total_amount * discountRate);
            // 计算最终金额：原价 - 折扣 - 已使用的余额
            const balanceUsed = hasBalanceUsed && order.balance_used ? (order.balance_used || 0) : 0;
            const finalAmount = roundAmount(order.total_amount - discountAmount - balanceUsed);
            
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
      
      // 如果更新了日志相关设置，清除缓存（在事务提交后，确保立即生效）
      if (settings.debug_logging_enabled !== undefined) {
        clearSettingsCache();
      }
      
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
          
          // 检查orders表是否有balance_used字段
          const ordersTableInfo2 = await allAsync("PRAGMA table_info(orders)");
          const ordersColumns2 = ordersTableInfo2.map(col => col.name);
          const hasBalanceUsed2 = ordersColumns2.includes('balance_used');
          
          // 批量更新所有订单的折扣（已经在事务中，不需要再开启新事务）
          const { roundAmount } = require('../utils/order-helper');
          for (const order of orders) {
            const discountAmount = roundAmount(order.total_amount * discountRate);
            // 计算最终金额：原价 - 折扣 - 已使用的余额
            const balanceUsed = hasBalanceUsed2 && order.balance_used ? (order.balance_used || 0) : 0;
            const finalAmount = roundAmount(order.total_amount - discountAmount - balanceUsed);
            
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

// 归档检查缓存（避免短时间内重复执行）
let lastArchiveCheck = 0;
const ARCHIVE_CHECK_INTERVAL = 5000; // 5秒内只执行一次

// 归档超过最大可见周期数的订单
async function archiveOldCycles() {
  try {
    // 检查缓存，避免短时间内重复执行
    const now = Date.now();
    if (now - lastArchiveCheck < ARCHIVE_CHECK_INTERVAL) {
      return; // 最近刚检查过，跳过
    }
    lastArchiveCheck = now;
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
      
      // 统计信息
      let archivedCount = 0;
      let skippedCount = 0;
      let emptyCount = 0;
      
      // 为每个需要归档的周期导出订单
      for (const cycle of cyclesToArchive) {
        // 检查是否已经归档过（通过检查文件是否存在）
        // 清理文件名中的特殊字符
        const safeCycleNumber = (cycle.cycle_number || '').replace(/[^a-zA-Z0-9]/g, '_');
        const safeStartTime = cycle.start_time.replace(/[: ]/g, '-').replace(/[^0-9-]/g, '');
        const archiveFileName = `orders_cycle_${cycle.id}_${safeCycleNumber}_${safeStartTime}.csv`;
        const archiveFilePath = path.join(exportDir, archiveFileName);
        
        if (fs.existsSync(archiveFilePath)) {
          skippedCount++; // 已经归档过，跳过
          continue;
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
          emptyCount++; // 没有订单，跳过
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
        
        // 获取基础URL（从环境变量或设置中获取，如果没有则使用默认值）
        // 优先使用环境变量，如果没有则尝试从设置中获取，最后使用默认值
        let baseUrl = process.env.BASE_URL || process.env.DOMAIN;
        if (!baseUrl) {
          // 尝试从设置中获取域名
          const domainSetting = await getAsync("SELECT value FROM settings WHERE key = 'domain'");
          baseUrl = domainSetting?.value || 'http://localhost:3000';
        }
        // 确保 baseUrl 是完整的 URL（包含协议）
        if (baseUrl && !baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
          baseUrl = `http://${baseUrl}`;
        }
        
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
          'Cycle Number',
          'Payment Screenshot Link'
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
                `"${item.size ? (item.size + (item.size_price !== undefined && item.size_price !== null && item.size_price > 0 ? ` (${item.size_price.toFixed(2)})` : '')) : ''}"`,
                `"${item.sugar_level || ''}"`,
                `"${item.ice_level ? (iceLabels[item.ice_level] || item.ice_level) : ''}"`,
                `"${(() => {
                  if (!item.toppings) return '';
                  try {
                    // 解析加料数据
                    let toppings = typeof item.toppings === 'string' ? JSON.parse(item.toppings) : item.toppings;
                    if (!Array.isArray(toppings)) return '';
                    
                    // 格式化加料显示：如果是对象数组（包含name和price），显示为 "Name (Price)"；如果是字符串数组，只显示名称
                    const formatted = toppings.map(t => {
                      if (typeof t === 'object' && t !== null && t.name) {
                        // 对象格式：包含名称和价格
                        return t.price && t.price > 0 ? `${t.name} (${t.price.toFixed(2)})` : t.name;
                      } else {
                        // 字符串格式：只有名称
                        return String(t);
                      }
                    });
                    return formatted.join('; ');
                  } catch (e) {
                    // 如果解析失败，返回原始字符串
                    return typeof item.toppings === 'string' ? item.toppings : String(item.toppings);
                  }
                })().replace(/"/g, '""')}"`,
                (item.product_price || 0).toFixed(2),
                (item.subtotal || 0).toFixed(2),
                (order.total_amount || 0).toFixed(2),
                (order.discount_amount || 0).toFixed(2),
                (order.final_amount || 0).toFixed(2),
                `"${(order.notes || '').replace(/"/g, '""')}"`,
                `"${order.created_at || ''}"`,
                `"${order.updated_at || ''}"`,
                `"${cycle.id}"`,
                `"${cycle.cycle_number || ''}"`,
                `"${order.payment_image ? `${baseUrl}${order.payment_image}` : ''}"`
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
              `"${cycle.cycle_number || ''}"`,
              `"${order.payment_image ? `${baseUrl}${order.payment_image}` : ''}"`
            ];
            csvRows.push(row.join(','));
          }
        }
        
        const csvContent = csvRows.join('\n');
        
        // 写入文件
        fs.writeFileSync(archiveFilePath, '\ufeff' + csvContent, 'utf8');
        
        archivedCount++; // 成功归档
      }
      
      // 汇总日志（只在有操作或需要记录时才输出）
      if (cyclesToArchive.length > 0) {
        // 只在开启详细日志或真正执行了归档操作时记录
        const { shouldLogDebug } = require('../utils/log-helper');
        const debugEnabled = await shouldLogDebug();
        
        if (debugEnabled || archivedCount > 0) {
          logger.info('Cycle archive check completed', {
            totalCycles: cyclesToArchive.length,
            archived: archivedCount,
            alreadyArchived: skippedCount,
            emptyCycles: emptyCount
          });
        }
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

// 获取请求的基础URL（域名或IP）
function getBaseUrl(req) {
  // 优先使用 Host 头（包含域名和端口）
  let host = req.get('host');
  
  // 如果没有 Host 头，尝试其他方式
  if (!host) {
    host = req.hostname || req.host;
  }
  
  // 如果还是没有，尝试从请求头中获取
  if (!host) {
    host = req.headers.host;
  }
  
  // 判断是否是IP地址（IPv4或IPv6）
  const isIP = host && (
    /^\d+\.\d+\.\d+\.\d+(:\d+)?$/.test(host) || // IPv4
    /^\[[\da-f:]+\](:\d+)?$/i.test(host) || // IPv6 with brackets
    /^[\da-f:]+(:\d+)?$/i.test(host) // IPv6 without brackets
  );
  
  // 获取协议
  let protocol = req.protocol;
  if (!protocol) {
    // 检查是否通过代理设置了协议
    protocol = req.get('x-forwarded-proto') || (req.secure ? 'https' : 'http');
  }
  
  if (host && !isIP) {
    // 如果有域名（不是纯IP），使用域名
    return `${protocol}://${host}`;
  } else if (host) {
    // 如果是IP地址，直接使用
    return `${protocol}://${host}`;
  } else {
    // 如果都没有，尝试使用服务器IP
    const serverIP = req.connection.localAddress || req.socket.localAddress || 'localhost';
    const port = req.connection.localPort || process.env.PORT || 3000;
    
    // 如果是本地IP，使用 localhost
    if (serverIP === '127.0.0.1' || serverIP === '::1' || serverIP === '::ffff:127.0.0.1' || serverIP === '0.0.0.0') {
      return `${protocol}://localhost:${port}`;
    }
    
    return `${protocol}://${serverIP}:${port}`;
  }
}

// 导出订单（XLSX格式，只导出最近N个周期的订单，N由设置决定）
router.get('/orders/export', async (req, res) => {
  try {
    // 获取基础URL用于构建付款截图链接
    const baseUrl = getBaseUrl(req);
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

    // 创建Excel工作簿
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('订单导出');
    
    // 定义列标题
    const headers = [
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
      '更新时间',
      '付款截图链接'
    ];

    // 设置列标题
    worksheet.columns = headers.map(header => ({ header, key: header }));

    // 设置标题行样式
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' } // 蓝色背景
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.height = 25;

    // 设置列宽
    worksheet.columns.forEach((column, index) => {
      if (index === 0) column.width = 15; // 订单编号
      else if (index === 1) column.width = 12; // 客户姓名
      else if (index === 2) column.width = 15; // 客户电话
      else if (index === 3) column.width = 12; // 订单状态
      else if (index === 4) column.width = 20; // 商品名称
      else if (index === 5) column.width = 10; // 商品数量
      else if (index === 6) column.width = 12; // 杯型
      else if (index === 7) column.width = 10; // 甜度
      else if (index === 8) column.width = 12; // 冰度
      else if (index === 9) column.width = 25; // 加料
      else if (index === 10) column.width = 12; // 单价
      else if (index === 11) column.width = 12; // 小计
      else if (index === 12) column.width = 12; // 订单总金额
      else if (index === 13) column.width = 12; // 折扣金额
      else if (index === 14) column.width = 12; // 实付金额
      else if (index === 15) column.width = 20; // 订单备注
      else if (index === 16) column.width = 20; // 创建时间
      else if (index === 17) column.width = 20; // 更新时间
      else if (index === 18) column.width = 40; // 付款截图链接
    });

    // 冰度标签映射
          const iceLabels = {
            'normal': 'Normal Ice',
            'less': 'Less Ice',
            'no': 'No Ice',
            'room': 'Room Temperature',
            'hot': 'Hot'
          };
          
    // 添加数据行并跟踪订单行范围（用于合并单元格）
    let rowIndex = 2; // 从第2行开始（第1行是标题）
    const orderRowRanges = []; // 存储每个订单的行范围 {orderId, firstRow, lastRow}
    
    for (const order of orders) {
      const orderFirstRow = rowIndex;
      
      if (order.items && order.items.length > 0) {
        for (const item of order.items) {
          // 格式化加料
          let toppingsText = '';
          if (item.toppings) {
            try {
                let toppings = typeof item.toppings === 'string' ? JSON.parse(item.toppings) : item.toppings;
              if (Array.isArray(toppings)) {
                const formatted = toppings.map(t => {
                  if (typeof t === 'object' && t !== null && t.name) {
                    return t.price && t.price > 0 ? `${t.name} (${t.price.toFixed(2)})` : t.name;
                  } else {
                    return String(t);
                  }
                });
                toppingsText = formatted.join('; ');
              }
              } catch (e) {
              toppingsText = typeof item.toppings === 'string' ? item.toppings : String(item.toppings);
              }
          }

          // 格式化杯型
          let sizeText = '';
          if (item.size) {
            sizeText = item.size;
            if (item.size_price !== undefined && item.size_price !== null && item.size_price > 0) {
              sizeText += ` (${item.size_price.toFixed(2)})`;
            }
          }

          // 格式化订单状态
          const statusText = order.status === 'pending' ? '待付款' : 
                            order.status === 'paid' ? '已付款' : 
                            order.status === 'completed' ? '已完成' : '已取消';

          // 构建付款截图链接
          const paymentLink = order.payment_image ? `${baseUrl}${order.payment_image}` : '';

          // 添加行数据
          const row = worksheet.addRow([
            order.order_number || '',
            order.customer_name || '',
            order.customer_phone || '',
            statusText,
            item.product_name || '',
            item.quantity || 0,
            sizeText,
            item.sugar_level || '',
            item.ice_level ? (iceLabels[item.ice_level] || item.ice_level) : '',
            toppingsText,
            item.product_price || 0,
            item.subtotal || 0,
            order.total_amount || 0,
            order.discount_amount || 0,
            order.final_amount || 0,
            order.notes || '',
            order.created_at || '',
            order.updated_at || '',
            paymentLink
          ]);

          // 设置数据行样式
          row.alignment = { vertical: 'middle', horizontal: 'left' };
          row.height = 20;

          // 设置数字列格式
          row.getCell(11).numFmt = '0.00'; // 单价
          row.getCell(12).numFmt = '0.00'; // 小计
          row.getCell(13).numFmt = '0.00'; // 订单总金额
          row.getCell(14).numFmt = '0.00'; // 折扣金额
          row.getCell(15).numFmt = '0.00'; // 实付金额

          // 设置付款截图链接为超链接
          if (paymentLink) {
            const linkCell = row.getCell(19);
            linkCell.value = { text: paymentLink, hyperlink: paymentLink };
            linkCell.font = { color: { argb: 'FF0000FF' }, underline: true };
          }

          // 根据订单状态设置行颜色
          if (order.status === 'pending') {
            // 待付款：浅黄色背景
            row.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFFFF9C4' } // 浅黄色
            };
          } else if (order.status === 'paid') {
            // 已付款：浅绿色背景
            row.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFC8E6C9' } // 浅绿色
            };
          } else {
            // 其他状态：交替行颜色
            if (rowIndex % 2 === 0) {
              row.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFF2F2F2' } // 浅灰色
              };
            }
          }

          rowIndex++;
        }
      } else {
        // 如果没有商品详情，至少输出订单基本信息
        const statusText = order.status === 'pending' ? '待付款' : 
                          order.status === 'paid' ? '已付款' : 
                          order.status === 'completed' ? '已完成' : '已取消';
        const paymentLink = order.payment_image ? `${baseUrl}${order.payment_image}` : '';

        const row = worksheet.addRow([
          order.order_number || '',
          order.customer_name || '',
          order.customer_phone || '',
          statusText,
          '',
          0,
          '',
          '',
          '',
          '',
          0,
          0,
          order.total_amount || 0,
          order.discount_amount || 0,
          order.final_amount || 0,
          order.notes || '',
          order.created_at || '',
          order.updated_at || '',
          paymentLink
        ]);

        row.alignment = { vertical: 'middle', horizontal: 'left' };
        row.height = 20;

        // 设置数字列格式
        row.getCell(13).numFmt = '0.00';
        row.getCell(14).numFmt = '0.00';
        row.getCell(15).numFmt = '0.00';

        // 设置付款截图链接为超链接
        if (paymentLink) {
          const linkCell = row.getCell(19);
          linkCell.value = { text: paymentLink, hyperlink: paymentLink };
          linkCell.font = { color: { argb: 'FF0000FF' }, underline: true };
        }

        // 根据订单状态设置行颜色
        if (order.status === 'pending') {
          // 待付款：浅黄色背景
          row.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFF9C4' } // 浅黄色
          };
        } else if (order.status === 'paid') {
          // 已付款：浅绿色背景
          row.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFC8E6C9' } // 浅绿色
          };
        } else {
          // 其他状态：交替行颜色
          if (rowIndex % 2 === 0) {
            row.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFF2F2F2' }
            };
          }
        }

        rowIndex++;
      }
      
      // 记录订单的行范围
      const orderLastRow = rowIndex - 1;
      if (orderLastRow >= orderFirstRow) {
        orderRowRanges.push({ orderId: order.id, firstRow: orderFirstRow, lastRow: orderLastRow });
      }
    }

    // 合并同一订单的单元格（除了商品相关列）
    // 需要合并的列：1(订单编号), 2(客户姓名), 3(客户电话), 4(订单状态), 
    // 13(订单总金额), 14(折扣金额), 15(实付金额), 16(订单备注), 
    // 17(创建时间), 18(更新时间), 19(付款截图链接)
    // 不合并的列：5(商品名称), 6(数量), 7(杯型), 8(甜度), 9(冰度), 10(加料), 11(单价), 12(小计)
    const mergeColumns = [1, 2, 3, 4, 13, 14, 15, 16, 17, 18, 19];
    
    for (const range of orderRowRanges) {
      if (range.lastRow > range.firstRow) {
        // 如果订单有多行，需要合并
        for (const col of mergeColumns) {
          worksheet.mergeCells(range.firstRow, col, range.lastRow, col);
          // 设置合并后的单元格垂直居中
          const cell = worksheet.getCell(range.firstRow, col);
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
        }
      }
    }

    // 冻结首行
    worksheet.views = [
      { state: 'frozen', ySplit: 1 }
    ];

    // 设置文件名
    const filename = `订单导出_${new Date().toISOString().slice(0, 10)}.xlsx`;

    // 设置响应头
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);

    // 写入响应
    await workbook.xlsx.write(res);
    res.end();
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

// 生成周期订单Excel文件并保存到磁盘
async function generateCycleExcelFile(cycleId, baseUrl) {
  try {
    // 获取周期信息
    const cycle = await getAsync('SELECT * FROM ordering_cycles WHERE id = ?', [cycleId]);
    if (!cycle) {
      throw new Error('周期不存在');
    }

    let endTime = cycle.end_time;
    if (!endTime) {
      const nowResult = await getAsync("SELECT datetime('now', 'localtime') as now");
      endTime = nowResult.now;
    }

    // 获取周期内的所有订单
    const orders = await allAsync(
      'SELECT * FROM orders WHERE created_at >= ? AND created_at <= ? ORDER BY created_at DESC',
      [cycle.start_time, endTime]
    );

    // 获取订单详情
    for (const order of orders) {
      order.items = await allAsync(
        'SELECT * FROM order_items WHERE order_id = ?',
        [order.id]
      );
    }

    // 创建Excel工作簿
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('订单导出');

    // 定义列标题
    const headers = [
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
      '更新时间',
      '付款截图链接'
    ];

    // 设置列标题
    worksheet.columns = headers.map(header => ({ header, key: header }));

    // 设置标题行样式
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' }
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.height = 25;

    // 设置列宽（与导出路由相同）
    worksheet.columns.forEach((column, index) => {
      if (index === 0) column.width = 15;
      else if (index === 1) column.width = 12;
      else if (index === 2) column.width = 15;
      else if (index === 3) column.width = 12;
      else if (index === 4) column.width = 20;
      else if (index === 5) column.width = 10;
      else if (index === 6) column.width = 12;
      else if (index === 7) column.width = 10;
      else if (index === 8) column.width = 12;
      else if (index === 9) column.width = 25;
      else if (index === 10) column.width = 12;
      else if (index === 11) column.width = 12;
      else if (index === 12) column.width = 12;
      else if (index === 13) column.width = 12;
      else if (index === 14) column.width = 12;
      else if (index === 15) column.width = 20;
      else if (index === 16) column.width = 20;
      else if (index === 17) column.width = 20;
      else if (index === 18) column.width = 40;
    });

    // 冰度标签映射
    const iceLabels = {
      'normal': 'Normal Ice',
      'less': 'Less Ice',
      'no': 'No Ice',
      'room': 'Room Temperature',
      'hot': 'Hot'
    };

    // 添加数据行并跟踪订单行范围（用于合并单元格）
    let rowIndex = 2;
    const orderRowRanges = []; // 存储每个订单的行范围 {orderId, firstRow, lastRow}
    
    for (const order of orders) {
      const orderFirstRow = rowIndex;
      
      if (order.items && order.items.length > 0) {
        for (const item of order.items) {
          // 格式化加料
          let toppingsText = '';
          if (item.toppings) {
            try {
              let toppings = typeof item.toppings === 'string' ? JSON.parse(item.toppings) : item.toppings;
              if (Array.isArray(toppings)) {
                const formatted = toppings.map(t => {
                  if (typeof t === 'object' && t !== null && t.name) {
                    return t.price && t.price > 0 ? `${t.name} (${t.price.toFixed(2)})` : t.name;
                  } else {
                    return String(t);
                  }
                });
                toppingsText = formatted.join('; ');
              }
            } catch (e) {
              toppingsText = typeof item.toppings === 'string' ? item.toppings : String(item.toppings);
            }
          }

          // 格式化杯型
          let sizeText = '';
          if (item.size) {
            sizeText = item.size;
            if (item.size_price !== undefined && item.size_price !== null && item.size_price > 0) {
              sizeText += ` (${item.size_price.toFixed(2)})`;
            }
          }

          // 格式化订单状态
          const statusText = order.status === 'pending' ? '待付款' : 
                            order.status === 'paid' ? '已付款' : 
                            order.status === 'completed' ? '已完成' : '已取消';

          // 构建付款截图链接
          const paymentLink = order.payment_image ? `${baseUrl}${order.payment_image}` : '';

          // 添加行数据
          const row = worksheet.addRow([
            order.order_number || '',
            order.customer_name || '',
            order.customer_phone || '',
            statusText,
            item.product_name || '',
            item.quantity || 0,
            sizeText,
            item.sugar_level || '',
            item.ice_level ? (iceLabels[item.ice_level] || item.ice_level) : '',
            toppingsText,
            item.product_price || 0,
            item.subtotal || 0,
            order.total_amount || 0,
            order.discount_amount || 0,
            order.final_amount || 0,
            order.notes || '',
            order.created_at || '',
            order.updated_at || '',
            paymentLink
          ]);

          // 设置数据行样式
          row.alignment = { vertical: 'middle', horizontal: 'left' };
          row.height = 20;

          // 设置数字列格式
          row.getCell(11).numFmt = '0.00';
          row.getCell(12).numFmt = '0.00';
          row.getCell(13).numFmt = '0.00';
          row.getCell(14).numFmt = '0.00';
          row.getCell(15).numFmt = '0.00';

          // 设置付款截图链接为超链接
          if (paymentLink) {
            const linkCell = row.getCell(19);
            linkCell.value = { text: paymentLink, hyperlink: paymentLink };
            linkCell.font = { color: { argb: 'FF0000FF' }, underline: true };
          }

          // 根据订单状态设置行颜色
          if (order.status === 'pending') {
            row.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFFFF9C4' }
            };
          } else if (order.status === 'paid') {
            row.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFC8E6C9' }
            };
          } else {
            if (rowIndex % 2 === 0) {
              row.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFF2F2F2' }
              };
            }
          }

          rowIndex++;
        }
      } else {
        // 如果没有商品详情，至少输出订单基本信息
        const statusText = order.status === 'pending' ? '待付款' : 
                          order.status === 'paid' ? '已付款' : 
                          order.status === 'completed' ? '已完成' : '已取消';
        const paymentLink = order.payment_image ? `${baseUrl}${order.payment_image}` : '';

        const row = worksheet.addRow([
          order.order_number || '',
          order.customer_name || '',
          order.customer_phone || '',
          statusText,
          '',
          0,
          '',
          '',
          '',
          '',
          0,
          0,
          order.total_amount || 0,
          order.discount_amount || 0,
          order.final_amount || 0,
          order.notes || '',
          order.created_at || '',
          order.updated_at || '',
          paymentLink
        ]);

        row.alignment = { vertical: 'middle', horizontal: 'left' };
        row.height = 20;

        row.getCell(13).numFmt = '0.00';
        row.getCell(14).numFmt = '0.00';
        row.getCell(15).numFmt = '0.00';

        if (paymentLink) {
          const linkCell = row.getCell(19);
          linkCell.value = { text: paymentLink, hyperlink: paymentLink };
          linkCell.font = { color: { argb: 'FF0000FF' }, underline: true };
        }

        if (order.status === 'pending') {
          row.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFF9C4' }
          };
        } else if (order.status === 'paid') {
          row.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFC8E6C9' }
          };
        } else {
          if (rowIndex % 2 === 0) {
            row.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFF2F2F2' }
            };
          }
        }

        rowIndex++;
      }
      
      // 记录订单的行范围
      const orderLastRow = rowIndex - 1;
      if (orderLastRow >= orderFirstRow) {
        orderRowRanges.push({ orderId: order.id, firstRow: orderFirstRow, lastRow: orderLastRow });
      }
    }

    // 合并同一订单的单元格（除了商品相关列）
    // 需要合并的列：1(订单编号), 2(客户姓名), 3(客户电话), 4(订单状态), 
    // 13(订单总金额), 14(折扣金额), 15(实付金额), 16(订单备注), 
    // 17(创建时间), 18(更新时间), 19(付款截图链接)
    const mergeColumns = [1, 2, 3, 4, 13, 14, 15, 16, 17, 18, 19];
    
    for (const range of orderRowRanges) {
      if (range.lastRow > range.firstRow) {
        // 如果订单有多行，需要合并
        for (const col of mergeColumns) {
          worksheet.mergeCells(range.firstRow, col, range.lastRow, col);
          // 设置合并后的单元格垂直居中
          const cell = worksheet.getCell(range.firstRow, col);
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
        }
      }
    }

    // 冻结首行
    worksheet.views = [
      { state: 'frozen', ySplit: 1 }
    ];

    // 确保导出目录存在
    const exportDir = path.join(DATA_DIR, 'logs', 'export');
    if (!fs.existsSync(exportDir)) {
      fs.mkdirSync(exportDir, { recursive: true });
    }

    // 生成文件名
    const filename = `订单导出_周期${cycleId}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    const filePath = path.join(exportDir, filename);

    // 保存文件
    await workbook.xlsx.writeFile(filePath);

    return filePath;
  } catch (error) {
    logger.error('生成周期Excel文件失败', { error: error.message, cycleId });
    throw error;
  }
}

// 确认周期（计算折扣并结束周期）
router.post('/cycles/:id/confirm', async (req, res) => {
  try {
    const { id } = req.params;
    const { beginTransaction, commit, rollback } = require('../db/database');
    const baseUrl = getBaseUrl(req);
    
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
      
      // 检查orders表是否有balance_used字段
      const ordersTableInfo = await allAsync("PRAGMA table_info(orders)");
      const ordersColumns = ordersTableInfo.map(col => col.name);
      const hasBalanceUsed = ordersColumns.includes('balance_used');
      
      // 更新所有订单的折扣，并将待付款订单自动取消
      let cancelledCount = 0;
      let refundedCount = 0;
      for (const order of orders) {
        const discountAmount = roundAmount(order.total_amount * discountRate);
        // 计算最终金额：原价 - 折扣 - 已使用的余额
        const balanceUsed = hasBalanceUsed && order.balance_used ? (order.balance_used || 0) : 0;
        const finalAmount = roundAmount(order.total_amount - discountAmount - balanceUsed);
        
        // 如果订单是待付款状态，自动取消
        if (order.status === 'pending') {
          await runAsync(
            "UPDATE orders SET discount_amount = ?, final_amount = ?, status = 'cancelled', updated_at = datetime('now', 'localtime') WHERE id = ?",
            [discountAmount, finalAmount, order.id]
          );
          cancelledCount++;
          
          // 如果订单使用了余额，需要退还余额
          if (hasBalanceUsed && balanceUsed > 0) {
            // 获取用户当前余额
            const user = await getAsync('SELECT balance FROM users WHERE id = ?', [order.user_id]);
              if (user) {
                const balanceBefore = user.balance || 0;
                const balanceAfter = roundAmount(balanceBefore + balanceUsed);
                
                // 退还余额
                await runAsync(
                  'UPDATE users SET balance = ? WHERE id = ?',
                  [balanceAfter, order.user_id]
                );
                
                // 记录余额变动
                await runAsync(
                  `INSERT INTO balance_transactions (user_id, type, amount, balance_before, balance_after, order_id, notes, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))`,
                  [
                    order.user_id,
                    'refund',
                    balanceUsed, // 正数表示增加
                    balanceBefore,
                    balanceAfter,
                    order.id,
                    '周期确认，订单自动取消，退还余额'
                  ]
                );
                
                refundedCount++;
                logger.info('订单取消，已退还余额', { 
                  orderId: order.id, 
                  userId: order.user_id, 
                  balanceUsed 
                });
              }
          }
        } else {
          // 已付款的订单只更新折扣
        await runAsync(
          "UPDATE orders SET discount_amount = ?, final_amount = ?, updated_at = datetime('now', 'localtime') WHERE id = ?",
          [discountAmount, finalAmount, order.id]
        );
        }
      }
      
      // 更新周期状态
      await runAsync(
        `UPDATE ordering_cycles 
         SET status = 'confirmed', discount_rate = ?, confirmed_at = datetime('now', 'localtime'), updated_at = datetime('now', 'localtime') 
         WHERE id = ?`,
        [discountRate * 100, id]
      );
      
      logger.info('周期确认完成，已自动取消待付款订单', { 
        cycleId: id, 
        cancelledCount, 
        refundedCount,
        totalOrders: orders.length 
      });
      
      await commit();
      await logAction(req.session.adminId, 'UPDATE', 'ordering_cycle', id, { discountRate, orderCount: orders.length }, req);
      
      // 生成Excel文件并发送邮件（异步执行，不阻塞响应）
      (async () => {
        try {
          const excelFilePath = await generateCycleExcelFile(id, baseUrl);
          logger.info('周期订单Excel文件已生成', { cycleId: id, filePath: excelFilePath });
          
          // 发送邮件
          const emailResult = await sendCycleExportEmail(id, excelFilePath);
          if (emailResult.success) {
            logger.info('周期订单导出邮件已发送', { cycleId: id });
          } else {
            logger.warn('周期订单导出邮件发送失败', { cycleId: id, message: emailResult.message });
          }
        } catch (error) {
          logger.error('生成Excel或发送邮件失败', { error: error.message, cycleId: id });
        }
      })();
      
      res.json({ 
        success: true, 
        message: '周期确认成功',
        discountRate: discountRate * 100,
        orderCount: orders.length,
        cancelledCount: cancelledCount,
        refundedCount: refundedCount
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

// 测试邮件配置
router.post('/email/test', async (req, res) => {
  try {
    const result = await testEmailConfig();
    res.json(result);
  } catch (error) {
    logger.error('测试邮件失败', { error: error.message });
    res.status(500).json({ success: false, message: error.message });
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

// ==================== 余额管理 ====================

/**
 * GET /api/admin/users/balance
 * Get all users' balance information
 * @returns {Object} List of users with balance
 */
router.get('/users/balance', async (req, res) => {
  try {
    const users = await allAsync(`
      SELECT 
        u.id,
        u.phone,
        u.name,
        u.balance,
        COALESCE(MAX(bt.created_at), u.created_at) as last_transaction_time
      FROM users u
      LEFT JOIN balance_transactions bt ON u.id = bt.user_id
      GROUP BY u.id, u.phone, u.name, u.balance, u.created_at
      ORDER BY u.id DESC
    `);
    
    res.json({ success: true, users });
  } catch (error) {
    logger.error('获取用户余额列表失败', { error: error.message });
    res.status(500).json({ success: false, message: '获取用户余额列表失败' });
  }
});

/**
 * POST /api/admin/users/:userId/balance/recharge
 * Recharge user balance
 * @param {number} userId - User ID
 * @body {number} amount - Recharge amount
 * @body {string} [notes] - Notes
 * @returns {Object} Success message
 */
router.post('/users/:userId/balance/recharge', [
  body('amount').isFloat({ min: 0.01 }).withMessage('充值金额必须大于0'),
  body('notes').optional().trim().isLength({ max: 500 }).withMessage('备注长度不能超过500个字符'),
  validate
], async (req, res) => {
  try {
    const { userId } = req.params;
    const { amount, notes } = req.body;

    const user = await getAsync('SELECT * FROM users WHERE id = ?', [userId]);
    if (!user) {
      return res.status(404).json({ success: false, message: '用户不存在' });
    }

    await beginTransaction();

    try {
      const balanceBefore = user.balance || 0;
      const balanceAfter = roundAmount(balanceBefore + parseFloat(amount));

      // 更新用户余额
      await runAsync(
        'UPDATE users SET balance = ? WHERE id = ?',
        [balanceAfter, userId]
      );

      // 记录余额变动
      await runAsync(
        `INSERT INTO balance_transactions (user_id, type, amount, balance_before, balance_after, admin_id, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))`,
        [
          userId,
          'recharge',
          parseFloat(amount),
          balanceBefore,
          balanceAfter,
          req.session.adminId,
          notes || '管理员充值'
        ]
      );

      await commit();

      await logAction(req.session.adminId, 'RECHARGE_BALANCE', 'user', userId, {
        amount: parseFloat(amount),
        balanceBefore,
        balanceAfter,
        notes: notes || '管理员充值'
      }, req);

      res.json({
        success: true,
        message: '充值成功',
        balance: balanceAfter
      });
    } catch (error) {
      await rollback();
      throw error;
    }
  } catch (error) {
    logger.error('充值余额失败', { error: error.message });
    res.status(500).json({ success: false, message: error.message || '充值余额失败' });
  }
});

/**
 * POST /api/admin/users/:userId/balance/deduct
 * Deduct user balance
 * @param {number} userId - User ID
 * @body {number} amount - Deduct amount
 * @body {string} [notes] - Notes
 * @returns {Object} Success message
 */
router.post('/users/:userId/balance/deduct', [
  body('amount').isFloat({ min: 0.01 }).withMessage('扣减金额必须大于0'),
  body('notes').optional().trim().isLength({ max: 500 }).withMessage('备注长度不能超过500个字符'),
  validate
], async (req, res) => {
  try {
    const { userId } = req.params;
    const { amount, notes } = req.body;

    const user = await getAsync('SELECT * FROM users WHERE id = ?', [userId]);
    if (!user) {
      return res.status(404).json({ success: false, message: '用户不存在' });
    }

    const balanceBefore = user.balance || 0;
    const deductAmount = parseFloat(amount);

    if (balanceBefore < deductAmount) {
      return res.status(400).json({
        success: false,
        message: `余额不足，当前余额：${balanceBefore.toFixed(2)}，扣减金额：${deductAmount.toFixed(2)}`
      });
    }

    await beginTransaction();

    try {
      const balanceAfter = roundAmount(balanceBefore - deductAmount);

      // 更新用户余额
      await runAsync(
        'UPDATE users SET balance = ? WHERE id = ?',
        [balanceAfter, userId]
      );

      // 记录余额变动
      await runAsync(
        `INSERT INTO balance_transactions (user_id, type, amount, balance_before, balance_after, admin_id, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))`,
        [
          userId,
          'deduct',
          -deductAmount, // 负数表示减少
          balanceBefore,
          balanceAfter,
          req.session.adminId,
          notes || '管理员扣减'
        ]
      );

      await commit();

      await logAction(req.session.adminId, 'DEDUCT_BALANCE', 'user', userId, {
        amount: deductAmount,
        balanceBefore,
        balanceAfter,
        notes: notes || '管理员扣减'
      }, req);

      res.json({
        success: true,
        message: '扣减成功',
        balance: balanceAfter
      });
    } catch (error) {
      await rollback();
      throw error;
    }
  } catch (error) {
    logger.error('扣减余额失败', { error: error.message });
    res.status(500).json({ success: false, message: error.message || '扣减余额失败' });
  }
});

/**
 * GET /api/admin/users/:userId/balance/transactions
 * Get user's balance transaction history
 * @param {number} userId - User ID
 * @query {number} [page=1] - Page number
 * @query {number} [limit=30] - Items per page
 * @returns {Object} Transaction history with pagination
 */
router.get('/users/:userId/balance/transactions', async (req, res) => {
  try {
    const { userId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 30;
    const offset = (page - 1) * limit;

    // 检查用户是否存在
    const user = await getAsync('SELECT id, phone, name FROM users WHERE id = ?', [userId]);
    if (!user) {
      return res.status(404).json({ success: false, message: '用户不存在' });
    }

    // 获取总数
    const totalResult = await getAsync(
      'SELECT COUNT(*) as total FROM balance_transactions WHERE user_id = ?',
      [userId]
    );
    const total = totalResult.total || 0;

    // 获取交易记录
    const transactions = await allAsync(
      `SELECT 
        bt.*,
        a.username as admin_username,
        a.name as admin_name,
        o.order_number
       FROM balance_transactions bt
       LEFT JOIN admins a ON bt.admin_id = a.id
       LEFT JOIN orders o ON bt.order_id = o.id
       WHERE bt.user_id = ?
       ORDER BY bt.created_at DESC
       LIMIT ? OFFSET ?`,
      [userId, limit, offset]
    );

    res.json({
      success: true,
      transactions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      },
      user: {
        id: user.id,
        phone: user.phone,
        name: user.name
      }
    });
  } catch (error) {
    logger.error('获取余额变动历史失败', { error: error.message });
    res.status(500).json({ success: false, message: '获取余额变动历史失败' });
  }
});

/**
 * GET /api/admin/balance/transactions
 * Get all balance transactions with filters
 * @query {number} [page=1] - Page number
 * @query {number} [limit=30] - Items per page
 * @query {number} [userId] - Filter by user ID
 * @query {string} [type] - Filter by type (recharge/deduct/use/refund)
 * @query {string} [startDate] - Start date (YYYY-MM-DD)
 * @query {string} [endDate] - End date (YYYY-MM-DD)
 * @returns {Object} Transaction history with pagination
 */
router.get('/balance/transactions', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 30;
    const offset = (page - 1) * limit;
    const { userId, type, startDate, endDate } = req.query;

    // 构建查询条件
    let whereConditions = [];
    let queryParams = [];

    if (userId) {
      whereConditions.push('bt.user_id = ?');
      queryParams.push(userId);
    }

    if (type) {
      whereConditions.push('bt.type = ?');
      queryParams.push(type);
    }

    if (startDate) {
      whereConditions.push("DATE(bt.created_at) >= ?");
      queryParams.push(startDate);
    }

    if (endDate) {
      whereConditions.push("DATE(bt.created_at) <= ?");
      queryParams.push(endDate);
    }

    const whereClause = whereConditions.length > 0 
      ? 'WHERE ' + whereConditions.join(' AND ')
      : '';

    // 获取总数
    const totalResult = await getAsync(
      `SELECT COUNT(*) as total FROM balance_transactions bt ${whereClause}`,
      queryParams
    );
    const total = totalResult.total || 0;

    // 获取交易记录
    const transactions = await allAsync(
      `SELECT 
        bt.*,
        u.phone as user_phone,
        u.name as user_name,
        a.username as admin_username,
        a.name as admin_name,
        o.order_number
       FROM balance_transactions bt
       LEFT JOIN users u ON bt.user_id = u.id
       LEFT JOIN admins a ON bt.admin_id = a.id
       LEFT JOIN orders o ON bt.order_id = o.id
       ${whereClause}
       ORDER BY bt.created_at DESC
       LIMIT ? OFFSET ?`,
      [...queryParams, limit, offset]
    );

    res.json({
      success: true,
      transactions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error('获取余额变动历史失败', { error: error.message });
    res.status(500).json({ success: false, message: '获取余额变动历史失败' });
  }
});

/**
 * POST /api/admin/users/balance/batch-recharge
 * Batch recharge user balance
 * @body {Array} users - Array of {userId, amount, notes}
 * @returns {Object} Success message with results
 */
router.post('/users/balance/batch-recharge', [
  body('users').isArray().withMessage('用户列表必须是数组'),
  body('users.*.userId').isInt().withMessage('用户ID必须是整数'),
  body('users.*.amount').isFloat({ min: 0.01 }).withMessage('充值金额必须大于0'),
  body('users.*.notes').optional().trim().isLength({ max: 500 }).withMessage('备注长度不能超过500个字符'),
  validate
], async (req, res) => {
  const { users } = req.body;
  
  try {
    await beginTransaction();
    
    const results = [];
    const errors = [];
    
    for (const userData of users) {
      try {
        const { userId, amount, notes } = userData;
        
        // 检查用户是否存在
        const user = await getAsync('SELECT id, balance FROM users WHERE id = ?', [userId]);
        if (!user) {
          errors.push({ userId, error: '用户不存在' });
          continue;
        }
        
        const balanceBefore = user.balance || 0;
        const balanceAfter = roundAmount(balanceBefore + parseFloat(amount));
        
        // 更新用户余额
        await runAsync(
          'UPDATE users SET balance = ? WHERE id = ?',
          [balanceAfter, userId]
        );
        
        // 记录余额变动
        await runAsync(
          `INSERT INTO balance_transactions (user_id, type, amount, balance_before, balance_after, admin_id, notes, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))`,
          [
            userId,
            'recharge',
            parseFloat(amount),
            balanceBefore,
            balanceAfter,
            req.session.adminId,
            notes || '批量充值'
          ]
        );
        
        // 记录操作日志
        await logAction(req.session.adminId, 'BATCH_RECHARGE_BALANCE', 'user', userId, {
          amount: parseFloat(amount),
          balanceBefore,
          balanceAfter,
          notes: notes || '批量充值'
        }, req);
        
        results.push({ userId, success: true, balanceAfter });
      } catch (error) {
        errors.push({ userId: userData.userId, error: error.message });
      }
    }
    
    await commit();
    
    res.json({
      success: true,
      message: `批量充值完成：成功 ${results.length} 个，失败 ${errors.length} 个`,
      results,
      errors
    });
  } catch (error) {
    await rollback();
    logger.error('批量充值余额失败', { error: error.message });
    res.status(500).json({ success: false, message: error.message || '批量充值余额失败' });
  }
});

/**
 * POST /api/admin/cycles/:cycleId/balance/recharge-paid-users
 * Recharge balance to all paid users in a specific cycle
 * @param {number} cycleId - Cycle ID
 * @body {number} amount - Recharge amount per user
 * @body {string} [notes] - Notes
 * @returns {Object} Success message with results
 */
router.post('/cycles/:cycleId/balance/recharge-paid-users', [
  body('amount').isFloat({ min: 0.01 }).withMessage('充值金额必须大于0'),
  body('notes').optional().trim().isLength({ max: 500 }).withMessage('备注长度不能超过500个字符'),
  validate
], async (req, res) => {
  const { cycleId } = req.params;
  const { amount, notes } = req.body;
  
  try {
    // 获取周期信息
    const cycle = await getAsync('SELECT * FROM ordering_cycles WHERE id = ?', [cycleId]);
    if (!cycle) {
      return res.status(404).json({ success: false, message: '周期不存在' });
    }
    
    // 获取周期内所有已付款订单的用户（去重）
    const paidUsers = await allAsync(`
      SELECT DISTINCT o.user_id, u.balance
      FROM orders o
      JOIN users u ON o.user_id = u.id
      WHERE o.created_at >= ? AND o.created_at <= ? AND o.status IN ('paid', 'completed')
    `, [cycle.start_time, cycle.end_time || cycle.updated_at]);
    
    if (paidUsers.length === 0) {
      return res.json({
        success: true,
        message: '该周期内没有已付款订单',
        results: [],
        errors: []
      });
    }
    
    await beginTransaction();
    
    const results = [];
    const errors = [];
    
    for (const userData of paidUsers) {
      try {
        const userId = userData.user_id;
        const balanceBefore = userData.balance || 0;
        const balanceAfter = roundAmount(balanceBefore + parseFloat(amount));
        
        // 更新用户余额
        await runAsync(
          'UPDATE users SET balance = ? WHERE id = ?',
          [balanceAfter, userId]
        );
        
        // 记录余额变动
        await runAsync(
          `INSERT INTO balance_transactions (user_id, type, amount, balance_before, balance_after, admin_id, notes, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))`,
          [
            userId,
            'recharge',
            parseFloat(amount),
            balanceBefore,
            balanceAfter,
            req.session.adminId,
            notes || `周期 ${cycle.cycle_number} 已付款用户批量充值`
          ]
        );
        
        // 记录操作日志
        await logAction(req.session.adminId, 'CYCLE_BATCH_RECHARGE_BALANCE', 'user', userId, {
          cycleId,
          cycleNumber: cycle.cycle_number,
          amount: parseFloat(amount),
          balanceBefore,
          balanceAfter,
          notes: notes || `周期 ${cycle.cycle_number} 已付款用户批量充值`
        }, req);
        
        results.push({ userId, success: true, balanceAfter });
      } catch (error) {
        errors.push({ userId: userData.user_id, error: error.message });
      }
    }
    
    await commit();
    
    res.json({
      success: true,
      message: `批量充值完成：成功 ${results.length} 个，失败 ${errors.length} 个`,
      results,
      errors
    });
  } catch (error) {
    await rollback();
    logger.error('周期批量充值余额失败', { error: error.message, cycleId });
    res.status(500).json({ success: false, message: error.message || '周期批量充值余额失败' });
  }
});

// ==================== 用户管理 ====================

/**
 * PUT /api/admin/users/:userId
 * Update user information
 * @param {number} userId - User ID
 * @body {string} [name] - User name
 * @body {string} [phone] - User phone (must be unique)
 * @returns {Object} Success message
 */
router.put('/users/:userId', [
  body('name').optional().trim().isLength({ max: 100 }).withMessage('姓名长度不能超过100个字符'),
  body('phone').optional().trim().matches(/^0\d{10}$/).withMessage('手机号格式不正确（必须是11位数字，以0开头）'),
  validate
], async (req, res) => {
  const { userId } = req.params;
  const { name, phone } = req.body;
  
  try {
    // 检查用户是否存在
    const user = await getAsync('SELECT * FROM users WHERE id = ?', [userId]);
    if (!user) {
      return res.status(404).json({ success: false, message: '用户不存在' });
    }
    
    // 如果更新手机号，检查是否重复
    if (phone && phone !== user.phone) {
      const existingUser = await getAsync('SELECT id FROM users WHERE phone = ? AND id != ?', [phone, userId]);
      if (existingUser) {
        return res.status(400).json({ success: false, message: '手机号已被使用' });
      }
    }
    
    await beginTransaction();
    
    // 构建更新字段
    const updates = [];
    const params = [];
    
    if (name !== undefined) {
      updates.push('name = ?');
      params.push(name || null);
    }
    
    if (phone !== undefined) {
      updates.push('phone = ?');
      params.push(phone);
    }
    
    if (updates.length === 0) {
      await rollback();
      return res.status(400).json({ success: false, message: '没有需要更新的字段' });
    }
    
    params.push(userId);
    
    await runAsync(
      `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
      params
    );
    
    // 记录操作日志
    await logAction(req.session.adminId, 'UPDATE_USER', 'user', userId, {
      name: name !== undefined ? name : user.name,
      phone: phone !== undefined ? phone : user.phone
    }, req);
    
    await commit();
    
    res.json({ success: true, message: '用户信息更新成功' });
  } catch (error) {
    await rollback();
    logger.error('更新用户信息失败', { error: error.message, userId });
    res.status(500).json({ success: false, message: error.message || '更新用户信息失败' });
  }
});

/**
 * DELETE /api/admin/users/:userId
 * Delete a user
 * @param {number} userId - User ID
 * @returns {Object} Success message
 */
router.delete('/users/:userId', async (req, res) => {
  const { userId } = req.params;
  
  try {
    // 验证userId参数
    if (!userId || isNaN(parseInt(userId))) {
      logger.warn('删除用户：无效的userId参数', { userId, method: req.method, path: req.path });
      return res.status(400).json({ success: false, message: '无效的用户ID' });
    }
    
    // 检查用户是否存在
    const user = await getAsync('SELECT * FROM users WHERE id = ?', [userId]);
    if (!user) {
      logger.warn('删除用户：用户不存在', { userId });
      return res.status(404).json({ success: false, message: '用户不存在' });
    }
    
    await beginTransaction();
    
    try {
      // 获取用户的所有订单ID（用于统计和日志）
      const userOrders = await allAsync(
        'SELECT id, order_number, status FROM orders WHERE user_id = ?',
        [userId]
      );
      
      // 获取用户的余额变动记录数量（用于统计和日志）
      const balanceTransactions = await allAsync(
        'SELECT COUNT(*) as count FROM balance_transactions WHERE user_id = ?',
        [userId]
      );
      const transactionCount = balanceTransactions[0]?.count || 0;
      
      // 强制删除用户的所有订单（这会级联删除订单项，因为 order_items 有 ON DELETE CASCADE）
      await runAsync(
        'DELETE FROM orders WHERE user_id = ?',
        [userId]
      );
      
      // 删除余额变动记录（虽然外键约束是 ON DELETE CASCADE，但为了确保数据一致性，我们显式删除）
      // 注意：如果外键约束正常工作，这行可能不会删除任何记录，但不会报错
      await runAsync(
        'DELETE FROM balance_transactions WHERE user_id = ?',
        [userId]
      );
      
      // 删除用户
      await runAsync('DELETE FROM users WHERE id = ?', [userId]);
      
      // 记录操作日志
      await logAction(req.session.adminId, 'DELETE_USER', 'user', userId, {
        phone: user.phone,
        name: user.name,
        deletedOrdersCount: userOrders.length,
        deletedTransactionsCount: transactionCount,
        forceDelete: true
      }, req);
      
      await commit();
      
      logger.info('用户强制删除成功', {
        userId,
        phone: user.phone,
        deletedOrdersCount: userOrders.length,
        deletedTransactionsCount: transactionCount
      });
      
      res.json({ 
        success: true, 
        message: '用户删除成功',
        deletedOrdersCount: userOrders.length,
        deletedTransactionsCount: transactionCount
      });
    } catch (error) {
      await rollback();
      throw error;
    }
  } catch (error) {
    await rollback();
    logger.error('删除用户失败', { 
      error: error.message, 
      userId,
      stack: error.stack,
      method: req.method,
      path: req.path,
      params: req.params
    });
    res.status(500).json({ success: false, message: error.message || '删除用户失败' });
  }
});

/**
 * POST /api/admin/users/:userId/reset-pin
 * Reset (clear) user PIN
 * @param {number} userId - User ID
 * @returns {Object} Success message
 */
router.post('/users/:userId/reset-pin', async (req, res) => {
  const { userId } = req.params;
  
  try {
    // 检查用户是否存在
    const user = await getAsync('SELECT * FROM users WHERE id = ?', [userId]);
    if (!user) {
      return res.status(404).json({ success: false, message: '用户不存在' });
    }
    
    await beginTransaction();
    
    // 清空用户 PIN
    await runAsync('UPDATE users SET pin = NULL WHERE id = ?', [userId]);
    
    // 记录操作日志
    await logAction(req.session.adminId, 'RESET_USER_PIN', 'user', userId, {
      phone: user.phone,
      name: user.name
    }, req);
    
    await commit();
    
    res.json({ success: true, message: '用户PIN已重置，用户下次登录时需要重新设置PIN' });
  } catch (error) {
    await rollback();
    logger.error('重置用户PIN失败', { error: error.message, userId });
    res.status(500).json({ success: false, message: error.message || '重置用户PIN失败' });
  }
});

// 获取所有用户
/**
 * POST /api/admin/users/:phone/unlock
 * Unlock a user account and clear login failure records
 * @param {string} phone - User phone number
 * @returns {Object} Success message
 */
router.post('/users/:phone/unlock', async (req, res) => {
  const { phone } = req.params;
  
  try {
    // 检查用户是否存在
    const user = await getAsync('SELECT * FROM users WHERE phone = ?', [phone]);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    // 检查是否有失败记录（包括锁定和未锁定的）
    const attempt = await getAsync(
      'SELECT * FROM user_login_attempts WHERE phone = ?',
      [phone]
    );
    
    if (!attempt) {
      return res.json({ 
        success: true, 
        message: 'No login failure records found',
        hadRecords: false
      });
    }
    
    await beginTransaction();
    
    // 清除所有失败记录（包括锁定状态和失败计数）
    await runAsync(
      'DELETE FROM user_login_attempts WHERE phone = ?',
      [phone]
    );
    
    // 记录操作日志
    await logAction(req.session.adminId, 'UNLOCK_USER', 'user', user.id, {
      phone: user.phone,
      name: user.name,
      failedCount: attempt.failed_count || 0,
      lockedUntil: attempt.locked_until || null,
      wasLocked: !!attempt.locked_until
    }, req);
    
    await commit();
    
    logger.info('用户账户解锁/清除失败记录成功', {
      userId: user.id,
      phone: user.phone,
      failedCount: attempt.failed_count || 0,
      wasLocked: !!attempt.locked_until
    });
    
    res.json({ 
      success: true, 
      message: attempt.locked_until ? 'User unlocked successfully' : 'Login failure records cleared successfully',
      hadRecords: true,
      wasLocked: !!attempt.locked_until
    });
  } catch (error) {
    await rollback();
    logger.error('解锁/清除用户失败记录失败', { error: error.message, phone });
    res.status(500).json({ success: false, message: error.message || 'Failed to unlock/clear user records' });
  }
});

router.get('/users', async (req, res) => {
  try {
    const users = await allAsync(`
      SELECT u.*, COUNT(o.id) as order_count, SUM(o.final_amount) as total_spent
      FROM users u
      LEFT JOIN orders o ON u.id = o.user_id
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `);

    // 为每个用户添加锁定状态信息
    const usersWithLockStatus = await Promise.all(users.map(async (user) => {
      const attempt = await getAsync(
        'SELECT * FROM user_login_attempts WHERE phone = ?',
        [user.phone]
      );

      const now = new Date();
      let securityInfo = {
        isLocked: false,
        lockedUntil: null,
        remainingTime: null,
        failedCount: attempt ? (attempt.failed_count || 0) : 0,
        firstAttemptAt: attempt ? attempt.first_attempt_at : null,
        lastAttemptAt: attempt ? attempt.last_attempt_at : null
      };

      if (attempt && attempt.locked_until) {
        const lockedUntil = new Date(attempt.locked_until.replace(' ', 'T'));
        
        if (now < lockedUntil) {
          // 仍在锁定期间
          const remainingMs = lockedUntil.getTime() - now.getTime();
          const remainingMinutes = Math.ceil(remainingMs / (60 * 1000));
          const remainingHours = Math.floor(remainingMinutes / 60);
          const remainingMins = remainingMinutes % 60;
          
          let lockoutMessage = '';
          if (remainingHours > 0) {
            lockoutMessage = `${remainingHours}h ${remainingMins}m`;
          } else {
            lockoutMessage = `${remainingMinutes}m`;
          }
          
          securityInfo.isLocked = true;
          securityInfo.lockedUntil = attempt.locked_until;
          securityInfo.remainingTime = lockoutMessage;
        }
      }

      return {
        ...user,
        ...securityInfo
      };
    }));

    res.json({ success: true, users: usersWithLockStatus });
  } catch (error) {
    logger.error('获取用户列表失败', { error: error.message });
    res.status(500).json({ success: false, message: '获取用户列表失败' });
  }
});

// ==================== IP锁定管理 ====================

/**
 * GET /api/admin/security/blocked-ips
 * Get list of blocked IP addresses
 * @returns {Object} List of blocked IPs with details
 */
router.get('/security/blocked-ips', async (req, res) => {
  try {
    const now = new Date();
    
    // 获取所有有blocked_until的IP记录
    const blockedIps = await allAsync(`
      SELECT * FROM ip_login_attempts 
      WHERE blocked_until IS NOT NULL 
      AND blocked_until > datetime('now', 'localtime')
      ORDER BY blocked_until DESC
    `);
    
    // 获取所有有失败记录但未锁定的IP（用于显示警告）
    const warningIps = await allAsync(`
      SELECT * FROM ip_login_attempts 
      WHERE (blocked_until IS NULL OR blocked_until <= datetime('now', 'localtime'))
      AND failed_count > 0
      ORDER BY failed_count DESC, last_attempt_at DESC
    `);
    
    const blockedIpsWithDetails = blockedIps.map(ip => {
      const blockedUntil = new Date(ip.blocked_until.replace(' ', 'T'));
      const remainingMs = blockedUntil.getTime() - now.getTime();
      const remainingMinutes = Math.ceil(remainingMs / (60 * 1000));
      const remainingHours = Math.floor(remainingMinutes / 60);
      const remainingMins = remainingMinutes % 60;
      
      let remainingTime = '';
      if (remainingHours > 0) {
        remainingTime = `${remainingHours}h ${remainingMins}m`;
      } else {
        remainingTime = `${remainingMinutes}m`;
      }
      
      return {
        ipAddress: ip.ip_address,
        failedCount: ip.failed_count || 0,
        blockedUntil: ip.blocked_until,
        remainingTime: remainingTime,
        remainingMs: remainingMs,
        firstAttemptAt: ip.first_attempt_at,
        lastAttemptAt: ip.last_attempt_at
      };
    });
    
    const warningIpsWithDetails = warningIps.map(ip => {
      return {
        ipAddress: ip.ip_address,
        failedCount: ip.failed_count || 0,
        blockedUntil: null,
        remainingTime: null,
        remainingMs: 0,
        firstAttemptAt: ip.first_attempt_at,
        lastAttemptAt: ip.last_attempt_at
      };
    });
    
    res.json({ 
      success: true, 
      blockedIps: blockedIpsWithDetails,
      warningIps: warningIpsWithDetails
    });
  } catch (error) {
    logger.error('获取被锁定IP列表失败', { error: error.message });
    res.status(500).json({ success: false, message: '获取被锁定IP列表失败' });
  }
});

/**
 * POST /api/admin/security/blocked-ips/:ip/unlock
 * Unlock a blocked IP address
 * @param {string} ip - IP address
 * @returns {Object} Success message
 */
router.post('/security/blocked-ips/:ip/unlock', async (req, res) => {
  const { ip } = req.params;
  
  try {
    // 检查IP是否存在
    const attempt = await getAsync(
      'SELECT * FROM ip_login_attempts WHERE ip_address = ?',
      [ip]
    );
    
    if (!attempt) {
      return res.status(404).json({ success: false, message: 'IP address not found' });
    }
    
    await beginTransaction();
    
    // 清除IP锁定记录（包括blocked_until和failed_count）
    await runAsync(
      'DELETE FROM ip_login_attempts WHERE ip_address = ?',
      [ip]
    );
    
    // 记录操作日志
    await logAction(req.session.adminId, 'UNLOCK_IP', 'system', null, {
      ipAddress: ip,
      failedCount: attempt.failed_count || 0,
      blockedUntil: attempt.blocked_until || null
    }, req);
    
    await commit();
    
    logger.info('IP地址解锁成功', {
      ip: ip,
      failedCount: attempt.failed_count || 0
    });
    
    res.json({ 
      success: true, 
      message: 'IP address unlocked successfully'
    });
  } catch (error) {
    await rollback();
    logger.error('解锁IP失败', { error: error.message, ip });
    res.status(500).json({ success: false, message: error.message || 'Failed to unlock IP address' });
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
    
    // 为每个管理员添加锁定状态信息
    const adminsWithLockStatus = await Promise.all(admins.map(async (admin) => {
      const attempt = await getAsync(
        'SELECT * FROM admin_login_attempts WHERE username = ?',
        [admin.username]
      );

      const now = new Date();
      let securityInfo = {
        isLocked: false,
        lockedUntil: null,
        remainingTime: null,
        failedCount: attempt ? (attempt.failed_count || 0) : 0,
        firstAttemptAt: attempt ? attempt.first_attempt_at : null,
        lastAttemptAt: attempt ? attempt.last_attempt_at : null
      };

      if (attempt && attempt.locked_until) {
        const lockedUntil = new Date(attempt.locked_until.replace(' ', 'T'));
        
        if (now < lockedUntil) {
          // 仍在锁定期间
          const remainingMs = lockedUntil.getTime() - now.getTime();
          const remainingMinutes = Math.ceil(remainingMs / (60 * 1000));
          const remainingHours = Math.floor(remainingMinutes / 60);
          const remainingMins = remainingMinutes % 60;
          
          let lockoutMessage = '';
          if (remainingHours > 0) {
            lockoutMessage = `${remainingHours}h ${remainingMins}m`;
          } else {
            lockoutMessage = `${remainingMinutes}m`;
          }
          
          securityInfo.isLocked = true;
          securityInfo.lockedUntil = attempt.locked_until;
          securityInfo.remainingTime = lockoutMessage;
        }
      }

      return {
        ...admin,
        ...securityInfo
      };
    }));
    
    res.json({ success: true, admins: adminsWithLockStatus });
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

/**
 * POST /api/admin/admins/:username/unlock
 * Unlock an admin account and clear login failure records
 * @param {string} username - Admin username
 * @returns {Object} Success message
 */
router.post('/admins/:username/unlock', requireSuperAdmin, async (req, res) => {
  const { username } = req.params;
  
  try {
    // 检查管理员是否存在
    const admin = await getAsync('SELECT * FROM admins WHERE username = ?', [username]);
    if (!admin) {
      return res.status(404).json({ success: false, message: 'Admin not found' });
    }
    
    // 检查是否有失败记录（包括锁定和未锁定的）
    const attempt = await getAsync(
      'SELECT * FROM admin_login_attempts WHERE username = ?',
      [username]
    );
    
    if (!attempt) {
      return res.json({ 
        success: true, 
        message: 'No login failure records found',
        hadRecords: false
      });
    }
    
    await beginTransaction();
    
    // 清除所有失败记录（包括锁定状态和失败计数）
    await runAsync(
      'DELETE FROM admin_login_attempts WHERE username = ?',
      [username]
    );
    
    // 如果管理员状态是inactive（由于锁定），自动激活
    if (admin.status === 'inactive') {
      await runAsync(
        'UPDATE admins SET status = ? WHERE username = ?',
        ['active', username]
      );
    }
    
    // 记录操作日志
    await logAction(req.session.adminId, 'UNLOCK_ADMIN', 'admin', admin.id, {
      username: admin.username,
      name: admin.name,
      failedCount: attempt.failed_count || 0,
      lockedUntil: attempt.locked_until || null,
      wasLocked: !!attempt.locked_until,
      wasInactive: admin.status === 'inactive'
    }, req);
    
    await commit();
    
    logger.info('管理员账户解锁/清除失败记录成功', {
      adminId: admin.id,
      username: admin.username,
      failedCount: attempt.failed_count || 0,
      wasLocked: !!attempt.locked_until,
      wasInactive: admin.status === 'inactive'
    });
    
    res.json({ 
      success: true, 
      message: attempt.locked_until ? 'Admin unlocked and activated successfully' : 'Login failure records cleared successfully',
      hadRecords: true,
      wasLocked: !!attempt.locked_until,
      wasInactive: admin.status === 'inactive'
    });
  } catch (error) {
    await rollback();
    logger.error('解锁/清除管理员失败记录失败', { error: error.message, username });
    res.status(500).json({ success: false, message: error.message || 'Failed to unlock/clear admin records' });
  }
});

// ==================== 日志查询 ====================

// 获取操作日志
router.get('/logs', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 30,  // 默认每页30条
      action, 
      admin_id,
      target_type,
      ip_address,
      operator,
      details,     // Details字段模糊匹配
      start_date,  // 开始日期（YYYY-MM-DD格式）
      end_date,    // 结束日期（YYYY-MM-DD格式）
      days = 3     // 如果没有指定日期范围，默认显示最近3天
    } = req.query;
    const offset = (page - 1) * limit;

    let sql = `
      SELECT l.*, a.username as admin_username 
      FROM logs l 
      LEFT JOIN admins a ON l.admin_id = a.id 
      WHERE 1=1
    `;
    const params = [];

    // 日期范围过滤（优先使用start_date和end_date，否则使用days）
    if (start_date && end_date) {
      // 使用指定的日期范围
      sql += ' AND l.created_at >= ? AND l.created_at <= ?';
      params.push(`${start_date} 00:00:00`, `${end_date} 23:59:59`);
    } else if (start_date) {
      // 只有开始日期
      sql += ' AND l.created_at >= ?';
      params.push(`${start_date} 00:00:00`);
    } else if (end_date) {
      // 只有结束日期
      sql += ' AND l.created_at <= ?';
      params.push(`${end_date} 23:59:59`);
    } else if (days) {
      // 使用days参数（向后兼容）
      const daysInt = parseInt(days);
      if (daysInt > 0) {
        const dateStr = `datetime('now', '-${daysInt} days', 'localtime')`;
        sql += ` AND l.created_at >= ${dateStr}`;
      }
    }

    // 操作类型过滤
    if (action) {
      sql += ' AND l.action = ?';
      params.push(action);
    }

    // 管理员ID过滤
    if (admin_id) {
      sql += ' AND l.admin_id = ?';
      params.push(admin_id);
    }

    // 资源类型过滤
    if (target_type) {
      sql += ' AND l.target_type = ?';
      params.push(target_type);
    }

    // IP地址过滤（支持部分匹配）
    if (ip_address) {
      sql += ' AND l.ip_address LIKE ?';
      params.push(`%${ip_address}%`);
    }

    // 操作者过滤（通过用户名，支持System关键字）
    if (operator) {
      if (operator.toLowerCase() === 'system') {
        sql += ' AND l.action = ?';
        params.push('USER_LOGIN');
      } else {
        sql += ' AND a.username LIKE ?';
        params.push(`%${operator}%`);
      }
    }

    // Details字段模糊匹配
    if (details) {
      sql += ' AND l.details LIKE ?';
      params.push(`%${details}%`);
    }

    sql += ' ORDER BY l.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const logs = await allAsync(sql, params);

    // 获取总数
    let countSql = `
      SELECT COUNT(*) as total 
      FROM logs l 
      LEFT JOIN admins a ON l.admin_id = a.id 
      WHERE 1=1
    `;
    const countParams = [];
    
    // 应用相同的过滤条件（日期范围）
    if (start_date && end_date) {
      countSql += ' AND l.created_at >= ? AND l.created_at <= ?';
      countParams.push(`${start_date} 00:00:00`, `${end_date} 23:59:59`);
    } else if (start_date) {
      countSql += ' AND l.created_at >= ?';
      countParams.push(`${start_date} 00:00:00`);
    } else if (end_date) {
      countSql += ' AND l.created_at <= ?';
      countParams.push(`${end_date} 23:59:59`);
    } else if (days) {
      const daysInt = parseInt(days);
      if (daysInt > 0) {
        const dateStr = `datetime('now', '-${daysInt} days', 'localtime')`;
        countSql += ` AND l.created_at >= ${dateStr}`;
      }
    }
    if (action) {
      countSql += ' AND l.action = ?';
      countParams.push(action);
    }
    if (admin_id) {
      countSql += ' AND l.admin_id = ?';
      countParams.push(admin_id);
    }
    if (target_type) {
      countSql += ' AND l.target_type = ?';
      countParams.push(target_type);
    }
    if (ip_address) {
      countSql += ' AND l.ip_address LIKE ?';
      countParams.push(`%${ip_address}%`);
    }
    if (operator) {
      if (operator.toLowerCase() === 'system') {
        countSql += ' AND l.action = ?';
        countParams.push('USER_LOGIN');
      } else {
        countSql += ' AND a.username LIKE ?';
        countParams.push(`%${operator}%`);
      }
    }

    // Details字段模糊匹配（计数查询）
    if (details) {
      countSql += ' AND l.details LIKE ?';
      countParams.push(`%${details}%`);
    }

    const { total } = await getAsync(countSql, countParams);

    res.json({ 
      success: true, 
      logs, 
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    logger.error('获取日志失败', { error: error.message });
    res.status(500).json({ success: false, message: '获取日志失败' });
  }
});

// 获取日志过滤器选项（用于下拉菜单）
router.get('/logs/filter-options', async (req, res) => {
  try {
    // 获取所有唯一的操作类型
    const actionTypes = await allAsync(`
      SELECT DISTINCT action 
      FROM logs 
      WHERE action IS NOT NULL AND action != ''
      ORDER BY action
    `);
    
    // 获取所有唯一的资源类型
    const resourceTypes = await allAsync(`
      SELECT DISTINCT target_type 
      FROM logs 
      WHERE target_type IS NOT NULL AND target_type != ''
      ORDER BY target_type
    `);
    
    // 获取所有唯一的操作者（管理员用户名）
    const operators = await allAsync(`
      SELECT DISTINCT a.username 
      FROM logs l
      LEFT JOIN admins a ON l.admin_id = a.id
      WHERE a.username IS NOT NULL AND a.username != ''
      ORDER BY a.username
    `);
    
    res.json({
      success: true,
      options: {
        actions: actionTypes.map(row => row.action),
        resourceTypes: resourceTypes.map(row => row.target_type),
        operators: operators.map(row => row.username)
      }
    });
  } catch (error) {
    logger.error('获取日志过滤器选项失败', { error: error.message });
    res.status(500).json({ success: false, message: '获取过滤器选项失败' });
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

// ==================== 文件管理 ====================
// 注意：这些接口只有super_admin可以访问

// 获取项目根目录路径（安全限制：只允许访问项目目录）
function getProjectRoot() {
  const projectRoot = fs.existsSync('/data') ? '/data' : path.join(__dirname, '..');
  return path.resolve(projectRoot);
}

// 验证路径是否在项目目录内（防止路径遍历攻击）
function isPathSafe(filePath, basePath) {
  const resolvedPath = path.resolve(filePath);
  const resolvedBase = path.resolve(basePath);
  return resolvedPath.startsWith(resolvedBase);
}

// 列出目录内容
router.get('/developer/files/list', requireSuperAdmin, async (req, res) => {
  try {
    const { path: dirPath = '' } = req.query;
    const projectRoot = getProjectRoot();
    const fullPath = dirPath ? path.join(projectRoot, dirPath) : projectRoot;
    
    // 验证路径安全性
    if (!isPathSafe(fullPath, projectRoot)) {
      return res.status(403).json({ success: false, message: 'Access denied: Path outside project directory' });
    }
    
    // 检查路径是否存在
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ success: false, message: 'Directory not found' });
    }
    
    // 检查是否为目录
    const stats = fs.statSync(fullPath);
    if (!stats.isDirectory()) {
      return res.status(400).json({ success: false, message: 'Path is not a directory' });
    }
    
    // 读取目录内容
    const items = fs.readdirSync(fullPath).map(item => {
      const itemPath = path.join(fullPath, item);
      const itemStats = fs.statSync(itemPath);
      const relativePath = dirPath ? path.join(dirPath, item) : item;
      
      return {
        name: item,
        path: relativePath,
        isDirectory: itemStats.isDirectory(),
        size: itemStats.isFile() ? itemStats.size : 0,
        modified: itemStats.mtime.toISOString(),
        permissions: itemStats.mode.toString(8).slice(-3)
      };
    });
    
    // 排序：目录在前，然后按名称排序
    items.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) {
        return a.isDirectory ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
    
    res.json({ 
      success: true, 
      path: dirPath || '/',
      items 
    });
  } catch (error) {
    logger.error('列出目录失败', { error: error.message, path: req.query.path });
    res.status(500).json({ success: false, message: 'Failed to list directory: ' + error.message });
  }
});

// 读取文件内容
router.get('/developer/files/read', requireSuperAdmin, async (req, res) => {
  try {
    const { path: filePath } = req.query;
    if (!filePath) {
      return res.status(400).json({ success: false, message: 'File path is required' });
    }
    
    const projectRoot = getProjectRoot();
    const fullPath = path.join(projectRoot, filePath);
    
    // 验证路径安全性
    if (!isPathSafe(fullPath, projectRoot)) {
      return res.status(403).json({ success: false, message: 'Access denied: Path outside project directory' });
    }
    
    // 检查文件是否存在
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ success: false, message: 'File not found' });
    }
    
    // 检查是否为文件
    const stats = fs.statSync(fullPath);
    if (!stats.isFile()) {
      return res.status(400).json({ success: false, message: 'Path is not a file' });
    }
    
    // 检查文件大小（限制为10MB）
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (stats.size > maxSize) {
      return res.status(400).json({ success: false, message: 'File too large (max 10MB)' });
    }
    
    // 读取文件内容
    const content = fs.readFileSync(fullPath, 'utf8');
    
    // 判断文件类型
    const ext = path.extname(filePath).toLowerCase();
    const textExtensions = ['.txt', '.js', '.json', '.md', '.log', '.css', '.html', '.xml', '.yaml', '.yml', '.env', '.sh', '.sql', '.py', '.java', '.cpp', '.c', '.h', '.ts', '.tsx', '.jsx', '.vue', '.php', '.rb', '.go', '.rs', '.swift', '.kt'];
    const isTextFile = textExtensions.includes(ext) || stats.size < 1024 * 1024; // 小于1MB的文件也尝试作为文本
    
    res.json({ 
      success: true, 
      path: filePath,
      content: isTextFile ? content : null,
      isTextFile,
      size: stats.size,
      encoding: isTextFile ? 'utf8' : 'binary',
      modified: stats.mtime.toISOString()
    });
  } catch (error) {
    logger.error('读取文件失败', { error: error.message, path: req.query.path });
    res.status(500).json({ success: false, message: 'Failed to read file: ' + error.message });
  }
});

// 写入文件内容
router.post('/developer/files/write', requireSuperAdmin, async (req, res) => {
  try {
    const { path: filePath, content } = req.body;
    if (!filePath) {
      return res.status(400).json({ success: false, message: 'File path is required' });
    }
    
    const projectRoot = getProjectRoot();
    const fullPath = path.join(projectRoot, filePath);
    
    // 验证路径安全性
    if (!isPathSafe(fullPath, projectRoot)) {
      return res.status(403).json({ success: false, message: 'Access denied: Path outside project directory' });
    }
    
    // 确保目录存在
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // 写入文件
    fs.writeFileSync(fullPath, content || '', 'utf8');
    
    await logAction(req.session.adminId, 'UPDATE', 'file', filePath, JSON.stringify({
      action: '文件编辑',
      path: filePath
    }), req);
    
    res.json({ success: true, message: 'File saved successfully' });
  } catch (error) {
    logger.error('写入文件失败', { error: error.message, path: req.body.path });
    res.status(500).json({ success: false, message: 'Failed to write file: ' + error.message });
  }
});

// 删除文件或目录
router.delete('/developer/files', requireSuperAdmin, async (req, res) => {
  try {
    const { path: filePath } = req.query;
    if (!filePath) {
      return res.status(400).json({ success: false, message: 'File path is required' });
    }
    
    const projectRoot = getProjectRoot();
    const fullPath = path.join(projectRoot, filePath);
    
    // 验证路径安全性
    if (!isPathSafe(fullPath, projectRoot)) {
      return res.status(403).json({ success: false, message: 'Access denied: Path outside project directory' });
    }
    
    // 检查路径是否存在
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ success: false, message: 'File or directory not found' });
    }
    
    // 防止删除关键目录
    const criticalDirs = ['db', 'node_modules', '.git'];
    const pathParts = filePath.split(path.sep);
    if (criticalDirs.some(dir => pathParts.includes(dir))) {
      return res.status(403).json({ success: false, message: 'Cannot delete critical directories' });
    }
    
    // 删除文件或目录
    const stats = fs.statSync(fullPath);
    if (stats.isDirectory()) {
      fs.rmSync(fullPath, { recursive: true, force: true });
    } else {
      fs.unlinkSync(fullPath);
    }
    
    await logAction(req.session.adminId, 'DELETE', 'file', filePath, JSON.stringify({
      action: '删除文件/目录',
      path: filePath,
      isDirectory: stats.isDirectory()
    }), req);
    
    res.json({ success: true, message: 'File or directory deleted successfully' });
  } catch (error) {
    logger.error('删除文件失败', { error: error.message, path: req.query.path });
    res.status(500).json({ success: false, message: 'Failed to delete file: ' + error.message });
  }
});

// 创建目录
router.post('/developer/files/mkdir', requireSuperAdmin, async (req, res) => {
  try {
    const { path: dirPath } = req.body;
    if (!dirPath) {
      return res.status(400).json({ success: false, message: 'Directory path is required' });
    }
    
    const projectRoot = getProjectRoot();
    const fullPath = path.join(projectRoot, dirPath);
    
    // 验证路径安全性
    if (!isPathSafe(fullPath, projectRoot)) {
      return res.status(403).json({ success: false, message: 'Access denied: Path outside project directory' });
    }
    
    // 创建目录
    if (fs.existsSync(fullPath)) {
      return res.status(400).json({ success: false, message: 'Directory already exists' });
    }
    
    fs.mkdirSync(fullPath, { recursive: true });
    
    await logAction(req.session.adminId, 'CREATE', 'file', dirPath, JSON.stringify({
      action: '创建目录',
      path: dirPath
    }), req);
    
    res.json({ success: true, message: 'Directory created successfully' });
  } catch (error) {
    logger.error('创建目录失败', { error: error.message, path: req.body.path });
    res.status(500).json({ success: false, message: 'Failed to create directory: ' + error.message });
  }
});

// 上传文件
const tempDir = path.join(__dirname, '..', 'temp');
// 确保temp目录存在
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}
const fileManagerUpload = multer({
  dest: tempDir,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

router.post('/developer/files/upload', requireSuperAdmin, fileManagerUpload.single('file'), async (req, res) => {
  try {
    const { path: targetPath } = req.body;
    if (!targetPath || !req.file) {
      return res.status(400).json({ success: false, message: 'File path and file are required' });
    }
    
    const projectRoot = getProjectRoot();
    const fullPath = path.join(projectRoot, targetPath);
    
    // 验证路径安全性
    if (!isPathSafe(fullPath, projectRoot)) {
      // 清理临时文件
      if (req.file && req.file.path) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(403).json({ success: false, message: 'Access denied: Path outside project directory' });
    }
    
    // 确保目录存在
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // 移动文件到目标位置
    fs.renameSync(req.file.path, fullPath);
    
    await logAction(req.session.adminId, 'CREATE', 'file', targetPath, JSON.stringify({
      action: '上传文件',
      path: targetPath,
      size: req.file.size
    }), req);
    
    res.json({ success: true, message: 'File uploaded successfully' });
  } catch (error) {
    // 清理临时文件
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    logger.error('上传文件失败', { error: error.message, path: req.body.path });
    res.status(500).json({ success: false, message: 'Failed to upload file: ' + error.message });
  }
});

// 获取文件的MIME类型
function getMimeType(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  const mimeTypes = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
    '.ico': 'image/x-icon',
    '.pdf': 'application/pdf',
    '.zip': 'application/zip',
    '.json': 'application/json',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.html': 'text/html',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.xml': 'application/xml'
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

// 下载文件
router.get('/developer/files/download', requireSuperAdmin, async (req, res) => {
  try {
    const { path: filePath, preview } = req.query;
    if (!filePath) {
      return res.status(400).json({ success: false, message: 'File path is required' });
    }
    
    const projectRoot = getProjectRoot();
    const fullPath = path.join(projectRoot, filePath);
    
    // 验证路径安全性
    if (!isPathSafe(fullPath, projectRoot)) {
      return res.status(403).json({ success: false, message: 'Access denied: Path outside project directory' });
    }
    
    // 检查文件是否存在
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ success: false, message: 'File not found' });
    }
    
    // 检查是否为文件
    const stats = fs.statSync(fullPath);
    if (!stats.isFile()) {
      return res.status(400).json({ success: false, message: 'Path is not a file' });
    }
    
    // 设置Content-Type
    const mimeType = getMimeType(filePath);
    res.setHeader('Content-Type', mimeType);
    
    // 如果是预览模式（用于图片显示），不设置Content-Disposition
    // 否则设置为下载
    if (preview !== 'true') {
      const fileName = path.basename(filePath);
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
    }
    
    // 发送文件
    const fileStream = fs.createReadStream(fullPath);
    fileStream.pipe(res);
  } catch (error) {
    logger.error('下载文件失败', { error: error.message, path: req.query.path });
    res.status(500).json({ success: false, message: 'Failed to download file: ' + error.message });
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

// ==================== 产品和分类备份/导入 ====================

/**
 * POST /api/admin/menu/backup
 * 备份产品和分类数据（包括图片）
 */
router.post('/menu/backup', async (req, res) => {
  try {
    const { BACKUP_DIR } = require('../utils/backup');
    const exportDir = path.join(DATA_DIR, 'logs', 'export');
    if (!fs.existsSync(exportDir)) {
      fs.mkdirSync(exportDir, { recursive: true });
    }
    
    // 获取所有分类
    const categories = await allAsync('SELECT * FROM categories ORDER BY sort_order, id');
    
    // 获取所有产品
    const products = await allAsync('SELECT * FROM products ORDER BY category_id, sort_order, id');
    
    // 收集所有图片路径
    const imagePaths = new Set();
    products.forEach(product => {
      if (product.image_url) {
        const imagePath = product.image_url.startsWith('/') 
          ? path.join(DATA_DIR, product.image_url.substring(1))
          : path.join(DATA_DIR, product.image_url);
        if (fs.existsSync(imagePath)) {
          imagePaths.add(product.image_url);
        }
      }
    });
    
    // 创建备份数据对象
    // 注意：categories保留id用于导入时的ID映射，products移除id因为会重新生成
    const backupData = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      categories: categories, // 保留id用于导入时的ID映射
      products: products.map(p => {
        // 使用解构和rest操作符，确保所有字段都被备份（除了id和时间戳）
        const { id, created_at, updated_at, ...rest } = p;
        // 确保所有JSON字段都是字符串格式（如果数据库返回的是对象，转换为字符串）
        const productBackup = { ...rest };
        
        // 确保JSON字段以字符串形式保存（即使值为null或空字符串也要保留）
        // sizes
        if (productBackup.sizes !== undefined && productBackup.sizes !== null) {
          productBackup.sizes = typeof productBackup.sizes === 'string' ? productBackup.sizes : JSON.stringify(productBackup.sizes);
        } else {
          productBackup.sizes = '{}';
        }
        // sugar_levels
        if (productBackup.sugar_levels !== undefined && productBackup.sugar_levels !== null) {
          productBackup.sugar_levels = typeof productBackup.sugar_levels === 'string' ? productBackup.sugar_levels : JSON.stringify(productBackup.sugar_levels);
        } else {
          productBackup.sugar_levels = '["0","30","50","70","100"]';
        }
        // available_toppings - 重要：确保正确备份
        if (productBackup.available_toppings !== undefined && productBackup.available_toppings !== null) {
          if (typeof productBackup.available_toppings === 'string') {
            // 已经是字符串，直接保留（包括空字符串）
            productBackup.available_toppings = productBackup.available_toppings;
          } else {
            // 是数组或其他类型，转换为JSON字符串
            productBackup.available_toppings = JSON.stringify(productBackup.available_toppings);
          }
        } else {
          productBackup.available_toppings = '[]';
        }
        // ice_options
        if (productBackup.ice_options !== undefined && productBackup.ice_options !== null) {
          productBackup.ice_options = typeof productBackup.ice_options === 'string' ? productBackup.ice_options : JSON.stringify(productBackup.ice_options);
        } else {
          productBackup.ice_options = '["normal","less","no","room","hot"]';
        }
        
        return productBackup;
      })
    };
    
    // 记录备份数据内容用于调试
    logger.info('创建菜单备份', {
      categoriesCount: categories.length,
      productsCount: products.length,
      categories: categories.map(c => ({ id: c.id, name: c.name, status: c.status })),
      sampleProducts: products.slice(0, 3).map(p => {
        // 检查所有字段是否存在
        const productFields = {
          name: p.name,
          category_id: p.category_id,
          description: p.description,
          price: p.price,
          image_url: p.image_url,
          status: p.status,
          sort_order: p.sort_order,
          sizes: p.sizes,
          sugar_levels: p.sugar_levels,
          available_toppings: p.available_toppings,
          ice_options: p.ice_options
        };
        logger.info('备份产品字段检查', { product: p.name, fields: productFields, allKeys: Object.keys(p) });
        return productFields;
      })
    });
    
    // 生成备份文件名
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const backupFileName = `menu-backup-${timestamp}.zip`;
    const backupPath = path.join(exportDir, backupFileName);
    
    // 创建ZIP文件
    const output = fs.createWriteStream(backupPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    
    return new Promise((resolve, reject) => {
      output.on('close', async () => {
        const stats = fs.statSync(backupPath);
        const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
        
        await logAction(req.session.adminId, 'BACKUP_CREATE', 'menu', null, JSON.stringify({
          action: '备份菜单数据',
          fileName: backupFileName,
          sizeMB: sizeMB,
          categories: categories.length,
          products: products.length,
          images: imagePaths.size
        }), req);
        
        res.json({
          success: true,
          fileName: backupFileName,
          sizeMB: parseFloat(sizeMB),
          categories: categories.length,
          products: products.length,
          images: imagePaths.size,
          message: 'Menu backup created successfully'
        });
        resolve();
      });
      
      archive.on('error', (err) => {
        logger.error('创建菜单备份失败', { error: err.message });
        res.status(500).json({
          success: false,
          message: 'Failed to create menu backup: ' + err.message
        });
        reject(err);
      });
      
      archive.pipe(output);
      
      // 添加JSON数据
      archive.append(JSON.stringify(backupData, null, 2), { name: 'data.json' });
      
      // 添加图片文件
      imagePaths.forEach(imageUrl => {
        const imagePath = imageUrl.startsWith('/') 
          ? path.join(DATA_DIR, imageUrl.substring(1))
          : path.join(DATA_DIR, imageUrl);
        if (fs.existsSync(imagePath)) {
          const fileName = path.basename(imagePath);
          archive.file(imagePath, { name: `images/${fileName}` });
        }
      });
      
      archive.finalize();
    });
  } catch (error) {
    logger.error('创建菜单备份失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to create menu backup: ' + error.message
    });
  }
});

/**
 * POST /api/admin/menu/import
 * 导入产品和分类数据（从ZIP文件）
 */
const menuImportUpload = multer({
  dest: path.join(__dirname, '..', 'temp'),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/zip' || file.originalname.endsWith('.zip')) {
      cb(null, true);
    } else {
      cb(new Error('Only .zip backup files are allowed'));
    }
  }
});

router.post('/menu/import', menuImportUpload.single('backupFile'), async (req, res) => {
  let tempFilePath = null;
  
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Backup file is required'
      });
    }
    
    // 获取导入选项
    const clearExisting = req.body.clearExisting === 'true';
    
    tempFilePath = req.file.path;
    const zip = new AdmZip(tempFilePath);
    const zipEntries = zip.getEntries();
    
    // 查找data.json文件
    let dataEntry = null;
    for (const entry of zipEntries) {
      if (entry.entryName === 'data.json' || entry.entryName.endsWith('/data.json')) {
        dataEntry = entry;
        break;
      }
    }
    
    if (!dataEntry) {
      return res.status(400).json({
        success: false,
        message: 'Invalid backup file: data.json not found'
      });
    }
    
    // 解析备份数据
    const backupData = JSON.parse(dataEntry.getData().toString('utf8'));
    
      // 记录备份文件内容
      const sampleProduct = backupData.products?.[0];
      logger.info('备份文件内容检查', {
        categoriesCount: backupData.categories?.length || 0,
        productsCount: backupData.products?.length || 0,
        categories: backupData.categories?.map(c => ({ id: c.id, name: c.name })) || [],
        hasCategories: !!backupData.categories,
        hasProducts: !!backupData.products,
        sampleProduct: sampleProduct ? {
          name: sampleProduct.name,
          allKeys: Object.keys(sampleProduct),
          sizes: sampleProduct.sizes,
          sugar_levels: sampleProduct.sugar_levels,
          available_toppings: sampleProduct.available_toppings,
          ice_options: sampleProduct.ice_options,
          description: sampleProduct.description,
          price: sampleProduct.price,
          category_id: sampleProduct.category_id,
          image_url: sampleProduct.image_url,
          status: sampleProduct.status,
          sort_order: sampleProduct.sort_order
        } : null
      });
    
    if (!backupData.categories || !backupData.products) {
      return res.status(400).json({
        success: false,
        message: 'Invalid backup file: missing categories or products',
        backupDataKeys: Object.keys(backupData),
        categoriesCount: backupData.categories?.length || 0,
        productsCount: backupData.products?.length || 0
      });
    }
    
    // 如果选择清空现有数据，需要在事务开始前禁用外键约束
    let foreignKeysWasEnabled = true;
    if (clearExisting) {
      // 检查当前外键约束状态
      const fkResult = await getAsync('PRAGMA foreign_keys');
      foreignKeysWasEnabled = fkResult && fkResult.foreign_keys === 1;
      
      // 在事务开始前禁用外键约束（SQLite 要求在事务外设置）
      await runAsync('PRAGMA foreign_keys = OFF');
    }
    
    await beginTransaction();
    
    try {
      // 如果选择清空现有数据，先删除所有产品和分类
      if (clearExisting) {
        // 注意：不删除 order_items，保留历史订单记录
        // 即使产品被删除，order_items 中已保存了 product_name，可以正常显示
        
        // 1. 删除产品（引用categories）
        // 注意：外键约束已在事务开始前禁用
        await runAsync('DELETE FROM products');
        // 2. 删除分类
        await runAsync('DELETE FROM categories');
        
        // 注意：order_items 保留，因为：
        // - 订单是历史记录，不应该被删除
        // - order_items 中已保存了 product_name，即使 product_id 无效也能显示
        // - 外键约束已在事务开始前禁用，所以可以删除 products 而不影响 order_items
      }
      
      // 创建分类ID映射（旧ID -> 新ID）
      const categoryIdMap = new Map();
      
      // 导入分类
      for (const category of backupData.categories) {
        const { id: oldId, created_at, updated_at, ...categoryData } = category;
        
        // 检查分类是否已存在（按名称）
        const existing = await getAsync('SELECT id FROM categories WHERE name = ?', [categoryData.name]);
        
        if (existing) {
          // 更新现有分类（导入后统一设置为active）
          await runAsync(
            'UPDATE categories SET description = ?, sort_order = ?, status = ?, updated_at = datetime("now", "localtime") WHERE id = ?',
            [categoryData.description || '', categoryData.sort_order || 0, 'active', existing.id]
          );
          categoryIdMap.set(oldId, existing.id);
        } else {
          // 插入新分类（导入后统一设置为active）
          const result = await runAsync(
            'INSERT INTO categories (name, description, sort_order, status) VALUES (?, ?, ?, ?)',
            [categoryData.name, categoryData.description || '', categoryData.sort_order || 0, 'active']
          );
          // runAsync返回 { id: lastID, changes: changes }
          const newCategoryId = result.id;
          if (!newCategoryId) {
            logger.error('分类插入失败，未获取到ID', { categoryName: categoryData.name, result });
            throw new Error(`Failed to insert category: ${categoryData.name}`);
          }
          categoryIdMap.set(oldId, newCategoryId);
        }
      }
      
      // 验证分类导入结果
      const importedCategories = await allAsync('SELECT id, name, status FROM categories ORDER BY id');
      logger.info('分类导入完成', { 
        importedCount: importedCategories.length,
        categoryIdMapSize: categoryIdMap.size,
        backupCategoriesCount: backupData.categories.length,
        importedCategories: importedCategories,
        categoryIdMap: Array.from(categoryIdMap.entries()).map(([oldId, newId]) => ({ oldId, newId }))
      });
      
      // 导入产品
      const uploadDir = path.join(DATA_DIR, 'uploads/products');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      
      for (const product of backupData.products) {
        // 记录原始产品数据用于调试
        if (backupData.products.indexOf(product) < 3) {
          logger.info('导入产品原始数据', {
            productName: product.name,
            allKeys: Object.keys(product),
            sizes: product.sizes,
            sugar_levels: product.sugar_levels,
            available_toppings: product.available_toppings,
            ice_options: product.ice_options,
            available_toppings_type: typeof product.available_toppings,
            available_toppings_value: product.available_toppings
          });
        }
        
        // 提取字段，保留所有其他字段
        const { created_at, updated_at, category_id: oldCategoryId, image_url, ...productData } = product;
        
        // 映射分类ID
        let newCategoryId = null;
        if (oldCategoryId) {
          newCategoryId = categoryIdMap.get(oldCategoryId);
          if (newCategoryId === undefined) {
            // 如果分类ID映射失败，记录警告但继续导入（产品将没有分类）
            logger.warn('分类ID映射失败', { 
              oldCategoryId, 
              productName: productData.name,
              availableCategoryIds: Array.from(categoryIdMap.keys())
            });
            newCategoryId = null;
          }
        }
        
        // 处理图片
        let newImageUrl = null;
        if (image_url) {
          const imageFileName = path.basename(image_url);
          const imageEntry = zipEntries.find(e => 
            e.entryName === `images/${imageFileName}` || 
            e.entryName.endsWith(`/images/${imageFileName}`)
          );
          
          if (imageEntry) {
            // 生成新的文件名
            const ext = path.extname(imageFileName);
            const newFileName = `product-${Date.now()}-${uuidv4()}${ext}`;
            const newImagePath = path.join(uploadDir, newFileName);
            
            // 提取并保存图片
            fs.writeFileSync(newImagePath, imageEntry.getData());
            // 压缩导入的图片
            await compressProductImage(newImagePath);
            newImageUrl = `/uploads/products/${newFileName}`;
          }
        }
        
        // 检查产品是否已存在（按名称和分类）
        const existing = await getAsync(
          'SELECT id FROM products WHERE name = ? AND category_id = ?',
          [productData.name, newCategoryId]
        );
        
        // 确保可选参数正确保留（如果备份数据中有值就使用，否则使用默认值）
        // 注意：这些字段在数据库中存储为JSON字符串，需要确保正确保留
        let sizes = '{}';
        if (productData.sizes !== undefined && productData.sizes !== null) {
          // 如果是字符串（包括空字符串），直接使用；如果是对象，转换为JSON字符串
          if (typeof productData.sizes === 'string') {
            sizes = productData.sizes; // 保留原始字符串值
          } else {
            sizes = JSON.stringify(productData.sizes);
          }
        }
        
        let sugarLevels = '["0","30","50","70","100"]';
        if (productData.sugar_levels !== undefined && productData.sugar_levels !== null) {
          if (typeof productData.sugar_levels === 'string') {
            sugarLevels = productData.sugar_levels; // 保留原始字符串值
          } else {
            sugarLevels = JSON.stringify(productData.sugar_levels);
          }
        }
        
        let availableToppings = '[]';
        if (productData.available_toppings !== undefined && productData.available_toppings !== null) {
          // 如果是字符串（包括空字符串），直接使用；如果是数组，转换为JSON字符串
          if (typeof productData.available_toppings === 'string') {
            // 保留原始字符串值，即使是空字符串也要保留
            availableToppings = productData.available_toppings;
          } else if (Array.isArray(productData.available_toppings)) {
            // 如果是数组，转换为JSON字符串
            availableToppings = JSON.stringify(productData.available_toppings);
          } else {
            // 其他类型也尝试转换为JSON字符串
            availableToppings = JSON.stringify(productData.available_toppings);
          }
        }
        
        let iceOptions = '["normal","less","no","room","hot"]';
        if (productData.ice_options !== undefined && productData.ice_options !== null) {
          if (typeof productData.ice_options === 'string') {
            iceOptions = productData.ice_options; // 保留原始字符串值
          } else {
            iceOptions = JSON.stringify(productData.ice_options);
          }
        }
        
        // 记录处理后的值用于调试
        if (backupData.products.indexOf(product) < 3) {
          logger.info('导入产品处理后的值', {
            productName: productData.name,
            sizes,
            sugarLevels,
            availableToppings,
            iceOptions
          });
        }
        
        if (existing) {
          // 更新现有产品（导入后统一设置为active）
          await runAsync(
            `UPDATE products SET 
              description = ?, price = ?, image_url = ?, sort_order = ?, status = ?,
              sizes = ?, sugar_levels = ?, available_toppings = ?, ice_options = ?,
              updated_at = datetime("now", "localtime")
              WHERE id = ?`,
            [
              productData.description || '',
              productData.price,
              newImageUrl || productData.image_url,
              productData.sort_order || 0,
              'active', // 导入后统一设置为active
              sizes,
              sugarLevels,
              availableToppings,
              iceOptions,
              existing.id
            ]
          );
        } else {
          // 插入新产品（导入后统一设置为active）
          await runAsync(
            `INSERT INTO products 
              (name, description, price, category_id, image_url, sort_order, status, sizes, sugar_levels, available_toppings, ice_options)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              productData.name,
              productData.description || '',
              productData.price,
              newCategoryId,
              newImageUrl || productData.image_url,
              productData.sort_order || 0,
              'active', // 导入后统一设置为active
              sizes,
              sugarLevels,
              availableToppings,
              iceOptions
            ]
          );
        }
      }
      
      await commit();
      
      // 如果之前禁用了外键约束，现在重新启用
      if (clearExisting) {
        await runAsync('PRAGMA foreign_keys = ON');
      }
      
      // 清除缓存
      cache.delete('categories');
      cache.delete('products');
      
      // 最终验证
      const finalCategories = await allAsync('SELECT COUNT(*) as count FROM categories');
      const finalProducts = await allAsync('SELECT COUNT(*) as count FROM products');
      const finalCategoriesCount = finalCategories[0]?.count || 0;
      const finalProductsCount = finalProducts[0]?.count || 0;
      
      await logAction(req.session.adminId, 'BACKUP_RESTORE', 'menu', null, JSON.stringify({
        action: '导入菜单数据',
        clearExisting: clearExisting,
        backupCategories: backupData.categories.length,
        backupProducts: backupData.products.length,
        finalCategories: finalCategoriesCount,
        finalProducts: finalProductsCount
      }), req);
      
      res.json({
        success: true,
        message: clearExisting 
          ? 'Menu imported successfully (existing data cleared)' 
          : 'Menu imported successfully (existing data merged)',
        clearExisting: clearExisting,
        backupCategories: backupData.categories.length,
        backupProducts: backupData.products.length,
        finalCategories: finalCategoriesCount,
        finalProducts: finalProductsCount
      });
    } catch (error) {
      await rollback();
      
      // 如果之前禁用了外键约束，现在重新启用（即使发生错误也要恢复）
      if (clearExisting) {
        await runAsync('PRAGMA foreign_keys = ON').catch(() => {
          // 忽略恢复外键约束时的错误，确保继续执行
        });
      }
      
      throw error;
    }
  } catch (error) {
    logger.error('导入菜单失败', { error: error.message });
    
    // 确保外键约束被恢复（即使发生未捕获的错误）
    if (clearExisting) {
      await runAsync('PRAGMA foreign_keys = ON').catch(() => {
        // 忽略恢复外键约束时的错误
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Failed to import menu: ' + error.message
    });
  } finally {
    // 清理临时文件
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
  }
});

/**
 * GET /api/admin/menu/backup/download
 * Download menu backup file
 */
router.get('/menu/backup/download', async (req, res) => {
  try {
    const { fileName } = req.query;
    
    if (!fileName || !fileName.startsWith('menu-backup-') || !fileName.endsWith('.zip')) {
      return res.status(400).json({
        success: false,
        message: 'Invalid backup file name'
      });
    }
    
    const exportDir = path.join(DATA_DIR, 'logs', 'export');
    const backupPath = path.join(exportDir, fileName);
    
    if (!fs.existsSync(backupPath)) {
      return res.status(404).json({
        success: false,
        message: 'Backup file not found'
      });
    }
    
    res.download(backupPath, fileName);
  } catch (error) {
    logger.error('下载菜单备份文件失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to download backup file'
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

// ==================== 业务测试用例 API ====================

const { spawn } = require('child_process');

// 测试运行状态
let testRunState = {
  running: false,
  process: null,
  progress: { current: 0, total: 0, currentTest: '' },
  completed: false,
  logs: [], // 存储测试日志（带时间戳）
  selectedSuites: [] // 存储选中的测试套件，用于生成报告
};

// 获取时间戳格式化函数（统一使用）
function getLogTimestamp() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const milliseconds = String(now.getMilliseconds()).padStart(3, '0');
  return `${hours}:${minutes}:${seconds}.${milliseconds}`;
}

// 添加带时间戳的日志（辅助函数）
function addTimestampedLog(message, level = 'INFO') {
  const timestamp = getLogTimestamp();
  if (level === 'ERROR') {
    testRunState.logs.push(`[${timestamp}] [ERROR] ${message}`);
  } else if (level === 'WARN') {
    testRunState.logs.push(`[${timestamp}] [WARN] ${message}`);
  } else {
    testRunState.logs.push(`[${timestamp}] [INFO] ${message}`);
  }
  // 只保留最近1000行日志
  if (testRunState.logs.length > 1000) {
    testRunState.logs = testRunState.logs.slice(-1000);
  }
}

// 获取测试套件列表
router.get('/developer/test-suites', requireSuperAdmin, async (req, res) => {
  try {
    const testDir = path.join(__dirname, '..', 'tests');
    const suites = [];
    
    // 扫描测试文件
    const testFiles = [
      // Routes 测试
      { name: 'routes/admin.test.js', displayName: '管理员接口测试', path: 'tests/routes/admin.test.js' },
      { name: 'routes/auth.test.js', displayName: '认证接口测试', path: 'tests/routes/auth.test.js' },
      { name: 'routes/user.test.js', displayName: '用户接口测试', path: 'tests/routes/user.test.js' },
      { name: 'routes/public.test.js', displayName: '公开接口测试', path: 'tests/routes/public.test.js' },
      // Middleware 测试
      { name: 'middleware/auth.test.js', displayName: '认证中间件测试', path: 'tests/middleware/auth.test.js' },
      { name: 'middleware/monitoring.test.js', displayName: '监控中间件测试', path: 'tests/middleware/monitoring.test.js' },
      { name: 'middleware/validation.test.js', displayName: '验证中间件测试', path: 'tests/middleware/validation.test.js' },
      // Utils 测试
      { name: 'utils/order-helper.test.js', displayName: '订单辅助函数测试', path: 'tests/utils/order-helper.test.js' },
      { name: 'utils/cache.test.js', displayName: '缓存系统测试', path: 'tests/utils/cache.test.js' },
      { name: 'utils/cycle-helper.test.js', displayName: '周期辅助函数测试', path: 'tests/utils/cycle-helper.test.js' },
      { name: 'utils/health-check.test.js', displayName: '健康检查测试', path: 'tests/utils/health-check.test.js' },
      { name: 'utils/logger.test.js', displayName: '日志工具测试', path: 'tests/utils/logger.test.js' },
      // Database 测试
      { name: 'db/database.test.js', displayName: '数据库操作测试', path: 'tests/db/database.test.js' },
      // Integration 测试
      { name: 'integration/order-discount-cycle.test.js', displayName: '订单折扣周期集成测试', path: 'tests/integration/order-discount-cycle.test.js' },
      // Frontend 测试
      { name: 'frontend/ui.test.js', displayName: '前端UI组件测试', path: 'tests/frontend/ui.test.js' },
      { name: 'frontend/api.test.js', displayName: '前端API工具测试', path: 'tests/frontend/api.test.js' },
      { name: 'frontend/validation.test.js', displayName: '前端验证工具测试', path: 'tests/frontend/validation.test.js' },
      { name: 'frontend/error-handler.test.js', displayName: '前端错误处理测试', path: 'tests/frontend/error-handler.test.js' }
    ];
    
    // 统计每个测试文件的测试数量（简化版，实际可以从Jest获取）
    for (const file of testFiles) {
      const filePath = path.join(__dirname, '..', file.path);
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        const testCount = (content.match(/it\(|test\(/g) || []).length;
        suites.push({
          name: file.name,
          displayName: file.displayName,
          path: file.path,
          testCount: testCount
        });
      }
    }
    
    res.json({ success: true, suites });
  } catch (error) {
    logger.error('获取测试套件列表失败', { error: error.message });
    res.status(500).json({ success: false, message: 'Failed to get test suites' });
  }
});

// 运行测试
router.post('/developer/run-tests', requireSuperAdmin, async (req, res) => {
  try {
    if (testRunState.running) {
      return res.status(400).json({ success: false, message: 'Tests are already running' });
    }
    
    const { suites } = req.body;
    if (!suites || !Array.isArray(suites) || suites.length === 0) {
      return res.status(400).json({ success: false, message: 'Test suites are required' });
    }
    
    // 构建Jest命令
    const projectRoot = path.join(__dirname, '..');
    
    // 构建测试路径参数 - 使用testPathPattern匹配测试文件
    const testPatterns = suites.map(suite => {
      // 将 routes/admin.test.js 转换为 routes/admin 或 admin
      // 保持路径结构，例如：routes/admin.test.js -> routes/admin
      const pattern = suite.replace(/^tests\//, '').replace(/\.test\.js$/, '');
      return pattern;
    });
    
    // 使用jest直接运行，而不是npm test，以便更好地控制参数
    // 注意：--json会抑制大部分输出，所以我们不使用它，改用--verbose来获取实时输出
    // 测试完成后，我们会单独运行一次来生成JSON报告
    const jestArgs = [
      '--coverage',
      // 不使用--json，因为它会抑制实时输出
      // '--json',
      // '--outputFile=reports/test-results.json',
      '--forceExit', // 确保Jest在测试完成后退出
      '--verbose', // 启用详细输出，确保所有日志都被实时输出
      '--no-cache', // 禁用缓存，确保每次都是全新运行
      '--colors=false' // 禁用颜色输出，避免ANSI码干扰日志解析
    ];
    
    // 如果包含前端测试，需要移除默认配置中的testPathIgnorePatterns限制
    // 通过使用自定义配置或覆盖选项来实现
    const hasFrontendTests = suites.some(s => s.includes('frontend/'));
    if (hasFrontendTests) {
      // 使用前端配置运行所有测试（前端配置应该也能运行后端测试）
      // 或者分别运行，但为了简化，我们先尝试使用前端配置
      // 注意：前端配置使用jsdom环境，可能不适合后端测试
      // 更好的方法是修改默认配置，移除对前端测试的排除
      // 这里我们暂时注释掉，需要修改jest.config.js
    }
    
    // 构建Jest命令 - 使用单个testPathPattern，用正则表达式匹配多个文件
    // 格式: (pattern1|pattern2|pattern3)
    if (testPatterns.length > 0) {
      const combinedPattern = '(' + testPatterns.join('|') + ')';
      jestArgs.push('--testPathPattern', combinedPattern);
    }
    
    // 启动测试进程
    testRunState.running = true;
    testRunState.completed = false;
    testRunState.logs = []; // 清空之前的日志
    testRunState.selectedSuites = suites; // 保存选中的测试套件，用于生成报告
    testRunState.progress = { 
      current: 0, 
      total: 0, 
      currentTest: 'Starting tests...',
      currentSuite: ''
    };
    
    // 添加启动日志
    testRunState.logs.push(`[INFO] 开始运行测试套件: ${suites.join(', ')}`);
    // 构建显示用的命令字符串（用于日志）
    const commandStr = 'npx jest ' + jestArgs.map(arg => {
      // 如果参数包含空格或特殊字符，用引号包裹
      if (arg.includes(' ') || arg.includes('(') || arg.includes(')') || arg.includes('|')) {
        return `"${arg}"`;
      }
      return arg;
    }).join(' ');
    addTimestampedLog(`Jest命令: ${commandStr}`);
    
    logger.info('启动测试', { 
      suites, 
      patterns: testPatterns, 
      combinedPattern: testPatterns.length > 0 ? '(' + testPatterns.join('|') + ')' : 'all',
      args: jestArgs 
    });
    
    // 不使用shell: true，直接传递参数数组，避免shell解析特殊字符
    // 设置环境变量确保Jest实时输出（不缓冲）
    const jestProcess = spawn('npx', ['jest', ...jestArgs], {
      cwd: projectRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        FORCE_COLOR: '0', // 禁用颜色输出，避免ANSI码干扰
        CI: 'true' // 设置为CI模式，确保实时输出
      }
    });
    
    testRunState.process = jestProcess;
    
    let stdout = '';
    let stderr = '';
    
    // 解析Jest输出以获取进度
    let totalTests = 0;
    let completedTests = 0;
    let currentTestName = '';
    let lastProgressUpdate = Date.now();
    
    jestProcess.stdout.on('data', (data) => {
      const output = data.toString();
      stdout += output;
      
      // 存储日志（限制日志数量，避免内存溢出）
      // 在服务器端添加时间戳，确保每条日志都有准确的时间
      // 注意：保留所有非空行，包括格式化的输出
      const lines = output.split('\n');
      lines.forEach(line => {
        const trimmed = line.trim();
        // 保留所有有内容的行（包括只有空格的行，可能是格式化的输出）
        if (trimmed || line.length > 0) {
          const timestamp = getLogTimestamp();
          // 如果日志已经包含 [INFO] 或 [ERROR] 等前缀，在时间戳后添加
          if (trimmed.startsWith('[')) {
            testRunState.logs.push(`[${timestamp}] ${trimmed}`);
          } else if (trimmed) {
            testRunState.logs.push(`[${timestamp}] ${trimmed}`);
          } else {
            // 空行也记录，但使用时间戳
            testRunState.logs.push(`[${timestamp}]`);
          }
        }
      });
      
      // 只保留最近1000行日志
      if (testRunState.logs.length > 1000) {
        testRunState.logs = testRunState.logs.slice(-1000);
      }
      
      // 从文本输出中解析进度（Jest的--json输出在最后，我们需要从文本中解析）
      // Jest文本输出示例：
      // PASS tests/routes/admin.test.js
      //   Admin Routes
      //     ✓ should get all categories (123 ms)
      // 注意：lines已经在上面定义过了，直接使用
      for (const line of lines) {
        const trimmed = line.trim();
        
        // 检测测试用例完成（以✓或✗开头）
        if (trimmed.match(/^[✓✗○]\s+/)) {
          completedTests++;
          // 提取测试名称
          const match = trimmed.match(/^[✓✗○]\s+(.+?)\s*\(/);
          if (match) {
            currentTestName = match[1];
          }
          // 立即更新进度（不等待300ms）
          // 只有在知道总数或已完成测试数大于0时才更新，避免初始状态显示100%
          if (totalTests > 0 || completedTests > 0) {
            testRunState.progress = {
              current: completedTests,
              total: totalTests || Math.max(completedTests * 3, 50), // 更保守的估算
              currentTest: currentTestName || 'Running tests...',
              currentSuite: testRunState.progress.currentSuite || ''
            };
          }
        }
        
        // 检测测试套件名称（PASS/FAIL后面的文件路径）
        const suiteMatch = trimmed.match(/^(PASS|FAIL)\s+(.+?\.test\.js)/);
        if (suiteMatch) {
          // 提取测试套件名称（去掉路径，只保留文件名）
          const suitePath = suiteMatch[2];
          const suiteName = suitePath.split('/').pop().replace('.test.js', '');
          testRunState.progress.currentSuite = suiteName;
        }
        
        // 检测最终统计（Test Suites: X passed, Y total）
        const suiteStatsMatch = trimmed.match(/Test Suites:\s+(\d+)\s+(passed|failed)/);
        if (suiteStatsMatch) {
          // 可以用于验证
        }
        
        // 检测测试总数（Tests: X passed, Y total）
        // 匹配格式: "Tests:       124 passed, 124 total"
        const testMatch = trimmed.match(/Tests:\s+(\d+)\s+(passed|failed|skipped).*?(\d+)\s+total/i);
        if (testMatch) {
          const newTotalTests = parseInt(testMatch[3]) || totalTests;
          if (newTotalTests > totalTests) {
            totalTests = newTotalTests;
            // 立即更新进度
            testRunState.progress = {
              current: completedTests,
              total: totalTests,
              currentTest: currentTestName || 'Running tests...',
              currentSuite: testRunState.progress.currentSuite || ''
            };
          }
        }
        
        // 也尝试从JSON输出中解析（如果Jest输出了JSON行）
        try {
          const jsonMatch = trimmed.match(/\{"numTotalTests":(\d+)/);
          if (jsonMatch) {
            totalTests = parseInt(jsonMatch[1]);
            // 立即更新进度
            testRunState.progress = {
              current: completedTests,
              total: totalTests,
              currentTest: currentTestName || 'Running tests...',
              currentSuite: testRunState.progress.currentSuite || ''
            };
          }
        } catch (e) {
          // 忽略JSON解析错误
        }
      }
      
      // 定期更新进度（即使没有新测试完成，也更新当前状态）
      const now = Date.now();
      if (now - lastProgressUpdate > 200 || completedTests === 0) { // 每200ms更新一次，或首次更新
        // 如果检测到测试套件完成，可以估算总数
        if (completedTests > 0 && totalTests === 0) {
          // 估算：已完成测试数 * 3（更保守的估计，避免过早显示高百分比）
          totalTests = Math.max(completedTests * 3, 50);
        }
        
        // 只有在有实际进度时才更新
        if (completedTests > 0 || totalTests > 0) {
          testRunState.progress = {
            current: completedTests,
            total: totalTests || Math.max(completedTests * 3, 50), // 更保守的估算
            currentTest: currentTestName || 'Running tests...',
            currentSuite: testRunState.progress.currentSuite || ''
          };
        }
        lastProgressUpdate = now;
      }
    });
    
    jestProcess.stderr.on('data', (data) => {
      const errorOutput = data.toString();
      stderr += errorOutput;
      
      // 存储错误日志，在服务器端添加时间戳
      const errorLines = errorOutput.split('\n').filter(line => line.trim());
      errorLines.forEach(line => {
        if (line) {
          const timestamp = getLogTimestamp();
          testRunState.logs.push(`[${timestamp}] [ERROR] ${line}`);
        }
      });
      // 只保留最近1000行日志
      if (testRunState.logs.length > 1000) {
        testRunState.logs = testRunState.logs.slice(-1000);
      }
    });
    
    jestProcess.on('close', async (code) => {
      testRunState.running = false;
      testRunState.process = null;
      
      // 尝试从JSON输出文件中读取准确的测试总数
      let finalTotalTests = totalTests;
      let finalCompletedTests = completedTests;
      
      try {
        const testResultsPath = path.join(projectRoot, 'reports', 'test-results.json');
        if (fs.existsSync(testResultsPath)) {
          const testResults = JSON.parse(fs.readFileSync(testResultsPath, 'utf8'));
          if (testResults && testResults.numTotalTests) {
            finalTotalTests = testResults.numTotalTests;
            finalCompletedTests = testResults.numPassedTests + testResults.numFailedTests + (testResults.numPendingTests || 0);
            addTimestampedLog(`从JSON文件读取: 总测试数=${finalTotalTests}, 已完成=${finalCompletedTests}`);
          }
        }
      } catch (e) {
        addTimestampedLog(`无法读取测试结果JSON: ${e.message}`, 'WARN');
      }
      
      // 只有在有实际测试运行时才标记为完成
      // 如果没有任何测试运行（totalTests和completedTests都为0），说明测试可能没有启动或立即失败
      const hasTestsRun = finalTotalTests > 0 || finalCompletedTests > 0;
      
      if (hasTestsRun) {
        testRunState.completed = true;
        // 最终更新进度
        testRunState.progress = {
          current: finalCompletedTests,
          total: finalTotalTests,
          currentTest: code === 0 ? 'All tests completed' : 'Tests completed with errors',
          currentSuite: testRunState.progress.currentSuite || ''
        };
      } else {
        // 测试可能没有运行，不标记为完成，保持运行状态以便用户看到错误
        testRunState.completed = false;
        testRunState.progress = {
          current: 0,
          total: 0,
          currentTest: code === 0 ? 'Tests completed (no tests found)' : 'Tests failed to run',
          currentSuite: testRunState.progress.currentSuite || ''
        };
      }
      
      // 添加完成日志
      addTimestampedLog(`测试完成，退出代码: ${code}`);
      addTimestampedLog(`总测试数: ${finalTotalTests}, 已完成: ${finalCompletedTests}`);
      
      // 只有在测试真正完成时才生成报告
      if (hasTestsRun) {
        // 生成测试报告
        try {
          addTimestampedLog('正在生成测试报告...');
          const { execSync } = require('child_process');
          
          // 先运行一次Jest来生成JSON结果文件（使用相同的测试模式）
          // 注意：由于suites在外层作用域，我们需要从req.body中获取
          const reportJestArgs = [
            '--coverage',
            '--json',
            '--outputFile=reports/test-results.json',
            '--forceExit'
          ];
          
          // 使用保存的测试套件信息（从testRunState中获取）
          const reportSuites = testRunState.selectedSuites || [];
          if (reportSuites.length > 0) {
            const reportPatterns = reportSuites.map(suite => {
              const pattern = suite.replace(/^tests\//, '').replace(/\.test\.js$/, '');
              return pattern;
            });
            if (reportPatterns.length > 0) {
              const combinedPattern = '(' + reportPatterns.join('|') + ')';
              reportJestArgs.push('--testPathPattern', combinedPattern);
            }
          }
          
          // 静默运行，只生成JSON文件
          // 使用 spawn 而不是 execSync，避免 shell 解析特殊字符的问题
          const { spawnSync } = require('child_process');
          const reportResult = spawnSync('npx', ['jest', ...reportJestArgs], {
            cwd: projectRoot,
            stdio: 'pipe', // 捕获输出以便记录错误
            env: {
              ...process.env,
              FORCE_COLOR: '0',
              CI: 'true'
            },
            encoding: 'utf8'
          });
          
          if (reportResult.error) {
            throw new Error(`生成JSON报告失败: ${reportResult.error.message}`);
          }
          
          if (reportResult.status !== 0) {
            const errorOutput = reportResult.stderr || reportResult.stdout || 'Unknown error';
            throw new Error(`生成JSON报告失败 (退出代码: ${reportResult.status}): ${errorOutput.toString().substring(0, 500)}`);
          }
          
          addTimestampedLog('JSON测试结果文件生成成功');
          
          // 然后生成HTML报告
          const reportGenResult = spawnSync('node', ['scripts/generate-test-report.js'], {
            cwd: projectRoot,
            stdio: 'pipe',
            encoding: 'utf8'
          });
          
          if (reportGenResult.error) {
            throw new Error(`生成HTML报告失败: ${reportGenResult.error.message}`);
          }
          
          if (reportGenResult.status !== 0) {
            const errorOutput = reportGenResult.stderr || reportGenResult.stdout || 'Unknown error';
            throw new Error(`生成HTML报告失败 (退出代码: ${reportGenResult.status}): ${errorOutput.toString().substring(0, 500)}`);
          }
          
          addTimestampedLog('测试报告生成成功');
          logger.info('测试报告生成成功', { code, totalTests: finalTotalTests, completedTests: finalCompletedTests });
        } catch (e) {
          addTimestampedLog(`生成测试报告失败: ${e.message}`, 'ERROR');
          logger.error('生成测试报告失败', { error: e.message });
        }
      }
    });
    
    jestProcess.on('error', (error) => {
      logger.error('测试进程启动失败', { error: error.message, stack: error.stack });
      testRunState.running = false;
      testRunState.completed = true;
      testRunState.process = null;
      testRunState.logs = testRunState.logs || [];
      testRunState.logs.push(`[ERROR] 测试进程启动失败: ${error.message}`);
    });
    
    res.json({ success: true, message: 'Tests started' });
  } catch (error) {
    logger.error('运行测试失败', { error: error.message, stack: error.stack });
    testRunState.running = false;
    testRunState.completed = false;
    testRunState.logs = testRunState.logs || [];
    addTimestampedLog(`启动测试失败: ${error.message}`, 'ERROR');
    res.status(500).json({ 
      success: false, 
      message: 'Failed to run tests',
      error: error.message 
    });
  }
});

// 获取测试进度
router.get('/developer/test-progress', requireSuperAdmin, async (req, res) => {
  try {
    res.json({
      success: true,
      running: testRunState.running,
      completed: testRunState.completed,
      progress: testRunState.progress,
      logs: testRunState.logs || [] // 返回测试日志
    });
  } catch (error) {
    logger.error('获取测试进度失败', { error: error.message });
    res.status(500).json({ success: false, message: 'Failed to get test progress' });
  }
});

// 停止测试
router.post('/developer/stop-tests', requireSuperAdmin, async (req, res) => {
  try {
    if (testRunState.running && testRunState.process) {
      testRunState.process.kill();
      testRunState.running = false;
      testRunState.process = null;
      res.json({ success: true, message: 'Tests stopped' });
    } else {
      res.json({ success: false, message: 'No tests running' });
    }
  } catch (error) {
    logger.error('停止测试失败', { error: error.message });
    res.status(500).json({ success: false, message: 'Failed to stop tests' });
  }
});

// 获取测试报告
router.get('/developer/test-report', requireSuperAdmin, async (req, res) => {
  try {
    const reportPath = path.join(__dirname, '..', 'reports', 'test-report.html');
    
    if (!fs.existsSync(reportPath)) {
      // 返回一个简单的占位页面，而不是404
      const placeholder = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>Test Report - Not Ready</title>
          <style>
            body { 
              font-family: Arial, sans-serif; 
              display: flex; 
              align-items: center; 
              justify-content: center; 
              height: 100vh; 
              margin: 0;
              background: #f5f5f5;
            }
            .container {
              text-align: center;
              padding: 40px;
              background: white;
              border-radius: 8px;
              box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            }
            .spinner {
              border: 4px solid #f3f3f3;
              border-top: 4px solid #3498db;
              border-radius: 50%;
              width: 40px;
              height: 40px;
              animation: spin 1s linear infinite;
              margin: 0 auto 20px;
            }
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="spinner"></div>
            <h2>Test Report Not Ready</h2>
            <p>The test report is still being generated. Please wait...</p>
          </div>
        </body>
        </html>
      `;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(placeholder);
    }
    
    const html = fs.readFileSync(reportPath, 'utf8');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.send(html);
  } catch (error) {
    logger.error('获取测试报告失败', { error: error.message });
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Error</title>
        <style>
          body { 
            font-family: Arial, sans-serif; 
            display: flex; 
            align-items: center; 
            justify-content: center; 
            height: 100vh; 
            margin: 0;
            background: #f5f5f5;
          }
          .container {
            text-align: center;
            padding: 40px;
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            color: #e74c3c;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>Error Loading Test Report</h2>
          <p>${error.message}</p>
        </div>
      </body>
      </html>
    `);
  }
});

module.exports = router;

