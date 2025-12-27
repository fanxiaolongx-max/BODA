#!/usr/bin/env node

/**
 * 磁盘使用情况分析脚本
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 格式化字节大小
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 解析 du 输出
function parseDuOutput(output) {
  const lines = output.split('\n').filter(line => line.trim());
  const result = [];
  
  for (const line of lines) {
    const match = line.match(/^(\d+(\.\d+)?[KMGT]?)\s+(.+)$/);
    if (match) {
      const size = match[1];
      const path = match[3];
      result.push({ size, path });
    }
  }
  
  return result;
}

// 分析目录
function analyzeDirectory(dirPath, maxDepth = 1) {
  try {
    const output = execSync(`du -sh ${dirPath}/* 2>/dev/null`, { encoding: 'utf-8' });
    return parseDuOutput(output);
  } catch (error) {
    return [];
  }
}

// 统计备份文件
function analyzeBackups(backupDir) {
  if (!fs.existsSync(backupDir)) {
    return { dbBackups: [], zipBackups: [], totalSize: 0 };
  }
  
  const files = fs.readdirSync(backupDir);
  const dbBackups = [];
  const zipBackups = [];
  let totalSize = 0;
  
  for (const file of files) {
    const filePath = path.join(backupDir, file);
    try {
      const stats = fs.statSync(filePath);
      const size = stats.size;
      totalSize += size;
      
      if (file.endsWith('.db')) {
        dbBackups.push({ name: file, size, path: filePath });
      } else if (file.endsWith('.zip')) {
        zipBackups.push({ name: file, size, path: filePath });
      }
    } catch (e) {
      // 忽略错误
    }
  }
  
  dbBackups.sort((a, b) => b.size - a.size);
  zipBackups.sort((a, b) => b.size - a.size);
  
  return { dbBackups, zipBackups, totalSize };
}

async function main() {
  console.log('='.repeat(80));
  console.log('磁盘使用情况分析报告');
  console.log('='.repeat(80));
  console.log();
  
  // 1. 总体磁盘使用情况
  try {
    const dfOutput = execSync('df -h /', { encoding: 'utf-8' });
    console.log('📊 磁盘总体使用情况:');
    console.log(dfOutput);
    console.log();
  } catch (error) {
    console.error('获取磁盘信息失败:', error.message);
  }
  
  // 2. 根目录各目录占用
  console.log('📁 根目录各目录占用情况:');
  console.log('-'.repeat(80));
  try {
    const rootDirs = analyzeDirectory('/', 1);
    for (const item of rootDirs.slice(0, 10)) {
      console.log(`${item.size.padEnd(10)} ${item.path}`);
    }
  } catch (error) {
    console.error('分析根目录失败:', error.message);
  }
  console.log();
  
  // 3. /data 目录详细分析
  console.log('💾 /data 目录详细分析:');
  console.log('-'.repeat(80));
  try {
    const dataDirs = analyzeDirectory('/data', 1);
    for (const item of dataDirs) {
      console.log(`${item.size.padEnd(10)} ${item.path}`);
    }
  } catch (error) {
    console.error('分析 /data 目录失败:', error.message);
  }
  console.log();
  
  // 4. 备份文件分析
  const backupDir = '/data/logs/backup';
  if (fs.existsSync(backupDir)) {
    console.log('📦 备份文件分析:');
    console.log('-'.repeat(80));
    const backups = analyzeBackups(backupDir);
    
    console.log(`数据库备份文件: ${backups.dbBackups.length} 个`);
    if (backups.dbBackups.length > 0) {
      console.log('  最大的5个数据库备份:');
      for (const backup of backups.dbBackups.slice(0, 5)) {
        console.log(`    - ${backup.name}: ${formatBytes(backup.size)}`);
      }
    }
    
    console.log(`完整备份文件: ${backups.zipBackups.length} 个`);
    if (backups.zipBackups.length > 0) {
      console.log('  最大的5个完整备份:');
      for (const backup of backups.zipBackups.slice(0, 5)) {
        console.log(`    - ${backup.name}: ${formatBytes(backup.size)}`);
      }
    }
    
    console.log(`备份文件总大小: ${formatBytes(backups.totalSize)}`);
    console.log();
  }
  
  // 5. /var/log 目录分析
  console.log('📋 /var/log 目录分析:');
  console.log('-'.repeat(80));
  try {
    const logDirs = analyzeDirectory('/var/log', 1);
    for (const item of logDirs.slice(0, 10)) {
      console.log(`${item.size.padEnd(10)} ${item.path}`);
    }
  } catch (error) {
    console.error('分析 /var/log 目录失败:', error.message);
  }
  console.log();
  
  // 6. 查找大文件
  console.log('🔍 查找大文件 (>100MB):');
  console.log('-'.repeat(80));
  try {
    const findOutput = execSync('find /data /var/log /root -type f -size +100M 2>/dev/null | head -10', { encoding: 'utf-8' });
    const largeFiles = findOutput.split('\n').filter(line => line.trim());
    for (const file of largeFiles) {
      try {
        const stats = fs.statSync(file);
        console.log(`${formatBytes(stats.size).padEnd(12)} ${file}`);
      } catch (e) {
        // 忽略错误
      }
    }
  } catch (error) {
    console.error('查找大文件失败:', error.message);
  }
  console.log();
  
  // 7. 优化建议
  console.log('💡 优化建议:');
  console.log('-'.repeat(80));
  
  const backups = analyzeBackups(backupDir);
  if (backups.totalSize > 1024 * 1024 * 1024) { // 大于1GB
    console.log(`⚠️  备份文件占用 ${formatBytes(backups.totalSize)}，建议清理旧备份`);
    console.log('   可以运行: node scripts/backup.js --cleanup');
  }
  
  try {
    const varLogSize = execSync('du -sb /var/log 2>/dev/null', { encoding: 'utf-8' });
    const logSizeBytes = parseInt(varLogSize.split('\t')[0]);
    if (logSizeBytes > 500 * 1024 * 1024) { // 大于500MB
      console.log(`⚠️  /var/log 目录占用 ${formatBytes(logSizeBytes)}，建议清理旧日志`);
      console.log('   可以运行: sudo journalctl --vacuum-time=30d');
    }
  } catch (e) {
    // 忽略错误
  }
  
  console.log();
  console.log('='.repeat(80));
}

if (require.main === module) {
  main().catch(error => {
    console.error('执行失败:', error);
    process.exit(1);
  });
}

module.exports = { main };

