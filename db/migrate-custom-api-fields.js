const { runAsync, getAsync, allAsync, waitForDbReady } = require('./database');

/**
 * 迁移自定义API字段结构，统一为标准格式
 * 标准字段：
 * - id: 唯一标识（必填）
 * - name: 名称（必填，用于卡片显示）
 * - title: 标题（可选，用于详情页标题）
 * - description: 描述信息（可选，用于卡片摘要显示）
 * - image: 图片URL（可选）
 * - category: 分类（可选）
 * - detailApi: 详情API地址（必填）
 */
async function migrateCustomApiFields() {
  await waitForDbReady();
  
  try {
    // 获取所有需要迁移的API（包括之前指定的和新增的）
    const targetPaths = [
      '/hot-spots',      // 热门打卡地
      '/rentals',        // 租房酒店
      '/second-hand',    // 二手市场
      '/blacklist',      // 防骗预警
      '/nile-hot',       // 尼罗河热映
      '/exchange-rate',  // 汇率转换
      '/weather',        // 天气路况
      '/hot-activity',   // 热门活动
      '/translation',    // 翻译卡片
      '/phone-helper',   // 话费助手
      '/visa-guide',     // 签证攻略
      '/tip-guide',      // 小费指南
      '/feedback',       // 反馈建议
      '/test'            // test
    ];
    
    console.log('开始迁移自定义API字段结构...');
    
    for (const path of targetPaths) {
      console.log(`\n处理路径: ${path}`);
      
      // 获取该路径的所有API（可能有不同方法）
      const apis = await allAsync(
        'SELECT id, name, path, method, response_content FROM custom_apis WHERE path = ?',
        [path]
      );
      
      if (apis.length === 0) {
        console.log(`  未找到路径 ${path} 的API，跳过`);
        continue;
      }
      
      for (const api of apis) {
        try {
          // 解析现有的response_content
          let content;
          try {
            content = JSON.parse(api.response_content);
          } catch (e) {
            console.log(`  API ID ${api.id}: response_content不是有效的JSON，跳过`);
            continue;
          }
          
          // 判断content是数组还是对象
          let items = [];
          let isArray = Array.isArray(content);
          let isObjectWithData = false;
          let keepOriginalStructure = false;
          
          if (isArray) {
            items = content;
          } else if (content && typeof content === 'object') {
            // 检查是否有data字段
            if (Array.isArray(content.data)) {
              items = content.data;
              isObjectWithData = true;
            } else {
              // 检查是否是复杂对象结构（如天气路况，包含多个数组字段）
              // 如果对象包含多个数组字段，保持原结构，只迁移数组字段
              const arrayFields = Object.keys(content).filter(key => Array.isArray(content[key]));
              
              if (arrayFields.length > 0) {
                // 对于复杂对象，我们需要处理每个数组字段
                keepOriginalStructure = true;
                // 这里先处理主要的数组字段，如果有data字段优先使用data
                if (content.data && Array.isArray(content.data)) {
                  items = content.data;
                  isObjectWithData = true;
                } else {
                  // 使用第一个数组字段
                  const firstArrayField = arrayFields[0];
                  items = content[firstArrayField];
                  isObjectWithData = true;
                  // 标记需要特殊处理
                  console.log(`  API ID ${api.id}: 检测到复杂对象结构，包含数组字段: ${arrayFields.join(', ')}`);
                }
              } else {
                // 如果是单个对象，转换为数组
                items = [content];
              }
            }
          } else {
            console.log(`  API ID ${api.id}: response_content格式不支持，跳过`);
            continue;
          }
          
          // 迁移每个item
          // UUID格式的正则表达式（8-4-4-4-12格式）
          const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          
          // 先收集所有现有ID（包括UUID和数字ID），确保新ID不重复
          const existingIds = new Set();
          const existingUUIDs = new Set();
          const existingNumberIds = new Set();
          
          items.forEach(item => {
            const id = item.id;
            if (id !== undefined && id !== null) {
              const idStr = String(id);
              if (UUID_REGEX.test(idStr)) {
                // UUID格式的ID
                existingIds.add(idStr);
                existingUUIDs.add(idStr);
              } else if (/^\d+$/.test(idStr)) {
                // 数字格式的ID
                const numId = parseInt(idStr, 10);
                existingIds.add(numId);
                existingNumberIds.add(numId);
              } else {
                // 其他格式，也保留
                existingIds.add(idStr);
              }
            }
          });
          
          let nextId = 1;
          const getNextUniqueId = () => {
            while (existingNumberIds.has(nextId)) {
              nextId++;
            }
            existingNumberIds.add(nextId);
            return nextId++;
          };
          
          const migratedItems = items.map((item, index) => {
            const migrated = {};
            
            // id: 必填，优先使用现有id
            // 如果id是UUID格式，直接保留（不修改）
            // 如果id是数字格式，保留但确保不重复
            // 如果没有id或id无效，生成新的数字ID（仅用于向后兼容）
            if (item.id !== undefined && item.id !== null) {
              const idStr = String(item.id);
              if (UUID_REGEX.test(idStr)) {
                // UUID格式，直接保留（这是博客文章的全局唯一ID，绝对不能修改）
                migrated.id = idStr;
              } else if (/^\d+$/.test(idStr)) {
                // 数字格式，保留但确保不重复
                const numId = parseInt(idStr, 10);
                if (!existingNumberIds.has(numId)) {
                  migrated.id = numId;
                  existingNumberIds.add(numId);
                } else {
                  // 如果数字ID重复，生成新的数字ID（这种情况不应该发生，但为了安全起见）
                  migrated.id = getNextUniqueId();
                  console.warn(`  API ID ${api.id}: 检测到重复的数字ID ${numId}，已生成新ID ${migrated.id}`);
                }
              } else {
                // 其他格式，保留原值
                migrated.id = item.id;
              }
            } else {
              // 没有id，生成新的数字ID（仅用于向后兼容，新系统应该使用UUID）
              migrated.id = getNextUniqueId();
            }
            
            // name: 必填，优先使用现有name，否则使用title，否则尝试从其他字段推断
            if (item.name) {
              migrated.name = item.name;
            } else if (item.title) {
              migrated.name = item.title;
            } else if (item.chinese) {
              // 翻译卡片可能有chinese字段
              migrated.name = item.chinese;
            } else if (item.operator) {
              // 话费助手可能有operator字段
              migrated.name = item.operator;
            } else if (item.location) {
              // 天气路况可能有location字段
              migrated.name = item.location;
            } else if (item.message) {
              // 某些API可能有message字段
              migrated.name = item.message.substring(0, 50);
            } else {
              // 最后使用默认名称
              migrated.name = `${api.name} ${migrated.id}`;
            }
            
            // title: 可选，优先使用现有title，否则使用name
            if (item.title) {
              migrated.title = item.title;
            } else if (item.name && item.name !== migrated.name) {
              migrated.title = item.name;
            }
            
            // description: 可选
            if (item.description !== undefined) {
              migrated.description = item.description;
            }
            
            // image: 可选
            if (item.image !== undefined) {
              migrated.image = item.image;
            }
            
            // category: 可选
            if (item.category !== undefined) {
              migrated.category = item.category;
            }
            
            // detailApi: 必填
            // 强制使用标准格式：https://bobapro.life/api/custom{path}/{id}/detail
            // 如果现有detailApi格式正确，保留；否则强制更新为标准格式
            const expectedDetailApi = `https://bobapro.life/api/custom${path}/${migrated.id}/detail`;
            
            if (item.detailApi && item.detailApi.includes(`${path}/${migrated.id}/detail`)) {
              // 如果现有detailApi格式正确，保留
              migrated.detailApi = item.detailApi;
            } else if (item.url && item.url.includes(`${path}/${migrated.id}/detail`)) {
              // 如果url格式正确，使用url
              migrated.detailApi = item.url;
            } else {
              // 强制使用标准格式
              migrated.detailApi = expectedDetailApi;
            }
            
            // 保留其他字段（扩展字段）
            Object.keys(item).forEach(key => {
              if (!['id', 'name', 'title', 'description', 'image', 'category', 'detailApi', 'url'].includes(key)) {
                migrated[key] = item[key];
              }
            });
            
            return migrated;
          });
          
          // 构建新的response_content
          let newContent;
          if (isObjectWithData) {
            // 保持原有结构，只更新data字段
            newContent = {
              ...content,
              data: migratedItems
            };
          } else if (isArray) {
            // 直接使用数组
            newContent = migratedItems;
          } else {
            // 单个对象转换为数组
            newContent = migratedItems;
          }
          
          // 更新数据库
          const newResponseContent = JSON.stringify(newContent, null, 2);
          await runAsync(
            `UPDATE custom_apis 
             SET response_content = ?, updated_at = datetime('now', 'localtime')
             WHERE id = ?`,
            [newResponseContent, api.id]
          );
          
          console.log(`  API ID ${api.id} (${api.name}): 已迁移 ${migratedItems.length} 个项目`);
          
          // 显示迁移统计
          const stats = {
            hasName: migratedItems.filter(item => item.name).length,
            hasTitle: migratedItems.filter(item => item.title).length,
            hasDescription: migratedItems.filter(item => item.description).length,
            hasImage: migratedItems.filter(item => item.image).length,
            hasCategory: migratedItems.filter(item => item.category).length,
            hasDetailApi: migratedItems.filter(item => item.detailApi).length
          };
          
          console.log(`    统计: name=${stats.hasName}/${migratedItems.length}, title=${stats.hasTitle}/${migratedItems.length}, description=${stats.hasDescription}/${migratedItems.length}, image=${stats.hasImage}/${migratedItems.length}, category=${stats.hasCategory}/${migratedItems.length}, detailApi=${stats.hasDetailApi}/${migratedItems.length}`);
          
        } catch (error) {
          console.error(`  API ID ${api.id}: 迁移失败 - ${error.message}`);
        }
      }
    }
    
    console.log('\n迁移完成！');
    
  } catch (error) {
    console.error('迁移失败:', error);
    throw error;
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  migrateCustomApiFields()
    .then(() => {
      console.log('所有迁移完成');
      process.exit(0);
    })
    .catch((error) => {
      console.error('迁移失败:', error);
      process.exit(1);
    });
}

module.exports = { migrateCustomApiFields };
