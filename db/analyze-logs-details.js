#!/usr/bin/env node

/**
 * 分析 logs 表的 details 字段内容
 */

const { runAsync, allAsync, waitForDbReady } = require('./database');

async function analyzeLogsDetails() {
  await waitForDbReady();
  
  console.log('='.repeat(80));
  console.log('logs 表 details 字段分析');
  console.log('='.repeat(80));
  console.log();
  
  // 检查表是否存在
  const tableExists = await allAsync(`
    SELECT name FROM sqlite_master 
    WHERE type='table' AND name='logs'
  `);
  
  if (tableExists.length === 0) {
    console.log('logs 表不存在');
    return;
  }
  
  // 总记录数
  const totalCount = await allAsync('SELECT COUNT(*) as count FROM logs');
  console.log(`总记录数: ${totalCount[0].count.toLocaleString()}`);
  console.log();
  
  // 分析 details 字段大小分布
  const sizeDistribution = await allAsync(`
    SELECT 
      CASE 
        WHEN LENGTH(details) < 100 THEN '<100B'
        WHEN LENGTH(details) < 1024 THEN '100B-1KB'
        WHEN LENGTH(details) < 10240 THEN '1KB-10KB'
        WHEN LENGTH(details) < 102400 THEN '10KB-100KB'
        WHEN LENGTH(details) < 1048576 THEN '100KB-1MB'
        ELSE '>1MB'
      END as size_range,
      COUNT(*) as count,
      SUM(LENGTH(details)) as total_size,
      AVG(LENGTH(details)) as avg_size,
      MAX(LENGTH(details)) as max_size
    FROM logs
    WHERE details IS NOT NULL AND details != ''
    GROUP BY size_range
    ORDER BY 
      CASE size_range
        WHEN '<100B' THEN 1
        WHEN '100B-1KB' THEN 2
        WHEN '1KB-10KB' THEN 3
        WHEN '10KB-100KB' THEN 4
        WHEN '100KB-1MB' THEN 5
        ELSE 6
      END
  `);
  
  console.log('details 字段大小分布:');
  console.log('-'.repeat(80));
  console.log(`${'大小范围'.padEnd(20)} ${'记录数'.padEnd(15)} ${'总大小'.padEnd(15)} ${'平均大小'.padEnd(15)} ${'最大大小'}`);
  console.log('-'.repeat(80));
  
  for (const dist of sizeDistribution) {
    const formatBytes = (bytes) => {
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
      return (bytes / 1024 / 1024).toFixed(2) + ' MB';
    };
    
    console.log(
      `${dist.size_range.padEnd(20)} ${dist.count.toLocaleString().padEnd(15)} ${formatBytes(dist.total_size).padEnd(15)} ${formatBytes(dist.avg_size).padEnd(15)} ${formatBytes(dist.max_size)}`
    );
  }
  console.log('-'.repeat(80));
  console.log();
  
  // 按 action 类型统计
  const actionStats = await allAsync(`
    SELECT 
      action,
      COUNT(*) as count,
      SUM(LENGTH(details)) as total_size,
      AVG(LENGTH(details)) as avg_size
    FROM logs
    WHERE details IS NOT NULL AND details != ''
    GROUP BY action
    ORDER BY total_size DESC
    LIMIT 10
  `);
  
  console.log('按 action 类型统计 (前10个):');
  console.log('-'.repeat(80));
  console.log(`${'Action'.padEnd(20)} ${'记录数'.padEnd(15)} ${'总大小'.padEnd(15)} ${'平均大小'}`);
  console.log('-'.repeat(80));
  
  for (const stat of actionStats) {
    const formatBytes = (bytes) => {
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
      return (bytes / 1024 / 1024).toFixed(2) + ' MB';
    };
    
    console.log(
      `${stat.action.padEnd(20)} ${stat.count.toLocaleString().padEnd(15)} ${formatBytes(stat.total_size).padEnd(15)} ${formatBytes(stat.avg_size)}`
    );
  }
  console.log('-'.repeat(80));
  console.log();
  
  // 找出最大的几条记录
  const largestRecords = await allAsync(`
    SELECT 
      id,
      action,
      target_type,
      LENGTH(details) as details_size,
      SUBSTR(details, 1, 100) as details_preview,
      created_at
    FROM logs
    WHERE details IS NOT NULL AND details != ''
    ORDER BY LENGTH(details) DESC
    LIMIT 5
  `);
  
  console.log('最大的5条记录:');
  console.log('-'.repeat(80));
  
  for (const record of largestRecords) {
    const formatBytes = (bytes) => {
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
      return (bytes / 1024 / 1024).toFixed(2) + ' MB';
    };
    
    console.log(`ID: ${record.id}`);
    console.log(`  Action: ${record.action}`);
    console.log(`  Target Type: ${record.target_type || 'N/A'}`);
    console.log(`  Size: ${formatBytes(record.details_size)}`);
    console.log(`  Created: ${record.created_at}`);
    console.log(`  Preview: ${record.details_preview}...`);
    console.log();
  }
  
  // 检查是否有重复的大内容
  const duplicateCheck = await allAsync(`
    SELECT 
      details,
      COUNT(*) as count,
      LENGTH(details) as size
    FROM logs
    WHERE details IS NOT NULL AND details != ''
      AND LENGTH(details) > 10240
    GROUP BY details
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC, LENGTH(details) DESC
    LIMIT 5
  `);
  
  if (duplicateCheck.length > 0) {
    console.log('发现重复的大内容 (>10KB):');
    console.log('-'.repeat(80));
    for (const dup of duplicateCheck) {
      const formatBytes = (bytes) => {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
        return (bytes / 1024 / 1024).toFixed(2) + ' MB';
      };
      
      console.log(`  重复次数: ${dup.count}, 大小: ${formatBytes(dup.size)}`);
      console.log(`  内容预览: ${dup.details.substring(0, 100)}...`);
      console.log();
    }
  }
  
  console.log('='.repeat(80));
}

if (require.main === module) {
  analyzeLogsDetails().catch(error => {
    console.error('分析失败:', error);
    process.exit(1);
  });
}

module.exports = { analyzeLogsDetails };

