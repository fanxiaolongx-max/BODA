/**
 * 清理天气路况对象中的多余字段
 * 只保留 globalAlert、attractions、traffic 三个字段
 */

const { getAsync, allAsync, runAsync, waitForDbReady } = require('./database');
const { logger } = require('../utils/logger');

async function cleanWeatherObjects() {
  await waitForDbReady();
  
  try {
    console.log('开始清理天气路况对象...');
    
    // 查找所有天气路况API
    const apis = await allAsync(`
      SELECT id, name, path, response_content
      FROM custom_apis
      WHERE (name LIKE '%weather%' OR name LIKE '%天气%')
        AND method = 'GET'
        AND status = 'active'
    `);
    
    console.log(`找到 ${apis.length} 个天气路况API\n`);
    
    let cleanedCount = 0;
    
    for (const api of apis) {
      try {
        const content = JSON.parse(api.response_content);
        
        // 检查是否是天气路况对象格式
        const isWeatherObject = 
          content.globalAlert && 
          content.attractions && 
          content.traffic;
        
        if (!isWeatherObject) {
          console.log(`跳过 ${api.name}: 不是天气路况对象格式`);
          continue;
        }
        
        // 检查是否有不应该存在的字段
        const allowedFields = ['globalAlert', 'attractions', 'traffic'];
        const extraFields = Object.keys(content).filter(key => !allowedFields.includes(key));
        
        if (extraFields.length === 0) {
          console.log(`✓ ${api.name}: 已经是干净格式`);
          continue;
        }
        
        console.log(`清理 ${api.name}:`);
        console.log(`  发现多余字段: ${extraFields.join(', ')}`);
        
        // 只保留允许的字段
        const cleanedContent = {
          globalAlert: content.globalAlert,
          attractions: content.attractions,
          traffic: content.traffic
        };
        
        // 更新数据库
        await runAsync(
          `UPDATE custom_apis 
           SET response_content = ?, updated_at = datetime('now', 'localtime')
           WHERE id = ?`,
          [JSON.stringify(cleanedContent), api.id]
        );
        
        console.log(`  ✓ 已清理，保留字段: ${Object.keys(cleanedContent).join(', ')}`);
        cleanedCount++;
        
      } catch (error) {
        console.error(`  ✗ 处理失败: ${error.message}`);
      }
    }
    
    console.log(`\n清理完成！共清理 ${cleanedCount} 个API`);
    
  } catch (error) {
    console.error('清理失败:', error);
    throw error;
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  cleanWeatherObjects()
    .then(() => {
      console.log('\n清理完成！');
      process.exit(0);
    })
    .catch(error => {
      console.error('清理失败:', error);
      process.exit(1);
    });
}

module.exports = { cleanWeatherObjects };
