#!/usr/bin/env node

/**
 * 安全检查脚本 - 检查最近的攻击迹象
 * 注意：此脚本只读，不会修改任何数据，完全安全
 */

const { allAsync, getAsync, waitForDbReady } = require('./database');

async function checkSecurityThreats() {
  await waitForDbReady();
  
  console.log('='.repeat(80));
  console.log('安全检查报告 - 最近7天的攻击迹象');
  console.log('='.repeat(80));
  console.log();
  
  try {
    // 1. 检查登录失败记录（暴力破解）
    console.log('1. 登录失败记录分析（最近7天）');
    console.log('-'.repeat(80));
    
    const loginFailures = await allAsync(`
      SELECT 
        account_type,
        account_identifier,
        ip_address,
        COUNT(*) as failure_count,
        MAX(created_at) as last_attempt
      FROM login_attempts_audit
      WHERE success = 0
        AND created_at >= datetime('now', '-7 days', 'localtime')
      GROUP BY account_type, account_identifier, ip_address
      ORDER BY failure_count DESC
      LIMIT 20
    `);
    
    if (loginFailures.length === 0) {
      console.log('✅ 没有发现异常的登录失败记录');
    } else {
      console.log(`⚠️  发现 ${loginFailures.length} 个可疑的登录失败模式：`);
      console.log();
      console.log(`${'账户类型'.padEnd(12)} ${'账户标识'.padEnd(20)} ${'IP地址'.padEnd(18)} ${'失败次数'.padEnd(10)} ${'最后尝试时间'}`);
      console.log('-'.repeat(80));
      
      for (const failure of loginFailures) {
        if (failure.failure_count > 5) {
          console.log(`🔴 ${failure.account_type.padEnd(12)} ${(failure.account_identifier || 'N/A').padEnd(20)} ${(failure.ip_address || 'N/A').padEnd(18)} ${failure.failure_count.toString().padEnd(10)} ${failure.last_attempt}`);
        } else {
          console.log(`   ${failure.account_type.padEnd(12)} ${(failure.account_identifier || 'N/A').padEnd(20)} ${(failure.ip_address || 'N/A').padEnd(18)} ${failure.failure_count.toString().padEnd(10)} ${failure.last_attempt}`);
        }
      }
    }
    
    console.log();
    console.log();
    
    // 2. 检查IP级别的攻击
    console.log('2. IP地址攻击分析（最近7天）');
    console.log('-'.repeat(80));
    
    const ipAttacks = await allAsync(`
      SELECT 
        ip_address,
        COUNT(*) as attempt_count,
        SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failure_count,
        MAX(created_at) as last_attempt
      FROM login_attempts_audit
      WHERE created_at >= datetime('now', '-7 days', 'localtime')
        AND ip_address IS NOT NULL
      GROUP BY ip_address
      HAVING failure_count > 10 OR attempt_count > 50
      ORDER BY failure_count DESC, attempt_count DESC
      LIMIT 20
    `);
    
    if (ipAttacks.length === 0) {
      console.log('✅ 没有发现可疑的IP地址');
    } else {
      console.log(`⚠️  发现 ${ipAttacks.length} 个可疑的IP地址：`);
      console.log();
      console.log(`${'IP地址'.padEnd(18)} ${'总尝试次数'.padEnd(12)} ${'失败次数'.padEnd(12)} ${'最后尝试时间'}`);
      console.log('-'.repeat(80));
      
      for (const ip of ipAttacks) {
        console.log(`🔴 ${(ip.ip_address || 'N/A').padEnd(18)} ${ip.attempt_count.toString().padEnd(12)} ${ip.failure_count.toString().padEnd(12)} ${ip.last_attempt}`);
      }
    }
    
    console.log();
    console.log();
    
    // 3. 检查异常操作日志
    console.log('3. 异常操作日志分析（最近7天）');
    console.log('-'.repeat(80));
    
    const suspiciousActions = await allAsync(`
      SELECT 
        action,
        target_type,
        ip_address,
        COUNT(*) as action_count,
        MAX(created_at) as last_action
      FROM logs
      WHERE created_at >= datetime('now', '-7 days', 'localtime')
        AND (
          action LIKE '%DELETE%' OR
          action LIKE '%DROP%' OR
          action LIKE '%UPDATE%' OR
          details LIKE '%SQL%' OR
          details LIKE '%injection%' OR
          details LIKE '%attack%'
        )
      GROUP BY action, target_type, ip_address
      ORDER BY action_count DESC
      LIMIT 20
    `);
    
    if (suspiciousActions.length === 0) {
      console.log('✅ 没有发现异常的操作日志');
    } else {
      console.log(`⚠️  发现 ${suspiciousActions.length} 个可疑的操作：`);
      console.log();
      console.log(`${'操作类型'.padEnd(20)} ${'目标类型'.padEnd(15)} ${'IP地址'.padEnd(18)} ${'操作次数'.padEnd(10)} ${'最后操作时间'}`);
      console.log('-'.repeat(80));
      
      for (const action of suspiciousActions) {
        console.log(`🔴 ${(action.action || 'N/A').padEnd(20)} ${(action.target_type || 'N/A').padEnd(15)} ${(action.ip_address || 'N/A').padEnd(18)} ${action.action_count.toString().padEnd(10)} ${action.last_action}`);
      }
    }
    
    console.log();
    console.log();
    
    // 4. 检查博客评论中的可疑内容（SQL注入、XSS等）
    console.log('4. 博客评论安全检查（最近7天）');
    console.log('-'.repeat(80));
    
    const suspiciousComments = await allAsync(`
      SELECT 
        id,
        post_id,
        content,
        author_phone,
        created_at
      FROM blog_comments
      WHERE created_at >= datetime('now', '-7 days', 'localtime')
        AND (
          content LIKE '%<script%' OR
          content LIKE '%javascript:%' OR
          content LIKE '%UNION%SELECT%' OR
          content LIKE '%OR%1=1%' OR
          content LIKE '%DROP%TABLE%' OR
          content LIKE '%DELETE%FROM%' OR
          content LIKE '%\${%' OR
          content LIKE '%\${jndi:%' OR
          content LIKE '%log4j%'
        )
      ORDER BY created_at DESC
      LIMIT 20
    `);
    
    if (suspiciousComments.length === 0) {
      console.log('✅ 没有发现可疑的评论内容');
    } else {
      console.log(`⚠️  发现 ${suspiciousComments.length} 条可疑评论：`);
      console.log();
      
      for (const comment of suspiciousComments) {
        console.log(`🔴 评论ID: ${comment.id}`);
        console.log(`   文章ID: ${comment.post_id}`);
        console.log(`   作者: ${comment.author_phone || '匿名'}`);
        console.log(`   时间: ${comment.created_at}`);
        console.log(`   内容预览: ${(comment.content || '').substring(0, 100)}...`);
        console.log('-'.repeat(80));
      }
    }
    
    console.log();
    console.log();
    
    // 5. 统计信息
    console.log('5. 安全统计摘要（最近7天）');
    console.log('-'.repeat(80));
    
    const stats = await getAsync(`
      SELECT 
        COUNT(*) as total_login_attempts,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful_logins,
        SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed_logins,
        COUNT(DISTINCT ip_address) as unique_ips
      FROM login_attempts_audit
      WHERE created_at >= datetime('now', '-7 days', 'localtime')
    `);
    
    console.log(`总登录尝试次数: ${stats.total_login_attempts || 0}`);
    console.log(`成功登录次数: ${stats.successful_logins || 0}`);
    console.log(`失败登录次数: ${stats.failed_logins || 0}`);
    console.log(`唯一IP地址数: ${stats.unique_ips || 0}`);
    
    if (stats.failed_logins > 0 && stats.total_login_attempts > 0) {
      const failureRate = ((stats.failed_logins / stats.total_login_attempts) * 100).toFixed(2);
      console.log(`失败率: ${failureRate}%`);
      
      if (failureRate > 50) {
        console.log('⚠️  警告：失败率超过50%，可能存在暴力破解攻击！');
      }
    }
    
    console.log();
    console.log('='.repeat(80));
    console.log('检查完成');
    console.log('='.repeat(80));
    
  } catch (error) {
    console.error('检查失败:', error.message);
    console.error(error.stack);
  }
}

if (require.main === module) {
  checkSecurityThreats().catch(error => {
    console.error('执行失败:', error);
    process.exit(1);
  });
}

module.exports = { checkSecurityThreats };

