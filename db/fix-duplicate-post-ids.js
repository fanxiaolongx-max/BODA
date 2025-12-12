/**
 * 修复重复的文章ID，确保每个文章的id都是全局唯一的UUID
 */

const { allAsync, runAsync } = require('../db/database');
const { v4: uuidv4 } = require('uuid');

// UUID格式的正则表达式（8-4-4-4-12格式）
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 检查字符串是否是有效的UUID格式
 */
function isValidUUID(str) {
  return UUID_REGEX.test(String(str));
}

/**
 * 等待数据库就绪
 */
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

/**
 * 修复重复的文章ID
 */
async function fixDuplicatePostIds() {
  await waitForDbReady();
  
  try {
    console.log('='.repeat(60));
    console.log('开始修复重复的文章ID');
    console.log('='.repeat(60));
    
    // 获取所有API
    const apis = await allAsync(`
      SELECT id, name, path, response_content
      FROM custom_apis
      WHERE method = 'GET' AND status = 'active'
      ORDER BY name ASC
    `);
    
    console.log(`\n找到 ${apis.length} 个API\n`);
    
    // 用于跟踪所有已使用的ID
    const usedIds = new Set();
    let totalFixed = 0;
    let totalChecked = 0;
    
    // 遍历每个API
    for (const api of apis) {
      try {
        const responseContent = JSON.parse(api.response_content);
        let items = [];
        let isArrayFormat = false;
        
        // 确定格式和获取items
        if (Array.isArray(responseContent)) {
          isArrayFormat = true;
          items = responseContent;
        } else if (responseContent.data && Array.isArray(responseContent.data)) {
          isArrayFormat = false;
          items = responseContent.data;
        } else {
          console.log(`⚠ 跳过API "${api.name}": 格式无效`);
          continue;
        }
        
        let apiFixed = 0;
        let hasChanges = false;
        
        // 遍历每个文章
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          totalChecked++;
          
          const currentId = item.id || item._id;
          
          if (!currentId) {
            // 如果没有ID，生成新的UUID
            const newId = uuidv4();
            item.id = newId;
            usedIds.add(newId);
            apiFixed++;
            hasChanges = true;
            console.log(`  ✓ 为文章 "${item.name || item.title || '未命名'}" 生成新ID: ${newId}`);
          } else {
            const idStr = String(currentId);
            
            // 检查是否是有效的UUID格式
            if (!isValidUUID(idStr)) {
              // 如果不是UUID格式，生成新的UUID
              const newId = uuidv4();
              console.log(`  ✓ 文章 "${item.name || item.title || '未命名'}" ID "${idStr}" 不是UUID格式，生成新ID: ${newId}`);
              item.id = newId;
              usedIds.add(newId);
              apiFixed++;
              hasChanges = true;
            } else if (usedIds.has(idStr)) {
              // 如果ID已被使用，生成新的UUID
              const newId = uuidv4();
              console.log(`  ✓ 文章 "${item.name || item.title || '未命名'}" ID "${idStr}" 重复，生成新ID: ${newId}`);
              item.id = newId;
              usedIds.add(newId);
              apiFixed++;
              hasChanges = true;
            } else {
              // ID是唯一的，添加到已使用集合
              usedIds.add(idStr);
            }
          }
        }
        
        // 如果有更改，更新数据库
        if (hasChanges) {
          let finalContent;
          if (isArrayFormat) {
            // 保持数组格式
            finalContent = items;
          } else {
            // 保持对象格式
            finalContent = { ...responseContent, data: items };
          }
          
          await runAsync(
            `UPDATE custom_apis 
             SET response_content = ?, updated_at = datetime('now', 'localtime')
             WHERE id = ?`,
            [JSON.stringify(finalContent), api.id]
          );
          
          console.log(`\n✓ API "${api.name}": 修复了 ${apiFixed} 个文章的ID`);
          totalFixed += apiFixed;
        } else {
          console.log(`\n- API "${api.name}": 无需修复（所有ID都是唯一的）`);
        }
        
      } catch (error) {
        console.error(`\n✗ API "${api.name}" 处理失败: ${error.message}`);
      }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('修复完成');
    console.log('='.repeat(60));
    console.log(`\n总计检查文章数: ${totalChecked}`);
    console.log(`总计修复文章数: ${totalFixed}`);
    console.log(`当前唯一ID数: ${usedIds.size}`);
    
    // 验证修复结果
    console.log('\n验证修复结果...');
    const verifyApis = await allAsync(`
      SELECT id, name, path, response_content
      FROM custom_apis
      WHERE method = 'GET' AND status = 'active'
    `);
    
    const verifyIds = new Set();
    let duplicateCount = 0;
    
    for (const api of verifyApis) {
      try {
        const content = JSON.parse(api.response_content);
        const items = Array.isArray(content) ? content : (content.data || []);
        
        for (const item of items) {
          const itemId = String(item.id || item._id || '');
          if (itemId) {
            if (verifyIds.has(itemId)) {
              duplicateCount++;
              console.log(`  ✗ 发现重复ID: ${itemId} (API: ${api.name}, 文章: ${item.name || item.title || '未命名'})`);
            } else {
              verifyIds.add(itemId);
            }
          }
        }
      } catch (e) {
        // 忽略解析错误
      }
    }
    
    if (duplicateCount === 0) {
      console.log(`\n✓ 验证通过：所有 ${verifyIds.size} 个文章ID都是唯一的！`);
    } else {
      console.log(`\n✗ 验证失败：仍有 ${duplicateCount} 个重复ID`);
    }
    
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('\n修复失败:', error);
    throw error;
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  fixDuplicatePostIds()
    .then(() => {
      console.log('\n脚本执行完成');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n脚本执行失败:', error);
      process.exit(1);
    });
}

module.exports = { fixDuplicatePostIds };
