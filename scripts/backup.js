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

    // 清理旧备份（保留最近30个）
    cleanupOldBackups();

    return backupPath;
  } catch (error) {
    console.error('Backup failed:', error.message);
    process.exit(1);
  }
}

// 清理旧备份
function cleanupOldBackups() {
  try {
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(file => file.startsWith('boda-backup-') && file.endsWith('.db'))
      .map(file => ({
        name: file,
        path: path.join(BACKUP_DIR, file),
        time: fs.statSync(path.join(BACKUP_DIR, file)).mtime.getTime()
      }))
      .sort((a, b) => b.time - a.time); // 按时间降序排列

    // 保留最近30个备份
    if (files.length > 30) {
      const filesToDelete = files.slice(30);
      for (const file of filesToDelete) {
        fs.unlinkSync(file.path);
        // 删除对应的 WAL 和 SHM 文件
        if (fs.existsSync(file.path + '-wal')) {
          fs.unlinkSync(file.path + '-wal');
        }
        if (fs.existsSync(file.path + '-shm')) {
          fs.unlinkSync(file.path + '-shm');
        }
        console.log(`Deleted old backup: ${file.name}`);
      }
    }
  } catch (error) {
    console.error('Cleanup failed:', error.message);
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

module.exports = { backupDatabase, cleanupOldBackups };

