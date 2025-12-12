const express = require('express');
const { body, param, query } = require('express-validator');
const { runAsync, getAsync, allAsync } = require('../db/database');
const { requireApiToken } = require('../middleware/api-token-auth');
const { validate } = require('../middleware/validation');
const { logger } = require('../utils/logger');
const { reloadCustomApiRoutes } = require('../utils/custom-api-router');

const router = express.Router();

// 所有外部API路由都需要Token认证
router.use(requireApiToken);

/**
 * GET /api/external/custom-apis
 * 获取自定义API列表（支持分页和过滤）
 */
router.get('/custom-apis', [
  query('page').optional().isInt({ min: 1 }).withMessage('页码必须是大于0的整数'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('每页数量必须在1-100之间'),
  query('status').optional().isIn(['active', 'inactive']).withMessage('状态必须是active或inactive'),
  query('method').optional().isIn(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']).withMessage('请求方法无效'),
  validate
], async (req, res) => {
  try {
    const { page = 1, limit = 50, status, method } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    // 构建查询条件
    let whereConditions = [];
    let queryParams = [];
    
    if (status) {
      whereConditions.push('status = ?');
      queryParams.push(status);
    }
    
    if (method) {
      whereConditions.push('method = ?');
      queryParams.push(method);
    }
    
    const whereClause = whereConditions.length > 0 
      ? 'WHERE ' + whereConditions.join(' AND ')
      : '';
    
    // 获取总数
    const totalResult = await getAsync(
      `SELECT COUNT(*) as total FROM custom_apis ${whereClause}`,
      queryParams
    );
    const total = totalResult.total;
    
    // 获取列表
    const apis = await allAsync(`
      SELECT id, name, path, method, requires_token, description, status, created_at, updated_at
      FROM custom_apis
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `, [...queryParams, parseInt(limit), offset]);
    
    // 转换requires_token为布尔值
    const formattedApis = apis.map(api => ({
      ...api,
      requires_token: api.requires_token === 1 || api.requires_token === '1'
    }));
    
    res.json({
      success: true,
      data: {
        apis: formattedApis,
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    logger.error('获取自定义API列表失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: '获取自定义API列表失败: ' + error.message,
      code: 'SERVER_ERROR'
    });
  }
});

/**
 * GET /api/external/custom-apis/:id
 * 获取单个自定义API详情
 */
router.get('/custom-apis/:id', [
  param('id').isInt({ min: 1 }).withMessage('API ID必须是大于0的整数'),
  validate
], async (req, res) => {
  try {
    const { id } = req.params;
    
    const api = await getAsync(`
      SELECT id, name, path, method, requires_token, response_content, description, status, created_at, updated_at
      FROM custom_apis
      WHERE id = ?
    `, [id]);
    
    if (!api) {
      return res.status(404).json({
        success: false,
        message: 'API不存在',
        code: 'NOT_FOUND'
      });
    }
    
    // 转换requires_token为布尔值
    const formattedApi = {
      ...api,
      requires_token: api.requires_token === 1 || api.requires_token === '1'
    };
    
    res.json({
      success: true,
      data: formattedApi
    });
  } catch (error) {
    logger.error('获取自定义API详情失败', { error: error.message, id: req.params.id });
    res.status(500).json({
      success: false,
      message: '获取自定义API详情失败: ' + error.message,
      code: 'SERVER_ERROR'
    });
  }
});

/**
 * POST /api/external/custom-apis
 * 创建自定义API
 */
router.post('/custom-apis', [
  body('name').notEmpty().withMessage('API名称不能为空').trim(),
  body('path').notEmpty().withMessage('API路径不能为空').trim(),
  body('method').isIn(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']).withMessage('请求方法无效'),
  body('response_content').notEmpty().withMessage('返回内容不能为空'),
  body('requires_token').optional().isBoolean().withMessage('requires_token必须是布尔值'),
  body('description').optional().trim(),
  body('status').optional().isIn(['active', 'inactive']).withMessage('状态必须是active或inactive'),
  validate
], async (req, res) => {
  try {
    const { name, path, method, requires_token, response_content, description, status } = req.body;
    
    // 验证路径格式
    if (!path.startsWith('/')) {
      return res.status(400).json({
        success: false,
        message: '路径必须以 / 开头',
        code: 'VALIDATION_ERROR'
      });
    }
    
    // 检查路径是否已存在
    const existing = await getAsync('SELECT id FROM custom_apis WHERE path = ? AND method = ?', [path, method]);
    if (existing) {
      return res.status(400).json({
        success: false,
        message: '该路径和方法组合已存在',
        code: 'DUPLICATE_PATH'
      });
    }
    
    // 验证返回内容是否为有效的JSON
    try {
      JSON.parse(response_content);
    } catch (e) {
      return res.status(400).json({
        success: false,
        message: '返回内容必须是有效的JSON格式',
        code: 'INVALID_JSON'
      });
    }
    
    // 插入数据库
    const result = await runAsync(`
      INSERT INTO custom_apis (name, path, method, requires_token, response_content, description, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      name,
      path,
      method || 'GET',
      requires_token ? 1 : 0,
      response_content,
      description || null,
      status || 'active'
    ]);
    
    // 重新加载自定义API路由
    await reloadCustomApiRoutes();
    
    logger.info('通过外部API创建自定义API', {
      id: result.id,
      name,
      path,
      method,
      ip: req.ip
    });
    
    res.json({
      success: true,
      message: '自定义API创建成功',
      data: { id: result.id }
    });
  } catch (error) {
    logger.error('创建自定义API失败', { error: error.message, ip: req.ip });
    res.status(500).json({
      success: false,
      message: '创建自定义API失败: ' + error.message,
      code: 'SERVER_ERROR'
    });
  }
});

/**
 * PUT /api/external/custom-apis/:id
 * 更新自定义API
 */
router.put('/custom-apis/:id', [
  param('id').isInt({ min: 1 }).withMessage('API ID必须是大于0的整数'),
  body('name').optional().notEmpty().withMessage('API名称不能为空').trim(),
  body('path').optional().notEmpty().withMessage('API路径不能为空').trim(),
  body('method').optional().isIn(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']).withMessage('请求方法无效'),
  body('response_content').optional().notEmpty().withMessage('返回内容不能为空'),
  body('requires_token').optional().isBoolean().withMessage('requires_token必须是布尔值'),
  body('description').optional().trim(),
  body('status').optional().isIn(['active', 'inactive']).withMessage('状态必须是active或inactive'),
  validate
], async (req, res) => {
  try {
    const { id } = req.params;
    const { name, path, method, requires_token, response_content, description, status } = req.body;
    
    // 检查至少提供了一个字段
    if (!name && !path && !method && !response_content && requires_token === undefined && !description && !status) {
      return res.status(400).json({
        success: false,
        message: '至少需要提供一个要更新的字段',
        code: 'VALIDATION_ERROR'
      });
    }
    
    // 检查API是否存在
    const existing = await getAsync('SELECT id, name, path, method FROM custom_apis WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'API不存在',
        code: 'NOT_FOUND'
      });
    }
    
    // 构建更新字段
    const updateFields = [];
    const updateParams = [];
    
    if (name !== undefined) {
      updateFields.push('name = ?');
      updateParams.push(name);
    }
    
    if (path !== undefined) {
      // 验证路径格式
      if (!path.startsWith('/')) {
        return res.status(400).json({
          success: false,
          message: '路径必须以 / 开头',
          code: 'VALIDATION_ERROR'
        });
      }
      
      // 检查路径是否被其他API使用
      const pathConflict = await getAsync(
        'SELECT id FROM custom_apis WHERE path = ? AND method = ? AND id != ?',
        [path, method || existing.method, id]
      );
      if (pathConflict) {
        return res.status(400).json({
          success: false,
          message: '该路径和方法组合已被其他API使用',
          code: 'DUPLICATE_PATH'
        });
      }
      
      updateFields.push('path = ?');
      updateParams.push(path);
    }
    
    if (method !== undefined) {
      updateFields.push('method = ?');
      updateParams.push(method);
      
      // 如果更新了method，需要检查路径冲突（使用新的method和当前的或新的path）
      const checkPath = path !== undefined ? path : existing.path;
      const checkMethod = method;
      const pathConflict = await getAsync(
        'SELECT id FROM custom_apis WHERE path = ? AND method = ? AND id != ?',
        [checkPath, checkMethod, id]
      );
      if (pathConflict) {
        return res.status(400).json({
          success: false,
          message: '该路径和方法组合已被其他API使用',
          code: 'DUPLICATE_PATH'
        });
      }
    }
    
    if (requires_token !== undefined) {
      updateFields.push('requires_token = ?');
      updateParams.push(requires_token ? 1 : 0);
    }
    
    if (response_content !== undefined) {
      // 验证返回内容是否为有效的JSON
      try {
        JSON.parse(response_content);
      } catch (e) {
        return res.status(400).json({
          success: false,
          message: '返回内容必须是有效的JSON格式',
          code: 'INVALID_JSON'
        });
      }
      
      updateFields.push('response_content = ?');
      updateParams.push(response_content);
    }
    
    if (description !== undefined) {
      updateFields.push('description = ?');
      updateParams.push(description || null);
    }
    
    if (status !== undefined) {
      updateFields.push('status = ?');
      updateParams.push(status);
    }
    
    // 添加更新时间
    updateFields.push('updated_at = datetime(\'now\', \'localtime\')');
    
    // 添加ID参数
    updateParams.push(id);
    
    // 更新数据库
    await runAsync(`
      UPDATE custom_apis
      SET ${updateFields.join(', ')}
      WHERE id = ?
    `, updateParams);
    
    // 重新加载自定义API路由
    await reloadCustomApiRoutes();
    
    logger.info('通过外部API更新自定义API', {
      id,
      ip: req.ip,
      updatedFields: Object.keys(req.body)
    });
    
    res.json({
      success: true,
      message: '自定义API更新成功'
    });
  } catch (error) {
    logger.error('更新自定义API失败', { error: error.message, id: req.params.id, ip: req.ip });
    res.status(500).json({
      success: false,
      message: '更新自定义API失败: ' + error.message,
      code: 'SERVER_ERROR'
    });
  }
});

/**
 * PATCH /api/external/custom-apis/:id/content
 * 部分更新自定义API的response_content（支持追加、删除、修改字段或数组元素）
 */
router.patch('/custom-apis/:id/content', [
  param('id').isInt({ min: 1 }).withMessage('API ID必须是大于0的整数'),
  body('operation').isIn(['add', 'remove', 'update', 'append', 'delete']).withMessage('操作类型无效'),
  body('path').notEmpty().withMessage('路径不能为空').trim(),
  body('value').optional(), // 对于remove和delete操作，value是可选的
  validate
], async (req, res) => {
  try {
    const { id } = req.params;
    const { operation, path, value } = req.body;
    
    // 检查API是否存在
    const api = await getAsync('SELECT id, response_content FROM custom_apis WHERE id = ?', [id]);
    if (!api) {
      return res.status(404).json({
        success: false,
        message: 'API不存在',
        code: 'NOT_FOUND'
      });
    }
    
    // 解析现有的response_content
    let content;
    try {
      content = JSON.parse(api.response_content);
    } catch (e) {
      return res.status(400).json({
        success: false,
        message: '当前response_content不是有效的JSON格式',
        code: 'INVALID_JSON'
      });
    }
    
    // 解析路径（支持点号分隔的路径，如 "data.items" 或 "items.0"）
    const pathParts = path.split('.').filter(p => p !== '');
    
    // 根据操作类型执行不同的操作
    let updated = false;
    let errorMessage = null;
    
    try {
      switch (operation) {
        case 'add':
        case 'update':
          // 添加或更新字段
          if (value === undefined) {
            return res.status(400).json({
              success: false,
              message: 'add和update操作需要提供value',
              code: 'VALIDATION_ERROR'
            });
          }
          updated = setNestedValue(content, pathParts, value);
          break;
          
        case 'append':
          // 追加元素到数组
          if (value === undefined) {
            return res.status(400).json({
              success: false,
              message: 'append操作需要提供value',
              code: 'VALIDATION_ERROR'
            });
          }
          updated = appendToArray(content, pathParts, value);
          break;
          
        case 'remove':
        case 'delete':
          // 删除字段或数组元素
          if (operation === 'delete') {
            // delete操作：从数组中删除元素（通过索引或值匹配）
            updated = deleteFromArray(content, pathParts, value);
          } else {
            // remove操作：删除字段
            updated = removeNestedValue(content, pathParts);
          }
          break;
          
        default:
          return res.status(400).json({
            success: false,
            message: '不支持的操作类型',
            code: 'VALIDATION_ERROR'
          });
      }
    } catch (error) {
      errorMessage = error.message;
    }
    
    if (!updated && !errorMessage) {
      return res.status(400).json({
        success: false,
        message: '操作失败：路径不存在或无法执行该操作',
        code: 'OPERATION_FAILED'
      });
    }
    
    if (errorMessage) {
      return res.status(400).json({
        success: false,
        message: errorMessage,
        code: 'OPERATION_FAILED'
      });
    }
    
    // 将更新后的内容转换回JSON字符串
    const updatedContent = JSON.stringify(content);
    
    // 更新数据库
    await runAsync(`
      UPDATE custom_apis
      SET response_content = ?, updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `, [updatedContent, id]);
    
    // 重新加载自定义API路由
    await reloadCustomApiRoutes();
    
    logger.info('通过外部API部分更新自定义API内容', {
      id,
      operation,
      path,
      ip: req.ip
    });
    
    res.json({
      success: true,
      message: '内容更新成功',
      data: {
        updated_content: content
      }
    });
  } catch (error) {
    logger.error('部分更新自定义API内容失败', { error: error.message, id: req.params.id, ip: req.ip });
    res.status(500).json({
      success: false,
      message: '部分更新自定义API内容失败: ' + error.message,
      code: 'SERVER_ERROR'
    });
  }
});

/**
 * 设置嵌套值（支持对象字段和数组索引）
 */
function setNestedValue(obj, pathParts, value) {
  if (pathParts.length === 0) {
    return false;
  }
  
  let current = obj;
  for (let i = 0; i < pathParts.length - 1; i++) {
    const part = pathParts[i];
    const isArrayIndex = /^\d+$/.test(part);
    
    if (isArrayIndex) {
      const index = parseInt(part, 10);
      if (!Array.isArray(current) || index < 0 || index >= current.length) {
        // 如果路径不存在，尝试创建
        if (!Array.isArray(current)) {
          return false;
        }
      }
      current = current[index];
    } else {
      if (!current || typeof current !== 'object' || Array.isArray(current)) {
        // 如果路径不存在，创建对象
        if (current === null || current === undefined) {
          return false;
        }
      }
      if (!(part in current)) {
        // 如果字段不存在，创建它
        current[part] = {};
      }
      current = current[part];
    }
    
    if (current === null || current === undefined) {
      return false;
    }
  }
  
  // 设置最后一个路径的值
  const lastPart = pathParts[pathParts.length - 1];
  const isArrayIndex = /^\d+$/.test(lastPart);
  
  if (isArrayIndex) {
    const index = parseInt(lastPart, 10);
    if (!Array.isArray(current)) {
      return false;
    }
    if (index < 0 || index >= current.length) {
      return false;
    }
    current[index] = value;
  } else {
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      return false;
    }
    current[lastPart] = value;
  }
  
  return true;
}

/**
 * 追加元素到数组
 */
function appendToArray(obj, pathParts, value) {
  if (pathParts.length === 0) {
    return false;
  }
  
  let current = obj;
  for (let i = 0; i < pathParts.length; i++) {
    const part = pathParts[i];
    const isArrayIndex = /^\d+$/.test(part);
    
    if (isArrayIndex) {
      const index = parseInt(part, 10);
      if (!Array.isArray(current) || index < 0 || index >= current.length) {
        return false;
      }
      current = current[index];
    } else {
      if (!current || typeof current !== 'object' || Array.isArray(current)) {
        return false;
      }
      if (!(part in current)) {
        // 如果字段不存在，创建空数组
        current[part] = [];
      }
      current = current[part];
    }
    
    if (current === null || current === undefined) {
      return false;
    }
  }
  
  // 最后到达的应该是数组
  if (!Array.isArray(current)) {
    return false;
  }
  
  // 追加元素
  current.push(value);
  return true;
}

/**
 * 从数组中删除元素
 */
function deleteFromArray(obj, pathParts, value) {
  if (pathParts.length === 0) {
    return false;
  }
  
  let current = obj;
  for (let i = 0; i < pathParts.length; i++) {
    const part = pathParts[i];
    const isArrayIndex = /^\d+$/.test(part);
    
    if (isArrayIndex) {
      const index = parseInt(part, 10);
      if (!Array.isArray(current) || index < 0 || index >= current.length) {
        return false;
      }
      
      // 如果这是最后一个路径部分，直接删除该索引的元素
      if (i === pathParts.length - 1) {
        current.splice(index, 1);
        return true;
      }
      
      current = current[index];
    } else {
      if (!current || typeof current !== 'object' || Array.isArray(current)) {
        return false;
      }
      if (!(part in current)) {
        return false;
      }
      current = current[part];
    }
    
    if (current === null || current === undefined) {
      return false;
    }
  }
  
  // 如果提供了value，通过值匹配删除
  if (value !== undefined) {
    if (!Array.isArray(current)) {
      return false;
    }
    const index = current.findIndex(item => JSON.stringify(item) === JSON.stringify(value));
    if (index === -1) {
      return false;
    }
    current.splice(index, 1);
    return true;
  }
  
  return false;
}

/**
 * 删除嵌套值
 */
function removeNestedValue(obj, pathParts) {
  if (pathParts.length === 0) {
    return false;
  }
  
  let current = obj;
  for (let i = 0; i < pathParts.length - 1; i++) {
    const part = pathParts[i];
    const isArrayIndex = /^\d+$/.test(part);
    
    if (isArrayIndex) {
      const index = parseInt(part, 10);
      if (!Array.isArray(current) || index < 0 || index >= current.length) {
        return false;
      }
      current = current[index];
    } else {
      if (!current || typeof current !== 'object' || Array.isArray(current)) {
        return false;
      }
      if (!(part in current)) {
        return false;
      }
      current = current[part];
    }
    
    if (current === null || current === undefined) {
      return false;
    }
  }
  
  // 删除最后一个路径的值
  const lastPart = pathParts[pathParts.length - 1];
  const isArrayIndex = /^\d+$/.test(lastPart);
  
  if (isArrayIndex) {
    const index = parseInt(lastPart, 10);
    if (!Array.isArray(current) || index < 0 || index >= current.length) {
      return false;
    }
    current.splice(index, 1);
  } else {
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      return false;
    }
    if (!(lastPart in current)) {
      return false;
    }
    delete current[lastPart];
  }
  
  return true;
}

/**
 * DELETE /api/external/custom-apis/:id
 * 删除自定义API
 */
router.delete('/custom-apis/:id', [
  param('id').isInt({ min: 1 }).withMessage('API ID必须是大于0的整数'),
  validate
], async (req, res) => {
  try {
    const { id } = req.params;
    
    // 检查API是否存在
    const existing = await getAsync('SELECT id, name, path FROM custom_apis WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'API不存在',
        code: 'NOT_FOUND'
      });
    }
    
    // 删除数据库记录
    await runAsync('DELETE FROM custom_apis WHERE id = ?', [id]);
    
    // 重新加载自定义API路由
    await reloadCustomApiRoutes();
    
    logger.info('通过外部API删除自定义API', {
      id,
      name: existing.name,
      path: existing.path,
      ip: req.ip
    });
    
    res.json({
      success: true,
      message: '自定义API删除成功'
    });
  } catch (error) {
    logger.error('删除自定义API失败', { error: error.message, id: req.params.id, ip: req.ip });
    res.status(500).json({
      success: false,
      message: '删除自定义API失败: ' + error.message,
      code: 'SERVER_ERROR'
    });
  }
});

/**
 * GET /api/external/custom-apis/:id/logs
 * 获取自定义API调用日志
 */
router.get('/custom-apis/:id/logs', [
  param('id').isInt({ min: 1 }).withMessage('API ID必须是大于0的整数'),
  query('page').optional().isInt({ min: 1 }).withMessage('页码必须是大于0的整数'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('每页数量必须在1-100之间'),
  validate
], async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    // 检查API是否存在
    const api = await getAsync('SELECT id, name FROM custom_apis WHERE id = ?', [id]);
    if (!api) {
      return res.status(404).json({
        success: false,
        message: 'API不存在',
        code: 'NOT_FOUND'
      });
    }
    
    // 获取日志总数
    const totalResult = await getAsync(
      'SELECT COUNT(*) as total FROM custom_api_logs WHERE api_id = ?',
      [id]
    );
    const total = totalResult.total;
    
    // 获取日志列表
    const logs = await allAsync(`
      SELECT 
        id, request_method, request_path, request_headers, request_query, request_body,
        response_status, response_body, response_time_ms, ip_address, user_agent, error_message, created_at
      FROM custom_api_logs
      WHERE api_id = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `, [id, parseInt(limit), offset]);
    
    // 解析JSON字段
    const formattedLogs = logs.map(log => {
      const formatted = { ...log };
      
      // 解析JSON字符串字段
      if (typeof log.request_headers === 'string') {
        try {
          formatted.request_headers = JSON.parse(log.request_headers);
        } catch (e) {
          formatted.request_headers = log.request_headers;
        }
      }
      
      if (typeof log.request_query === 'string') {
        try {
          formatted.request_query = JSON.parse(log.request_query);
        } catch (e) {
          formatted.request_query = log.request_query;
        }
      }
      
      if (typeof log.request_body === 'string') {
        try {
          formatted.request_body = JSON.parse(log.request_body);
        } catch (e) {
          formatted.request_body = log.request_body;
        }
      }
      
      if (typeof log.response_body === 'string') {
        try {
          formatted.response_body = JSON.parse(log.response_body);
        } catch (e) {
          formatted.response_body = log.response_body;
        }
      }
      
      return formatted;
    });
    
    res.json({
      success: true,
      data: {
        logs: formattedLogs,
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    logger.error('获取API日志失败', { error: error.message, id: req.params.id });
    res.status(500).json({
      success: false,
      message: '获取API日志失败: ' + error.message,
      code: 'SERVER_ERROR'
    });
  }
});

module.exports = router;
