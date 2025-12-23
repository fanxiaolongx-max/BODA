const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const session = require('express-session');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const https = require('https');

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
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdn.quilljs.com", "https://maxcdn.bootstrapcdn.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://js.stripe.com", "https://cdn.jsdelivr.net", "https://cdn.quilljs.com", "https://static.cloudflareinsights.com"],
      scriptSrcAttr: ["'unsafe-inline'"], // 允许内联事件处理器（onclick等）
      imgSrc: ["'self'", "data:", "blob:", "https://cdn.jsdelivr.net", "https:", "http:"],
      connectSrc: [
        "'self'", 
        "https://api.stripe.com",
        "https://cdn.jsdelivr.net",
        "https://nominatim.openstreetmap.org", // OpenStreetMap地理编码服务（用于地图地址搜索）
        // QZ Tray WebSocket 连接（本地服务）
        // 安全连接 (wss://)
        "wss://localhost:8181",
        "wss://localhost:8282",
        "wss://localhost:8383",
        "wss://localhost:8484",
        "wss://127.0.0.1:8181",
        "wss://127.0.0.1:8282",
        "wss://127.0.0.1:8383",
        "wss://127.0.0.1:8484",
        "wss://localhost.qz.io:8181",
        "wss://localhost.qz.io:8282",
        "wss://localhost.qz.io:8383",
        "wss://localhost.qz.io:8484",
        // 非安全连接 (ws://) - 用于 HTTP 页面
        "ws://localhost:8182",
        "ws://localhost:8283",
        "ws://localhost:8384",
        "ws://localhost:8485",
        "ws://127.0.0.1:8182",
        "ws://127.0.0.1:8283",
        "ws://127.0.0.1:8384",
        "ws://127.0.0.1:8485",
        "ws://localhost.qz.io:8182",
        "ws://localhost.qz.io:8283",
        "ws://localhost.qz.io:8384",
        "ws://localhost.qz.io:8485"
      ],
      fontSrc: ["'self'", "https://cdn.jsdelivr.net", "https://cdn.quilljs.com", "https://maxcdn.bootstrapcdn.com"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'self'", "blob:", "https://js.stripe.com"], // 允许同源iframe、blob URL 和 Stripe Elements iframe
      baseUri: ["'self'"],
      formAction: ["'self'"], // 允许同源表单提交（包括文件上传）
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
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ extended: true, limit: '500mb' }));

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

// 外部API限流器（用于自定义API管理接口）
const externalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 100, // 外部API限制100个请求（建议值）
  message: { success: false, message: '请求过于频繁，请稍后再试', code: 'RATE_LIMIT' },
  standardHeaders: true,
  legacyHeaders: false,
});

// 支持 fly.io 持久化卷：如果 /data 目录存在，使用 /data，否则使用本地目录
const DATA_DIR = fs.existsSync('/data') ? '/data' : __dirname;

// 自定义静态文件中间件，添加CORS头和正确的Content-Type
const staticWithCORS = (root, options = {}) => {
  const staticMiddleware = express.static(root, {
    ...options,
    setHeaders: (res, filePath, stat) => {
      // 获取文件扩展名
      const ext = path.extname(filePath).toLowerCase();
      const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico'];
      const audioExtensions = ['.mp3', '.m4a', '.aac', '.wav', '.ogg'];
      
      if (imageExtensions.includes(ext) || audioExtensions.includes(ext)) {
        // 添加CORS头（满足小程序需求）
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', '*');
        
        // 设置正确的Content-Type
        const mimeTypes = {
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.png': 'image/png',
          '.gif': 'image/gif',
          '.webp': 'image/webp',
          '.svg': 'image/svg+xml',
          '.bmp': 'image/bmp',
          '.ico': 'image/x-icon',
          '.mp3': 'audio/mpeg',
          '.m4a': 'audio/mp4',
          '.aac': 'audio/aac',
          '.wav': 'audio/wav',
          '.ogg': 'audio/ogg'
        };
        
        const contentType = mimeTypes[ext] || (imageExtensions.includes(ext) ? 'image/jpeg' : 'audio/mpeg');
        res.setHeader('Content-Type', contentType);
      }
    }
  });
  
  return (req, res, next) => {
    // 处理OPTIONS预检请求
    if (req.method === 'OPTIONS') {
      const ext = path.extname(req.path).toLowerCase();
      const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico'];
      const audioExtensions = ['.mp3', '.m4a', '.aac', '.wav', '.ogg'];
      if (imageExtensions.includes(ext) || audioExtensions.includes(ext)) {
        // 处理OPTIONS预检请求（满足小程序需求）
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', '*');
        return res.status(200).end();
      }
    }
    
    // 执行静态文件服务
    staticMiddleware(req, res, next);
  };
};

