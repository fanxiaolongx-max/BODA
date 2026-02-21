# 在 Node.js 中调用 Python 脚本

## 为什么不需要单独的进程？

`boda-python-worker` 是一个独立的 PM2 进程，用于运行长期运行的 Python 后台任务。但大多数情况下，你可以在 Node.js 进程中直接调用 Python 脚本，这样更简单、更高效。

## 两种方案对比

### 方案1：独立进程（boda-python-worker）
**适用场景：**
- Python 脚本需要长期运行（如定时任务、后台服务）
- Python 脚本需要独立重启和管理
- Python 脚本崩溃不应该影响 Node.js 主进程

**缺点：**
- 需要额外的进程管理
- 进程间通信复杂
- 资源占用更多

### 方案2：在 Node.js 中调用（推荐）
**适用场景：**
- Python 脚本是短时任务（如数据处理、API 调用）
- 需要 Python 脚本的返回值
- 希望统一管理和日志

**优点：**
- 更简单，不需要额外进程
- 可以直接获取返回值
- 统一日志和错误处理
- 资源占用更少

## 使用方法

### 1. 导入工具模块

```javascript
const { runPythonScript, runPythonScriptSync, runPythonCode } = require('./utils/python-runner');
```

### 2. 异步调用 Python 脚本

```javascript
// 在路由或服务中
async function processData() {
  try {
    const result = await runPythonScript('scripts/python_worker.py', ['arg1', 'arg2'], {
      timeout: 30000, // 30秒超时
      env: {
        DATABASE_URL: 'sqlite:///db/boda.db'
      }
    });
    
    console.log('Python 输出:', result.stdout);
    return JSON.parse(result.stdout); // 如果 Python 返回 JSON
  } catch (error) {
    console.error('Python 脚本执行失败:', error);
    throw error;
  }
}
```

### 3. 同步调用（不推荐，会阻塞）

```javascript
const result = runPythonScriptSync('scripts/python_worker.py', ['arg1']);
console.log(result.stdout);
```

### 4. 执行 Python 代码字符串

```javascript
const result = await runPythonCode(`
import json
data = {"status": "ok", "message": "Hello from Python"}
print(json.dumps(data))
`);

const data = JSON.parse(result.stdout);
console.log(data); // { status: 'ok', message: 'Hello from Python' }
```

## 示例：在 API 路由中调用 Python

```javascript
// routes/api.js
const express = require('express');
const router = express.Router();
const { runPythonScript } = require('../utils/python-runner');

router.post('/process', async (req, res) => {
  try {
    const { data } = req.body;
    
    // 调用 Python 脚本处理数据
    const result = await runPythonScript('scripts/process_data.py', [
      JSON.stringify(data)
    ], {
      timeout: 10000
    });
    
    // Python 脚本返回 JSON
    const processedData = JSON.parse(result.stdout);
    
    res.json({
      success: true,
      data: processedData
    });
  } catch (error) {
    console.error('处理失败:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;
```

## Python 脚本示例

```python
#!/usr/bin/env python3
# scripts/process_data.py
import sys
import json

def main():
    # 从命令行参数获取数据
    if len(sys.argv) > 1:
        data = json.loads(sys.argv[1])
    else:
        data = {}
    
    # 处理数据
    result = {
        "processed": True,
        "input": data,
        "output": f"Processed: {data}"
    }
    
    # 输出 JSON（Node.js 会捕获）
    print(json.dumps(result))
    sys.exit(0)

if __name__ == "__main__":
    main()
```

## 环境变量

工具会自动：
1. 检测项目内的 Python 虚拟环境
2. 使用虚拟环境中的 Python 解释器
3. 设置 `PYTHONUNBUFFERED=1` 确保实时输出
4. 设置 `VIRTUAL_ENV` 环境变量

## 错误处理

```javascript
try {
  const result = await runPythonScript('scripts/my_script.py');
} catch (error) {
  // error.message 包含详细错误信息
  // error.stderr 包含 Python 的错误输出
  console.error('Python 错误:', error.message);
}
```

## 性能考虑

- **短时任务**：使用 `runPythonScript`（推荐）
- **长时间运行**：考虑使用独立进程或消息队列
- **频繁调用**：考虑使用 Python HTTP 服务或 gRPC

## 何时使用独立进程？

只有在以下情况才需要独立的 `boda-python-worker` 进程：

1. Python 脚本需要 7x24 小时运行
2. Python 脚本需要独立的重启策略
3. Python 脚本的崩溃不应该影响主应用

对于大多数场景，在 Node.js 中直接调用 Python 脚本就足够了。
