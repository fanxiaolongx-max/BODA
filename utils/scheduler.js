// 定时任务调度器（已禁用自动开放时间功能，只保留手动控制）
const { logger } = require('./logger');
const { allAsync, getAsync } = require('../db/database');
const { shouldPushNow, pushBackupToRemote } = require('./remote-backup');
const { fetchExchangeRates } = require('./exchange-rate-fetcher');
const { updateExchangeRateAPI } = require('./exchange-rate-updater');

let checkInterval = null;
let pushCheckInterval = null;
let exchangeRateCheckInterval = null;
let apiLogsCleanupInterval = null;
let backupAndLogCleanupInterval = null;

// 启动定时任务（已禁用，不再执行自动开放时间检查）
function startScheduler() {
  // 不再执行自动开放时间检查
  logger.info('定时任务调度器已启动（自动开放时间功能已禁用）');
  
  // 启动远程备份推送检查（每分钟检查一次）
  startRemoteBackupScheduler();
  
  // 启动汇率更新调度器
  startExchangeRateScheduler();
  
  // 启动API日志清理调度器
  startApiLogsCleanupScheduler();
  
  // 启动备份和日志清理调度器
  startBackupAndLogCleanupScheduler();
}

// 启动远程备份推送调度器
function startRemoteBackupScheduler() {
  // 每分钟检查一次是否需要推送
  pushCheckInterval = setInterval(async () => {
    try {
      // 获取所有启用的推送配置
      const configs = await allAsync(
        'SELECT * FROM remote_backup_configs WHERE enabled = 1 AND schedule_type != ?',
        ['manual']
      );

      for (const config of configs) {
        try {
          // 获取上次推送时间（从日志中获取）
          const lastLog = await getAsync(
            `SELECT created_at FROM backup_push_logs 
             WHERE config_id = ? AND status = 'success' 
             ORDER BY created_at DESC LIMIT 1`,
            [config.id]
          );

          const lastPushTime = lastLog ? lastLog.created_at : null;

          // 判断是否应该推送
          if (shouldPushNow(config, lastPushTime)) {
            logger.info('开始自动推送备份', {
              configId: config.id,
              name: config.name,
              targetUrl: config.target_url,
              scheduleType: config.schedule_type
            });

            // 异步执行推送（不阻塞其他配置的检查）
            pushBackupToRemote(config)
              .then(result => {
                logger.info('自动推送完成', {
                  configId: config.id,
                  success: result.success,
                  message: result.message
                });
              })
              .catch(error => {
                logger.error('自动推送失败', {
                  configId: config.id,
                  error: error.message
                });
              });
          }
        } catch (error) {
          logger.error('检查推送配置失败', {
            configId: config.id,
            error: error.message
          });
        }
      }
    } catch (error) {
      logger.error('远程备份调度器检查失败', { error: error.message });
    }
  }, 60000); // 每分钟检查一次

  logger.info('远程备份推送调度器已启动（每分钟检查一次）');
}

