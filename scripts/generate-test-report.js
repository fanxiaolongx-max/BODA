const fs = require('fs');
const path = require('path');
const { getTestDescription } = require('./test-descriptions');

// 确保reports目录存在
const reportsDir = path.join(__dirname, '..', 'reports');
if (!fs.existsSync(reportsDir)) {
  fs.mkdirSync(reportsDir, { recursive: true });
}

// 读取测试结果JSON
const testResultsPath = path.join(reportsDir, 'test-results.json');
let testResults = null;
if (fs.existsSync(testResultsPath)) {
  try {
    testResults = JSON.parse(fs.readFileSync(testResultsPath, 'utf8'));
  } catch (error) {
    console.error('无法读取测试结果JSON:', error.message);
  }
}

// 读取覆盖率数据
const coveragePath = path.join(__dirname, '..', 'coverage', 'coverage-summary.json');
let coverageData = null;
if (fs.existsSync(coveragePath)) {
  try {
    coverageData = JSON.parse(fs.readFileSync(coveragePath, 'utf8'));
  } catch (error) {
    console.warn('无法读取覆盖率数据:', error.message);
  }
} else {
  // 尝试从lcov数据生成摘要（如果json-summary不存在）
  const lcovPath = path.join(__dirname, '..', 'coverage', 'lcov.info');
  if (fs.existsSync(lcovPath)) {
    console.warn('未找到coverage-summary.json，请运行 npm run test:coverage 生成覆盖率数据');
  }
}

