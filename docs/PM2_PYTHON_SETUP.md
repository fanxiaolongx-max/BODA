# PM2 + Python 虚拟环境配置指南

## 概述

本指南说明如何使用 PM2 管理使用项目内 Python 虚拟环境的 Python 应用。

## 前提条件

1. 已安装 PM2：`npm install -g pm2`
2. 已创建 Python 虚拟环境（在项目目录内）

## 创建 Python 虚拟环境

在项目根目录创建虚拟环境：

```bash
# 使用 venv（推荐）
python3 -m venv venv

# 或使用 virtualenv
python3 -m virtualenv venv

# 激活虚拟环境
source venv/bin/activate  # Linux/Mac
# 或
venv\Scripts\activate  # Windows
```

## 配置 PM2

### 1. 基本配置

编辑 `ecosystem.config.js`，添加 Python 应用配置：

```javascript
module.exports = {
  apps: [
    {
      name: "boda",
      script: "./server.js",
      env: {
        TZ: "Africa/Cairo"
      }
    },
    {
      name: "boda-python-worker",
      interpreter: "./venv/bin/python", // 虚拟环境中的 Python 解释器
      script: "./scripts/python_worker.py", // Python 脚本路径
      cwd: __dirname,
      env: {
        TZ: "Africa/Cairo",
        PYTHONUNBUFFERED: "1", // 确保输出不被缓冲
        VIRTUAL_ENV: "./venv"
      },
      instances: 1,
      exec_mode: "fork",
      watch: false,
      max_memory_restart: "500M",
      error_file: "./logs/python-error.log",
      out_file: "./logs/python-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s"
    }
  ]
}
```

### 2. 自动检测虚拟环境

`ecosystem.config.js` 已包含自动检测逻辑，会按以下顺序查找虚拟环境：
- `./venv`
- `./env`
- `./.venv`
- `./python/venv`

如果找到虚拟环境，会自动使用其中的 Python 解释器。

## 使用 PM2 管理 Python 应用

### 启动应用

```bash
# 启动所有应用
pm2 start ecosystem.config.js

# 只启动 Python 应用
pm2 start ecosystem.config.js --only boda-python-worker

# 启动并指定环境
pm2 start ecosystem.config.js --env production
```

### 查看状态

```bash
# 查看所有应用状态
pm2 status

# 查看 Python 应用日志
pm2 logs boda-python-worker

# 查看实时日志
pm2 logs boda-python-worker --lines 100
```

### 停止和重启

```bash
# 停止 Python 应用
pm2 stop boda-python-worker

# 重启 Python 应用
pm2 restart boda-python-worker

# 删除应用
pm2 delete boda-python-worker
```

### 保存配置

```bash
# 保存当前 PM2 进程列表
pm2 save

# 设置开机自启
pm2 startup
```

## 示例 Python 脚本

创建 `scripts/python_worker.py` 作为示例：

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import time
import sys
import os

def main():
    """主函数"""
    print(f"Python Worker 启动成功")
    print(f"Python 版本: {sys.version}")
    print(f"虚拟环境: {os.environ.get('VIRTUAL_ENV', '未设置')}")
    print(f"工作目录: {os.getcwd()}")
    
    try:
        while True:
            print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Worker 运行中...")
            time.sleep(10)
    except KeyboardInterrupt:
        print("收到停止信号，正在退出...")
        sys.exit(0)

if __name__ == "__main__":
    main()
```

## 常见问题

### 1. Python 模块未找到

确保虚拟环境中已安装所需模块：

```bash
source venv/bin/activate
pip install -r requirements.txt
```

### 2. 权限问题

确保 Python 脚本有执行权限：

```bash
chmod +x scripts/python_worker.py
```

### 3. 路径问题

在 Python 脚本中使用相对路径时，确保使用 `cwd` 选项指定工作目录。

### 4. 日志不输出

设置 `PYTHONUNBUFFERED=1` 环境变量确保 Python 输出不被缓冲。

## 高级配置

### 使用 requirements.txt

创建 `requirements.txt`：

```txt
requests>=2.28.0
flask>=2.0.0
```

安装依赖：

```bash
source venv/bin/activate
pip install -r requirements.txt
```

### 多实例运行

```javascript
{
  name: "boda-python-worker",
  interpreter: "./venv/bin/python",
  script: "./scripts/python_worker.py",
  instances: 4, // 运行 4 个实例
  exec_mode: "cluster" // 使用集群模式
}
```

### 环境变量配置

```javascript
{
  name: "boda-python-worker",
  interpreter: "./venv/bin/python",
  script: "./scripts/python_worker.py",
  env: {
    TZ: "Africa/Cairo",
    PYTHONUNBUFFERED: "1",
    DATABASE_URL: "sqlite:///db/boda.db",
    API_KEY: "your-api-key"
  },
  env_production: {
    DATABASE_URL: "postgresql://user:pass@localhost/boda"
  }
}
```

## 监控和调试

### 监控资源使用

```bash
# 查看资源使用情况
pm2 monit

# 查看详细信息
pm2 describe boda-python-worker
```

### 调试模式

```bash
# 以调试模式运行
pm2 start ecosystem.config.js --only boda-python-worker --node-args="--inspect"
```

## 注意事项

1. **虚拟环境路径**：确保虚拟环境路径正确，PM2 需要能够找到 Python 解释器
2. **工作目录**：使用 `cwd` 选项确保 Python 脚本能正确找到相对路径的资源
3. **日志管理**：定期清理日志文件，避免磁盘空间不足
4. **依赖管理**：确保虚拟环境中安装了所有必需的 Python 包
5. **权限问题**：确保 PM2 有权限访问虚拟环境和脚本文件

## 相关文件

- `ecosystem.config.js` - PM2 配置文件
- `scripts/python_worker.py` - Python 脚本示例（需要创建）
- `requirements.txt` - Python 依赖文件（需要创建）
