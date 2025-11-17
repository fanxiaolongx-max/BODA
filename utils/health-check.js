const { getAsync, DB_PATH } = require('../db/database');
const fs = require('fs');
const path = require('path');

/**
 * 执行健康检查
 * @returns {Promise<Object>} 健康检查结果
 */
async function performHealthCheck() {
  const checks = {
    database: { status: 'unknown', message: '' },
    disk: { status: 'unknown', message: '' },
    memory: { status: 'unknown', message: '' }
  };

  // 检查数据库连接
  try {
    await getAsync('SELECT 1');
    checks.database = { status: 'healthy', message: 'Database connection OK' };
  } catch (error) {
    checks.database = { status: 'unhealthy', message: `Database error: ${error.message}` };
  }

  // 检查磁盘空间（检查数据库文件所在目录，使用 DB_PATH）
  try {
    const dbPath = DB_PATH;
    const stats = fs.statSync(dbPath);
    const dbSize = stats.size;
    const dbSizeMB = (dbSize / 1024 / 1024).toFixed(2);
    
    // 检查数据库文件大小（如果超过1GB，发出警告）
    if (dbSize > 1024 * 1024 * 1024) {
      checks.disk = { 
        status: 'warning', 
        message: `Database size: ${dbSizeMB}MB (consider archiving old data)` 
      };
    } else {
      checks.disk = { 
        status: 'healthy', 
        message: `Database size: ${dbSizeMB}MB` 
      };
    }
  } catch (error) {
    checks.disk = { status: 'unknown', message: `Cannot check disk: ${error.message}` };
  }

  // 检查内存使用
  try {
    const memUsage = process.memoryUsage();
    const memUsageMB = {
      rss: (memUsage.rss / 1024 / 1024).toFixed(2),
      heapTotal: (memUsage.heapTotal / 1024 / 1024).toFixed(2),
      heapUsed: (memUsage.heapUsed / 1024 / 1024).toFixed(2)
    };
    
    // 如果堆内存使用超过500MB，发出警告
    if (memUsage.heapUsed > 500 * 1024 * 1024) {
      checks.memory = { 
        status: 'warning', 
        message: `Memory usage: ${memUsageMB.heapUsed}MB / ${memUsageMB.heapTotal}MB` 
      };
    } else {
      checks.memory = { 
        status: 'healthy', 
        message: `Memory usage: ${memUsageMB.heapUsed}MB / ${memUsageMB.heapTotal}MB` 
      };
    }
  } catch (error) {
    checks.memory = { status: 'unknown', message: `Cannot check memory: ${error.message}` };
  }

  // 计算总体健康状态
  const allHealthy = Object.values(checks).every(check => check.status === 'healthy');
  const hasWarning = Object.values(checks).some(check => check.status === 'warning');
  const hasUnhealthy = Object.values(checks).some(check => check.status === 'unhealthy');

  let overallStatus = 'healthy';
  if (hasUnhealthy) {
    overallStatus = 'unhealthy';
  } else if (hasWarning) {
    overallStatus = 'warning';
  }

  return {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    checks
  };
}

module.exports = {
  performHealthCheck
};

