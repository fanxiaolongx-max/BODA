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

# 复制 package 文件
COPY package*.json ./

# 安装依赖
RUN npm ci --only=production && \
    npm cache clean --force

# 复制应用代码
COPY . .

# 创建数据目录（数据库、日志、上传文件）
# 注意：数据库会直接存储在 /data 目录，因为代码中检查 /data 目录
RUN mkdir -p /data /data/uploads /data/logs /data/uploads/products /data/uploads/payments

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
