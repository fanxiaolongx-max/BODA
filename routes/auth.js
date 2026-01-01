const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { getAsync, runAsync } = require('../db/database');
const { loginValidation, phoneValidation, codeValidation, validate } = require('../middleware/validation');
const { logAction, logger } = require('../utils/logger');
const { body } = require('express-validator');
const { createVerificationCode, verifyCode } = require('../utils/verification');
const { getAdminSessionTimeoutMs, getUserSessionTimeoutMs } = require('../utils/session-config');

const router = express.Router();

/**
 * 生成用户Token
 * @param {number} userId - 用户ID
 * @returns {Promise<string>} Token字符串
 */
async function generateUserToken(userId) {
  // 生成随机Token（64字符）
  const token = crypto.randomBytes(32).toString('hex');
  
  // 获取Token过期时间（默认2小时，与Session一致）
  // 如果设置为0，表示Token永不过期
  const userTimeoutMs = await getUserSessionTimeoutMs();
  const expiresAtSeconds = Math.floor(userTimeoutMs / 1000);
  
  logger.debug('生成用户Token', { 
    userId, 
    userTimeoutMs, 
    expiresAtSeconds,
    willNeverExpire: expiresAtSeconds <= 0
  });
  
  let expiresAt;
  if (expiresAtSeconds <= 0) {
    // Token永不过期：设置为一个很远的未来日期（9999-12-31 23:59:59）
    expiresAt = '9999-12-31 23:59:59';
    logger.debug('生成永不过期的用户Token', { userId, expiresAt });
  } else {
    // 使用SQLite的datetime函数计算过期时间
    expiresAt = null; // 将在SQL中使用表达式
    logger.debug('生成有过期时间的用户Token', { userId, expiresAtSeconds, expiresInMinutes: expiresAtSeconds / 60 });
  }
  
  // 保存Token到数据库
  if (expiresAtSeconds <= 0) {
    // 永不过期Token：直接设置过期时间
    await runAsync(
      `INSERT INTO user_tokens (user_id, token, expires_at) 
       VALUES (?, ?, ?)`,
      [userId, token, expiresAt]
    );
  } else {
    // 有过期时间的Token：使用SQLite的datetime函数计算过期时间（使用本地时间，与created_at保持一致）
    await runAsync(
      `INSERT INTO user_tokens (user_id, token, expires_at) 
       VALUES (?, ?, datetime('now', 'localtime', '+' || ? || ' seconds'))`,
      [userId, token, expiresAtSeconds]
    );
  }
  
  return token;
}

/**
 * 验证用户Token
 * @param {string} token - Token字符串
 * @returns {Promise<Object|null>} 用户信息或null
 */
async function verifyUserToken(token) {
  if (!token) {
    logger.debug('验证用户Token失败：Token为空');
    return null;
  }
  
  // 去除首尾空格
  const trimmedToken = token.trim();
  
  try {
    // 查找有效的Token（包括永不过期的Token）
    // 永不过期的Token：expires_at >= '9999-12-31'
    // 有过期时间的Token：expires_at > datetime('now', 'localtime')（使用本地时间，与created_at保持一致）
    const tokenRecord = await getAsync(
      `SELECT ut.user_id, ut.expires_at, u.id, u.phone, u.name 
       FROM user_tokens ut 
       JOIN users u ON ut.user_id = u.id 
       WHERE ut.token = ? 
       AND (ut.expires_at > datetime('now', 'localtime') OR ut.expires_at >= '9999-12-31')`,
      [trimmedToken]
    );
    
    if (!tokenRecord) {
      logger.debug('验证用户Token失败：Token不存在或已过期', { 
        tokenLength: trimmedToken.length,
        tokenPrefix: trimmedToken.substring(0, 8) + '...'
      });
      return null;
    }
    
    // 检查是否为永不过期Token
    const isNeverExpire = tokenRecord.expires_at >= '9999-12-31';
    
    logger.debug('验证用户Token成功', { 
      userId: tokenRecord.user_id,
      phone: tokenRecord.phone,
      isNeverExpire: isNeverExpire,
      expiresAt: tokenRecord.expires_at
    });
    
    return {
      id: tokenRecord.user_id,
      phone: tokenRecord.phone,
      name: tokenRecord.name
    };
  } catch (error) {
    logger.error('验证用户Token失败', { error: error.message, stack: error.stack });
    return null;
  }
}

/**
 * 清除用户的所有过期Token
 * @param {number} userId - 用户ID（可选）
 * @param {boolean} includeNeverExpire - 是否清理永不过期的Token（默认false）
 * @param {string} excludeToken - 要排除的Token（不删除此Token，可选）
 */
async function cleanupExpiredTokens(userId = null, includeNeverExpire = false, excludeToken = null) {
  try {
    if (userId) {
      if (includeNeverExpire) {
        // 清理该用户的所有Token（包括永不过期的），但排除指定的Token
        if (excludeToken) {
          await runAsync(
            'DELETE FROM user_tokens WHERE user_id = ? AND token != ?',
            [userId, excludeToken]
          );
        } else {
          await runAsync(
            'DELETE FROM user_tokens WHERE user_id = ?',
            [userId]
          );
        }
      } else {
        // 只清理过期的Token（使用本地时间，与created_at保持一致）
        await runAsync(
          'DELETE FROM user_tokens WHERE user_id = ? AND expires_at <= datetime("now", "localtime")',
          [userId]
        );
      }
    } else {
      if (includeNeverExpire) {
        // 清理所有Token（包括永不过期的），但排除指定的Token
        if (excludeToken) {
          await runAsync(
            'DELETE FROM user_tokens WHERE token != ?',
            [excludeToken]
          );
        } else {
          await runAsync('DELETE FROM user_tokens');
        }
      } else {
        // 只清理过期的Token（使用本地时间，与created_at保持一致）
        await runAsync(
          'DELETE FROM user_tokens WHERE expires_at <= datetime("now", "localtime")'
        );
      }
    }
  } catch (error) {
    logger.error('清理Token失败', { error: error.message, userId, includeNeverExpire });
  }
}

/**
 * 获取管理员锁定配置（从数据库设置或使用默认值）
 */
async function getAdminLockoutConfig() {
  try {
    const timeWindow = await getAsync("SELECT value FROM settings WHERE key = 'admin_lockout_time_window_minutes'");
    const maxLockout = await getAsync("SELECT value FROM settings WHERE key = 'admin_max_lockout_hours'");
    const threshold1 = await getAsync("SELECT value FROM settings WHERE key = 'admin_lockout_threshold_1'");
    const threshold2 = await getAsync("SELECT value FROM settings WHERE key = 'admin_lockout_threshold_2'");
    const threshold3 = await getAsync("SELECT value FROM settings WHERE key = 'admin_lockout_threshold_3'");
    const threshold4 = await getAsync("SELECT value FROM settings WHERE key = 'admin_lockout_threshold_4'");
    const progressiveDelay = await getAsync("SELECT value FROM settings WHERE key = 'admin_progressive_delay_enabled'");
    
    return {
      timeWindowMinutes: timeWindow ? parseInt(timeWindow.value) || 30 : 30,
      maxLockoutHours: maxLockout ? parseInt(maxLockout.value) || 4 : 4,
      threshold1: threshold1 ? parseInt(threshold1.value) || 10 : 10,
      threshold2: threshold2 ? parseInt(threshold2.value) || 20 : 20,
      threshold3: threshold3 ? parseInt(threshold3.value) || 30 : 30,
      threshold4: threshold4 ? parseInt(threshold4.value) || 40 : 40,
      progressiveDelayEnabled: progressiveDelay ? progressiveDelay.value === 'true' : true
    };
  } catch (error) {
    logger.warn('获取管理员锁定配置失败，使用默认值', { error: error.message });
    return {
      timeWindowMinutes: 30,
      maxLockoutHours: 4,
      threshold1: 10,
      threshold2: 20,
      threshold3: 30,
      threshold4: 40,
      progressiveDelayEnabled: true
    };
  }
}

/**
 * 获取用户锁定配置（从数据库设置或使用默认值）
 */
async function getUserLockoutConfig() {
  try {
    const timeWindow = await getAsync("SELECT value FROM settings WHERE key = 'user_lockout_time_window_minutes'");
    const maxLockout = await getAsync("SELECT value FROM settings WHERE key = 'user_max_lockout_hours'");
    const threshold1 = await getAsync("SELECT value FROM settings WHERE key = 'user_lockout_threshold_1'");
    const threshold2 = await getAsync("SELECT value FROM settings WHERE key = 'user_lockout_threshold_2'");
    const threshold3 = await getAsync("SELECT value FROM settings WHERE key = 'user_lockout_threshold_3'");
    const threshold4 = await getAsync("SELECT value FROM settings WHERE key = 'user_lockout_threshold_4'");
    const progressiveDelay = await getAsync("SELECT value FROM settings WHERE key = 'user_progressive_delay_enabled'");
    
    return {
      timeWindowMinutes: timeWindow ? parseInt(timeWindow.value) || 30 : 30,
      maxLockoutHours: maxLockout ? parseInt(maxLockout.value) || 4 : 4,
      threshold1: threshold1 ? parseInt(threshold1.value) || 10 : 10,
      threshold2: threshold2 ? parseInt(threshold2.value) || 20 : 20,
      threshold3: threshold3 ? parseInt(threshold3.value) || 30 : 30,
      threshold4: threshold4 ? parseInt(threshold4.value) || 40 : 40,
      progressiveDelayEnabled: progressiveDelay ? progressiveDelay.value === 'true' : true
    };
  } catch (error) {
    logger.warn('获取用户锁定配置失败，使用默认值', { error: error.message });
    return {
      timeWindowMinutes: 30,
      maxLockoutHours: 4,
      threshold1: 10,
      threshold2: 20,
      threshold3: 30,
      threshold4: 40,
      progressiveDelayEnabled: true
    };
  }
}

/**
 * 获取IP速率限制配置（通用）
 */
