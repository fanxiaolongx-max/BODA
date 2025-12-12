const { runAsync, getAsync, allAsync, waitForDbReady } = require('./database');

/**
 * 严格规范化自定义API字段结构
 * 不允许兼容和降级，必须严格按照标准格式
 * 
 * 二级菜单（列表API）标准字段：
 * - id: 唯一标识（必填）
 * - name: 名称（必填，用于卡片显示）
 * - title: 标题（可选，用于详情页标题）
 * - description: 描述信息（可选）
 * - image: 图片URL（可选）
 * - category: 分类（可选）
 * - detailApi: 详情API地址（必填，如果有三级菜单）
 * 
 * 三级菜单（详情API）标准格式：
 * {
 *   "content": "<h2>标题</h2><p>HTML内容...</p>",
 *   "title": "文章标题",
 *   "meta": "2024-01-15"
 * }
 */
async function migrateCustomApiStrict() {
  await waitForDbReady();
  
  try {
    console.log('开始严格规范化自定义API字段结构...');
    console.log('注意：此脚本不允许兼容和降级，必须严格按照标准格式\n');
    
    // 获取所有API
    const apis = await allAsync(
      'SELECT id, name, path, method, response_content FROM custom_apis ORDER BY id'
    );
    
    let totalProcessed = 0;
    let totalFixed = 0;
    let totalErrors = 0;
    
    for (const api of apis) {
      try {
        console.log(`\n处理 API ID ${api.id}: ${api.name} (${api.path})`);
        
        // 解析现有的response_content
        let content;
        try {
          content = JSON.parse(api.response_content);
        } catch (e) {
          console.error(`  ✗ JSON解析失败: ${e.message}`);
          totalErrors++;
          continue;
        }
        
        // 判断是列表API还是详情API
        const isDetailApi = api.path.includes('/detail') || api.path.includes('/detial');
        
        if (isDetailApi) {
          // 详情API：必须是对象格式，包含content或html字段
          console.log('  类型: 详情API');
          
          // 如果是数组，取第一个元素
          let detailContent = content;
          if (Array.isArray(content) && content.length > 0) {
            console.warn(`  ⚠ 详情API是数组格式，将使用第一个元素`);
            detailContent = content[0];
          }
          
          if (!detailContent || typeof detailContent !== 'object' || Array.isArray(detailContent)) {
            console.error(`  ✗ 详情API必须是对象格式，当前格式: ${Array.isArray(detailContent) ? '数组' : typeof detailContent}`);
            totalErrors++;
            continue;
          }
          
          // 检查必填字段：content 或 html
          if (!detailContent.content && !detailContent.html) {
            console.error(`  ✗ 详情API缺少必填字段：content 或 html`);
            totalErrors++;
            continue;
          }
          
          // 规范化：统一使用content字段
          const normalized = {
            content: detailContent.content || detailContent.html || '',
            title: detailContent.title || null,
            meta: detailContent.meta || null
          };
          
          // 移除其他非标准字段
          const newContent = {
            content: normalized.content,
            ...(normalized.title && { title: normalized.title }),
            ...(normalized.meta && { meta: normalized.meta })
          };
          
          const newResponseContent = JSON.stringify(newContent, null, 2);
          await runAsync(
            `UPDATE custom_apis 
             SET response_content = ?, updated_at = datetime('now', 'localtime')
             WHERE id = ?`,
            [newResponseContent, api.id]
          );
          
          console.log(`  ✓ 详情API已规范化`);
          totalFixed++;
          
        } else {
          // 列表API：必须是数组或包含data字段的对象
          console.log('  类型: 列表API');
          
          let items = [];
          let isObjectWithData = false;
          
          if (Array.isArray(content)) {
            items = content;
          } else if (content && typeof content === 'object' && Array.isArray(content.data)) {
            items = content.data;
            isObjectWithData = true;
          } else {
            console.error(`  ✗ 列表API必须是数组或包含data字段的对象`);
            totalErrors++;
            continue;
          }
          
          if (items.length === 0) {
            console.log(`  ⚠ 列表为空，跳过`);
            totalProcessed++;
            continue;
          }
          
          // 检查每个项目是否符合标准
          const existingIds = new Set();
          let nextId = 1;
          const getNextUniqueId = () => {
            while (existingIds.has(nextId)) {
              nextId++;
            }
            existingIds.add(nextId);
            return nextId++;
          };
          
          let hasChanges = false;
          const normalizedItems = items.map((item, index) => {
            const normalized = {};
            
            // id: 必填，必须唯一
            if (!item.id || item.id === null || item.id === undefined) {
              normalized.id = getNextUniqueId();
              hasChanges = true;
            } else {
              const id = typeof item.id === 'number' ? item.id : parseInt(item.id, 10);
              if (isNaN(id) || id <= 0) {
                normalized.id = getNextUniqueId();
                hasChanges = true;
              } else if (existingIds.has(id)) {
                normalized.id = getNextUniqueId();
                hasChanges = true;
              } else {
                normalized.id = id;
                existingIds.add(id);
              }
            }
            
            // name: 必填
            if (!item.name || typeof item.name !== 'string' || item.name.trim() === '') {
              // 尝试从其他字段推断
              if (item.title && typeof item.title === 'string') {
                normalized.name = item.title.trim();
                hasChanges = true;
              } else if (item.chinese && typeof item.chinese === 'string') {
                normalized.name = item.chinese.trim();
                hasChanges = true;
              } else {
                console.error(`  ✗ 项目 ${index} 缺少必填字段 name`);
                throw new Error(`项目 ${index} 缺少必填字段 name`);
              }
            } else {
              normalized.name = item.name.trim();
            }
            
            // title: 可选
            if (item.title && typeof item.title === 'string' && item.title.trim() !== '') {
              normalized.title = item.title.trim();
            }
            
            // description: 可选
            if (item.description !== undefined && item.description !== null) {
              normalized.description = typeof item.description === 'string' 
                ? item.description.trim() 
                : String(item.description);
            }
            
            // image: 可选
            if (item.image && typeof item.image === 'string' && item.image.trim() !== '') {
              normalized.image = item.image.trim();
            }
            
            // category: 可选
            if (item.category && typeof item.category === 'string' && item.category.trim() !== '') {
              normalized.category = item.category.trim();
            }
            
            // detailApi: 必填（如果有三级菜单）
            // 检查是否有对应的详情API
            const hasDetailApi = item.detailApi && typeof item.detailApi === 'string' && item.detailApi.trim() !== '';
            
            if (hasDetailApi) {
              // 验证detailApi格式：必须包含 /detail 或 /detial
              const detailApiUrl = item.detailApi.trim();
              
              if (!detailApiUrl.includes('/detail') && !detailApiUrl.includes('/detial')) {
                console.error(`  ✗ 项目 ${index} 的 detailApi 格式不正确（必须包含 /detail 或 /detial）: ${detailApiUrl}`);
                throw new Error(`项目 ${index} 的 detailApi 格式不正确`);
              }
              
              // 如果格式不正确，尝试修正
              if (!detailApiUrl.startsWith('https://bobapro.life/api/custom')) {
                console.warn(`  ⚠ 项目 ${index} 的 detailApi 格式不规范，建议使用标准格式: https://bobapro.life/api/custom{path}/{id}/detail`);
              }
              
              normalized.detailApi = detailApiUrl;
            } else {
              // 如果没有detailApi，检查是否需要添加
              // 这里可以根据业务需求决定：如果所有列表项都应该有详情，则添加；否则保持为空
              // 暂时不自动添加，让用户手动决定
              console.warn(`  ⚠ 项目 ${index} 缺少 detailApi（二级菜单，无三级菜单）`);
            }
            
            // 保留其他扩展字段（但移除非标准字段）
            const standardFields = ['id', 'name', 'title', 'description', 'image', 'category', 'detailApi', 'url'];
            Object.keys(item).forEach(key => {
              if (!standardFields.includes(key) && item[key] !== undefined && item[key] !== null) {
                normalized[key] = item[key];
              }
            });
            
            return normalized;
          });
          
          // 构建新的response_content
          let newContent;
          if (isObjectWithData) {
            newContent = {
              ...content,
              data: normalizedItems
            };
          } else {
            newContent = normalizedItems;
          }
          
          const newResponseContent = JSON.stringify(newContent, null, 2);
          await runAsync(
            `UPDATE custom_apis 
             SET response_content = ?, updated_at = datetime('now', 'localtime')
             WHERE id = ?`,
            [newResponseContent, api.id]
          );
          
          if (hasChanges) {
            console.log(`  ✓ 列表API已规范化 (${normalizedItems.length} 个项目)`);
            totalFixed++;
          } else {
            console.log(`  ✓ 列表API已符合规范 (${normalizedItems.length} 个项目)`);
          }
          totalProcessed++;
        }
        
      } catch (error) {
        console.error(`  ✗ API ID ${api.id} 处理失败: ${error.message}`);
        totalErrors++;
      }
    }
    
    console.log('\n' + '='.repeat(50));
    console.log('迁移完成统计:');
    console.log(`  处理总数: ${totalProcessed + totalFixed + totalErrors}`);
    console.log(`  已规范化: ${totalFixed}`);
    console.log(`  已符合规范: ${totalProcessed}`);
    console.log(`  错误数量: ${totalErrors}`);
    console.log('='.repeat(50));
    
  } catch (error) {
    console.error('迁移失败:', error);
    throw error;
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  migrateCustomApiStrict()
    .then(() => {
      console.log('\n所有迁移完成');
      process.exit(0);
    })
    .catch((error) => {
      console.error('迁移失败:', error);
      process.exit(1);
    });
}

module.exports = { migrateCustomApiStrict };
