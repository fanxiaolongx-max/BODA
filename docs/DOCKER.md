# Docker 部署指南

本文档介绍如何使用 Docker 部署 BOBA TEA 点单系统。

## 快速开始

### 使用 Docker Compose（推荐）

1. **构建并启动容器**：
```bash
docker-compose up -d
```

2. **查看日志**：
```bash
docker-compose logs -f
```

3. **停止服务**：
```bash
docker-compose down
```

4. **重启服务**：
```bash
docker-compose restart
```

### 使用 Docker 命令

1. **构建镜像**：
```bash
docker build -t boda-ordering-system .
```

2. **运行容器**：
```bash
docker run -d \
  --name boda-app \
  -p 3000:3000 \
  boda-ordering-system
```

3. **查看日志**：
```bash
docker logs -f boda-app
```

4. **停止容器**：
```bash
docker stop boda-app
```

5. **删除容器**：
```bash
docker rm boda-app
```

## 数据存储

数据存储在容器内部（`/data` 目录），包括：
- **数据库**：`/data/boda.db`
- **上传文件**：`/data/uploads/`
- **日志文件**：`/data/logs/`

**重要提示**：
- 数据存储在容器内部，删除容器会丢失数据
- 如需备份数据，请使用容器内的备份功能或导出数据
- 如需持久化数据，可以添加卷挂载（见下方说明）

## 环境变量

可以通过环境变量配置应用：

```bash
docker run -d \
  --name boda-app \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e PORT=3000 \
  -e DATA_DIR=/data \
  --restart unless-stopped \
  boda-ordering-system
```

## 访问应用

启动后，访问以下地址：

- **用户端**：http://localhost:3000
- **管理后台**：http://localhost:3000/admin.html
- **默认管理员账号**：admin / admin123

## 健康检查

容器包含健康检查功能，可以通过以下命令查看：

```bash
docker ps
```

健康检查端点：`http://localhost:3000/health`

## 备份和恢复

### 备份数据

由于数据存储在容器内部，备份数据的方法：

**方法 1：使用容器内的备份功能**
```bash
# 进入容器执行备份
docker exec -it boda-app sh
# 在容器内使用管理后台的备份功能
```

**方法 2：直接复制数据库文件**
```bash
# 复制数据库文件
docker cp boda-app:/data/boda.db ./backup/boda.db.$(date +%Y%m%d)

# 复制整个数据目录
docker cp boda-app:/data ./backup/data.$(date +%Y%m%d)
```

### 恢复数据

```bash
# 恢复数据库文件
docker cp ./backup/boda.db boda-app:/data/boda.db

# 或恢复整个数据目录
docker cp ./backup/data/. boda-app:/data/

# 重启容器
docker restart boda-app
```

### 可选：使用卷挂载持久化数据

如果需要数据持久化到宿主机，可以在运行容器时添加卷挂载：

```bash
docker run -d \
  --name boda-app \
  -p 3000:3000 \
  -v $(pwd)/data:/data \
  boda-ordering-system
```

或在 `docker-compose.yml` 中添加：
```yaml
volumes:
  - ./data:/data
```

## 生产环境部署

### 使用 Docker Compose

1. **修改端口**（如需要）：
编辑 `docker-compose.yml`，修改端口映射：
```yaml
ports:
  - "80:3000"  # 映射到 80 端口
```

2. **添加环境变量文件**：
创建 `.env` 文件：
```env
NODE_ENV=production
PORT=3000
DATA_DIR=/data
```

3. **使用环境变量文件**：
```yaml
env_file:
  - .env
```

### 使用 Docker Swarm 或 Kubernetes

可以参考 `docker-compose.yml` 配置，适配到 Swarm 或 Kubernetes 部署。

## 故障排查

### 查看容器日志
```bash
docker logs boda-app
```

### 进入容器调试
```bash
docker exec -it boda-app sh
```

### 检查数据库文件
```bash
# 进入容器检查
docker exec -it boda-app ls -lh /data/

# 或复制出来检查
docker cp boda-app:/data/boda.db ./temp-check.db
ls -lh ./temp-check.db
rm ./temp-check.db
```

### 检查端口占用
```bash
netstat -tulpn | grep 3000
# 或
lsof -i :3000
```

## 注意事项

1. **数据备份**：定期备份 `data` 目录，防止数据丢失
2. **权限问题**：确保 Docker 有权限访问数据目录
3. **端口冲突**：如果 3000 端口被占用，修改端口映射
4. **资源限制**：生产环境建议设置内存和 CPU 限制

## 更新应用

1. **停止容器**：
```bash
docker-compose down
```

2. **重新构建镜像**：
```bash
docker-compose build --no-cache
```

3. **启动新容器**：
```bash
docker-compose up -d
```

## 多实例部署

如果需要运行多个实例，需要：

1. 使用外部数据库（如 PostgreSQL）替代 SQLite
2. 使用共享存储（如 NFS）存储上传文件
3. 配置负载均衡器

## 相关文件

- `Dockerfile` - Docker 镜像构建文件
- `docker-compose.yml` - Docker Compose 配置文件
- `.dockerignore` - Docker 构建忽略文件

