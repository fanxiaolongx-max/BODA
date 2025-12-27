const { initData } = require('../db/init');
const { fetchExchangeRates } = require('../utils/exchange-rate-fetcher');
const { allAsync } = require('../db/database');

async function testExchangeRateAPI() {
  try {
    await initData();
    
    console.log('=== 测试汇率API获取 ===\n');
    
    // 获取设置
    const settings = await allAsync('SELECT key, value FROM settings');
    const settingsObj = {};
    settings.forEach(s => {
      settingsObj[s.key] = s.value;
    });
    
    const freecurrencyapiKey = settingsObj.freecurrencyapi_api_key;
    const exchangerateKey = settingsObj.exchangerate_api_key;
    
    console.log('API配置:');
    console.log(`  FreeCurrencyAPI: ${freecurrencyapiKey ? '已配置' : '未配置'}`);
    console.log(`  ExchangeRate-API: ${exchangerateKey ? '已配置' : '未配置'}`);
    console.log('');
    
    if (!freecurrencyapiKey && !exchangerateKey) {
      console.log('❌ 未配置任何汇率API密钥');
      return;
    }
    
    console.log('开始获取汇率数据...\n');
    
    const result = await fetchExchangeRates({
      freecurrencyapi_api_key: freecurrencyapiKey,
      exchangerate_api_key: exchangerateKey,
      exchange_rate_base_currencies: settingsObj.exchange_rate_base_currencies || 'CNY,USD,EUR,GBP,JPY,SAR,AED,RUB,INR,KRW,THB',
      exchange_rate_target_currency: settingsObj.exchange_rate_target_currency || 'EGP'
    });
    
    console.log('✅ 获取汇率成功！\n');
    console.log('返回数据格式:');
    console.log(`  类型: ${typeof result}`);
    console.log(`  是否为对象: ${typeof result === 'object'}`);
    console.log(`  是否有 rates 字段: ${result.rates ? '是' : '否'}`);
    console.log(`  是否有 updateTime 字段: ${result.updateTime ? '是' : '否'}`);
    console.log('');
    
    if (result.rates) {
      // 新格式
      console.log('📊 汇率数据 (新格式):');
      const rates = result.rates;
      const currencies = Object.keys(rates);
      console.log(`  货币对数量: ${currencies.length}`);
      currencies.slice(0, 3).forEach(key => {
        const targetRates = rates[key];
        Object.keys(targetRates).forEach(target => {
          console.log(`  ${key} -> ${target}: ${targetRates[target]}`);
        });
      });
      console.log('');
      
      console.log('⏰ API返回的时间信息:');
      if (result.updateTime) {
        console.log(`  updateTime: ${result.updateTime}`);
        try {
          const date = new Date(result.updateTime);
          console.log(`  解析为Date: ${date.toISOString()}`);
          console.log(`  本地时间: ${date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
          console.log(`  埃及时间: ${date.toLocaleString('zh-CN', { timeZone: 'Africa/Cairo' })}`);
        } catch (e) {
          console.log(`  ⚠️ 解析失败: ${e.message}`);
        }
      } else {
        console.log('  ❌ API未返回时间信息');
      }
    } else {
      // 旧格式
      console.log('📊 汇率数据 (旧格式):');
      const currencies = Object.keys(result);
      console.log(`  货币对数量: ${currencies.length}`);
      currencies.slice(0, 3).forEach(key => {
        if (typeof result[key] === 'object') {
          Object.keys(result[key]).forEach(target => {
            console.log(`  ${key} -> ${target}: ${result[key][target]}`);
          });
        }
      });
      console.log('');
      console.log('⏰ 旧格式API未返回时间信息，将使用当前时间');
    }
    
    console.log('\n=== 总结 ===\n');
    if (result.updateTime) {
      console.log('✅ API返回了时间信息:', result.updateTime);
      console.log('   这个时间将被转换为本地时区格式后存储到数据库');
    } else {
      console.log('⚠️ API未返回时间信息');
      console.log('   将使用当前服务器时间');
    }
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    console.error(error.stack);
  } finally {
    process.exit(0);
  }
}

testExchangeRateAPI();

