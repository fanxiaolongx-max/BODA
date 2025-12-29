const { checkUnusedFiles } = require('./check-unused-files');
const fs = require('fs');
const path = require('path');
const { logger } = require('../utils/logger');

/**
 * 清理未使用的文件
 */
async function cleanupUnusedFiles(dryRun = true) {
  try {
    console.log('开始清理未使用的文件...\n');
    
    if (dryRun) {
      console.log('⚠️  这是预览模式（dry-run），不会实际删除文件\n');
    } else {
      console.log('⚠️  这是实际删除模式，将永久删除文件！\n');
    }
    
    // 检查未使用的文件
    const result = await checkUnusedFiles();
    
    if (result.unusedFiles === 0) {
      console.log('\n✅ 没有需要清理的文件！');
      return;
    }
    
    console.log(`\n准备${dryRun ? '预览' : '删除'} ${result.unusedFiles} 个未使用的文件...\n`);
    
    let deletedCount = 0;
    let failedCount = 0;
    let totalFreedMB = 0;
    
    // 按大小排序，先删除大文件
    const sortedFiles = result.unusedFilesList.sort((a, b) => b.size - a.size);
    
    for (const file of sortedFiles) {
      try {
        if (!dryRun) {
          fs.unlinkSync(file.path);
          deletedCount++;
          totalFreedMB += parseFloat(file.sizeMB);
          console.log(`✅ 已删除: ${path.relative(process.cwd(), file.path)} (${file.sizeMB} MB)`);
        } else {
          console.log(`📋 将删除: ${path.relative(process.cwd(), file.path)} (${file.sizeMB} MB)`);
        }
      } catch (error) {
        failedCount++;
        console.error(`❌ 删除失败: ${file.path} - ${error.message}`);
      }
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('清理结果');
    console.log('='.repeat(80));
    if (dryRun) {
      console.log(`预览模式: 将删除 ${result.unusedFiles} 个文件`);
      console.log(`将释放空间: ${result.unusedSizeMB} MB`);
      console.log('\n要实际执行删除，请运行:');
      console.log('node db/cleanup-unused-files.js --execute');
    } else {
      console.log(`已删除文件数: ${deletedCount}`);
      console.log(`失败文件数: ${failedCount}`);
      console.log(`释放空间: ${totalFreedMB.toFixed(2)} MB`);
    }
    console.log('='.repeat(80));
    
  } catch (error) {
    logger.error('清理未使用文件失败', { error: error.message });
    console.error('清理失败:', error.message);
    throw error;
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  const { waitForDbReady } = require('./database');
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--execute');
  
  waitForDbReady()
    .then(() => cleanupUnusedFiles(dryRun))
    .then(() => {
      console.log('\n完成！');
      process.exit(0);
    })
    .catch(error => {
      console.error('执行失败:', error);
      process.exit(1);
    });
}

module.exports = { cleanupUnusedFiles };

