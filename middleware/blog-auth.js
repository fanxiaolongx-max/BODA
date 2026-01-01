const { requireAuth } = require('./auth');
const { getAsync } = require('../db/database');
const { logger } = require('../utils/logger');

/**
 * 博客管理API认证中间件
 * 支持四种认证方式：
 * 1. 管理员Session认证（浏览器访问）- 优先使用
 * 2. 普通用户Session认证（浏览器访问）- 次优先
 * 3. 用户Token认证（x-user-token，小程序/移动端）- 第三优先
 * 4. API Token认证（x-api-token，小程序/移动端）- 备用方案
 * 
 * 认证顺序：
 * 1. 先检查是否有管理员Session（浏览器访问）
 * 2. 如果没有管理员Session，检查是否有普通用户Session
 * 3. 如果没有Session，检查是否有用户Token（x-user-token）
 * 4. 如果没有用户Token，检查是否有API Token（x-api-token）
 * 5. 如果都没有，返回401错误
 */
async function requireBlogAuth(req, res, next) {
  // 先检查管理员Session认证（浏览器访问）
  if (req.session && req.session.adminId) {
    // 有管理员Session，直接通过
    logger.debug('博客API使用管理员Session认证', {
      adminId: req.session.adminId,
      path: req.path
    });
    return next();
  }
  
  // 检查普通用户Session认证（浏览器访问）
  if (req.session && (req.session.userId || req.session.userPhone)) {
    // 有普通用户Session，允许访问（权限检查在具体的路由中进行）
    logger.debug('博客API使用普通用户Session认证', {
      userId: req.session.userId,
      userPhone: req.session.userPhone,
      path: req.path
    });
    return next();
  }
  
  // 没有Session，尝试Token认证（小程序/移动端）
  // 支持两种Token类型：
  // 1. x-user-token: 用户登录Token（从user_tokens表验证）
  // 2. x-api-token: 系统API Token（从settings表验证）
  const userToken = req.headers['x-user-token'] || req.headers['X-User-Token'];
  const apiToken = req.headers['x-api-token'] || 
                  req.headers['X-API-Token'] || 
                  req.headers['authorization']?.replace(/^Bearer\s+/i, '') ||
                  req.query.token;
  
  // 优先检查用户Token（x-user-token）
  if (userToken) {
    try {
      // 验证用户Token
      const tokenRecord = await getAsync(
        `SELECT ut.user_id, ut.expires_at, u.id, u.phone, u.name 
         FROM user_tokens ut 
         JOIN users u ON ut.user_id = u.id 
         WHERE ut.token = ? 
         AND (ut.expires_at > datetime('now', 'localtime') OR ut.expires_at >= '9999-12-31')`,
        [userToken.trim()]
      );
      
      if (tokenRecord) {
        // 用户Token验证通过
        logger.debug('博客API使用用户Token认证', {
          userId: tokenRecord.user_id,
          userPhone: tokenRecord.phone,
          ip: req.ip,
          path: req.path,
          method: req.method
        });
        return next();
      } else {
        // 用户Token无效或已过期
        logger.warn('用户Token认证失败：Token无效或已过期', {
          ip: req.ip,
          path: req.path,
          method: req.method
        });
        return res.status(401).json({
          success: false,
          message: '用户Token无效或已过期',
          code: 'UNAUTHORIZED'
        });
      }
    } catch (error) {
      logger.error('用户Token认证过程出错', {
        error: error.message,
        ip: req.ip,
        path: req.path
      });
      return res.status(500).json({
        success: false,
        message: '认证过程出错',
        code: 'SERVER_ERROR'
      });
    }
  }
  
  // 如果没有用户Token，检查API Token
  if (apiToken) {
    try {
      // 验证API Token
      const tokenSetting = await getAsync("SELECT value FROM settings WHERE key = 'custom_api_token'");
      
      if (!tokenSetting || !tokenSetting.value || tokenSetting.value.trim() === '') {
        logger.warn('API Token未配置', {
          ip: req.ip,
          path: req.path
        });
        return res.status(500).json({
          success: false,
          message: 'API Token未配置',
          code: 'SERVER_ERROR'
        });
      }
      
      const configuredToken = tokenSetting.value.trim();
      
      if (apiToken === configuredToken) {
        // API Token验证通过
        logger.debug('博客API使用API Token认证', {
          ip: req.ip,
          path: req.path,
          method: req.method
        });
        return next();
      } else {
        // API Token无效
        logger.warn('API Token认证失败：Token无效', {
          ip: req.ip,
          path: req.path,
          method: req.method
        });
        return res.status(401).json({
          success: false,
          message: 'API Token无效',
          code: 'UNAUTHORIZED'
        });
      }
    } catch (error) {
      logger.error('API Token认证过程出错', {
        error: error.message,
        ip: req.ip,
        path: req.path
      });
      return res.status(500).json({
        success: false,
        message: '认证过程出错',
        code: 'SERVER_ERROR'
      });
    }
  }
  
  // 既没有Session也没有Token，返回401
  logger.warn('博客API认证失败：缺少认证信息', {
    ip: req.ip,
    path: req.path,
    method: req.method,
    hasAdminSession: !!(req.session && req.session.adminId),
    hasUserSession: !!(req.session && (req.session.userId || req.session.userPhone)),
    hasUserToken: !!userToken,
    hasApiToken: !!apiToken
  });
  
  return res.status(401).json({
    success: false,
    message: '需要身份验证。请提供有效的用户Token（X-User-Token）、API Token（X-API-Token）或登录Session',
    code: 'UNAUTHORIZED'
  });
}

module.exports = { requireBlogAuth };

