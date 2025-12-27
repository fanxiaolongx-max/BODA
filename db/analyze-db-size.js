#!/usr/bin/env node

/**
 * 数据库大小分析脚本
 * 分析数据库文件大小和各个表的空间占用情况
 */

const { runAsync, allAsync, waitForDbReady } = require('./database');
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

// 获取数据库文件大小
function getDatabaseFileSize() {
  if (!fs.existsSync(DB_PATH)) {
    return { size: 0, formatted: '0 B' };
  }
  
  const stats = fs.statSync(DB_PATH);
  return {
    size: stats.size,
    formatted: formatBytes(stats.size)
  };
}

// 获取 WAL 文件大小
function getWalFileSize() {
  const walPath = DB_PATH + '-wal';
  if (!fs.existsSync(walPath)) {
    return { size: 0, formatted: '0 B' };
  }
  
  const stats = fs.statSync(walPath);
  return {
    size: stats.size,
    formatted: formatBytes(stats.size)
  };
}

// 获取 SHM 文件大小
function getShmFileSize() {
  const shmPath = DB_PATH + '-shm';
  if (!fs.existsSync(shmPath)) {
    return { size: 0, formatted: '0 B' };
  }
  
  const stats = fs.statSync(shmPath);
  return {
    size: stats.size,
    formatted: formatBytes(stats.size)
  };
}

// 获取所有表名
async function getAllTables() {
  const tables = await allAsync(`
    SELECT name 
    FROM sqlite_master 
    WHERE type='table' 
    AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `);
  return tables.map(t => t.name);
}

// 获取表的记录数
async function getTableRowCount(tableName) {
  try {
    const result = await allAsync(`SELECT COUNT(*) as count FROM ${tableName}`);
    return result[0]?.count || 0;
  } catch (error) {
    return 0;
  }
}

// 获取表的大小（估算）
async function getTableSize(tableName) {
  try {
    // 获取表的所有字段
    const columns = await allAsync(`PRAGMA table_info(${tableName})`);
    
    // 计算每个字段的大小
    let totalSize = 0;
    const fieldSizes = {};
    
    for (const col of columns) {
      const fieldName = col.name;
      
      // 计算该字段的总大小
      const sizeResult = await allAsync(`
        SELECT SUM(COALESCE(LENGTH(${fieldName}), 0)) as total_size
        FROM ${tableName}
        WHERE ${fieldName} IS NOT NULL
      `);
      
      const fieldSize = sizeResult[0]?.total_size || 0;
      fieldSizes[fieldName] = {
        size: fieldSize,
        formatted: formatBytes(fieldSize)
      };
      totalSize += fieldSize;
    }
    
    return {
      totalSize,
      formatted: formatBytes(totalSize),
      fieldSizes
    };
  } catch (error) {
    console.error(`获取表 ${tableName} 大小失败:`, error.message);
    return {
      totalSize: 0,
      formatted: '0 B',
      fieldSizes: {}
    };
  }
}

