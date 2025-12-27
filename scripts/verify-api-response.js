const { initData } = require('../db/init');
const { getAsync } = require('../db/database');
const { updateExchangeRateAPI } = require('../utils/exchange-rate-updater');
const { fetchExchangeRates } = require('../utils/exchange-rate-fetcher');
const { allAsync } = require('../db/database');

async function verifyAPIResponse() {
  try {
    await initData();
    
    console.log('=== 验证API响应和数据流 ===\n');
    
    // 1. 获取设置
    const settings = await allAsync('SELECT key, value FROM settings');
    const settingsObj = {};
    settings.forEach(s => {
      settingsObj[s.key] = s.value;
    });
    
    const exchangerateKey = settingsObj.exchangerate_api_key;
    if (!exchangerateKey) {
      console.log('❌ 未配置 ExchangeRate-API 密钥');
      return;
    }
    
    console.log('1. 获取汇率数据...\n');
    const result = await fetchExchangeRates({
      exchangerate_api_key: exchangerateKey,
      exchange_rate_base_currencies: 'CNY,USD',
      exchange_rate_target_currency: 'EGP'
    });
    
    console.log('✅ 获取成功！');
    console.log('返回数据:');
    console.log(JSON.stringify(result, null, 2));
    console.log('');
    
    // 2. 更新数据库
    console.log('2. 更新数据库...\n');
    const updateResult = await updateExchangeRateAPI(result);
    
    console.log('✅ 更新成功！');
    console.log('更新结果:');
    console.log(`  updateTime: ${updateResult.updateTime}`);
    console.log('');
    
    // 3. 检查数据库中的实际数据
    console.log('3. 检查数据库中的实际数据...\n');
    const api = await getAsync(
      `SELECT id, name, response_content, updated_at
       FROM custom_apis 
       WHERE path = '/exchange-rate' AND method = 'GET' AND status = 'active'`
    );
    
    if (api) {
      const content = JSON.parse(api.response_content);
      const exchangeData = Array.isArray(content) ? content[0] : content;
      
      console.log('数据库中的 updateTime:', exchangeData.updateTime);
      console.log('数据库更新时间:', api.updated_at);
      console.log('');
      
      // 4. 模拟API返回
      console.log('4. 模拟小程序API调用...\n');
      console.log('API返回的数据:');
      console.log(JSON.stringify(content, null, 2));
    }
    
    console.log('\n=== 总结 ===\n');
    console.log('✅ 数据流验证完成');
    console.log('   1. API返回时间:', result.updateTime);
    console.log('   2. 数据库存储时间:', updateResult.updateTime);
    console.log('   3. 小程序将收到的时间:', exchangeData?.updateTime);
    
  } catch (error) {
    console.error('❌ 验证失败:', error.message);
    console.error(error.stack);
  } finally {
    process.exit(0);
  }
}

verifyAPIResponse();

