const { allAsync, waitForDbReady } = require('./database');

/**
 * 验证所有自定义API是否符合严格标准格式
 */
async function validateCustomApiFormat() {
  await waitForDbReady();
  
  try {
    console.log('开始验证自定义API格式...\n');
    
    const apis = await allAsync('SELECT id, name, path, response_content FROM custom_apis ORDER BY id');
    
    let totalApis = 0;
    let passedApis = 0;
    let failedApis = 0;
    const errors = [];
    
    for (const api of apis) {
      totalApis++;
      const isDetailApi = api.path.includes('/detail') || api.path.includes('/detial');
      
      try {
        const content = JSON.parse(api.response_content);
        let isValid = true;
        const apiErrors = [];
        
        if (isDetailApi) {
          // 详情API验证
          if (!content || typeof content !== 'object' || Array.isArray(content)) {
            apiErrors.push('详情API必须是对象格式');
            isValid = false;
          } else {
            if (!content.content && !content.html) {
              apiErrors.push('缺少必填字段：content 或 html');
              isValid = false;
            }
            
            // 检查非标准字段
            const standardFields = ['content', 'html', 'title', 'meta'];
            const nonStandardFields = Object.keys(content).filter(f => !standardFields.includes(f));
            if (nonStandardFields.length > 0) {
              apiErrors.push(`包含非标准字段: ${nonStandardFields.join(', ')}`);
              isValid = false;
            }
          }
        } else {
          // 列表API验证
          const items = Array.isArray(content) ? content : (content.data || [content]);
          
          if (items.length === 0) {
            apiErrors.push('列表为空');
            isValid = false;
          } else {
            items.forEach((item, index) => {
              // 必填字段检查
              if (!item.id || item.id === null || item.id === undefined) {
                apiErrors.push(`项目 ${index}: 缺少必填字段 id`);
                isValid = false;
              }
              
              if (!item.name || typeof item.name !== 'string' || item.name.trim() === '') {
                apiErrors.push(`项目 ${index}: 缺少必填字段 name`);
                isValid = false;
              }
              
              // detailApi格式检查（如果有）
              if (item.detailApi) {
                if (typeof item.detailApi !== 'string' || item.detailApi.trim() === '') {
                  apiErrors.push(`项目 ${index}: detailApi 必须是非空字符串`);
                  isValid = false;
                } else if (!item.detailApi.includes('/detail') && !item.detailApi.includes('/detial')) {
                  apiErrors.push(`项目 ${index}: detailApi 格式错误（必须包含 /detail 或 /detial）`);
                  isValid = false;
                }
              }
              
              // 可选字段类型检查
              if (item.title !== undefined && typeof item.title !== 'string') {
                apiErrors.push(`项目 ${index}: title 必须是字符串`);
                isValid = false;
              }
              
              if (item.description !== undefined && typeof item.description !== 'string' && typeof item.description !== 'number') {
                apiErrors.push(`项目 ${index}: description 类型错误`);
                isValid = false;
              }
              
              if (item.image !== undefined && typeof item.image !== 'string') {
                apiErrors.push(`项目 ${index}: image 必须是字符串`);
                isValid = false;
              }
              
              if (item.category !== undefined && typeof item.category !== 'string') {
                apiErrors.push(`项目 ${index}: category 必须是字符串`);
                isValid = false;
              }
            });
          }
        }
        
        if (isValid) {
          passedApis++;
          console.log(`✓ API ID ${api.id}: ${api.name} (${api.path})`);
        } else {
          failedApis++;
          console.log(`✗ API ID ${api.id}: ${api.name} (${api.path})`);
          apiErrors.forEach(err => console.log(`  - ${err}`));
          errors.push({
            id: api.id,
            name: api.name,
            path: api.path,
            errors: apiErrors
          });
        }
        
      } catch (e) {
        failedApis++;
        console.log(`✗ API ID ${api.id}: ${api.name} (${api.path})`);
        console.log(`  - JSON解析失败: ${e.message}`);
        errors.push({
          id: api.id,
          name: api.name,
          path: api.path,
          errors: [`JSON解析失败: ${e.message}`]
        });
      }
    }
    
    console.log('\n' + '='.repeat(50));
    console.log('验证结果统计:');
    console.log(`  总API数: ${totalApis}`);
    console.log(`  通过: ${passedApis}`);
    console.log(`  失败: ${failedApis}`);
    console.log('='.repeat(50));
    
    if (errors.length > 0) {
      console.log('\n错误详情:');
      errors.forEach(err => {
        console.log(`\nAPI ID ${err.id}: ${err.name} (${err.path})`);
        err.errors.forEach(e => console.log(`  - ${e}`));
      });
      return false;
    }
    
    return true;
    
  } catch (error) {
    console.error('验证失败:', error);
    throw error;
  }
}

if (require.main === module) {
  validateCustomApiFormat()
    .then((passed) => {
      if (passed) {
        console.log('\n✅ 所有API格式验证通过！');
        process.exit(0);
      } else {
        console.log('\n❌ 部分API格式验证失败，请修复后重试');
        process.exit(1);
      }
    })
    .catch((error) => {
      console.error('验证失败:', error);
      process.exit(1);
    });
}

module.exports = { validateCustomApiFormat };
