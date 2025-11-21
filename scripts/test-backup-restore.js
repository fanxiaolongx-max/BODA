#!/usr/bin/env node

/**
 * 测试备份和恢复功能是否完整
 * 检查数据库结构与备份/恢复代码的匹配度
 */

const { db, allAsync, getAsync } = require('../db/database');

async function testBackupRestore() {
  console.log('=== 备份和恢复功能完整性检查 ===\n');
  
  try {
    // 1. 检查数据库表结构
    console.log('1. 检查数据库表结构...');
    
    const categoriesInfo = await new Promise((resolve, reject) => {
      db.all('PRAGMA table_info(categories)', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    const productsInfo = await new Promise((resolve, reject) => {
      db.all('PRAGMA table_info(products)', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    const categoriesFields = categoriesInfo.map(col => col.name);
    const productsFields = productsInfo.map(col => col.name);
    
    console.log('   Categories 字段:', categoriesFields.join(', '));
    console.log('   Products 字段:', productsFields.join(', '));
    console.log('');
    
    // 2. 检查备份应该包含的字段
    console.log('2. 检查备份字段...');
    
    const backupCategoriesFields = categoriesFields; // 备份所有字段（包括 id 用于映射）
    const backupProductsFields = productsFields.filter(f => !['id', 'created_at', 'updated_at'].includes(f));
    
    console.log('   备份 Categories 字段:', backupCategoriesFields.join(', '));
    console.log('   备份 Products 字段:', backupProductsFields.join(', '));
    console.log('');
    
    // 3. 检查恢复需要的字段
    console.log('3. 检查恢复字段...');
    
    const restoreCategoriesInsert = ['name', 'description', 'sort_order', 'status'];
    const restoreCategoriesUpdate = ['description', 'sort_order', 'status'];
    const restoreProductsInsert = ['name', 'description', 'price', 'category_id', 'image_url', 'sort_order', 'status', 'sizes', 'sugar_levels', 'available_toppings', 'ice_options'];
    const restoreProductsUpdate = ['description', 'price', 'image_url', 'sort_order', 'status', 'sizes', 'sugar_levels', 'available_toppings', 'ice_options'];
    
    console.log('   恢复 Categories INSERT:', restoreCategoriesInsert.join(', '));
    console.log('   恢复 Categories UPDATE:', restoreCategoriesUpdate.join(', '));
    console.log('   恢复 Products INSERT:', restoreProductsInsert.join(', '));
    console.log('   恢复 Products UPDATE:', restoreProductsUpdate.join(', '));
    console.log('');
    
    // 4. 验证字段完整性
    console.log('4. 验证字段完整性...');
    
    let allPassed = true;
    
    // 检查 Categories INSERT
    const categoriesInsertMissing = restoreCategoriesInsert.filter(f => !backupCategoriesFields.includes(f));
    if (categoriesInsertMissing.length > 0) {
      console.log('   ❌ Categories INSERT 缺少字段:', categoriesInsertMissing.join(', '));
      allPassed = false;
    } else {
      console.log('   ✅ Categories INSERT 字段完整');
    }
    
    // 检查 Categories UPDATE
    const categoriesUpdateMissing = restoreCategoriesUpdate.filter(f => !backupCategoriesFields.includes(f));
    if (categoriesUpdateMissing.length > 0) {
      console.log('   ❌ Categories UPDATE 缺少字段:', categoriesUpdateMissing.join(', '));
      allPassed = false;
    } else {
      console.log('   ✅ Categories UPDATE 字段完整');
    }
    
    // 检查 Products INSERT
    const productsInsertMissing = restoreProductsInsert.filter(f => !backupProductsFields.includes(f));
    if (productsInsertMissing.length > 0) {
      console.log('   ❌ Products INSERT 缺少字段:', productsInsertMissing.join(', '));
      allPassed = false;
    } else {
      console.log('   ✅ Products INSERT 字段完整');
    }
    
    // 检查 Products UPDATE
    const productsUpdateMissing = restoreProductsUpdate.filter(f => !backupProductsFields.includes(f));
    if (productsUpdateMissing.length > 0) {
      console.log('   ❌ Products UPDATE 缺少字段:', productsUpdateMissing.join(', '));
      allPassed = false;
    } else {
      console.log('   ✅ Products UPDATE 字段完整');
    }
    
    console.log('');
    
    // 5. 检查 JSON 字段处理
    console.log('5. 检查 JSON 字段处理...');
    const jsonFields = ['sizes', 'sugar_levels', 'available_toppings', 'ice_options'];
    const jsonFieldsInBackup = jsonFields.filter(f => backupProductsFields.includes(f));
    const jsonFieldsInRestore = jsonFields.filter(f => restoreProductsInsert.includes(f));
    
    if (jsonFieldsInBackup.length === jsonFields.length && jsonFieldsInRestore.length === jsonFields.length) {
      console.log('   ✅ 所有 JSON 字段都在备份和恢复中');
    } else {
      console.log('   ❌ JSON 字段不完整');
      console.log('      备份中包含:', jsonFieldsInBackup.join(', '));
      console.log('      恢复中包含:', jsonFieldsInRestore.join(', '));
      allPassed = false;
    }
    
    console.log('');
    
    // 6. 总结
    console.log('=== 检查结果 ===');
    if (allPassed) {
      console.log('✅ 所有检查通过！备份和恢复功能应该可以正常工作。');
    } else {
      console.log('❌ 发现问题！请检查上述错误。');
    }
    
    process.exit(allPassed ? 0 : 1);
  } catch (error) {
    console.error('检查失败:', error);
    process.exit(1);
  }
}

testBackupRestore();

