const { getAsync, allAsync } = require('./database');
const { waitForDbReady } = require('./database');
const fs = require('fs');
const path = require('path');

// 测试删除图片的逻辑
const testImageUrl = 'https://bobapro.life/uploads/images/2025/12/1766945035882-nne7wp4.jpg';

/**
 * 将URL转换为本地文件路径
 */
function urlToLocalPath(url) {
  if (!url || typeof url !== 'string') {
    return null;
  }
  
  const DATA_DIR = fs.existsSync('/data') ? '/data' : path.join(__dirname, '..');
  let filePath = url;
  
  try {
    const urlObj = new URL(url);
    filePath = urlObj.pathname;
  } catch (e) {
    // 如果不是完整URL，直接使用
  }
  
  if (filePath.startsWith('/')) {
    filePath = filePath.substring(1);
  }
  
  if (filePath.startsWith('uploads/')) {
    return path.join(DATA_DIR, filePath);
  }
  
  const uploadsMatch = filePath.match(/uploads\/.+$/);
  if (uploadsMatch) {
    return path.join(DATA_DIR, uploadsMatch[0]);
  }
  
  return null;
}

async function testDeleteLogic() {
  try {
    console.log('='.repeat(80));
    console.log('测试图片删除逻辑');
    console.log('='.repeat(80));
    console.log(`测试图片URL: ${testImageUrl}\n`);
    
    // 1. 转换路径
    const imagePath = urlToLocalPath(testImageUrl);
    console.log(`1. 路径转换:`);
    console.log(`   本地路径: ${imagePath}`);
    console.log(`   文件存在: ${imagePath ? fs.existsSync(imagePath) : 'N/A'}\n`);
    
    // 2. 检查数据库中是否有文章引用这个图片
    console.log(`2. 检查数据库引用:`);
    const postsWithImage = await allAsync(`
      SELECT id, name, image 
      FROM blog_posts 
      WHERE image LIKE ?
    `, [`%1766945035882-nne7wp4.jpg%`]);
    
    const postsWithHtml = await allAsync(`
      SELECT id, name, html_content 
      FROM blog_posts 
      WHERE html_content LIKE ?
    `, [`%1766945035882-nne7wp4.jpg%`]);
    
    console.log(`   在image字段中找到: ${postsWithImage.length} 篇文章`);
    postsWithImage.forEach(p => {
      console.log(`     - ID: ${p.id}, Name: ${p.name || 'N/A'}`);
      console.log(`       Image: ${p.image}`);
    });
    
    console.log(`   在html_content字段中找到: ${postsWithHtml.length} 篇文章`);
    postsWithHtml.forEach(p => {
      console.log(`     - ID: ${p.id}, Name: ${p.name || 'N/A'}`);
    });
    
    // 3. 如果文件存在且没有被引用，可以安全删除
    console.log(`\n3. 结论:`);
    if (imagePath && fs.existsSync(imagePath)) {
      const stat = fs.statSync(imagePath);
      const sizeMB = (stat.size / (1024 * 1024)).toFixed(2);
      console.log(`   文件存在，大小: ${sizeMB} MB`);
      
      if (postsWithImage.length === 0 && postsWithHtml.length === 0) {
        console.log(`   ✅ 文件没有被任何文章引用，可以安全删除`);
        console.log(`   删除命令: rm "${imagePath}"`);
      } else {
        console.log(`   ⚠️  文件仍被 ${postsWithImage.length + postsWithHtml.length} 篇文章引用`);
      }
    } else {
      console.log(`   ❌ 文件不存在或路径转换失败`);
    }
    
    console.log('\n' + '='.repeat(80));
    
  } catch (error) {
    console.error('测试失败:', error);
  }
}

if (require.main === module) {
  waitForDbReady()
    .then(() => testDeleteLogic())
    .then(() => process.exit(0))
    .catch(error => {
      console.error('执行失败:', error);
      process.exit(1);
    });
}

module.exports = { testDeleteLogic };

