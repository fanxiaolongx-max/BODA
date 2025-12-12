/**
 * 测试格式保持功能
 * 验证创建、更新、删除文章时是否能保持原有JSON格式
 */

const { getAsync, allAsync, runAsync } = require('../db/database');
const { createBlogPost, updateBlogPost, deleteBlogPost } = require('../utils/blog-helper');

async function waitForDbReady() {
  const maxRetries = 10;
  let retries = 0;
  
  while (retries < maxRetries) {
    try {
      await getAsync('SELECT 1');
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

async function testFormatPreservation() {
  await waitForDbReady();
  
  try {
    console.log('开始测试格式保持功能...\n');
    
    // 获取所有API并检查格式
    const apis = await allAsync(`
      SELECT id, name, path, response_content
      FROM custom_apis
      WHERE method = 'GET' AND status = 'active'
      ORDER BY name ASC
    `);
    
    console.log(`找到 ${apis.length} 个API\n`);
    
    let arrayFormatApis = [];
    let objectFormatApis = [];
    
    for (const api of apis) {
      try {
        const content = JSON.parse(api.response_content);
        const isArray = Array.isArray(content);
        
        if (isArray) {
          arrayFormatApis.push(api);
        } else {
          objectFormatApis.push(api);
        }
      } catch (e) {
        console.warn(`⚠ API "${api.name}" 解析失败`);
      }
    }
    
    console.log(`数组格式API: ${arrayFormatApis.length} 个`);
    console.log(`对象格式API: ${objectFormatApis.length} 个\n`);
    
    // 测试数组格式API
    if (arrayFormatApis.length > 0) {
      const testApi = arrayFormatApis[0];
      console.log(`测试数组格式API: ${testApi.name}`);
      
      // 获取原始格式
      const originalContent = JSON.parse(testApi.response_content);
      const originalIsArray = Array.isArray(originalContent);
      const originalLength = originalIsArray ? originalContent.length : (originalContent.data?.length || 0);
      
      console.log(`  原始格式: ${originalIsArray ? '数组' : '对象'}`);
      console.log(`  原始文章数: ${originalLength}`);
      
      // 创建测试文章
      try {
        const testPost = await createBlogPost({
          name: '格式测试文章',
          apiName: testApi.name,
          htmlContent: '<h2>测试</h2><p>这是格式测试文章</p>',
          published: false
        });
        
        // 检查格式是否保持
        const afterCreate = await getAsync(
          'SELECT response_content FROM custom_apis WHERE id = ?',
          [testApi.id]
        );
        const afterContent = JSON.parse(afterCreate.response_content);
        const afterIsArray = Array.isArray(afterContent);
        
        console.log(`  创建后格式: ${afterIsArray ? '数组' : '对象'}`);
        console.log(`  格式保持: ${originalIsArray === afterIsArray ? '✓ 成功' : '✗ 失败'}`);
        
        // 删除测试文章
        if (testPost && testPost.id) {
          await deleteBlogPost(testPost.id);
          
          // 再次检查格式
          const afterDelete = await getAsync(
            'SELECT response_content FROM custom_apis WHERE id = ?',
            [testApi.id]
          );
          const deleteContent = JSON.parse(afterDelete.response_content);
          const deleteIsArray = Array.isArray(deleteContent);
          
          console.log(`  删除后格式: ${deleteIsArray ? '数组' : '对象'}`);
          console.log(`  格式保持: ${originalIsArray === deleteIsArray ? '✓ 成功' : '✗ 失败'}`);
        }
      } catch (error) {
        console.error(`  ✗ 测试失败: ${error.message}`);
      }
    }
    
    // 测试对象格式API
    if (objectFormatApis.length > 0) {
      const testApi = objectFormatApis[0];
      console.log(`\n测试对象格式API: ${testApi.name}`);
      
      // 获取原始格式
      const originalContent = JSON.parse(testApi.response_content);
      const originalIsArray = Array.isArray(originalContent);
      const originalLength = originalIsArray ? originalContent.length : (originalContent.data?.length || 0);
      
      console.log(`  原始格式: ${originalIsArray ? '数组' : '对象'}`);
      console.log(`  原始文章数: ${originalLength}`);
      
      // 创建测试文章
      try {
        const testPost = await createBlogPost({
          name: '格式测试文章',
          apiName: testApi.name,
          htmlContent: '<h2>测试</h2><p>这是格式测试文章</p>',
          published: false
        });
        
        // 检查格式是否保持
        const afterCreate = await getAsync(
          'SELECT response_content FROM custom_apis WHERE id = ?',
          [testApi.id]
        );
        const afterContent = JSON.parse(afterCreate.response_content);
        const afterIsArray = Array.isArray(afterContent);
        
        console.log(`  创建后格式: ${afterIsArray ? '数组' : '对象'}`);
        console.log(`  格式保持: ${originalIsArray === afterIsArray ? '✓ 成功' : '✗ 失败'}`);
        
        // 删除测试文章
        if (testPost && testPost.id) {
          await deleteBlogPost(testPost.id);
          
          // 再次检查格式
          const afterDelete = await getAsync(
            'SELECT response_content FROM custom_apis WHERE id = ?',
            [testApi.id]
          );
          const deleteContent = JSON.parse(afterDelete.response_content);
          const deleteIsArray = Array.isArray(deleteContent);
          
          console.log(`  删除后格式: ${deleteIsArray ? '数组' : '对象'}`);
          console.log(`  格式保持: ${originalIsArray === deleteIsArray ? '✓ 成功' : '✗ 失败'}`);
        }
      } catch (error) {
        console.error(`  ✗ 测试失败: ${error.message}`);
      }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('测试完成');
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('测试失败:', error);
    throw error;
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  testFormatPreservation()
    .then(() => {
      console.log('\n测试脚本执行完成');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n测试脚本执行失败:', error);
      process.exit(1);
    });
}

module.exports = { testFormatPreservation };
