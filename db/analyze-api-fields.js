/**
 * 分析所有API的字段结构，找出需要定制的字段
 */

const { getAsync, allAsync } = require('./database');
const { waitForDbReady } = require('./database');
const { logger } = require('../utils/logger');

// 标准字段（不需要定制）
const STANDARD_FIELDS = ['id', 'name', 'title', 'slug', 'excerpt', 'description', 'htmlContent', 'image', 'category', 'tags', 'published', 'views', 'createdAt', 'updatedAt', 'detailApi'];

// 需要定制的特殊字段
const CUSTOM_FIELDS = ['price', 'rooms', 'area', 'views', 'contact', 'address', 'latitude', 'longitude', 'type', 'temperature', 'visibility', 'uvIndex', 'windSpeed', 'suggestion'];

async function analyzeApiFields() {
  await waitForDbReady();
  
  try {
    console.log('开始分析所有API的字段结构...\n');
    
    // 获取所有GET方法的active API
    const apis = await allAsync(`
      SELECT id, name, path, response_content, updated_at
      FROM custom_apis
      WHERE method = 'GET' AND status = 'active'
      ORDER BY name ASC
    `);
    
    console.log(`找到 ${apis.length} 个API\n`);
    console.log('='.repeat(80));
    console.log('');
    
    const apiFieldMap = {};
    
    for (const api of apis) {
      console.log(`\n【${api.name}】 (ID: ${api.id}, Path: ${api.path})`);
      console.log('-'.repeat(80));
      
      try {
        const content = JSON.parse(api.response_content);
        
        // 判断是数组还是对象
        let items = [];
        if (Array.isArray(content)) {
          items = content;
        } else if (content.data && Array.isArray(content.data)) {
          items = content.data;
        } else if (typeof content === 'object') {
          // 单个对象，也作为数组处理
          items = [content];
        }
        
        if (items.length === 0) {
          console.log('  ⚠ 无数据项');
          continue;
        }
        
        // 分析第一个数据项的字段
        const firstItem = items[0];
        const allFields = Object.keys(firstItem);
        
        // 找出需要定制的字段（不在标准字段中的）
        const customFields = allFields.filter(field => 
          !STANDARD_FIELDS.includes(field) && 
          !field.startsWith('_') && // 排除内部字段
          field !== 'htmlContent' // 排除htmlContent
        );
        
        // 找出已知的特殊字段
        const specialFields = customFields.filter(field => CUSTOM_FIELDS.includes(field));
        const otherFields = customFields.filter(field => !CUSTOM_FIELDS.includes(field));
        
        console.log(`  数据项数量: ${items.length}`);
        console.log(`  总字段数: ${allFields.length}`);
        console.log(`  标准字段: ${allFields.filter(f => STANDARD_FIELDS.includes(f)).join(', ') || '无'}`);
        
        if (specialFields.length > 0) {
          console.log(`  ✅ 需要定制的特殊字段: ${specialFields.join(', ')}`);
          apiFieldMap[api.name] = {
            id: api.id,
            path: api.path,
            specialFields: specialFields,
            otherFields: otherFields,
            allCustomFields: customFields
          };
        }
        
        if (otherFields.length > 0) {
          console.log(`  ⚠ 其他非标准字段: ${otherFields.join(', ')}`);
          if (!apiFieldMap[api.name]) {
            apiFieldMap[api.name] = {
              id: api.id,
              path: api.path,
              specialFields: [],
              otherFields: otherFields,
              allCustomFields: customFields
            };
          }
        }
        
        // 显示第一个数据项的字段示例
        if (specialFields.length > 0 || otherFields.length > 0) {
          console.log(`\n  字段示例（第一个数据项）:`);
          [...specialFields, ...otherFields].forEach(field => {
            const value = firstItem[field];
            const valueType = Array.isArray(value) ? 'array' : typeof value;
            const valuePreview = typeof value === 'string' 
              ? (value.length > 50 ? value.substring(0, 50) + '...' : value)
              : (typeof value === 'object' ? JSON.stringify(value).substring(0, 50) + '...' : value);
            console.log(`    - ${field}: ${valueType} = ${valuePreview}`);
          });
        }
        
        if (specialFields.length === 0 && otherFields.length === 0) {
          console.log('  ✓ 无需要定制的字段（使用标准字段）');
        }
        
      } catch (e) {
        console.error(`  ✗ 解析response_content失败: ${e.message}`);
      }
    }
    
    // 汇总报告
    console.log('\n');
    console.log('='.repeat(80));
    console.log('汇总报告：需要定制字段的API');
    console.log('='.repeat(80));
    
    const apisWithCustomFields = Object.keys(apiFieldMap).filter(name => 
      apiFieldMap[name].specialFields.length > 0 || apiFieldMap[name].otherFields.length > 0
    );
    
    if (apisWithCustomFields.length === 0) {
      console.log('\n✓ 所有API都使用标准字段，无需定制');
    } else {
      console.log(`\n找到 ${apisWithCustomFields.length} 个需要定制字段的API:\n`);
      
      apisWithCustomFields.forEach(apiName => {
        const info = apiFieldMap[apiName];
        console.log(`【${apiName}】`);
        console.log(`  API ID: ${info.id}`);
        console.log(`  Path: ${info.path}`);
        if (info.specialFields.length > 0) {
          console.log(`  需要定制的特殊字段: ${info.specialFields.join(', ')}`);
        }
        if (info.otherFields.length > 0) {
          console.log(`  其他非标准字段: ${info.otherFields.join(', ')}`);
        }
        console.log('');
      });
      
      // 按字段类型分组
      console.log('\n按字段类型分组:');
      const fieldGroups = {};
      apisWithCustomFields.forEach(apiName => {
        const info = apiFieldMap[apiName];
        info.allCustomFields.forEach(field => {
          if (!fieldGroups[field]) {
            fieldGroups[field] = [];
          }
          fieldGroups[field].push(apiName);
        });
      });
      
      Object.keys(fieldGroups).sort().forEach(field => {
        console.log(`  - ${field}: ${fieldGroups[field].join(', ')}`);
      });
    }
    
    console.log('\n分析完成！');
  } catch (error) {
    console.error('分析失败:', error);
    throw error;
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  analyzeApiFields()
    .then(() => {
      console.log('\n脚本执行完成！');
      process.exit(0);
    })
    .catch(error => {
      console.error('脚本执行失败:', error);
      process.exit(1);
    });
}

module.exports = { analyzeApiFields };
