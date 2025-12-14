/**
 * 测试天气路况更新是否成功写入数据库
 */

const { getAsync, allAsync } = require('./database');
const { waitForDbReady } = require('./database');
const { logger } = require('../utils/logger');

async function testWeatherUpdate() {
  await waitForDbReady();
  
  try {
    console.log('开始检查天气路况API...');
    
    // 查找天气路况API
    const weatherApis = await allAsync(`
      SELECT id, name, path, response_content, updated_at
      FROM custom_apis
      WHERE (name LIKE '%weather%' OR name LIKE '%天气%')
        AND method = 'GET'
        AND status = 'active'
    `);
    
    console.log(`找到 ${weatherApis.length} 个天气路况API\n`);
    
    for (const api of weatherApis) {
      console.log(`检查API: ${api.name} (ID: ${api.id})`);
      console.log(`更新时间: ${api.updated_at}`);
      
      try {
        const content = JSON.parse(api.response_content);
        
        // 检查是否是天气路况对象格式
        const isWeatherObject = 
          content.globalAlert && 
          content.attractions && 
          content.traffic;
        
        if (isWeatherObject) {
          console.log('✓ 是天气路况对象格式');
          console.log(`  - globalAlert: ${content.globalAlert ? '存在' : '缺失'}`);
          console.log(`  - attractions: ${content.attractions ? content.attractions.length + ' 个' : '缺失'}`);
          console.log(`  - traffic: ${content.traffic ? content.traffic.length + ' 个' : '缺失'}`);
          console.log(`  - data: ${content.data ? content.data.length + ' 个' : '缺失'}`);
          
          // 显示globalAlert内容
          if (content.globalAlert) {
            console.log(`  - globalAlert.level: ${content.globalAlert.level}`);
            console.log(`  - globalAlert.message: ${content.globalAlert.message?.substring(0, 50)}...`);
          }
          
          // 显示第一个attraction
          if (content.attractions && content.attractions.length > 0) {
            const first = content.attractions[0];
            console.log(`  - 第一个景点: ${first.name} (温度: ${first.temperature}°C)`);
          }
          
          // 显示第一个traffic
          if (content.traffic && content.traffic.length > 0) {
            const first = content.traffic[0];
            console.log(`  - 第一个路况: ${first.time} - ${first.type} - ${first.location}`);
          }
        } else {
          console.log('✗ 不是天气路况对象格式');
          console.log(`  - 内容类型: ${Array.isArray(content) ? '数组' : typeof content}`);
          if (content.data && Array.isArray(content.data)) {
            console.log(`  - data数组长度: ${content.data.length}`);
          }
        }
        
        console.log('');
      } catch (e) {
        console.error(`✗ 解析response_content失败: ${e.message}`);
        console.log('');
      }
    }
    
    console.log('检查完成！');
  } catch (error) {
    console.error('测试失败:', error);
    throw error;
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  testWeatherUpdate()
    .then(() => {
      console.log('\n测试完成！');
      process.exit(0);
    })
    .catch(error => {
      console.error('测试失败:', error);
      process.exit(1);
    });
}

module.exports = { testWeatherUpdate };
