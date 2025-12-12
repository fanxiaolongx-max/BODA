/**
 * 验证所有文章ID的唯一性
 * 用于定期检查，确保没有重复的ID
 */

const { allAsync } = require('../db/database');

// UUID格式的正则表达式
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function waitForDbReady() {
  const maxRetries = 10;
  let retries = 0;
  
  while (retries < maxRetries) {
    try {
      await allAsync('SELECT 1');
      return;
    } catch (error) {
      retries++;
      if (retries >= maxRetries) {
        throw new Error('数据库连接失败');
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
}

async function verifyPostIdsUnique() {
  await waitForDbReady();
  
  try {
    console.log('='.repeat(60));
    console.log('验证文章ID唯一性');
    console.log('='.repeat(60));
    
    const apis = await allAsync(`
      SELECT id, name, path, response_content
      FROM custom_apis
      WHERE method = 'GET' AND status = 'active'
      ORDER BY name ASC
    `);
    
    const allIds = [];
    const duplicateIds = {};
    const nonUuidIds = [];
    const idToPost = {}; // 记录每个ID对应的文章信息
    
    for (const api of apis) {
      try {
        const content = JSON.parse(api.response_content);
        const items = Array.isArray(content) ? content : (content.data || []);
        
        for (const item of items) {
          const itemId = item.id || item._id;
          if (itemId) {
            const idStr = String(itemId);
            
            // 检查UUID格式
            if (!UUID_REGEX.test(idStr)) {
              nonUuidIds.push({
                api: api.name,
                item: item.name || item.title || '未命名',
                id: idStr
              });
            }
            
            // 检查重复
            if (allIds.includes(idStr)) {
              if (!duplicateIds[idStr]) {
                duplicateIds[idStr] = [];
              }
              duplicateIds[idStr].push({
                api: api.name,
                item: item.name || item.title || '未命名'
              });
              // 添加第一个出现的记录
              if (idToPost[idStr]) {
                duplicateIds[idStr].unshift(idToPost[idStr]);
              }
            } else {
              allIds.push(idStr);
              idToPost[idStr] = {
                api: api.name,
                item: item.name || item.title || '未命名'
              };
            }
          } else {
            console.log(`⚠ 发现没有ID的文章: API "${api.name}", 文章 "${item.name || item.title || '未命名'}"`);
          }
        }
      } catch (e) {
        console.warn(`⚠ API "${api.name}" 解析失败: ${e.message}`);
      }
    }
    
    console.log(`\n总文章数: ${allIds.length}`);
    console.log(`重复ID数: ${Object.keys(duplicateIds).length}`);
    console.log(`非UUID格式ID数: ${nonUuidIds.length}`);
    
    if (Object.keys(duplicateIds).length > 0) {
      console.log(`\n⚠ 发现重复ID:`);
      Object.keys(duplicateIds).forEach(id => {
        console.log(`\n  ID: ${id}`);
        duplicateIds[id].forEach(dup => {
          console.log(`    - API: ${dup.api}, 文章: ${dup.item}`);
        });
      });
    }
    
    if (nonUuidIds.length > 0) {
      console.log(`\n⚠ 发现非UUID格式ID:`);
      nonUuidIds.forEach(item => {
        console.log(`  API: ${item.api}, 文章: ${item.item}, ID: ${item.id}`);
      });
    }
    
    if (Object.keys(duplicateIds).length === 0 && nonUuidIds.length === 0) {
      console.log(`\n✓ 所有文章ID都是唯一的UUID格式！`);
      return true;
    } else {
      console.log(`\n✗ 发现ID问题，请运行 fix-duplicate-post-ids.js 进行修复`);
      return false;
    }
    
  } catch (error) {
    console.error('\n验证失败:', error);
    throw error;
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  verifyPostIdsUnique()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('\n脚本执行失败:', error);
      process.exit(1);
    });
}

module.exports = { verifyPostIdsUnique };