async function getIpRateLimitConfig() {
  try {
    const ipLimitSettings = await getAsync("SELECT value FROM settings WHERE key = 'ip_rate_limit_attempts'");
    const ipWindowSettings = await getAsync("SELECT value FROM settings WHERE key = 'ip_rate_limit_window_minutes'");
    
    return {
      ipRateLimitAttempts: ipLimitSettings ? parseInt(ipLimitSettings.value) || 5 : 5,
      ipRateLimitWindowMinutes: ipWindowSettings ? parseInt(ipWindowSettings.value) || 15 : 15
    };
  } catch (error) {
    logger.warn('获取IP速率限制配置失败，使用默认值', { error: error.message });
    return {
      ipRateLimitAttempts: 5,
      ipRateLimitWindowMinutes: 15
    };
  }
}

/**
 * 计算锁定时间（渐进式锁定，支持自定义阈值）
 * @param {number} failedCount - 失败次数
 * @param {Object} config - 锁定配置对象
 * @returns {number} 锁定时间（毫秒）
 */
function calculateLockoutTime(failedCount, config) {
  if (failedCount >= config.threshold4) {
    return config.maxLockoutHours * 60 * 60 * 1000; // 最大锁定时间
  } else if (failedCount >= config.threshold3) {
    return 60 * 60 * 1000; // 1小时
  } else if (failedCount >= config.threshold2) {
    return 30 * 60 * 1000; // 30分钟
  } else if (failedCount >= config.threshold1) {
    return 15 * 60 * 1000; // 15分钟
  }
  return 0; // 未锁定
}

/**
 * 计算渐进式延迟时间
 * @param {number} failedCount - 失败次数
 * @param {boolean} enabled - 是否启用渐进延迟
 * @param {number} threshold1 - 阈值1（触发硬锁定）
 * @returns {number} 延迟时间（毫秒），0表示无延迟
 */
function calculateProgressiveDelay(failedCount, enabled, threshold1) {
  if (!enabled || failedCount >= threshold1) {
    return 0; // 未启用或达到硬锁定阈值，不再使用延迟
  } else if (failedCount >= 7) {
    return 30 * 1000; // 30秒延迟
  } else if (failedCount >= 5) {
    return 15 * 1000; // 15秒延迟
  } else if (failedCount >= 3) {
    return 5 * 1000; // 5秒延迟
  }
  return 0; // 3次以下无延迟
}

/**
 * 检查管理员是否被锁定（支持渐进延迟）
 * @param {string} username - 管理员用户名
 * @returns {Promise<Object|null>} 锁定信息，如果未锁定返回null，包含渐进延迟信息
 */
async function checkAdminLockout(username) {
  const attempt = await getAsync(
    'SELECT * FROM admin_login_attempts WHERE username = ?',
    [username]
  );

  if (!attempt) {
    return null;
  }

  const now = new Date();
  const failedCount = attempt.failed_count || 0;

  // 检查硬锁定
  if (attempt.locked_until) {
    const lockedUntilStr = attempt.locked_until;
    if (!lockedUntilStr) {
      return null;
    }

    const lockedUntil = new Date(lockedUntilStr.replace(' ', 'T'));

    if (now < lockedUntil) {
      // 仍在锁定期间
      const remainingMs = lockedUntil.getTime() - now.getTime();
      if (remainingMs <= 0) {
        // 锁定已过期，清除锁定并恢复用户状态
        await runAsync(
          'UPDATE admin_login_attempts SET locked_until = NULL WHERE username = ?',
          [username]
        );
        // 自动激活用户
        await runAsync(
          'UPDATE admins SET status = ? WHERE username = ?',
          ['active', username]
        );
        return null;
      }
      
      const remainingMinutes = Math.ceil(remainingMs / (60 * 1000));
      const remainingHours = Math.floor(remainingMinutes / 60);
      const remainingMins = remainingMinutes % 60;
      
      let lockoutMessage = 'Account is locked. ';
      if (remainingHours > 0) {
        lockoutMessage += `Please try again in ${remainingHours} hour(s) and ${remainingMins} minute(s).`;
      } else if (remainingMinutes > 0) {
        lockoutMessage += `Please try again in ${remainingMinutes} minute(s).`;
      } else {
        lockoutMessage += `Please try again in less than 1 minute.`;
      }
      
      return {
        isLocked: true,
        lockedUntil: lockedUntil,
        remainingMs: remainingMs,
        message: lockoutMessage,
        progressiveDelay: 0
      };
    }

    // 锁定已过期，清除锁定并恢复用户状态
    await runAsync(
      'UPDATE admin_login_attempts SET locked_until = NULL WHERE username = ?',
      [username]
    );
    // 自动激活用户
    await runAsync(
      'UPDATE admins SET status = ? WHERE username = ?',
      ['active', username]
    );
  }

  // 检查渐进延迟（未硬锁定时）
  const progressiveDelay = calculateProgressiveDelay(failedCount);
  if (progressiveDelay > 0) {
    return {
      isLocked: false,
      progressiveDelay: progressiveDelay,
      failedCount: failedCount,
      message: `Too many failed attempts. Please wait ${progressiveDelay / 1000} seconds before trying again.`
    };
  }

  return null;
}

/**
 * 记录登录失败（带时间窗口重置）
 * @param {string} username - 管理员用户名
 * @param {number} timeWindowMinutes - 时间窗口（分钟）
 * @returns {Promise<Object>} 失败信息，包含锁定时间（毫秒）
 */
async function recordLoginFailure(username, timeWindowMinutes = 30) {
  const attempt = await getAsync(
    'SELECT * FROM admin_login_attempts WHERE username = ?',
    [username]
  );

  const now = new Date();
  let failedCount = 1;
  let firstAttemptAt = now;

  if (attempt) {
    // 检查是否已锁定
    if (attempt.locked_until) {
      const lockedUntil = new Date(attempt.locked_until.replace(' ', 'T'));
      if (now < lockedUntil) {
        // 仍在锁定期间，不更新计数
        return { 
          failedCount: attempt.failed_count || 0, 
          lockedUntil: attempt.locked_until, 
          lockoutTime: 0 
        };
      }
    }

    // 检查时间窗口重置
    const lastAttemptAt = attempt.last_attempt_at ? new Date(attempt.last_attempt_at.replace(' ', 'T')) : null;
    const firstAttemptAtDate = attempt.first_attempt_at ? new Date(attempt.first_attempt_at.replace(' ', 'T')) : null;
    
    if (lastAttemptAt && firstAttemptAtDate) {
      const timeSinceLastAttempt = (now.getTime() - lastAttemptAt.getTime()) / (60 * 1000); // 分钟
      const timeSinceFirstAttempt = (now.getTime() - firstAttemptAtDate.getTime()) / (60 * 1000); // 分钟
      
      // 如果距离上次尝试超过时间窗口，重置计数
      if (timeSinceLastAttempt > timeWindowMinutes) {
        failedCount = 1;
        firstAttemptAt = now;
      } else {
        // 如果距离首次尝试超过时间窗口，重置计数
        if (timeSinceFirstAttempt > timeWindowMinutes) {
          failedCount = 1;
          firstAttemptAt = now;
        } else {
          // 在时间窗口内，增加计数
          failedCount = (attempt.failed_count || 0) + 1;
          firstAttemptAt = firstAttemptAtDate;
        }
      }
    } else {
      // 没有时间戳，使用现有计数
      failedCount = (attempt.failed_count || 0) + 1;
      if (firstAttemptAtDate) {
        firstAttemptAt = firstAttemptAtDate;
      }
    }
  }

  const config = await getAdminLockoutConfig();
  const lockoutTime = calculateLockoutTime(failedCount, config);
  
  // 使用 SQLite 的 datetime 函数计算锁定时间，避免时区问题
  let lockedUntil = null;
  if (lockoutTime > 0) {
    const lockedUntilDate = new Date(now.getTime() + lockoutTime);
    
    // 格式化为 SQLite 可以接受的格式：'YYYY-MM-DD HH:MM:SS'
    const year = lockedUntilDate.getFullYear();
    const month = String(lockedUntilDate.getMonth() + 1).padStart(2, '0');
    const day = String(lockedUntilDate.getDate()).padStart(2, '0');
    const hour = String(lockedUntilDate.getHours()).padStart(2, '0');
    const minute = String(lockedUntilDate.getMinutes()).padStart(2, '0');
    const second = String(lockedUntilDate.getSeconds()).padStart(2, '0');
    lockedUntil = `${year}-${month}-${day} ${hour}:${minute}:${second}`;
    
    // 锁定后自动停用用户
    await runAsync(
      'UPDATE admins SET status = ? WHERE username = ?',
      ['inactive', username]
    );
    logger.warn('管理员账户已自动停用（锁定）', { username, failedCount, lockoutTime });
  }

  // 格式化 first_attempt_at
  const firstAttemptAtStr = `${firstAttemptAt.getFullYear()}-${String(firstAttemptAt.getMonth() + 1).padStart(2, '0')}-${String(firstAttemptAt.getDate()).padStart(2, '0')} ${String(firstAttemptAt.getHours()).padStart(2, '0')}:${String(firstAttemptAt.getMinutes()).padStart(2, '0')}:${String(firstAttemptAt.getSeconds()).padStart(2, '0')}`;

  if (attempt) {
    await runAsync(
      `UPDATE admin_login_attempts 
       SET failed_count = ?, locked_until = ?, first_attempt_at = ?, last_attempt_at = datetime('now', 'localtime'), 
           updated_at = datetime('now', 'localtime')
       WHERE username = ?`,
      [failedCount, lockedUntil, firstAttemptAtStr, username]
    );
  } else {
    await runAsync(
      `INSERT INTO admin_login_attempts (username, failed_count, locked_until, first_attempt_at, last_attempt_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'), datetime('now', 'localtime'))`,
      [username, failedCount, lockedUntil, firstAttemptAtStr]
    );
  }

  return { 
    failedCount, 
    lockedUntil: lockedUntil, 
    lockoutTime 
  };
}

/**
 * 清除登录失败记录（登录成功时调用）
 * @param {string} username - 管理员用户名
 */
async function clearLoginFailure(username) {
  await runAsync(
    'DELETE FROM admin_login_attempts WHERE username = ?',
    [username]
  );
}

/**
 * 检查用户是否被锁定（基于手机号，支持渐进延迟）
 * @param {string} phone - 用户手机号
 * @returns {Promise<Object|null>} 锁定信息，如果未锁定返回null，包含渐进延迟信息
 */
