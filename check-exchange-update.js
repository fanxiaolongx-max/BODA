const {allAsync} = require('./db/database');
const {initData} = require('./db/init');

async function checkExchangeUpdate() {
  await initData();
  
  const setting = await allAsync('SELECT key, value, updated_at FROM settings WHERE key = "exchange_rate_last_update"');
  
  console.log('=== 汇率更新时间检查 ===\n');
  
  setting.forEach(s => {
    console.log('key:', s.key);
    console.log('value (UTC时间):', s.value);
    console.log('updated_at (数据库时间):', s.updated_at);
    console.log('');
    
    if (s.value) {
      const d = new Date(s.value);
      console.log('value解析为Date:', d.toISOString());
      console.log('value在UTC+8时区:', d.toLocaleString('zh-CN', {timeZone: 'Asia/Shanghai'}));
      console.log('value在UTC+2时区:', d.toLocaleString('zh-CN', {timeZone: 'Africa/Cairo'}));
    }
    
    if (s.updated_at) {
      console.log('updated_at原始值:', s.updated_at);
      const now = new Date();
      // SQLite的datetime('now')返回UTC时间，格式为 'YYYY-MM-DD HH:MM:SS'
      // 需要添加'Z'后缀表示UTC时间
      const updatedAt = new Date(s.updated_at + 'Z');
      console.log('updated_at解析为UTC:', updatedAt.toISOString());
      const minutesAgo = (now - updatedAt) / (1000 * 60);
      console.log('updated_at距离现在:', minutesAgo.toFixed(0), '分钟前');
      
      // 检查value和updated_at是否一致
      if (s.value) {
        const valueDate = new Date(s.value);
        const diff = Math.abs(valueDate - updatedAt);
        console.log('value和updated_at时间差:', (diff / (1000 * 60)).toFixed(0), '分钟');
        if (diff < 60000) { // 1分钟内
          console.log('✓ value和updated_at时间一致');
        } else {
          console.log('⚠️ value和updated_at时间不一致');
        }
      }
    }
  });
  
  process.exit(0);
}

checkExchangeUpdate().catch(err => {
  console.error('检查失败:', err);
  process.exit(1);
});

