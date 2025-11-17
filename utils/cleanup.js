const fs = require('fs');
const path = require('path');

// 支持 fly.io 持久化卷
const DATA_DIR = fs.existsSync('/data') ? '/data' : path.join(__dirname, '..');

/**
 * 清理超过指定时间的文件
 * @param {Object} options - 清理选项
 * @param {number} options.days - 保留天数（超过此天数的文件将被删除）
 * @param {boolean} options.cleanPaymentScreenshots - 是否清理付款截图
 * @param {boolean} options.cleanLogs - 是否清理日志文件
 * @returns {Promise<{success: boolean, deletedFiles: number, freedSpace: number, message?: string}>}
 */
async function cleanupOldFiles(options) {
  const { days = 30, cleanPaymentScreenshots = false, cleanLogs = false } = options;
  
  let deletedFiles = 0;
  let freedSpace = 0; // 字节
  const errors = [];
  
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  const cutoffTime = cutoffDate.getTime();
  
  try {
    // 清理付款截图
    if (cleanPaymentScreenshots) {
      const paymentsDir = path.join(DATA_DIR, 'uploads', 'payments');
      if (fs.existsSync(paymentsDir)) {
        const files = fs.readdirSync(paymentsDir);
        for (const file of files) {
          const filePath = path.join(paymentsDir, file);
          try {
            const stats = fs.statSync(filePath);
            if (stats.isFile() && stats.mtime.getTime() < cutoffTime) {
              const fileSize = stats.size;
              fs.unlinkSync(filePath);
              deletedFiles++;
              freedSpace += fileSize;
            }
          } catch (error) {
            errors.push(`Failed to delete payment screenshot ${file}: ${error.message}`);
          }
        }
      }
    }
    
    // 清理日志文件
    if (cleanLogs) {
      const logsDir = path.join(DATA_DIR, 'logs');
      if (fs.existsSync(logsDir)) {
        // 清理日志文件（不包括backup目录）
        const cleanupLogDir = (dir) => {
          const items = fs.readdirSync(dir);
          for (const item of items) {
            // 跳过backup目录
            if (item === 'backup' || item === 'export') {
              continue;
            }
            
            const itemPath = path.join(dir, item);
            try {
              const stats = fs.statSync(itemPath);
              if (stats.isFile()) {
                // 检查文件修改时间
                if (stats.mtime.getTime() < cutoffTime) {
                  const fileSize = stats.size;
                  fs.unlinkSync(itemPath);
                  deletedFiles++;
                  freedSpace += fileSize;
                }
              } else if (stats.isDirectory()) {
                // 递归清理子目录
                cleanupLogDir(itemPath);
              }
            } catch (error) {
              errors.push(`Failed to delete log file ${item}: ${error.message}`);
            }
          }
        };
        
        cleanupLogDir(logsDir);
      }
    }
    
    const freedSpaceMB = (freedSpace / 1024 / 1024).toFixed(2);
    const message = `Cleanup completed. Deleted ${deletedFiles} files, freed ${freedSpaceMB}MB.${errors.length > 0 ? ` Errors: ${errors.length}` : ''}`;
    
    return {
      success: true,
      deletedFiles,
      freedSpace,
      freedSpaceMB: parseFloat(freedSpaceMB),
      errors: errors.length > 0 ? errors : undefined,
      message
    };
  } catch (error) {
    return {
      success: false,
      deletedFiles,
      freedSpace,
      message: `Cleanup failed: ${error.message}`
    };
  }
}

/**
 * 获取可清理文件的信息（不实际删除）
 * @param {Object} options - 清理选项
 * @param {number} options.days - 保留天数
 * @param {boolean} options.cleanPaymentScreenshots - 是否检查付款截图
 * @param {boolean} options.cleanLogs - 是否检查日志文件
 * @returns {Promise<{totalFiles: number, totalSize: number, totalSizeMB: number, files: Array}>}
 */
async function getCleanupInfo(options) {
  const { days = 30, cleanPaymentScreenshots = false, cleanLogs = false } = options;
  
  let totalFiles = 0;
  let totalSize = 0;
  const files = [];
  
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  const cutoffTime = cutoffDate.getTime();
  
  try {
    // 检查付款截图
    if (cleanPaymentScreenshots) {
      const paymentsDir = path.join(DATA_DIR, 'uploads', 'payments');
      if (fs.existsSync(paymentsDir)) {
        const dirFiles = fs.readdirSync(paymentsDir);
        for (const file of dirFiles) {
          const filePath = path.join(paymentsDir, file);
          try {
            const stats = fs.statSync(filePath);
            if (stats.isFile() && stats.mtime.getTime() < cutoffTime) {
              totalFiles++;
              totalSize += stats.size;
              files.push({
                path: filePath,
                name: file,
                size: stats.size,
                modified: stats.mtime,
                type: 'payment_screenshot'
              });
            }
          } catch (error) {
            // 忽略无法访问的文件
          }
        }
      }
    }
    
    // 检查日志文件
    if (cleanLogs) {
      const logsDir = path.join(DATA_DIR, 'logs');
      if (fs.existsSync(logsDir)) {
        const checkLogDir = (dir) => {
          const items = fs.readdirSync(dir);
          for (const item of items) {
            // 跳过backup和export目录
            if (item === 'backup' || item === 'export') {
              continue;
            }
            
            const itemPath = path.join(dir, item);
            try {
              const stats = fs.statSync(itemPath);
              if (stats.isFile()) {
                if (stats.mtime.getTime() < cutoffTime) {
                  totalFiles++;
                  totalSize += stats.size;
                  files.push({
                    path: itemPath,
                    name: item,
                    size: stats.size,
                    modified: stats.mtime,
                    type: 'log'
                  });
                }
              } else if (stats.isDirectory()) {
                checkLogDir(itemPath);
              }
            } catch (error) {
              // 忽略无法访问的文件
            }
          }
        };
        
        checkLogDir(logsDir);
      }
    }
    
    return {
      totalFiles,
      totalSize,
      totalSizeMB: parseFloat((totalSize / 1024 / 1024).toFixed(2)),
      files: files.slice(0, 100) // 只返回前100个文件，避免响应过大
    };
  } catch (error) {
    return {
      totalFiles: 0,
      totalSize: 0,
      totalSizeMB: 0,
      files: [],
      error: error.message
    };
  }
}

module.exports = {
  cleanupOldFiles,
  getCleanupInfo
};