async function checkUserLockout(phone) {
  const attempt = await getAsync(
    'SELECT * FROM user_login_attempts WHERE phone = ?',
    [phone]
  );

  if (!attempt) {
    return null;
  }

  const now = new Date();
  const failedCount = attempt.failed_count || 0;

  // 检查硬锁定
  if (attempt.locked_until) {
    const lockedUntilStr = attempt.locked_until;
    if (!lockedUntilStr) {
      return null;
    }

    const lockedUntil = new Date(lockedUntilStr.replace(' ', 'T'));

    if (now < lockedUntil) {
      // 仍在锁定期间
      const remainingMs = lockedUntil.getTime() - now.getTime();
      if (remainingMs <= 0) {
        // 锁定已过期，清除锁定
        await runAsync(
          'UPDATE user_login_attempts SET locked_until = NULL WHERE phone = ?',
          [phone]
        );
        return null;
      }
      
      const remainingMinutes = Math.ceil(remainingMs / (60 * 1000));
      const remainingHours = Math.floor(remainingMinutes / 60);
      const remainingMins = remainingMinutes % 60;
      
      let lockoutMessage = 'Account is locked. ';
      if (remainingHours > 0) {
        lockoutMessage += `Please try again in ${remainingHours} hour(s) and ${remainingMins} minute(s).`;
      } else if (remainingMinutes > 0) {
        lockoutMessage += `Please try again in ${remainingMinutes} minute(s).`;
      } else {
        lockoutMessage += `Please try again in less than 1 minute.`;
      }
      
      return {
        isLocked: true,
        lockedUntil: lockedUntil,
        remainingMs: remainingMs,
        message: lockoutMessage,
        progressiveDelay: 0
      };
    }

    // 锁定已过期，清除锁定
    await runAsync(
      'UPDATE user_login_attempts SET locked_until = NULL WHERE phone = ?',
      [phone]
    );
  }

  // 检查渐进延迟（未硬锁定时）
  const progressiveDelay = calculateProgressiveDelay(failedCount);
  if (progressiveDelay > 0) {
    return {
      isLocked: false,
      progressiveDelay: progressiveDelay,
      failedCount: failedCount,
      message: `Too many failed attempts. Please wait ${progressiveDelay / 1000} seconds before trying again.`
    };
  }

  return null;
}

/**
 * 记录用户登录失败（带时间窗口重置）
 * @param {string} phone - 用户手机号
 * @param {number} timeWindowMinutes - 时间窗口（分钟）
 * @returns {Promise<Object>} 失败信息，包含锁定时间（毫秒）
 */
async function recordUserLoginFailure(phone, timeWindowMinutes = 30) {
  const attempt = await getAsync(
    'SELECT * FROM user_login_attempts WHERE phone = ?',
    [phone]
  );

  const now = new Date();
  let failedCount = 1;
  let firstAttemptAt = now;

  if (attempt) {
    // 检查是否已锁定
    if (attempt.locked_until) {
      const lockedUntil = new Date(attempt.locked_until.replace(' ', 'T'));
      if (now < lockedUntil) {
        // 仍在锁定期间，不更新计数
        return { 
          failedCount: attempt.failed_count || 0, 
          lockedUntil: attempt.locked_until, 
          lockoutTime: 0 
        };
      }
    }

    // 检查时间窗口重置
    const lastAttemptAt = attempt.last_attempt_at ? new Date(attempt.last_attempt_at.replace(' ', 'T')) : null;
    const firstAttemptAtDate = attempt.first_attempt_at ? new Date(attempt.first_attempt_at.replace(' ', 'T')) : null;
    
    if (lastAttemptAt && firstAttemptAtDate) {
      const timeSinceLastAttempt = (now.getTime() - lastAttemptAt.getTime()) / (60 * 1000); // 分钟
      const timeSinceFirstAttempt = (now.getTime() - firstAttemptAtDate.getTime()) / (60 * 1000); // 分钟
      
      // 如果距离上次尝试超过时间窗口，重置计数
      if (timeSinceLastAttempt > timeWindowMinutes) {
        failedCount = 1;
        firstAttemptAt = now;
      } else {
        // 如果距离首次尝试超过时间窗口，重置计数
        if (timeSinceFirstAttempt > timeWindowMinutes) {
          failedCount = 1;
          firstAttemptAt = now;
        } else {
          // 在时间窗口内，增加计数
          failedCount = (attempt.failed_count || 0) + 1;
          firstAttemptAt = firstAttemptAtDate;
        }
      }
    } else {
      // 没有时间戳，使用现有计数
      failedCount = (attempt.failed_count || 0) + 1;
      if (firstAttemptAtDate) {
        firstAttemptAt = firstAttemptAtDate;
      }
    }
  }

  const config = await getUserLockoutConfig();
  const lockoutTime = calculateLockoutTime(failedCount, config);
  
  let lockedUntil = null;
  if (lockoutTime > 0) {
    const lockedUntilDate = new Date(now.getTime() + lockoutTime);
    
    const year = lockedUntilDate.getFullYear();
    const month = String(lockedUntilDate.getMonth() + 1).padStart(2, '0');
    const day = String(lockedUntilDate.getDate()).padStart(2, '0');
    const hour = String(lockedUntilDate.getHours()).padStart(2, '0');
    const minute = String(lockedUntilDate.getMinutes()).padStart(2, '0');
    const second = String(lockedUntilDate.getSeconds()).padStart(2, '0');
    lockedUntil = `${year}-${month}-${day} ${hour}:${minute}:${second}`;
    
    logger.warn('用户账户已锁定', { phone, failedCount, lockoutTime });
  }

  // 格式化 first_attempt_at
  const firstAttemptAtStr = `${firstAttemptAt.getFullYear()}-${String(firstAttemptAt.getMonth() + 1).padStart(2, '0')}-${String(firstAttemptAt.getDate()).padStart(2, '0')} ${String(firstAttemptAt.getHours()).padStart(2, '0')}:${String(firstAttemptAt.getMinutes()).padStart(2, '0')}:${String(firstAttemptAt.getSeconds()).padStart(2, '0')}`;

  if (attempt) {
    await runAsync(
      `UPDATE user_login_attempts 
       SET failed_count = ?, locked_until = ?, first_attempt_at = ?, last_attempt_at = datetime('now', 'localtime'), 
           updated_at = datetime('now', 'localtime')
       WHERE phone = ?`,
      [failedCount, lockedUntil, firstAttemptAtStr, phone]
    );
  } else {
    await runAsync(
      `INSERT INTO user_login_attempts (phone, failed_count, locked_until, first_attempt_at, last_attempt_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'), datetime('now', 'localtime'))`,
      [phone, failedCount, lockedUntil, firstAttemptAtStr]
    );
  }

  return { 
    failedCount, 
    lockedUntil: lockedUntil, 
    lockoutTime 
  };
}

/**
 * 清除用户登录失败记录（登录成功时调用）
 * @param {string} phone - 用户手机号
 */
async function clearUserLoginFailure(phone) {
  await runAsync(
    'DELETE FROM user_login_attempts WHERE phone = ?',
    [phone]
  );
}

/**
 * 检查IP是否被阻止
 * @param {string} ipAddress - IP地址
 * @param {number} rateLimitAttempts - IP速率限制尝试次数
 * @param {number} rateLimitWindowMinutes - IP速率限制时间窗口（分钟）
 * @returns {Promise<Object|null>} 阻止信息，如果未阻止返回null
 */
async function checkIpBlock(ipAddress, rateLimitAttempts = 5, rateLimitWindowMinutes = 15) {
  const attempt = await getAsync(
    'SELECT * FROM ip_login_attempts WHERE ip_address = ?',
    [ipAddress]
  );

  if (!attempt) {
    return null;
  }

  const now = new Date();
  
  // 检查是否被阻止
  if (attempt.blocked_until) {
    const blockedUntil = new Date(attempt.blocked_until.replace(' ', 'T'));
    if (now < blockedUntil) {
      const remainingMs = blockedUntil.getTime() - now.getTime();
      const remainingMinutes = Math.ceil(remainingMs / (60 * 1000));
      return {
        isBlocked: true,
        blockedUntil: blockedUntil,
        remainingMs: remainingMs,
        message: `IP address is temporarily blocked. Please try again in ${remainingMinutes} minute(s).`
      };
    } else {
      // 阻止已过期，清除
      await runAsync(
        'UPDATE ip_login_attempts SET blocked_until = NULL, failed_count = 0 WHERE ip_address = ?',
        [ipAddress]
      );
    }
  }

  // 检查时间窗口重置
  const lastAttemptAt = attempt.last_attempt_at ? new Date(attempt.last_attempt_at.replace(' ', 'T')) : null;
  if (lastAttemptAt) {
    const timeSinceLastAttempt = (now.getTime() - lastAttemptAt.getTime()) / (60 * 1000);
    if (timeSinceLastAttempt > rateLimitWindowMinutes) {
      // 超过时间窗口，重置计数
      await runAsync(
        'UPDATE ip_login_attempts SET failed_count = 0, first_attempt_at = datetime("now", "localtime") WHERE ip_address = ?',
        [ipAddress]
      );
      return null;
    }
  }

  // 检查是否超过速率限制
  const failedCount = attempt.failed_count || 0;
  if (failedCount >= rateLimitAttempts) {
    // 触发IP阻止（15分钟）
    const blockDuration = 15 * 60 * 1000; // 15分钟
    const blockedUntilDate = new Date(now.getTime() + blockDuration);
    const blockedUntilStr = `${blockedUntilDate.getFullYear()}-${String(blockedUntilDate.getMonth() + 1).padStart(2, '0')}-${String(blockedUntilDate.getDate()).padStart(2, '0')} ${String(blockedUntilDate.getHours()).padStart(2, '0')}:${String(blockedUntilDate.getMinutes()).padStart(2, '0')}:${String(blockedUntilDate.getSeconds()).padStart(2, '0')}`;
    
    await runAsync(
      'UPDATE ip_login_attempts SET blocked_until = ?, last_attempt_at = datetime("now", "localtime"), updated_at = datetime("now", "localtime") WHERE ip_address = ?',
      [blockedUntilStr, ipAddress]
    );
    
    return {
      isBlocked: true,
      blockedUntil: blockedUntilDate,
      remainingMs: blockDuration,
      message: `IP address is temporarily blocked for ${rateLimitWindowMinutes} minutes due to too many failed attempts.`
    };
  }

  return null;
}

