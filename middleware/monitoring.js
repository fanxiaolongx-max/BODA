const { logger } = require('../utils/logger');
const { shouldLogPerformance } = require('../utils/log-helper');

// 性能监控中间件
function monitoringMiddleware(req, res, next) {
  const startTime = Date.now();
  const startMemory = process.memoryUsage().heapUsed;

  // 监听响应完成
  res.on('finish', async () => {
    const duration = Date.now() - startTime;
    const endMemory = process.memoryUsage().heapUsed;
    const memoryDelta = ((endMemory - startMemory) / 1024 / 1024).toFixed(2);

    // 检查是否应该记录性能日志
    const shouldLog = await shouldLogPerformance(req, duration);
    
    if (shouldLog) {
      // 记录性能指标（合并到一条日志中）
    logger.info('Request Performance', {
      method: req.method,
      url: req.url,
        path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      memoryDelta: `${memoryDelta}MB`,
      ip: req.ip || req.connection.remoteAddress
    });

    // 如果响应时间超过1秒，记录警告
    if (duration > 1000) {
      logger.warn('Slow Request Detected', {
        method: req.method,
        url: req.url,
          path: req.path,
        duration: `${duration}ms`
      });
      }
    }
  });

  next();
}

module.exports = monitoringMiddleware;

