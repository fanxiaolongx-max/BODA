#!/usr/bin/env node

/**
 * 分析最近的登录失败记录
 */

const { allAsync, waitForDbReady } = require('./database');

async function analyzeRecentLoginFailures() {
  await waitForDbReady();
  
  console.log('='.repeat(80));
  console.log('最近的登录失败分析');
  console.log('='.repeat(80));
  console.log();
  
  try {
    // 查询最近24小时的登录尝试记录
    const recent = await allAsync(`
      SELECT 
        account_identifier as phone,
        ip_address,
        user_agent,
        failure_reason,
        created_at,
        success
      FROM login_attempts_audit
      WHERE account_type = 'user'
        AND created_at >= datetime('now', '-1 day')
      ORDER BY created_at DESC
      LIMIT 50
    `);
    
    if (recent.length === 0) {
      console.log('最近24小时内没有登录尝试记录');
      console.log();
      
      // 查询最近的所有记录
      const allRecent = await allAsync(`
        SELECT 
          account_identifier as phone,
          ip_address,
          user_agent,
          failure_reason,
          created_at,
          success
        FROM login_attempts_audit
        WHERE account_type = 'user'
        ORDER BY created_at DESC
        LIMIT 10
      `);
      
      if (allRecent.length > 0) {
        console.log('最近10条登录尝试记录（所有时间）：');
        console.log('-'.repeat(80));
        console.log(`${'时间'.padEnd(20)} ${'状态'.padEnd(8)} ${'手机号'.padEnd(15)} ${'IP地址'.padEnd(18)} ${'失败原因'}`);
        console.log('-'.repeat(80));
        
        for (const r of allRecent) {
          const status = r.success ? '✅成功' : '❌失败';
          const reason = r.failure_reason || '-';
          const phone = r.phone || 'N/A';
          const ip = r.ip_address || 'N/A';
          console.log(`${r.created_at.padEnd(20)} ${status.padEnd(8)} ${phone.padEnd(15)} ${ip.padEnd(18)} ${reason}`);
        }
        console.log('-'.repeat(80));
      }
      
      return;
    }
    
    console.log(`最近24小时内的登录尝试记录（共 ${recent.length} 条）：`);
    console.log('-'.repeat(80));
    console.log(`${'时间'.padEnd(20)} ${'状态'.padEnd(8)} ${'手机号'.padEnd(15)} ${'IP地址'.padEnd(18)} ${'失败原因'}`);
    console.log('-'.repeat(80));
    
    const failures = [];
    const successes = [];
    
    for (const r of recent) {
      const status = r.success ? '✅成功' : '❌失败';
      const reason = r.failure_reason || '-';
      const phone = r.phone || 'N/A';
      const ip = r.ip_address || 'N/A';
      console.log(`${r.created_at.padEnd(20)} ${status.padEnd(8)} ${phone.padEnd(15)} ${ip.padEnd(18)} ${reason}`);
      
      if (!r.success) {
        failures.push(r);
      } else {
        successes.push(r);
      }
    }
    
    console.log('-'.repeat(80));
    console.log();
    
    // 显示失败统计
    if (failures.length > 0) {
      console.log('失败记录统计：');
      console.log(`  总失败次数: ${failures.length}`);
      
      const reasonStats = {};
      for (const f of failures) {
        const reason = f.failure_reason || '未知原因';
        reasonStats[reason] = (reasonStats[reason] || 0) + 1;
      }
      
      console.log('  失败原因分布：');
      for (const [reason, count] of Object.entries(reasonStats)) {
        console.log(`    - ${reason}: ${count} 次`);
      }
      
      // 显示最近一次失败的详细信息
      const latestFailure = failures[0];
      console.log();
      console.log('最近一次登录失败的详细信息：');
      console.log('-'.repeat(80));
      console.log(`时间: ${latestFailure.created_at}`);
      console.log(`手机号: ${latestFailure.phone}`);
      console.log(`IP地址: ${latestFailure.ip_address}`);
      console.log(`User-Agent: ${latestFailure.user_agent || 'N/A'}`);
      console.log(`失败原因: ${latestFailure.failure_reason || '未知原因'}`);
      console.log('-'.repeat(80));
    }
    
    // 显示成功统计
    if (successes.length > 0) {
      console.log();
      console.log(`成功登录次数: ${successes.length}`);
    }
    
  } catch (error) {
    console.error('查询失败:', error.message);
  }
  
  console.log();
  console.log('='.repeat(80));
  
  // 说明：400错误可能是参数验证失败（手机号格式、PIN格式等）
  // 这些错误不会记录到 login_attempts_audit 表中
  console.log();
  console.log('注意：');
  console.log('- 如果看到 POST /user/login 返回 400，但这里没有记录，');
  console.log('  可能是参数验证失败（手机号格式、PIN格式等）');
  console.log('- 只有通过参数验证但PIN错误的情况才会记录到数据库');
  console.log('- 手机号格式要求：11位数字，以0开头（如：01017739088）');
}

if (require.main === module) {
  analyzeRecentLoginFailures().catch(error => {
    console.error('执行失败:', error);
    process.exit(1);
  });
}

module.exports = { analyzeRecentLoginFailures };

