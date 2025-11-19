# 使用官方 Node.js 运行时作为基础镜像
FROM node:20-slim

# 设置工作目录
WORKDIR /app

# 安装系统依赖（sqlite3 需要编译工具）
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# 创建数据目录（数据库、日志、上传文件、show目录）
# show 目录放在 /data/show 以便在 fly.io 上持久化
RUN mkdir -p /data /data/uploads /data/logs /data/uploads/products /data/uploads/payments /data/show && \
    chown -R node:node /data

# 确保 /app 目录的所有者是 node 用户
RUN chown -R node:node /app

# 切换到 node 用户
USER node

# 复制 package 文件
COPY --chown=node:node package*.json ./

# 安装依赖
RUN npm ci --omit=dev && \
    npm cache clean --force

# 复制应用代码
COPY --chown=node:node . .

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/data

# 暴露端口
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# 启动应用
CMD ["node", "server.js"]
