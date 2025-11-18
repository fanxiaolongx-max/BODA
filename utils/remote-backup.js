const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const https = require('https');
const http = require('http');
const { logger } = require('./logger');
const { backupFull } = require('./backup');
const { runAsync, getAsync, allAsync } = require('../db/database');

// 支持 fly.io 持久化卷
const DATA_DIR = fs.existsSync('/data') ? '/data' : path.join(__dirname, '..');
const RECEIVED_BACKUP_DIR = path.join(DATA_DIR, 'logs', 'backup', 'received');

// 确保接收备份目录存在
if (!fs.existsSync(RECEIVED_BACKUP_DIR)) {
  fs.mkdirSync(RECEIVED_BACKUP_DIR, { recursive: true });
}

/**
 * 验证API token
 * @param {string} token - 要验证的token
 * @returns {Promise<boolean>} - token是否有效
 */
async function validateApiToken(token) {
  try {
    const config = await getAsync('SELECT api_token FROM backup_receive_config LIMIT 1');
    if (!config || !config.api_token) {
      return false;
    }
    return config.api_token === token;
  } catch (error) {
    logger.error('验证API token失败', { error: error.message });
    return false;
  }
}

/**
 * 判断是否应该推送（根据周期配置）
 * @param {Object} config - 推送配置
 * @param {Date} lastPushTime - 上次推送时间（可选）
 * @returns {boolean} - 是否应该推送
 */
function shouldPushNow(config, lastPushTime = null) {
  if (!config.enabled || config.schedule_type === 'manual') {
    return false;
  }

  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentDay = now.getDay(); // 0-6, 0=Sunday
  const currentDate = now.getDate(); // 1-31

  switch (config.schedule_type) {
    case 'hourly':
      // 每小时的第0分钟推送
      return currentMinute === 0;

    case 'daily':
      // 每天指定时间推送
      if (!config.schedule_time) return false;
      const [hour, minute] = config.schedule_time.split(':').map(Number);
      if (currentHour === hour && currentMinute === minute) {
        // 检查是否已经推送过（避免同一分钟内重复推送）
        if (lastPushTime) {
          const lastPush = new Date(lastPushTime);
          const timeDiff = now - lastPush;
          return timeDiff > 60000; // 至少间隔1分钟
        }
        return true;
      }
      return false;

    case 'weekly':
      // 每周指定星期几的指定时间推送
      if (!config.schedule_time || config.schedule_day === null || config.schedule_day === undefined) {
        return false;
      }
      const [wHour, wMinute] = config.schedule_time.split(':').map(Number);
      if (currentDay === config.schedule_day && currentHour === wHour && currentMinute === wMinute) {
        if (lastPushTime) {
          const lastPush = new Date(lastPushTime);
          const timeDiff = now - lastPush;
          return timeDiff > 60000;
        }
        return true;
      }
      return false;

    case 'monthly':
      // 每月指定日期的指定时间推送
      if (!config.schedule_time || config.schedule_day === null || config.schedule_day === undefined) {
        return false;
      }
      const [mHour, mMinute] = config.schedule_time.split(':').map(Number);
      if (currentDate === config.schedule_day && currentHour === mHour && currentMinute === mMinute) {
        if (lastPushTime) {
          const lastPush = new Date(lastPushTime);
          const timeDiff = now - lastPush;
          return timeDiff > 60000;
        }
        return true;
      }
      return false;

    default:
      return false;
  }
}

/**
 * 计算下次推送时间
 * @param {Object} config - 推送配置
 * @returns {Date|null} - 下次推送时间
 */
function scheduleNextPush(config) {
  if (!config.enabled || config.schedule_type === 'manual') {
    return null;
  }

  const now = new Date();
  const next = new Date(now);

  switch (config.schedule_type) {
    case 'hourly':
      // 下一个整点
      next.setMinutes(0);
      next.setSeconds(0);
      next.setMilliseconds(0);
      next.setHours(next.getHours() + 1);
      return next;

    case 'daily':
      if (!config.schedule_time) return null;
      const [hour, minute] = config.schedule_time.split(':').map(Number);
      next.setHours(hour);
      next.setMinutes(minute);
      next.setSeconds(0);
      next.setMilliseconds(0);
      if (next <= now) {
        next.setDate(next.getDate() + 1);
      }
      return next;

    case 'weekly':
      if (!config.schedule_time || config.schedule_day === null || config.schedule_day === undefined) {
        return null;
      }
      const [wHour, wMinute] = config.schedule_time.split(':').map(Number);
      const daysUntilTarget = (config.schedule_day - now.getDay() + 7) % 7;
      if (daysUntilTarget === 0) {
        // 今天，检查时间是否已过
        next.setHours(wHour);
        next.setMinutes(wMinute);
        next.setSeconds(0);
        next.setMilliseconds(0);
        if (next <= now) {
          next.setDate(next.getDate() + 7);
        }
      } else {
        next.setDate(next.getDate() + daysUntilTarget);
        next.setHours(wHour);
        next.setMinutes(wMinute);
        next.setSeconds(0);
        next.setMilliseconds(0);
      }
      return next;

    case 'monthly':
      if (!config.schedule_time || config.schedule_day === null || config.schedule_day === undefined) {
        return null;
      }
      const [mHour, mMinute] = config.schedule_time.split(':').map(Number);
      next.setDate(config.schedule_day);
      next.setHours(mHour);
      next.setMinutes(mMinute);
      next.setSeconds(0);
      next.setMilliseconds(0);
      if (next <= now) {
        next.setMonth(next.getMonth() + 1);
      }
      return next;

    default:
      return null;
  }
}

