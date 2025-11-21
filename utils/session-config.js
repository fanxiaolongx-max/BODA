const { getAsync } = require('../db/database');
const { logger } = require('./logger');

// 默认过期时间（秒）
const DEFAULT_ADMIN_SESSION_TIMEOUT = 2 * 60 * 60; // 2小时
const DEFAULT_USER_SESSION_TIMEOUT = 2 * 60 * 60; // 2小时

/**
 * 获取管理员session过期时间（秒）
 * @returns {Promise<number>} 过期时间（秒）
 */
async function getAdminSessionTimeout() {
  try {
    const setting = await getAsync("SELECT value FROM settings WHERE key = 'admin_session_timeout'");
    if (setting && setting.value) {
      const timeout = parseInt(setting.value, 10);
      if (timeout > 0) {
        return timeout;
      }
    }
  } catch (error) {
    logger.warn('获取管理员session过期时间失败，使用默认值', { error: error.message });
  }
  return DEFAULT_ADMIN_SESSION_TIMEOUT;
}

/**
 * 获取用户session过期时间（秒）
 * @returns {Promise<number>} 过期时间（秒）
 */
async function getUserSessionTimeout() {
  try {
    const setting = await getAsync("SELECT value FROM settings WHERE key = 'user_session_timeout'");
    if (setting && setting.value) {
      const timeout = parseInt(setting.value, 10);
      if (timeout > 0) {
        return timeout;
      }
    }
  } catch (error) {
    logger.warn('获取用户session过期时间失败，使用默认值', { error: error.message });
  }
  return DEFAULT_USER_SESSION_TIMEOUT;
}

/**
 * 获取管理员session过期时间（毫秒）
 * @returns {Promise<number>} 过期时间（毫秒）
 */
async function getAdminSessionTimeoutMs() {
  const timeout = await getAdminSessionTimeout();
  return timeout * 1000;
}

/**
 * 获取用户session过期时间（毫秒）
 * @returns {Promise<number>} 过期时间（毫秒）
 */
async function getUserSessionTimeoutMs() {
  const timeout = await getUserSessionTimeout();
  return timeout * 1000;
}

module.exports = {
  getAdminSessionTimeout,
  getUserSessionTimeout,
  getAdminSessionTimeoutMs,
  getUserSessionTimeoutMs,
  DEFAULT_ADMIN_SESSION_TIMEOUT,
  DEFAULT_USER_SESSION_TIMEOUT
};

