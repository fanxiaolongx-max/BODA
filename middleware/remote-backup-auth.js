const { validateApiToken } = require('../utils/remote-backup');
const { logger } = require('../utils/logger');

/**
 * 验证远程备份API的token中间件
 * 从请求头 X-API-Token 中获取token并验证
 */
async function requireRemoteBackupAuth(req, res, next) {
  try {
    const token = req.headers['x-api-token'] || req.headers['X-API-Token'];
    
    if (!token) {
      logger.warn('远程备份API请求缺少token', {
        ip: req.ip,
        path: req.path
      });
      return res.status(401).json({
        success: false,
        message: 'Missing API token'
      });
    }

    const isValid = await validateApiToken(token);
    
    if (!isValid) {
      logger.warn('远程备份API token验证失败', {
        ip: req.ip,
        path: req.path
      });
      return res.status(403).json({
        success: false,
        message: 'Invalid API token'
      });
    }

    // Token验证通过，继续处理请求
    next();
  } catch (error) {
    logger.error('远程备份API认证中间件错误', {
      error: error.message,
      ip: req.ip,
      path: req.path
    });
    return res.status(500).json({
      success: false,
      message: 'Authentication error'
    });
  }
}

module.exports = { requireRemoteBackupAuth };

