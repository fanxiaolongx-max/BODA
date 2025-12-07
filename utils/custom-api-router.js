const express = require('express');
const { getAsync, runAsync } = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { logger } = require('./logger');

/**
 * 获取当前本地时间字符串（格式：YYYY-MM-DD HH:mm:ss）
 */
function getCurrentLocalTimeString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

let appInstance = null;

/**
 * 初始化自定义API路由器
 * @param {Express} app - Express应用实例
 */
function initCustomApiRouter(app) {
  appInstance = app;
  
  // 创建一个通配符路由，动态处理所有自定义API请求
  app.all('/api/custom/*', async (req, res, next) => {
    try {
      // 获取请求路径（去掉 /api/custom 前缀，并去掉查询参数）
      let requestPath = req.path.replace('/api/custom', '') || '/';
      // 确保路径以 / 开头
      if (!requestPath.startsWith('/')) {
        requestPath = '/' + requestPath;
      }
      const requestMethod = req.method.toUpperCase();

      // 从数据库查找匹配的API
      const api = await getAsync(`
        SELECT id, name, path, method, requires_token, response_content, description, status
        FROM custom_apis
        WHERE path = ? AND method = ? AND status = 'active'
      `, [requestPath, requestMethod]);

      if (!api) {
        // 如果没有找到匹配的API，继续到下一个中间件（404处理）
        return next();
      }

      // 调试日志：记录API信息
      logger.debug('自定义API请求', {
        path: requestPath,
        method: requestMethod,
        apiId: api.id,
        apiName: api.name,
        requires_token: api.requires_token,
        requires_token_type: typeof api.requires_token
      });

      // 如果需要token，验证身份（SQLite可能返回数字1或字符串"1"，需要兼容处理）
      const requiresToken = api.requires_token === 1 || api.requires_token === '1' || api.requires_token === true;
      
      if (requiresToken) {
        logger.debug('自定义API需要Token验证', { path: requestPath, method: requestMethod });
        let authenticated = false;
        
        // 优先尝试API Token验证（从请求头或查询参数获取）
        const apiToken = req.headers['x-api-token'] || 
                        req.headers['X-API-Token'] || 
                        req.headers['authorization']?.replace(/^Bearer\s+/i, '') ||
                        req.query.token;
        
        if (apiToken) {
          // 从settings中获取自定义API Token
          const customApiTokenSetting = await getAsync("SELECT value FROM settings WHERE key = 'custom_api_token'");
          
          if (customApiTokenSetting && customApiTokenSetting.value && customApiTokenSetting.value.trim() !== '') {
            const configuredToken = customApiTokenSetting.value.trim();
            if (apiToken === configuredToken) {
              authenticated = true;
              logger.debug('自定义API Token验证成功', { path: req.path, method: req.method });
            }
          }
        }
        
        // 如果API Token验证失败，尝试Session认证（用于浏览器访问）
        if (!authenticated) {
          try {
            await new Promise((resolve, reject) => {
              requireAuth(req, res, (err) => {
                if (err) {
                  reject(err);
                } else {
                  resolve();
                }
              });
            });
            authenticated = true;
            logger.debug('自定义API Session验证成功', { path: req.path, method: req.method });
          } catch (sessionError) {
            // Session验证失败
            authenticated = false;
            logger.debug('自定义API Session验证失败', { 
              path: req.path, 
              method: req.method,
              error: sessionError.message || 'Session not found'
            });
          }
        }
        
        // 如果两种验证方式都失败，返回401
        if (!authenticated) {
          logger.warn('自定义API验证失败', {
            path: req.path,
            method: req.method,
            hasApiToken: !!apiToken,
            hasSession: !!(req.session && req.session.adminId)
          });
          return res.status(401).json({ 
            success: false, 
            message: '需要身份验证。请提供有效的API Token（X-API-Token头或Authorization: Bearer）或登录Session' 
          });
        }
        
        logger.debug('自定义API验证通过', { path: req.path, method: req.method });
      }

      // 记录请求开始时间
      const startTime = Date.now();
      
      // 收集请求信息
      const requestHeaders = { ...req.headers };
      // 隐藏敏感信息（如 token）
      if (requestHeaders['x-api-token']) {
        requestHeaders['x-api-token'] = '***';
      }
      if (requestHeaders['X-API-Token']) {
        requestHeaders['X-API-Token'] = '***';
      }
      if (requestHeaders['authorization']) {
        requestHeaders['authorization'] = requestHeaders['authorization'].replace(/Bearer\s+.*/, 'Bearer ***');
      }
      
      const requestQuery = JSON.stringify(req.query || {});
      const requestBody = JSON.stringify(req.body || {});
      
      // 解析并返回响应内容
      let responseData;
      let responseStatus = 200;
      let errorMessage = null;
      
      try {
        responseData = JSON.parse(api.response_content);
      } catch (e) {
        // 如果不是JSON，直接返回字符串
        responseData = api.response_content;
      }

      // 支持动态内容替换（可选功能）
      // 例如：{{request.method}} 会被替换为实际的请求方法
      if (typeof responseData === 'string') {
        responseData = responseData
          .replace(/\{\{request\.method\}\}/g, req.method)
          .replace(/\{\{request\.path\}\}/g, req.path)
          .replace(/\{\{request\.query\}\}/g, JSON.stringify(req.query))
          .replace(/\{\{request\.body\}\}/g, JSON.stringify(req.body))
          .replace(/\{\{timestamp\}\}/g, new Date().toISOString());
      } else if (typeof responseData === 'object') {
        // 如果是对象，递归替换字符串值
        responseData = replacePlaceholders(responseData, req);
      }

      // 提取过滤参数（排除分页和控制参数）
      const filterParams = {};
      const excludeParams = ['page', 'pageSize', 'format'];
      Object.keys(req.query || {}).forEach(key => {
        if (!excludeParams.includes(key) && req.query[key] !== undefined && req.query[key] !== '') {
          filterParams[key] = req.query[key];
        }
      });

      // 应用过滤（如果有过滤条件）
      if (Object.keys(filterParams).length > 0) {
        responseData = applyFilter(responseData, filterParams);
      }

      // 处理分页参数
      const page = req.query.page ? parseInt(req.query.page, 10) : null;
      const pageSize = req.query.pageSize ? parseInt(req.query.pageSize, 10) : null;
      const format = req.query.format || 'object'; // 'object' 返回 {data, total, hasMore}，'array' 只返回数组
      
      // 如果提供了分页参数，进行分页处理
      if (page !== null && pageSize !== null && page > 0 && pageSize > 0) {
        responseData = applyPagination(responseData, page, pageSize, format === 'array');
      }

      // 计算响应时间
      const responseTime = Date.now() - startTime;
      const responseBody = JSON.stringify(responseData);
      
      // 记录日志到数据库（异步，不阻塞响应）
      logApiRequest(api.id, requestMethod, req.path, requestHeaders, requestQuery, requestBody, responseStatus, responseBody, responseTime, req.ip, req.get('user-agent'), null).catch(err => {
        logger.error('记录API日志失败', { error: err.message, apiId: api.id });
      });

      res.json(responseData);
    } catch (error) {
      logger.error('执行自定义API失败', {
        path: req.path,
        method: req.method,
        error: error.message
      });
      
      // 记录错误日志（如果找到了API）
      let requestPath = req.path.replace('/api/custom', '') || '/';
      if (!requestPath.startsWith('/')) {
        requestPath = '/' + requestPath;
      }
      const requestMethod = req.method.toUpperCase();
      
      const api = await getAsync(`
        SELECT id FROM custom_apis
        WHERE path = ? AND method = ? AND status = 'active'
      `, [requestPath, requestMethod]).catch(() => null);
      
      if (api) {
        const requestHeaders = { ...req.headers };
        if (requestHeaders['x-api-token']) requestHeaders['x-api-token'] = '***';
        if (requestHeaders['X-API-Token']) requestHeaders['X-API-Token'] = '***';
        if (requestHeaders['authorization']) {
          requestHeaders['authorization'] = requestHeaders['authorization'].replace(/Bearer\s+.*/, 'Bearer ***');
        }
        
        logApiRequest(
          api.id,
          req.method.toUpperCase(),
          req.path,
          requestHeaders,
          JSON.stringify(req.query || {}),
          JSON.stringify(req.body || {}),
          error.status || 500,
          JSON.stringify({ success: false, message: error.message }),
          0,
          req.ip,
          req.get('user-agent'),
          error.message
        ).catch(err => {
          logger.error('记录API错误日志失败', { error: err.message });
        });
      }
      
      if (error.status === 401) {
        res.status(401).json({ success: false, message: '需要身份验证' });
      } else {
        res.status(500).json({ success: false, message: 'API执行失败: ' + error.message });
      }
    }
  });
  
  logger.info('自定义API路由器已初始化');
}

