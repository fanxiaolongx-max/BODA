const { getAsync, runAsync, waitForDbReady } = require('./database');

/**
 * 自动迁移系统设置（检查并创建缺失的设置项）
 * 这个函数会在启动时自动执行，确保所有必要的设置项都存在
 */
async function migrateSettings() {
  await waitForDbReady();
  
  try {
    // 所有必要的设置项及其默认值
    const requiredSettings = [
      { key: 'ordering_open', value: 'false', description: '点单开关' },
      { key: 'ordering_end_time', value: '', description: '点单结束时间' },
      { key: 'system_name', value: 'Neferdidi BOBA TEA', description: '系统名称' },
      { key: 'store_name', value: 'BOBA TEA', description: '商店名称' },
      { key: 'system_notice', value: '', description: '系统公告' },
      { key: 'contact_phone', value: '', description: '联系电话' },
      { key: 'currency', value: 'EGP', description: '货币单位' },
      { key: 'currency_symbol', value: 'LE', description: '货币符号' },
      { key: 'max_visible_cycles', value: '10', description: '最大可见周期数' },
      { key: 'admin_session_timeout', value: '7200', description: '管理员session过期时间（秒），默认7200秒（2小时）' },
      { key: 'user_session_timeout', value: '7200', description: '用户session过期时间（秒），默认7200秒（2小时）' },
      { key: 'sms_enabled', value: 'false', description: '是否启用短信验证码' },
      { key: 'sms_provider', value: 'twilio', description: '短信服务商' },
      { key: 'twilio_account_sid', value: '', description: 'Twilio Account SID' },
      { key: 'twilio_auth_token', value: '', description: 'Twilio Auth Token' },
      { key: 'twilio_phone_number', value: '', description: 'Twilio发送号码' },
      { key: 'twilio_verify_service_sid', value: '', description: 'Twilio Verify Service SID (推荐使用)' },
      { key: 'debug_logging_enabled', value: 'false', description: '是否启用详细DEBUG日志（记录所有请求，包括静态资源）' },
      { key: 'stripe_publishable_key', value: '', description: 'Stripe Publishable Key (starts with pk_)' },
      { key: 'stripe_secret_key', value: '', description: 'Stripe Secret Key (starts with sk_)' },
      { key: 'stripe_webhook_secret', value: '', description: 'Stripe Webhook Secret (starts with whsec_, optional)' }
    ];

    let addedCount = 0;
    
    for (const setting of requiredSettings) {
      // 检查设置项是否已存在
      const existing = await getAsync(
        "SELECT * FROM settings WHERE key = ?",
        [setting.key]
      );
      
      if (!existing) {
        // 如果不存在，创建它
        await runAsync(
          `INSERT INTO settings (key, value, description) 
           VALUES (?, ?, ?)`,
          [setting.key, setting.value, setting.description]
        );
        addedCount++;
        console.log(`✅ 自动添加设置项: ${setting.key} = ${setting.value}`);
      }
    }
    
    if (addedCount > 0) {
      console.log(`✅ 系统设置迁移完成，共添加 ${addedCount} 个设置项`);
    } else {
      console.log('ℹ️  所有系统设置项已存在，无需迁移');
    }
  } catch (error) {
    console.error('❌ 系统设置迁移失败:', error);
    // 不抛出错误，避免影响启动
    console.error('错误详情:', error.message);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  migrateSettings()
    .then(() => {
      console.log('迁移完成');
      process.exit(0);
    })
    .catch(error => {
      console.error('迁移失败:', error);
      process.exit(1);
    });
}

module.exports = { migrateSettings };

