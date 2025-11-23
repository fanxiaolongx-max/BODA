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
const HOST = process.env.HOST || '0.0.0.0';

// 信任代理（重要：用于 ngrok、Nginx 等反向代理）
// 设置为 1 表示信任第一个代理，不影响直接访问
app.set('trust proxy', 1);

// 安全中间件
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      scriptSrcAttr: ["'unsafe-inline'"], // 允许内联事件处理器（onclick等）
      imgSrc: ["'self'", "data:", "blob:", "https://cdn.jsdelivr.net"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "https://cdn.jsdelivr.net"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'self'", "blob:"], // 允许同源iframe和blob URL（用于测试报告）
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
  // 防止点击劫持（但允许同源iframe用于测试报告）
  frameguard: {
    action: 'sameorigin' // 允许同源iframe，阻止跨域iframe
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
    
    // 生产环境：允许 Fly.io 域名（*.fly.dev）和配置的源
    const isFlyDev = origin.endsWith('.fly.dev');
    const isAllowedOrigin = allowedOrigins.indexOf(origin) !== -1;
    
    if (isFlyDev || isAllowedOrigin) {
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
// 注意：默认使用内存存储，对于单进程应用是安全的。如果需要多进程，请使用 Redis 或其他存储。
const sessionConfig = {
  secret: process.env.SESSION_SECRET || 'boda-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  rolling: false, // 禁用滚动过期，使用固定过期时间（更安全）
  cookie: {
    secure: 'auto', // 自动检测：在 trust proxy 模式下会根据 X-Forwarded-Proto 自动判断
    httpOnly: true,
    sameSite: 'lax', // 允许跨站请求，同时保持安全性
    maxAge: 2 * 60 * 60 * 1000 // 2小时（固定过期，不会因活动而延长）
  },
  proxy: true, // 信任反向代理（fly.io、ngrok、Nginx 等），这样 secure: 'auto' 才能正确工作
  name: 'boda.sid' // 自定义 session cookie 名称
};

// 如果设置了 SESSION_STORE=sqlite，使用 SQLite 存储 session（可选）
if (process.env.SESSION_STORE === 'sqlite') {
  try {
    const SQLiteStore = require('connect-sqlite3')(session);
    const { DB_DIR } = require('./db/database');
    sessionConfig.store = new SQLiteStore({
      db: 'sessions.db',
      dir: DB_DIR,
      table: 'sessions'
    });
    logger.info('使用 SQLite 存储 Session');
  } catch (error) {
    logger.warn('无法使用 SQLite 存储 Session，使用默认内存存储', { error: error.message });
  }
}

app.use(session(sessionConfig));

// 性能监控中间件（放在session之后，路由之前）
app.use(monitoringMiddleware);

// 限流配置
// 为管理员API创建单独的、更宽松的限流器（因为测试轮询和管理界面需要频繁操作）
const adminApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 10000, // 管理员API限制10000个请求（非常宽松，适合测试轮询和频繁操作）
  message: { success: false, message: '请求过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
  // 跳过下载接口和测试接口的速率限制
  skip: (req) => {
    // 跳过备份文件下载和菜单备份下载
    if (req.path.includes('/backup/download') || req.path.includes('/menu/backup/download') || req.path.includes('/developer/files/download')) {
      return true;
    }
    // 跳过测试相关的API（测试需要频繁轮询，不应该被限流）
    if (req.path.includes('/admin/developer/test-progress') || 
        req.path.includes('/admin/developer/run-tests') || 
        req.path.includes('/admin/developer/stop-tests') || 
        req.path.includes('/admin/developer/test-report')) {
      return true;
    }
    return false;
  }
});

// 普通API限流器（用于用户API等）
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 2000, // 普通API限制2000个请求（提高限制，避免正常使用被限流）
  message: { success: false, message: '请求过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
  // 跳过下载接口
  skip: (req) => {
    return req.path.includes('/backup/download') || req.path.includes('/menu/backup/download') || req.path.includes('/developer/files/download');
  }
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

// 静态文件服务（使用绝对路径，确保部署时路径正确）
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(DATA_DIR, 'uploads')));

// show 目录：优先使用 DATA_DIR/show（持久化），如果不存在则回退到项目根目录（兼容性）
const SHOW_DIR = path.join(DATA_DIR, 'show');
const FALLBACK_SHOW_DIR = path.join(__dirname, 'show');

// 确保 show 目录存在
if (!fs.existsSync(SHOW_DIR)) {
  // 如果 DATA_DIR/show 不存在，但项目根目录的 show 存在，则复制过去（迁移）
  if (fs.existsSync(FALLBACK_SHOW_DIR)) {
    try {
      fs.mkdirSync(SHOW_DIR, { recursive: true });
      // 复制现有文件
      const fallbackFiles = fs.readdirSync(FALLBACK_SHOW_DIR);
      fallbackFiles.forEach(file => {
        const srcPath = path.join(FALLBACK_SHOW_DIR, file);
        const destPath = path.join(SHOW_DIR, file);
        if (fs.statSync(srcPath).isFile()) {
          fs.copyFileSync(srcPath, destPath);
        }
      });
      if (fallbackFiles.length > 0) {
        logger.info('Migrated show directory from project root to DATA_DIR', { fileCount: fallbackFiles.length });
      }
    } catch (error) {
      logger.warn('Failed to migrate show directory, using fallback', { error: error.message });
    }
  } else {
    // 如果都不存在，创建 DATA_DIR/show
    fs.mkdirSync(SHOW_DIR, { recursive: true });
  }
}

// 使用 DATA_DIR/show（如果存在），否则回退到项目根目录
const actualShowDir = fs.existsSync(SHOW_DIR) ? SHOW_DIR : FALLBACK_SHOW_DIR;
app.use('/show', express.static(actualShowDir));

// 确保必要目录存在
['uploads', 'uploads/products', 'uploads/payments', 'logs', 'show'].forEach(dir => {
  const dirPath = path.join(DATA_DIR, dir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
});

// 请求日志（优化记录，排除静态资源和健康检查）
const { shouldLogRequest } = require('./utils/log-helper');

app.use((req, res, next) => {
  const startTime = Date.now();
  
  // 记录响应（精简版，不记录完整响应体）
  const originalSend = res.send;
  res.send = async function(data) {
    const duration = Date.now() - startTime;
    
    // 检查是否应该记录此请求
    const shouldLog = await shouldLogRequest(req, res);
    
    // 记录请求和响应（合并为一条日志，减少日志量）
    if (shouldLog || res.statusCode >= 400) {
  // 精简查询参数（只保留核心字段，限制长度）
  const querySummary = {};
  if (req.query) {
    Object.keys(req.query).forEach(key => {
      const value = String(req.query[key]);
      querySummary[key] = value.length > 50 ? value.substring(0, 50) + '...' : value;
    });
  }
  
      const dataLength = data ? (typeof data === 'string' ? data.length : JSON.stringify(data).length) : 0;
      
      // 合并请求和响应信息为一条日志
  logger.info('HTTP Request', {
    method: req.method,
    path: req.path,
    query: Object.keys(querySummary).length > 0 ? querySummary : undefined,
        statusCode: res.statusCode,
        duration: `${duration}ms`,
        responseSize: dataLength > 0 ? `${Math.round(dataLength / 1024)}KB` : undefined,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get('user-agent') ? req.get('user-agent').substring(0, 100) : undefined
  });
    }
    
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
app.use('/api/admin', adminApiLimiter, adminRoutes); // 使用更宽松的管理员API限流器
app.use('/api/user', apiLimiter, userRoutes);
app.use('/api/public', publicRoutes);

// 健康检查
const { performHealthCheck } = require('./utils/health-check');
// 显式处理 favicon.ico 请求
app.get('/favicon.ico', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'favicon.ico'));
});

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
// 微信验证
app.get('/7a21c2d1a7f0427a2a7cb5854bfac05a.txt', (req, res) => {
  res.send("29656752675be119d4ff6f5f0f0912d3996676d7");
});
// 404处理（排除静态文件请求）
app.use((req, res) => {
  // 如果是静态文件请求（如 .ico, .css, .js, .png 等），尝试从 public 目录提供
  const staticExtensions = ['.ico', '.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.woff', '.woff2', '.ttf', '.eot'];
  const ext = path.extname(req.path).toLowerCase();
  
  if (staticExtensions.includes(ext)) {
    const filePath = path.join(__dirname, 'public', req.path);
    if (fs.existsSync(filePath)) {
      return res.sendFile(filePath);
    }
  }
  
  // 对于 API 请求返回 JSON，其他请求返回 HTML
  if (req.path.startsWith('/api/')) {
    res.status(404).json({ success: false, message: '接口不存在' });
  } else {
    res.status(404).send('Not Found');
  }
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

// 全局未捕获异常处理 - 防止进程崩溃
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception - 未捕获的异常', {
    error: error.message,
    stack: error.stack,
    name: error.name
  });
  // 不退出进程，记录错误后继续运行
  // 在生产环境中，可以考虑优雅关闭
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection - 未处理的 Promise 拒绝', {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined
  });
  // 不退出进程，记录错误后继续运行
});

// 初始化数据库并启动服务器
let server;

async function startServer() {
  try {
    await initData();
    
    server = app.listen(PORT, HOST, () => {
      logger.info(`服务器运行在 http://${HOST}:${PORT}`);
      console.log(`\n=================================`);
      console.log(`📱 BOBA TEA Ordering System`);
      console.log(`🚀 服务器: http://${HOST}:${PORT}`);
      console.log(`👤 管理后台: http://${HOST}:${PORT}/admin.html`);
      console.log(`🛒 用户端: http://${HOST}:${PORT}/index.html`);
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
