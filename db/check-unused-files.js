const { allAsync } = require('./database');
const fs = require('fs');
const path = require('path');
const { logger } = require('../utils/logger');

// 支持的数据目录路径
const DATA_DIR = fs.existsSync('/data') ? '/data' : path.join(__dirname, '..');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

/**
 * 提取HTML内容中的所有图片和视频URL
 */
function extractMediaUrls(htmlContent) {
  if (!htmlContent || typeof htmlContent !== 'string') {
    return [];
  }
  
  const urls = [];
  
  // 提取img标签的src属性
  const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = imgRegex.exec(htmlContent)) !== null) {
    urls.push(match[1]);
  }
  
  // 提取video标签的src属性
  const videoSrcRegex = /<video[^>]+src=["']([^"']+)["'][^>]*>/gi;
  while ((match = videoSrcRegex.exec(htmlContent)) !== null) {
    urls.push(match[1]);
  }
  
  // 提取source标签的src属性（在video标签内）
  const sourceRegex = /<source[^>]+src=["']([^"']+)["'][^>]*>/gi;
  while ((match = sourceRegex.exec(htmlContent)) !== null) {
    urls.push(match[1]);
  }
  
  // 提取video标签的poster属性（封面图片）
  const posterRegex = /<video[^>]+poster=["']([^"']+)["'][^>]*>/gi;
  while ((match = posterRegex.exec(htmlContent)) !== null) {
    urls.push(match[1]);
  }
  
  return urls;
}

/**
 * 将URL转换为本地文件路径
 */
function urlToLocalPath(url) {
  if (!url || typeof url !== 'string') {
    return null;
  }
  
  // 移除协议和域名，只保留路径部分
  let filePath = url;
  
  // 如果是完整URL，提取路径部分
  try {
    const urlObj = new URL(url);
    filePath = urlObj.pathname;
  } catch (e) {
    // 如果不是完整URL，直接使用
  }
  
  // 移除开头的斜杠
  if (filePath.startsWith('/')) {
    filePath = filePath.substring(1);
  }
  
  // 检查是否是uploads目录下的文件
  if (filePath.startsWith('uploads/')) {
    return path.join(DATA_DIR, filePath);
  }
  
  // 如果路径包含uploads，尝试提取
  const uploadsMatch = filePath.match(/uploads\/.+$/);
  if (uploadsMatch) {
    return path.join(DATA_DIR, uploadsMatch[0]);
  }
  
  return null;
}

/**
 * 递归获取目录下所有文件
 */
function getAllFiles(dir, fileList = []) {
  if (!fs.existsSync(dir)) {
    return fileList;
  }
  
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      getAllFiles(filePath, fileList);
    } else {
      fileList.push(filePath);
    }
  });
  
  return fileList;
}

/**
 * 检查未使用的文件
 */
async function checkUnusedFiles() {
  try {
    console.log('开始检查未使用的文件...\n');
    
    // 1. 获取所有文章
    const posts = await allAsync(`
      SELECT id, name, image, html_content
      FROM blog_posts
    `);
    
    console.log(`找到 ${posts.length} 篇文章\n`);
    
    // 2. 收集所有被引用的文件路径
    const referencedFiles = new Set();
    
    for (const post of posts) {
      // 文章封面图片（image字段）
      const coverImage = post.image || post.image_url || post.coverImage || post.cover_image;
      if (coverImage && typeof coverImage === 'string' && coverImage.trim() !== '') {
        const imagePath = urlToLocalPath(coverImage);
        if (imagePath) {
          referencedFiles.add(imagePath);
        }
      }
      
      // HTML内容中的图片和视频
      if (post.html_content) {
        const mediaUrls = extractMediaUrls(post.html_content);
        for (const url of mediaUrls) {
          const mediaPath = urlToLocalPath(url);
          if (mediaPath) {
            referencedFiles.add(mediaPath);
          }
        }
      }
    }
    
    console.log(`找到 ${referencedFiles.size} 个被引用的文件\n`);
    
    // 3. 获取uploads目录下所有文件
    const imagesDir = path.join(UPLOADS_DIR, 'images');
    const videosDir = path.join(UPLOADS_DIR, 'videos');
    
    const allFiles = [];
    if (fs.existsSync(imagesDir)) {
      getAllFiles(imagesDir, allFiles);
    }
    if (fs.existsSync(videosDir)) {
      getAllFiles(videosDir, allFiles);
    }
    
    console.log(`找到 ${allFiles.length} 个上传文件\n`);
    
    // 4. 找出未使用的文件
    const unusedFiles = [];
    const usedFiles = [];
    
    for (const filePath of allFiles) {
      // 规范化路径（处理Windows和Unix路径差异）
      const normalizedPath = path.normalize(filePath);
      let isUsed = false;
      
      // 检查是否被引用（支持多种路径格式）
      for (const refPath of referencedFiles) {
        const normalizedRefPath = path.normalize(refPath);
        if (normalizedPath === normalizedRefPath) {
          isUsed = true;
          break;
        }
      }
      
      if (isUsed) {
        usedFiles.push(filePath);
      } else {
        unusedFiles.push(filePath);
      }
    }
    
    // 5. 计算文件大小
    let totalUnusedSize = 0;
    const unusedFilesWithSize = unusedFiles.map(filePath => {
      const stat = fs.statSync(filePath);
      const size = stat.size;
      totalUnusedSize += size;
      return {
        path: filePath,
        size: size,
        sizeMB: (size / (1024 * 1024)).toFixed(2)
      };
    });
    
    // 6. 输出结果
    console.log('='.repeat(80));
    console.log('检查结果');
    console.log('='.repeat(80));
    console.log(`总文件数: ${allFiles.length}`);
    console.log(`已使用文件数: ${usedFiles.length}`);
    console.log(`未使用文件数: ${unusedFiles.length}`);
    console.log(`未使用文件总大小: ${(totalUnusedSize / (1024 * 1024)).toFixed(2)} MB`);
    console.log('='.repeat(80));
    
    if (unusedFiles.length > 0) {
      console.log('\n未使用的文件列表（前20个）:');
      console.log('-'.repeat(80));
      unusedFilesWithSize
        .sort((a, b) => b.size - a.size) // 按大小排序
        .slice(0, 20)
        .forEach((file, index) => {
          const relativePath = path.relative(DATA_DIR, file.path);
          console.log(`${index + 1}. ${relativePath} (${file.sizeMB} MB)`);
        });
      
      if (unusedFiles.length > 20) {
        console.log(`... 还有 ${unusedFiles.length - 20} 个文件未显示`);
      }
      
      console.log('\n提示: 可以使用以下命令删除未使用的文件:');
      console.log(`node db/cleanup-unused-files.js`);
    } else {
      console.log('\n✅ 没有发现未使用的文件！');
    }
    
    return {
      totalFiles: allFiles.length,
      usedFiles: usedFiles.length,
      unusedFiles: unusedFiles.length,
      unusedSizeMB: (totalUnusedSize / (1024 * 1024)).toFixed(2),
      unusedFilesList: unusedFilesWithSize
    };
  } catch (error) {
    logger.error('检查未使用文件失败', { error: error.message });
    console.error('检查失败:', error.message);
    throw error;
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  const { waitForDbReady } = require('./database');
  
  waitForDbReady()
    .then(() => checkUnusedFiles())
    .then(() => {
      console.log('\n检查完成！');
      process.exit(0);
    })
    .catch(error => {
      console.error('执行失败:', error);
      process.exit(1);
    });
}

module.exports = { checkUnusedFiles };

