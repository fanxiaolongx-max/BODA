const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const AdmZip = require('adm-zip');

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
function generateBackupFileName(type = 'db') {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, -5);
  if (type === 'full') {
    return `boda-full-backup-${timestamp}.zip`;
  }
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
 * 创建完整备份（数据库+文件）
 * @returns {Promise<{success: boolean, filePath?: string, fileName?: string, size?: number, sizeMB?: number, message?: string}>}
 */
async function backupFull() {
  return new Promise((resolve) => {
    try {
      const DB_PATH = getDbPath();
      
      // 检查数据库文件是否存在
      if (!fs.existsSync(DB_PATH)) {
        return resolve({
          success: false,
          message: 'Database file not found'
        });
      }

      const backupFileName = generateBackupFileName('full');
      const backupPath = path.join(BACKUP_DIR, backupFileName);

      // 创建ZIP文件
      const output = fs.createWriteStream(backupPath);
      const archive = archiver('zip', {
        zlib: { level: 9 } // 最高压缩级别
      });

      // 监听所有归档数据都写入完成
      output.on('close', () => {
        const stats = fs.statSync(backupPath);
        const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
        
        resolve({
          success: true,
          filePath: backupPath,
          fileName: backupFileName,
          size: stats.size,
          sizeMB: parseFloat(sizeMB),
          message: `Full backup completed: ${backupFileName} (${sizeMB}MB)`
        });
      });

      // 监听错误
      archive.on('error', (err) => {
        resolve({
          success: false,
          message: `Backup failed: ${err.message}`
        });
      });

      // 管道归档数据到文件
      archive.pipe(output);

      // 添加数据库文件
      archive.file(DB_PATH, { name: 'boda.db' });

      // 添加WAL和SHM文件（如果存在）
      const walPath = DB_PATH + '-wal';
      const shmPath = DB_PATH + '-shm';
      if (fs.existsSync(walPath)) {
        archive.file(walPath, { name: 'boda.db-wal' });
      }
      if (fs.existsSync(shmPath)) {
        archive.file(shmPath, { name: 'boda.db-shm' });
      }

      // 添加uploads目录（产品图片和支付截图）
      const uploadsDir = path.join(DATA_DIR, 'uploads');
      if (fs.existsSync(uploadsDir)) {
        archive.directory(uploadsDir, 'uploads');
      }

      // 添加show目录（展示图片）
      // 优先使用 DATA_DIR/show，如果不存在则回退到项目根目录
      const SHOW_DIR = path.join(DATA_DIR, 'show');
      const FALLBACK_SHOW_DIR = path.join(__dirname, '..', 'show');
      const showDir = fs.existsSync(SHOW_DIR) ? SHOW_DIR : FALLBACK_SHOW_DIR;
      if (fs.existsSync(showDir)) {
        archive.directory(showDir, 'show');
      }

      // 完成归档
      archive.finalize();
    } catch (error) {
      resolve({
        success: false,
        message: `Backup failed: ${error.message}`
      });
    }
  });
}

/**
 * 获取备份文件列表（包括数据库备份和完整备份）
 * @returns {Array<{fileName: string, filePath: string, size: number, sizeMB: number, created: Date, type: string}>}
 */
function getBackupList() {
  try {
    if (!fs.existsSync(BACKUP_DIR)) {
      return [];
    }

    const files = fs.readdirSync(BACKUP_DIR)
      .filter(file => 
        (file.startsWith('boda-backup-') && file.endsWith('.db')) ||
        (file.startsWith('boda-full-backup-') && file.endsWith('.zip'))
      )
      .map(file => {
        const filePath = path.join(BACKUP_DIR, file);
        const stats = fs.statSync(filePath);
        const type = file.endsWith('.zip') ? 'full' : 'db';
        return {
          fileName: file,
          filePath: filePath,
          size: stats.size,
          sizeMB: parseFloat((stats.size / 1024 / 1024).toFixed(2)),
          created: stats.mtime,
          type: type
        };
      })
      .sort((a, b) => b.created - a.created); // 按时间降序排列

    return files;
  } catch (error) {
    return [];
  }
}

/**
 * 恢复数据库（从数据库备份文件或完整备份ZIP）
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

    // 先备份当前数据库（在关闭连接之前）
    const currentBackup = await backupDatabase();
    if (!currentBackup.success) {
      // 如果备份失败，仍然继续恢复（用户可能已经决定恢复）
      console.warn('Failed to backup current database before restore');
    }

    // 关闭当前数据库连接
    const { closeDatabase, createDatabaseConnection } = require('../db/database');
    await closeDatabase();

    // 等待一小段时间，确保数据库文件完全关闭
    await new Promise(resolve => setTimeout(resolve, 500));

    // 判断是ZIP文件还是数据库文件
    if (backupFileName.endsWith('.zip')) {
      // 完整备份恢复
      return await restoreFullBackup(backupPath, DB_PATH, createDatabaseConnection);
    } else {
      // 数据库备份恢复
      return await restoreDbBackup(backupPath, DB_PATH, createDatabaseConnection);
    }
  } catch (error) {
    return {
      success: false,
      message: `Restore failed: ${error.message}`
    };
  }
}

/**
 * 恢复数据库备份文件
 */
