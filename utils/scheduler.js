// 定时任务调度器（已禁用自动开放时间功能，只保留手动控制）
const { logger } = require('./logger');
const { allAsync, getAsync } = require('../db/database');
const { shouldPushNow, pushBackupToRemote } = require('./remote-backup');
const { fetchExchangeRates } = require('./exchange-rate-fetcher');
const { updateExchangeRateAPI } = require('./exchange-rate-updater');

let checkInterval = null;
let pushCheckInterval = null;
let exchangeRateCheckInterval = null;

// 启动定时任务（已禁用，不再执行自动开放时间检查）
function startScheduler() {
  // 不再执行自动开放时间检查
  logger.info('定时任务调度器已启动（自动开放时间功能已禁用）');
  
  // 启动远程备份推送检查（每分钟检查一次）
  startRemoteBackupScheduler();
  
  // 启动汇率更新调度器
  startExchangeRateScheduler();
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
          const exchangeRates = await fetchExchangeRates({
            freecurrencyapi_api_key: freecurrencyapiKey,
            exchangerate_api_key: exchangerateKey,
            exchange_rate_base_currencies: settingsObj.exchange_rate_base_currencies || 'CNY,USD,EUR,GBP,JPY,SAR,AED,RUB,INR,KRW,THB',
            exchange_rate_target_currency: settingsObj.exchange_rate_target_currency || 'EGP'
          });

          // 更新API
          await updateExchangeRateAPI(exchangeRates);

          // 更新最后更新时间
          const { runAsync } = require('../db/database');
          await runAsync(
            `INSERT INTO settings (key, value, updated_at) 
             VALUES (?, ?, datetime('now', 'localtime'))
             ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = datetime('now', 'localtime')`,
            [lastUpdateKey, now.toISOString(), now.toISOString()]
          );

          logger.info('汇率自动更新成功', {
            currencies: Object.keys(exchangeRates).length,
            updatedAt: now.toISOString()
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
}

module.exports = {
  startScheduler,
  stopScheduler
};

