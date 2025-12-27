const { initData } = require('../db/init');
const { getAsync, allAsync } = require('../db/database');

async function checkExchangeRateData() {
  try {
    await initData();
    
    console.log('=== 检查汇率数据库数据 ===\n');
    
    // 1. 检查 custom_apis 表中的汇率数据
    const api = await getAsync(
      `SELECT id, name, path, method, response_content, updated_at, status
       FROM custom_apis 
       WHERE path = '/exchange-rate' AND method = 'GET' AND status = 'active'`
    );
    
    if (!api) {
      console.log('❌ 未找到 /exchange-rate API记录');
      return;
    }
    
    console.log('✅ 找到汇率API记录:');
    console.log(`   ID: ${api.id}`);
    console.log(`   名称: ${api.name}`);
    console.log(`   路径: ${api.path}`);
    console.log(`   数据库更新时间: ${api.updated_at}`);
    console.log('');
    
    // 2. 解析 response_content
    let responseContent = null;
    try {
      responseContent = JSON.parse(api.response_content);
    } catch (e) {
      console.log('❌ 解析 response_content 失败:', e.message);
      return;
    }
    
    console.log('📊 响应内容结构:');
    console.log(`   类型: ${Array.isArray(responseContent) ? '数组' : typeof responseContent}`);
    
    // 3. 提取汇率数据
    let exchangeData = null;
    if (Array.isArray(responseContent)) {
      exchangeData = responseContent[0] || {};
      console.log(`   数组长度: ${responseContent.length}`);
      console.log(`   第一个元素键: ${Object.keys(exchangeData).slice(0, 5).join(', ')}...`);
    } else if (typeof responseContent === 'object') {
      exchangeData = responseContent;
      console.log(`   对象键: ${Object.keys(exchangeData).slice(0, 5).join(', ')}...`);
    }
    
    console.log('');
    
    // 4. 检查 updateTime 字段
    if (exchangeData) {
      console.log('⏰ 汇率更新时间信息:');
      if (exchangeData.updateTime) {
        const updateTime = exchangeData.updateTime;
        console.log(`   updateTime: ${updateTime}`);
        
        // 解析时间
        try {
          const date = new Date(updateTime);
          console.log(`   解析为Date对象: ${date.toISOString()}`);
          console.log(`   本地时间显示: ${date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
          console.log(`   埃及时间显示: ${date.toLocaleString('zh-CN', { timeZone: 'Africa/Cairo' })}`);
          
          // 计算距离现在的时间
          const now = new Date();
          const diffMs = now - date;
          const diffHours = (diffMs / (1000 * 60 * 60)).toFixed(2);
          const diffDays = (diffMs / (1000 * 60 * 60 * 24)).toFixed(2);
          console.log(`   距离现在: ${diffHours} 小时 (${diffDays} 天)`);
        } catch (e) {
          console.log(`   ⚠️ 解析时间失败: ${e.message}`);
        }
      } else {
        console.log('   ❌ 未找到 updateTime 字段');
      }
      
      console.log('');
      
      // 5. 检查汇率数据
      console.log('💱 汇率数据:');
      const currencyKeys = Object.keys(exchangeData).filter(key => 
        !['id', 'name', 'title', 'slug', 'excerpt', 'description', 'htmlContent', 
          'image', 'category', 'tags', 'published', 'views', 'createdAt', 
          'updatedAt', 'detailApi', 'updateTime', '_specialType', '_specialData', '_sourceApiName'].includes(key)
      );
      
      console.log(`   货币对数量: ${currencyKeys.length}`);
      currencyKeys.slice(0, 5).forEach(key => {
        const rates = exchangeData[key];
        if (typeof rates === 'object') {
          const targetCurrencies = Object.keys(rates);
          targetCurrencies.forEach(target => {
            console.log(`   ${key} -> ${target}: ${rates[target]}`);
          });
        }
      });
      if (currencyKeys.length > 5) {
        console.log(`   ... 还有 ${currencyKeys.length - 5} 个货币对`);
      }
    }
    
    console.log('\n=== 检查设置表中的更新时间 ===\n');
    
    // 6. 检查 settings 表中的更新时间
    const lastUpdateSetting = await getAsync(
      `SELECT key, value, updated_at FROM settings WHERE key = 'exchange_rate_last_update'`
    );
    
    if (lastUpdateSetting) {
      console.log('✅ 找到汇率最后更新设置:');
      console.log(`   key: ${lastUpdateSetting.key}`);
      console.log(`   value (UTC时间): ${lastUpdateSetting.value}`);
      console.log(`   updated_at (数据库时间): ${lastUpdateSetting.updated_at}`);
      
      if (lastUpdateSetting.value) {
        try {
          const date = new Date(lastUpdateSetting.value);
          console.log(`   解析为Date: ${date.toISOString()}`);
          console.log(`   本地时间: ${date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
          console.log(`   埃及时间: ${date.toLocaleString('zh-CN', { timeZone: 'Africa/Cairo' })}`);
        } catch (e) {
          console.log(`   ⚠️ 解析失败: ${e.message}`);
        }
      }
    } else {
      console.log('❌ 未找到 exchange_rate_last_update 设置');
    }
    
    console.log('\n=== 总结 ===\n');
    console.log('1. 数据库中的 updateTime 字段:', exchangeData?.updateTime || '未找到');
    console.log('2. 数据库更新时间:', api.updated_at);
    console.log('3. 建议: 如果 updateTime 是旧时间，需要手动触发汇率更新');
    console.log('   方法: POST /api/admin/exchange-rate/update');
    
  } catch (error) {
    console.error('检查失败:', error);
  } finally {
    process.exit(0);
  }
}

checkExchangeRateData();

