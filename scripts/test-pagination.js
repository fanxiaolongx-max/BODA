/**
 * 测试自定义API分页功能
 * 
 * 使用方法：
 * 1. 确保服务器正在运行
 * 2. 在管理后台创建一个测试API：
 *    - 路径: /rentals
 *    - 方法: GET
 *    - 返回内容: 一个包含100条记录的JSON数组（见下方示例）
 * 3. 运行: node scripts/test-pagination.js
 */

const http = require('http');

// 配置
const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';
const TEST_API_PATH = '/rentals'; // 测试API路径

// 生成测试数据（100条记录）
function generateTestData(count = 100) {
  const data = [];
  for (let i = 1; i <= count; i++) {
    data.push({
      id: i,
      title: `Rental Item ${i}`,
      description: `Description for item ${i}`,
      price: (Math.random() * 100).toFixed(2),
      status: i % 3 === 0 ? 'available' : 'rented'
    });
  }
  return data;
}

// 发送HTTP请求
function makeRequest(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + path);
    
    // 添加查询参数
    if (options.query) {
      Object.keys(options.query).forEach(key => {
        url.searchParams.append(key, options.query[key]);
      });
    }

    const req = http.request(url, {
      method: options.method || 'GET',
      headers: options.headers || {}
    }, (res) => {
      let data = '';
      res.on('data', chunk => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: jsonData
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: data
          });
        }
      });
    });

    req.on('error', reject);
    
    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    
    req.end();
  });
}

// 打印测试结果
function printTestResult(testName, passed, details = '') {
  const status = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`${status} - ${testName}`);
  if (details) {
    console.log(`   ${details}`);
  }
}

// 检查服务器是否运行
async function checkServer() {
  try {
    const response = await makeRequest('/api/public/settings');
    return response.status === 200;
  } catch (error) {
    return false;
  }
}

