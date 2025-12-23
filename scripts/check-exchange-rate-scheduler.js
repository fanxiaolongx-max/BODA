#!/usr/bin/env node
/**
 * 检查汇率定时任务状态脚本
 * 使用方法: node scripts/check-exchange-rate-scheduler.js
 */

const { getAsync, allAsync } = require('../db/database');
const { initData } = require('../db/init');

async function checkSchedulerStatus() {
  try {
    console.log('=== 汇率定时任务状态检查 ===\n');
    
    // 初始化数据库
    await initData();
    
    // 1. 检查调度器是否启动（通过日志）
    console.log('1. 检查调度器启动状态');
    console.log('   - 调度器在 server.js 启动时自动启动');
    console.log('   - 查看启动日志: pm2 logs boda | grep "汇率更新调度器"');
    console.log('   - 应该看到: "汇率更新调度器已启动（每小时检查一次）"\n');
    
    // 2. 检查设置
    console.log('2. 检查自动更新设置');
    const settings = await allAsync('SELECT key, value FROM settings WHERE key LIKE "%exchange%"');
    const settingsObj = {};
    settings.forEach(s => {
      settingsObj[s.key] = s.value;
    });
    
    const autoUpdateEnabled = settingsObj.exchange_rate_auto_update_enabled === 'true';
    const frequency = settingsObj.exchange_rate_update_frequency || 'daily';
    const hasFreecurrencyAPI = !!settingsObj.freecurrencyapi_api_key;
    const hasExchangeRateAPI = !!settingsObj.exchangerate_api_key;
    const baseCurrencies = settingsObj.exchange_rate_base_currencies || 'CNY,USD,EUR,GBP,JPY,SAR,AED,RUB,INR,KRW,THB';
    const targetCurrency = settingsObj.exchange_rate_target_currency || 'EGP';
    
    console.log(`   自动更新启用: ${autoUpdateEnabled ? '✓ 是' : '✗ 否'}`);
    console.log(`   更新频率: ${frequency === 'hourly' ? '每小时' : '每天'}`);
    console.log(`   FreeCurrencyAPI密钥: ${hasFreecurrencyAPI ? '✓ 已配置' : '✗ 未配置'}`);
    console.log(`   ExchangeRate-API密钥: ${hasExchangeRateAPI ? '✓ 已配置' : '✗ 未配置'}`);
    console.log(`   基础货币: ${baseCurrencies}`);
    console.log(`   目标货币: ${targetCurrency}\n`);
    
    if (!autoUpdateEnabled) {
      console.log('   ⚠️  警告: 自动更新未启用，定时任务不会执行更新');
      console.log('   请在管理面板的"汇率自动更新设置"中启用自动更新\n');
    }
    
    if (!hasFreecurrencyAPI && !hasExchangeRateAPI) {
      console.log('   ⚠️  警告: 未配置任何API密钥，定时任务无法获取汇率\n');
    }
    
    // 3. 检查最后更新时间
    console.log('3. 检查最后更新时间');
    const lastUpdate = settingsObj.exchange_rate_last_update;
    if (lastUpdate) {
      const lastUpdateDate = new Date(lastUpdate);
      const now = new Date();
      const hoursSinceUpdate = (now - lastUpdateDate) / (1000 * 60 * 60);
      const minutesSinceUpdate = (now - lastUpdateDate) / (1000 * 60);
      
      console.log(`   最后更新时间: ${lastUpdateDate.toLocaleString('zh-CN')}`);
      
      if (hoursSinceUpdate < 1) {
        console.log(`   距离现在: ${Math.round(minutesSinceUpdate)} 分钟前`);
      } else {
        console.log(`   距离现在: ${hoursSinceUpdate.toFixed(1)} 小时前`);
      }
      
      // 判断是否应该更新
      const shouldUpdate = frequency === 'hourly' 
        ? hoursSinceUpdate >= 1 
        : hoursSinceUpdate >= 24;
      
      if (shouldUpdate) {
        console.log(`   ⚠️  应该更新了（${frequency === 'hourly' ? '每小时' : '每天'}更新一次）`);
        console.log('   如果长时间未更新，请检查日志查看错误信息\n');
      } else {
        console.log(`   ✓ 更新时间正常（${frequency === 'hourly' ? '每小时' : '每天'}更新一次）\n`);
      }
    } else {
      console.log('   ✗ 从未更新过');
      console.log('   定时任务会在下次检查时自动更新\n');
    }
    
    // 4. 检查汇率API数据
    console.log('4. 检查汇率API数据');
    const exchangeRateAPI = await getAsync(
      `SELECT id, path, response_content, updated_at 
       FROM custom_apis 
       WHERE path = '/exchange-rate' AND status = 'active' 
       ORDER BY updated_at DESC LIMIT 1`
    );
    
    if (exchangeRateAPI) {
      try {
        const content = JSON.parse(exchangeRateAPI.response_content || '{}');
        const currencies = Object.keys(content).filter(k => 
          k.length === 3 && k !== 'id' && k !== 'name' && k !== 'title' && 
          k !== 'detailApi' && k !== 'views' && k !== 'updatedAt' && k !== 'updateTime'
        );
        
        console.log(`   API ID: ${exchangeRateAPI.id}`);
        console.log(`   路径: ${exchangeRateAPI.path}`);
        console.log(`   包含货币数量: ${currencies.length}`);
        console.log(`   最后更新: ${exchangeRateAPI.updated_at ? new Date(exchangeRateAPI.updated_at).toLocaleString('zh-CN') : '未知'}`);
        
        if (currencies.length > 0) {
          console.log(`   货币列表: ${currencies.slice(0, 5).join(', ')}${currencies.length > 5 ? '...' : ''}`);
        }
        console.log('');
      } catch (e) {
        console.log('   ⚠️  无法解析API数据:', e.message);
        console.log('');
      }
    } else {
      console.log('   ✗ 未找到汇率API配置\n');
    }
    
    // 5. 提供检查命令
    console.log('5. 手动检查方法');
    console.log('');
    console.log('   a) 查看实时日志:');
    console.log('      pm2 logs boda --lines 100 | grep -i "汇率"');
    console.log('');
    console.log('   b) 查看调度器启动日志:');
    console.log('      pm2 logs boda | grep "汇率更新调度器已启动"');
    console.log('');
    console.log('   c) 查看自动更新日志:');
    console.log('      pm2 logs boda | grep "开始自动更新汇率"');
    console.log('');
    console.log('   d) 查看更新成功日志:');
    console.log('      pm2 logs boda | grep "汇率自动更新成功"');
    console.log('');
    console.log('   e) 查看更新失败日志:');
    console.log('      pm2 logs boda | grep "汇率自动更新失败"');
    console.log('');
    console.log('   f) 查看日志文件:');
    console.log('      tail -f logs/combined-*.log | grep -i "汇率"');
    console.log('');
    
    // 6. 总结
    console.log('6. 状态总结');
    console.log('');
    if (autoUpdateEnabled && (hasFreecurrencyAPI || hasExchangeRateAPI)) {
      console.log('   ✓ 配置正常，定时任务应该正在运行');
      console.log('   ✓ 调度器每小时检查一次是否需要更新');
      if (frequency === 'hourly') {
        console.log('   ✓ 更新频率: 每小时（距离上次更新超过1小时时更新）');
      } else {
        console.log('   ✓ 更新频率: 每天（距离上次更新超过24小时时更新）');
      }
      console.log('');
      console.log('   如果长时间未更新，请:');
      console.log('   1. 检查日志查看错误信息');
      console.log('   2. 确认API密钥是否有效');
      console.log('   3. 手动触发一次更新测试');
    } else {
      console.log('   ⚠️  配置不完整:');
      if (!autoUpdateEnabled) {
        console.log('      - 自动更新未启用');
      }
      if (!hasFreecurrencyAPI && !hasExchangeRateAPI) {
        console.log('      - 未配置API密钥');
      }
      console.log('');
      console.log('   请在管理面板的"汇率自动更新设置"中完成配置');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('检查失败:', error);
    process.exit(1);
  }
}

checkSchedulerStatus();
