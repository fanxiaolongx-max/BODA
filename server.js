const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const session = require('express-session');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

const { initData } = require('./db/init');
const { logger } = require('./utils/logger');
const { closeDatabase } = require('./db/database');
const monitoringMiddleware = require('./middleware/monitoring');

const app = express();
const PORT = process.env.PORT || 3000;

// 信任代理（重要：用于 ngrok、Nginx 等反向代理）
// 设置为 1 表示信任第一个代理，不影响直接访问
app.set('trust proxy', 1);

// 安全中间件
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com", "https://cdn.jsdelivr.net"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com"],
      scriptSrcAttr: ["'unsafe-inline'"], // 允许内联事件处理器（onclick等）
      imgSrc: ["'self'", "data:", "blob:", "https://cdn.jsdelivr.net"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "https://cdn.tailwindcss.com", "https://cdn.jsdelivr.net"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null
    },
  },
  hsts: {
    maxAge: 31536000, // 1年（31536000秒 = 365天）
    // 注意：这个值表示浏览器会记住"必须使用HTTPS"的时长
    // 1年后浏览器会"忘记"这个规则，但不会影响程序运行
    // 只要服务器继续发送HSTS头，浏览器会持续更新这个记忆
    // 可以设置为更长时间（如2年：63072000），但1年是常用值
    includeSubDomains: true,
    preload: true
  },
  // 防止点击劫持
  frameguard: {
    action: 'deny'
  },
  // 禁用X-Powered-By头
  hidePoweredBy: true,
  // XSS保护
  xssFilter: true,
  // 防止MIME类型嗅探
  noSniff: true,
  // 防止IE执行下载的HTML
  ieNoOpen: true,
  // DNS预取控制
  dnsPrefetchControl: {
    allow: false
  }
}));

// CORS配置
const corsOptions = {
  origin: function (origin, callback) {
    // 允许无origin的请求（如移动应用、Postman等）
    if (!origin) {
      return callback(null, true);
    }
    
    // 从环境变量读取允许的源
    const allowedOrigins = process.env.CORS_ORIGIN 
      ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
      : ['http://localhost:3000', 'http://127.0.0.1:3000'];
    
    // 开发环境允许所有源（方便测试）
    if (process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    
    // 生产环境检查白名单
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['X-Total-Count'],
  maxAge: 86400 // 24小时
};

app.use(cors(corsOptions));

// 请求解析
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Session配置
// 自动检测 HTTPS：如果设置了 trust proxy，会根据 X-Forwarded-Proto 自动判断
// secure: 'auto' 会根据 req.secure 自动设置（在 trust proxy 模式下会检查 X-Forwarded-Proto）
app.use(session({
  secret: process.env.SESSION_SECRET || 'boda-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: 'auto', // 自动检测：在 trust proxy 模式下会根据 X-Forwarded-Proto 自动判断
    httpOnly: true,
    sameSite: 'lax', // 允许跨站请求，同时保持安全性
    maxAge: 24 * 60 * 60 * 1000 // 24小时
  },
  proxy: true, // 信任反向代理（fly.io、ngrok、Nginx 等），这样 secure: 'auto' 才能正确工作
  name: 'boda.sid' // 自定义 session cookie 名称
}));

// 性能监控中间件（放在session之后，路由之前）
app.use(monitoringMiddleware);

// 限流配置（放宽限制）
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 500, // 限制500个请求（从100增加到500）
  message: { success: false, message: '请求过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50, // 登录限制50次（从10增加到50）
  skipSuccessfulRequests: true, // 成功的请求不计数
  message: { success: false, message: '登录尝试次数过多，请15分钟后再试' },
  standardHeaders: true,
  legacyHeaders: false,
});

// 支持 fly.io 持久化卷：如果 /data 目录存在，使用 /data，否则使用本地目录
const DATA_DIR = fs.existsSync('/data') ? '/data' : __dirname;

// 静态文件服务
app.use(express.static('public'));
app.use('/uploads', express.static(path.join(DATA_DIR, 'uploads')));
app.use('/show', express.static('show'));

// 确保必要目录存在
['uploads', 'uploads/products', 'uploads/payments', 'logs'].forEach(dir => {
  const dirPath = path.join(DATA_DIR, dir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
});

// 请求日志（详细记录）
app.use((req, res, next) => {
  const startTime = Date.now();
  
  // 记录请求开始
  logger.info('HTTP Request', {
    method: req.method,
    url: req.url,
    path: req.path,
    query: req.query,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get('user-agent'),
    referer: req.get('referer'),
    contentType: req.get('content-type'),
    timestamp: new Date().toISOString()
  });
  
  // 记录响应
  const originalSend = res.send;
  res.send = function(data) {
    const duration = Date.now() - startTime;
    logger.info('HTTP Response', {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip || req.connection.remoteAddress,
      timestamp: new Date().toISOString()
    });
    originalSend.call(this, data);
  };
  
  next();
});

// 导入路由
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const userRoutes = require('./routes/user');
const publicRoutes = require('./routes/public');

// 注册路由
app.use('/api/auth', loginLimiter, authRoutes);
app.use('/api/admin', apiLimiter, adminRoutes);
app.use('/api/user', apiLimiter, userRoutes);
app.use('/api/public', publicRoutes);

// 健康检查
const { performHealthCheck } = require('./utils/health-check');
app.get('/health', async (req, res) => {
  try {
    const health = await performHealthCheck();
    const statusCode = health.status === 'healthy' ? 200 : health.status === 'warning' ? 200 : 503;
    res.status(statusCode).json(health);
  } catch (error) {
    res.status(503).json({ 
      status: 'unhealthy', 
      timestamp: new Date().toISOString(),
      error: error.message 
    });
  }
});

// 404处理
app.use((req, res) => {
  res.status(404).json({ success: false, message: '接口不存在' });
});

// 错误处理
app.use((err, req, res, next) => {
  logger.error('Server Error', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method
  });

  res.status(err.status || 500).json({
    success: false,
    message: process.env.NODE_ENV === 'production' ? '服务器错误' : err.message
  });
});

// 初始化数据库并启动服务器
let server;

async function startServer() {
  try {
    await initData();
    
    server = app.listen(PORT, () => {
      logger.info(`服务器运行在 http://localhost:${PORT}`);
      console.log(`\n=================================`);
      console.log(`📱 BOBA TEA Ordering System`);
      console.log(`🚀 服务器: http://localhost:${PORT}`);
      console.log(`👤 管理后台: http://localhost:${PORT}/admin.html`);
      console.log(`🛒 用户端: http://localhost:${PORT}/index.html`);
      console.log(`📝 默认管理员: admin / admin123`);
      console.log(`=================================\n`);
    });
  } catch (error) {
    logger.error('启动服务器失败', { error: error.message });
    process.exit(1);
  }
}

startServer();

// 优雅关闭
async function gracefulShutdown(signal) {
  logger.info(`收到${signal}信号，正在优雅关闭服务器...`);
  
  // 停止接受新请求
  if (server) {
    server.close(() => {
      logger.info('HTTP服务器已关闭');
      
      // 关闭数据库连接
      closeDatabase().then(() => {
        logger.info('数据库连接已关闭');
        process.exit(0);
      }).catch((err) => {
        logger.error('关闭数据库连接失败', { error: err.message });
        process.exit(1);
      });
    });
    
    // 如果10秒后还没有关闭，强制退出
    setTimeout(() => {
      logger.error('强制关闭服务器（超时）');
      process.exit(1);
    }, 10000);
  } else {
    process.exit(0);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