// 生成HTML报告
function generateHTMLReport() {
  const timestamp = new Date().toLocaleString('zh-CN', { 
    year: 'numeric', 
    month: '2-digit', 
    day: '2-digit', 
    hour: '2-digit', 
    minute: '2-digit',
    second: '2-digit'
  });

  let html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>测试报告 - ${timestamp}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: #f5f5f5;
      color: #333;
      line-height: 1.6;
      padding: 20px;
    }
    .container {
      max-width: 1400px;
      margin: 0 auto;
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px;
      text-align: center;
    }
    .header h1 {
      font-size: 2.5em;
      margin-bottom: 10px;
    }
    .header .timestamp {
      opacity: 0.9;
      font-size: 1.1em;
    }
    .summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      padding: 30px;
      background: #f9f9f9;
    }
    .summary-card {
      background: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      text-align: center;
    }
    .summary-card h3 {
      font-size: 0.9em;
      color: #666;
      margin-bottom: 10px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .summary-card .value {
      font-size: 2.5em;
      font-weight: bold;
      margin-bottom: 5px;
    }
    .summary-card.passed .value { color: #10b981; }
    .summary-card.failed .value { color: #ef4444; }
    .summary-card.skipped .value { color: #f59e0b; }
    .summary-card.total .value { color: #3b82f6; }
    .summary-card .percentage {
      font-size: 0.9em;
      color: #666;
    }
    .section {
      padding: 30px;
      border-top: 1px solid #e5e5e5;
    }
    .section h2 {
      font-size: 1.8em;
      margin-bottom: 20px;
      color: #333;
      border-bottom: 2px solid #667eea;
      padding-bottom: 10px;
    }
    .test-suite {
      margin-bottom: 30px;
      background: #f9f9f9;
      border-radius: 8px;
      padding: 20px;
    }
    .test-suite-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 15px;
      padding-bottom: 10px;
      border-bottom: 1px solid #ddd;
    }
    .test-suite-name {
      font-size: 1.3em;
      font-weight: bold;
      color: #333;
    }
    .test-suite-stats {
      display: flex;
      gap: 15px;
      font-size: 0.9em;
    }
    .test-suite-stats span {
      padding: 5px 10px;
      border-radius: 4px;
      font-weight: bold;
    }
    .test-suite-stats .passed { background: #d1fae5; color: #065f46; }
    .test-suite-stats .failed { background: #fee2e2; color: #991b1b; }
    .test-suite-stats .skipped { background: #fef3c7; color: #92400e; }
    .test-item {
      padding: 12px;
      margin: 8px 0;
      background: white;
      border-radius: 6px;
      border-left: 4px solid #10b981;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .test-item.failed {
      border-left-color: #ef4444;
      background: #fef2f2;
    }
    .test-item.skipped {
      border-left-color: #f59e0b;
      background: #fffbeb;
    }
    .test-icon {
      font-size: 1.2em;
      font-weight: bold;
    }
    .test-item.passed .test-icon { color: #10b981; }
    .test-item.failed .test-icon { color: #ef4444; }
    .test-item.skipped .test-icon { color: #f59e0b; }
    .test-info {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .test-name {
      font-weight: 500;
      color: #333;
    }
    .test-description {
      font-size: 0.85em;
      color: #666;
      font-style: italic;
      line-height: 1.4;
    }
    .test-duration {
      color: #666;
      font-size: 0.9em;
      white-space: nowrap;
    }
    .error-details {
      margin-top: 15px;
      padding: 15px;
      background: #fee2e2;
      border-radius: 6px;
      border-left: 4px solid #ef4444;
    }
    .error-message {
      color: #991b1b;
      font-weight: bold;
      margin-bottom: 10px;
    }
    .error-stack {
      color: #7f1d1d;
      font-family: 'Courier New', monospace;
      font-size: 0.85em;
      white-space: pre-wrap;
      background: white;
      padding: 10px;
      border-radius: 4px;
      overflow-x: auto;
    }
    .coverage-section {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 20px;
      margin-top: 20px;
    }
    .coverage-card {
      background: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .coverage-card h3 {
      font-size: 1.1em;
      margin-bottom: 15px;
      color: #333;
    }
    .coverage-metric {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 0;
      border-bottom: 1px solid #e5e5e5;
    }
    .coverage-metric:last-child {
      border-bottom: none;
    }
    .coverage-metric-name {
      font-weight: 500;
      color: #666;
    }
    .coverage-metric-value {
      font-weight: bold;
      font-size: 1.1em;
    }
    .coverage-metric-value.high { color: #10b981; }
    .coverage-metric-value.medium { color: #f59e0b; }
    .coverage-metric-value.low { color: #ef4444; }
    .file-coverage {
      margin-top: 20px;
    }
    .file-coverage-item {
      padding: 12px;
      margin: 8px 0;
      background: #f9f9f9;
      border-radius: 6px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .file-coverage-name {
      font-family: 'Courier New', monospace;
      font-size: 0.9em;
      color: #333;
    }
    .file-coverage-bar {
      flex: 1;
      height: 8px;
      background: #e5e5e5;
      border-radius: 4px;
      margin: 0 15px;
      overflow: hidden;
    }
    .file-coverage-bar-fill {
      height: 100%;
      transition: width 0.3s;
    }
    .file-coverage-bar-fill.high { background: #10b981; }
    .file-coverage-bar-fill.medium { background: #f59e0b; }
    .file-coverage-bar-fill.low { background: #ef4444; }
    .file-coverage-percentage {
      font-weight: bold;
      min-width: 60px;
      text-align: right;
    }
    .no-data {
      text-align: center;
      padding: 40px;
      color: #666;
      font-style: italic;
    }
    .tabs {
      display: flex;
      gap: 10px;
      margin-bottom: 20px;
      border-bottom: 2px solid #e5e5e5;
    }
    .tab {
      padding: 12px 24px;
      background: none;
      border: none;
      cursor: pointer;
      font-size: 1em;
      color: #666;
      border-bottom: 2px solid transparent;
      margin-bottom: -2px;
      transition: all 0.3s;
    }
    .tab:hover {
      color: #667eea;
    }
    .tab.active {
      color: #667eea;
      border-bottom-color: #667eea;
      font-weight: bold;
    }
    .tab-content {
      display: none;
    }
    .tab-content.active {
      display: block;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🧪 测试报告</h1>
      <div class="timestamp">生成时间: ${timestamp}</div>
    </div>

    <div class="summary">
      ${generateSummaryCards()}
    </div>

    <div class="section">
      <div class="tabs">
        <button class="tab active" onclick="showTab('tests', event)">测试结果</button>
        <button class="tab" onclick="showTab('api', event)">API测试</button>
        <button class="tab" onclick="showTab('coverage', event)">代码覆盖率</button>
        <button class="tab" onclick="showTab('failures', event)">失败详情</button>
      </div>

      <div id="tests-tab" class="tab-content active">
        ${generateTestSuites()}
      </div>

      <div id="api-tab" class="tab-content">
        ${generateAPITestSection()}
      </div>

      <div id="coverage-tab" class="tab-content">
        ${generateCoverageSection()}
      </div>

      <div id="failures-tab" class="tab-content">
        ${generateFailuresSection()}
      </div>
    </div>
  </div>

  <script>
    function showTab(tabName, event) {
      // 隐藏所有标签内容
      document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
      });
      // 移除所有标签的active类
      document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
      });
      // 显示选中的标签内容
      document.getElementById(tabName + '-tab').classList.add('active');
      // 激活选中的标签
      if (event && event.target) {
        event.target.classList.add('active');
      }
    }
  </script>
</body>
</html>`;

  return html;
}

function generateSummaryCards() {
  if (!testResults) {
    return '<div class="no-data">暂无测试结果数据</div>';
  }

  const numPassedTests = testResults.numPassedTests || 0;
  const numFailedTests = testResults.numFailedTests || 0;
  const numPendingTests = testResults.numPendingTests || 0;
  const numTotalTests = testResults.numTotalTests || 0;
  const numTotalTestSuites = testResults.numTotalTestSuites || 0;
  const passRate = numTotalTests > 0 ? ((numPassedTests / numTotalTests) * 100).toFixed(1) : 0;

  return `
    <div class="summary-card passed">
      <h3>通过</h3>
      <div class="value">${numPassedTests}</div>
      <div class="percentage">${passRate}%</div>
    </div>
    <div class="summary-card failed">
      <h3>失败</h3>
      <div class="value">${numFailedTests}</div>
      <div class="percentage">${numTotalTests > 0 ? ((numFailedTests / numTotalTests) * 100).toFixed(1) : 0}%</div>
    </div>
    <div class="summary-card skipped">
      <h3>跳过</h3>
      <div class="value">${numPendingTests}</div>
      <div class="percentage">${numTotalTests > 0 ? ((numPendingTests / numTotalTests) * 100).toFixed(1) : 0}%</div>
    </div>
    <div class="summary-card total">
      <h3>总计</h3>
      <div class="value">${numTotalTests}</div>
      <div class="percentage">测试套件数: ${numTotalTestSuites}</div>
    </div>
  `;
}

// 提取测试套件的简短名称（去掉路径，只保留文件名）
function getShortSuiteName(fullName) {
  if (!fullName) return '未知';
  // 提取文件名（去掉路径和扩展名）
  const match = fullName.match(/([^/\\]+)\.test\.js$/);
  if (match) {
    return match[1];
  }
  // 如果没有匹配，尝试提取最后一部分
  const parts = fullName.split(/[/\\]/);
  return parts[parts.length - 1] || fullName;
}

function generateTestSuites() {
  if (!testResults || !testResults.testResults) {
    return '<div class="no-data">暂无测试套件数据</div>';
  }

  let html = '';
  testResults.testResults.forEach(suite => {
    // Jest JSON格式中，测试结果在assertionResults数组中，需要统计
    const suiteTests = suite.assertionResults || suite.testResults || [];
    const passed = suiteTests.filter(t => t.status === 'passed').length;
    const failed = suiteTests.filter(t => t.status === 'failed').length;
    const skipped = suiteTests.filter(t => t.status === 'pending' || t.status === 'skipped').length;
    const total = passed + failed + skipped;
    const shortName = getShortSuiteName(suite.name);

    html += `
      <div class="test-suite">
        <div class="test-suite-header">
          <div class="test-suite-name" title="${escapeHtml(suite.name)}">${escapeHtml(shortName)}</div>
          <div class="test-suite-stats">
            <span class="passed">✓ ${passed}</span>
            ${failed > 0 ? `<span class="failed">✗ ${failed}</span>` : ''}
            ${skipped > 0 ? `<span class="skipped">○ ${skipped}</span>` : ''}
          </div>
        </div>
    `;

    if (suiteTests.length > 0) {
      suiteTests.forEach(test => {
        const status = test.status;
        const duration = test.duration ? `(${test.duration} 毫秒)` : '';
        const icon = status === 'passed' ? '✓' : status === 'failed' ? '✗' : '○';
        
        // 获取测试描述
        const ancestorTitles = test.ancestorTitles || [];
        let suiteName = ancestorTitles[0] || shortName;
        let describeName = ancestorTitles[1] || '';
        let testDescription = getTestDescription(suiteName, describeName, test.title);
        
        // 如果找不到描述，尝试多种匹配方式
        if (testDescription === `测试: ${test.title}`) {
          // 尝试使用测试文件的完整路径来匹配
          const suitePathMatch = suite.name.match(/([^/\\]+)\.test\.js$/);
          if (suitePathMatch) {
            const fileBaseName = suitePathMatch[1];
            // 尝试匹配不同的套件名称格式
            const possibleSuiteNames = [
              fileBaseName.replace(/([A-Z])/g, ' $1').trim(), // camelCase to words
              fileBaseName,
              shortName
            ];
            
            for (const possibleSuite of possibleSuiteNames) {
              testDescription = getTestDescription(possibleSuite, describeName, test.title);
              if (testDescription !== `测试: ${test.title}`) {
                break;
              }
            }
          }
          
          // 如果仍然找不到，尝试在整个描述映射中搜索
          if (testDescription === `测试: ${test.title}`) {
            const testDescriptions = require('./test-descriptions');
            for (const [suiteKey, suiteData] of Object.entries(testDescriptions)) {
              if (typeof suiteData === 'object' && suiteData !== null && !suiteData.getTestDescription) {
                for (const [describeKey, describeData] of Object.entries(suiteData)) {
                  if (typeof describeData === 'object' && describeData !== null) {
                    if (describeData[test.title]) {
                      testDescription = describeData[test.title];
                      break;
                    }
                  }
                }
                if (testDescription !== `测试: ${test.title}`) break;
              }
            }
          }
        }
        
        html += `
          <div class="test-item ${status}">
            <span class="test-icon">${icon}</span>
            <div class="test-info">
              <span class="test-name">${escapeHtml(test.title)}</span>
              <span class="test-description">${escapeHtml(testDescription)}</span>
            </div>
            <span class="test-duration">${duration}</span>
          </div>
        `;

        if (status === 'failed' && test.failureMessages && test.failureMessages.length > 0) {
          html += `
            <div class="error-details">
              <div class="error-message">错误信息:</div>
              <div class="error-stack">${escapeHtml(test.failureMessages.join('\n\n'))}</div>
            </div>
          `;
        }
      });
    }

    html += `</div>`;
  });

  return html || '<div class="no-data">暂无测试数据</div>';
}

function generateCoverageSection() {
  if (!coverageData) {
    return '<div class="no-data">暂无覆盖率数据。请运行 <code>npm run test:coverage</code> 生成覆盖率报告。</div>';
  }

  const total = coverageData.total || coverageData;
  if (!total || !total.statements) {
    return '<div class="no-data">覆盖率数据格式不正确。请运行 <code>npm run test:coverage</code> 生成覆盖率报告。</div>';
  }

  const metrics = [
    { name: '语句覆盖率', value: total.statements, key: 'statements' },
    { name: '分支覆盖率', value: total.branches, key: 'branches' },
    { name: '函数覆盖率', value: total.functions, key: 'functions' },
    { name: '行覆盖率', value: total.lines, key: 'lines' }
  ];

  let html = '<div class="coverage-section">';
  
  metrics.forEach(metric => {
    const pct = metric.value.pct;
    const className = pct >= 80 ? 'high' : pct >= 60 ? 'medium' : 'low';
    
    html += `
      <div class="coverage-card">
        <h3>${metric.name}</h3>
        <div class="coverage-metric">
          <span class="coverage-metric-name">覆盖率</span>
          <span class="coverage-metric-value ${className}">${pct}%</span>
        </div>
        <div class="coverage-metric">
          <span class="coverage-metric-name">已覆盖</span>
          <span>${metric.value.covered}/${metric.value.total}</span>
        </div>
        <div class="coverage-metric">
          <span class="coverage-metric-name">未覆盖</span>
          <span>${metric.value.total - metric.value.covered}</span>
        </div>
      </div>
    `;
  });

  html += '</div>';

  // 文件级覆盖率
  if (coverageData && Object.keys(coverageData).length > 1) {
    html += '<div class="file-coverage"><h3>文件级覆盖率</h3>';
    
    const files = Object.keys(coverageData)
      .filter(key => key !== 'total')
      .map(key => ({
        name: key,
        ...coverageData[key]
      }))
      .sort((a, b) => {
        const aPct = a.lines ? a.lines.pct : 0;
        const bPct = b.lines ? b.lines.pct : 0;
        return aPct - bPct;
      });

    files.forEach(file => {
      const pct = file.lines ? file.lines.pct : 0;
      const className = pct >= 80 ? 'high' : pct >= 60 ? 'medium' : 'low';
      const covered = file.lines ? file.lines.covered : 0;
      const total = file.lines ? file.lines.total : 0;

      html += `
        <div class="file-coverage-item">
          <span class="file-coverage-name">${escapeHtml(file.name)}</span>
          <div class="file-coverage-bar">
            <div class="file-coverage-bar-fill ${className}" style="width: ${pct}%"></div>
          </div>
          <span class="file-coverage-percentage ${className}">${pct.toFixed(1)}%</span>
        </div>
      `;
    });

    html += '</div>';
  }

  return html;
}

function generateFailuresSection() {
  if (!testResults || !testResults.testResults) {
    return '<div class="no-data">暂无失败测试</div>';
  }

  const failures = [];
  testResults.testResults.forEach(suite => {
    // Jest JSON格式中，测试结果在assertionResults数组中
    const suiteTests = suite.assertionResults || suite.testResults || [];
    suiteTests.forEach(test => {
      if (test.status === 'failed') {
        failures.push({
          suite: suite.name,
          test: test.title || test.fullName,
          failures: test.failureMessages || []
        });
      }
    });
  });

  if (failures.length === 0) {
    return '<div class="no-data">🎉 所有测试都通过了！没有失败的测试。</div>';
  }

  let html = '';
  failures.forEach((failure, index) => {
    html += `
      <div class="test-suite" style="margin-bottom: 30px;">
        <div class="test-suite-header">
          <div class="test-suite-name">${index + 1}. ${escapeHtml(failure.suite)}</div>
        </div>
        <div class="test-item failed">
          <span class="test-icon">✗</span>
          <span class="test-name">${escapeHtml(failure.test)}</span>
        </div>
        ${failure.failures && failure.failures.length > 0 ? failure.failures.map(msg => `
          <div class="error-details">
            <div class="error-message">错误详情:</div>
            <div class="error-stack">${escapeHtml(stripAnsiCodes(msg))}</div>
          </div>
        `).join('') : '<div class="error-details"><div class="error-message">无详细错误信息</div></div>'}
      </div>
    `;
  });

  return html;
}

function generateAPITestSection() {
  if (!testResults || !testResults.testResults) {
    return '<div class="no-data">暂无API测试数据</div>';
  }

  // 筛选API测试（routes目录下的测试）
  const apiTestSuites = testResults.testResults.filter(suite => 
    suite.name && suite.name.includes('/routes/')
  );

  if (apiTestSuites.length === 0) {
    return '<div class="no-data">未找到API测试</div>';
  }

  // 统计API测试总数
  let totalPassed = 0;
  let totalFailed = 0;
  let totalSkipped = 0;
  let totalTests = 0;

  let html = '<div class="api-test-summary">';
  
  // 生成汇总统计
  apiTestSuites.forEach(suite => {
    const suiteTests = suite.assertionResults || suite.testResults || [];
    const passed = suiteTests.filter(t => t.status === 'passed').length;
    const failed = suiteTests.filter(t => t.status === 'failed').length;
    const skipped = suiteTests.filter(t => t.status === 'pending' || t.status === 'skipped').length;
    const total = passed + failed + skipped;
    
    totalPassed += passed;
    totalFailed += failed;
    totalSkipped += skipped;
    totalTests += total;
  });

  html += `
    <div class="api-summary-cards" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px;">
      <div class="summary-card passed">
        <h3>API测试通过</h3>
        <div class="value">${totalPassed}</div>
        <div class="percentage">${totalTests > 0 ? ((totalPassed / totalTests) * 100).toFixed(1) : 0}%</div>
      </div>
      <div class="summary-card failed">
        <h3>API测试失败</h3>
        <div class="value">${totalFailed}</div>
        <div class="percentage">${totalTests > 0 ? ((totalFailed / totalTests) * 100).toFixed(1) : 0}%</div>
      </div>
      <div class="summary-card skipped">
        <h3>API测试跳过</h3>
        <div class="value">${totalSkipped}</div>
        <div class="percentage">${totalTests > 0 ? ((totalSkipped / totalTests) * 100).toFixed(1) : 0}%</div>
      </div>
      <div class="summary-card total">
        <h3>API测试总计</h3>
        <div class="value">${totalTests}</div>
        <div class="percentage">测试套件数: ${apiTestSuites.length}</div>
      </div>
    </div>
  `;

  // 生成每个API测试套件的详细信息
  html += '<h3 style="margin-top: 30px; margin-bottom: 20px; color: #333;">API测试套件详情</h3>';
  
  apiTestSuites.forEach(suite => {
    const suiteTests = suite.assertionResults || suite.testResults || [];
    const passed = suiteTests.filter(t => t.status === 'passed').length;
    const failed = suiteTests.filter(t => t.status === 'failed').length;
    const skipped = suiteTests.filter(t => t.status === 'pending' || t.status === 'skipped').length;
    const total = passed + failed + skipped;
    const shortName = getShortSuiteName(suite.name);
    const statusClass = failed > 0 ? 'failed' : 'passed';

    html += `
      <div class="test-suite" style="margin-bottom: 20px;">
        <div class="test-suite-header">
          <div class="test-suite-name ${statusClass}" title="${escapeHtml(suite.name)}">
            ${escapeHtml(shortName)}
          </div>
          <div class="test-suite-stats">
            <span class="passed">✓ ${passed}</span>
            ${failed > 0 ? `<span class="failed">✗ ${failed}</span>` : ''}
            ${skipped > 0 ? `<span class="skipped">○ ${skipped}</span>` : ''}
            <span style="color: #666; margin-left: 10px;">总计: ${total} 个测试</span>
          </div>
        </div>
    `;

    if (suiteTests.length > 0) {
      // 只显示前20个测试，避免过长
      const displayTests = suiteTests.slice(0, 20);
      displayTests.forEach(test => {
        const status = test.status;
        const duration = test.duration ? `(${test.duration} 毫秒)` : '';
        const icon = status === 'passed' ? '✓' : status === 'failed' ? '✗' : '○';
        
        // 获取测试描述
        const ancestorTitles = test.ancestorTitles || [];
        let suiteName = ancestorTitles[0] || shortName;
        let describeName = ancestorTitles[1] || '';
        let testDescription = getTestDescription(suiteName, describeName, test.title);
        
        // 如果找不到描述，尝试多种匹配方式
        if (testDescription === `测试: ${test.title}`) {
          // 尝试使用测试文件的完整路径来匹配
          const suitePathMatch = suite.name.match(/([^/\\]+)\.test\.js$/);
          if (suitePathMatch) {
            const fileBaseName = suitePathMatch[1];
            // 尝试匹配不同的套件名称格式
            const possibleSuiteNames = [
              fileBaseName.replace(/([A-Z])/g, ' $1').trim(), // camelCase to words
              fileBaseName,
              shortName
            ];
            
            for (const possibleSuite of possibleSuiteNames) {
              testDescription = getTestDescription(possibleSuite, describeName, test.title);
              if (testDescription !== `测试: ${test.title}`) {
                break;
              }
            }
          }
          
          // 如果仍然找不到，尝试在整个描述映射中搜索
          if (testDescription === `测试: ${test.title}`) {
            const testDescriptions = require('./test-descriptions');
            for (const [suiteKey, suiteData] of Object.entries(testDescriptions)) {
              if (typeof suiteData === 'object' && suiteData !== null && !suiteData.getTestDescription) {
                for (const [describeKey, describeData] of Object.entries(suiteData)) {
                  if (typeof describeData === 'object' && describeData !== null) {
                    if (describeData[test.title]) {
                      testDescription = describeData[test.title];
                      break;
                    }
                  }
                }
                if (testDescription !== `测试: ${test.title}`) break;
              }
            }
          }
        }
        
        html += `
          <div class="test-item ${status}">
            <span class="test-icon">${icon}</span>
            <div class="test-info">
              <span class="test-name">${escapeHtml(test.title)}</span>
              <span class="test-description">${escapeHtml(testDescription)}</span>
            </div>
            <span class="test-duration">${duration}</span>
          </div>
        `;
      });

      if (suiteTests.length > 20) {
        html += `<div style="padding: 10px; color: #666; font-style: italic;">... 还有 ${suiteTests.length - 20} 个测试用例（查看完整列表请切换到"测试结果"标签页）</div>`;
      }
    }

    html += `</div>`;
  });

  html += '</div>';
  return html;
}

function escapeHtml(text) {
  if (!text) return '';
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

// 清理 ANSI 转义码（终端颜色代码）
function stripAnsiCodes(text) {
  if (!text) return '';
  // 移除 ANSI 转义序列（如 [2m, [31m, [32m, [39m 等）
  return text.replace(/\u001b\[[0-9;]*m/g, '');
}

// 生成并保存HTML报告
const html = generateHTMLReport();
const outputPath = path.join(reportsDir, 'test-report.html');
fs.writeFileSync(outputPath, html, 'utf8');

console.log(`✅ HTML测试报告已生成: ${outputPath}`);
console.log(`   请在浏览器中打开查看详细报告`);

