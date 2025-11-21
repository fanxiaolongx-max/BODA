const { getAsync } = require('../db/database');
const cache = require('./cache');

// 缓存设置，避免频繁查询数据库
const SETTINGS_CACHE_TTL = 5 * 60 * 1000; // 5分钟
const CACHE_KEY_DEBUG_LOGGING = 'settings:debug_logging_enabled';

// 静态资源路径模式（不记录日志）
const STATIC_RESOURCE_PATTERNS = [
  /^\/products\//,           // 产品图片
  /^\/uploads\//,            // 上传文件
  /^\/static\//,             // 静态资源
  /\.(png|jpg|jpeg|gif|webp|svg|ico|css|js|woff|woff2|ttf|eot)$/i  // 静态文件扩展名
];

// 健康检查和监控端点（不记录日志）
const HEALTH_CHECK_PATHS = [
  '/health',
  '/favicon.ico'
];

/**
 * 检查是否应该记录详细日志
 * @returns {Promise<boolean>}
 */
async function shouldLogDebug() {
  // 先检查缓存
  const cached = cache.get(CACHE_KEY_DEBUG_LOGGING);
  if (cached !== null && cached !== undefined) {
    return cached === 'true';
  }

  try {
    const setting = await getAsync(
      "SELECT value FROM settings WHERE key = 'debug_logging_enabled'"
    );
    const enabled = setting && setting.value === 'true';
    // 缓存结果
    cache.set(CACHE_KEY_DEBUG_LOGGING, enabled ? 'true' : 'false', SETTINGS_CACHE_TTL);
    return enabled;
  } catch (error) {
    // 如果查询失败，默认返回 false（不记录详细日志）
    console.error('Failed to check debug logging setting:', error);
    return false;
  }
}

/**
 * 检查是否应该记录请求日志
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Promise<boolean>}
 */
async function shouldLogRequest(req, res) {
  const path = req.path || req.url;
  
  // 如果是静态资源，不记录
  if (STATIC_RESOURCE_PATTERNS.some(pattern => pattern.test(path))) {
    return false;
  }
  
  // 如果是健康检查端点，不记录
  if (HEALTH_CHECK_PATHS.includes(path)) {
    return false;
  }
  
  // 如果是304 Not Modified（缓存命中），不记录（除非开启详细日志）
  if (res.statusCode === 304) {
    return await shouldLogDebug();
  }
  
  // 其他情况都记录
  return true;
}

/**
 * 检查是否应该记录性能日志
 * @param {Object} req - Express request object
 * @param {number} duration - 请求耗时（毫秒）
 * @returns {Promise<boolean>}
 */
async function shouldLogPerformance(req, duration) {
  const path = req.path || req.url;
  
  // 如果是静态资源，不记录
  if (STATIC_RESOURCE_PATTERNS.some(pattern => pattern.test(path))) {
    return false;
  }
  
  // 如果是健康检查端点，不记录
  if (HEALTH_CHECK_PATHS.includes(path)) {
    return false;
  }
  
  // 如果开启了详细日志，记录所有请求的性能
  const debugEnabled = await shouldLogDebug();
  if (debugEnabled) {
    return true;
  }
  
  // 否则只记录慢请求（>1秒）或错误请求
  return duration > 1000;
}

/**
 * 清除设置缓存（当设置更新时调用）
 */
function clearSettingsCache() {
  cache.delete(CACHE_KEY_DEBUG_LOGGING);
}

module.exports = {
  shouldLogDebug,
  shouldLogRequest,
  shouldLogPerformance,
  clearSettingsCache
};

