#!/usr/bin/env node

/**
 * 执行 WAL checkpoint 压缩 WAL 文件
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

async function checkpointWal() {
  await waitForDbReady();
  
  console.log('='.repeat(80));
  console.log('WAL Checkpoint 压缩');
  console.log('='.repeat(80));
  console.log();
  
  // 获取压缩前的大小
  const dbSizeBefore = getFileSize(DB_PATH);
  const walSizeBefore = getFileSize(DB_PATH + '-wal');
  const shmSizeBefore = getFileSize(DB_PATH + '-shm');
  const totalBefore = dbSizeBefore + walSizeBefore + shmSizeBefore;
  
  console.log('压缩前文件大小:');
  console.log(`   主文件: ${formatBytes(dbSizeBefore)}`);
  console.log(`   WAL 文件: ${formatBytes(walSizeBefore)}`);
  console.log(`   SHM 文件: ${formatBytes(shmSizeBefore)}`);
  console.log(`   总计: ${formatBytes(totalBefore)}`);
  console.log();
  
  // 检查 WAL 模式
  const { allAsync } = require('./database');
  const walModeResult = await allAsync('PRAGMA journal_mode');
  const walMode = walModeResult && walModeResult[0] ? walModeResult[0].journal_mode : 'unknown';
  console.log(`当前日志模式: ${walMode}`);
  console.log();
  
  if (walMode !== 'wal') {
    console.log('⚠️  数据库未使用 WAL 模式，无需执行 checkpoint');
    return;
  }
  
  console.log('开始执行 checkpoint...');
  const startTime = Date.now();
  
  try {
    // 执行 checkpoint
    // PRAGMA wal_checkpoint(TRUNCATE) 会将 WAL 文件内容合并到主文件并截断 WAL 文件
    await runAsync('PRAGMA wal_checkpoint(TRUNCATE)');
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    // 获取压缩后的大小
    const dbSizeAfter = getFileSize(DB_PATH);
    const walSizeAfter = getFileSize(DB_PATH + '-wal');
    const shmSizeAfter = getFileSize(DB_PATH + '-shm');
    const totalAfter = dbSizeAfter + walSizeAfter + shmSizeAfter;
    
    const saved = totalBefore - totalAfter;
    const savedPercentage = walSizeBefore > 0 ? ((saved / totalBefore) * 100).toFixed(2) : '0.00';
    
    console.log('✓ Checkpoint 完成！');
    console.log(`   耗时: ${duration} 秒`);
    console.log();
    console.log('压缩后文件大小:');
    console.log(`   主文件: ${formatBytes(dbSizeAfter)}`);
    console.log(`   WAL 文件: ${formatBytes(walSizeAfter)}`);
    console.log(`   SHM 文件: ${formatBytes(shmSizeAfter)}`);
    console.log(`   总计: ${formatBytes(totalAfter)}`);
    console.log();
    
    if (saved > 0) {
      console.log('空间节省:');
      console.log(`   节省空间: ${formatBytes(saved)}`);
      console.log(`   压缩率: ${savedPercentage}%`);
    } else {
      console.log('WAL 文件已经是最小状态');
    }
    
    // 计算实际数据占比
    const { allAsync } = require('./database');
    const tableStats = await allAsync(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
    `);
    
    let totalDataSize = 0;
    for (const table of tableStats) {
      try {
        const columns = await allAsync(`PRAGMA table_info(${table.name})`);
        for (const col of columns) {
          try {
            const sizeResult = await allAsync(`
              SELECT SUM(COALESCE(LENGTH(${col.name}), 0)) as total_size
              FROM ${table.name}
              WHERE ${col.name} IS NOT NULL
            `);
            totalDataSize += sizeResult[0]?.total_size || 0;
          } catch (e) {
            // 忽略错误
          }
        }
      } catch (e) {
        // 忽略错误
      }
    }
    
    const dataPercentage = totalAfter > 0 ? ((totalDataSize / totalAfter) * 100).toFixed(2) : '0.00';
    const fileOverhead = totalAfter - totalDataSize;
    const overheadPercentage = totalAfter > 0 ? ((fileOverhead / totalAfter) * 100).toFixed(2) : '0.00';
    
    console.log();
    console.log('数据占比分析:');
    console.log(`   实际数据: ${formatBytes(totalDataSize)} (${dataPercentage}%)`);
    console.log(`   文件开销: ${formatBytes(fileOverhead)} (${overheadPercentage}%)`);
    console.log(`   文件总计: ${formatBytes(totalAfter)} (100%)`);
    console.log();
    console.log('='.repeat(80));
    
  } catch (error) {
    console.error('Checkpoint 失败:', error);
    throw error;
  }
}

// 运行
if (require.main === module) {
  checkpointWal().catch(error => {
    console.error('执行失败:', error);
    process.exit(1);
  });
}

module.exports = { checkpointWal };

