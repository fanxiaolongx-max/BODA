const { requireAuth } = require('./auth');
const { getAsync } = require('../db/database');
const { logger } = require('../utils/logger');

/**
 * 博客管理API认证中间件
 * 支持两种认证方式：
 * 1. Session认证（浏览器访问）- 优先使用
 * 2. API Token认证（小程序/移动端访问）- 备用方案
 * 
 * 认证顺序：
 * 1. 先检查是否有Session（浏览器访问）
 * 2. 如果没有Session，检查是否有API Token（小程序/移动端）
 * 3. 如果都没有，返回401错误
 */
async function requireBlogAuth(req, res, next) {
  // 先检查Session认证（浏览器访问）
  if (req.session && req.session.adminId) {
    // 有Session，直接通过
    logger.debug('博客API使用Session认证', {
      adminId: req.session.adminId,
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
    hasSession: !!(req.session && req.session.adminId),
    hasToken: !!apiToken
  });
  
  return res.status(401).json({
    success: false,
    message: '需要身份验证。请提供有效的API Token（X-API-Token头或Authorization: Bearer）或登录Session',
    code: 'UNAUTHORIZED'
  });
}

module.exports = { requireBlogAuth };

