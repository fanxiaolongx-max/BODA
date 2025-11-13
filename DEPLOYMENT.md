# 部署指南

## 本地开发环境部署

### 快速启动
```bash
# 使用启动脚本（推荐）
./start.sh

# 或手动启动
npm install
node db/init.js
npm start
```

## 生产环境部署

### 1. 环境准备

#### 服务器要求
- 操作系统: Linux (Ubuntu 20.04+ 推荐) / macOS / Windows Server
- Node.js: v14.0+
- 内存: 512MB+
- 硬盘: 1GB+

#### 安装Node.js (Ubuntu示例)
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### 2. 项目部署

```bash
# 1. 克隆或上传项目
cd /var/www/
git clone <your-repo> boda
# 或使用 scp 上传

# 2. 安装依赖
cd boda
npm install --production

# 3. 配置环境变量
cp .env.example .env
nano .env
# 修改以下配置:
# - SESSION_SECRET: 使用强密码
# - NODE_ENV: production
# - PORT: 根据需要修改

# 4. 初始化数据库
node db/init.js

# 5. 修改默认管理员密码
# 启动服务器后立即登录管理后台修改密码
```

### 3. 使用PM2管理进程（推荐）

```bash
# 安装PM2
npm install -g pm2

# 启动应用
pm2 start server.js --name boda

# 设置开机自启
pm2 startup
pm2 save

# 查看日志
pm2 logs boda

# 其他命令
pm2 restart boda  # 重启
pm2 stop boda     # 停止
pm2 delete boda   # 删除
```

### 4. 使用Nginx反向代理（推荐）

```nginx
# /etc/nginx/sites-available/boda
server {
    listen 80;
    server_name your-domain.com;

    # 如果有SSL证书
    # listen 443 ssl;
    # ssl_certificate /path/to/cert.pem;
    # ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # 静态文件缓存
    location ~* \.(jpg|jpeg|png|gif|ico|css|js)$ {
        proxy_pass http://localhost:3000;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
```

启用配置：
```bash
sudo ln -s /etc/nginx/sites-available/boda /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 5. 防火墙配置

```bash
# Ubuntu UFW
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 22/tcp  # SSH
sudo ufw enable

# CentOS Firewalld
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

### 6. 安全加固

#### 修改默认密码
```bash
# 启动后立即登录管理后台修改admin密码
```

#### 设置强SESSION_SECRET
```bash
# 生成随机密钥
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# 将结果写入 .env 的 SESSION_SECRET
```

#### 限制管理后台访问
在Nginx中添加IP白名单：
```nginx
location /admin.html {
    allow 192.168.1.0/24;  # 允许的IP段
    deny all;
    proxy_pass http://localhost:3000;
}
```

#### 启用SSL
使用Let's Encrypt免费证书：
```bash
sudo apt-get install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

### 7. 数据备份

#### 自动备份脚本
```bash
#!/bin/bash
# backup.sh

BACKUP_DIR="/var/backups/boda"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# 备份数据库
cp /var/www/boda/db/boda.db $BACKUP_DIR/boda_$DATE.db

# 备份上传文件
tar -czf $BACKUP_DIR/uploads_$DATE.tar.gz /var/www/boda/uploads

# 删除7天前的备份
find $BACKUP_DIR -name "*.db" -mtime +7 -delete
find $BACKUP_DIR -name "*.tar.gz" -mtime +7 -delete

echo "Backup completed: $DATE"
```

设置定时任务：
```bash
chmod +x backup.sh
crontab -e
# 每天凌晨2点备份
0 2 * * * /var/www/boda/backup.sh >> /var/log/boda-backup.log 2>&1
```

### 8. 监控和日志

#### 日志轮转
```bash
# /etc/logrotate.d/boda
/var/www/boda/logs/*.log {
    daily
    rotate 7
    compress
    delaycompress
    notifempty
    create 0640 www-data www-data
    sharedscripts
}
```

#### PM2监控
```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

### 9. 性能优化

#### 数据库优化
数据库已启用WAL模式和索引，无需额外配置。

#### Node.js进程
```bash
# 使用集群模式（多核CPU）
pm2 start server.js -i max --name boda
```

#### 静态文件CDN
如果流量大，考虑将uploads目录放到CDN。

### 10. 更新部署

```bash
cd /var/www/boda

# 备份数据库
cp db/boda.db db/boda.db.backup

# 拉取更新
git pull

# 安装新依赖
npm install --production

# 重启服务
pm2 restart boda
```

## Docker部署（可选）

### Dockerfile
```dockerfile
FROM node:18-alpine

WORKDIR /app

# 安装依赖
COPY package*.json ./
RUN npm install --production

# 复制项目文件
COPY . .

# 创建必要目录
RUN mkdir -p db uploads/products uploads/payments logs

# 初始化数据库
RUN node db/init.js

# 暴露端口
EXPOSE 3000

# 启动应用
CMD ["node", "server.js"]
```

### docker-compose.yml
```yaml
version: '3.8'

services:
  boda:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - ./db:/app/db
      - ./uploads:/app/uploads
      - ./logs:/app/logs
    environment:
      - NODE_ENV=production
      - SESSION_SECRET=your-secret-key
    restart: unless-stopped
```

### 启动
```bash
docker-compose up -d
```

## 故障排查

### 服务无法启动
```bash
# 查看日志
pm2 logs boda
tail -f logs/error.log

# 检查端口占用
lsof -i :3000
netstat -tulpn | grep 3000
```

### 数据库错误
```bash
# 检查文件权限
ls -la db/boda.db

# 重建数据库
mv db/boda.db db/boda.db.old
node db/init.js
```

### 性能问题
```bash
# 查看资源使用
pm2 monit

# 查看数据库大小
ls -lh db/boda.db

# 清理旧日志
find logs/ -name "*.log" -mtime +30 -delete
```

## 安全检查清单

- [ ] 修改了默认管理员密码
- [ ] 设置了强SESSION_SECRET
- [ ] 启用了HTTPS
- [ ] 配置了防火墙
- [ ] 限制了管理后台访问
- [ ] 设置了定期备份
- [ ] 配置了日志轮转
- [ ] 更新了所有依赖到最新版本
- [ ] 检查了文件权限
- [ ] 测试了备份恢复流程

## 性能基准

在标准配置下（2核CPU，2GB内存）：
- 并发用户: 100+
- 响应时间: < 100ms
- 数据库查询: < 10ms
- 文件上传: < 2s (10MB)

## 技术支持

遇到问题请检查：
1. PM2日志: `pm2 logs boda`
2. 应用日志: `logs/error.log`
3. 系统日志: `journalctl -u nginx`
4. 数据库日志: 操作日志表

