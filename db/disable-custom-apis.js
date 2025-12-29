const { getAsync, runAsync, allAsync, waitForDbReady } = require('./database');

/**
 * 停用指定的自定义API
 * 将这些API的状态设置为 'inactive'（保留数据，可恢复）
 */
async function disableCustomApis() {
  await waitForDbReady();
  
  try {
    // 要停用的API路径列表
    const apiPathsToDisable = [
      '/second-hand',
      '/exchange-rate',
      '/weather',
      '/translation',
      '/feedback'
    ];
    
    console.log('开始停用自定义API...\n');
    
    // 查询当前状态
    const currentApis = await allAsync(`
      SELECT id, name, path, method, status
      FROM custom_apis
      WHERE path IN (${apiPathsToDisable.map(() => '?').join(',')})
      ORDER BY path, method
    `, apiPathsToDisable);
    
    if (currentApis.length === 0) {
      console.log('ℹ️  未找到要停用的API，可能已经停用或不存在');
      return;
    }
    
    console.log(`找到 ${currentApis.length} 个API记录：\n`);
    currentApis.forEach(api => {
      console.log(`  - ${api.path} (${api.method}): ${api.name} [${api.status}]`);
    });
    console.log('');
    
    // 只停用状态为 'active' 的API
    const activeApis = currentApis.filter(api => api.status === 'active');
    
    if (activeApis.length === 0) {
      console.log('ℹ️  所有API已经停用，无需操作');
      return;
    }
    
    console.log(`准备停用 ${activeApis.length} 个活跃的API...\n`);
    
    let disabledCount = 0;
    
    for (const api of activeApis) {
      await runAsync(
        `UPDATE custom_apis 
         SET status = 'inactive', updated_at = datetime('now', 'localtime')
         WHERE id = ?`,
        [api.id]
      );
      disabledCount++;
      console.log(`✅ 已停用: ${api.path} (${api.method}) - ${api.name}`);
    }
    
    console.log(`\n✅ 完成！共停用 ${disabledCount} 个API`);
    console.log('\n替代API：');
    console.log('  - 二手集市: GET /api/blog/posts?category=二手市场');
    console.log('  - 汇率查询: GET /api/blog/posts?category=汇率转换');
    console.log('  - 天气信息: GET /api/blog/posts?category=天气路况');
    console.log('  - 翻译卡片: GET /api/blog/posts?category=翻译卡片');
    console.log('  - 反馈提交: POST /api/user/feedback');
    console.log('\n详细文档请查看: docs/API_MIGRATION.md');
    
  } catch (error) {
    console.error('❌ 停用API失败:', error);
    throw error;
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  disableCustomApis()
    .then(() => {
      console.log('\n迁移完成');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n迁移失败:', error);
      process.exit(1);
    });
}

module.exports = { disableCustomApis };