// 启动汇率更新调度器
function startExchangeRateScheduler() {
  let checkCount = 0; // 检查计数器，用于控制日志频率
  
  // 每小时检查一次是否需要更新汇率
  exchangeRateCheckInterval = setInterval(async () => {
    checkCount++;
    try {
      // 获取设置
      const settings = await allAsync('SELECT key, value FROM settings');
      const settingsObj = {};
      settings.forEach(s => {
        settingsObj[s.key] = s.value;
      });

      // 检查是否启用自动更新
      if (settingsObj.exchange_rate_auto_update_enabled !== 'true') {
        // 每24次检查记录一次（每24小时），避免日志过多
        if (checkCount % 24 === 0) {
          logger.debug('汇率自动更新未启用，跳过检查');
        }
        return; // 未启用，跳过
      }

      // 检查API密钥是否配置
      const freecurrencyapiKey = settingsObj.freecurrencyapi_api_key;
      const exchangerateKey = settingsObj.exchangerate_api_key;
      if (!freecurrencyapiKey && !exchangerateKey) {
        logger.warn('汇率自动更新已启用但未配置API密钥');
        return;
      }

      // 获取更新频率
      const frequency = settingsObj.exchange_rate_update_frequency || 'daily';
      
      // 检查上次更新时间
      const lastUpdateKey = 'exchange_rate_last_update';
      const lastUpdateSetting = await getAsync(
        'SELECT value FROM settings WHERE key = ?',
        [lastUpdateKey]
      );
      
      const now = new Date();
      let shouldUpdate = false;
      let hoursSinceUpdate = 0;

      if (!lastUpdateSetting || !lastUpdateSetting.value) {
        // 从未更新过，立即更新
        shouldUpdate = true;
        logger.info('汇率更新检查：从未更新过，将立即更新');
      } else {
        const lastUpdate = new Date(lastUpdateSetting.value);
        hoursSinceUpdate = (now - lastUpdate) / (1000 * 60 * 60);

        if (frequency === 'hourly' && hoursSinceUpdate >= 1) {
          shouldUpdate = true;
        } else if (frequency === 'daily' && hoursSinceUpdate >= 24) {
          shouldUpdate = true;
        }
        
        // 记录检查结果（每6次检查记录一次，即每6小时）
        if (checkCount % 6 === 0) {
          logger.info('汇率更新检查', {
            frequency,
            hoursSinceUpdate: hoursSinceUpdate.toFixed(2),
            lastUpdate: lastUpdateSetting.value,
            shouldUpdate: shouldUpdate,
            nextCheckIn: shouldUpdate ? '立即更新' : `${(frequency === 'hourly' ? 1 : 24) - hoursSinceUpdate}小时`
          });
        }
      }

      if (shouldUpdate) {
        logger.info('开始自动更新汇率', {
          frequency,
          lastUpdate: lastUpdateSetting?.value || '从未更新',
          hoursSinceUpdate: hoursSinceUpdate.toFixed(2)
        });

        try {
          // 获取汇率
          const exchangeRatesResult = await fetchExchangeRates({
            freecurrencyapi_api_key: freecurrencyapiKey,
            exchangerate_api_key: exchangerateKey,
            exchange_rate_base_currencies: settingsObj.exchange_rate_base_currencies || 'CNY,USD,EUR,GBP,JPY,SAR,AED,RUB,INR,KRW,THB',
            exchange_rate_target_currency: settingsObj.exchange_rate_target_currency || 'EGP'
          });

          // 更新API（updateExchangeRateAPI会自动处理新格式和旧格式）
          const updateResult = await updateExchangeRateAPI(exchangeRatesResult);

          // 获取实际的汇率数据（兼容新格式和旧格式）
          const ratesData = exchangeRatesResult.rates || exchangeRatesResult;

          // 更新最后更新时间（统一使用UTC时间，避免时区混淆）
          const { runAsync } = require('../db/database');
          await runAsync(
            `INSERT INTO settings (key, value, updated_at) 
             VALUES (?, ?, datetime('now'))
             ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = datetime('now')`,
            [lastUpdateKey, now.toISOString(), now.toISOString()]
          );

          logger.info('汇率自动更新成功', {
            currencies: Object.keys(ratesData).length,
            updatedAt: updateResult.updateTime || now.toISOString(),
            apiUpdateTime: exchangeRatesResult.updateTime || '未提供'
          });
          
          // 重置计数器
          checkCount = 0;
        } catch (error) {
          logger.error('汇率自动更新失败', {
            error: error.message,
            stack: error.stack
          });
        }
      }
    } catch (error) {
      logger.error('汇率更新调度器检查失败', { 
        error: error.message,
        stack: error.stack
      });
    }
  }, 60 * 60 * 1000); // 每小时检查一次

  logger.info('汇率更新调度器已启动（每小时检查一次）');
}