/**
 * 记录IP登录失败
 * @param {string} ipAddress - IP地址
 * @param {number} rateLimitWindowMinutes - IP速率限制时间窗口（分钟）
 * @returns {Promise<Object>} 失败信息
 */
async function recordIpFailure(ipAddress, rateLimitWindowMinutes = 15) {
  const attempt = await getAsync(
    'SELECT * FROM ip_login_attempts WHERE ip_address = ?',
    [ipAddress]
  );

  const now = new Date();
  let failedCount = 1;
  let firstAttemptAt = now;

  if (attempt) {
    // 检查时间窗口重置
    const lastAttemptAt = attempt.last_attempt_at ? new Date(attempt.last_attempt_at.replace(' ', 'T')) : null;
    const firstAttemptAtDate = attempt.first_attempt_at ? new Date(attempt.first_attempt_at.replace(' ', 'T')) : null;
    
    if (lastAttemptAt && firstAttemptAtDate) {
      const timeSinceLastAttempt = (now.getTime() - lastAttemptAt.getTime()) / (60 * 1000);
      const timeSinceFirstAttempt = (now.getTime() - firstAttemptAtDate.getTime()) / (60 * 1000);
      
      if (timeSinceLastAttempt > rateLimitWindowMinutes) {
        failedCount = 1;
        firstAttemptAt = now;
      } else if (timeSinceFirstAttempt > rateLimitWindowMinutes) {
        failedCount = 1;
        firstAttemptAt = now;
      } else {
        failedCount = (attempt.failed_count || 0) + 1;
        firstAttemptAt = firstAttemptAtDate;
      }
    } else {
      failedCount = (attempt.failed_count || 0) + 1;
      if (firstAttemptAtDate) {
        firstAttemptAt = firstAttemptAtDate;
      }
    }
  }

  const firstAttemptAtStr = `${firstAttemptAt.getFullYear()}-${String(firstAttemptAt.getMonth() + 1).padStart(2, '0')}-${String(firstAttemptAt.getDate()).padStart(2, '0')} ${String(firstAttemptAt.getHours()).padStart(2, '0')}:${String(firstAttemptAt.getMinutes()).padStart(2, '0')}:${String(firstAttemptAt.getSeconds()).padStart(2, '0')}`;

  if (attempt) {
    await runAsync(
      `UPDATE ip_login_attempts 
       SET failed_count = ?, first_attempt_at = ?, last_attempt_at = datetime('now', 'localtime'), 
           updated_at = datetime('now', 'localtime')
       WHERE ip_address = ?`,
      [failedCount, firstAttemptAtStr, ipAddress]
    );
  } else {
    await runAsync(
      `INSERT INTO ip_login_attempts (ip_address, failed_count, first_attempt_at, last_attempt_at, created_at, updated_at)
       VALUES (?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'), datetime('now', 'localtime'))`,
      [ipAddress, failedCount, firstAttemptAtStr]
    );
  }

  return { failedCount };
}

/**
 * 清除IP失败记录（登录成功时调用）
 * @param {string} ipAddress - IP地址
 */
async function clearIpFailure(ipAddress) {
  await runAsync(
    'DELETE FROM ip_login_attempts WHERE ip_address = ?',
    [ipAddress]
  );
}

/**
 * 记录登录尝试到审计表
 * @param {string} accountType - 账户类型 ('admin' 或 'user')
 * @param {string} accountIdentifier - 账户标识符 (username 或 phone)
 * @param {string} ipAddress - IP地址
 * @param {string} userAgent - User-Agent
 * @param {boolean} success - 是否成功
 * @param {string} failureReason - 失败原因（如果失败）
 */
async function logLoginAttempt(accountType, accountIdentifier, ipAddress, userAgent, success, failureReason = null) {
  try {
    await runAsync(
      `INSERT INTO login_attempts_audit (account_type, account_identifier, ip_address, user_agent, success, failure_reason, created_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))`,
      [accountType, accountIdentifier, ipAddress || null, userAgent || null, success ? 1 : 0, failureReason || null]
    );
  } catch (error) {
    logger.error('记录登录尝试审计日志失败', { error: error.message, accountType, accountIdentifier });
  }
}

/**
 * POST /api/auth/admin/login
 * Admin login
 * @body {string} username - Admin username
 * @body {string} password - Admin password
 * @returns {Object} Admin object with id, username, name, and role
 */
router.post('/admin/login', loginValidation, async (req, res) => {
  try {
    const { username, password } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('user-agent');

    // 1. 检查IP是否被阻止（优先检查）
    const ipConfig = await getIpRateLimitConfig();
    const ipBlockInfo = await checkIpBlock(ipAddress, ipConfig.ipRateLimitAttempts, ipConfig.ipRateLimitWindowMinutes);
    if (ipBlockInfo && ipBlockInfo.isBlocked) {
      await logLoginAttempt('admin', username, ipAddress, userAgent, false, 'IP blocked');
      logger.warn('管理员登录失败：IP被阻止', { username, ip: ipAddress, ipBlockInfo });
      return res.status(403).json({ 
        success: false, 
        message: ipBlockInfo.message
      });
    }

    // 2. 检查账户是否被锁定或需要渐进延迟
    const lockoutInfo = await checkAdminLockout(username);
    if (lockoutInfo) {
      if (lockoutInfo.isLocked) {
        await logLoginAttempt('admin', username, ipAddress, userAgent, false, 'Account locked');
        logger.warn('管理员登录失败：账户被锁定', { username, ip: ipAddress, lockoutInfo });
        return res.status(403).json({ 
          success: false, 
          message: lockoutInfo.message,
          lockedUntil: lockoutInfo.lockedUntil.toISOString()
        });
      } else if (lockoutInfo.progressiveDelay > 0) {
        // 应用渐进延迟
        await logLoginAttempt('admin', username, ipAddress, userAgent, false, `Progressive delay: ${lockoutInfo.progressiveDelay}ms`);
        await new Promise(resolve => setTimeout(resolve, lockoutInfo.progressiveDelay));
      }
    }

    // 3. 检查用户是否存在
    const admin = await getAsync(
      'SELECT * FROM admins WHERE username = ?',
      [username]
    );

    if (!admin) {
      // 记录失败（即使用户不存在，也记录以防止用户名枚举）
      const adminConfig = await getAdminLockoutConfig();
      const ipConfig = await getIpRateLimitConfig();
      await recordLoginFailure(username, adminConfig.timeWindowMinutes);
      await recordIpFailure(ipAddress, ipConfig.ipRateLimitWindowMinutes);
      await logLoginAttempt('admin', username, ipAddress, userAgent, false, 'User not found');
      logger.warn('管理员登录失败：用户不存在', { username, ip: ipAddress });
      return res.status(401).json({ success: false, message: '用户名或密码错误' });
    }

    // 如果用户被停用（可能是锁定导致的），检查锁定是否已过期
    if (admin.status === 'inactive') {
      const attempt = await getAsync(
        'SELECT * FROM admin_login_attempts WHERE username = ?',
        [username]
      );
      
      if (attempt && attempt.locked_until) {
        const lockedUntil = new Date(attempt.locked_until.replace(' ', 'T'));
        const now = new Date();
        
        if (now < lockedUntil) {
          // 仍在锁定期间
          const remainingMs = lockedUntil.getTime() - now.getTime();
          const remainingMinutes = Math.ceil(remainingMs / (60 * 1000));
          const remainingHours = Math.floor(remainingMinutes / 60);
          const remainingMins = remainingMinutes % 60;
          
          let lockoutMessage = 'Account is locked and deactivated. ';
          if (remainingHours > 0) {
            lockoutMessage += `Please try again in ${remainingHours} hour(s) and ${remainingMins} minute(s).`;
          } else if (remainingMinutes > 0) {
            lockoutMessage += `Please try again in ${remainingMinutes} minute(s).`;
          } else {
            lockoutMessage += `Please try again in less than 1 minute.`;
          }
          
          return res.status(403).json({ 
            success: false, 
            message: lockoutMessage,
            lockedUntil: lockedUntil.toISOString()
          });
        } else {
          // 锁定已过期，自动激活
          await runAsync(
            'UPDATE admins SET status = ? WHERE username = ?',
            ['active', username]
          );
        }
      }
    }

    // 检查用户状态（锁定后可能被设为inactive）
    if (admin.status !== 'active') {
      return res.status(403).json({ 
        success: false, 
        message: 'Account is deactivated. Please contact administrator.' 
      });
    }

    const isValid = await bcrypt.compare(password, admin.password);
    if (!isValid) {
      // 记录失败
      const adminConfig = await getAdminLockoutConfig();
      const ipConfig = await getIpRateLimitConfig();
      const failureInfo = await recordLoginFailure(username, adminConfig.timeWindowMinutes);
      await recordIpFailure(ipAddress, ipConfig.ipRateLimitWindowMinutes);
      await logLoginAttempt('admin', username, ipAddress, userAgent, false, 'Invalid password');
      logger.warn('管理员登录失败：密码错误', { 
        username, 
        ip: ipAddress, 
        failedCount: failureInfo.failedCount 
      });
      
      // 如果刚刚触发了锁定，返回锁定信息
      if (failureInfo.lockedUntil) {
        const lockedUntilStr = failureInfo.lockedUntil;
        const lockedUntil = new Date(lockedUntilStr.replace(' ', 'T'));
        const now = new Date();
        const remainingMs = lockedUntil.getTime() - now.getTime();
        
        if (remainingMs > 0) {
          const remainingMinutes = Math.ceil(remainingMs / (60 * 1000));
          const remainingHours = Math.floor(remainingMinutes / 60);
          const remainingMins = remainingMinutes % 60;
          
          let lockoutMessage = 'Too many failed login attempts. Account is locked and deactivated. ';
          if (remainingHours > 0) {
            lockoutMessage += `Please try again in ${remainingHours} hour(s) and ${remainingMins} minute(s).`;
          } else if (remainingMinutes > 0) {
            lockoutMessage += `Please try again in ${remainingMinutes} minute(s).`;
          } else {
            lockoutMessage += `Please try again in less than 1 minute.`;
          }
          
          return res.status(403).json({ 
            success: false, 
            message: lockoutMessage,
            lockedUntil: lockedUntil.toISOString()
          });
        }
      }
      
      return res.status(401).json({ success: false, message: '用户名或密码错误' });
    }

    // 登录成功，清除失败记录
    await clearLoginFailure(username);
    await clearIpFailure(ipAddress);
    // 确保用户状态为active
    await runAsync(
      'UPDATE admins SET status = ? WHERE username = ?',
      ['active', username]
    );

    // 获取管理员session过期时间
    const adminTimeoutMs = await getAdminSessionTimeoutMs();
    
    // 设置session
    req.session.adminId = admin.id;
    req.session.adminUsername = admin.username;
    req.session.adminRole = admin.role;
    req.session.adminName = admin.name;
    // 记录管理员登录时间和过期时间（独立于用户登录时间）
    req.session._adminLoginTime = Date.now();
    req.session._adminTimeoutMs = adminTimeoutMs;

    // 记录登录日志（详细）
    await logAction(admin.id, 'LOGIN', 'admin', admin.id, JSON.stringify({
      action: '管理员登录',
      username: admin.username,
      name: admin.name,
      role: admin.role
    }), req);

    // 记录审计日志
    await logLoginAttempt('admin', username, ipAddress, userAgent, true, null);

    logger.info('管理员登录成功', { username, ip: ipAddress });

    // 确保Session保存并设置Cookie
    req.session.save((err) => {
      if (err) {
        logger.error('Session保存失败', { error: err.message, adminId: admin.id });
        return res.status(500).json({ success: false, message: '登录失败' });
      }
      
      res.json({
        success: true,
        message: '登录成功',
        admin: {
          id: admin.id,
          username: admin.username,
          name: admin.name,
          role: admin.role
        }
      });
    });
  } catch (error) {
    logger.error('管理员登录错误', { 
      error: error.message, 
      stack: error.stack,
      name: error.name,
      code: error.code
    });
    res.status(500).json({ 
      success: false, 
      message: '登录失败', 
      error: process.env.NODE_ENV !== 'production' ? error.message : undefined,
      code: process.env.NODE_ENV !== 'production' ? error.code : undefined
    });
  }
});