/**
 * 递归替换对象中的占位符
 */
function replacePlaceholders(obj, req) {
  if (typeof obj === 'string') {
    return obj
      .replace(/\{\{request\.method\}\}/g, req.method)
      .replace(/\{\{request\.path\}\}/g, req.path)
      .replace(/\{\{request\.query\}\}/g, JSON.stringify(req.query))
      .replace(/\{\{request\.body\}\}/g, JSON.stringify(req.body))
      .replace(/\{\{timestamp\}\}/g, new Date().toISOString());
  } else if (Array.isArray(obj)) {
    return obj.map(item => replacePlaceholders(item, req));
  } else if (obj && typeof obj === 'object') {
    const result = {};
    for (const key in obj) {
      result[key] = replacePlaceholders(obj[key], req);
    }
    return result;
  }
  return obj;
}

/**
 * 应用过滤条件
 * @param {*} data - 响应数据（可能是数组或对象）
 * @param {Object} filterParams - 过滤参数对象，例如 { category: '中餐厅', keyword: '川味' }
 * @returns {*} 过滤后的数据
 */
function applyFilter(data, filterParams) {
  // 如果数据是数组，直接过滤
  if (Array.isArray(data)) {
    return filterArray(data, filterParams);
  }
  
  // 如果数据是对象，检查是否有 data 字段是数组
  if (data && typeof data === 'object' && Array.isArray(data.data)) {
    const filteredData = filterArray(data.data, filterParams);
    return {
      ...data,
      data: filteredData
    };
  }
  
  // 如果数据不是数组也不是包含 data 数组的对象，返回原始数据
  return data;
}