// 分析 custom_api_logs 表的详细情况
async function analyzeCustomApiLogs() {
  try {
    // 检查表是否存在
    const tableExists = await allAsync(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='custom_api_logs'
    `);
    
    if (tableExists.length === 0) {
      return null;
    }
    
    // 总记录数
    const totalCount = await getTableRowCount('custom_api_logs');
    
    // 超过3小时但仍保留消息体的记录数
    const oldWithBody = await allAsync(`
      SELECT COUNT(*) as count
      FROM custom_api_logs
      WHERE created_at < datetime('now', '-3 hours')
        AND (
          (request_body IS NOT NULL AND request_body != '')
          OR (response_body IS NOT NULL AND response_body != '')
        )
    `);
    
    // 消息体占用空间
    const bodySize = await allAsync(`
      SELECT 
        SUM(COALESCE(LENGTH(request_body), 0) + COALESCE(LENGTH(response_body), 0)) as total_size,
        COUNT(*) as count
      FROM custom_api_logs
      WHERE (
        (request_body IS NOT NULL AND request_body != '')
        OR (response_body IS NOT NULL AND response_body != '')
      )
    `);
    
    // 超过3小时的消息体占用空间
    const oldBodySize = await allAsync(`
      SELECT 
        SUM(COALESCE(LENGTH(request_body), 0) + COALESCE(LENGTH(response_body), 0)) as total_size,
        COUNT(*) as count
      FROM custom_api_logs
      WHERE created_at < datetime('now', '-3 hours')
        AND (
          (request_body IS NOT NULL AND request_body != '')
          OR (response_body IS NOT NULL AND response_body != '')
        )
    `);
    
    // 按时间分布统计
    const timeDistribution = await allAsync(`
      SELECT 
        CASE 
          WHEN created_at >= datetime('now', '-1 hour') THEN '1小时内'
          WHEN created_at >= datetime('now', '-3 hours') THEN '1-3小时'
          WHEN created_at >= datetime('now', '-24 hours') THEN '3-24小时'
          WHEN created_at >= datetime('now', '-7 days') THEN '1-7天'
          WHEN created_at >= datetime('now', '-30 days') THEN '7-30天'
          ELSE '30天以上'
        END as time_range,
        COUNT(*) as count,
        SUM(COALESCE(LENGTH(request_body), 0) + COALESCE(LENGTH(response_body), 0)) as total_size
      FROM custom_api_logs
      GROUP BY time_range
      ORDER BY 
        CASE time_range
          WHEN '1小时内' THEN 1
          WHEN '1-3小时' THEN 2
          WHEN '3-24小时' THEN 3
          WHEN '1-7天' THEN 4
          WHEN '7-30天' THEN 5
          ELSE 6
        END
    `);
    
    return {
      totalCount,
      oldWithBodyCount: oldWithBody[0]?.count || 0,
      bodySize: {
        total: bodySize[0]?.total_size || 0,
        formatted: formatBytes(bodySize[0]?.total_size || 0),
        count: bodySize[0]?.count || 0
      },
      oldBodySize: {
        total: oldBodySize[0]?.total_size || 0,
        formatted: formatBytes(oldBodySize[0]?.total_size || 0),
        count: oldBodySize[0]?.count || 0
      },
      timeDistribution: timeDistribution.map(t => ({
        ...t,
        formatted: formatBytes(t.total_size || 0)
      }))
    };
  } catch (error) {
    console.error('分析 custom_api_logs 失败:', error.message);
    return null;
  }
}

// 主函数
async function main() {
  await waitForDbReady();
  
  console.log('='.repeat(80));
  console.log('数据库大小分析报告');
  console.log('='.repeat(80));
  console.log();
  
  // 1. 数据库文件大小
  const dbFileSize = getDatabaseFileSize();
  const walFileSize = getWalFileSize();
  const shmFileSize = getShmFileSize();
  const totalFileSize = dbFileSize.size + walFileSize.size + shmFileSize.size;
  
  console.log('📁 数据库文件大小:');
  console.log(`   主文件 (boda.db):     ${dbFileSize.formatted}`);
  console.log(`   WAL 文件 (boda.db-wal): ${walFileSize.formatted}`);
  console.log(`   SHM 文件 (boda.db-shm): ${shmFileSize.formatted}`);
  console.log(`   总计:                 ${formatBytes(totalFileSize)}`);
  console.log();
  
  // 2. 获取所有表
  const tables = await getAllTables();
  console.log(`📊 数据库表列表 (共 ${tables.length} 个表):`);
  console.log();
  
  // 3. 分析每个表
  const tableStats = [];
  for (const table of tables) {
    const rowCount = await getTableRowCount(table);
    const tableSize = await getTableSize(table);
    
    tableStats.push({
      name: table,
      rowCount,
      size: tableSize.totalSize,
      formatted: tableSize.formatted,
      fieldSizes: tableSize.fieldSizes
    });
  }
  
  // 按大小排序
  tableStats.sort((a, b) => b.size - a.size);
  
  console.log('表大小统计 (按占用空间排序):');
  console.log('-'.repeat(80));
  console.log(`${'表名'.padEnd(30)} ${'记录数'.padEnd(15)} ${'数据大小'.padEnd(15)} ${'占比'}`);
  console.log('-'.repeat(80));
  
  const totalDataSize = tableStats.reduce((sum, t) => sum + t.size, 0);
  
  for (const stat of tableStats) {
    const percentage = totalDataSize > 0 ? ((stat.size / totalDataSize) * 100).toFixed(2) : '0.00';
    console.log(
      `${stat.name.padEnd(30)} ${stat.rowCount.toLocaleString().padEnd(15)} ${stat.formatted.padEnd(15)} ${percentage}%`
    );
  }
  
  console.log('-'.repeat(80));
  console.log(`${'总计'.padEnd(30)} ${''.padEnd(15)} ${formatBytes(totalDataSize).padEnd(15)} 100%`);
  console.log();
  
  // 4. 详细分析占用空间最大的表
  console.log('🔍 占用空间最大的前5个表详细分析:');
  console.log();
  
  for (let i = 0; i < Math.min(5, tableStats.length); i++) {
    const stat = tableStats[i];
    if (stat.size === 0) break;
    
    console.log(`${i + 1}. ${stat.name} (${stat.formatted}, ${stat.rowCount.toLocaleString()} 条记录)`);
    
    // 显示字段大小（只显示占用空间较大的字段）
    const fields = Object.entries(stat.fieldSizes)
      .filter(([_, size]) => size.size > 0)
      .sort(([_, a], [__, b]) => b.size - a.size)
      .slice(0, 5);
    
    if (fields.length > 0) {
      console.log('   主要字段占用空间:');
      for (const [fieldName, fieldSize] of fields) {
        const fieldPercentage = stat.size > 0 ? ((fieldSize.size / stat.size) * 100).toFixed(2) : '0.00';
        console.log(`      - ${fieldName.padEnd(25)}: ${fieldSize.formatted.padEnd(12)} (${fieldPercentage}%)`);
      }
    }
    console.log();
  }
  
  // 5. 特别分析 custom_api_logs 表
  const apiLogsAnalysis = await analyzeCustomApiLogs();
  if (apiLogsAnalysis) {
    console.log('📝 custom_api_logs 表详细分析:');
    console.log('-'.repeat(80));
    console.log(`总记录数: ${apiLogsAnalysis.totalCount.toLocaleString()}`);
    console.log(`当前保留消息体的记录数: ${apiLogsAnalysis.bodySize.count.toLocaleString()}`);
    console.log(`当前消息体占用空间: ${apiLogsAnalysis.bodySize.formatted}`);
    console.log();
    console.log(`超过3小时但仍保留消息体的记录数: ${apiLogsAnalysis.oldWithBodyCount.toLocaleString()}`);
    console.log(`超过3小时的消息体占用空间: ${apiLogsAnalysis.oldBodySize.formatted}`);
    console.log();
    
    if (apiLogsAnalysis.timeDistribution.length > 0) {
      console.log('按时间分布统计:');
      console.log('-'.repeat(80));
      console.log(`${'时间范围'.padEnd(20)} ${'记录数'.padEnd(15)} ${'消息体大小'.padEnd(15)}`);
      console.log('-'.repeat(80));
      for (const dist of apiLogsAnalysis.timeDistribution) {
        console.log(
          `${dist.time_range.padEnd(20)} ${dist.count.toLocaleString().padEnd(15)} ${dist.formatted.padEnd(15)}`
        );
      }
      console.log('-'.repeat(80));
    }
    console.log();
  }
  
  // 6. 优化建议
  console.log('💡 优化建议:');
  console.log('-'.repeat(80));
  
  if (walFileSize.size > dbFileSize.size * 0.1) {
    console.log('⚠️  WAL 文件较大，建议运行 VACUUM 压缩数据库');
  }
  
  if (apiLogsAnalysis && apiLogsAnalysis.oldWithBodyCount > 0) {
    console.log(`⚠️  发现 ${apiLogsAnalysis.oldWithBodyCount.toLocaleString()} 条超过3小时但仍保留消息体的记录`);
    console.log(`   建议运行清理脚本: node db/cleanup-api-logs.js`);
  }
  
  // 找出占用空间最大的字段
  const largeFields = [];
  for (const stat of tableStats) {
    for (const [fieldName, fieldSize] of Object.entries(stat.fieldSizes)) {
      if (fieldSize.size > 10 * 1024 * 1024) { // 大于10MB
        largeFields.push({
          table: stat.name,
          field: fieldName,
          size: fieldSize.size,
          formatted: fieldSize.formatted
        });
      }
    }
  }
  
  if (largeFields.length > 0) {
    largeFields.sort((a, b) => b.size - a.size);
    console.log('\n⚠️  发现占用空间较大的字段 (>10MB):');
    for (const field of largeFields.slice(0, 10)) {
      console.log(`   - ${field.table}.${field.field}: ${field.formatted}`);
    }
  }
  
  console.log();
  console.log('='.repeat(80));
}

// 运行分析
if (require.main === module) {
  main().catch(error => {
    console.error('分析失败:', error);
    process.exit(1);
  });
}

module.exports = { main };