/**
 * POST /api/auth/admin/logout
 * Admin logout
 * @returns {Object} Success message
 */
router.post('/admin/logout', (req, res) => {
  const adminId = req.session.adminId;
  const userId = req.session.userId; // 保存用户信息
  const userPhone = req.session.userPhone;
  const userName = req.session.userName;
  
  // 只清除管理员相关的 session 字段，保留用户 session（如果存在）
  delete req.session.adminId;
  delete req.session.adminUsername;
  delete req.session.adminRole;
  delete req.session.adminName;
  
  // 确保用户信息被保留
  if (userId) {
    req.session.userId = userId;
  }
  if (userPhone) {
    req.session.userPhone = userPhone;
  }
  if (userName) {
    req.session.userName = userName;
  }
  
  req.session.save((err) => {
    if (err) {
      logger.error('管理员登出失败', { error: err.message, adminId });
      return res.status(500).json({ success: false, message: '登出失败' });
    }
    logger.info('管理员登出成功', { adminId, userIdPreserved: !!req.session.userId });
    res.json({ success: true, message: '登出成功' });
  });
});

/**
 * GET /api/auth/admin/me
 * Get current admin information
 * @returns {Object} Admin object with id, username, name, email, role, and created_at
 */
router.get('/admin/me', async (req, res) => {
  if (!req.session.adminId) {
    return res.status(401).json({ success: false, message: '未登录' });
  }

  try {
    const admin = await getAsync(
      'SELECT id, username, name, email, role, created_at FROM admins WHERE id = ?',
      [req.session.adminId]
    );

    if (!admin) {
      // 只清除管理员相关的 session 字段，保留用户 session（如果存在）
      delete req.session.adminId;
      delete req.session.adminUsername;
      delete req.session.adminRole;
      delete req.session.adminName;
      return res.status(401).json({ success: false, message: '用户不存在' });
    }

    res.json({ success: true, admin });
  } catch (error) {
    logger.error('获取管理员信息失败', { error: error.message });
    res.status(500).json({ success: false, message: '获取信息失败' });
  }
});

/**
 * POST /api/auth/user/login
 * User login with phone number
 * @body {string} phone - User phone number (8-15 digits, international format supported)
 * @body {string} [name] - User name (optional)
 * @returns {Object} User object with id, phone, and name
 */
router.post('/user/login', [
  phoneValidation,
  body('name').optional({ checkFalsy: true }).trim().isLength({ max: 50 }).withMessage('姓名长度不能超过50个字符'),
  body('pin').optional().trim().isLength({ min: 4, max: 4 }).withMessage('PIN must be 4 digits'),
  validate
], async (req, res) => {
  try {
    const { phone, name, pin } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('user-agent');

    // 1. 检查IP是否被阻止（优先检查）
    const ipConfig = await getIpRateLimitConfig();
    const ipBlockInfo = await checkIpBlock(ipAddress, ipConfig.ipRateLimitAttempts, ipConfig.ipRateLimitWindowMinutes);
    if (ipBlockInfo && ipBlockInfo.isBlocked) {
      await logLoginAttempt('user', phone, ipAddress, userAgent, false, 'IP blocked');
      logger.warn('用户登录失败：IP被阻止', { phone, ip: ipAddress, ipBlockInfo });
      return res.status(403).json({ 
        success: false, 
        message: ipBlockInfo.message
      });
    }

    // 注意：即使启用了短信验证码，用户也可以选择使用PIN码单独登录
    // 验证码和PIN码是二选一的关系，不强制要求验证码

    // 查找或创建用户
    let user = await getAsync('SELECT * FROM users WHERE phone = ?', [phone]);
    const isNewUser = !user;

    if (!user) {
      // 新用户需要设置PIN，不能直接登录
      if (!pin) {
        return res.status(400).json({
          success: false,
          message: 'New user must set PIN',
          requiresPinSetup: true
        });
      }
      
      // 验证PIN格式（4位数字）
      if (!/^\d{4}$/.test(pin)) {
        return res.status(400).json({
          success: false,
          message: 'PIN must be 4 digits'
        });
      }
      
      // 创建用户并设置PIN
      const hashedPin = await bcrypt.hash(pin, 10);
      const result = await runAsync(
        "INSERT INTO users (phone, name, pin, last_login) VALUES (?, ?, ?, datetime('now', 'localtime'))",
        [phone, name || '', hashedPin]
      );
      user = await getAsync('SELECT * FROM users WHERE id = ?', [result.id]);
      logger.info('新用户注册（PIN）', { phone, userId: user.id });
    } else {
      // 现有用户需要验证PIN
      if (!pin) {
        return res.status(400).json({
          success: false,
          message: 'PIN is required',
          requiresPin: !user.pin, // 如果没有PIN，需要设置
          requiresPinSetup: !user.pin
        });
      }
      
      // 检查用户是否已设置PIN
      if (!user.pin) {
        // 用户未设置PIN，需要设置（和新用户一样，输入两次确认）
        if (!/^\d{4}$/.test(pin)) {
          return res.status(400).json({
            success: false,
            message: 'PIN must be 4 digits'
          });
        }
        
        // 设置PIN
        const hashedPin = await bcrypt.hash(pin, 10);
        await runAsync(
          "UPDATE users SET pin = ?, last_login = datetime('now', 'localtime'), name = ? WHERE id = ?",
          [hashedPin, name || user.name, user.id]
        );
        user.pin = hashedPin;
        user.name = name || user.name;
        logger.info('用户设置PIN', { phone, userId: user.id });
      } else {
        // 2. 检查账户是否被锁定或需要渐进延迟
        const lockoutInfo = await checkUserLockout(phone);
        if (lockoutInfo) {
          if (lockoutInfo.isLocked) {
            await logLoginAttempt('user', phone, ipAddress, userAgent, false, 'Account locked');
            logger.warn('用户登录失败：账户被锁定', { phone, ip: ipAddress, lockoutInfo });
            return res.status(403).json({ 
              success: false, 
              message: lockoutInfo.message,
              lockedUntil: lockoutInfo.lockedUntil.toISOString()
            });
          } else if (lockoutInfo.progressiveDelay > 0) {
            // 应用渐进延迟
            await logLoginAttempt('user', phone, ipAddress, userAgent, false, `Progressive delay: ${lockoutInfo.progressiveDelay}ms`);
            await new Promise(resolve => setTimeout(resolve, lockoutInfo.progressiveDelay));
          }
        }

        // 验证PIN
        const isValidPin = await bcrypt.compare(pin, user.pin);
        if (!isValidPin) {
          // 记录失败
          const userConfig = await getUserLockoutConfig();
          const ipConfig = await getIpRateLimitConfig();
          const failureInfo = await recordUserLoginFailure(phone, userConfig.timeWindowMinutes);
          await recordIpFailure(ipAddress, ipConfig.ipRateLimitWindowMinutes);
          await logLoginAttempt('user', phone, ipAddress, userAgent, false, 'Invalid PIN');
          logger.warn('用户登录失败：PIN错误', { 
            phone, 
            userId: user.id, 
            ip: ipAddress,
            failedCount: failureInfo.failedCount 
          });
          
          // 如果刚刚触发了锁定，返回锁定信息
          if (failureInfo.lockedUntil) {
            const lockedUntilStr = failureInfo.lockedUntil;
            const lockedUntil = new Date(lockedUntilStr.replace(' ', 'T'));
            const now = new Date();
            const remainingMs = lockedUntil.getTime() - now.getTime();
            
            if (remainingMs > 0) {
              const remainingMinutes = Math.ceil(remainingMs / (60 * 1000));
              const remainingHours = Math.floor(remainingMinutes / 60);
              const remainingMins = remainingMinutes % 60;
              
              let lockoutMessage = 'Too many failed login attempts. Account is locked. ';
              if (remainingHours > 0) {
                lockoutMessage += `Please try again in ${remainingHours} hour(s) and ${remainingMins} minute(s).`;
              } else if (remainingMinutes > 0) {
                lockoutMessage += `Please try again in ${remainingMinutes} minute(s).`;
              } else {
                lockoutMessage += `Please try again in less than 1 minute.`;
              }
              
              return res.status(403).json({ 
                success: false, 
                message: lockoutMessage,
                lockedUntil: lockedUntil.toISOString()
              });
            }
          }
          
          return res.status(401).json({
            success: false,
            message: 'Incorrect PIN'
          });
        }
        
        // 更新最后登录时间和姓名
        await runAsync(
          "UPDATE users SET last_login = datetime('now', 'localtime'), name = ? WHERE id = ?",
          [name || user.name, user.id]
        );
        user.name = name || user.name;
      }
    }

    // 登录成功，清除失败记录
    await clearUserLoginFailure(phone);
    await clearIpFailure(ipAddress);

    // 获取用户session过期时间
    const userTimeoutMs = await getUserSessionTimeoutMs();
    
    // 设置session
    req.session.userId = user.id;
    req.session.userPhone = user.phone;
    req.session.userName = user.name;
    // 记录用户登录时间和过期时间（独立于管理员登录时间）
    // 每次登录都刷新登录时间，确保重新登录后过期时间重置
    req.session._userLoginTime = Date.now();
    req.session._userTimeoutMs = userTimeoutMs;

    // 记录用户登录日志（使用 null 表示系统自动记录，因为外键约束不允许不存在的 admin_id）
    const { logAction: logUserAction } = require('../utils/logger');
    await logUserAction(null, 'USER_LOGIN', 'user', user.id, JSON.stringify({
      action: '用户登录（PIN）',
      phone: user.phone,
      name: user.name || '未设置',
      isNewUser: isNewUser
    }), req);

    // 记录审计日志
    await logLoginAttempt('user', phone, ipAddress, userAgent, true, null);

    logger.info('用户登录成功（PIN）', { phone, userId: user.id });

    // 生成用户Token（用于小程序）
    const userToken = await generateUserToken(user.id);
    
    // 清理该用户的所有旧Token（包括永不过期的），但保留刚生成的新Token
    await cleanupExpiredTokens(user.id, true, userToken);

    // 确保Session保存并设置Cookie（用于浏览器）
    req.session.save((err) => {
      if (err) {
        logger.error('Session保存失败', { error: err.message, userId: user.id });
        return res.status(500).json({ success: false, message: '登录失败' });
      }
      
      res.json({
        success: true,
        message: '登录成功',
        user: {
          id: user.id,
          phone: user.phone,
          name: user.name
        },
        token: userToken, // 返回Token供小程序使用
        isNewUser: isNewUser // 标识是否为新用户注册
      });
    });
  } catch (error) {
    logger.error('用户登录错误', { 
      error: error.message, 
      stack: error.stack,
      name: error.name,
      code: error.code,
      phone: req.body?.phone
    });
    res.status(500).json({ 
      success: false, 
      message: '登录失败', 
      error: process.env.NODE_ENV !== 'production' ? error.message : undefined,
      code: process.env.NODE_ENV !== 'production' ? error.code : undefined
    });
  }
});

