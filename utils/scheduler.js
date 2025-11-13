// 定时任务调度器（已禁用自动开放时间功能，只保留手动控制）
const { logger } = require('./logger');

let checkInterval = null;

// 启动定时任务（已禁用，不再执行自动开放时间检查）
function startScheduler() {
  // 不再执行自动开放时间检查
  logger.info('定时任务调度器已启动（自动开放时间功能已禁用）');
}

// 停止定时任务
function stopScheduler() {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
    logger.info('定时任务调度器已停止');
  }
}

module.exports = {
  startScheduler,
  stopScheduler
};

