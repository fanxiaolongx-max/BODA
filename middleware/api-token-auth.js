const { getAsync } = require('../db/database');
const { logger } = require('../utils/logger');

/**
 * API Token认证中间件
 * 验证请求中的API Token是否有效
 * 支持从请求头 X-API-Token、Authorization: Bearer 或查询参数 token 中获取Token
 */
async function requireApiToken(req, res, next) {
  try {
    // 从请求头或查询参数获取Token
    const apiToken = req.headers['x-api-token'] || 
                    req.headers['X-API-Token'] || 
                    req.headers['authorization']?.replace(/^Bearer\s+/i, '') ||
                    req.query.token;
    
    if (!apiToken) {
      logger.warn('API Token认证失败：缺少Token', {
        ip: req.ip,
        path: req.path,
        method: req.method
      });
      return res.status(401).json({
        success: false,
        message: '需要API Token认证',
        code: 'UNAUTHORIZED'
      });
    }
    
    // 验证Token
    const tokenSetting = await getAsync("SELECT value FROM settings WHERE key = 'custom_api_token'");
    
    if (!tokenSetting || !tokenSetting.value || tokenSetting.value.trim() === '') {
      logger.error('API Token未配置', {
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
    
    if (apiToken !== configuredToken) {
      logger.warn('API Token认证失败：Token无效', {
        ip: req.ip,
        path: req.path,
        method: req.method,
        hasToken: !!apiToken
      });
      return res.status(401).json({
        success: false,
        message: 'API Token无效',
        code: 'UNAUTHORIZED'
      });
    }
    
    // Token验证通过，继续处理请求
    logger.debug('API Token认证成功', {
      ip: req.ip,
      path: req.path,
      method: req.method
    });
    
    next();
  } catch (error) {
    logger.error('API Token认证中间件错误', {
      error: error.message,
      ip: req.ip,
      path: req.path
    });
    return res.status(500).json({
      success: false,
      message: '认证错误',
      code: 'SERVER_ERROR'
    });
  }
}

module.exports = { requireApiToken };