// 测试函数
async function runTests() {
  console.log('='.repeat(60));
  console.log('自定义API分页功能测试');
  console.log('='.repeat(60));
  console.log('');

  // 检查服务器是否运行
  console.log('🔍 检查服务器连接...');
  const serverRunning = await checkServer();
  if (!serverRunning) {
    console.log(`❌ 无法连接到服务器: ${BASE_URL}`);
    console.log('   请确保服务器正在运行');
    process.exit(1);
  }
  console.log(`✅ 服务器连接正常: ${BASE_URL}`);
  console.log('');

  // 生成测试数据
  const testData = generateTestData(100);
  const testDataJson = JSON.stringify(testData);

  console.log('📝 测试数据准备:');
  console.log(`   - 总记录数: ${testData.length}`);
  console.log(`   - 测试API路径: /api/custom${TEST_API_PATH}`);
  console.log('');

  // 检查API是否存在
  console.log('🔍 检查测试API是否存在...');
  let apiExists = false;
  try {
    const response = await makeRequest(`/api/custom${TEST_API_PATH}`);
    if (response.status === 200 || response.status === 401) {
      apiExists = true;
      console.log('✅ 测试API存在');
    } else if (response.status === 404) {
      console.log('❌ 测试API不存在');
      console.log('');
      console.log('📋 请先在管理后台创建测试API:');
      console.log('   1. 登录管理后台');
      console.log('   2. 进入 "Custom APIs" 页面');
      console.log('   3. 点击 "Add Custom API"');
      console.log(`   4. 设置路径: ${TEST_API_PATH}`);
      console.log('   5. 设置方法: GET');
      console.log('   6. 设置返回内容（复制以下JSON）:');
      console.log('');
      console.log(testDataJson);
      console.log('');
      console.log('   7. 保存后重新运行此测试脚本');
      process.exit(1);
    }
  } catch (error) {
    console.log(`❌ 检查API时出错: ${error.message}`);
    process.exit(1);
  }
  console.log('');

  // 测试1: 无分页参数（应该返回原始数据）
  console.log('测试1: 无分页参数（向后兼容性）');
  try {
    const response = await makeRequest(`/api/custom${TEST_API_PATH}`);
    if (response.status === 200) {
      const isArray = Array.isArray(response.body);
      const hasDataField = response.body && typeof response.body === 'object' && 'data' in response.body;
      printTestResult('无分页参数测试', isArray || hasDataField, 
        `返回类型: ${isArray ? '数组' : '对象'}`);
    } else {
      printTestResult('无分页参数测试', false, `状态码: ${response.status}`);
    }
  } catch (error) {
    printTestResult('无分页参数测试', false, `错误: ${error.message}`);
  }
  console.log('');

  // 测试2: 第一页，每页20条（带元数据格式）
  console.log('测试2: 第一页，每页20条（默认格式）');
  try {
    const response = await makeRequest(`/api/custom${TEST_API_PATH}`, {
      query: { page: 1, pageSize: 20 }
    });
    if (response.status === 200) {
      const hasData = response.body && 'data' in response.body;
      const hasTotal = response.body && 'total' in response.body;
      const hasHasMore = response.body && 'hasMore' in response.body;
      const dataLength = hasData ? response.body.data.length : 0;
      const total = hasTotal ? response.body.total : 0;
      const hasMore = hasHasMore ? response.body.hasMore : null;
      
      const passed = hasData && hasTotal && hasHasMore && dataLength === 20 && total === 100 && hasMore === true;
      printTestResult('第一页分页测试', passed, 
        `data长度: ${dataLength}, total: ${total}, hasMore: ${hasMore}`);
    } else {
      printTestResult('第一页分页测试', false, `状态码: ${response.status}`);
    }
  } catch (error) {
    printTestResult('第一页分页测试', false, `错误: ${error.message}`);
  }
  console.log('');

  // 测试3: 第二页，每页20条
  console.log('测试3: 第二页，每页20条');
  try {
    const response = await makeRequest(`/api/custom${TEST_API_PATH}`, {
      query: { page: 2, pageSize: 20 }
    });
    if (response.status === 200) {
      const hasData = response.body && 'data' in response.body;
      const dataLength = hasData ? response.body.data.length : 0;
      const firstId = hasData && response.body.data.length > 0 ? response.body.data[0].id : null;
      const passed = hasData && dataLength === 20 && firstId === 21;
      printTestResult('第二页分页测试', passed, 
        `data长度: ${dataLength}, 第一条记录ID: ${firstId}`);
    } else {
      printTestResult('第二页分页测试', false, `状态码: ${response.status}`);
    }
  } catch (error) {
    printTestResult('第二页分页测试', false, `错误: ${error.message}`);
  }
  console.log('');

  // 测试4: 最后一页
  console.log('测试4: 最后一页（第5页，每页20条）');
  try {
    const response = await makeRequest(`/api/custom${TEST_API_PATH}`, {
      query: { page: 5, pageSize: 20 }
    });
    if (response.status === 200) {
      const hasData = response.body && 'data' in response.body;
      const dataLength = hasData ? response.body.data.length : 0;
      const hasMore = response.body && 'hasMore' in response.body ? response.body.hasMore : null;
      const passed = hasData && dataLength === 20 && hasMore === false;
      printTestResult('最后一页测试', passed, 
        `data长度: ${dataLength}, hasMore: ${hasMore}`);
    } else {
      printTestResult('最后一页测试', false, `状态码: ${response.status}`);
    }
  } catch (error) {
    printTestResult('最后一页测试', false, `错误: ${error.message}`);
  }
  console.log('');

  // 测试5: 数组格式返回
  console.log('测试5: 数组格式返回（format=array）');
  try {
    const response = await makeRequest(`/api/custom${TEST_API_PATH}`, {
      query: { page: 1, pageSize: 20, format: 'array' }
    });
    if (response.status === 200) {
      const isArray = Array.isArray(response.body);
      const length = isArray ? response.body.length : 0;
      const passed = isArray && length === 20;
      printTestResult('数组格式测试', passed, 
        `返回类型: ${isArray ? '数组' : typeof response.body}, 长度: ${length}`);
    } else {
      printTestResult('数组格式测试', false, `状态码: ${response.status}`);
    }
  } catch (error) {
    printTestResult('数组格式测试', false, `错误: ${error.message}`);
  }
  console.log('');

  // 测试6: 边界情况 - 超出范围
  console.log('测试6: 边界情况 - 超出范围的页码');
  try {
    const response = await makeRequest(`/api/custom${TEST_API_PATH}`, {
      query: { page: 10, pageSize: 20 }
    });
    if (response.status === 200) {
      const hasData = response.body && 'data' in response.body;
      const dataLength = hasData ? response.body.data.length : 0;
      const hasMore = response.body && 'hasMore' in response.body ? response.body.hasMore : null;
      const passed = hasData && dataLength === 0 && hasMore === false;
      printTestResult('超出范围测试', passed, 
        `data长度: ${dataLength}, hasMore: ${hasMore}`);
    } else {
      printTestResult('超出范围测试', false, `状态码: ${response.status}`);
    }
  } catch (error) {
    printTestResult('超出范围测试', false, `错误: ${error.message}`);
  }
  console.log('');

  // 测试7: 对象格式（包含data字段）
  console.log('测试7: 对象格式（response_content包含data字段）');
  try {
    // 这个测试需要API返回的是 { data: [...], otherField: 'value' } 格式
    const response = await makeRequest(`/api/custom${TEST_API_PATH}`, {
      query: { page: 1, pageSize: 15 }
    });
    if (response.status === 200) {
      const hasData = response.body && 'data' in response.body;
      const dataLength = hasData ? response.body.data.length : 0;
      const passed = hasData && dataLength === 15;
      printTestResult('对象格式测试', passed, 
        `data字段存在: ${hasData}, data长度: ${dataLength}`);
    } else {
      printTestResult('对象格式测试', false, `状态码: ${response.status}`);
    }
  } catch (error) {
    printTestResult('对象格式测试', false, `错误: ${error.message}`);
  }
  console.log('');

  console.log('='.repeat(60));
  console.log('测试完成！');
  console.log('');
  console.log('💡 提示:');
  console.log('   如果API不存在，请先在管理后台创建测试API:');
  console.log(`   - 路径: ${TEST_API_PATH}`);
  console.log(`   - 方法: GET`);
  console.log(`   - 返回内容: ${testDataJson.substring(0, 100)}...`);
  console.log('='.repeat(60));
}

// 运行测试
if (require.main === module) {
  runTests().catch(error => {
    console.error('测试执行失败:', error);
    process.exit(1);
  });
}

module.exports = { runTests, generateTestData };
