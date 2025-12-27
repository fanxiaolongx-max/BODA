#!/usr/bin/env node

/**
 * 数据库备份脚本
 * 将数据库文件备份到 logs/backup 目录
 */

const fs = require('fs');
const path = require('path');

// 支持 fly.io 持久化卷：如果 /data 目录存在，使用 /data，否则使用本地目录
const DATA_DIR = fs.existsSync('/data') ? '/data' : path.join(__dirname, '..');
const DB_DIR = fs.existsSync('/data') ? '/data' : path.join(__dirname, '../db');
const DB_PATH = path.join(DB_DIR, 'boda.db');
const BACKUP_DIR = path.join(DATA_DIR, 'logs', 'backup');

// 确保备份目录存在
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

// 生成备份文件名（包含时间戳）
function generateBackupFileName() {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, -5);
  return `boda-backup-${timestamp}.db`;
}

// 执行备份
async function backupDatabase() {
  try {
    // 检查数据库文件是否存在
    if (!fs.existsSync(DB_PATH)) {
      console.error('Database file not found:', DB_PATH);
      process.exit(1);
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

    console.log(`Backup completed: ${backupFileName} (${sizeMB}MB)`);
    console.log(`Backup location: ${backupPath}`);

    // 清理超过7天的旧备份
    cleanupOldBackups(7);

    return backupPath;
  } catch (error) {
    console.error('Backup failed:', error.message);
    process.exit(1);
  }
}

// 清理旧备份（按时间，超过指定天数）
function cleanupOldBackups(days = 7) {
  try {
    const cutoffTime = Date.now() - (days * 24 * 60 * 60 * 1000);
    let deletedCount = 0;
    let freedSpace = 0;

    // 清理数据库备份文件
    const dbFiles = fs.readdirSync(BACKUP_DIR)
      .filter(file => file.startsWith('boda-backup-') && (file.endsWith('.db') || file.endsWith('.db-wal') || file.endsWith('.db-shm')))
      .map(file => {
        const filePath = path.join(BACKUP_DIR, file);
        const stats = fs.statSync(filePath);
        return {
          name: file,
          path: filePath,
          time: stats.mtime.getTime(),
          size: stats.size
        };
      });

    // 按文件名分组（同一个备份的文件）
    const backupGroups = {};
    for (const file of dbFiles) {
      const baseName = file.name.replace(/-wal$|-shm$/, '');
      if (!backupGroups[baseName]) {
        backupGroups[baseName] = [];
      }
      backupGroups[baseName].push(file);
    }

    // 删除超过指定天数的备份
    for (const [baseName, files] of Object.entries(backupGroups)) {
      // 检查主文件的时间
      const mainFile = files.find(f => f.name.endsWith('.db'));
      if (mainFile && mainFile.time < cutoffTime) {
        // 删除该备份的所有相关文件
        for (const file of files) {
          try {
            freedSpace += file.size;
            fs.unlinkSync(file.path);
            deletedCount++;
            console.log(`Deleted old backup: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB)`);
          } catch (error) {
            console.error(`Failed to delete ${file.name}: ${error.message}`);
          }
        }
      }
    }

    // 清理完整备份（ZIP文件）
    const zipFiles = fs.readdirSync(BACKUP_DIR)
      .filter(file => file.startsWith('boda-full-backup-') && file.endsWith('.zip'))
      .map(file => {
        const filePath = path.join(BACKUP_DIR, file);
        const stats = fs.statSync(filePath);
        return {
          name: file,
          path: filePath,
          time: stats.mtime.getTime(),
          size: stats.size
        };
      });

    for (const file of zipFiles) {
      if (file.time < cutoffTime) {
        try {
          freedSpace += file.size;
          fs.unlinkSync(file.path);
          deletedCount++;
          console.log(`Deleted old full backup: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB)`);
        } catch (error) {
          console.error(`Failed to delete ${file.name}: ${error.message}`);
        }
      }
    }

    if (deletedCount > 0) {
      console.log(`Cleanup completed: deleted ${deletedCount} backup files, freed ${(freedSpace / 1024 / 1024).toFixed(2)}MB`);
    } else {
      console.log('No old backups to clean up');
    }

    return { deletedCount, freedSpace };
  } catch (error) {
    console.error('Cleanup failed:', error.message);
    return { deletedCount: 0, freedSpace: 0 };
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  backupDatabase()
    .then(() => {
      console.log('Backup script completed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('Backup script failed:', error);
      process.exit(1);
    });
}

// 如果使用 --cleanup 参数，只执行清理
if (require.main === module && process.argv.includes('--cleanup')) {
  const days = process.argv.includes('--days') 
    ? parseInt(process.argv[process.argv.indexOf('--days') + 1], 10) 
    : 7;
  cleanupOldBackups(days);
  process.exit(0);
}

module.exports = { backupDatabase, cleanupOldBackups };