/**
 * POST /api/auth/user/logout
 * User logout
 * 支持两种认证方式：
 * 1. Session认证（浏览器）
 * 2. Token认证（小程序）
 * @returns {Object} Success message
 */
router.post('/user/logout', async (req, res) => {
  let userId = null;
  
  // 优先检查Session认证（浏览器）
  if (req.session && req.session.userId) {
    userId = req.session.userId;
  } else {
    // 没有Session，尝试Token认证（小程序）
    const token = req.headers['x-user-token'] || 
                  req.headers['X-User-Token'] || 
                  req.headers['authorization']?.replace(/^Bearer\s+/i, '') ||
                  req.query.token;
    
    if (token) {
      const tokenUser = await verifyUserToken(token);
      if (tokenUser) {
        userId = tokenUser.id;
        // 清除该Token
        await runAsync('DELETE FROM user_tokens WHERE token = ?', [token]);
      }
    }
  }
  
  const adminId = req.session?.adminId; // 保存管理员信息
  const adminUsername = req.session?.adminUsername;
  const adminRole = req.session?.adminRole;
  const adminName = req.session?.adminName;
  
  // 只清除用户相关的 session 字段，保留管理员 session（如果存在）
  if (req.session) {
    delete req.session.userId;
    delete req.session.userPhone;
    delete req.session.userName;
    // 清除堂食模式相关标记
    delete req.session.isDineIn;
    delete req.session.tableNumber;
    
    // 确保管理员信息被保留
    if (adminId) {
      req.session.adminId = adminId;
    }
    if (adminUsername) {
      req.session.adminUsername = adminUsername;
    }
    if (adminRole) {
      req.session.adminRole = adminRole;
    }
    if (adminName) {
      req.session.adminName = adminName;
    }
  }
  
  // 如果使用Token认证，Token已经清除，直接返回
  if (userId && !req.session?.userId) {
    logger.info('用户登出成功（Token认证）', { userId });
    return res.json({ success: true, message: '登出成功' });
  }
  
  // Session认证，保存Session
  req.session.save((err) => {
    if (err) {
      logger.error('用户登出失败', { error: err.message, userId });
      return res.status(500).json({ success: false, message: '登出失败' });
    }
    logger.info('用户登出成功', { userId, adminIdPreserved: !!req.session.adminId });
    res.json({ success: true, message: '登出成功' });
  });
});

/**
 * POST /api/auth/sms/send
 * Send verification code via SMS
 * @body {string} phone - User phone number
 * @body {string} [type] - Verification code type (default: 'login')
 * @returns {Object} Success message
 */
router.post('/sms/send', [
  phoneValidation,
  body('type').optional().trim().isIn(['login', 'register', 'reset']).withMessage('Invalid verification code type'),
  validate
], async (req, res) => {
  try {
    const { phone, type = 'login' } = req.body;

    // 检查短信服务是否启用（允许管理员测试，即使未启用）
    const smsEnabled = await getAsync("SELECT value FROM settings WHERE key = 'sms_enabled'");
    const isAdmin = req.session && req.session.adminId;
    
    if (!smsEnabled || smsEnabled.value !== 'true') {
      // 如果不是管理员，返回错误
      if (!isAdmin) {
        return res.status(400).json({
          success: false,
          message: 'SMS verification is not enabled'
        });
      }
      // 管理员可以测试，即使未启用
    }

    const result = await createVerificationCode(phone, type);

    if (result.success) {
      res.json({
        success: true,
        message: result.message,
        // 开发环境返回验证码（仅用于测试）
        code: result.code
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.message
      });
    }
  } catch (error) {
    logger.error('发送验证码失败', { error: error.message });
    res.status(500).json({ success: false, message: 'Failed to send verification code' });
  }
});

/**
 * POST /api/auth/user/login-with-code
 * User login with verification code
 * @body {string} phone - User phone number
 * @body {string} code - Verification code
 * @body {string} [name] - User name (optional)
 * @returns {Object} User object with id, phone, and name
 */
