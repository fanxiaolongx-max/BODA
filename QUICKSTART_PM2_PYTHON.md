# PM2 + Python 虚拟环境快速开始

## 快速设置

### 1. 创建 Python 虚拟环境

```bash
# 方法1: 使用脚本（推荐）
bash scripts/setup_python_env.sh

# 方法2: 手动创建
python3 -m venv venv
source venv/bin/activate  # Linux/Mac
# 或
venv\Scripts\activate  # Windows
pip install -r requirements.txt
```

### 2. 启动应用

```bash
# 启动所有应用（包括 Node.js 和 Python）
pm2 start ecosystem.config.js

# 只启动 Python 应用
pm2 start ecosystem.config.js --only boda-python-worker

# 查看状态
pm2 status

# 查看日志
pm2 logs boda-python-worker
```

### 3. 常用命令

```bash
# 停止
pm2 stop boda-python-worker

# 重启
pm2 restart boda-python-worker

# 删除
pm2 delete boda-python-worker

# 保存配置
pm2 save

# 设置开机自启
pm2 startup
```

## 配置说明

`ecosystem.config.js` 会自动检测项目内的 Python 虚拟环境：
- `./venv`
- `./env`
- `./.venv`
- `./python/venv`

如果找到虚拟环境，Python 应用会自动启用。

## 自定义 Python 脚本

编辑 `scripts/python_worker.py` 添加你的业务逻辑。

## 更多信息

查看 `docs/PM2_PYTHON_SETUP.md` 获取详细文档。
