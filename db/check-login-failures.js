#!/usr/bin/env node

/**
 * 查看最近的登录失败记录
 */

const { allAsync, waitForDbReady } = require('./database');

async function checkLoginFailures() {
  await waitForDbReady();
  
  console.log('='.repeat(80));
  console.log('最近的登录失败记录（用户登录）');
  console.log('='.repeat(80));
  console.log();
  
  try {
    // 查询最近的用户登录失败记录
    const failures = await allAsync(`
      SELECT 
        account_identifier as phone,
        ip_address,
        user_agent,
        failure_reason,
        created_at,
        success
      FROM login_attempts_audit
      WHERE account_type = 'user'
        AND success = 0
      ORDER BY created_at DESC
      LIMIT 20
    `);
    
    if (failures.length === 0) {
      console.log('没有找到登录失败记录');
      return;
    }
    
    console.log(`找到 ${failures.length} 条失败记录：`);
    console.log('-'.repeat(80));
    console.log(`${'时间'.padEnd(20)} ${'手机号'.padEnd(20)} ${'IP地址'.padEnd(18)} ${'失败原因'.padEnd(30)}`);
    console.log('-'.repeat(80));
    
    for (const failure of failures) {
      const time = failure.created_at || 'N/A';
      const phone = failure.phone || 'N/A';
      const ip = failure.ip_address || 'N/A';
      const reason = failure.failure_reason || '未知原因';
      
      console.log(`${time.padEnd(20)} ${phone.padEnd(20)} ${ip.padEnd(18)} ${reason}`);
    }
    
    console.log('-'.repeat(80));
    console.log();
    
    // 显示最近一条的详细信息
    if (failures.length > 0) {
      const latest = failures[0];
      console.log('最近一次登录失败的详细信息：');
      console.log('-'.repeat(80));
      console.log(`时间: ${latest.created_at}`);
      console.log(`手机号: ${latest.phone}`);
      console.log(`IP地址: ${latest.ip_address}`);
      console.log(`User-Agent: ${latest.user_agent || 'N/A'}`);
      console.log(`失败原因: ${latest.failure_reason || '未知原因'}`);
      console.log('-'.repeat(80));
      console.log();
    }
    
    // 统计失败原因
    const reasonStats = {};
    for (const failure of failures) {
      const reason = failure.failure_reason || '未知原因';
      reasonStats[reason] = (reasonStats[reason] || 0) + 1;
    }
    
    console.log('失败原因统计：');
    console.log('-'.repeat(80));
    for (const [reason, count] of Object.entries(reasonStats)) {
      console.log(`  ${reason}: ${count} 次`);
    }
    console.log('-'.repeat(80));
    
  } catch (error) {
    console.error('查询失败:', error.message);
  }
  
  console.log();
  console.log('='.repeat(80));
}

if (require.main === module) {
  checkLoginFailures().catch(error => {
    console.error('执行失败:', error);
    process.exit(1);
  });
}

module.exports = { checkLoginFailures };