router.post('/user/login-with-code', [
  phoneValidation,
  codeValidation,
  body('name').optional({ checkFalsy: true }).trim().isLength({ max: 50 }).withMessage('姓名长度不能超过50个字符'),
  body('pin').optional().trim().isLength({ min: 4, max: 4 }).withMessage('PIN must be 4 digits'),
  validate
], async (req, res) => {
  try {
    const { phone, code, name, pin } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('user-agent');

    // 1. 检查IP是否被阻止（优先检查）
    const ipConfig = await getIpRateLimitConfig();
    const ipBlockInfo = await checkIpBlock(ipAddress, ipConfig.ipRateLimitAttempts, ipConfig.ipRateLimitWindowMinutes);
    if (ipBlockInfo && ipBlockInfo.isBlocked) {
      await logLoginAttempt('user', phone, ipAddress, userAgent, false, 'IP blocked');
      logger.warn('用户登录失败：IP被阻止（验证码登录）', { phone, ip: ipAddress, ipBlockInfo });
      return res.status(403).json({ 
        success: false, 
        message: ipBlockInfo.message
      });
    }

    // 验证验证码
    const verifyResult = await verifyCode(phone, code, 'login');
    if (!verifyResult.success) {
      await logLoginAttempt('user', phone, ipAddress, userAgent, false, 'Invalid verification code');
      return res.status(400).json({
        success: false,
        message: verifyResult.message
      });
    }

    // 查找或创建用户
    let user = await getAsync('SELECT * FROM users WHERE phone = ?', [phone]);
    const isNewUser = !user;

    if (!user) {
      // 新用户需要设置PIN，不能直接登录
      if (!pin) {
        return res.status(400).json({
          success: false,
          message: 'New user must set PIN',
          requiresPinSetup: true
        });
      }
      
      // 验证PIN格式（4位数字）
      if (!/^\d{4}$/.test(pin)) {
        return res.status(400).json({
          success: false,
          message: 'PIN must be 4 digits'
        });
      }
      
      // 创建用户并设置PIN
      const hashedPin = await bcrypt.hash(pin, 10);
      const result = await runAsync(
        "INSERT INTO users (phone, name, pin, last_login) VALUES (?, ?, ?, datetime('now', 'localtime'))",
        [phone, name || '', hashedPin]
      );
      user = await getAsync('SELECT * FROM users WHERE id = ?', [result.id]);
      logger.info('新用户注册（验证码+PIN）', { phone, userId: user.id });
    } else {
      // 检查用户是否已设置PIN
      if (!user.pin) {
        // 用户未设置PIN，需要设置（和新用户一样，输入两次确认）
        if (!pin) {
          return res.status(400).json({
            success: false,
            message: 'PIN setup required',
            requiresPinSetup: true
          });
        }
        
        // 验证PIN格式（4位数字）
        if (!/^\d{4}$/.test(pin)) {
          return res.status(400).json({
            success: false,
            message: 'PIN must be 4 digits'
          });
        }
        
        // 设置PIN
        const hashedPin = await bcrypt.hash(pin, 10);
        await runAsync(
          "UPDATE users SET pin = ?, last_login = datetime('now', 'localtime'), name = ? WHERE id = ?",
          [hashedPin, name || user.name, user.id]
        );
        user.pin = hashedPin;
        user.name = name || user.name;
        logger.info('用户设置PIN（验证码登录）', { phone, userId: user.id });
      } else {
        // 现有用户需要验证PIN
        if (!pin) {
          return res.status(400).json({
            success: false,
            message: 'PIN is required',
            requiresPin: true
          });
        }
        
        // 2. 检查账户是否被锁定或需要渐进延迟
        const lockoutInfo = await checkUserLockout(phone);
        if (lockoutInfo) {
          if (lockoutInfo.isLocked) {
            await logLoginAttempt('user', phone, ipAddress, userAgent, false, 'Account locked');
            logger.warn('用户登录失败：账户被锁定（验证码登录）', { phone, ip: ipAddress, lockoutInfo });
            return res.status(403).json({ 
              success: false, 
              message: lockoutInfo.message,
              lockedUntil: lockoutInfo.lockedUntil.toISOString()
            });
          } else if (lockoutInfo.progressiveDelay > 0) {
            // 应用渐进延迟
            await logLoginAttempt('user', phone, ipAddress, userAgent, false, `Progressive delay: ${lockoutInfo.progressiveDelay}ms`);
            await new Promise(resolve => setTimeout(resolve, lockoutInfo.progressiveDelay));
          }
        }
        
        // 验证PIN
        const isValidPin = await bcrypt.compare(pin, user.pin);
        if (!isValidPin) {
          // 记录失败
          const userConfig = await getUserLockoutConfig();
          const ipConfig = await getIpRateLimitConfig();
          const failureInfo = await recordUserLoginFailure(phone, userConfig.timeWindowMinutes);
          await recordIpFailure(ipAddress, ipConfig.ipRateLimitWindowMinutes);
          await logLoginAttempt('user', phone, ipAddress, userAgent, false, 'Invalid PIN');
          logger.warn('用户登录失败：PIN错误（验证码登录）', { 
            phone, 
            userId: user.id,
            ip: ipAddress,
            failedCount: failureInfo.failedCount 
          });
          
          // 如果刚刚触发了锁定，返回锁定信息
          if (failureInfo.lockedUntil) {
            const lockedUntilStr = failureInfo.lockedUntil;
            const lockedUntil = new Date(lockedUntilStr.replace(' ', 'T'));
            const now = new Date();
            const remainingMs = lockedUntil.getTime() - now.getTime();
            
            if (remainingMs > 0) {
              const remainingMinutes = Math.ceil(remainingMs / (60 * 1000));
              const remainingHours = Math.floor(remainingMinutes / 60);
              const remainingMins = remainingMinutes % 60;
              
              let lockoutMessage = 'Too many failed login attempts. Account is locked. ';
              if (remainingHours > 0) {
                lockoutMessage += `Please try again in ${remainingHours} hour(s) and ${remainingMins} minute(s).`;
              } else if (remainingMinutes > 0) {
                lockoutMessage += `Please try again in ${remainingMinutes} minute(s).`;
              } else {
                lockoutMessage += `Please try again in less than 1 minute.`;
              }
              
              return res.status(403).json({ 
                success: false, 
                message: lockoutMessage,
                lockedUntil: lockedUntil.toISOString()
              });
            }
          }
          
          return res.status(401).json({
            success: false,
            message: 'Incorrect PIN'
          });
        }
        
        // 更新最后登录时间和姓名
        await runAsync(
          "UPDATE users SET last_login = datetime('now', 'localtime'), name = ? WHERE id = ?",
          [name || user.name, user.id]
        );
        user.name = name || user.name;
      }
    }

    // 登录成功，清除失败记录
    await clearUserLoginFailure(phone);
    await clearIpFailure(ipAddress);

    // 获取用户session过期时间
    const userTimeoutMs = await getUserSessionTimeoutMs();
    
    // 设置session
    req.session.userId = user.id;
    req.session.userPhone = user.phone;
    req.session.userName = user.name;
    // 记录用户登录时间和过期时间（独立于管理员登录时间）
    // 每次登录都刷新登录时间，确保重新登录后过期时间重置
    req.session._userLoginTime = Date.now();
    req.session._userTimeoutMs = userTimeoutMs;

    // 记录用户登录日志（使用 null 表示系统自动记录，因为外键约束不允许不存在的 admin_id）
    const { logAction: logUserAction } = require('../utils/logger');
    await logUserAction(null, 'USER_LOGIN', 'user', user.id, JSON.stringify({
      action: '用户登录（验证码+PIN）',
      phone: user.phone,
      name: user.name || '未设置',
      isNewUser: isNewUser,
      loginMethod: 'sms_code'
    }), req);

    // 记录审计日志
    await logLoginAttempt('user', phone, ipAddress, userAgent, true, null);

    logger.info('用户登录成功（验证码+PIN）', { phone, userId: user.id });

    // 生成用户Token（用于小程序）
    const userToken = await generateUserToken(user.id);
    
    // 清理该用户的所有旧Token（包括永不过期的），但保留刚生成的新Token
    await cleanupExpiredTokens(user.id, true, userToken);

    // 确保Session保存并设置Cookie（用于浏览器）
    req.session.save((err) => {
      if (err) {
        logger.error('Session保存失败', { error: err.message, userId: user.id });
        return res.status(500).json({ success: false, message: '登录失败' });
      }
      
      res.json({
        success: true,
        message: '登录成功',
        user: {
          id: user.id,
          phone: user.phone,
          name: user.name
        },
        token: userToken, // 返回Token供小程序使用
        isNewUser: isNewUser // 标识是否为新用户注册
      });
    });
  } catch (error) {
    logger.error('验证码登录错误', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, message: '登录失败', error: process.env.NODE_ENV !== 'production' ? error.message : undefined });
  }
});

/**
 * POST /api/auth/user/check-pin-status
 * Check if user needs to set PIN
 * @body {string} phone - User phone number
 * @returns {Object} Status indicating if PIN setup is required
 */
router.post('/user/check-pin-status', [
  phoneValidation,
  validate
], async (req, res) => {
  try {
    const { phone } = req.body;
    
    const user = await getAsync('SELECT id, pin FROM users WHERE phone = ?', [phone]);
    
    if (!user) {
      // 新用户需要设置PIN
      return res.json({
        success: true,
        requiresPinSetup: true,
        hasPin: false
      });
    }
    
    return res.json({
      success: true,
      requiresPinSetup: !user.pin,
      hasPin: !!user.pin
    });
  } catch (error) {
    logger.error('检查PIN状态错误', { error: error.message });
    res.status(500).json({ success: false, message: '检查失败' });
  }
});

/**
 * GET /api/auth/user/me
 * Get current user information
 * 支持两种认证方式：
 * 1. Session认证（浏览器）- 优先使用
 * 2. Token认证（小程序）- 备用方案
 * @returns {Object} User object with id, phone, and name
 */
router.get('/user/me', async (req, res) => {
  let user = null;
  let userId = null;
  
  // 优先检查Session认证（浏览器）
  if (req.session && req.session.userId) {
    userId = req.session.userId;
    logger.debug('[/api/auth/user/me] 使用Session认证', { userId });
  } else {
    // 没有Session，尝试Token认证（小程序）
    const token = req.headers['x-user-token'] || 
                  req.headers['X-User-Token'] || 
                  req.headers['authorization']?.replace(/^Bearer\s+/i, '') ||
                  req.query.token;
    
    logger.debug('[/api/auth/user/me] Token认证尝试', {
      hasToken: !!token,
      tokenLength: token ? token.length : 0,
      tokenPrefix: token ? token.substring(0, 8) + '...' : null,
      headers: {
        'x-user-token': !!req.headers['x-user-token'],
        'X-User-Token': !!req.headers['X-User-Token'],
        'authorization': !!req.headers['authorization'],
        'query.token': !!req.query.token
      }
    });
    
    if (token) {
      const tokenUser = await verifyUserToken(token);
      if (tokenUser) {
        userId = tokenUser.id;
        user = tokenUser; // 直接使用Token验证返回的用户信息
        logger.debug('[/api/auth/user/me] Token认证成功', { userId });
      } else {
        logger.debug('[/api/auth/user/me] Token认证失败');
      }
    } else {
      logger.debug('[/api/auth/user/me] 未找到Token');
    }
  }
  
  // 如果两种方式都失败
  if (!userId) {
    logger.debug('[/api/auth/user/me] 认证失败，返回401');
    return res.status(401).json({ success: false, message: '未登录' });
  }

  try {
    // 如果还没有用户信息（Session认证），从数据库查询
    if (!user) {
      user = await getAsync(
        'SELECT id, phone, name, created_at FROM users WHERE id = ?',
        [userId]
      );

      if (!user) {
        // 只清除用户相关的 session 字段，保留管理员 session（如果存在）
        if (req.session) {
          delete req.session.userId;
          delete req.session.userPhone;
          delete req.session.userName;
        }
        return res.status(401).json({ success: false, message: '用户不存在' });
      }
    } else {
      // Token认证已经返回了用户信息，但需要添加 created_at
      const fullUser = await getAsync(
        'SELECT id, phone, name, created_at FROM users WHERE id = ?',
        [userId]
      );
      if (fullUser) {
        user.created_at = fullUser.created_at;
      }
    }

    res.json({ success: true, user });
  } catch (error) {
    logger.error('获取用户信息失败', { error: error.message });
    res.status(500).json({ success: false, message: '获取信息失败' });
  }
});

/**
 * 获取当前登录用户ID（支持Session和Token认证）
 * @param {Object} req - Express请求对象
 * @returns {Promise<number|null>} 用户ID或null
 */
async function getCurrentUserId(req) {
  // 优先检查Session认证（浏览器）
  if (req.session && req.session.userId) {
    return req.session.userId;
  }
  
  // 如果没有Session，尝试Token认证（小程序）
  const token = req.headers['x-user-token'] || 
                req.headers['X-User-Token'] || 
                req.headers['authorization']?.replace(/^Bearer\s+/i, '') ||
                req.query.token;
  
  if (token) {
    const tokenUser = await verifyUserToken(token);
    if (tokenUser) {
      return tokenUser.id;
    }
  }
  
  return null;
}

