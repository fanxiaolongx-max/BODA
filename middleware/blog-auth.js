const { requireAuth } = require('./auth');
const { getAsync } = require('../db/database');
const { logger } = require('../utils/logger');

/**
 * 博客管理API认证中间件
 * 支持三种认证方式：
 * 1. 管理员Session认证（浏览器访问）- 优先使用
 * 2. 普通用户Session认证（浏览器访问）- 次优先
 * 3. API Token认证（小程序/移动端访问）- 备用方案
 * 
 * 认证顺序：
 * 1. 先检查是否有管理员Session（浏览器访问）
 * 2. 如果没有管理员Session，检查是否有普通用户Session
 * 3. 如果没有Session，检查是否有API Token（小程序/移动端）
 * 4. 如果都没有，返回401错误
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
  const apiToken = req.headers['x-api-token'] || 
                  req.headers['X-API-Token'] || 
                  req.headers['authorization']?.replace(/^Bearer\s+/i, '') ||
                  req.query.token;
  
  if (apiToken) {
    try {
      // 验证Token
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
        // Token验证通过
        logger.debug('博客API使用Token认证', {
          ip: req.ip,
          path: req.path,
          method: req.method
        });
        return next();
      } else {
        // Token无效
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
      logger.error('Token认证过程出错', {
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
    hasToken: !!apiToken
  });
  
  return res.status(401).json({
    success: false,
    message: '需要身份验证。请提供有效的API Token（X-API-Token头或Authorization: Bearer）或登录Session',
    code: 'UNAUTHORIZED'
  });
}

module.exports = { requireBlogAuth };