// 静态文件服务（使用自定义中间件，添加CORS支持）
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', staticWithCORS(path.join(DATA_DIR, 'uploads')));

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
app.use('/show', staticWithCORS(actualShowDir));

// 确保必要目录存在
['uploads', 'uploads/products', 'uploads/payments', 'uploads/custom-api-images', 'uploads/tts', 'logs', 'show'].forEach(dir => {
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
const externalRoutes = require('./routes/external');
const blogRoutes = require('./routes/blog');
const blogAdminRoutes = require('./routes/blog-admin');
const ttsRoutes = require('./routes/tts');

// 注册路由
app.use('/api/auth', loginLimiter, authRoutes);
app.use('/api/admin', adminApiLimiter, adminRoutes); // 使用更宽松的管理员API限流器
app.use('/api/user', apiLimiter, userRoutes);
app.use('/api/external', externalApiLimiter, externalRoutes); // 外部API路由（自定义API管理）
app.use('/api/blog', apiLimiter, blogRoutes); // 博客前端API路由
app.use('/api/blog-admin', adminApiLimiter, blogAdminRoutes); // 博客管理API路由
app.use('/api/tts', apiLimiter, ttsRoutes); // TTS语音合成API路由（公开接口，仅限流）

// 堂食扫码登录路由（在public路由之前，提供简洁的URL）
app.get('/dine-in', (req, res) => {
  // 重定向到API端点
  const { table } = req.query;
  if (table) {
    res.redirect(`/api/public/dine-in/login?table=${encodeURIComponent(table)}`);
  } else {
    res.status(400).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>错误</title>
        <meta charset="utf-8">
      </head>
      <body>
        <h1>二维码无效</h1>
        <p>桌号参数缺失，请重新扫描二维码。</p>
      </body>
      </html>
    `);
  }
});

app.use('/api/public', publicRoutes);

// 初始化自定义API路由器（在public路由之后，以便自定义API可以覆盖）
const { initCustomApiRouter } = require('./utils/custom-api-router');
initCustomApiRouter(app);

// QZ Tray 证书路由（在静态文件服务之前，优先从数据库读取）
// 这样可以确保即使文件不存在，也能从数据库获取证书
app.get('/digital-certificate.txt', async (req, res, next) => {
  try {
    const { getAsync } = require('./db/database');
    const certSetting = await getAsync("SELECT value FROM settings WHERE key = 'qz_certificate'");
    
    if (certSetting && certSetting.value) {
      res.setHeader('Content-Type', 'text/plain');
      return res.send(certSetting.value);
    }
    
    // 如果数据库中没有，继续到下一个中间件（静态文件服务）
    next();
  } catch (error) {
    // 出错时继续到下一个中间件
    next();
  }
});

app.get('/private-key.pem', async (req, res, next) => {
  try {
    const { getAsync } = require('./db/database');
    const keySetting = await getAsync("SELECT value FROM settings WHERE key = 'qz_private_key'");
    
    if (keySetting && keySetting.value) {
      res.setHeader('Content-Type', 'text/plain');
      return res.send(keySetting.value);
    }
    
    // 如果数据库中没有，继续到下一个中间件（静态文件服务）
    next();
  } catch (error) {
    // 出错时继续到下一个中间件
    next();
  }
});

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
    
    // 启动定时任务调度器
    const { startScheduler } = require('./utils/scheduler');
    startScheduler();
    
    // 检查是否使用本地 HTTPS（仅本地开发环境）
    // 在 Fly.io 或其他生产环境上，FLY_APP_NAME 会被设置，跳过本地 HTTPS 检查
    const isLocalEnv = process.env.NODE_ENV !== 'production' && !process.env.FLY_APP_NAME;
    
    let certFilesExist = false;
    let certPath = null;
    let keyPath = null;
    
    // 只在本地环境检查证书文件（避免生产环境不必要的文件系统操作）
    if (isLocalEnv) {
      // 支持 boba.app.pem（Stripe 验证通过）或 boba.local.pem
      certPath = fs.existsSync(path.join(__dirname, 'boba.app.pem')) 
        ? path.join(__dirname, 'boba.app.pem')
        : path.join(__dirname, 'boba.local.pem');
      keyPath = fs.existsSync(path.join(__dirname, 'boba.app-key.pem'))
        ? path.join(__dirname, 'boba.app-key.pem')
        : path.join(__dirname, 'boba.local-key.pem');
      certFilesExist = fs.existsSync(certPath) && fs.existsSync(keyPath);
    }
    
    const useLocalHttps = isLocalEnv && (
      process.env.USE_LOCAL_HTTPS === 'true' || 
      process.env.USE_LOCAL_HTTPS === '1' || 
      certFilesExist
    ) && process.env.USE_LOCAL_HTTPS !== 'false';
    
    if (useLocalHttps && isLocalEnv) {
      // 本地环境：使用 mkcert 证书
      if (certFilesExist) {
        const httpsOptions = {
          cert: fs.readFileSync(certPath),
          key: fs.readFileSync(keyPath)
        };
        
        // HTTPS端口：优先使用环境变量，其次使用443（标准HTTPS端口），最后回退到PORT
        // 注意：443端口需要root权限，如果无法绑定会自动回退
        const httpsPort = process.env.HTTPS_PORT 
          ? parseInt(process.env.HTTPS_PORT) 
          : (process.env.USE_STANDARD_HTTPS_PORT === 'true' ? 443 : PORT);
        
        // 调试信息：显示端口选择逻辑
        if (process.env.USE_STANDARD_HTTPS_PORT === 'true' && httpsPort !== 443) {
          logger.warn('USE_STANDARD_HTTPS_PORT=true 但未使用443端口', { 
            httpsPort, 
            HTTPS_PORT: process.env.HTTPS_PORT,
            USE_STANDARD_HTTPS_PORT: process.env.USE_STANDARD_HTTPS_PORT 
          });
        }
        
        // 启动 HTTPS 服务器的辅助函数
        const startHttpsServer = (port) => {
          const httpsServer = https.createServer(httpsOptions, app);
          
          // 监听错误事件，处理端口绑定失败的情况
          httpsServer.on('error', (err) => {
            // 如果443端口绑定失败（通常是因为权限不足），回退到PORT
            if (port === 443 && err.code === 'EACCES') {
              logger.warn('无法绑定443端口（需要root权限），回退到端口' + PORT);
              console.log(`\n⚠️  无法绑定443端口（需要root权限）`);
              console.log(`💡 提示：使用 sudo -E 运行以保留环境变量，或设置 HTTPS_PORT=${PORT} 使用非特权端口\n`);
              
              // 关闭当前server，使用PORT端口重新启动
              httpsServer.close();
              startHttpsServer(PORT);
            } else {
              logger.error('HTTPS服务器启动失败', { error: err.message, port });
              throw err;
            }
          });
          
          // 监听成功事件
          httpsServer.listen(port, HOST, () => {
            logger.info(`服务器运行在 https://${HOST}:${port} (本地 HTTPS)`);
            console.log(`\n=================================`);
            console.log(`📱 BOBA TEA Ordering System`);
            console.log(`🔒 服务器: https://${HOST}:${port} (本地 HTTPS)`);
            if (port === 443) {
              console.log(`🌐 访问地址: https://localhost 或 https://boba.app`);
            }
            const portSuffix = port === 443 ? '' : ':' + port;
            console.log(`👤 管理后台: https://${HOST}${portSuffix}/admin.html`);
            console.log(`🛒 用户端: https://${HOST}${portSuffix}/index.html`);
            console.log(`📝 默认管理员: admin / admin123`);
            console.log(`=================================\n`);
          });
          
          return httpsServer;
        };
        
        // 启动 HTTPS 服务器
        server = startHttpsServer(httpsPort);
      } else {
        logger.warn('本地 HTTPS 证书文件不存在，使用 HTTP 启动');
        logger.warn(`证书路径: ${certPath}`);
        logger.warn(`密钥路径: ${keyPath}`);
        logger.warn('提示: 设置 USE_LOCAL_HTTPS=true 但证书文件不存在，回退到 HTTP');
        // 回退到 HTTP
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
      }
    } else {
      // 生产环境或未启用本地 HTTPS：使用 HTTP（由 Nginx/Fly.io 处理 HTTPS）
      server = app.listen(PORT, HOST, () => {
        const protocol = process.env.NODE_ENV === 'production' ? 'https (via proxy)' : 'http';
        logger.info(`服务器运行在 ${protocol}://${HOST}:${PORT}`);
        console.log(`\n=================================`);
        console.log(`📱 BOBA TEA Ordering System`);
        console.log(`🚀 服务器: ${protocol}://${HOST}:${PORT}`);
        console.log(`👤 管理后台: ${protocol}://${HOST}:${PORT}/admin.html`);
        console.log(`🛒 用户端: ${protocol}://${HOST}:${PORT}/index.html`);
        console.log(`📝 默认管理员: admin / admin123`);
        console.log(`=================================\n`);
      });
    }
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
