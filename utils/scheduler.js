// 定时任务调度器（已禁用自动开放时间功能，只保留手动控制）
const { logger } = require('./logger');
const { allAsync, getAsync } = require('../db/database');
const { shouldPushNow, pushBackupToRemote } = require('./remote-backup');

let checkInterval = null;
let pushCheckInterval = null;

// 启动定时任务（已禁用，不再执行自动开放时间检查）
function startScheduler() {
  // 不再执行自动开放时间检查
  logger.info('定时任务调度器已启动（自动开放时间功能已禁用）');
  
  // 启动远程备份推送检查（每分钟检查一次）
  startRemoteBackupScheduler();
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
}

module.exports = {
  startScheduler,
  stopScheduler
};

