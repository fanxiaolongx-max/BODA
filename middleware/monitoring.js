const { logger } = require('../utils/logger');

// 性能监控中间件
function monitoringMiddleware(req, res, next) {
  const startTime = Date.now();
  const startMemory = process.memoryUsage().heapUsed;

  // 监听响应完成
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const endMemory = process.memoryUsage().heapUsed;
    const memoryDelta = ((endMemory - startMemory) / 1024 / 1024).toFixed(2);

    // 记录性能指标
    logger.info('Request Performance', {
      method: req.method,
      url: req.url,
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
        duration: `${duration}ms`
      });
    }
  });

  next();
}

module.exports = monitoringMiddleware;