// 启动API日志清理调度器
function startApiLogsCleanupScheduler() {
  // 每小时清理一次超过3小时的消息体（request_body 和 response_body）
  apiLogsCleanupInterval = setInterval(async () => {
    try {
      const { runAsync, allAsync } = require('../db/database');
      
      // 先统计要清理的记录数
      const countResult = await allAsync(`
        SELECT COUNT(*) as count
        FROM custom_api_logs
        WHERE created_at < datetime('now', '-3 hours')
          AND (
            (request_body IS NOT NULL AND request_body != '')
            OR (response_body IS NOT NULL AND response_body != '')
          )
      `);
      
      const countToClean = countResult[0]?.count || 0;
      
      if (countToClean === 0) {
        return; // 没有需要清理的记录
      }
      
      // 执行清理：同时清理 request_body 和 response_body
      await runAsync(`
        UPDATE custom_api_logs
        SET 
          request_body = NULL,
          response_body = NULL
        WHERE created_at < datetime('now', '-3 hours')
          AND (
            (request_body IS NOT NULL AND request_body != '')
            OR (response_body IS NOT NULL AND response_body != '')
          )
      `);
      
      logger.info('自动清理超过3小时的消息体（request_body 和 response_body）', {
        cleaned: countToClean
      });
    } catch (error) {
      logger.error('自动清理消息体失败', { error: error.message });
    }
  }, 60 * 60 * 1000); // 每小时执行一次
  
  logger.info('API日志清理调度器已启动（每小时清理一次超过3小时的消息体）');
}

// 启动备份和日志清理调度器
function startBackupAndLogCleanupScheduler() {
  // 每天凌晨2点执行一次清理任务
  const cleanupInterval = 24 * 60 * 60 * 1000; // 24小时
  let lastCleanupTime = 0;
  
  // 立即执行一次（如果距离上次清理超过12小时）
  const checkAndCleanup = async () => {
    const now = Date.now();
    // 如果距离上次清理超过12小时，执行清理
    if (now - lastCleanupTime > 12 * 60 * 60 * 1000) {
      lastCleanupTime = now;
      
      try {
        // 清理超过7天的备份文件
        const { cleanupOldBackups } = require('../scripts/backup');
        const backupResult = cleanupOldBackups(7);
        
        // 清理超过7天的日志文件
        const { cleanupAllLogs } = require('./log-cleanup');
        const logResult = await cleanupAllLogs(7);
        
        logger.info('自动清理备份和日志完成', {
          backups: {
            deletedFiles: backupResult.deletedCount,
            freedSpaceMB: (backupResult.freedSpace / 1024 / 1024).toFixed(2)
          },
          logs: {
            appLogs: {
              deletedFiles: logResult.appLogs.deletedFiles,
              freedSpaceMB: (logResult.appLogs.freedSpace / 1024 / 1024).toFixed(2)
            },
            systemLogs: {
              deletedFiles: logResult.systemLogs.deletedFiles,
              freedSpaceMB: (logResult.systemLogs.freedSpace / 1024 / 1024).toFixed(2)
            }
          }
        });
      } catch (error) {
        logger.error('自动清理备份和日志失败', { error: error.message });
      }
    }
  };
  
  // 立即检查一次
  checkAndCleanup();
  
  // 每12小时检查一次
  setInterval(checkAndCleanup, 12 * 60 * 60 * 1000);
  
  logger.info('备份和日志清理调度器已启动（每12小时清理一次超过7天的备份和日志）');
}

// 停止定时任务
function stopScheduler() {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
    logger.info('定时任务调度器已停止');
  }
  
  if (pushCheckInterval) {
    clearInterval(pushCheckInterval);
    pushCheckInterval = null;
    logger.info('远程备份推送调度器已停止');
  }
  
  if (exchangeRateCheckInterval) {
    clearInterval(exchangeRateCheckInterval);
    exchangeRateCheckInterval = null;
    logger.info('汇率更新调度器已停止');
  }
  
  if (apiLogsCleanupInterval) {
    clearInterval(apiLogsCleanupInterval);
    apiLogsCleanupInterval = null;
    logger.info('API日志清理调度器已停止');
  }
  
  if (backupAndLogCleanupInterval) {
    clearInterval(backupAndLogCleanupInterval);
    backupAndLogCleanupInterval = null;
    logger.info('备份和日志清理调度器已停止');
  }
}

module.exports = {
  startScheduler,
  stopScheduler
};

