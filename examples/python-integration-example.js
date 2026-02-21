/**
 * Python 集成示例
 * 演示如何在 Node.js 中调用 Python 脚本
 */

const { runPythonScript, runPythonCode } = require('../utils/python-runner');

// 示例1: 调用 Python 脚本处理数据
async function example1() {
  console.log('示例1: 调用 Python 脚本');
  try {
    const result = await runPythonScript('scripts/python_worker.py', [], {
      timeout: 5000
    });
    console.log('Python 输出:', result.stdout);
  } catch (error) {
    console.error('错误:', error.message);
  }
}

// 示例2: 执行 Python 代码字符串
async function example2() {
  console.log('\n示例2: 执行 Python 代码');
  try {
    const result = await runPythonCode(`
import json
import sys

data = {
    "message": "Hello from Python",
    "python_version": sys.version.split()[0],
    "status": "success"
}
print(json.dumps(data))
    `);
    
    const data = JSON.parse(result.stdout);
    console.log('Python 返回:', data);
  } catch (error) {
    console.error('错误:', error.message);
  }
}

// 示例3: 传递参数给 Python 脚本
async function example3() {
  console.log('\n示例3: 传递参数');
  try {
    const result = await runPythonScript('scripts/python_worker.py', [
      '--mode', 'test',
      '--data', JSON.stringify({ test: true })
    ]);
    console.log('输出:', result.stdout);
  } catch (error) {
    console.error('错误:', error.message);
  }
}

// 运行示例
(async () => {
  await example1();
  await example2();
  await example3();
})();
