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
      { key: 'stripe_webhook_secret', value: '', description: 'Stripe Webhook Secret (starts with whsec_, optional)' },
      { key: 'instant_payment_enabled', value: 'false', description: '允许用户即时支付（开启后用户无需等待周期结束即可支付或删除订单，折扣功能不生效）' },
      // 管理员安全策略
      { key: 'admin_lockout_time_window_minutes', value: '30', description: '管理员账户锁定时间窗口（分钟），失败计数在此时间窗口内累积，超过窗口后自动重置' },
      { key: 'admin_max_lockout_hours', value: '4', description: '管理员最大账户锁定时间（小时），渐进式锁定的最大锁定时长' },
      { key: 'admin_lockout_threshold_1', value: '10', description: '管理员锁定阈值1：失败次数达到此值时锁定15分钟' },
      { key: 'admin_lockout_threshold_2', value: '20', description: '管理员锁定阈值2：失败次数达到此值时锁定30分钟' },
      { key: 'admin_lockout_threshold_3', value: '30', description: '管理员锁定阈值3：失败次数达到此值时锁定1小时' },
      { key: 'admin_lockout_threshold_4', value: '40', description: '管理员锁定阈值4：失败次数达到此值时锁定最大时长' },
      { key: 'admin_progressive_delay_enabled', value: 'true', description: '管理员是否启用渐进延迟（3次5秒，5次15秒，7次30秒）' },
      // 用户安全策略
      { key: 'user_lockout_time_window_minutes', value: '30', description: '用户账户锁定时间窗口（分钟），失败计数在此时间窗口内累积，超过窗口后自动重置' },
      { key: 'user_max_lockout_hours', value: '4', description: '用户最大账户锁定时间（小时），渐进式锁定的最大锁定时长' },
      { key: 'user_lockout_threshold_1', value: '10', description: '用户锁定阈值1：失败次数达到此值时锁定15分钟' },
      { key: 'user_lockout_threshold_2', value: '20', description: '用户锁定阈值2：失败次数达到此值时锁定30分钟' },
      { key: 'user_lockout_threshold_3', value: '30', description: '用户锁定阈值3：失败次数达到此值时锁定1小时' },
      { key: 'user_lockout_threshold_4', value: '40', description: '用户锁定阈值4：失败次数达到此值时锁定最大时长' },
      { key: 'user_progressive_delay_enabled', value: 'true', description: '用户是否启用渐进延迟（3次5秒，5次15秒，7次30秒）' },
      // IP速率限制（通用）
      { key: 'ip_rate_limit_attempts', value: '5', description: 'IP速率限制尝试次数，超过此次数后IP将被临时阻止' },
      { key: 'ip_rate_limit_window_minutes', value: '15', description: 'IP速率限制时间窗口（分钟），在此时间窗口内计算失败次数' },
      // QZ Tray 证书设置（用于静默打印）
      { key: 'qz_certificate', value: '', description: 'QZ Tray 数字证书（用于静默打印，可通过管理界面上传）' },
      { key: 'qz_private_key', value: '', description: 'QZ Tray 私钥（用于静默打印，可通过管理界面上传）' },
      // 自定义API Token（仅用于自定义API验证，不影响其他业务）
      { key: 'custom_api_token', value: '', description: '自定义API Token（仅用于自定义API身份验证，可通过X-API-Token头或Authorization: Bearer传递）' }
      ,
      // 天气路况自动更新
      { key: 'weather_auto_update_enabled', value: 'true', description: '是否启用天气路况自动更新' },
      { key: 'weather_update_frequency', value: 'daily', description: '天气路况更新频率（hourly/daily）' },
      { key: 'weather_last_update', value: '', description: '天气路况最后更新时间（ISO）' },
      { key: 'weather_city_name', value: 'Cairo', description: '天气路况主城市名称（用于显示）' },
      { key: 'weather_tomtom_api_key', value: '', description: 'TomTom Traffic API Key（可选，未配置则保留旧路况）' },
      { key: 'weather_tomtom_bbox', value: '31.10,29.95,31.40,30.20', description: 'TomTom 路况查询范围 bbox（minLon,minLat,maxLon,maxLat）' }
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
