const fs = require('fs');
const path = require('path');

// 支持 fly.io 持久化卷
const DATA_DIR = fs.existsSync('/data') ? '/data' : path.join(__dirname, '..');
const BACKUP_DIR = path.join(DATA_DIR, 'logs', 'backup');

// 确保备份目录存在
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

// 获取数据库路径（需要动态获取，因为数据库可能还未初始化）
function getDbPath() {
  const DB_DIR = fs.existsSync('/data') ? '/data' : path.join(__dirname, '../db');
  return path.join(DB_DIR, 'boda.db');
}

// 生成备份文件名（包含时间戳）
function generateBackupFileName() {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, -5);
  return `boda-backup-${timestamp}.db`;
}

/**
 * 备份数据库
 * @returns {Promise<{success: boolean, filePath?: string, fileName?: string, size?: number, sizeMB?: number, message?: string}>}
 */
async function backupDatabase() {
  try {
    const DB_PATH = getDbPath();
    // 检查数据库文件是否存在
    if (!fs.existsSync(DB_PATH)) {
      return {
        success: false,
        message: 'Database file not found'
      };
    }

    const backupFileName = generateBackupFileName();
    const backupPath = path.join(BACKUP_DIR, backupFileName);

    // 复制数据库文件
    fs.copyFileSync(DB_PATH, backupPath);

    // 如果存在 WAL 文件，也备份
    const walPath = DB_PATH + '-wal';
    if (fs.existsSync(walPath)) {
      const walBackupPath = backupPath + '-wal';
      fs.copyFileSync(walPath, walBackupPath);
    }

    // 如果存在 SHM 文件，也备份
    const shmPath = DB_PATH + '-shm';
    if (fs.existsSync(shmPath)) {
      const shmBackupPath = backupPath + '-shm';
      fs.copyFileSync(shmPath, shmBackupPath);
    }

    const stats = fs.statSync(backupPath);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(2);

    return {
      success: true,
      filePath: backupPath,
      fileName: backupFileName,
      size: stats.size,
      sizeMB: parseFloat(sizeMB),
      message: `Backup completed: ${backupFileName} (${sizeMB}MB)`
    };
  } catch (error) {
    return {
      success: false,
      message: `Backup failed: ${error.message}`
    };
  }
}

/**
 * 获取备份文件列表
 * @returns {Array<{fileName: string, filePath: string, size: number, sizeMB: number, created: Date}>}
 */
function getBackupList() {
  try {
    if (!fs.existsSync(BACKUP_DIR)) {
      return [];
    }

    const files = fs.readdirSync(BACKUP_DIR)
      .filter(file => file.startsWith('boda-backup-') && file.endsWith('.db'))
      .map(file => {
        const filePath = path.join(BACKUP_DIR, file);
        const stats = fs.statSync(filePath);
        return {
          fileName: file,
          filePath: filePath,
          size: stats.size,
          sizeMB: parseFloat((stats.size / 1024 / 1024).toFixed(2)),
          created: stats.mtime
        };
      })
      .sort((a, b) => b.created - a.created); // 按时间降序排列

    return files;
  } catch (error) {
    return [];
  }
}

/**
 * 恢复数据库
 * @param {string} backupFileName - 备份文件名
 * @returns {Promise<{success: boolean, message?: string}>}
 */
async function restoreDatabase(backupFileName) {
  try {
    const DB_PATH = getDbPath();
    const backupPath = path.join(BACKUP_DIR, backupFileName);

    // 检查备份文件是否存在
    if (!fs.existsSync(backupPath)) {
      return {
        success: false,
        message: 'Backup file not found'
      };
    }

    // 关闭当前数据库连接
    const { closeDatabase } = require('../db/database');
    await closeDatabase();

    // 备份当前数据库（以防万一）
    const currentBackup = await backupDatabase();
    if (!currentBackup.success) {
      // 如果备份失败，仍然继续恢复（用户可能已经决定恢复）
      console.warn('Failed to backup current database before restore');
    }

    // 复制备份文件到数据库位置
    fs.copyFileSync(backupPath, DB_PATH);

    // 如果存在 WAL 文件，也恢复
    const walBackupPath = backupPath + '-wal';
    if (fs.existsSync(walBackupPath)) {
      fs.copyFileSync(walBackupPath, DB_PATH + '-wal');
    }

    // 如果存在 SHM 文件，也恢复
    const shmBackupPath = backupPath + '-shm';
    if (fs.existsSync(shmBackupPath)) {
      fs.copyFileSync(shmBackupPath, DB_PATH + '-shm');
    }

    // 注意：由于数据库连接是全局的，恢复后需要重启服务器才能生效
    // 这里只是复制文件，实际的数据库连接会在下次请求时重新建立

    return {
      success: true,
      message: 'Database restored successfully. Please restart the server for changes to take effect.'
    };
  } catch (error) {
    return {
      success: false,
      message: `Restore failed: ${error.message}`
    };
  }
}

/**
 * 删除备份文件
 * @param {string} backupFileName - 备份文件名
 * @returns {Promise<{success: boolean, message?: string}>}
 */
async function deleteBackup(backupFileName) {
  try {
    const backupPath = path.join(BACKUP_DIR, backupFileName);

    if (!fs.existsSync(backupPath)) {
      return {
        success: false,
        message: 'Backup file not found'
      };
    }

    // 删除主文件
    fs.unlinkSync(backupPath);

    // 删除 WAL 和 SHM 文件（如果存在）
    const walPath = backupPath + '-wal';
    if (fs.existsSync(walPath)) {
      fs.unlinkSync(walPath);
    }

    const shmPath = backupPath + '-shm';
    if (fs.existsSync(shmPath)) {
      fs.unlinkSync(shmPath);
    }

    return {
      success: true,
      message: 'Backup file deleted successfully'
    };
  } catch (error) {
    return {
      success: false,
      message: `Delete failed: ${error.message}`
    };
  }
}

/**
 * 清理旧备份（保留最近N个）
 * @param {number} keepCount - 保留的备份数量
 * @returns {Promise<number>} 删除的备份数量
 */
async function cleanupOldBackups(keepCount = 30) {
  try {
    const backups = getBackupList();

    if (backups.length <= keepCount) {
      return 0;
    }

    const backupsToDelete = backups.slice(keepCount);
    let deletedCount = 0;

    for (const backup of backupsToDelete) {
      const result = await deleteBackup(backup.fileName);
      if (result.success) {
        deletedCount++;
      }
    }

    return deletedCount;
  } catch (error) {
    return 0;
  }
}

module.exports = {
  backupDatabase,
  getBackupList,
  restoreDatabase,
  deleteBackup,
  cleanupOldBackups,
  BACKUP_DIR
};