/**
 * 过滤数组数据
 * @param {Array} array - 要过滤的数组
 * @param {Object} filterParams - 过滤参数
 * @returns {Array} 过滤后的数组
 */
function filterArray(array, filterParams) {
  const keyword = filterParams.keyword;
  const fieldFilters = {};
  
  // 分离关键词和其他字段过滤
  Object.keys(filterParams).forEach(key => {
    if (key !== 'keyword') {
      fieldFilters[key] = filterParams[key];
    }
  });

  return array.filter(item => {
    // 先应用字段过滤
    let matchesFieldFilters = true;
    if (Object.keys(fieldFilters).length > 0) {
      matchesFieldFilters = Object.keys(fieldFilters).every(filterKey => {
        const filterValue = String(fieldFilters[filterKey]).toLowerCase();
        const itemValue = item[filterKey];
        
        if (itemValue === undefined || itemValue === null) {
          return false;
        }
        
        // 将值转换为字符串并转为小写进行比较（支持包含匹配）
        const itemValueStr = String(itemValue).toLowerCase();
        return itemValueStr.includes(filterValue);
      });
    }

    // 如果字段过滤不匹配，直接返回false
    if (!matchesFieldFilters) {
      return false;
    }

    // 如果有关键词，在所有字段中搜索
    if (keyword) {
      const keywordLower = String(keyword).toLowerCase();
      const itemValues = Object.values(item || {});
      
      // 检查是否在任何字段中包含关键词
      const matchesKeyword = itemValues.some(value => {
        if (value === null || value === undefined) {
          return false;
        }
        const valueStr = String(value).toLowerCase();
        return valueStr.includes(keywordLower);
      });
      
      return matchesKeyword;
    }

    return true;
  });
}

/**
 * 应用分页处理
 * @param {*} data - 响应数据（可能是数组或对象）
 * @param {number} page - 页码（从1开始）
 * @param {number} pageSize - 每页大小
 * @param {boolean} returnArrayOnly - 如果为true，只返回数组；否则返回带元数据的对象
 * @returns {*} 分页后的数据
 */
function applyPagination(data, page, pageSize, returnArrayOnly = false) {
  // 如果数据是数组，直接分页
  if (Array.isArray(data)) {
    const total = data.length;
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedData = data.slice(startIndex, endIndex);
    
    // 如果只需要返回数组，直接返回
    if (returnArrayOnly) {
      return paginatedData;
    }
    
    // 否则返回带元数据的分页格式
    const hasMore = endIndex < total;
    return {
      data: paginatedData,
      total: total,
      hasMore: hasMore
    };
  }
  
  // 如果数据是对象，检查是否有 data 字段是数组
  if (data && typeof data === 'object' && Array.isArray(data.data)) {
    const total = data.total !== undefined ? data.total : data.data.length;
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedData = data.data.slice(startIndex, endIndex);
    
    // 如果只需要返回数组，直接返回数组
    if (returnArrayOnly) {
      return paginatedData;
    }
    
    // 否则返回带元数据的分页格式，保留原有的其他字段
    const hasMore = endIndex < (data.total !== undefined ? data.total : data.data.length);
    return {
      ...data,
      data: paginatedData,
      total: total,
      hasMore: hasMore
    };
  }
  
  // 如果数据不是数组也不是包含 data 数组的对象，返回原始数据
  // 这样保持向后兼容性
  return data;
}

/**
 * 记录API请求日志到数据库
 */
async function logApiRequest(apiId, requestMethod, requestPath, requestHeaders, requestQuery, requestBody, responseStatus, responseBody, responseTime, ipAddress, userAgent, errorMessage) {
  try {
    // 使用本地时间，而不是UTC时间
    const currentTime = getCurrentLocalTimeString();
    await runAsync(`
      INSERT INTO custom_api_logs (
        api_id, request_method, request_path, request_headers, request_query, request_body,
        response_status, response_body, response_time_ms, ip_address, user_agent, error_message, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      apiId,
      requestMethod,
      requestPath,
      JSON.stringify(requestHeaders),
      requestQuery,
      requestBody,
      responseStatus,
      responseBody,
      responseTime,
      ipAddress,
      userAgent,
      errorMessage,
      currentTime
    ]);
  } catch (error) {
    logger.error('记录API日志失败', { error: error.message, apiId });
  }
}

/**
 * 重新加载自定义API路由
 * 注意：由于我们使用动态查找方式，不需要重新加载路由
 * 这个函数保留是为了兼容性，实际上不需要做任何事情
 */
async function reloadCustomApiRoutes() {
  logger.info('自定义API路由使用动态查找，无需重新加载');
}

module.exports = {
  initCustomApiRouter,
  reloadCustomApiRoutes,
  applyPagination, // 导出用于测试
  applyFilter // 导出用于测试
};
