const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { logger } = require('./logger');

// 支持 fly.io 持久化卷
const DATA_DIR = fs.existsSync('/data') ? '/data' : path.join(__dirname, '..');
const LOGS_DIR = path.join(DATA_DIR, 'logs');

/**
 * 清理应用日志文件（超过指定天数）
 * @param {number} days - 保留天数（默认7天）
 * @returns {Promise<{deletedFiles: number, freedSpace: number}>}
 */
async function cleanupAppLogs(days = 7) {
  const cutoffTime = Date.now() - (days * 24 * 60 * 60 * 1000);
  let deletedFiles = 0;
  let freedSpace = 0;

  try {
    if (!fs.existsSync(LOGS_DIR)) {
      return { deletedFiles: 0, freedSpace: 0 };
    }

    // 清理日志文件（不包括backup目录）
    const cleanupLogDir = (dir) => {
      if (!fs.existsSync(dir)) {
        return;
      }

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
              logger.debug(`Deleted old log file: ${itemPath} (${(fileSize / 1024 / 1024).toFixed(2)}MB)`);
            }
          } else if (stats.isDirectory()) {
            // 递归清理子目录
            cleanupLogDir(itemPath);
          }
        } catch (error) {
          logger.error(`Failed to delete log file ${itemPath}: ${error.message}`);
        }
      }
    };

    cleanupLogDir(LOGS_DIR);

    if (deletedFiles > 0) {
      logger.info('应用日志清理完成', {
        deletedFiles,
        freedSpaceMB: (freedSpace / 1024 / 1024).toFixed(2)
      });
    }

    return { deletedFiles, freedSpace };
  } catch (error) {
    logger.error('清理应用日志失败', { error: error.message });
    return { deletedFiles: 0, freedSpace: 0 };
  }
}

/**
 * 清理系统日志（/var/log）
 * @param {number} days - 保留天数（默认7天）
 * @returns {Promise<{deletedFiles: number, freedSpace: number}>}
 */
async function cleanupSystemLogs(days = 7) {
  let deletedFiles = 0;
  let freedSpace = 0;

  try {
    // 清理 systemd journal 日志（保留指定天数）
    try {
      execSync(`journalctl --vacuum-time=${days}d`, { stdio: 'pipe' });
      logger.info(`清理 systemd journal 日志（保留${days}天）`);
    } catch (error) {
      // 如果没有权限或命令不存在，跳过
      logger.debug('清理 systemd journal 日志失败（可能需要sudo权限）', { error: error.message });
    }

    // 清理 /var/log 目录中的旧日志文件
    const varLogDir = '/var/log';
    if (fs.existsSync(varLogDir)) {
      const cutoffTime = Date.now() - (days * 24 * 60 * 60 * 1000);

      const cleanupVarLog = (dir) => {
        if (!fs.existsSync(dir)) {
          return;
        }

        try {
          const items = fs.readdirSync(dir);
          for (const item of items) {
            // 跳过一些重要目录
            if (item === 'journal' || item === 'private' || item === 'README') {
              continue;
            }

            const itemPath = path.join(dir, item);
            try {
              const stats = fs.statSync(itemPath);
              if (stats.isFile()) {
                // 检查文件修改时间
                if (stats.mtime.getTime() < cutoffTime) {
                  // 只删除压缩的日志文件（.gz）和旧的日志文件
                  if (item.endsWith('.gz') || item.match(/\.log\.\d+$/)) {
                    const fileSize = stats.size;
                    try {
                      fs.unlinkSync(itemPath);
                      deletedFiles++;
                      freedSpace += fileSize;
                      logger.debug(`Deleted old system log: ${itemPath} (${(fileSize / 1024 / 1024).toFixed(2)}MB)`);
                    } catch (error) {
                      // 可能需要sudo权限，跳过
                      logger.debug(`Failed to delete ${itemPath}: ${error.message}`);
                    }
                  }
                }
              } else if (stats.isDirectory() && item !== 'journal') {
                // 递归清理子目录（跳过journal目录）
                cleanupVarLog(itemPath);
              }
            } catch (error) {
              // 忽略权限错误
            }
          }
        } catch (error) {
          // 忽略权限错误
        }
      };

      cleanupVarLog(varLogDir);
    }

    // 清空 btmp 文件（失败的登录尝试日志）
    try {
      const btmpPath = '/var/log/btmp';
      if (fs.existsSync(btmpPath)) {
        const stats = fs.statSync(btmpPath);
        if (stats.size > 10 * 1024 * 1024) { // 大于10MB才清空
          execSync(`sudo truncate -s 0 ${btmpPath}`, { stdio: 'pipe' });
          freedSpace += stats.size;
          logger.info(`清空 btmp 文件，释放 ${(stats.size / 1024 / 1024).toFixed(2)}MB`);
        }
      }
    } catch (error) {
      // 可能需要sudo权限，跳过
      logger.debug('清空 btmp 文件失败（可能需要sudo权限）', { error: error.message });
    }

    if (deletedFiles > 0 || freedSpace > 0) {
      logger.info('系统日志清理完成', {
        deletedFiles,
        freedSpaceMB: (freedSpace / 1024 / 1024).toFixed(2)
      });
    }

    return { deletedFiles, freedSpace };
  } catch (error) {
    logger.error('清理系统日志失败', { error: error.message });
    return { deletedFiles: 0, freedSpace: 0 };
  }
}

/**
 * 清理所有日志（应用日志 + 系统日志）
 * @param {number} days - 保留天数（默认7天）
 * @returns {Promise<{appLogs: {deletedFiles: number, freedSpace: number}, systemLogs: {deletedFiles: number, freedSpace: number}}>}
 */
async function cleanupAllLogs(days = 7) {
  const appLogs = await cleanupAppLogs(days);
  const systemLogs = await cleanupSystemLogs(days);

  const totalDeleted = appLogs.deletedFiles + systemLogs.deletedFiles;
  const totalFreed = appLogs.freedSpace + systemLogs.freedSpace;

  if (totalDeleted > 0 || totalFreed > 0) {
    logger.info('所有日志清理完成', {
      totalDeletedFiles: totalDeleted,
      totalFreedSpaceMB: (totalFreed / 1024 / 1024).toFixed(2),
      appLogs: {
        deletedFiles: appLogs.deletedFiles,
        freedSpaceMB: (appLogs.freedSpace / 1024 / 1024).toFixed(2)
      },
      systemLogs: {
        deletedFiles: systemLogs.deletedFiles,
        freedSpaceMB: (systemLogs.freedSpace / 1024 / 1024).toFixed(2)
      }
    });
  }

  return { appLogs, systemLogs };
}

module.exports = {
  cleanupAppLogs,
  cleanupSystemLogs,
  cleanupAllLogs
};

