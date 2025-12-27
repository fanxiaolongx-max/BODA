const { initData } = require('../db/init');
const { allAsync } = require('../db/database');

async function checkAllExchangeRecords() {
  try {
    await initData();
    
    console.log('=== 检查所有汇率相关记录 ===\n');
    
    // 1. 检查所有 exchange-rate 相关的 custom_apis 记录
    const apis = await allAsync(
      `SELECT id, name, path, method, status, updated_at, response_content
       FROM custom_apis 
       WHERE path LIKE '%exchange%' OR name LIKE '%汇率%' OR name LIKE '%exchange%'
       ORDER BY updated_at DESC`
    );
    
    console.log(`找到 ${apis.length} 条相关记录:\n`);
    
    apis.forEach((api, index) => {
      console.log(`${index + 1}. API ID: ${api.id}`);
      console.log(`   名称: ${api.name}`);
      console.log(`   路径: ${api.path}`);
      console.log(`   状态: ${api.status}`);
      console.log(`   数据库更新时间: ${api.updated_at}`);
      
      // 解析 response_content
      try {
        const content = JSON.parse(api.response_content);
        let exchangeData = null;
        
        if (Array.isArray(content)) {
          exchangeData = content[0];
          console.log(`   数据格式: 数组 (长度: ${content.length})`);
        } else if (typeof content === 'object') {
          exchangeData = content;
          console.log(`   数据格式: 对象`);
        }
        
        if (exchangeData && exchangeData.updateTime) {
          console.log(`   updateTime: ${exchangeData.updateTime}`);
          
          // 解析时间
          try {
            const date = new Date(exchangeData.updateTime);
            console.log(`   解析为Date: ${date.toISOString()}`);
            console.log(`   埃及时间: ${date.toLocaleString('zh-CN', { timeZone: 'Africa/Cairo' })}`);
            
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
          console.log(`   ⚠️ 未找到 updateTime 字段`);
        }
      } catch (e) {
        console.log(`   ⚠️ 解析 response_content 失败: ${e.message}`);
      }
      
      console.log('');
    });
    
    // 2. 检查是否有多个 active 状态的 exchange-rate API
    const activeApis = apis.filter(api => 
      api.path === '/exchange-rate' && 
      api.method === 'GET' && 
      api.status === 'active'
    );
    
    console.log(`\n=== 活跃的 /exchange-rate API ===\n`);
    console.log(`找到 ${activeApis.length} 个活跃的 exchange-rate API`);
    
    if (activeApis.length > 1) {
      console.log('⚠️ 警告: 有多个活跃的 exchange-rate API，可能导致数据不一致！');
      console.log('建议只保留一个活跃的API，将其他设置为 inactive');
    } else if (activeApis.length === 1) {
      console.log('✅ 只有一个活跃的 exchange-rate API，正常');
    } else {
      console.log('❌ 没有活跃的 exchange-rate API');
    }
    
    // 3. 模拟API返回的数据
    if (activeApis.length > 0) {
      const activeApi = activeApis[0];
      console.log(`\n=== 模拟小程序API调用 (/api/custom/exchange-rate) ===\n`);
      
      try {
        const content = JSON.parse(activeApi.response_content);
        console.log('返回的数据:');
        console.log(JSON.stringify(content, null, 2));
        
        // 提取 updateTime
        let updateTime = null;
        if (Array.isArray(content)) {
          updateTime = content[0]?.updateTime;
        } else if (typeof content === 'object') {
          updateTime = content.updateTime;
        }
        
        if (updateTime) {
          console.log(`\n小程序将收到的 updateTime: ${updateTime}`);
          const date = new Date(updateTime);
          console.log(`解析为Date: ${date.toISOString()}`);
          console.log(`埃及时间: ${date.toLocaleString('zh-CN', { timeZone: 'Africa/Cairo' })}`);
        }
      } catch (e) {
        console.log(`解析失败: ${e.message}`);
      }
    }
    
  } catch (error) {
    console.error('检查失败:', error);
  } finally {
    process.exit(0);
  }
}

checkAllExchangeRecords();

