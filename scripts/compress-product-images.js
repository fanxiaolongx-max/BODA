#!/usr/bin/env node

/**
 * 批量压缩产品图片脚本
 * 用于压缩现有的产品图片，减小文件大小
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// 支持 fly.io 持久化卷
const DATA_DIR = fs.existsSync('/data') ? '/data' : path.join(__dirname, '..');
const productsDir = path.join(DATA_DIR, 'uploads/products');

// 图片压缩配置
const MAX_WIDTH = 200;
const MAX_HEIGHT = 200;
const JPEG_QUALITY = 80;
const MIN_SIZE_TO_COMPRESS = 50 * 1024; // 小于 50KB 的图片不压缩

async function compressImage(imagePath) {
  try {
    const stats = await fs.promises.stat(imagePath);
    const originalSize = stats.size;
    
    // 如果文件已经很小，跳过
    if (originalSize < MIN_SIZE_TO_COMPRESS) {
      return { 
        file: path.basename(imagePath), 
        skipped: true, 
        reason: 'File already small',
        originalSize 
      };
    }
    
    // 读取图片信息
    const metadata = await sharp(imagePath).metadata();
    
    // 如果图片尺寸已经很小，且文件也不大，跳过
    if (metadata.width <= MAX_WIDTH && metadata.height <= MAX_HEIGHT && originalSize < 100 * 1024) {
      return { 
        file: path.basename(imagePath), 
        skipped: true, 
        reason: 'Image already small',
        originalSize 
      };
    }
    
    // 压缩图片
    const compressedBuffer = await sharp(imagePath)
      .resize(MAX_WIDTH, MAX_HEIGHT, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toBuffer();
    
    const finalSize = compressedBuffer.length;
    
    // 如果压缩后反而更大，不覆盖原文件
    if (finalSize >= originalSize) {
      return { 
        file: path.basename(imagePath), 
        skipped: true, 
        reason: 'Compressed size not smaller',
        originalSize,
        finalSize 
      };
    }
    
    // 覆盖原文件
    await fs.promises.writeFile(imagePath, compressedBuffer);
    
    const compressionRatio = ((1 - finalSize / originalSize) * 100).toFixed(1);
    
    return {
      file: path.basename(imagePath),
      compressed: true,
      originalSize,
      finalSize,
      compressionRatio: `${compressionRatio}%`
    };
  } catch (error) {
    return {
      file: path.basename(imagePath),
      error: error.message
    };
  }
}

async function main() {
  console.log('开始批量压缩产品图片...\n');
  console.log(`图片目录: ${productsDir}\n`);
  
  // 检查目录是否存在
  if (!fs.existsSync(productsDir)) {
    console.error(`错误: 目录不存在 ${productsDir}`);
    process.exit(1);
  }
  
  // 读取所有图片文件
  const files = fs.readdirSync(productsDir).filter(file => {
    const ext = path.extname(file).toLowerCase();
    return ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext);
  });
  
  if (files.length === 0) {
    console.log('没有找到图片文件');
    process.exit(0);
  }
  
  console.log(`找到 ${files.length} 个图片文件\n`);
  
  const results = {
    total: files.length,
    compressed: 0,
    skipped: 0,
    errors: 0,
    totalOriginalSize: 0,
    totalFinalSize: 0
  };
  
  // 逐个处理图片
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const filePath = path.join(productsDir, file);
    
    process.stdout.write(`[${i + 1}/${files.length}] 处理 ${file}... `);
    
    const result = await compressImage(filePath);
    
    if (result.error) {
      results.errors++;
      console.log(`❌ 错误: ${result.error}`);
    } else if (result.skipped) {
      results.skipped++;
      console.log(`⏭️  跳过: ${result.reason}`);
      if (result.originalSize) {
        results.totalOriginalSize += result.originalSize;
        results.totalFinalSize += result.originalSize;
      }
    } else if (result.compressed) {
      results.compressed++;
      results.totalOriginalSize += result.originalSize;
      results.totalFinalSize += result.finalSize;
      console.log(`✅ 压缩完成: ${(result.originalSize / 1024).toFixed(2)} KB → ${(result.finalSize / 1024).toFixed(2)} KB (${result.compressionRatio})`);
    }
  }
  
  // 输出统计信息
  console.log('\n' + '='.repeat(60));
  console.log('压缩完成统计:');
  console.log('='.repeat(60));
  console.log(`总文件数: ${results.total}`);
  console.log(`压缩成功: ${results.compressed}`);
  console.log(`跳过: ${results.skipped}`);
  console.log(`错误: ${results.errors}`);
  console.log(`\n总原始大小: ${(results.totalOriginalSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`总压缩后大小: ${(results.totalFinalSize / 1024 / 1024).toFixed(2)} MB`);
  
  if (results.totalOriginalSize > 0) {
    const totalCompressionRatio = ((1 - results.totalFinalSize / results.totalOriginalSize) * 100).toFixed(1);
    console.log(`总体压缩率: ${totalCompressionRatio}%`);
    console.log(`节省空间: ${((results.totalOriginalSize - results.totalFinalSize) / 1024 / 1024).toFixed(2)} MB`);
  }
  console.log('='.repeat(60));
}

// 运行脚本
main().catch(error => {
  console.error('脚本执行失败:', error);
  process.exit(1);
});