async function restoreDbBackup(backupPath, DB_PATH, createDatabaseConnection) {
  try {
    // 删除旧的 WAL 和 SHM 文件（如果存在）
    const walPath = DB_PATH + '-wal';
    const shmPath = DB_PATH + '-shm';
    if (fs.existsSync(walPath)) {
      fs.unlinkSync(walPath);
    }
    if (fs.existsSync(shmPath)) {
      fs.unlinkSync(shmPath);
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

    // 重新创建数据库连接
    if (typeof createDatabaseConnection === 'function') {
      await createDatabaseConnection();
    }

    return {
      success: true,
      message: 'Database restored successfully. The database connection has been reinitialized.'
    };
  } catch (error) {
    return {
      success: false,
      message: `Restore failed: ${error.message}`
    };
  }
}

/**
 * 恢复完整备份（ZIP文件）
 */
async function restoreFullBackup(backupPath, DB_PATH, createDatabaseConnection) {
  try {
    const zip = new AdmZip(backupPath);
    const zipEntries = zip.getEntries();

    // 创建临时解压目录
    const tempDir = path.join(BACKUP_DIR, 'temp_restore_' + Date.now());
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    try {
      // 解压ZIP文件
      zip.extractAllTo(tempDir, true);

      // 恢复数据库文件
      const dbBackupPath = path.join(tempDir, 'boda.db');
      if (fs.existsSync(dbBackupPath)) {
        // 删除旧的 WAL 和 SHM 文件
        const walPath = DB_PATH + '-wal';
        const shmPath = DB_PATH + '-shm';
        if (fs.existsSync(walPath)) {
          fs.unlinkSync(walPath);
        }
        if (fs.existsSync(shmPath)) {
          fs.unlinkSync(shmPath);
        }

        // 复制数据库文件
        fs.copyFileSync(dbBackupPath, DB_PATH);

        // 恢复WAL和SHM文件（如果存在）
        const walBackupPath = path.join(tempDir, 'boda.db-wal');
        const shmBackupPath = path.join(tempDir, 'boda.db-shm');
        if (fs.existsSync(walBackupPath)) {
          fs.copyFileSync(walBackupPath, DB_PATH + '-wal');
        }
        if (fs.existsSync(shmBackupPath)) {
          fs.copyFileSync(shmBackupPath, DB_PATH + '-shm');
        }
      }

      // 恢复uploads目录
      const uploadsBackupPath = path.join(tempDir, 'uploads');
      const uploadsTargetPath = path.join(DATA_DIR, 'uploads');
      if (fs.existsSync(uploadsBackupPath)) {
        // 如果目标目录存在，先删除
        if (fs.existsSync(uploadsTargetPath)) {
          fs.rmSync(uploadsTargetPath, { recursive: true, force: true });
        }
        // 复制uploads目录
        fs.cpSync(uploadsBackupPath, uploadsTargetPath, { recursive: true });
      }

      // 恢复show目录
      // 优先恢复到 DATA_DIR/show（持久化），如果不存在则回退到项目根目录
      const showBackupPath = path.join(tempDir, 'show');
      const SHOW_TARGET_DIR = path.join(DATA_DIR, 'show');
      const FALLBACK_SHOW_TARGET_DIR = path.join(__dirname, '..', 'show');
      const showTargetPath = fs.existsSync('/data') ? SHOW_TARGET_DIR : FALLBACK_SHOW_TARGET_DIR;
      
      if (fs.existsSync(showBackupPath)) {
        // 如果目标目录存在，先删除
        if (fs.existsSync(showTargetPath)) {
          fs.rmSync(showTargetPath, { recursive: true, force: true });
        }
        // 确保目标目录的父目录存在
        const parentDir = path.dirname(showTargetPath);
        if (!fs.existsSync(parentDir)) {
          fs.mkdirSync(parentDir, { recursive: true });
        }
        // 复制show目录
        fs.cpSync(showBackupPath, showTargetPath, { recursive: true });
      }

      // 重新创建数据库连接
      if (typeof createDatabaseConnection === 'function') {
        await createDatabaseConnection();
      }

      // 清理临时目录
      fs.rmSync(tempDir, { recursive: true, force: true });

      return {
        success: true,
        message: 'Full backup restored successfully. Database, uploads, and show directories have been restored. The database connection has been reinitialized.'
      };
    } catch (error) {
      // 清理临时目录（即使出错）
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
      throw error;
    }
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

    // 如果是数据库备份，删除 WAL 和 SHM 文件（如果存在）
    if (backupFileName.endsWith('.db')) {
      const walPath = backupPath + '-wal';
      const shmPath = backupPath + '-shm';
      if (fs.existsSync(walPath)) {
        fs.unlinkSync(walPath);
      }
      if (fs.existsSync(shmPath)) {
        fs.unlinkSync(shmPath);
      }
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
  backupFull,
  getBackupList,
  restoreDatabase,
  deleteBackup,
  cleanupOldBackups,
  BACKUP_DIR
};