/**
 * 推送备份到远程站点
 * @param {Object} config - 推送配置
 * @param {string} backupFilePath - 备份文件路径（可选，如果不提供则创建新备份）
 * @param {number} retryCount - 当前重试次数
 * @returns {Promise<{success: boolean, message?: string, logId?: number}>}
 */
async function pushBackupToRemote(config, backupFilePath = null, retryCount = 0) {
  const MAX_RETRIES = 3;
  let backupFile = backupFilePath;
  let shouldDeleteBackup = false;

  try {
    // 如果没有提供备份文件，创建新的全量备份
    if (!backupFile) {
      const backupResult = await backupFull();
      if (!backupResult.success) {
        return {
          success: false,
          message: `创建备份失败: ${backupResult.message}`
        };
      }
      backupFile = backupResult.filePath;
      shouldDeleteBackup = true;
    }

    // 检查文件是否存在
    if (!fs.existsSync(backupFile)) {
      return {
        success: false,
        message: '备份文件不存在'
      };
    }

    const fileStats = fs.statSync(backupFile);
    const fileName = path.basename(backupFile);

    // 创建 FormData
    const formData = new FormData();
    formData.append('backupFile', fs.createReadStream(backupFile), {
      filename: fileName,
      contentType: 'application/zip'
    });

    // 解析目标URL
    const targetUrl = new URL(config.target_url);
    const isHttps = targetUrl.protocol === 'https:';
    const client = isHttps ? https : http;

    // 获取当前站点URL（从环境变量或默认值）
    const sourceUrl = process.env.SITE_URL || 'unknown';

    // 准备请求选项
    const requestOptions = {
      hostname: targetUrl.hostname,
      port: targetUrl.port || (isHttps ? 443 : 80),
      path: '/api/admin/remote-backup/receive',
      method: 'POST',
      headers: {
        ...formData.getHeaders(),
        'X-API-Token': config.api_token,
        'X-Source-URL': sourceUrl
      },
      timeout: 300000 // 5分钟超时
    };

    // 发送请求
    const result = await new Promise((resolve, reject) => {
      const req = client.request(requestOptions, (res) => {
        let responseData = '';

        res.on('data', (chunk) => {
          responseData += chunk;
        });

        res.on('end', () => {
          if (res.statusCode === 200 || res.statusCode === 201) {
            try {
              const jsonData = JSON.parse(responseData);
              resolve({
                success: jsonData.success || true,
                message: jsonData.message || '推送成功',
                statusCode: res.statusCode
              });
            } catch (e) {
              resolve({
                success: true,
                message: '推送成功',
                statusCode: res.statusCode
              });
            }
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${responseData}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('请求超时'));
      });

      formData.pipe(req);
    });

    // 记录成功日志
    const logId = await logPushResult(config.id, fileName, config.target_url, 'success', null, retryCount);

    // 如果创建了临时备份文件，删除它
    if (shouldDeleteBackup && fs.existsSync(backupFile)) {
      try {
        fs.unlinkSync(backupFile);
      } catch (e) {
        logger.warn('删除临时备份文件失败', { file: backupFile, error: e.message });
      }
    }

    return {
      success: true,
      message: result.message,
      logId: logId
    };

  } catch (error) {
    // 记录失败日志
    const fileName = backupFile ? path.basename(backupFile) : 'unknown';
    const errorMessage = error.message || '未知错误';

    // 如果还有重试次数，进行重试
    if (retryCount < MAX_RETRIES) {
      const logId = await logPushResult(config.id, fileName, config.target_url, 'retrying', errorMessage, retryCount);
      
      logger.warn(`推送备份失败，${5}秒后重试 (${retryCount + 1}/${MAX_RETRIES})`, {
        configId: config.id,
        targetUrl: config.target_url,
        error: errorMessage,
        retryCount: retryCount + 1
      });

      // 等待5秒后重试
      await new Promise(resolve => setTimeout(resolve, 5000));

      return pushBackupToRemote(config, backupFile, retryCount + 1);
    } else {
      // 重试次数用完，记录最终失败
      const logId = await logPushResult(config.id, fileName, config.target_url, 'failed', errorMessage, retryCount);

      // 如果创建了临时备份文件，删除它
      if (shouldDeleteBackup && backupFile && fs.existsSync(backupFile)) {
        try {
          fs.unlinkSync(backupFile);
        } catch (e) {
          logger.warn('删除临时备份文件失败', { file: backupFile, error: e.message });
        }
      }

      return {
        success: false,
        message: `推送失败: ${errorMessage} (已重试${MAX_RETRIES}次)`,
        logId: logId
      };
    }
  }
}

/**
 * 记录推送结果到数据库
 * @param {number} configId - 配置ID
 * @param {string} backupFileName - 备份文件名
 * @param {string} targetUrl - 目标URL
 * @param {string} status - 状态：'success', 'failed', 'retrying'
 * @param {string} errorMessage - 错误信息
 * @param {number} retryCount - 重试次数
 * @returns {Promise<number>} - 日志ID
 */
async function logPushResult(configId, backupFileName, targetUrl, status, errorMessage, retryCount) {
  try {
    const result = await runAsync(
      `INSERT INTO backup_push_logs (config_id, backup_file_name, target_url, status, error_message, retry_count)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [configId, backupFileName, targetUrl, status, errorMessage, retryCount]
    );
    return result.id;
  } catch (error) {
    logger.error('记录推送日志失败', { error: error.message });
    return null;
  }
}

/**
 * 获取接收备份目录
 * @returns {string} - 接收备份目录路径
 */
function getReceivedBackupDir() {
  return RECEIVED_BACKUP_DIR;
}

module.exports = {
  validateApiToken,
  shouldPushNow,
  scheduleNextPush,
  pushBackupToRemote,
  logPushResult,
  getReceivedBackupDir
};

