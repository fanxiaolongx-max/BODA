const { runAsync, allAsync, waitForDbReady } = require('./database');
const { logger } = require('../utils/logger');

/**
 * 清理 custom_api_logs 表中超过指定时间的消息体（request_body 和 response_body）
 * 只清空消息体字段，保留其他字段和记录
 * @param {number} hours - 保留最近多少小时的消息体（默认3小时）
 */
async function cleanupApiLogsResponseBody(hours = 3) {
  await waitForDbReady();
  
  try {
    console.log(`开始清理 custom_api_logs 表中超过 ${hours} 小时的消息体（request_body 和 response_body）...`);
    
    // 先统计要清理的记录数
    const countResult = await allAsync(`
      SELECT COUNT(*) as count
      FROM custom_api_logs
      WHERE created_at < datetime('now', '-${hours} hours')
        AND (
          (request_body IS NOT NULL AND request_body != '')
          OR (response_body IS NOT NULL AND response_body != '')
        )
    `);
    
    const countToClean = countResult[0]?.count || 0;
    
    if (countToClean === 0) {
      console.log('没有需要清理的记录');
      return { cleaned: 0, savedSpace: 0 };
    }
    
    console.log(`找到 ${countToClean.toLocaleString()} 条需要清理的记录`);
    
    // 计算清理前的大小（包括 request_body 和 response_body）
    const sizeBefore = await allAsync(`
      SELECT 
        SUM(COALESCE(LENGTH(request_body), 0) + COALESCE(LENGTH(response_body), 0)) as total_size
      FROM custom_api_logs
      WHERE created_at < datetime('now', '-${hours} hours')
        AND (
          (request_body IS NOT NULL AND request_body != '')
          OR (response_body IS NOT NULL AND response_body != '')
        )
    `);
    
    const sizeBeforeMB = (sizeBefore[0]?.total_size || 0) / 1024 / 1024;
    console.log(`清理前占用空间: ${sizeBeforeMB.toFixed(2)} MB`);
    
    // 执行清理：将超过指定小时的消息体设置为 NULL
    await runAsync(`
      UPDATE custom_api_logs
      SET 
        request_body = NULL,
        response_body = NULL
      WHERE created_at < datetime('now', '-${hours} hours')
        AND (
          (request_body IS NOT NULL AND request_body != '')
          OR (response_body IS NOT NULL AND response_body != '')
        )
    `);
    
    console.log(`✓ 成功清理 ${countToClean.toLocaleString()} 条记录的消息体`);
    console.log(`✓ 释放空间: ${sizeBeforeMB.toFixed(2)} MB`);
    
    // 可选：运行 VACUUM 来回收空间（这会锁定数据库，可能需要一些时间）
    console.log('\n建议运行 VACUUM 命令来回收数据库空间...');
    console.log('注意：VACUUM 会锁定数据库，可能需要一些时间');
    
    logger.info('清理 custom_api_logs 消息体', {
      hours,
      cleaned: countToClean,
      savedSpaceMB: sizeBeforeMB.toFixed(2)
    });
    
    return {
      cleaned: countToClean,
      savedSpace: sizeBeforeMB
    };
    
  } catch (error) {
    console.error('清理失败:', error);
    logger.error('清理 custom_api_logs 消息体失败', { error: error.message });
    throw error;
  }
}

/**
 * 运行 VACUUM 压缩数据库
 * 注意：这会锁定数据库，可能需要一些时间
 */
async function vacuumDatabase() {
  await waitForDbReady();
  
  try {
    console.log('开始运行 VACUUM 压缩数据库...');
    console.log('这可能需要一些时间，请耐心等待...');
    
    const startTime = Date.now();
    await runAsync('VACUUM');
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log(`✓ VACUUM 完成，耗时 ${duration} 秒`);
    
    // 检查压缩后的文件大小
    const fs = require('fs');
    const path = require('path');
    const DB_DIR = fs.existsSync('/data') ? '/data' : path.join(__dirname);
    const DB_PATH = path.join(DB_DIR, 'boda.db');
    
    if (fs.existsSync(DB_PATH)) {
      const stats = fs.statSync(DB_PATH);
      const sizeGB = (stats.size / 1024 / 1024 / 1024).toFixed(2);
      console.log(`✓ 数据库文件大小: ${sizeGB} GB`);
    }
    
    logger.info('数据库 VACUUM 完成', { duration });
    
  } catch (error) {
    console.error('VACUUM 失败:', error);
    logger.error('数据库 VACUUM 失败', { error: error.message });
    throw error;
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  const args = process.argv.slice(2);
  const hours = args[0] ? parseInt(args[0], 10) : 3;
  const runVacuum = args.includes('--vacuum') || args.includes('-v');
  
  (async () => {
    try {
      await cleanupApiLogsResponseBody(hours);
      
      if (runVacuum) {
        console.log('\n');
        await vacuumDatabase();
      } else {
        console.log('\n提示: 运行 "node db/cleanup-api-logs.js --vacuum" 可以同时压缩数据库');
      }
      
      process.exit(0);
    } catch (error) {
      console.error('执行失败:', error);
      process.exit(1);
    }
  })();
}

module.exports = {
  cleanupApiLogsResponseBody,
  vacuumDatabase
};

