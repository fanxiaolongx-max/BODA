const winston = require('winston');
const path = require('path');
const fs = require('fs');
const DailyRotateFile = require('winston-daily-rotate-file');

// 确保日志目录存在
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// 日志格式（详细格式）
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// 控制台格式（详细格式）
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(meta).length > 0) {
      msg += ` ${JSON.stringify(meta)}`;
    }
    return msg;
  })
);

// 按日期归档的文件格式
const dailyRotateFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// 创建logger实例
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  transports: [
    // 错误日志 - 按日期归档
    new DailyRotateFile({
      filename: path.join(logsDir, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxSize: '20m',
      maxFiles: '30d', // 保留30天
      format: dailyRotateFormat
    }),
    // 综合日志 - 按日期归档
    new DailyRotateFile({
      filename: path.join(logsDir, 'combined-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '30d', // 保留30天
      format: dailyRotateFormat
    }),
    // 访问日志 - 按日期归档（记录所有API请求）
    new DailyRotateFile({
      filename: path.join(logsDir, 'access-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '30d',
      format: dailyRotateFormat,
      level: 'info' // 使用 info 级别记录访问日志
    })
  ]
});

// 开发环境添加控制台输出
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: consoleFormat
  }));
}

// 注意：winston-daily-rotate-file 会自动处理日志归档
// 不需要手动设置 http 级别，使用 info 级别记录访问日志即可

// 操作日志记录（写入数据库）
async function logAction(adminId, action, targetType, targetId, details, req) {
  const { runAsync } = require('../db/database');
  try {
    await runAsync(
      `INSERT INTO logs (admin_id, action, target_type, target_id, details, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        adminId,
        action,
        targetType,
        targetId,
        typeof details === 'object' ? JSON.stringify(details) : details,
        req ? (req.ip || req.connection.remoteAddress) : null,
        req ? req.get('user-agent') : null
      ]
    );
  } catch (error) {
    logger.error('记录操作日志失败', { error: error.message, action, targetType });
  }
}

module.exports = {
  logger,
  logAction
};