/**
 * PUT /api/auth/user/profile
 * 修改用户昵称
 * @body {string} name - 新昵称
 * @returns {Object} Success message and updated user info
 */
router.put('/user/profile', [
  body('name').trim().isLength({ min: 0, max: 50 }).withMessage('昵称长度不能超过50个字符'),
  validate
], async (req, res) => {
  try {
    const { name } = req.body;
    const userId = await getCurrentUserId(req);
    
    if (!userId) {
      return res.status(401).json({ 
        success: false, 
        message: '需要登录才能修改昵称' 
      });
    }

    // 检查用户是否存在
    const user = await getAsync('SELECT id, phone, name FROM users WHERE id = ?', [userId]);
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: '用户不存在' 
      });
    }

    // 更新昵称
    await runAsync(
      "UPDATE users SET name = ? WHERE id = ?",
      [name || '', userId]
    );

    // 更新Session中的用户名（如果存在）
    if (req.session) {
      req.session.userName = name || '';
    }

    // 获取更新后的用户信息
    const updatedUser = await getAsync(
      'SELECT id, phone, name, created_at FROM users WHERE id = ?',
      [userId]
    );

    logger.info('用户修改昵称成功', { userId, phone: user.phone, oldName: user.name, newName: name });

    res.json({
      success: true,
      message: '昵称修改成功',
      user: updatedUser
    });
  } catch (error) {
    logger.error('修改昵称失败', { error: error.message });
    res.status(500).json({ 
      success: false, 
      message: '修改昵称失败' 
    });
  }
});

/**
 * PUT /api/auth/user/pin
 * 修改用户PIN码
 * @body {string} pin - 新PIN码（4位数字）
 * @body {string} [oldPin] - 旧PIN码（如果已设置PIN，需要提供）
 * @returns {Object} Success message
 */
router.put('/user/pin', [
  body('pin').trim().isLength({ min: 4, max: 4 }).matches(/^\d{4}$/).withMessage('PIN码必须是4位数字'),
  body('oldPin').optional().trim().isLength({ min: 4, max: 4 }).matches(/^\d{4}$/).withMessage('旧PIN码必须是4位数字'),
  validate
], async (req, res) => {
  try {
    const { pin, oldPin } = req.body;
    const userId = await getCurrentUserId(req);
    
    if (!userId) {
      return res.status(401).json({ 
        success: false, 
        message: '需要登录才能修改PIN码' 
      });
    }

    // 检查用户是否存在
    const user = await getAsync('SELECT id, phone, pin FROM users WHERE id = ?', [userId]);
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: '用户不存在' 
      });
    }

    // 如果用户已设置PIN，需要验证旧PIN
    if (user.pin) {
      if (!oldPin) {
        return res.status(400).json({ 
          success: false, 
          message: '需要提供旧PIN码' 
        });
      }

      // 验证旧PIN
      const isValidOldPin = await bcrypt.compare(oldPin, user.pin);
      if (!isValidOldPin) {
        logger.warn('修改PIN失败：旧PIN错误', { userId, phone: user.phone });
        return res.status(400).json({ 
          success: false, 
          message: '旧PIN码错误' 
        });
      }
    }

    // 检查新PIN是否与旧PIN相同
    if (user.pin) {
      const isSamePin = await bcrypt.compare(pin, user.pin);
      if (isSamePin) {
        return res.status(400).json({ 
          success: false, 
          message: '新PIN码不能与旧PIN码相同' 
        });
      }
    }

    // 更新PIN码
    const hashedPin = await bcrypt.hash(pin, 10);
    await runAsync(
      "UPDATE users SET pin = ? WHERE id = ?",
      [hashedPin, userId]
    );

    logger.info('用户修改PIN成功', { userId, phone: user.phone, hasOldPin: !!user.pin });

    res.json({
      success: true,
      message: 'PIN码修改成功'
    });
  } catch (error) {
    logger.error('修改PIN码失败', { error: error.message });
    res.status(500).json({ 
      success: false, 
      message: '修改PIN码失败' 
    });
  }
});

/**
 * GET /api/auth/session/info
 * Get current session information including expiration time
 * @returns {Object} Session info with remaining time for admin and user separately
 */
router.get('/session/info', async (req, res) => {
  if (!req.session) {
    return res.status(401).json({ 
      success: false, 
      message: 'No session found' 
    });
  }

  const cookie = req.session.cookie;
  const now = Date.now();
  
  // 获取动态过期时间（优先使用session中存储的，否则使用默认值）
  const adminTimeoutMs = req.session._adminTimeoutMs || (await getAdminSessionTimeoutMs());
  const userTimeoutMs = req.session._userTimeoutMs || (await getUserSessionTimeoutMs());
  
  // 计算管理员过期时间（独立）
  let adminExpires = null;
  let adminRemainingMs = 0;
  if (req.session.adminId && req.session._adminLoginTime) {
    adminExpires = new Date(req.session._adminLoginTime + adminTimeoutMs);
    adminRemainingMs = Math.max(0, adminExpires.getTime() - now);
  } else if (req.session.adminId && req.session._loginTime) {
    // 兼容旧session（使用旧的_loginTime和默认过期时间）
    adminExpires = new Date(req.session._loginTime + adminTimeoutMs);
    adminRemainingMs = Math.max(0, adminExpires.getTime() - now);
  }
  
  // 计算用户过期时间（独立）
  let userExpires = null;
  let userRemainingMs = 0;
  if (req.session.userId && req.session._userLoginTime) {
    userExpires = new Date(req.session._userLoginTime + userTimeoutMs);
    userRemainingMs = Math.max(0, userExpires.getTime() - now);
  } else if (req.session.userId && req.session._loginTime) {
    // 兼容旧session（使用旧的_loginTime和默认过期时间）
    userExpires = new Date(req.session._loginTime + userTimeoutMs);
    userRemainingMs = Math.max(0, userExpires.getTime() - now);
  }
  
  // 计算cookie过期时间（取两者中较晚的，或者使用默认）
  let cookieExpires;
  if (adminExpires && userExpires) {
    cookieExpires = adminExpires > userExpires ? adminExpires : userExpires;
  } else if (adminExpires) {
    cookieExpires = adminExpires;
  } else if (userExpires) {
    cookieExpires = userExpires;
  } else if (cookie && cookie.expires) {
    cookieExpires = new Date(cookie.expires);
  } else {
    // 默认使用24小时作为cookie过期时间
    const defaultMaxAge = 24 * 60 * 60 * 1000; // 24小时
    cookieExpires = new Date(now + defaultMaxAge);
  }
  
  const cookieRemainingMs = Math.max(0, cookieExpires.getTime() - now);

  // 判断用户类型
  let userType = 'guest';
  if (req.session.adminId && req.session.userId) {
    userType = 'both'; // 同时登录管理员和普通用户
  } else if (req.session.adminId) {
    userType = 'admin'; // 仅管理员
  } else if (req.session.userId) {
    userType = 'user'; // 仅普通用户
  }

  // 格式化剩余时间
  const formatRemainingTime = (ms) => {
    if (ms <= 0) return { hours: 0, minutes: 0, seconds: 0, formatted: '已过期' };
    const totalMinutes = Math.floor(ms / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const seconds = Math.floor((ms % 60000) / 1000);
    return {
      hours,
      minutes,
      seconds,
      formatted: `${hours}小时${minutes}分钟${seconds}秒`
    };
  };

  res.json({
    success: true,
    session: {
      isLoggedIn: !!(req.session.userId || req.session.adminId),
      userType: userType,
      userId: req.session.userId || null,
      adminId: req.session.adminId || null,
      // Cookie级别的过期时间（整体）
      cookie: {
        expiresAt: cookieExpires.toISOString(),
        expiresAtLocal: cookieExpires.toLocaleString(),
        remainingMs: cookieRemainingMs,
        ...formatRemainingTime(cookieRemainingMs)
      },
      // 管理员独立的过期时间
      admin: req.session.adminId ? {
        expiresAt: adminExpires ? adminExpires.toISOString() : null,
        expiresAtLocal: adminExpires ? adminExpires.toLocaleString() : null,
        remainingMs: adminRemainingMs,
        isExpired: adminRemainingMs <= 0,
        ...formatRemainingTime(adminRemainingMs)
      } : null,
      // 用户独立的过期时间
      user: req.session.userId ? {
        expiresAt: userExpires ? userExpires.toISOString() : null,
        expiresAtLocal: userExpires ? userExpires.toLocaleString() : null,
        remainingMs: userRemainingMs,
        isExpired: userRemainingMs <= 0,
        ...formatRemainingTime(userRemainingMs)
      } : null
    }
  });
});

/**
 * POST /api/auth/session/refresh
 * Refresh session expiration time (rolling session)
 * @returns {Object} Success message
 */
router.post('/session/refresh', async (req, res) => {
  if (!req.session || (!req.session.adminId && !req.session.userId)) {
    return res.status(401).json({ 
      success: false, 
      message: 'No active session found' 
    });
  }

  try {
    const now = Date.now();
    const { getAdminSessionTimeoutMs, getUserSessionTimeoutMs } = require('../utils/session-config');
    
    // 刷新管理员session时间
    if (req.session.adminId) {
      const adminTimeoutMs = req.session._adminTimeoutMs || (await getAdminSessionTimeoutMs());
      req.session._adminLoginTime = now;
      req.session._adminTimeoutMs = adminTimeoutMs;
    }
    
    // 刷新用户session时间
    if (req.session.userId) {
      const userTimeoutMs = req.session._userTimeoutMs || (await getUserSessionTimeoutMs());
      req.session._userLoginTime = now;
      req.session._userTimeoutMs = userTimeoutMs;
    }
    
    // 保存session
    req.session.save((err) => {
      if (err) {
        logger.error('刷新session失败', { error: err.message });
        return res.status(500).json({ 
          success: false, 
          message: 'Failed to refresh session' 
        });
      }
      
      res.json({ 
        success: true, 
        message: 'Session refreshed successfully' 
      });
    });
  } catch (error) {
    logger.error('刷新session失败', { error: error.message });
    res.status(500).json({ 
      success: false, 
      message: 'Failed to refresh session' 
    });
  }
});

module.exports = router;

