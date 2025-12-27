#!/usr/bin/env node

/**
 * 执行数据库 VACUUM 压缩
 */

const { runAsync, waitForDbReady } = require('./database');
const fs = require('fs');
const path = require('path');

// 支持 fly.io 持久化卷
const DB_DIR = fs.existsSync('/data') ? '/data' : path.join(__dirname);
const DB_PATH = path.join(DB_DIR, 'boda.db');

// 格式化字节大小
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 获取文件大小
function getFileSize(filePath) {
  if (!fs.existsSync(filePath)) {
    return 0;
  }
  return fs.statSync(filePath).size;
}

async function vacuumDatabase() {
  await waitForDbReady();
  
  console.log('='.repeat(80));
  console.log('数据库 VACUUM 压缩');
  console.log('='.repeat(80));
  console.log();
  
  // 获取压缩前的大小
  const sizeBefore = getFileSize(DB_PATH);
  const walSizeBefore = getFileSize(DB_PATH + '-wal');
  const shmSizeBefore = getFileSize(DB_PATH + '-shm');
  const totalBefore = sizeBefore + walSizeBefore + shmSizeBefore;
  
  console.log('压缩前文件大小:');
  console.log(`   主文件: ${formatBytes(sizeBefore)}`);
  console.log(`   WAL 文件: ${formatBytes(walSizeBefore)}`);
  console.log(`   SHM 文件: ${formatBytes(shmSizeBefore)}`);
  console.log(`   总计: ${formatBytes(totalBefore)}`);
  console.log();
  
  console.log('开始执行 VACUUM...');
  console.log('这可能需要一些时间，请耐心等待...');
  console.log();
  
  const startTime = Date.now();
  
  try {
    // 执行 VACUUM
    await runAsync('VACUUM');
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    // 获取压缩后的大小
    const sizeAfter = getFileSize(DB_PATH);
    const walSizeAfter = getFileSize(DB_PATH + '-wal');
    const shmSizeAfter = getFileSize(DB_PATH + '-shm');
    const totalAfter = sizeAfter + walSizeAfter + shmSizeAfter;
    
    const saved = totalBefore - totalAfter;
    const savedPercentage = ((saved / totalBefore) * 100).toFixed(2);
    
    console.log('✓ VACUUM 完成！');
    console.log(`   耗时: ${duration} 秒`);
    console.log();
    console.log('压缩后文件大小:');
    console.log(`   主文件: ${formatBytes(sizeAfter)}`);
    console.log(`   WAL 文件: ${formatBytes(walSizeAfter)}`);
    console.log(`   SHM 文件: ${formatBytes(shmSizeAfter)}`);
    console.log(`   总计: ${formatBytes(totalAfter)}`);
    console.log();
    console.log('空间节省:');
    console.log(`   节省空间: ${formatBytes(saved)}`);
    console.log(`   压缩率: ${savedPercentage}%`);
    console.log();
    console.log('='.repeat(80));
    
  } catch (error) {
    console.error('VACUUM 失败:', error);
    throw error;
  }
}

// 运行
if (require.main === module) {
  vacuumDatabase().catch(error => {
    console.error('执行失败:', error);
    process.exit(1);
  });
}

module.exports = { vacuumDatabase };

