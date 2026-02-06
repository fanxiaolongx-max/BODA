const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const https = require('https');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const sharp = require('sharp');
const ffmpeg = require('fluent-ffmpeg');

// 支持 fly.io 持久化卷
const DATA_DIR = fs.existsSync('/data') ? '/data' : path.join(__dirname, '..');
const { runAsync, getAsync, allAsync, beginTransaction, commit, rollback } = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { 
  productValidation, 
  categoryValidation, 
  discountValidation,
  validate
} = require('../middleware/validation');
const { logAction, logger } = require('../utils/logger');
const { body } = require('express-validator');
const { findOrderCycle, findOrderCyclesBatch, isActiveCycle, isOrderExpired } = require('../utils/cycle-helper');
const { batchGetOrderItems, roundAmount } = require('../utils/order-helper');
const cache = require('../utils/cache');
const { backupDatabase, backupFull, getBackupList, restoreDatabase, deleteBackup } = require('../utils/backup');
const archiver = require('archiver');
const AdmZip = require('adm-zip');
const ExcelJS = require('exceljs');
const { cleanupOldFiles, getCleanupInfo } = require('../utils/cleanup');
const { sendCycleExportEmail, testEmailConfig } = require('../utils/email');
const { 
  pushBackupToRemote, 
  shouldPushNow, 
  scheduleNextPush,
  getReceivedBackupDir 
} = require('../utils/remote-backup');
const { requireRemoteBackupAuth } = require('../middleware/remote-backup-auth');

const router = express.Router();

// 清除相关缓存的辅助函数
function clearRelatedCache() {
  cache.delete('public:settings');
  cache.delete('public:categories');
  cache.delete('public:discount-rules');
  // 注意：products缓存需要根据category_id动态清除，这里只清除通用缓存
}

// 高危告警规则（仅检测常见攻击扫描，不影响现有业务）
const HIGH_RISK_ALERT_RULES = [
  { key: 'path_traversal', pattern: /(?:\.\.\/|%2e%2e%2f|%2f%2e%2e|\\\.\.\\|\/\.\.\/)/i, category: 'Path Traversal' },
  { key: 'env_or_secret_probe', pattern: /\/(?:\.env(?:\.[a-z0-9_-]+)?|\.git\/config|\.aws\/credentials|id_rsa|config\.json|wp-config(?:\.bak)?)/i, category: 'Sensitive File Probe' },
  { key: 'wordpress_probe', pattern: /\/(?:wp-admin|wp-login\.php|xmlrpc\.php|wp-content|wp-includes)/i, category: 'WordPress Probe' },
  { key: 'phpmyadmin_probe', pattern: /\/(?:phpmyadmin|pma)\/?/i, category: 'PhpMyAdmin Probe' },
  { key: 'magento_probe', pattern: /\/(?:magento_version|RELEASE_NOTES\.txt)/i, category: 'Magento Probe' },
  { key: 'php_shell_probe', pattern: /\/(?:.*\.php|admin\.php|shell|r57|c99)\b/i, category: 'Webshell Probe' }
];

const HIGH_RISK_SEVERITY = 'high';

function parseLogTimestamp(timestamp) {
  if (!timestamp || typeof timestamp !== 'string') return null;
  const normalized = timestamp.replace(' ', 'T');
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function detectHighRiskAlert(log) {
  const pathValue = typeof log.path === 'string' ? log.path : '';
  const queryValue = log.query ? JSON.stringify(log.query) : '';
  const text = `${pathValue} ${queryValue}`;

  for (const rule of HIGH_RISK_ALERT_RULES) {
    if (rule.pattern.test(text)) {
      return {
        isHighRisk: true,
        ruleKey: rule.key,
        category: rule.category
      };
    }
  }

  return {
    isHighRisk: false,
    ruleKey: null,
    category: null
  };
}

async function getHighRiskAlerts({ hours = 24, limit = 200 }) {
  const safeHours = Math.min(Math.max(parseInt(hours, 10) || 24, 1), 168);
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 200, 1), 2000);
  const cutoff = new Date(Date.now() - safeHours * 60 * 60 * 1000);

  const logsDir = path.join(DATA_DIR, 'logs');
  const files = await fs.promises.readdir(logsDir).catch(() => []);
  const accessFiles = files
    .filter((name) => /^access-\d{4}-\d{2}-\d{2}\.log$/.test(name))
    .sort()
    .slice(-8); // 最多读取最近8天日志，避免无边界扫描

  const alerts = [];

  for (const fileName of accessFiles) {
    const filePath = path.join(logsDir, fileName);
    let content = '';

    try {
      content = await fs.promises.readFile(filePath, 'utf8');
    } catch (error) {
      logger.warn('读取访问日志失败', { filePath, error: error.message });
      continue;
    }

    const lines = content.split('\n');
    for (const line of lines) {
      if (!line || !line.includes('"message":"HTTP Request"')) continue;

      let log;
      try {
        log = JSON.parse(line);
      } catch (error) {
        continue;
      }

      const logTime = parseLogTimestamp(log.timestamp);
      if (!logTime || logTime < cutoff) continue;

      const risk = detectHighRiskAlert(log);
      if (!risk.isHighRisk) continue;

      alerts.push({
        timestamp: log.timestamp || '',
        method: log.method || '-',
        path: log.path || '-',
        query: log.query || null,
        statusCode: typeof log.statusCode === 'number' ? log.statusCode : null,
        ip: log.ip || '-',
        userAgent: log.userAgent || '-',
        category: risk.category,
        ruleKey: risk.ruleKey,
        sourceFile: fileName,
        rawLog: line
      });
    }
  }

  alerts.sort((a, b) => {
    const ta = parseLogTimestamp(a.timestamp)?.getTime() || 0;
    const tb = parseLogTimestamp(b.timestamp)?.getTime() || 0;
    return tb - ta;
  });

  const limitedAlerts = alerts.slice(0, safeLimit);
  const ipCounter = {};
  const categoryCounter = {};

  for (const alert of limitedAlerts) {
    ipCounter[alert.ip] = (ipCounter[alert.ip] || 0) + 1;
    categoryCounter[alert.category] = (categoryCounter[alert.category] || 0) + 1;
  }

  const topIps = Object.entries(ipCounter)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([ip, count]) => ({ ip, count }));

  const topCategories = Object.entries(categoryCounter)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([category, count]) => ({ category, count }));

  return {
    hours: safeHours,
    limit: safeLimit,
    total: alerts.length,
    alerts: limitedAlerts,
    topIps,
    topCategories
  };
}

function createAlertHash(alert) {
  const payload = [
    alert.timestamp || '',
    alert.method || '',
    alert.path || '',
    JSON.stringify(alert.query || {}),
    String(alert.statusCode ?? ''),
    alert.ip || '',
    alert.ruleKey || ''
  ].join('|');
  return crypto.createHash('sha1').update(payload).digest('hex');
}

async function getTelegramConfig() {
  const rows = await allAsync(
    `SELECT key, value FROM settings WHERE key IN (
      'telegram_alert_enabled',
      'telegram_bot_token',
      'telegram_chat_id'
    )`
  );
  const config = {
    enabled: false,
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    chatId: process.env.TELEGRAM_CHAT_ID || ''
  };

  rows.forEach((row) => {
    if (row.key === 'telegram_alert_enabled') {
      config.enabled = String(row.value) === 'true';
    }
    if (row.key === 'telegram_bot_token' && row.value) {
      config.botToken = String(row.value);
    }
    if (row.key === 'telegram_chat_id' && row.value) {
      config.chatId = String(row.value);
    }
  });

  return config;
}

function sendTelegramMessage(botToken, chatId, text) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true
    });

    const req = https.request(
      {
        hostname: 'api.telegram.org',
        path: `/bot${botToken}/sendMessage`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        },
        timeout: 8000
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve();
            return;
          }
          reject(new Error(`Telegram API ${res.statusCode}: ${body}`));
        });
      }
    );

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error('Telegram request timeout'));
    });
    req.write(payload);
    req.end();
  });
}

async function pushAlertToTelegramIfEnabled(alertId, alert) {
  try {
    const telegramConfig = await getTelegramConfig();
    if (!telegramConfig.enabled || !telegramConfig.botToken || !telegramConfig.chatId) {
      return false;
    }

    const message = [
      '<b>High Risk Alert</b>',
      `Time: ${alert.timestamp || '-'}`,
      `Category: ${alert.category || '-'}`,
      `Method: ${alert.method || '-'}`,
      `Path: ${alert.path || '-'}`,
      `Status: ${alert.statusCode ?? '-'}`,
      `IP: ${alert.ip || '-'}`,
      `Rule: ${alert.ruleKey || '-'}`
    ].join('\n');

    await sendTelegramMessage(telegramConfig.botToken, telegramConfig.chatId, message);
    await runAsync(
      `UPDATE security_alerts
       SET telegram_sent = 1,
           telegram_sent_at = datetime('now', 'localtime'),
           updated_at = datetime('now', 'localtime')
       WHERE id = ?`,
      [alertId]
    );
    return true;
  } catch (error) {
    logger.warn('发送 Telegram 告警失败', { error: error.message });
    return false;
  }
}

async function persistHighRiskAlerts({ hours = 24, limit = 200, sendTelegram = true }) {
  const scanResult = await getHighRiskAlerts({ hours, limit });
  let inserted = 0;
  let duplicate = 0;
  let telegramSent = 0;

  for (const alert of scanResult.alerts) {
    const alertHash = createAlertHash(alert);
    const insertResult = await runAsync(
      `INSERT OR IGNORE INTO security_alerts (
        alert_hash, alert_time, method, path, query, status_code, ip, user_agent,
        category, rule_key, severity, source_file, raw_log, is_read, telegram_sent, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, datetime('now', 'localtime'))`,
      [
        alertHash,
        alert.timestamp || '',
        alert.method || '',
        alert.path || '',
        JSON.stringify(alert.query || {}),
        alert.statusCode,
        alert.ip || '',
        alert.userAgent || '',
        alert.category || '',
        alert.ruleKey || '',
        HIGH_RISK_SEVERITY,
        alert.sourceFile || '',
        alert.rawLog || ''
      ]
    );

    if (insertResult && insertResult.changes > 0) {
      inserted += 1;
      if (sendTelegram && insertResult.id) {
        const sent = await pushAlertToTelegramIfEnabled(insertResult.id, alert);
        if (sent) telegramSent += 1;
      }
    } else {
      duplicate += 1;
    }
  }

  return {
    inserted,
    duplicate,
    scanned: scanResult.total,
    telegramSent
  };
}

async function insertSecurityAlertRecord(record, sendTelegram = true) {
  const insertResult = await runAsync(
    `INSERT OR IGNORE INTO security_alerts (
      alert_hash, alert_time, method, path, query, status_code, ip, user_agent,
      category, rule_key, severity, source_file, raw_log, is_read, telegram_sent, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, datetime('now', 'localtime'))`,
    [
      record.alertHash,
      record.alertTime || '',
      record.method || '',
      record.path || '',
      JSON.stringify(record.query || {}),
      record.statusCode ?? null,
      record.ip || '',
      record.userAgent || '',
      record.category || '',
      record.ruleKey || '',
      HIGH_RISK_SEVERITY,
      record.sourceFile || '',
      record.rawLog || ''
    ]
  );

  if (!insertResult || insertResult.changes === 0) {
    return { inserted: 0, duplicate: 1, telegramSent: 0 };
  }

  let telegramSent = 0;
  if (sendTelegram && insertResult.id) {
    const sent = await pushAlertToTelegramIfEnabled(insertResult.id, {
      timestamp: record.alertTime || '',
      method: record.method || '',
      path: record.path || '',
      statusCode: record.statusCode ?? null,
      ip: record.ip || '',
      category: record.category || '',
      ruleKey: record.ruleKey || ''
    });
    telegramSent = sent ? 1 : 0;
  }

  return { inserted: 1, duplicate: 0, telegramSent };
}

async function persistAuthSecurityAlerts({ hours = 24, sendTelegram = true }) {
  const safeHours = Math.min(Math.max(parseInt(hours, 10) || 24, 1), 168);
  const timeArg = `-${safeHours} hours`;
  let inserted = 0;
  let duplicate = 0;
  let telegramSent = 0;

  // 1) 登录审计中的明确高危失败（锁定/拉黑）
  const lockedOrBlockedAttempts = await allAsync(
    `SELECT account_type, account_identifier, ip_address, user_agent, failure_reason, created_at
     FROM login_attempts_audit
     WHERE success = 0
       AND created_at >= datetime('now', ?, 'localtime')
       AND (
         LOWER(COALESCE(failure_reason, '')) LIKE '%blocked%'
         OR LOWER(COALESCE(failure_reason, '')) LIKE '%locked%'
       )
     ORDER BY created_at DESC
     LIMIT 1000`,
    [timeArg]
  );

  for (const row of lockedOrBlockedAttempts) {
    const reasonText = String(row.failure_reason || '').toLowerCase();
    const isIpBlocked = reasonText.includes('blocked');
    const category = isIpBlocked ? 'Login Blocked Attempt' : 'Login Locked Attempt';
    const ruleKey = isIpBlocked ? 'login_blocked_attempt' : 'login_locked_attempt';
    const path = `/api/auth/${row.account_type || 'unknown'}/login`;
    const method = 'POST';
    const hash = crypto
      .createHash('sha1')
      .update(['audit', row.created_at, row.account_type, row.account_identifier, row.ip_address, row.failure_reason].join('|'))
      .digest('hex');

    const result = await insertSecurityAlertRecord(
      {
        alertHash: hash,
        alertTime: row.created_at,
        method,
        path,
        query: {
          accountType: row.account_type,
          accountIdentifier: row.account_identifier,
          failureReason: row.failure_reason
        },
        statusCode: 403,
        ip: row.ip_address || '',
        userAgent: row.user_agent || '',
        category,
        ruleKey,
        sourceFile: 'login_attempts_audit',
        rawLog: JSON.stringify(row)
      },
      sendTelegram
    );
    inserted += result.inserted;
    duplicate += result.duplicate;
    telegramSent += result.telegramSent;
  }

  // 2) 高频失败登录（疑似爆破）
  const bruteForceAttempts = await allAsync(
    `SELECT
       account_type,
       account_identifier,
       ip_address,
       COUNT(*) AS failed_count,
       MAX(created_at) AS last_time
     FROM login_attempts_audit
     WHERE success = 0
       AND created_at >= datetime('now', ?, 'localtime')
     GROUP BY account_type, account_identifier, ip_address
     HAVING COUNT(*) >= 8
     ORDER BY failed_count DESC
     LIMIT 300`,
    [timeArg]
  );

  for (const row of bruteForceAttempts) {
    const path = `/api/auth/${row.account_type || 'unknown'}/login`;
    const hash = crypto
      .createHash('sha1')
      .update(['bruteforce', row.last_time, row.account_type, row.account_identifier, row.ip_address, row.failed_count].join('|'))
      .digest('hex');

    const result = await insertSecurityAlertRecord(
      {
        alertHash: hash,
        alertTime: row.last_time,
        method: 'POST',
        path,
        query: {
          accountType: row.account_type,
          accountIdentifier: row.account_identifier,
          failedCount: row.failed_count
        },
        statusCode: 401,
        ip: row.ip_address || '',
        userAgent: '',
        category: 'Bruteforce Suspected',
        ruleKey: 'login_bruteforce_suspected',
        sourceFile: 'login_attempts_audit',
        rawLog: JSON.stringify(row)
      },
      sendTelegram
    );
    inserted += result.inserted;
    duplicate += result.duplicate;
    telegramSent += result.telegramSent;
  }

  // 3) 当前锁定的管理员账户
  const lockedAdmins = await allAsync(
    `SELECT username, failed_count, locked_until, last_attempt_at
     FROM admin_login_attempts
     WHERE locked_until IS NOT NULL
       AND locked_until > datetime('now', 'localtime')
     ORDER BY locked_until DESC
     LIMIT 300`
  );

  for (const row of lockedAdmins) {
    const hash = crypto
      .createHash('sha1')
      .update(['admin_locked', row.username, row.locked_until].join('|'))
      .digest('hex');

    const result = await insertSecurityAlertRecord(
      {
        alertHash: hash,
        alertTime: row.last_attempt_at || row.locked_until,
        method: 'AUTH',
        path: '/api/auth/admin/login',
        query: {
          username: row.username,
          failedCount: row.failed_count,
          lockedUntil: row.locked_until
        },
        statusCode: 403,
        ip: '',
        userAgent: '',
        category: 'Admin Account Locked',
        ruleKey: 'admin_account_locked',
        sourceFile: 'admin_login_attempts',
        rawLog: JSON.stringify(row)
      },
      sendTelegram
    );
    inserted += result.inserted;
    duplicate += result.duplicate;
    telegramSent += result.telegramSent;
  }

  // 4) 当前锁定的普通用户账户
  const lockedUsers = await allAsync(
    `SELECT phone, failed_count, locked_until, last_attempt_at
     FROM user_login_attempts
     WHERE locked_until IS NOT NULL
       AND locked_until > datetime('now', 'localtime')
     ORDER BY locked_until DESC
     LIMIT 1000`
  );

  for (const row of lockedUsers) {
    const hash = crypto
      .createHash('sha1')
      .update(['user_locked', row.phone, row.locked_until].join('|'))
      .digest('hex');

    const result = await insertSecurityAlertRecord(
      {
        alertHash: hash,
        alertTime: row.last_attempt_at || row.locked_until,
        method: 'AUTH',
        path: '/api/auth/user/login',
        query: {
          phone: row.phone,
          failedCount: row.failed_count,
          lockedUntil: row.locked_until
        },
        statusCode: 403,
        ip: '',
        userAgent: '',
        category: 'User Account Locked',
        ruleKey: 'user_account_locked',
        sourceFile: 'user_login_attempts',
        rawLog: JSON.stringify(row)
      },
      sendTelegram
    );
    inserted += result.inserted;
    duplicate += result.duplicate;
    telegramSent += result.telegramSent;
  }

  // 5) 当前被拉黑IP
  const blockedIps = await allAsync(
    `SELECT ip_address, failed_count, blocked_until, last_attempt_at
     FROM ip_login_attempts
     WHERE blocked_until IS NOT NULL
       AND blocked_until > datetime('now', 'localtime')
     ORDER BY blocked_until DESC
     LIMIT 1000`
  );

  for (const row of blockedIps) {
    const hash = crypto
      .createHash('sha1')
      .update(['ip_blocked', row.ip_address, row.blocked_until].join('|'))
      .digest('hex');

    const result = await insertSecurityAlertRecord(
      {
        alertHash: hash,
        alertTime: row.last_attempt_at || row.blocked_until,
        method: 'AUTH',
        path: '/api/auth/*/login',
        query: {
          blockedUntil: row.blocked_until,
          failedCount: row.failed_count
        },
        statusCode: 403,
        ip: row.ip_address || '',
        userAgent: '',
        category: 'IP Blocked',
        ruleKey: 'ip_blocked',
        sourceFile: 'ip_login_attempts',
        rawLog: JSON.stringify(row)
      },
      sendTelegram
    );
    inserted += result.inserted;
    duplicate += result.duplicate;
    telegramSent += result.telegramSent;
  }

  return {
    inserted,
    duplicate,
    scanned: lockedOrBlockedAttempts.length + bruteForceAttempts.length + lockedAdmins.length + lockedUsers.length + blockedIps.length,
    telegramSent
  };
}

async function syncSecurityAlerts({ hours = 24, limit = 200, sendTelegram = true }) {
  const scanResult = await persistHighRiskAlerts({ hours, limit, sendTelegram });
  const authResult = await persistAuthSecurityAlerts({ hours, sendTelegram });
  return {
    inserted: scanResult.inserted + authResult.inserted,
    duplicate: scanResult.duplicate + authResult.duplicate,
    scanned: scanResult.scanned + authResult.scanned,
    telegramSent: scanResult.telegramSent + authResult.telegramSent,
    breakdown: {
      webRisk: scanResult,
      authRisk: authResult
    }
  };
}

async function listPersistedHighRiskAlerts({ hours = 24, limit = 200, unreadOnly = false }) {
  const safeHours = Math.min(Math.max(parseInt(hours, 10) || 24, 1), 168);
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 200, 1), 2000);

  let whereClause = `severity = ? AND alert_time >= datetime('now', ?, 'localtime')`;
  const whereParams = [HIGH_RISK_SEVERITY, `-${safeHours} hours`];

  if (unreadOnly) {
    whereClause += ' AND is_read = 0';
  }

  const alerts = await allAsync(
    `SELECT id, alert_time, method, path, query, status_code, ip, user_agent, category, rule_key, is_read, telegram_sent, created_at
     FROM security_alerts
     WHERE ${whereClause}
     ORDER BY alert_time DESC
     LIMIT ?`,
    [...whereParams, safeLimit]
  );

  const summaryRow = await getAsync(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END) AS unread,
       COUNT(DISTINCT ip) AS unique_ips
     FROM security_alerts
     WHERE ${whereClause}`,
    whereParams
  );

  const topIps = await allAsync(
    `SELECT ip, COUNT(*) AS count
     FROM security_alerts
     WHERE ${whereClause}
     GROUP BY ip
     ORDER BY count DESC
     LIMIT 10`,
    whereParams
  );

  const topCategories = await allAsync(
    `SELECT category, COUNT(*) AS count
     FROM security_alerts
     WHERE ${whereClause}
     GROUP BY category
     ORDER BY count DESC
     LIMIT 10`,
    whereParams
  );

  const normalizedAlerts = alerts.map((a) => {
    let parsedQuery = null;
    if (a.query) {
      try {
        parsedQuery = JSON.parse(a.query);
      } catch (error) {
        parsedQuery = a.query;
      }
    }
    return {
      id: a.id,
      timestamp: a.alert_time,
      method: a.method,
      path: a.path,
      query: parsedQuery,
      statusCode: a.status_code,
      ip: a.ip,
      userAgent: a.user_agent,
      category: a.category,
      ruleKey: a.rule_key,
      isRead: a.is_read === 1,
      telegramSent: a.telegram_sent === 1,
      createdAt: a.created_at
    };
  });

  return {
    summary: {
      hours: safeHours,
      total: summaryRow?.total || 0,
      unread: summaryRow?.unread || 0,
      returned: normalizedAlerts.length,
      uniqueIps: summaryRow?.unique_ips || 0
    },
    topIps,
    topCategories,
    alerts: normalizedAlerts
  };
}

// ==================== 远程备份接收 API（需要在 requireAuth 之前注册）====================
/**
 * POST /api/admin/remote-backup/receive
 * 接收远程推送的备份文件（需要token验证，不需要管理员登录）
 */
const receiveBackupUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const receivedDir = getReceivedBackupDir();
      if (!fs.existsSync(receivedDir)) {
        fs.mkdirSync(receivedDir, { recursive: true });
      }
      cb(null, receivedDir);
    },
    filename: (req, file, cb) => {
      // 保持原始文件名，添加时间戳前缀避免冲突
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const ext = path.extname(file.originalname);
      const baseName = path.basename(file.originalname, ext);
      cb(null, `${timestamp}-${baseName}${ext}`);
    }
  }),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
  fileFilter: (req, file, cb) => {
    // 只允许 .zip 文件（完整备份）
    if (file.originalname.endsWith('.zip')) {
      cb(null, true);
    } else {
      cb(new Error('Only .zip backup files are allowed'));
    }
  }
});

router.post('/remote-backup/receive', requireRemoteBackupAuth, receiveBackupUpload.single('backupFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    const fileName = req.file.filename;
    const filePath = req.file.path;
    const fileSize = req.file.size;
    const sourceUrl = req.headers['x-source-url'] || req.headers['X-Source-URL'] || 'unknown';

    // 验证ZIP文件格式
    try {
      const AdmZip = require('adm-zip');
      const zip = new AdmZip(filePath);
      zip.getEntries(); // 尝试读取ZIP内容
    } catch (error) {
      fs.unlinkSync(filePath);
      return res.status(400).json({
        success: false,
        message: 'Invalid ZIP file format'
      });
    }

    // 记录接收到的备份
    await runAsync(
      `INSERT INTO backup_received (backup_file_name, source_url, file_size, status)
       VALUES (?, ?, ?, 'received')`,
      [fileName, sourceUrl, fileSize]
    );

    // 获取接收配置
    const receiveConfig = await getAsync('SELECT * FROM backup_receive_config LIMIT 1');
    const autoRestore = receiveConfig && receiveConfig.auto_restore === 1;

    let restoreResult = null;
    if (autoRestore) {
      // 自动恢复
      try {
        // 将接收到的文件移动到备份目录以便恢复
        const { BACKUP_DIR } = require('../utils/backup');
        const targetPath = path.join(BACKUP_DIR, fileName);
        fs.renameSync(filePath, targetPath);

        restoreResult = await restoreDatabase(fileName);

        if (restoreResult.success) {
          await runAsync(
            `UPDATE backup_received 
             SET status = 'restored', restored_at = datetime('now', 'localtime')
             WHERE backup_file_name = ?`,
            [fileName]
          );
        } else {
          await runAsync(
            `UPDATE backup_received 
             SET status = 'failed'
             WHERE backup_file_name = ?`,
            [fileName]
          );
        }
      } catch (error) {
        logger.error('自动恢复失败', { fileName, error: error.message });
        await runAsync(
          `UPDATE backup_received 
           SET status = 'failed'
           WHERE backup_file_name = ?`,
          [fileName]
        );
        restoreResult = { success: false, message: error.message };
      }
    }

    logger.info('接收备份文件成功', { 
      fileName, 
      sourceUrl, 
      fileSize, 
      autoRestore,
      restoreSuccess: restoreResult ? restoreResult.success : null
    });

    res.json({
      success: true,
      fileName: fileName,
      sizeMB: (fileSize / 1024 / 1024).toFixed(2),
      autoRestore: autoRestore,
      restoreResult: restoreResult
    });
  } catch (error) {
    logger.error('接收备份文件失败', { error: error.message });
    
    // 如果上传失败，删除文件
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({
      success: false,
      message: 'Failed to receive backup file: ' + error.message
    });
  }
});

// ==================== 其他路由（需要管理员登录）====================
// 所有其他管理员路由都需要认证
router.use(requireAuth);

// 配置文件上传（菜单图片）
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(DATA_DIR, 'uploads/products');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `product-${Date.now()}-${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error('只支持图片格式'));
    }
  }
});

// 图片压缩函数（针对产品图片，用户端显示较小）
async function compressProductImage(imagePath) {
  try {
    const stats = await fs.promises.stat(imagePath);
    const originalSize = stats.size;
    
    // 读取图片信息
    const metadata = await sharp(imagePath).metadata();
    
    // 计算目标尺寸（用户端显示为 80x80，但保留一些余量，设置为 200x200）
    const maxWidth = 200;
    const maxHeight = 200;
    
    // 如果图片已经很小，不需要压缩
    if (metadata.width <= maxWidth && metadata.height <= maxHeight && originalSize < 50 * 1024) {
      return { compressed: false, originalSize, finalSize: originalSize };
    }
    
    // 压缩图片：调整大小、转换为 JPEG 格式、降低质量
    const compressedBuffer = await sharp(imagePath)
      .resize(maxWidth, maxHeight, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .jpeg({ quality: 80, mozjpeg: true }) // 转换为 JPEG，质量 80%
      .toBuffer();
    
    // 覆盖原文件
    await fs.promises.writeFile(imagePath, compressedBuffer);
    
    const finalSize = compressedBuffer.length;
    const compressionRatio = ((1 - finalSize / originalSize) * 100).toFixed(1);
    
    logger.info('图片压缩完成', {
      file: path.basename(imagePath),
      originalSize: `${(originalSize / 1024).toFixed(2)} KB`,
      finalSize: `${(finalSize / 1024).toFixed(2)} KB`,
      compressionRatio: `${compressionRatio}%`
    });
    
    return { compressed: true, originalSize, finalSize, compressionRatio };
  } catch (error) {
    logger.error('图片压缩失败', { error: error.message, file: imagePath });
    // 压缩失败不影响上传，返回原文件
    return { compressed: false, error: error.message };
  }
}

// ==================== 菜单分类管理 ====================

// 获取所有分类
router.get('/categories', async (req, res) => {
  try {
    const categories = await allAsync(
      'SELECT * FROM categories ORDER BY sort_order, id'
    );
    res.json({ success: true, categories });
  } catch (error) {
    logger.error('获取分类失败', { error: error.message });
    res.status(500).json({ success: false, message: '获取分类失败' });
  }
});

// 创建分类
router.post('/categories', categoryValidation, async (req, res) => {
  try {
    const { name, description, sort_order, status } = req.body;
    
    const result = await runAsync(
      'INSERT INTO categories (name, description, sort_order, status) VALUES (?, ?, ?, ?)',
      [name, description || '', sort_order || 0, status || 'active']
    );

    await logAction(req.session.adminId, 'CREATE', 'category', result.id, { name }, req);
    
    // 清除相关缓存
    clearRelatedCache();

    res.json({ success: true, message: '分类创建成功', id: result.id });
  } catch (error) {
    logger.error('创建分类失败', { error: error.message });
    res.status(500).json({ success: false, message: '创建分类失败' });
  }
});

// 更新分类
router.put('/categories/:id', categoryValidation, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, sort_order, status } = req.body;

    await runAsync(
      "UPDATE categories SET name = ?, description = ?, sort_order = ?, status = ?, updated_at = datetime('now', 'localtime') WHERE id = ?",
      [name, description || '', sort_order || 0, status || 'active', id]
    );

    await logAction(req.session.adminId, 'UPDATE', 'category', id, { name }, req);
    
    // 清除相关缓存
    clearRelatedCache();

    res.json({ success: true, message: '分类更新成功' });
  } catch (error) {
    logger.error('更新分类失败', { error: error.message });
    res.status(500).json({ success: false, message: '更新分类失败' });
  }
});

// 删除分类
router.delete('/categories/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // 检查是否有商品使用此分类
    const productCount = await getAsync(
      'SELECT COUNT(*) as count FROM products WHERE category_id = ?',
      [id]
    );

    if (productCount.count > 0) {
      return res.status(400).json({ 
        success: false, 
        message: '该分类下还有商品，无法删除' 
      });
    }

    await runAsync('DELETE FROM categories WHERE id = ?', [id]);
    await logAction(req.session.adminId, 'DELETE', 'category', id, null, req);
    
    // 清除相关缓存
    clearRelatedCache();

    res.json({ success: true, message: '分类删除成功' });
  } catch (error) {
    logger.error('删除分类失败', { error: error.message });
    res.status(500).json({ success: false, message: '删除分类失败' });
  }
});

// ==================== 菜单管理 ====================

// 获取所有菜品
router.get('/products', async (req, res) => {
  try {
    const { category_id, status } = req.query;
    let sql = `
      SELECT p.*, c.name as category_name 
      FROM products p 
      LEFT JOIN categories c ON p.category_id = c.id 
      WHERE 1=1
    `;
    const params = [];

    if (category_id) {
      sql += ' AND p.category_id = ?';
      params.push(category_id);
    }

    if (status) {
      sql += ' AND p.status = ?';
      params.push(status);
    }

    sql += ' ORDER BY p.category_id, p.sort_order, p.id';

    const products = await allAsync(sql, params);
    res.json({ success: true, products });
  } catch (error) {
    logger.error('获取菜品失败', { error: error.message });
    res.status(500).json({ success: false, message: '获取菜品失败' });
  }
});

// 创建菜品
router.post('/products', upload.single('image'), async (req, res) => {
  try {
    const { name, description, price, category_id, sort_order, status, sizes, ice_options } = req.body;
    
    // 如果有上传图片，先压缩
    if (req.file) {
      const imagePath = path.join(DATA_DIR, 'uploads/products', req.file.filename);
      await compressProductImage(imagePath);
    }
    
    const image_url = req.file ? `/uploads/products/${req.file.filename}` : null;
    
    // 处理杯型价格
    let sizesJson = '{}';
    if (sizes !== undefined && sizes !== null && sizes !== '') {
      try {
        // FormData 中的字段都是字符串，需要解析 JSON
        const parsedSizes = typeof sizes === 'string' ? JSON.parse(sizes) : sizes;
        // 确保解析后的对象有效
        if (parsedSizes && typeof parsedSizes === 'object') {
          sizesJson = JSON.stringify(parsedSizes);
        } else {
          sizesJson = '{}';
        }
      } catch (e) {
        logger.error('Invalid sizes format', { error: e.message, sizes, body: req.body });
        sizesJson = '{}';
      }
    }

    // 处理甜度选项（默认空数组，表示不支持甜度选择）
    let sugarLevelsJson = '[]';
    if (req.body.sugar_levels !== undefined) {
      const sugarLevelsValue = req.body.sugar_levels;
      if (sugarLevelsValue && sugarLevelsValue !== '' && sugarLevelsValue !== '[]') {
        try {
          const parsedSugarLevels = typeof sugarLevelsValue === 'string' ? JSON.parse(sugarLevelsValue) : sugarLevelsValue;
          if (Array.isArray(parsedSugarLevels)) {
            sugarLevelsJson = JSON.stringify(parsedSugarLevels);
          }
        } catch (e) {
          logger.error('Invalid sugar_levels format', { error: e.message, sugarLevelsValue });
        }
      } else if (sugarLevelsValue === '[]' || sugarLevelsValue === '') {
        sugarLevelsJson = '[]'; // 不支持甜度选择
      }
    }
    
    // 处理可选加料
    let availableToppingsJson = '[]';
    if (req.body.available_toppings !== undefined) {
      const toppingsValue = req.body.available_toppings;
      // 重要：即使是空数组也要保存
      if (toppingsValue !== undefined && toppingsValue !== null) {
        try {
          const parsedToppings = typeof toppingsValue === 'string' ? JSON.parse(toppingsValue) : toppingsValue;
          if (Array.isArray(parsedToppings)) {
            availableToppingsJson = JSON.stringify(parsedToppings);
          } else {
            availableToppingsJson = '[]';
          }
        } catch (e) {
          logger.error('Invalid available_toppings format', { error: e.message, toppingsValue });
          availableToppingsJson = '[]';
        }
      } else if (toppingsValue === '[]' || toppingsValue === '') {
        availableToppingsJson = '[]';
      }
    }
    
    // 处理冰度选项（默认空数组，表示不支持冰度选择）
    let iceOptionsJson = '[]';
    if (req.body.ice_options !== undefined) {
      const iceOptionsValue = req.body.ice_options;
      if (iceOptionsValue && iceOptionsValue !== '' && iceOptionsValue !== '[]') {
        try {
          const parsedIceOptions = typeof iceOptionsValue === 'string' ? JSON.parse(iceOptionsValue) : iceOptionsValue;
          if (Array.isArray(parsedIceOptions)) {
            iceOptionsJson = JSON.stringify(parsedIceOptions);
          }
        } catch (e) {
          logger.error('Invalid ice_options format', { error: e.message, iceOptionsValue });
          iceOptionsJson = '[]';
        }
      } else if (iceOptionsValue === '[]' || iceOptionsValue === '') {
        iceOptionsJson = '[]'; // 不支持冰度选择
      }
    }

    const result = await runAsync(
      `INSERT INTO products (name, description, price, category_id, image_url, sort_order, status, sizes, sugar_levels, available_toppings, ice_options) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, description || '', price, category_id || null, image_url, sort_order || 0, status || 'active', sizesJson, sugarLevelsJson, availableToppingsJson, iceOptionsJson]
    );

    await logAction(req.session.adminId, 'CREATE', 'product', result.id, { name, price, sizes: sizesJson }, req);
    
    // 清除相关缓存
    clearRelatedCache();

    res.json({ success: true, message: '菜品创建成功', id: result.id });
  } catch (error) {
    logger.error('创建菜品失败', { error: error.message });
    res.status(500).json({ success: false, message: '创建菜品失败' });
  }
});

// 更新菜品
router.put('/products/:id', upload.single('image'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, price, category_id, sort_order, status, sizes, available_toppings, ice_options } = req.body;

    // 获取原有数据
    const oldProduct = await getAsync('SELECT * FROM products WHERE id = ?', [id]);
    if (!oldProduct) {
      return res.status(404).json({ success: false, message: '菜品不存在' });
    }

    // 如果有新上传的图片，先压缩
    if (req.file) {
      const imagePath = path.join(DATA_DIR, 'uploads/products', req.file.filename);
      await compressProductImage(imagePath);
    }

    const image_url = req.file ? `/uploads/products/${req.file.filename}` : oldProduct.image_url;
    
    // 处理杯型价格
    // 注意：使用 multer 时，req.body 中的字段都是字符串
    let sizesJson = oldProduct.sizes || '{}';
    
    // 检查 sizes 字段是否存在（即使是空字符串也要处理）
    if (req.body.sizes !== undefined) {
      const sizesValue = req.body.sizes;
      logger.info('Received sizes from form data', { sizesValue, type: typeof sizesValue });
      
      if (sizesValue && sizesValue !== '' && sizesValue !== '{}') {
        try {
          // FormData 中的字段都是字符串，需要解析 JSON
          const parsedSizes = typeof sizesValue === 'string' ? JSON.parse(sizesValue) : sizesValue;
          // 确保解析后的对象有效
          if (parsedSizes && typeof parsedSizes === 'object' && !Array.isArray(parsedSizes)) {
            sizesJson = JSON.stringify(parsedSizes);
          } else {
            logger.warn('Parsed sizes is not a valid object', { parsedSizes });
            sizesJson = oldProduct.sizes || '{}';
          }
        } catch (e) {
          logger.error('Invalid sizes format', { error: e.message, sizesValue, body: req.body });
          sizesJson = oldProduct.sizes || '{}';
        }
      } else if (sizesValue === '{}' || sizesValue === '') {
        // 如果 sizes 是空对象或空字符串，保存为空对象
        sizesJson = '{}';
      }
    }
    
    // 处理甜度选项
    let sugarLevelsJson = oldProduct.sugar_levels || '["0","30","50","70","100"]';
    if (req.body.sugar_levels !== undefined) {
      const sugarLevelsValue = req.body.sugar_levels;
      if (sugarLevelsValue && sugarLevelsValue !== '' && sugarLevelsValue !== '[]') {
        try {
          const parsedSugarLevels = typeof sugarLevelsValue === 'string' ? JSON.parse(sugarLevelsValue) : sugarLevelsValue;
          if (Array.isArray(parsedSugarLevels)) {
            sugarLevelsJson = JSON.stringify(parsedSugarLevels);
          }
        } catch (e) {
          logger.error('Invalid sugar_levels format', { error: e.message, sugarLevelsValue });
          sugarLevelsJson = oldProduct.sugar_levels || '["0","30","50","70","100"]';
        }
      } else if (sugarLevelsValue === '[]' || sugarLevelsValue === '') {
        sugarLevelsJson = '[]'; // 不允许选择甜度
      }
    }
    
    // 处理可选加料
    let availableToppingsJson = oldProduct.available_toppings || '[]';
    if (req.body.available_toppings !== undefined) {
      const toppingsValue = req.body.available_toppings;
      // 重要：即使是空数组也要保存
      if (toppingsValue !== undefined && toppingsValue !== null) {
        try {
          const parsedToppings = typeof toppingsValue === 'string' ? JSON.parse(toppingsValue) : toppingsValue;
          if (Array.isArray(parsedToppings)) {
            availableToppingsJson = JSON.stringify(parsedToppings);
          } else {
            availableToppingsJson = '[]';
          }
        } catch (e) {
          logger.error('Invalid available_toppings format', { error: e.message, toppingsValue });
          availableToppingsJson = oldProduct.available_toppings || '[]';
        }
      } else if (toppingsValue === '[]' || toppingsValue === '') {
        availableToppingsJson = '[]';
      }
    }
    
    // 处理冰度选项
    let iceOptionsJson = oldProduct.ice_options || '["normal","less","no","room","hot"]';
    if (req.body.ice_options !== undefined) {
      const iceOptionsValue = req.body.ice_options;
      if (iceOptionsValue && iceOptionsValue !== '' && iceOptionsValue !== '[]') {
        try {
          const parsedIceOptions = typeof iceOptionsValue === 'string' ? JSON.parse(iceOptionsValue) : iceOptionsValue;
          if (Array.isArray(parsedIceOptions)) {
            iceOptionsJson = JSON.stringify(parsedIceOptions);
          }
        } catch (e) {
          logger.error('Invalid ice_options format', { error: e.message, iceOptionsValue });
          iceOptionsJson = oldProduct.ice_options || '["normal","less","no","room","hot"]';
        }
      } else if (iceOptionsValue === '[]' || iceOptionsValue === '') {
        iceOptionsJson = '[]'; // 不允许选择冰度
      }
    }
    
    // 安全更新：先检查字段是否存在，然后动态构建 UPDATE 语句
    const { allAsync } = require('../db/database');
    const tableInfo = await allAsync("PRAGMA table_info(products)");
    const columns = tableInfo.map(col => col.name);
    
    // 构建 UPDATE 语句，只更新存在的字段
    const updateFields = [];
    const updateValues = [];
    
    if (columns.includes('name')) updateFields.push('name = ?'), updateValues.push(name);
    if (columns.includes('description')) updateFields.push('description = ?'), updateValues.push(description || '');
    if (columns.includes('price')) updateFields.push('price = ?'), updateValues.push(price);
    if (columns.includes('category_id')) updateFields.push('category_id = ?'), updateValues.push(category_id || null);
    if (columns.includes('image_url')) updateFields.push('image_url = ?'), updateValues.push(image_url);
    if (columns.includes('sort_order') && req.body.sort_order !== undefined) updateFields.push('sort_order = ?'), updateValues.push(sort_order);
    if (columns.includes('status')) updateFields.push('status = ?'), updateValues.push(status || 'active');
    if (columns.includes('sizes')) updateFields.push('sizes = ?'), updateValues.push(sizesJson);
    if (columns.includes('sugar_levels')) updateFields.push('sugar_levels = ?'), updateValues.push(sugarLevelsJson);
    if (columns.includes('available_toppings')) updateFields.push('available_toppings = ?'), updateValues.push(availableToppingsJson);
    if (columns.includes('ice_options')) updateFields.push('ice_options = ?'), updateValues.push(iceOptionsJson);
    if (columns.includes('updated_at')) updateFields.push("updated_at = datetime('now', 'localtime')");
    
    updateValues.push(id);
    
    await runAsync(
      `UPDATE products SET ${updateFields.join(', ')} WHERE id = ?`,
      updateValues
    );
    
    // 验证更新是否成功（精简日志）
    const updatedProduct = await getAsync('SELECT id, name, sizes FROM products WHERE id = ?', [id]);
    logger.info('Product updated', { id, name: updatedProduct.name });

    await logAction(req.session.adminId, 'UPDATE', 'product', id, { name, price, sizes: sizesJson }, req);
    
    // 清除相关缓存
    clearRelatedCache();

    res.json({ success: true, message: '菜品更新成功' });
  } catch (error) {
    logger.error('更新菜品失败', { error: error.message });
    res.status(500).json({ success: false, message: '更新菜品失败' });
  }
});

// 删除菜品
router.delete('/products/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // 先获取产品信息，以便删除关联的图片
    const product = await getAsync('SELECT image_url FROM products WHERE id = ?', [id]);
    
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    await beginTransaction();
    
    try {
      // 删除关联的订单详情（因为外键约束）
      await runAsync('DELETE FROM order_items WHERE product_id = ?', [id]);
      
      // 删除产品
      await runAsync('DELETE FROM products WHERE id = ?', [id]);
      
      // 删除关联的图片文件
      if (product.image_url) {
        const imagePath = product.image_url.startsWith('/') 
          ? path.join(DATA_DIR, product.image_url.substring(1))
          : path.join(DATA_DIR, product.image_url);
        
        if (fs.existsSync(imagePath)) {
          try {
            fs.unlinkSync(imagePath);
            logger.info('删除产品图片', { imagePath, productId: id });
          } catch (error) {
            logger.warn('删除产品图片失败', { imagePath, error: error.message, productId: id });
            // 图片删除失败不影响产品删除
          }
        }
      }
      
      await commit();
      
      await logAction(req.session.adminId, 'DELETE', 'product', id, JSON.stringify({
        action: '删除产品',
        productId: id,
        imageDeleted: !!product.image_url
      }), req);
      
      // 清除相关缓存
      clearRelatedCache();

      res.json({ success: true, message: 'Product deleted successfully' });
    } catch (error) {
      await rollback();
      throw error;
    }
  } catch (error) {
    logger.error('删除菜品失败', { error: error.message, productId: req.params.id });
    res.status(500).json({ success: false, message: '删除菜品失败: ' + error.message });
  }
});

// 批量更新产品
router.post('/products/batch-update', async (req, res) => {
  try {
    const { product_ids, updates } = req.body;
    
    if (!Array.isArray(product_ids) || product_ids.length === 0) {
      return res.status(400).json({ success: false, message: 'Product IDs are required' });
    }
    
    if (!updates || Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, message: 'At least one update field is required' });
    }
    
    await beginTransaction();
    
    try {
      let updatedCount = 0;
      
      for (const productId of product_ids) {
        // 获取当前产品信息
        const product = await getAsync('SELECT * FROM products WHERE id = ?', [productId]);
        if (!product) {
          continue;
        }
        
        // 构建更新字段
        const updateFields = [];
        const updateValues = [];
        
        if (updates.category_id !== undefined) {
          updateFields.push('category_id = ?');
          updateValues.push(updates.category_id || null);
        }
        
        if (updates.status !== undefined) {
          updateFields.push('status = ?');
          updateValues.push(updates.status);
        }
        
        if (updates.sort_order !== undefined) {
          updateFields.push('sort_order = ?');
          updateValues.push(updates.sort_order);
        }
        
        // 处理价格调整
        if (updates.price_action && updates.price_value !== undefined) {
          let newPrice = product.price;
          if (updates.price_action === 'set') {
            newPrice = updates.price_value;
          } else if (updates.price_action === 'add') {
            newPrice = product.price + updates.price_value;
          } else if (updates.price_action === 'multiply') {
            newPrice = product.price * updates.price_value;
          }
          updateFields.push('price = ?');
          updateValues.push(newPrice);
        }
        
        // 处理杯型价格
        if (updates.sizes !== undefined) {
          const sizesJson = typeof updates.sizes === 'object' 
            ? JSON.stringify(updates.sizes) 
            : updates.sizes;
          updateFields.push('sizes = ?');
          updateValues.push(sizesJson);
        }
        
        // 处理甜度选项
        if (updates.sugar_levels !== undefined) {
          const sugarLevelsJson = Array.isArray(updates.sugar_levels)
            ? JSON.stringify(updates.sugar_levels)
            : updates.sugar_levels;
          updateFields.push('sugar_levels = ?');
          updateValues.push(sugarLevelsJson);
        }
        
        // 处理可选加料
        if (updates.available_toppings !== undefined) {
          const availableToppingsJson = Array.isArray(updates.available_toppings)
            ? JSON.stringify(updates.available_toppings)
            : updates.available_toppings;
          updateFields.push('available_toppings = ?');
          updateValues.push(availableToppingsJson);
        }
        
        // 处理冰度选项
        if (updates.ice_options !== undefined) {
          const iceOptionsJson = Array.isArray(updates.ice_options)
            ? JSON.stringify(updates.ice_options)
            : updates.ice_options;
          updateFields.push('ice_options = ?');
          updateValues.push(iceOptionsJson);
        }
        
        if (updateFields.length > 0) {
          updateFields.push("updated_at = datetime('now', 'localtime')");
          updateValues.push(productId);
          
          await runAsync(
            `UPDATE products SET ${updateFields.join(', ')} WHERE id = ?`,
            updateValues
          );
          updatedCount++;
        }
      }
      
      await commit();
      
      // 清除缓存
      clearRelatedCache();
      
      await logAction(req.session.adminId, 'BATCH_UPDATE', 'product', null, JSON.stringify({
        action: '批量更新产品',
        productIds: product_ids,
        updates: updates,
        updatedCount: updatedCount
      }), req);
      
      res.json({
        success: true,
        message: `Successfully updated ${updatedCount} product(s)`,
        updated: updatedCount
      });
    } catch (error) {
      await rollback();
      throw error;
    }
  } catch (error) {
    logger.error('批量更新产品失败', { error: error.message });
    res.status(500).json({ success: false, message: '批量更新失败: ' + error.message });
  }
});

// ==================== 折扣规则管理 ====================

// 获取所有折扣规则
router.get('/discount-rules', async (req, res) => {
  try {
    const rules = await allAsync(
      'SELECT * FROM discount_rules WHERE status = ? ORDER BY min_amount',
      ['active']
    );
    res.json({ success: true, rules });
  } catch (error) {
    logger.error('获取折扣规则失败', { error: error.message });
    res.status(500).json({ success: false, message: '获取折扣规则失败' });
  }
});

// 批量更新折扣规则
router.post('/discount-rules/batch', async (req, res) => {
  try {
    const { rules } = req.body;

    if (!Array.isArray(rules)) {
      return res.status(400).json({ success: false, message: '规则格式错误' });
    }

    await beginTransaction();

    try {
      // 删除旧规则
      await runAsync('DELETE FROM discount_rules');

      // 插入新规则
      for (const rule of rules) {
        await runAsync(
          'INSERT INTO discount_rules (min_amount, max_amount, discount_rate, description, status) VALUES (?, ?, ?, ?, ?)',
          [rule.min_amount, rule.max_amount || null, rule.discount_rate, rule.description || '', 'active']
        );
      }

      await commit();
      await logAction(req.session.adminId, 'UPDATE', 'discount_rules', null, { count: rules.length }, req);
      
      // 清除相关缓存
      clearRelatedCache();

      res.json({ success: true, message: '折扣规则更新成功' });
    } catch (error) {
      await rollback();
      throw error;
    }
  } catch (error) {
    logger.error('更新折扣规则失败', { error: error.message });
    res.status(500).json({ success: false, message: '更新折扣规则失败' });
  }
});

// ==================== 系统设置管理 ====================

// 获取系统设置
router.get('/settings', async (req, res) => {
  try {
    const settings = await allAsync('SELECT * FROM settings');
    const settingsObj = {};
    settings.forEach(s => {
      settingsObj[s.key] = s.value;
    });
    res.json({ success: true, settings: settingsObj });
  } catch (error) {
    logger.error('获取系统设置失败', { error: error.message });
    res.status(500).json({ success: false, message: '获取系统设置失败' });
  }
});

// 更新系统设置
router.post('/settings', async (req, res) => {
  try {
    const settings = req.body;
    const { beginTransaction, commit, rollback } = require('../db/database');
    const { clearSettingsCache } = require('../utils/log-helper');

    await beginTransaction();
    
    try {
      // 检查点单开放状态是否改变
      const oldSetting = await getAsync("SELECT value FROM settings WHERE key = 'ordering_open'");
      const newOrderingOpen = settings.ordering_open === 'true';
      const oldOrderingOpen = oldSetting && oldSetting.value === 'true';
      
      // 验证 Stripe 密钥格式（如果提供）
      if (settings.stripe_publishable_key && settings.stripe_publishable_key.trim()) {
        const pubKey = settings.stripe_publishable_key.trim();
        if (!pubKey.startsWith('pk_test_') && !pubKey.startsWith('pk_live_')) {
          await rollback();
          return res.status(400).json({ 
            success: false, 
            message: 'Stripe 公钥格式不正确，应以 pk_test_ 或 pk_live_ 开头' 
          });
        }
      }
      
      if (settings.stripe_secret_key && settings.stripe_secret_key.trim()) {
        const secKey = settings.stripe_secret_key.trim();
        if (!secKey.startsWith('sk_test_') && !secKey.startsWith('sk_live_')) {
          await rollback();
          return res.status(400).json({ 
            success: false, 
            message: 'Stripe 私钥格式不正确，应以 sk_test_ 或 sk_live_ 开头' 
          });
        }
      }
      
      if (settings.stripe_webhook_secret && settings.stripe_webhook_secret.trim()) {
        const webhookSecret = settings.stripe_webhook_secret.trim();
        if (!webhookSecret.startsWith('whsec_')) {
          await rollback();
          return res.status(400).json({ 
            success: false, 
            message: 'Stripe Webhook Secret 格式不正确，应以 whsec_ 开头' 
          });
        }
      }
      
      for (const [key, value] of Object.entries(settings)) {
        await runAsync(
          `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now', 'localtime'))
           ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = datetime('now', 'localtime')`,
          [key, value, value]
        );
      }

      // 如果点单从关闭变为开放，创建新周期
      if (!oldOrderingOpen && newOrderingOpen) {
        // 生成周期号：CYCLE + 时间戳 + 随机后缀（提高唯一性）
        const timestamp = Date.now().toString();
        const random = Math.random().toString(36).substring(2, 6);
        const cycleNumber = 'CYCLE' + timestamp + '-' + random;
        await runAsync(
          `INSERT INTO ordering_cycles (cycle_number, start_time, status, total_amount, discount_rate)
           VALUES (?, datetime('now', 'localtime'), 'active', 0, 0)`,
          [cycleNumber]
        );
        logger.info('新周期已创建', { cycleNumber, adminId: req.session.adminId });
      }
      
      // 如果点单从开放变为关闭，结束当前周期并自动计算折扣
      if (oldOrderingOpen && !newOrderingOpen) {
        const activeCycle = await getAsync(
          "SELECT * FROM ordering_cycles WHERE status = 'active' ORDER BY id DESC LIMIT 1"
        );
        
        // 只有当存在活跃周期时才处理，避免重复结束
        if (activeCycle) {
          // 更新周期结束时间
          await runAsync(
            `UPDATE ordering_cycles SET end_time = datetime('now', 'localtime'), status = 'ended' 
             WHERE id = ? AND status = 'active'`,
            [activeCycle.id]
          );
          
          // 自动计算并应用折扣
          // 使用SQLite的datetime函数获取当前时间，确保格式一致
          const nowResult = await getAsync("SELECT datetime('now', 'localtime') as now");
          const orders = await allAsync(
            `SELECT * FROM orders 
             WHERE created_at >= ? AND created_at <= ? AND status = 'pending'`,
            [activeCycle.start_time, nowResult.now]
          );
          
          // 获取折扣规则
          const rules = await allAsync(
            'SELECT * FROM discount_rules WHERE status = ? ORDER BY min_amount DESC',
            ['active']
          );
          
          // 计算适用的折扣率
          let discountRate = 0;
          for (const rule of rules) {
            if (activeCycle.total_amount >= rule.min_amount) {
              discountRate = rule.discount_rate / 100;
              break;
            }
          }
          
          // 检查orders表是否有balance_used字段
          const ordersTableInfo = await allAsync("PRAGMA table_info(orders)");
          const ordersColumns = ordersTableInfo.map(col => col.name);
          const hasBalanceUsed = ordersColumns.includes('balance_used');
          
          // 批量更新所有订单的折扣（已经在事务中，不需要再开启新事务）
          const { roundAmount } = require('../utils/order-helper');
          for (const order of orders) {
            const discountAmount = roundAmount(order.total_amount * discountRate);
            // 计算最终金额：原价 - 折扣 - 已使用的余额
            const balanceUsed = hasBalanceUsed && order.balance_used ? (order.balance_used || 0) : 0;
            const finalAmount = roundAmount(order.total_amount - discountAmount - balanceUsed);
            
            await runAsync(
              "UPDATE orders SET discount_amount = ?, final_amount = ?, updated_at = datetime('now', 'localtime') WHERE id = ?",
              [discountAmount, finalAmount, order.id]
            );
          }
          
          // 更新周期折扣率
          await runAsync(
            `UPDATE ordering_cycles SET discount_rate = ? WHERE id = ?`,
            [discountRate * 100, activeCycle.id]
          );
          
          logger.info('周期已结束并自动计算折扣', { 
            cycleId: activeCycle.id, 
            discountRate: discountRate * 100,
            orderCount: orders.length 
          });
        }
      }

      await commit();
      await logAction(req.session.adminId, 'UPDATE', 'settings', null, settings, req);
      
      // 如果更新了日志相关设置，清除缓存（在事务提交后，确保立即生效）
      if (settings.debug_logging_enabled !== undefined) {
        clearSettingsCache();
      }
      
      // 清除相关缓存
      clearRelatedCache();

      res.json({ success: true, message: '设置更新成功' });
    } catch (error) {
      await rollback();
      throw error;
    }
  } catch (error) {
    logger.error('更新系统设置失败', { error: error.message });
    res.status(500).json({ success: false, message: '更新系统设置失败' });
  }
});

// ==================== QZ Tray 证书管理 ====================

/**
 * POST /api/admin/qz-certificates
 * Upload/Update QZ Tray certificates
 * @body {string} certificate - Digital certificate content
 * @body {string} privateKey - Private key content
 * @returns {Object} Success message
 */
router.post('/qz-certificates', async (req, res) => {
  try {
    const { certificate, privateKey } = req.body;
    
    // 验证必填字段
    if (!certificate || !certificate.trim()) {
      return res.status(400).json({ 
        success: false, 
        message: '证书内容不能为空' 
      });
    }
    
    if (!privateKey || !privateKey.trim()) {
      return res.status(400).json({ 
        success: false, 
        message: '私钥内容不能为空' 
      });
    }
    
    // 验证证书格式
    if (!certificate.includes('-----BEGIN CERTIFICATE-----') || 
        !certificate.includes('-----END CERTIFICATE-----')) {
      return res.status(400).json({ 
        success: false, 
        message: '证书格式不正确，应包含 BEGIN CERTIFICATE 和 END CERTIFICATE' 
      });
    }
    
    // 验证私钥格式（支持两种格式）
    const hasPKCS8 = privateKey.includes('-----BEGIN PRIVATE KEY-----') && 
                     privateKey.includes('-----END PRIVATE KEY-----');
    const hasPKCS1 = privateKey.includes('-----BEGIN RSA PRIVATE KEY-----') && 
                     privateKey.includes('-----END RSA PRIVATE KEY-----');
    
    if (!hasPKCS8 && !hasPKCS1) {
      return res.status(400).json({ 
        success: false, 
        message: '私钥格式不正确，应包含 BEGIN PRIVATE KEY 或 BEGIN RSA PRIVATE KEY' 
      });
    }
    
    await beginTransaction();
    
    try {
      // 保存证书到数据库
      await runAsync(
        `INSERT INTO settings (key, value, description, updated_at) 
         VALUES (?, ?, ?, datetime('now', 'localtime'))
         ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = datetime('now', 'localtime')`,
        ['qz_certificate', certificate.trim(), 'QZ Tray 数字证书', certificate.trim()]
      );
      
      // 保存私钥到数据库
      await runAsync(
        `INSERT INTO settings (key, value, description, updated_at) 
         VALUES (?, ?, ?, datetime('now', 'localtime'))
         ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = datetime('now', 'localtime')`,
        ['qz_private_key', privateKey.trim(), 'QZ Tray 私钥', privateKey.trim()]
      );
      
      await commit();
      
      // 清除相关缓存
      cache.delete('public:settings');
      
      await logAction(req.session.adminId, 'UPDATE', 'qz_certificates', null, JSON.stringify({
        action: '更新QZ Tray证书',
        certificate_length: certificate.length,
        private_key_length: privateKey.length
      }), req);
      
      logger.info('QZ Tray证书已更新', { adminId: req.session.adminId });
      
      res.json({ 
        success: true, 
        message: '证书更新成功，新证书将在下次打印时生效' 
      });
    } catch (error) {
      await rollback();
      throw error;
    }
  } catch (error) {
    logger.error('更新QZ证书失败', { error: error.message });
    res.status(500).json({ success: false, message: '更新证书失败: ' + error.message });
  }
});

/**
 * GET /api/admin/qz-certificates
 * Get QZ Tray certificates status
 * @returns {Object} Certificate status information
 */
router.get('/qz-certificates', async (req, res) => {
  try {
    const certSetting = await getAsync("SELECT value, updated_at FROM settings WHERE key = 'qz_certificate'");
    const keySetting = await getAsync("SELECT value, updated_at FROM settings WHERE key = 'qz_private_key'");
    
    const hasCertificate = certSetting && certSetting.value;
    const hasPrivateKey = keySetting && keySetting.value;
    
    res.json({
      success: true,
      hasCertificate,
      hasPrivateKey,
      updatedAt: certSetting?.updated_at || keySetting?.updated_at || null,
      source: hasCertificate && hasPrivateKey ? 'database' : 'filesystem'
    });
  } catch (error) {
    logger.error('获取QZ证书状态失败', { error: error.message });
    res.status(500).json({ success: false, message: '获取证书状态失败' });
  }
});

// ==================== 配送地址管理 ====================

/**
 * GET /api/admin/delivery-addresses
 * Get all delivery addresses
 * @returns {Object} Delivery addresses array
 */
router.get('/delivery-addresses', async (req, res) => {
  try {
    const addresses = await allAsync(
      'SELECT * FROM delivery_addresses ORDER BY sort_order, id'
    );
    res.json({ success: true, addresses });
  } catch (error) {
    logger.error('获取配送地址失败', { error: error.message });
    res.status(500).json({ success: false, message: '获取配送地址失败' });
  }
});

/**
 * POST /api/admin/delivery-addresses
 * Create a new delivery address
 * @body {string} name - Address name
 * @body {string} [description] - Address description
 * @body {number} [sort_order] - Sort order
 * @body {string} [status] - Status (active/inactive)
 * @returns {Object} Created delivery address
 */
router.post('/delivery-addresses', async (req, res) => {
  try {
    const { name, description, sort_order, status } = req.body;
    
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: '地址名称不能为空' });
    }
    
    await beginTransaction();
    
    try {
      const result = await runAsync(
        `INSERT INTO delivery_addresses (name, description, sort_order, status, created_at, updated_at) 
         VALUES (?, ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))`,
        [name.trim(), description?.trim() || '', sort_order || 0, status || 'active']
      );
      
      await commit();
      
      await logAction(req.session.adminId, 'CREATE', 'delivery_address', result.id, JSON.stringify({
        name: name.trim(),
        description: description?.trim() || ''
      }), req);
      
      // 清除配送地址缓存
      cache.delete('public:delivery-addresses');
      
      const address = await getAsync('SELECT * FROM delivery_addresses WHERE id = ?', [result.id]);
      res.json({ success: true, message: '配送地址创建成功', address });
    } catch (error) {
      await rollback();
      throw error;
    }
  } catch (error) {
    logger.error('创建配送地址失败', { error: error.message });
    res.status(500).json({ success: false, message: '创建配送地址失败: ' + error.message });
  }
});

/**
 * PUT /api/admin/delivery-addresses/:id
 * Update a delivery address
 * @param {number} id - Address ID
 * @body {string} name - Address name
 * @body {string} [description] - Address description
 * @body {number} [sort_order] - Sort order
 * @body {string} [status] - Status (active/inactive)
 * @returns {Object} Updated delivery address
 */
router.put('/delivery-addresses/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, sort_order, status } = req.body;
    
    const oldAddress = await getAsync('SELECT * FROM delivery_addresses WHERE id = ?', [id]);
    if (!oldAddress) {
      return res.status(404).json({ success: false, message: '配送地址不存在' });
    }
    
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: '地址名称不能为空' });
    }
    
    await beginTransaction();
    
    try {
      await runAsync(
        `UPDATE delivery_addresses 
         SET name = ?, description = ?, sort_order = ?, status = ?, updated_at = datetime('now', 'localtime')
         WHERE id = ?`,
        [name.trim(), description?.trim() || '', sort_order || 0, status || 'active', id]
      );
      
      await commit();
      
      await logAction(req.session.adminId, 'UPDATE', 'delivery_address', id, JSON.stringify({
        old: oldAddress,
        new: { name: name.trim(), description: description?.trim() || '', sort_order, status }
      }), req);
      
      // 清除配送地址缓存
      cache.delete('public:delivery-addresses');
      
      const address = await getAsync('SELECT * FROM delivery_addresses WHERE id = ?', [id]);
      res.json({ success: true, message: '配送地址更新成功', address });
    } catch (error) {
      await rollback();
      throw error;
    }
  } catch (error) {
    logger.error('更新配送地址失败', { error: error.message });
    res.status(500).json({ success: false, message: '更新配送地址失败: ' + error.message });
  }
});

/**
 * DELETE /api/admin/delivery-addresses/:id
 * Delete a delivery address
 * @param {number} id - Address ID
 * @returns {Object} Success message
 */
router.delete('/delivery-addresses/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const address = await getAsync('SELECT * FROM delivery_addresses WHERE id = ?', [id]);
    if (!address) {
      return res.status(404).json({ success: false, message: '配送地址不存在' });
    }
    
    // 检查是否有订单使用此地址
    const ordersUsingAddress = await getAsync(
      'SELECT COUNT(*) as count FROM orders WHERE delivery_address_id = ?',
      [id]
    );
    
    if (ordersUsingAddress && ordersUsingAddress.count > 0) {
      return res.status(400).json({
        success: false,
        message: `无法删除：有 ${ordersUsingAddress.count} 个订单使用了此配送地址`
      });
    }
    
    await beginTransaction();
    
    try {
      await runAsync('DELETE FROM delivery_addresses WHERE id = ?', [id]);
      
      await commit();
      
      await logAction(req.session.adminId, 'DELETE', 'delivery_address', id, JSON.stringify({
        name: address.name
      }), req);
      
      // 清除配送地址缓存
      cache.delete('public:delivery-addresses');
      
      res.json({ success: true, message: '配送地址删除成功' });
    } catch (error) {
      await rollback();
      throw error;
    }
  } catch (error) {
    logger.error('删除配送地址失败', { error: error.message });
    res.status(500).json({ success: false, message: '删除配送地址失败: ' + error.message });
  }
});

// ==================== 现场扫码点单 ====================

/**
 * POST /api/admin/dine-in/qr-code
 * Generate QR code for table number (dine-in ordering)
 * @body {string} table_number - Table number
 * @returns {Object} QR code URL and table information
 */
router.post('/dine-in/qr-code', async (req, res) => {
  const { beginTransaction, commit, rollback } = require('../db/database');
  
  try {
    const { table_number } = req.body;
    
    if (!table_number || !table_number.trim()) {
      return res.status(400).json({ success: false, message: 'Table number is required' });
    }
    
    const tableNum = table_number.trim();
    
    // 获取基础URL（用于生成二维码URL）
    const domainSetting = await getAsync("SELECT value FROM settings WHERE key = 'domain'");
    let baseUrl = process.env.BASE_URL || process.env.DOMAIN || domainSetting?.value;
    
    if (!baseUrl) {
      // 如果没有配置域名，使用请求的origin
      baseUrl = req.protocol + '://' + req.get('host');
    }
    
    // 确保baseUrl包含协议
    if (baseUrl && !baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
      baseUrl = `${req.protocol}://${baseUrl}`;
    }
    
    // 生成扫码URL（包含桌号参数）- 使用简洁的URL，由server.js路由重定向到API
    const qrCodeUrl = `${baseUrl}/dine-in?table=${encodeURIComponent(tableNum)}`;
    
    await beginTransaction();
    
    // 检查是否已存在该桌号的二维码
    const existing = await getAsync('SELECT * FROM dine_in_qr_codes WHERE table_number = ?', [tableNum]);
    
    const tablePhone = `TABLE-${tableNum}`;
    
    if (existing) {
      // 更新现有二维码
      await runAsync(
        'UPDATE dine_in_qr_codes SET qr_code_url = ?, updated_at = datetime("now", "localtime") WHERE table_number = ?',
        [qrCodeUrl, tableNum]
      );
    } else {
      // 创建新二维码记录
      await runAsync(
        'INSERT INTO dine_in_qr_codes (table_number, qr_code_url) VALUES (?, ?)',
        [tableNum, qrCodeUrl]
      );
      
      // 创建对应的桌号用户（如果不存在）
      const existingUser = await getAsync('SELECT * FROM users WHERE phone = ?', [tablePhone]);
      if (!existingUser) {
        await runAsync(
          'INSERT INTO users (phone, name, balance) VALUES (?, ?, 0)',
          [tablePhone, `Table ${tableNum}`]
        );
      }
    }
    
    // 记录日志
    await logAction(req.session.adminId, 'CREATE', 'dine_in_qr_code', tableNum, JSON.stringify({
      table_number: tableNum,
      qr_code_url: qrCodeUrl
    }), req);
    
    await commit();
    
    res.json({
      success: true,
      table_number: tableNum,
      qr_code_url: qrCodeUrl,
      message: 'QR code generated successfully'
    });
  } catch (error) {
    await rollback();
    logger.error('Failed to generate table QR code', { error: error.message });
    res.status(500).json({ success: false, message: 'Failed to generate QR code: ' + error.message });
  }
});

/**
 * GET /api/admin/dine-in/qr-codes
 * Get all dine-in QR codes
 * @returns {Object} QR codes array
 */
router.get('/dine-in/qr-codes', async (req, res) => {
  try {
    const qrCodes = await allAsync(
      'SELECT * FROM dine_in_qr_codes ORDER BY created_at DESC'
    );
    
    res.json({
      success: true,
      qr_codes: qrCodes || []
    });
  } catch (error) {
    logger.error('Failed to get dine-in QR codes', { error: error.message });
    res.status(500).json({ success: false, message: 'Failed to get QR codes: ' + error.message });
  }
});

/**
 * DELETE /api/admin/dine-in/qr-code/:tableNumber
 * Delete dine-in QR code and corresponding table user
 * @param {string} tableNumber - Table number
 * @returns {Object} Success message
 */
router.delete('/dine-in/qr-code/:tableNumber', async (req, res) => {
  const { beginTransaction, commit, rollback } = require('../db/database');
  
  try {
    const { tableNumber } = req.params;
    
    if (!tableNumber || !tableNumber.trim()) {
      return res.status(400).json({ success: false, message: 'Table number is required' });
    }
    
    const tableNum = tableNumber.trim();
    const tablePhone = `TABLE-${tableNum}`;
    
    await beginTransaction();
    
    // 检查二维码是否存在
    const qrCode = await getAsync('SELECT * FROM dine_in_qr_codes WHERE table_number = ?', [tableNum]);
    
    if (!qrCode) {
      await rollback();
      return res.status(404).json({ success: false, message: 'QR code not found' });
    }
    
    // 删除二维码记录
    await runAsync('DELETE FROM dine_in_qr_codes WHERE table_number = ?', [tableNum]);
    
    // 删除对应的桌号用户
    const tableUser = await getAsync('SELECT * FROM users WHERE phone = ?', [tablePhone]);
    if (tableUser) {
      await runAsync('DELETE FROM users WHERE phone = ?', [tablePhone]);
    }
    
    // 记录日志
    await logAction(req.session.adminId, 'DELETE', 'dine_in_qr_code', tableNum, JSON.stringify({
      table_number: tableNum,
      deleted_user: !!tableUser
    }), req);
    
    await commit();
    
    res.json({
      success: true,
      message: 'QR code and table user deleted successfully'
    });
  } catch (error) {
    await rollback();
    logger.error('Failed to delete dine-in QR code', { error: error.message, tableNumber: req.params.tableNumber });
    res.status(500).json({ success: false, message: 'Failed to delete QR code: ' + error.message });
  }
});

// ==================== 点单控制API ====================

// 开放点单（供定时任务调用）
router.post('/ordering/open', async (req, res) => {
  try {
    const { beginTransaction, commit, rollback } = require('../db/database');
    
    await beginTransaction();
    try {
      // 检查当前状态
      const currentSetting = await getAsync("SELECT value FROM settings WHERE key = 'ordering_open'");
      const currentOpen = currentSetting && currentSetting.value === 'true';
      
      if (!currentOpen) {
        // 更新状态为开放
        await runAsync(
          `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now', 'localtime'))
           ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = datetime('now', 'localtime')`,
          ['ordering_open', 'true', 'true']
        );
        
        // 创建新周期
        // 生成周期号：CYCLE + 时间戳 + 随机后缀（提高唯一性）
        const timestamp = Date.now().toString();
        const random = Math.random().toString(36).substring(2, 6);
        const cycleNumber = 'CYCLE' + timestamp + '-' + random;
        await runAsync(
          `INSERT INTO ordering_cycles (cycle_number, start_time, status, total_amount, discount_rate)
           VALUES (?, datetime('now', 'localtime'), 'active', 0, 0)`,
          [cycleNumber]
        );
        
        await commit();
        logger.info('定时任务：点单已开放', { cycleNumber });
        res.json({ success: true, message: '点单已开放', cycleNumber });
      } else {
        await commit();
        res.json({ success: true, message: '点单已经是开放状态' });
      }
    } catch (error) {
      await rollback();
      throw error;
    }
  } catch (error) {
    logger.error('开放点单失败', { error: error.message });
    res.status(500).json({ success: false, message: '开放点单失败' });
  }
});

// 关闭点单（供定时任务调用）
router.post('/ordering/close', async (req, res) => {
  try {
    const { beginTransaction, commit, rollback } = require('../db/database');
    
    await beginTransaction();
    try {
      // 检查当前状态
      const currentSetting = await getAsync("SELECT value FROM settings WHERE key = 'ordering_open'");
      const currentOpen = currentSetting && currentSetting.value === 'true';
      
      if (currentOpen) {
        // 更新状态为关闭
        await runAsync(
          `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now', 'localtime'))
           ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = datetime('now', 'localtime')`,
          ['ordering_open', 'false', 'false']
        );
        
        // 结束当前周期并自动计算折扣
        const activeCycle = await getAsync(
          "SELECT * FROM ordering_cycles WHERE status = 'active' ORDER BY id DESC LIMIT 1"
        );
        
        if (activeCycle) {
          await runAsync(
            `UPDATE ordering_cycles SET end_time = datetime('now', 'localtime'), status = 'ended' 
             WHERE id = ? AND status = 'active'`,
            [activeCycle.id]
          );
          
          // 自动计算并应用折扣
          // 使用SQLite的datetime函数获取当前时间，确保格式一致
          const nowResult = await getAsync("SELECT datetime('now', 'localtime') as now");
          const orders = await allAsync(
            `SELECT * FROM orders 
             WHERE created_at >= ? AND created_at <= ? AND status = 'pending'`,
            [activeCycle.start_time, nowResult.now]
          );
          
          const rules = await allAsync(
            'SELECT * FROM discount_rules WHERE status = ? ORDER BY min_amount DESC',
            ['active']
          );
          
          let discountRate = 0;
          for (const rule of rules) {
            if (activeCycle.total_amount >= rule.min_amount) {
              discountRate = rule.discount_rate / 100;
              break;
            }
          }
          
          // 检查orders表是否有balance_used字段
          const ordersTableInfo2 = await allAsync("PRAGMA table_info(orders)");
          const ordersColumns2 = ordersTableInfo2.map(col => col.name);
          const hasBalanceUsed2 = ordersColumns2.includes('balance_used');
          
          // 批量更新所有订单的折扣（已经在事务中，不需要再开启新事务）
          const { roundAmount } = require('../utils/order-helper');
          for (const order of orders) {
            const discountAmount = roundAmount(order.total_amount * discountRate);
            // 计算最终金额：原价 - 折扣 - 已使用的余额
            const balanceUsed = hasBalanceUsed2 && order.balance_used ? (order.balance_used || 0) : 0;
            const finalAmount = roundAmount(order.total_amount - discountAmount - balanceUsed);
            
            await runAsync(
              "UPDATE orders SET discount_amount = ?, final_amount = ?, updated_at = datetime('now', 'localtime') WHERE id = ?",
              [discountAmount, finalAmount, order.id]
            );
          }
          
          await runAsync(
            `UPDATE ordering_cycles SET discount_rate = ? WHERE id = ?`,
            [discountRate * 100, activeCycle.id]
          );
          
          logger.info('定时任务：点单已关闭并计算折扣', { 
            cycleId: activeCycle.id, 
            discountRate: discountRate * 100,
            orderCount: orders.length 
          });
        }
        
        await commit();
        res.json({ success: true, message: '点单已关闭' });
      } else {
        await commit();
        res.json({ success: true, message: '点单已经是关闭状态' });
      }
    } catch (error) {
      await rollback();
      throw error;
    }
  } catch (error) {
    logger.error('关闭点单失败', { error: error.message });
    res.status(500).json({ success: false, message: '关闭点单失败' });
  }
});

// ==================== 订单管理 ====================

// 获取所有订单（只显示最近N个周期的订单，N由设置决定）
router.get('/orders', async (req, res) => {
  try {
    // 先执行归档检查
    await archiveOldCycles();
    
    const { status, phone, date, cycle_id, page = 1, limit = 30 } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;
    
    // 获取最大可见周期数设置
    const maxVisibleSetting = await getAsync("SELECT value FROM settings WHERE key = 'max_visible_cycles'");
    const maxVisibleCycles = parseInt(maxVisibleSetting?.value || '10', 10);
    
    // 获取最近N个周期
    const recentCycles = await allAsync(
      'SELECT * FROM ordering_cycles ORDER BY start_time DESC LIMIT ?',
      [maxVisibleCycles]
    );
    
    if (recentCycles.length === 0) {
      return res.json({ 
        success: true, 
        orders: [],
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: 0,
          totalPages: 0
        }
      });
    }
    
    // 构建周期时间范围
    const cycleTimeRanges = [];
    for (const cycle of recentCycles) {
      let endTime = cycle.end_time;
      if (!endTime) {
        // 对于活跃周期，使用当前本地时间作为结束时间
        const nowResult = await getAsync("SELECT datetime('now', 'localtime') as now");
        endTime = nowResult.now;
      }
      cycleTimeRanges.push({ start: cycle.start_time, end: endTime });
    }
    
    let sql = 'SELECT * FROM orders WHERE (';
    const params = [];
    
    // 构建时间范围条件
    const timeConditions = [];
    for (const range of cycleTimeRanges) {
      timeConditions.push('(created_at >= ? AND created_at <= ?)');
      params.push(range.start);
      params.push(range.end);
    }
    
    sql += timeConditions.join(' OR ') + ')';

    // 按周期筛选（只允许筛选最近N个周期内的）
    if (cycle_id) {
      const cycle = recentCycles.find(c => c.id == cycle_id);
      if (cycle) {
        // 如果周期没有结束时间，使用当前本地时间
        let endTime = cycle.end_time;
        if (!endTime) {
          // 使用SQLite的datetime函数获取当前本地时间
          const nowResult = await getAsync("SELECT datetime('now', 'localtime') as now");
          endTime = nowResult.now;
        }
        
        logger.info('Filtering orders by cycle', {
          cycleId: cycle.id,
          cycleNumber: cycle.cycle_number,
          startTime: cycle.start_time,
          endTime: endTime,
          cycleStatus: cycle.status
        });
        
        // 替换之前的时间范围条件，使用指定的周期
        sql = 'SELECT * FROM orders WHERE (created_at >= ? AND created_at <= ?)';
        params.length = 0;
        params.push(cycle.start_time);
        params.push(endTime);
      } else {
        // 如果指定的周期不在最近N个周期内，返回空结果
        return res.json({ 
          success: true, 
          orders: [],
          pagination: {
            page: pageNum,
            limit: limitNum,
            total: 0,
            totalPages: 0
          }
        });
      }
    }

    // 添加状态过滤（在周期筛选之后，确保状态条件被保留）
    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }

    if (phone) {
      sql += ' AND customer_phone LIKE ?';
      params.push(`%${phone}%`);
    }

    if (date) {
      sql += ' AND DATE(created_at) = ?';
      params.push(date);
    }

    sql += ' ORDER BY created_at DESC';

    // 先获取总数（在分页之前）
    // 移除 ORDER BY 子句，因为 COUNT 查询不需要排序
    const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total').replace(/ORDER BY.*$/i, '');
    const { total } = await getAsync(countSql, params);

    // 添加 LIMIT 和 OFFSET 进行分页
    sql += ' LIMIT ? OFFSET ?';
    params.push(limitNum);
    params.push(offset);

    const orders = await allAsync(sql, params);

    // 获取当前活跃周期
    const activeCycle = await getAsync(
      "SELECT * FROM ordering_cycles WHERE status = 'active' ORDER BY id DESC LIMIT 1"
    );
    
    // 如果没有活跃周期，获取最近一个已结束的周期
    let latestEndedCycle = null;
    if (!activeCycle) {
      latestEndedCycle = await getAsync(
        "SELECT * FROM ordering_cycles WHERE status IN ('ended', 'confirmed') ORDER BY end_time DESC, id DESC LIMIT 1"
      );
    }

      // 批量获取订单详情和周期信息
      if (orders.length > 0) {
        // 批量获取订单项
        const orderIds = orders.map(o => o.id);
        const orderItemsMap = await batchGetOrderItems(orderIds);

        // 批量查找订单所属的周期
        const orderCreatedAts = orders.map(o => o.created_at);
        const orderCyclesMap = await findOrderCyclesBatch(orderCreatedAts);

        // 批量获取配送地址信息
        const deliveryAddressIds = orders
          .filter(o => o.delivery_address_id)
          .map(o => o.delivery_address_id);
        const deliveryAddressesMap = new Map();
        
        if (deliveryAddressIds.length > 0) {
          const uniqueAddressIds = [...new Set(deliveryAddressIds)];
          const placeholders = uniqueAddressIds.map(() => '?').join(',');
          const addresses = await allAsync(
            `SELECT * FROM delivery_addresses WHERE id IN (${placeholders})`,
            uniqueAddressIds
          );
          addresses.forEach(addr => {
            deliveryAddressesMap.set(addr.id, addr);
          });
        }

        // 为每个订单添加详情和周期信息
        for (const order of orders) {
          // 从批量查询结果中获取订单项
          order.items = orderItemsMap.get(order.id) || [];
          
          // 从批量查询结果中获取周期信息
          const orderCycle = orderCyclesMap.get(order.created_at);
          if (orderCycle) {
            order.cycle_id = orderCycle.id;
            order.cycle_number = orderCycle.cycle_number;
            order.cycle_start_time = orderCycle.start_time;
            order.cycle_end_time = orderCycle.end_time;
            order.isActiveCycle = isActiveCycle(orderCycle, activeCycle);
          } else {
            order.cycle_id = null;
            order.cycle_number = null;
            order.cycle_start_time = null;
            order.cycle_end_time = null;
            order.isActiveCycle = false;
          }
          
          // 添加配送地址信息
          if (order.delivery_address_id) {
            const address = deliveryAddressesMap.get(order.delivery_address_id);
            if (address) {
              order.delivery_address = {
                id: address.id,
                name: address.name,
                description: address.description
              };
            }
          }
          
          // 检查订单是否已过期
          order.isExpired = isOrderExpired(order, activeCycle, latestEndedCycle);
        }
      }

    res.json({ 
      success: true, 
      orders,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    logger.error('获取订单失败', { error: error.message });
    res.status(500).json({ success: false, message: '获取订单失败' });
  }
});

// 检查新订单（用于实时通知，轻量级查询）
router.get('/orders/new', async (req, res) => {
  try {
    const { since } = req.query; // ISO 时间戳，用于只获取此时间之后的订单
    
    // 查询最近5分钟内状态为 paid 的新订单（用于通知）
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
    
    let sql = `SELECT id, order_number, status, customer_name, customer_phone, final_amount, created_at, payment_time 
               FROM orders 
               WHERE status = 'paid' AND (payment_time >= ? OR created_at >= ?) 
               ORDER BY COALESCE(payment_time, created_at) DESC 
               LIMIT 20`;
    
    let orders = await allAsync(sql, [fiveMinutesAgo, fiveMinutesAgo]);
    
    // 如果提供了 since 参数，只返回在此之后的订单
    if (since) {
      try {
        const sinceDate = new Date(since);
        orders = orders.filter(order => {
          const orderTime = order.payment_time || order.created_at;
          return orderTime && new Date(orderTime) > sinceDate;
        });
      } catch (dateError) {
        // 如果日期解析失败，忽略过滤，返回所有结果
        logger.warn('解析 since 参数失败', { since, error: dateError.message });
      }
    }
    
    // 获取当前时间戳（使用 ISO 格式）
    const nowResult = await getAsync("SELECT datetime('now', 'localtime') as now");
    let timestamp = nowResult.now;
    
    // 转换为 ISO 格式（如果后端返回 SQLite datetime 格式）
    if (timestamp && timestamp.includes(' ')) {
      // SQLite 格式: "2024-01-01 12:00:00" -> ISO: "2024-01-01T12:00:00"
      timestamp = timestamp.replace(' ', 'T');
    }
    
    // 如果没有时间戳，使用当前时间
    if (!timestamp) {
      timestamp = new Date().toISOString();
    }
    
    res.json({ 
      success: true, 
      orders: orders,
      timestamp: timestamp
    });
  } catch (error) {
    logger.error('检查新订单失败', { error: error.message });
    // 错误时返回空数组，不影响通知功能
    res.json({ 
      success: true, 
      orders: [],
      timestamp: new Date().toISOString()
    });
  }
});

// 归档检查缓存（避免短时间内重复执行）
let lastArchiveCheck = 0;
const ARCHIVE_CHECK_INTERVAL = 5000; // 5秒内只执行一次

// 归档超过最大可见周期数的订单
async function archiveOldCycles() {
  try {
    // 检查缓存，避免短时间内重复执行
    const now = Date.now();
    if (now - lastArchiveCheck < ARCHIVE_CHECK_INTERVAL) {
      return; // 最近刚检查过，跳过
    }
    lastArchiveCheck = now;
    // 获取最大可见周期数设置
    const maxVisibleSetting = await getAsync("SELECT value FROM settings WHERE key = 'max_visible_cycles'");
    const maxVisibleCycles = parseInt(maxVisibleSetting?.value || '10', 10);
    
    // 获取所有周期，按开始时间降序排列
    const allCycles = await allAsync(
      'SELECT * FROM ordering_cycles WHERE status IN ("ended", "confirmed") ORDER BY start_time DESC'
    );
    
    // 如果周期数超过最大可见数，归档超过的部分
    if (allCycles.length > maxVisibleCycles) {
      const cyclesToArchive = allCycles.slice(maxVisibleCycles); // 获取超过最大可见数的周期
      
      // 确保导出目录存在
      const exportDir = path.join(DATA_DIR, 'logs', 'export');
      if (!fs.existsSync(exportDir)) {
        fs.mkdirSync(exportDir, { recursive: true });
      }
      
      // 统计信息
      let archivedCount = 0;
      let skippedCount = 0;
      let emptyCount = 0;
      
      // 为每个需要归档的周期导出订单
      for (const cycle of cyclesToArchive) {
        // 检查是否已经归档过（通过检查文件是否存在）
        // 清理文件名中的特殊字符
        const safeCycleNumber = (cycle.cycle_number || '').replace(/[^a-zA-Z0-9]/g, '_');
        const safeStartTime = cycle.start_time.replace(/[: ]/g, '-').replace(/[^0-9-]/g, '');
        const archiveFileName = `orders_cycle_${cycle.id}_${safeCycleNumber}_${safeStartTime}.csv`;
        const archiveFilePath = path.join(exportDir, archiveFileName);
        
        if (fs.existsSync(archiveFilePath)) {
          skippedCount++; // 已经归档过，跳过
          continue;
        }
        
        // 获取该周期的所有订单
        let endTime = cycle.end_time;
        if (!endTime) {
          const nowResult = await getAsync("SELECT datetime('now', 'localtime') as now");
          endTime = nowResult.now;
        }
        
        const orders = await allAsync(
          'SELECT * FROM orders WHERE created_at >= ? AND created_at <= ? ORDER BY created_at DESC',
          [cycle.start_time, endTime]
        );
        
        if (orders.length === 0) {
          emptyCount++; // 没有订单，跳过
          continue;
        }
        
        // 获取订单详情
        for (const order of orders) {
          order.items = await allAsync(
            'SELECT * FROM order_items WHERE order_id = ?',
            [order.id]
          );
        }

        // 批量获取配送地址信息
        const deliveryAddressIds = orders
          .filter(o => o.delivery_address_id)
          .map(o => o.delivery_address_id);
        const deliveryAddressesMap = new Map();
        
        if (deliveryAddressIds.length > 0) {
          const uniqueAddressIds = [...new Set(deliveryAddressIds)];
          const placeholders = uniqueAddressIds.map(() => '?').join(',');
          const addresses = await allAsync(
            `SELECT * FROM delivery_addresses WHERE id IN (${placeholders})`,
            uniqueAddressIds
          );
          addresses.forEach(addr => {
            deliveryAddressesMap.set(addr.id, addr);
          });
        }

        // 为订单添加配送地址信息
        for (const order of orders) {
          if (order.delivery_address_id) {
            const address = deliveryAddressesMap.get(order.delivery_address_id);
            if (address) {
              order.delivery_address = {
                id: address.id,
                name: address.name,
                description: address.description
              };
            }
          }
        }
        
        // 生成CSV内容
        const csvRows = [];
        
        // 获取基础URL（从环境变量或设置中获取，如果没有则使用默认值）
        // 优先使用环境变量，如果没有则尝试从设置中获取，最后使用默认值
        let baseUrl = process.env.BASE_URL || process.env.DOMAIN;
        if (!baseUrl) {
          // 尝试从设置中获取域名
          const domainSetting = await getAsync("SELECT value FROM settings WHERE key = 'domain'");
          baseUrl = domainSetting?.value || 'http://localhost:3000';
        }
        // 确保 baseUrl 是完整的 URL（包含协议）
        if (baseUrl && !baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
          baseUrl = `http://${baseUrl}`;
        }
        
        // CSV头部
        csvRows.push([
          'Order Number',
          'Customer Name',
          'Customer Phone',
          'Delivery Address',
          'Order Status',
          'Product Name',
          'Quantity',
          'Size',
          'Sugar Level',
          'Ice Level',
          'Toppings',
          'Unit Price',
          'Subtotal',
          'Total Amount',
          'Discount Amount',
          'Final Amount',
          'Order Notes',
          'Created At',
          'Updated At',
          'Cycle ID',
          'Cycle Number',
          'Payment Screenshot Link'
        ].join(','));
        
        // 订单数据
        for (const order of orders) {
          if (order.items && order.items.length > 0) {
            for (const item of order.items) {
              const iceLabels = {
                'normal': 'Normal Ice',
                'less': 'Less Ice',
                'no': 'No Ice',
                'room': 'Room Temperature',
                'hot': 'Hot'
              };
              
              // 格式化配送地址
              const deliveryAddressText = order.delivery_address 
                ? `${order.delivery_address.name}${order.delivery_address.description ? ` (${order.delivery_address.description})` : ''}`
                : '';

              const row = [
                `"${order.order_number || ''}"`,
                `"${order.customer_name || ''}"`,
                `"${order.customer_phone || ''}"`,
                `"${deliveryAddressText.replace(/"/g, '""')}"`,
                `"${order.status === 'pending' ? 'Pending Payment' : order.status === 'paid' ? 'Paid' : order.status === 'completed' ? 'Completed' : 'Cancelled'}"`,
                `"${item.product_name || ''}"`,
                item.quantity || 0,
                `"${item.size ? (item.size + (item.size_price !== undefined && item.size_price !== null && item.size_price > 0 ? ` (${item.size_price.toFixed(2)})` : '')) : ''}"`,
                `"${item.sugar_level || ''}"`,
                `"${item.ice_level ? (iceLabels[item.ice_level] || item.ice_level) : ''}"`,
                `"${(() => {
                  if (!item.toppings) return '';
                  try {
                    // 解析加料数据
                    let toppings = typeof item.toppings === 'string' ? JSON.parse(item.toppings) : item.toppings;
                    if (!Array.isArray(toppings)) return '';
                    
                    // 格式化加料显示：如果是对象数组（包含name和price），显示为 "Name (Price)"；如果是字符串数组，只显示名称
                    const formatted = toppings.map(t => {
                      if (typeof t === 'object' && t !== null && t.name) {
                        // 对象格式：包含名称和价格
                        return t.price && t.price > 0 ? `${t.name} (${t.price.toFixed(2)})` : t.name;
                      } else {
                        // 字符串格式：只有名称
                        return String(t);
                      }
                    });
                    return formatted.join('; ');
                  } catch (e) {
                    // 如果解析失败，返回原始字符串
                    return typeof item.toppings === 'string' ? item.toppings : String(item.toppings);
                  }
                })().replace(/"/g, '""')}"`,
                (item.product_price || 0).toFixed(2),
                (item.subtotal || 0).toFixed(2),
                (order.total_amount || 0).toFixed(2),
                (order.discount_amount || 0).toFixed(2),
                (order.final_amount || 0).toFixed(2),
                `"${(order.notes || '').replace(/"/g, '""')}"`,
                `"${order.created_at || ''}"`,
                `"${order.updated_at || ''}"`,
                `"${cycle.id}"`,
                `"${cycle.cycle_number || ''}"`,
                `"${order.payment_image ? `${baseUrl}${order.payment_image}` : ''}"`
              ];
              csvRows.push(row.join(','));
            }
          } else {
            // 如果没有商品详情，至少输出订单基本信息
            // 格式化配送地址
            const deliveryAddressText = order.delivery_address 
              ? `${order.delivery_address.name}${order.delivery_address.description ? ` (${order.delivery_address.description})` : ''}`
              : '';

            const row = [
              `"${order.order_number || ''}"`,
              `"${order.customer_name || ''}"`,
              `"${order.customer_phone || ''}"`,
              `"${deliveryAddressText.replace(/"/g, '""')}"`,
              `"${order.status === 'pending' ? 'Pending Payment' : order.status === 'paid' ? 'Paid' : order.status === 'completed' ? 'Completed' : 'Cancelled'}"`,
              '""',
              '0',
              '""',
              '""',
              '""',
              '""',
              '0.00',
              '0.00',
              (order.total_amount || 0).toFixed(2),
              (order.discount_amount || 0).toFixed(2),
              (order.final_amount || 0).toFixed(2),
              `"${(order.notes || '').replace(/"/g, '""')}"`,
              `"${order.created_at || ''}"`,
              `"${order.updated_at || ''}"`,
              `"${cycle.id}"`,
              `"${cycle.cycle_number || ''}"`,
              `"${order.payment_image ? `${baseUrl}${order.payment_image}` : ''}"`
            ];
            csvRows.push(row.join(','));
          }
        }
        
        const csvContent = csvRows.join('\n');
        
        // 写入文件
        fs.writeFileSync(archiveFilePath, '\ufeff' + csvContent, 'utf8');
        
        archivedCount++; // 成功归档
      }
      
      // 汇总日志（只在有操作或需要记录时才输出）
      if (cyclesToArchive.length > 0) {
        // 只在开启详细日志或真正执行了归档操作时记录
        const { shouldLogDebug } = require('../utils/log-helper');
        const debugEnabled = await shouldLogDebug();
        
        if (debugEnabled || archivedCount > 0) {
          logger.info('Cycle archive check completed', {
            totalCycles: cyclesToArchive.length,
            archived: archivedCount,
            alreadyArchived: skippedCount,
            emptyCycles: emptyCount
          });
        }
      }
    }
  } catch (error) {
    logger.error('归档旧周期失败', { error: error.message });
  }
}

// 获取所有周期（只返回最近N个，包括活跃周期，N由设置决定）
router.get('/cycles', async (req, res) => {
  try {
    // 先执行归档检查
    await archiveOldCycles();
    
    // 获取最大可见周期数设置
    const maxVisibleSetting = await getAsync("SELECT value FROM settings WHERE key = 'max_visible_cycles'");
    const maxVisibleCycles = parseInt(maxVisibleSetting?.value || '10', 10);
    
    // 只返回最近N个周期（包括活跃周期）
    const cycles = await allAsync(
      'SELECT * FROM ordering_cycles ORDER BY start_time DESC LIMIT ?',
      [maxVisibleCycles]
    );
    res.json({ success: true, cycles });
  } catch (error) {
    logger.error('获取周期列表失败', { error: error.message });
    res.status(500).json({ success: false, message: '获取周期列表失败' });
  }
});

// 获取请求的基础URL（域名或IP）
function getBaseUrl(req) {
  // 优先使用 Host 头（包含域名和端口）
  let host = req.get('host');
  
  // 如果没有 Host 头，尝试其他方式
  if (!host) {
    host = req.hostname || req.host;
  }
  
  // 如果还是没有，尝试从请求头中获取
  if (!host) {
    host = req.headers.host;
  }
  
  // 判断是否是IP地址（IPv4或IPv6）
  const isIP = host && (
    /^\d+\.\d+\.\d+\.\d+(:\d+)?$/.test(host) || // IPv4
    /^\[[\da-f:]+\](:\d+)?$/i.test(host) || // IPv6 with brackets
    /^[\da-f:]+(:\d+)?$/i.test(host) // IPv6 without brackets
  );
  
  // 获取协议
  let protocol = req.protocol;
  if (!protocol) {
    // 检查是否通过代理设置了协议
    protocol = req.get('x-forwarded-proto') || (req.secure ? 'https' : 'http');
  }
  
  if (host && !isIP) {
    // 如果有域名（不是纯IP），使用域名
    return `${protocol}://${host}`;
  } else if (host) {
    // 如果是IP地址，直接使用
    return `${protocol}://${host}`;
  } else {
    // 如果都没有，尝试使用服务器IP
    const serverIP = req.connection.localAddress || req.socket.localAddress || 'localhost';
    const port = req.connection.localPort || process.env.PORT || 3000;
    
    // 如果是本地IP，使用 localhost
    if (serverIP === '127.0.0.1' || serverIP === '::1' || serverIP === '::ffff:127.0.0.1' || serverIP === '0.0.0.0') {
      return `${protocol}://localhost:${port}`;
    }
    
    return `${protocol}://${serverIP}:${port}`;
  }
}

// 导出订单（XLSX格式，只导出最近N个周期的订单，N由设置决定）
router.get('/orders/export', async (req, res) => {
  try {
    // 获取基础URL用于构建付款截图链接
    const baseUrl = getBaseUrl(req);
    // 先执行归档检查
    await archiveOldCycles();
    
    const { status, phone, date, cycle_id } = req.query;
    
    // 获取最大可见周期数设置
    const maxVisibleSetting = await getAsync("SELECT value FROM settings WHERE key = 'max_visible_cycles'");
    const maxVisibleCycles = parseInt(maxVisibleSetting?.value || '10', 10);
    
    // 获取最近N个周期
    const recentCycles = await allAsync(
      'SELECT * FROM ordering_cycles ORDER BY start_time DESC LIMIT ?',
      [maxVisibleCycles]
    );
    
    if (recentCycles.length === 0) {
      return res.status(404).json({ success: false, message: 'No cycles found' });
    }
    
    // 构建周期时间范围
    const cycleTimeRanges = [];
    for (const cycle of recentCycles) {
      let endTime = cycle.end_time;
      if (!endTime) {
        const nowResult = await getAsync("SELECT datetime('now', 'localtime') as now");
        endTime = nowResult.now;
      }
      cycleTimeRanges.push({ start: cycle.start_time, end: endTime });
    }
    
    let sql = 'SELECT * FROM orders WHERE (';
    const params = [];
    
    // 构建时间范围条件
    const timeConditions = [];
    for (const range of cycleTimeRanges) {
      timeConditions.push('(created_at >= ? AND created_at <= ?)');
      params.push(range.start);
      params.push(range.end);
    }
    
    sql += timeConditions.join(' OR ') + ')';

    // 按周期筛选（只允许筛选最近N个周期内的）
    if (cycle_id) {
      const cycle = recentCycles.find(c => c.id == cycle_id);
      if (cycle) {
        // 如果周期没有结束时间，使用当前本地时间
        let endTime = cycle.end_time;
        if (!endTime) {
          const nowResult = await getAsync("SELECT datetime('now', 'localtime') as now");
          endTime = nowResult.now;
        }
        
        // 替换之前的时间范围条件，使用指定的周期
        sql = 'SELECT * FROM orders WHERE (created_at >= ? AND created_at <= ?)';
        params.length = 0;
        params.push(cycle.start_time);
        params.push(endTime);
      } else {
        // 如果指定的周期不在最近N个周期内，返回空结果
        return res.status(404).json({ success: false, message: `Cycle not found in recent ${maxVisibleCycles} cycles` });
      }
    }

    // 添加状态过滤（在周期筛选之后，确保状态条件被保留）
    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }

    if (phone) {
      sql += ' AND customer_phone LIKE ?';
      params.push(`%${phone}%`);
    }

    if (date) {
      sql += ' AND DATE(created_at) = ?';
      params.push(date);
    }

    sql += ' ORDER BY created_at DESC';

    const orders = await allAsync(sql, params);

    // 获取订单详情
    for (const order of orders) {
      order.items = await allAsync(
        'SELECT * FROM order_items WHERE order_id = ?',
        [order.id]
      );
    }

    // 创建Excel工作簿
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('订单导出');
    
    // 定义列标题
    const headers = [
      '订单编号',
      '客户姓名',
      '客户电话',
      '订单状态',
      '商品名称',
      '商品数量',
      '杯型',
      '甜度',
      '冰度',
      '加料',
      '单价',
      '小计',
      '订单总金额',
      '折扣金额',
      '实付金额',
      '订单备注',
      '创建时间',
      '更新时间',
      '付款截图链接'
    ];

    // 设置列标题
    worksheet.columns = headers.map(header => ({ header, key: header }));

    // 设置标题行样式
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' } // 蓝色背景
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.height = 25;

    // 设置列宽
    worksheet.columns.forEach((column, index) => {
      if (index === 0) column.width = 15; // 订单编号
      else if (index === 1) column.width = 12; // 客户姓名
      else if (index === 2) column.width = 15; // 客户电话
      else if (index === 3) column.width = 12; // 订单状态
      else if (index === 4) column.width = 20; // 商品名称
      else if (index === 5) column.width = 10; // 商品数量
      else if (index === 6) column.width = 12; // 杯型
      else if (index === 7) column.width = 10; // 甜度
      else if (index === 8) column.width = 12; // 冰度
      else if (index === 9) column.width = 25; // 加料
      else if (index === 10) column.width = 12; // 单价
      else if (index === 11) column.width = 12; // 小计
      else if (index === 12) column.width = 12; // 订单总金额
      else if (index === 13) column.width = 12; // 折扣金额
      else if (index === 14) column.width = 12; // 实付金额
      else if (index === 3) column.width = 20; // 配送地址
      else if (index === 15) column.width = 20; // 订单备注
      else if (index === 16) column.width = 20; // 创建时间
      else if (index === 17) column.width = 20; // 更新时间
      else if (index === 19) column.width = 40; // 付款截图链接
    });

    // 冰度标签映射
          const iceLabels = {
            'normal': 'Normal Ice',
            'less': 'Less Ice',
            'no': 'No Ice',
            'room': 'Room Temperature',
            'hot': 'Hot'
          };
          
    // 添加数据行并跟踪订单行范围（用于合并单元格）
    let rowIndex = 2; // 从第2行开始（第1行是标题）
    const orderRowRanges = []; // 存储每个订单的行范围 {orderId, firstRow, lastRow}
    
    for (const order of orders) {
      const orderFirstRow = rowIndex;
      
      if (order.items && order.items.length > 0) {
        for (const item of order.items) {
          // 格式化加料
          let toppingsText = '';
          if (item.toppings) {
            try {
                let toppings = typeof item.toppings === 'string' ? JSON.parse(item.toppings) : item.toppings;
              if (Array.isArray(toppings)) {
                const formatted = toppings.map(t => {
                  if (typeof t === 'object' && t !== null && t.name) {
                    return t.price && t.price > 0 ? `${t.name} (${t.price.toFixed(2)})` : t.name;
                  } else {
                    return String(t);
                  }
                });
                toppingsText = formatted.join('; ');
              }
              } catch (e) {
              toppingsText = typeof item.toppings === 'string' ? item.toppings : String(item.toppings);
              }
          }

          // 格式化杯型
          let sizeText = '';
          if (item.size) {
            sizeText = item.size;
            if (item.size_price !== undefined && item.size_price !== null && item.size_price > 0) {
              sizeText += ` (${item.size_price.toFixed(2)})`;
            }
          }

          // 格式化订单状态
          const statusText = order.status === 'pending' ? '待付款' : 
                            order.status === 'paid' ? '已付款' : 
                            order.status === 'completed' ? '已完成' : '已取消';

          // 构建付款截图链接
          const paymentLink = order.payment_image ? `${baseUrl}${order.payment_image}` : '';

          // 添加行数据
          const row = worksheet.addRow([
            order.order_number || '',
            order.customer_name || '',
            order.customer_phone || '',
            statusText,
            item.product_name || '',
            item.quantity || 0,
            sizeText,
            item.sugar_level || '',
            item.ice_level ? (iceLabels[item.ice_level] || item.ice_level) : '',
            toppingsText,
            item.product_price || 0,
            item.subtotal || 0,
            order.total_amount || 0,
            order.discount_amount || 0,
            order.final_amount || 0,
            order.notes || '',
            order.created_at || '',
            order.updated_at || '',
            paymentLink
          ]);

          // 设置数据行样式
          row.alignment = { vertical: 'middle', horizontal: 'left' };
          row.height = 20;

          // 设置数字列格式
          row.getCell(11).numFmt = '0.00'; // 单价
          row.getCell(12).numFmt = '0.00'; // 小计
          row.getCell(13).numFmt = '0.00'; // 订单总金额
          row.getCell(14).numFmt = '0.00'; // 折扣金额
          row.getCell(15).numFmt = '0.00'; // 实付金额

          // 设置付款截图链接为超链接
          if (paymentLink) {
            const linkCell = row.getCell(20);
            linkCell.value = { text: paymentLink, hyperlink: paymentLink };
            linkCell.font = { color: { argb: 'FF0000FF' }, underline: true };
          }

          // 根据订单状态设置行颜色
          if (order.status === 'pending') {
            // 待付款：浅黄色背景
            row.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFFFF9C4' } // 浅黄色
            };
          } else if (order.status === 'paid') {
            // 已付款：浅绿色背景
            row.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFC8E6C9' } // 浅绿色
            };
          } else {
            // 其他状态：交替行颜色
            if (rowIndex % 2 === 0) {
              row.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFF2F2F2' } // 浅灰色
              };
            }
          }

          rowIndex++;
        }
      } else {
        // 如果没有商品详情，至少输出订单基本信息
        const statusText = order.status === 'pending' ? '待付款' : 
                          order.status === 'paid' ? '已付款' : 
                          order.status === 'completed' ? '已完成' : '已取消';
        const paymentLink = order.payment_image ? `${baseUrl}${order.payment_image}` : '';

        const row = worksheet.addRow([
          order.order_number || '',
          order.customer_name || '',
          order.customer_phone || '',
          statusText,
          '',
          0,
          '',
          '',
          '',
          '',
          0,
          0,
          order.total_amount || 0,
          order.discount_amount || 0,
          order.final_amount || 0,
          order.notes || '',
          order.created_at || '',
          order.updated_at || '',
          paymentLink
        ]);

        row.alignment = { vertical: 'middle', horizontal: 'left' };
        row.height = 20;

        // 设置数字列格式
        row.getCell(13).numFmt = '0.00';
        row.getCell(14).numFmt = '0.00';
        row.getCell(15).numFmt = '0.00';

        // 设置付款截图链接为超链接
        if (paymentLink) {
          const linkCell = row.getCell(20);
          linkCell.value = { text: paymentLink, hyperlink: paymentLink };
          linkCell.font = { color: { argb: 'FF0000FF' }, underline: true };
        }

        // 根据订单状态设置行颜色
        if (order.status === 'pending') {
          // 待付款：浅黄色背景
          row.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFF9C4' } // 浅黄色
          };
        } else if (order.status === 'paid') {
          // 已付款：浅绿色背景
          row.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFC8E6C9' } // 浅绿色
          };
        } else {
          // 其他状态：交替行颜色
          if (rowIndex % 2 === 0) {
            row.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFF2F2F2' }
            };
          }
        }

        rowIndex++;
      }
      
      // 记录订单的行范围
      const orderLastRow = rowIndex - 1;
      if (orderLastRow >= orderFirstRow) {
        orderRowRanges.push({ orderId: order.id, firstRow: orderFirstRow, lastRow: orderLastRow });
      }
    }

    // 合并同一订单的单元格（除了商品相关列）
    // 需要合并的列：1(订单编号), 2(客户姓名), 3(客户电话), 4(订单状态), 
    // 13(订单总金额), 14(折扣金额), 15(实付金额), 16(订单备注), 
    // 17(创建时间), 18(更新时间), 19(付款截图链接)
    // 不合并的列：5(商品名称), 6(数量), 7(杯型), 8(甜度), 9(冰度), 10(加料), 11(单价), 12(小计)
    const mergeColumns = [1, 2, 3, 4, 13, 14, 15, 16, 17, 18, 19];
    
    for (const range of orderRowRanges) {
      if (range.lastRow > range.firstRow) {
        // 如果订单有多行，需要合并
        for (const col of mergeColumns) {
          worksheet.mergeCells(range.firstRow, col, range.lastRow, col);
          // 设置合并后的单元格垂直居中
          const cell = worksheet.getCell(range.firstRow, col);
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
        }
      }
    }

    // 冻结首行
    worksheet.views = [
      { state: 'frozen', ySplit: 1 }
    ];

    // 设置文件名
    const filename = `订单导出_${new Date().toISOString().slice(0, 10)}.xlsx`;

    // 设置响应头
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);

    // 写入响应
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    logger.error('导出订单失败', { error: error.message });
    res.status(500).json({ success: false, message: '导出订单失败' });
  }
});

// 获取订单统计（当前周期或上一个周期）
router.get('/orders/statistics', async (req, res) => {
  try {
    // 获取当前活跃周期
    let cycle = await getAsync(
      "SELECT * FROM ordering_cycles WHERE status = 'active' ORDER BY id DESC LIMIT 1"
    );
    
    // 如果没有活跃周期，获取最近一个已结束的周期
    if (!cycle) {
      cycle = await getAsync(
        "SELECT * FROM ordering_cycles WHERE status = 'ended' ORDER BY id DESC LIMIT 1"
      );
    }
    
    if (!cycle) {
      return res.json({ 
        success: true, 
        statistics: {
          total_orders: 0,
          total_amount: 0,
          total_discount: 0,
          total_final_amount: 0,
          pending_count: 0,
          paid_count: 0,
          completed_count: 0
        },
        cycle: null
      });
    }
    
    // 获取周期内的订单统计
    // 如果周期没有结束时间，使用当前时间（SQLite本地时间格式）
    let endTime = cycle.end_time;
    if (!endTime) {
      // 使用SQLite的datetime函数获取当前本地时间
      const nowResult = await getAsync("SELECT datetime('now', 'localtime') as now");
      endTime = nowResult.now;
    }
    
    logger.info('Dashboard statistics query', { 
      cycleId: cycle.id, 
      cycleNumber: cycle.cycle_number,
      startTime: cycle.start_time, 
      endTime: endTime,
      cycleStatus: cycle.status
    });
    
    // 先查询一下有多少订单在时间范围内（用于调试）
    const orderCountCheck = await getAsync(`
      SELECT COUNT(*) as count FROM orders 
      WHERE created_at >= ? AND created_at <= ?
    `, [cycle.start_time, endTime]);
    
    logger.info('Orders in time range', { 
      count: orderCountCheck.count,
      startTime: cycle.start_time,
      endTime: endTime
    });
    
    const stats = await getAsync(`
      SELECT 
        COUNT(*) as total_orders,
        COALESCE(SUM(total_amount), 0) as total_amount,
        COALESCE(SUM(discount_amount), 0) as total_discount,
        COALESCE(SUM(final_amount), 0) as total_final_amount,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count,
        COUNT(CASE WHEN status = 'paid' THEN 1 END) as paid_count,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_count
      FROM orders
      WHERE created_at >= ? AND created_at <= ?
    `, [cycle.start_time, endTime]);
    
    // 获取已付款订单统计（排除未付款订单）
    const paidStats = await getAsync(`
      SELECT 
        COUNT(*) as paid_orders,
        COALESCE(SUM(total_amount), 0) as paid_total_amount,
        COALESCE(SUM(discount_amount), 0) as paid_total_discount,
        COALESCE(SUM(final_amount), 0) as paid_final_amount
      FROM orders
      WHERE created_at >= ? AND created_at <= ? AND status IN ('paid', 'completed')
    `, [cycle.start_time, endTime]);
    
    // 合并统计结果
    stats.paid_orders = paidStats.paid_orders || 0;
    stats.paid_total_amount = paidStats.paid_total_amount || 0;
    stats.paid_total_discount = paidStats.paid_total_discount || 0;
    stats.paid_final_amount = paidStats.paid_final_amount || 0;
    
    logger.info('Dashboard statistics result', { 
      stats,
      total_orders: stats.total_orders,
      total_amount: stats.total_amount,
      total_discount: stats.total_discount,
      total_final_amount: stats.total_final_amount
    });
    
    // 更新周期表中的 total_amount 为实际统计值（确保数据一致性）
    // 但只在有订单的情况下更新，避免覆盖为0
    if (stats.total_orders > 0) {
      await runAsync(
        `UPDATE ordering_cycles SET total_amount = ?, updated_at = datetime('now', 'localtime') WHERE id = ?`,
        [stats.total_amount, cycle.id]
      );
      // 更新返回的 cycle 对象，确保前端显示的是实际统计值
      cycle.total_amount = stats.total_amount;
      
      // 如果周期已结束，重新计算并更新折扣率（基于实际统计金额）
      if (cycle.status === 'ended' || cycle.status === 'confirmed') {
        // 获取折扣规则
        const rules = await allAsync(
          'SELECT * FROM discount_rules WHERE status = ? ORDER BY min_amount DESC',
          ['active']
        );
        
        // 基于实际统计金额计算适用的折扣率
        let discountRate = 0;
        for (const rule of rules) {
          if (stats.total_amount >= rule.min_amount) {
            if (!rule.max_amount || stats.total_amount < rule.max_amount) {
              discountRate = rule.discount_rate;
              break;
            }
          }
        }
        
        // 更新周期折扣率
        await runAsync(
          `UPDATE ordering_cycles SET discount_rate = ? WHERE id = ?`,
          [discountRate, cycle.id]
        );
        
        // 更新返回的 cycle 对象
        cycle.discount_rate = discountRate;
        
        logger.info('Updated cycle discount rate based on actual statistics', {
          cycleId: cycle.id,
          actualTotalAmount: stats.total_amount,
          discountRate: discountRate
        });
      }
    }

    res.json({ success: true, statistics: stats, cycle });
  } catch (error) {
    logger.error('获取订单统计失败', { error: error.message });
    res.status(500).json({ success: false, message: '获取订单统计失败' });
  }
});

// 生成周期订单Excel文件并保存到磁盘
async function generateCycleExcelFile(cycleId, baseUrl) {
  try {
    // 获取周期信息
    const cycle = await getAsync('SELECT * FROM ordering_cycles WHERE id = ?', [cycleId]);
    if (!cycle) {
      throw new Error('周期不存在');
    }

    let endTime = cycle.end_time;
    if (!endTime) {
      const nowResult = await getAsync("SELECT datetime('now', 'localtime') as now");
      endTime = nowResult.now;
    }

    // 获取周期内的所有订单
    const orders = await allAsync(
      'SELECT * FROM orders WHERE created_at >= ? AND created_at <= ? ORDER BY created_at DESC',
      [cycle.start_time, endTime]
    );

    // 获取订单详情
    for (const order of orders) {
      order.items = await allAsync(
        'SELECT * FROM order_items WHERE order_id = ?',
        [order.id]
      );
    }

    // 创建Excel工作簿
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('订单导出');

    // 定义列标题
    const headers = [
      '订单编号',
      '客户姓名',
      '客户电话',
      '订单状态',
      '商品名称',
      '商品数量',
      '杯型',
      '甜度',
      '冰度',
      '加料',
      '单价',
      '小计',
      '订单总金额',
      '折扣金额',
      '实付金额',
      '订单备注',
      '创建时间',
      '更新时间',
      '付款截图链接'
    ];

    // 设置列标题
    worksheet.columns = headers.map(header => ({ header, key: header }));

    // 设置标题行样式
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' }
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.height = 25;

    // 设置列宽（与导出路由相同）
    worksheet.columns.forEach((column, index) => {
      if (index === 0) column.width = 15;
      else if (index === 1) column.width = 12;
      else if (index === 2) column.width = 15;
      else if (index === 3) column.width = 12;
      else if (index === 4) column.width = 20;
      else if (index === 5) column.width = 10;
      else if (index === 6) column.width = 12;
      else if (index === 7) column.width = 10;
      else if (index === 8) column.width = 12;
      else if (index === 9) column.width = 25;
      else if (index === 10) column.width = 12;
      else if (index === 11) column.width = 12;
      else if (index === 12) column.width = 12;
      else if (index === 13) column.width = 12;
      else if (index === 14) column.width = 12;
      else if (index === 15) column.width = 20;
      else if (index === 16) column.width = 20;
      else if (index === 17) column.width = 20;
      else if (index === 18) column.width = 40;
    });

    // 冰度标签映射
    const iceLabels = {
      'normal': 'Normal Ice',
      'less': 'Less Ice',
      'no': 'No Ice',
      'room': 'Room Temperature',
      'hot': 'Hot'
    };

    // 添加数据行并跟踪订单行范围（用于合并单元格）
    let rowIndex = 2;
    const orderRowRanges = []; // 存储每个订单的行范围 {orderId, firstRow, lastRow}
    
    for (const order of orders) {
      const orderFirstRow = rowIndex;
      
      if (order.items && order.items.length > 0) {
        for (const item of order.items) {
          // 格式化加料
          let toppingsText = '';
          if (item.toppings) {
            try {
              let toppings = typeof item.toppings === 'string' ? JSON.parse(item.toppings) : item.toppings;
              if (Array.isArray(toppings)) {
                const formatted = toppings.map(t => {
                  if (typeof t === 'object' && t !== null && t.name) {
                    return t.price && t.price > 0 ? `${t.name} (${t.price.toFixed(2)})` : t.name;
                  } else {
                    return String(t);
                  }
                });
                toppingsText = formatted.join('; ');
              }
            } catch (e) {
              toppingsText = typeof item.toppings === 'string' ? item.toppings : String(item.toppings);
            }
          }

          // 格式化杯型
          let sizeText = '';
          if (item.size) {
            sizeText = item.size;
            if (item.size_price !== undefined && item.size_price !== null && item.size_price > 0) {
              sizeText += ` (${item.size_price.toFixed(2)})`;
            }
          }

          // 格式化订单状态
          const statusText = order.status === 'pending' ? '待付款' : 
                            order.status === 'paid' ? '已付款' : 
                            order.status === 'completed' ? '已完成' : '已取消';

          // 构建付款截图链接
          const paymentLink = order.payment_image ? `${baseUrl}${order.payment_image}` : '';

          // 添加行数据
          const row = worksheet.addRow([
            order.order_number || '',
            order.customer_name || '',
            order.customer_phone || '',
            statusText,
            item.product_name || '',
            item.quantity || 0,
            sizeText,
            item.sugar_level || '',
            item.ice_level ? (iceLabels[item.ice_level] || item.ice_level) : '',
            toppingsText,
            item.product_price || 0,
            item.subtotal || 0,
            order.total_amount || 0,
            order.discount_amount || 0,
            order.final_amount || 0,
            order.notes || '',
            order.created_at || '',
            order.updated_at || '',
            paymentLink
          ]);

          // 设置数据行样式
          row.alignment = { vertical: 'middle', horizontal: 'left' };
          row.height = 20;

          // 设置数字列格式
          row.getCell(11).numFmt = '0.00';
          row.getCell(12).numFmt = '0.00';
          row.getCell(13).numFmt = '0.00';
          row.getCell(14).numFmt = '0.00';
          row.getCell(15).numFmt = '0.00';

          // 设置付款截图链接为超链接
          if (paymentLink) {
            const linkCell = row.getCell(19);
            linkCell.value = { text: paymentLink, hyperlink: paymentLink };
            linkCell.font = { color: { argb: 'FF0000FF' }, underline: true };
          }

          // 根据订单状态设置行颜色
          if (order.status === 'pending') {
            row.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFFFF9C4' }
            };
          } else if (order.status === 'paid') {
            row.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFC8E6C9' }
            };
          } else {
            if (rowIndex % 2 === 0) {
              row.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFF2F2F2' }
              };
            }
          }

          rowIndex++;
        }
      } else {
        // 如果没有商品详情，至少输出订单基本信息
        const statusText = order.status === 'pending' ? '待付款' : 
                          order.status === 'paid' ? '已付款' : 
                          order.status === 'completed' ? '已完成' : '已取消';
        const paymentLink = order.payment_image ? `${baseUrl}${order.payment_image}` : '';

        const row = worksheet.addRow([
          order.order_number || '',
          order.customer_name || '',
          order.customer_phone || '',
          statusText,
          '',
          0,
          '',
          '',
          '',
          '',
          0,
          0,
          order.total_amount || 0,
          order.discount_amount || 0,
          order.final_amount || 0,
          order.notes || '',
          order.created_at || '',
          order.updated_at || '',
          paymentLink
        ]);

        row.alignment = { vertical: 'middle', horizontal: 'left' };
        row.height = 20;

        row.getCell(13).numFmt = '0.00';
        row.getCell(14).numFmt = '0.00';
        row.getCell(15).numFmt = '0.00';

        if (paymentLink) {
          const linkCell = row.getCell(19);
          linkCell.value = { text: paymentLink, hyperlink: paymentLink };
          linkCell.font = { color: { argb: 'FF0000FF' }, underline: true };
        }

        if (order.status === 'pending') {
          row.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFF9C4' }
          };
        } else if (order.status === 'paid') {
          row.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFC8E6C9' }
          };
        } else {
          if (rowIndex % 2 === 0) {
            row.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFF2F2F2' }
            };
          }
        }

        rowIndex++;
      }
      
      // 记录订单的行范围
      const orderLastRow = rowIndex - 1;
      if (orderLastRow >= orderFirstRow) {
        orderRowRanges.push({ orderId: order.id, firstRow: orderFirstRow, lastRow: orderLastRow });
      }
    }

    // 合并同一订单的单元格（除了商品相关列）
    // 需要合并的列：1(订单编号), 2(客户姓名), 3(客户电话), 4(订单状态), 
    // 13(订单总金额), 14(折扣金额), 15(实付金额), 16(订单备注), 
    // 17(创建时间), 18(更新时间), 19(付款截图链接)
    const mergeColumns = [1, 2, 3, 4, 13, 14, 15, 16, 17, 18, 19];
    
    for (const range of orderRowRanges) {
      if (range.lastRow > range.firstRow) {
        // 如果订单有多行，需要合并
        for (const col of mergeColumns) {
          worksheet.mergeCells(range.firstRow, col, range.lastRow, col);
          // 设置合并后的单元格垂直居中
          const cell = worksheet.getCell(range.firstRow, col);
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
        }
      }
    }

    // 冻结首行
    worksheet.views = [
      { state: 'frozen', ySplit: 1 }
    ];

    // 确保导出目录存在
    const exportDir = path.join(DATA_DIR, 'logs', 'export');
    if (!fs.existsSync(exportDir)) {
      fs.mkdirSync(exportDir, { recursive: true });
    }

    // 生成文件名
    const filename = `订单导出_周期${cycleId}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    const filePath = path.join(exportDir, filename);

    // 保存文件
    await workbook.xlsx.writeFile(filePath);

    return filePath;
  } catch (error) {
    logger.error('生成周期Excel文件失败', { error: error.message, cycleId });
    throw error;
  }
}

// 确认周期（计算折扣并结束周期）
router.post('/cycles/:id/confirm', async (req, res) => {
  try {
    const { id } = req.params;
    const { beginTransaction, commit, rollback } = require('../db/database');
    const baseUrl = getBaseUrl(req);
    
    await beginTransaction();
    
    try {
      // 获取周期信息
      const cycle = await getAsync('SELECT * FROM ordering_cycles WHERE id = ?', [id]);
      if (!cycle) {
        return res.status(404).json({ success: false, message: '周期不存在' });
      }
      
      if (cycle.status !== 'ended') {
        return res.status(400).json({ success: false, message: '周期尚未结束' });
      }
      
      // 获取周期内的所有待付款订单
      const orders = await allAsync(
        `SELECT * FROM orders 
         WHERE created_at >= ? AND created_at <= ? AND status = 'pending'`,
        [cycle.start_time, cycle.end_time]
      );
      
      // 获取折扣规则
      const rules = await allAsync(
        'SELECT * FROM discount_rules WHERE status = ? ORDER BY min_amount DESC',
        ['active']
      );
      
      // 计算适用的折扣率
      let discountRate = 0;
      for (const rule of rules) {
        if (cycle.total_amount >= rule.min_amount) {
          discountRate = rule.discount_rate / 100;
          break;
        }
      }
      
      // 检查orders表是否有balance_used字段
      const ordersTableInfo = await allAsync("PRAGMA table_info(orders)");
      const ordersColumns = ordersTableInfo.map(col => col.name);
      const hasBalanceUsed = ordersColumns.includes('balance_used');
      
      // 更新所有订单的折扣，并将待付款订单自动取消
      let cancelledCount = 0;
      let refundedCount = 0;
      for (const order of orders) {
        const discountAmount = roundAmount(order.total_amount * discountRate);
        // 计算最终金额：原价 - 折扣 - 已使用的余额
        const balanceUsed = hasBalanceUsed && order.balance_used ? (order.balance_used || 0) : 0;
        const finalAmount = roundAmount(order.total_amount - discountAmount - balanceUsed);
        
        // 如果订单是待付款状态，自动取消
        if (order.status === 'pending') {
          await runAsync(
            "UPDATE orders SET discount_amount = ?, final_amount = ?, status = 'cancelled', updated_at = datetime('now', 'localtime') WHERE id = ?",
            [discountAmount, finalAmount, order.id]
          );
          cancelledCount++;
          
          // 如果订单使用了余额，需要退还余额
          if (hasBalanceUsed && balanceUsed > 0) {
            // 获取用户当前余额
            const user = await getAsync('SELECT balance FROM users WHERE id = ?', [order.user_id]);
              if (user) {
                const balanceBefore = user.balance || 0;
                const balanceAfter = roundAmount(balanceBefore + balanceUsed);
                
                // 退还余额
                await runAsync(
                  'UPDATE users SET balance = ? WHERE id = ?',
                  [balanceAfter, order.user_id]
                );
                
                // 记录余额变动
                await runAsync(
                  `INSERT INTO balance_transactions (user_id, type, amount, balance_before, balance_after, order_id, notes, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))`,
                  [
                    order.user_id,
                    'refund',
                    balanceUsed, // 正数表示增加
                    balanceBefore,
                    balanceAfter,
                    order.id,
                    '周期确认，订单自动取消，退还余额'
                  ]
                );
                
                refundedCount++;
                logger.info('订单取消，已退还余额', { 
                  orderId: order.id, 
                  userId: order.user_id, 
                  balanceUsed 
                });
              }
          }
        } else {
          // 已付款的订单只更新折扣
        await runAsync(
          "UPDATE orders SET discount_amount = ?, final_amount = ?, updated_at = datetime('now', 'localtime') WHERE id = ?",
          [discountAmount, finalAmount, order.id]
        );
        }
      }
      
      // 更新周期状态
      await runAsync(
        `UPDATE ordering_cycles 
         SET status = 'confirmed', discount_rate = ?, confirmed_at = datetime('now', 'localtime'), updated_at = datetime('now', 'localtime') 
         WHERE id = ?`,
        [discountRate * 100, id]
      );
      
      logger.info('周期确认完成，已自动取消待付款订单', { 
        cycleId: id, 
        cancelledCount, 
        refundedCount,
        totalOrders: orders.length 
      });
      
      await commit();
      await logAction(req.session.adminId, 'UPDATE', 'ordering_cycle', id, { discountRate, orderCount: orders.length }, req);
      
      // 生成Excel文件并发送邮件（异步执行，不阻塞响应）
      (async () => {
        try {
          const excelFilePath = await generateCycleExcelFile(id, baseUrl);
          logger.info('周期订单Excel文件已生成', { cycleId: id, filePath: excelFilePath });
          
          // 发送邮件
          const emailResult = await sendCycleExportEmail(id, excelFilePath);
          if (emailResult.success) {
            logger.info('周期订单导出邮件已发送', { cycleId: id });
          } else {
            logger.warn('周期订单导出邮件发送失败', { cycleId: id, message: emailResult.message });
          }
        } catch (error) {
          logger.error('生成Excel或发送邮件失败', { error: error.message, cycleId: id });
        }
      })();
      
      res.json({ 
        success: true, 
        message: '周期确认成功',
        discountRate: discountRate * 100,
        orderCount: orders.length,
        cancelledCount: cancelledCount,
        refundedCount: refundedCount
      });
    } catch (error) {
      await rollback();
      throw error;
    }
  } catch (error) {
    logger.error('确认周期失败', { error: error.message });
    res.status(500).json({ success: false, message: '确认周期失败' });
  }
});

// 测试邮件配置
router.post('/email/test', async (req, res) => {
  try {
    const result = await testEmailConfig();
    res.json(result);
  } catch (error) {
    logger.error('测试邮件失败', { error: error.message });
    res.status(500).json({ success: false, message: error.message });
  }
});

// 更新订单状态
router.put('/orders/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['pending', 'paid', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: '状态值无效' });
    }

    await runAsync(
      "UPDATE orders SET status = ?, updated_at = datetime('now', 'localtime') WHERE id = ?",
      [status, id]
    );

    await logAction(req.session.adminId, 'UPDATE', 'order', id, { status }, req);

    res.json({ success: true, message: '订单状态更新成功' });
  } catch (error) {
    logger.error('更新订单状态失败', { error: error.message });
    res.status(500).json({ success: false, message: '更新订单状态失败' });
  }
});

// ==================== 余额管理 ====================

/**
 * GET /api/admin/users/balance
 * Get all users' balance information
 * @returns {Object} List of users with balance
 */
router.get('/users/balance', async (req, res) => {
  try {
    const users = await allAsync(`
      SELECT 
        u.id,
        u.phone,
        u.name,
        u.balance,
        COALESCE(MAX(bt.created_at), u.created_at) as last_transaction_time
      FROM users u
      LEFT JOIN balance_transactions bt ON u.id = bt.user_id
      WHERE u.phone NOT LIKE 'TABLE-%'
      GROUP BY u.id, u.phone, u.name, u.balance, u.created_at
      ORDER BY u.id DESC
    `);
    
    res.json({ success: true, users });
  } catch (error) {
    logger.error('获取用户余额列表失败', { error: error.message });
    res.status(500).json({ success: false, message: '获取用户余额列表失败' });
  }
});

/**
 * POST /api/admin/users/:userId/balance/recharge
 * Recharge user balance
 * @param {number} userId - User ID
 * @body {number} amount - Recharge amount
 * @body {string} [notes] - Notes
 * @returns {Object} Success message
 */
router.post('/users/:userId/balance/recharge', [
  body('amount').isFloat({ min: 0.01 }).withMessage('充值金额必须大于0'),
  body('notes').optional().trim().isLength({ max: 500 }).withMessage('备注长度不能超过500个字符'),
  validate
], async (req, res) => {
  try {
    const { userId } = req.params;
    const { amount, notes } = req.body;

    const user = await getAsync('SELECT * FROM users WHERE id = ?', [userId]);
    if (!user) {
      return res.status(404).json({ success: false, message: '用户不存在' });
    }

    await beginTransaction();

    try {
      const balanceBefore = user.balance || 0;
      const balanceAfter = roundAmount(balanceBefore + parseFloat(amount));

      // 更新用户余额
      await runAsync(
        'UPDATE users SET balance = ? WHERE id = ?',
        [balanceAfter, userId]
      );

      // 记录余额变动
      await runAsync(
        `INSERT INTO balance_transactions (user_id, type, amount, balance_before, balance_after, admin_id, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))`,
        [
          userId,
          'recharge',
          parseFloat(amount),
          balanceBefore,
          balanceAfter,
          req.session.adminId,
          notes || '管理员充值'
        ]
      );

      await commit();

      await logAction(req.session.adminId, 'RECHARGE_BALANCE', 'user', userId, {
        amount: parseFloat(amount),
        balanceBefore,
        balanceAfter,
        notes: notes || '管理员充值'
      }, req);

      res.json({
        success: true,
        message: '充值成功',
        balance: balanceAfter
      });
    } catch (error) {
      await rollback();
      throw error;
    }
  } catch (error) {
    logger.error('充值余额失败', { error: error.message });
    res.status(500).json({ success: false, message: error.message || '充值余额失败' });
  }
});

/**
 * POST /api/admin/users/:userId/balance/deduct
 * Deduct user balance
 * @param {number} userId - User ID
 * @body {number} amount - Deduct amount
 * @body {string} [notes] - Notes
 * @returns {Object} Success message
 */
router.post('/users/:userId/balance/deduct', [
  body('amount').isFloat({ min: 0.01 }).withMessage('扣减金额必须大于0'),
  body('notes').optional().trim().isLength({ max: 500 }).withMessage('备注长度不能超过500个字符'),
  validate
], async (req, res) => {
  try {
    const { userId } = req.params;
    const { amount, notes } = req.body;

    const user = await getAsync('SELECT * FROM users WHERE id = ?', [userId]);
    if (!user) {
      return res.status(404).json({ success: false, message: '用户不存在' });
    }

    const balanceBefore = user.balance || 0;
    const deductAmount = parseFloat(amount);

    if (balanceBefore < deductAmount) {
      return res.status(400).json({
        success: false,
        message: `余额不足，当前余额：${balanceBefore.toFixed(2)}，扣减金额：${deductAmount.toFixed(2)}`
      });
    }

    await beginTransaction();

    try {
      const balanceAfter = roundAmount(balanceBefore - deductAmount);

      // 更新用户余额
      await runAsync(
        'UPDATE users SET balance = ? WHERE id = ?',
        [balanceAfter, userId]
      );

      // 记录余额变动
      await runAsync(
        `INSERT INTO balance_transactions (user_id, type, amount, balance_before, balance_after, admin_id, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))`,
        [
          userId,
          'deduct',
          -deductAmount, // 负数表示减少
          balanceBefore,
          balanceAfter,
          req.session.adminId,
          notes || '管理员扣减'
        ]
      );

      await commit();

      await logAction(req.session.adminId, 'DEDUCT_BALANCE', 'user', userId, {
        amount: deductAmount,
        balanceBefore,
        balanceAfter,
        notes: notes || '管理员扣减'
      }, req);

      res.json({
        success: true,
        message: '扣减成功',
        balance: balanceAfter
      });
    } catch (error) {
      await rollback();
      throw error;
    }
  } catch (error) {
    logger.error('扣减余额失败', { error: error.message });
    res.status(500).json({ success: false, message: error.message || '扣减余额失败' });
  }
});

/**
 * GET /api/admin/users/:userId/balance/transactions
 * Get user's balance transaction history
 * @param {number} userId - User ID
 * @query {number} [page=1] - Page number
 * @query {number} [limit=30] - Items per page
 * @returns {Object} Transaction history with pagination
 */
router.get('/users/:userId/balance/transactions', async (req, res) => {
  try {
    const { userId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 30;
    const offset = (page - 1) * limit;

    // 检查用户是否存在
    const user = await getAsync('SELECT id, phone, name FROM users WHERE id = ?', [userId]);
    if (!user) {
      return res.status(404).json({ success: false, message: '用户不存在' });
    }

    // 获取总数
    const totalResult = await getAsync(
      'SELECT COUNT(*) as total FROM balance_transactions WHERE user_id = ?',
      [userId]
    );
    const total = totalResult.total || 0;

    // 获取交易记录
    const transactions = await allAsync(
      `SELECT 
        bt.*,
        a.username as admin_username,
        a.name as admin_name,
        o.order_number
       FROM balance_transactions bt
       LEFT JOIN admins a ON bt.admin_id = a.id
       LEFT JOIN orders o ON bt.order_id = o.id
       WHERE bt.user_id = ?
       ORDER BY bt.created_at DESC
       LIMIT ? OFFSET ?`,
      [userId, limit, offset]
    );

    res.json({
      success: true,
      transactions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      },
      user: {
        id: user.id,
        phone: user.phone,
        name: user.name
      }
    });
  } catch (error) {
    logger.error('获取余额变动历史失败', { error: error.message });
    res.status(500).json({ success: false, message: '获取余额变动历史失败' });
  }
});

/**
 * GET /api/admin/balance/transactions
 * Get all balance transactions with filters
 * @query {number} [page=1] - Page number
 * @query {number} [limit=30] - Items per page
 * @query {number} [userId] - Filter by user ID
 * @query {string} [type] - Filter by type (recharge/deduct/use/refund)
 * @query {string} [startDate] - Start date (YYYY-MM-DD)
 * @query {string} [endDate] - End date (YYYY-MM-DD)
 * @returns {Object} Transaction history with pagination
 */
router.get('/balance/transactions', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 30;
    const offset = (page - 1) * limit;
    const { userId, type, startDate, endDate } = req.query;

    // 构建查询条件
    let whereConditions = [];
    let queryParams = [];

    if (userId) {
      whereConditions.push('bt.user_id = ?');
      queryParams.push(userId);
    }

    if (type) {
      whereConditions.push('bt.type = ?');
      queryParams.push(type);
    }

    if (startDate) {
      whereConditions.push("DATE(bt.created_at) >= ?");
      queryParams.push(startDate);
    }

    if (endDate) {
      whereConditions.push("DATE(bt.created_at) <= ?");
      queryParams.push(endDate);
    }

    const whereClause = whereConditions.length > 0 
      ? 'WHERE ' + whereConditions.join(' AND ')
      : '';

    // 获取总数
    const totalResult = await getAsync(
      `SELECT COUNT(*) as total FROM balance_transactions bt ${whereClause}`,
      queryParams
    );
    const total = totalResult.total || 0;

    // 获取交易记录
    const transactions = await allAsync(
      `SELECT 
        bt.*,
        u.phone as user_phone,
        u.name as user_name,
        a.username as admin_username,
        a.name as admin_name,
        o.order_number
       FROM balance_transactions bt
       LEFT JOIN users u ON bt.user_id = u.id
       LEFT JOIN admins a ON bt.admin_id = a.id
       LEFT JOIN orders o ON bt.order_id = o.id
       ${whereClause}
       ORDER BY bt.created_at DESC
       LIMIT ? OFFSET ?`,
      [...queryParams, limit, offset]
    );

    res.json({
      success: true,
      transactions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error('获取余额变动历史失败', { error: error.message });
    res.status(500).json({ success: false, message: '获取余额变动历史失败' });
  }
});

/**
 * POST /api/admin/users/balance/batch-recharge
 * Batch recharge user balance
 * @body {Array} users - Array of {userId, amount, notes}
 * @returns {Object} Success message with results
 */
router.post('/users/balance/batch-recharge', [
  body('users').isArray().withMessage('用户列表必须是数组'),
  body('users.*.userId').isInt().withMessage('用户ID必须是整数'),
  body('users.*.amount').isFloat({ min: 0.01 }).withMessage('充值金额必须大于0'),
  body('users.*.notes').optional().trim().isLength({ max: 500 }).withMessage('备注长度不能超过500个字符'),
  validate
], async (req, res) => {
  const { users } = req.body;
  
  try {
    await beginTransaction();
    
    const results = [];
    const errors = [];
    
    for (const userData of users) {
      try {
        const { userId, amount, notes } = userData;
        
        // 检查用户是否存在
        const user = await getAsync('SELECT id, balance FROM users WHERE id = ?', [userId]);
        if (!user) {
          errors.push({ userId, error: '用户不存在' });
          continue;
        }
        
        const balanceBefore = user.balance || 0;
        const balanceAfter = roundAmount(balanceBefore + parseFloat(amount));
        
        // 更新用户余额
        await runAsync(
          'UPDATE users SET balance = ? WHERE id = ?',
          [balanceAfter, userId]
        );
        
        // 记录余额变动
        await runAsync(
          `INSERT INTO balance_transactions (user_id, type, amount, balance_before, balance_after, admin_id, notes, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))`,
          [
            userId,
            'recharge',
            parseFloat(amount),
            balanceBefore,
            balanceAfter,
            req.session.adminId,
            notes || '批量充值'
          ]
        );
        
        // 记录操作日志
        await logAction(req.session.adminId, 'BATCH_RECHARGE_BALANCE', 'user', userId, {
          amount: parseFloat(amount),
          balanceBefore,
          balanceAfter,
          notes: notes || '批量充值'
        }, req);
        
        results.push({ userId, success: true, balanceAfter });
      } catch (error) {
        errors.push({ userId: userData.userId, error: error.message });
      }
    }
    
    await commit();
    
    res.json({
      success: true,
      message: `批量充值完成：成功 ${results.length} 个，失败 ${errors.length} 个`,
      results,
      errors
    });
  } catch (error) {
    await rollback();
    logger.error('批量充值余额失败', { error: error.message });
    res.status(500).json({ success: false, message: error.message || '批量充值余额失败' });
  }
});

/**
 * POST /api/admin/cycles/:cycleId/balance/recharge-paid-users
 * Recharge balance to all paid users in a specific cycle
 * @param {number} cycleId - Cycle ID
 * @body {number} amount - Recharge amount per user
 * @body {string} [notes] - Notes
 * @returns {Object} Success message with results
 */
router.post('/cycles/:cycleId/balance/recharge-paid-users', [
  body('amount').isFloat({ min: 0.01 }).withMessage('充值金额必须大于0'),
  body('notes').optional().trim().isLength({ max: 500 }).withMessage('备注长度不能超过500个字符'),
  validate
], async (req, res) => {
  const { cycleId } = req.params;
  const { amount, notes } = req.body;
  
  try {
    // 获取周期信息
    const cycle = await getAsync('SELECT * FROM ordering_cycles WHERE id = ?', [cycleId]);
    if (!cycle) {
      return res.status(404).json({ success: false, message: '周期不存在' });
    }
    
    // 获取周期内所有已付款订单的用户（去重）
    const paidUsers = await allAsync(`
      SELECT DISTINCT o.user_id, u.balance
      FROM orders o
      JOIN users u ON o.user_id = u.id
      WHERE o.created_at >= ? AND o.created_at <= ? AND o.status IN ('paid', 'completed')
    `, [cycle.start_time, cycle.end_time || cycle.updated_at]);
    
    if (paidUsers.length === 0) {
      return res.json({
        success: true,
        message: '该周期内没有已付款订单',
        results: [],
        errors: []
      });
    }
    
    await beginTransaction();
    
    const results = [];
    const errors = [];
    
    for (const userData of paidUsers) {
      try {
        const userId = userData.user_id;
        const balanceBefore = userData.balance || 0;
        const balanceAfter = roundAmount(balanceBefore + parseFloat(amount));
        
        // 更新用户余额
        await runAsync(
          'UPDATE users SET balance = ? WHERE id = ?',
          [balanceAfter, userId]
        );
        
        // 记录余额变动
        await runAsync(
          `INSERT INTO balance_transactions (user_id, type, amount, balance_before, balance_after, admin_id, notes, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))`,
          [
            userId,
            'recharge',
            parseFloat(amount),
            balanceBefore,
            balanceAfter,
            req.session.adminId,
            notes || `周期 ${cycle.cycle_number} 已付款用户批量充值`
          ]
        );
        
        // 记录操作日志
        await logAction(req.session.adminId, 'CYCLE_BATCH_RECHARGE_BALANCE', 'user', userId, {
          cycleId,
          cycleNumber: cycle.cycle_number,
          amount: parseFloat(amount),
          balanceBefore,
          balanceAfter,
          notes: notes || `周期 ${cycle.cycle_number} 已付款用户批量充值`
        }, req);
        
        results.push({ userId, success: true, balanceAfter });
      } catch (error) {
        errors.push({ userId: userData.user_id, error: error.message });
      }
    }
    
    await commit();
    
    res.json({
      success: true,
      message: `批量充值完成：成功 ${results.length} 个，失败 ${errors.length} 个`,
      results,
      errors
    });
  } catch (error) {
    await rollback();
    logger.error('周期批量充值余额失败', { error: error.message, cycleId });
    res.status(500).json({ success: false, message: error.message || '周期批量充值余额失败' });
  }
});

// ==================== 用户管理 ====================

/**
 * PUT /api/admin/users/:userId
 * Update user information
 * @param {number} userId - User ID
 * @body {string} [name] - User name
 * @body {string} [phone] - User phone (must be unique)
 * @returns {Object} Success message
 */
router.put('/users/:userId', [
  body('name').optional().trim().isLength({ max: 100 }).withMessage('姓名长度不能超过100个字符'),
  body('phone').optional().trim().matches(/^0\d{10}$/).withMessage('手机号格式不正确（必须是11位数字，以0开头）'),
  validate
], async (req, res) => {
  const { userId } = req.params;
  const { name, phone } = req.body;
  
  try {
    // 检查用户是否存在
    const user = await getAsync('SELECT * FROM users WHERE id = ?', [userId]);
    if (!user) {
      return res.status(404).json({ success: false, message: '用户不存在' });
    }
    
    // 如果更新手机号，检查是否重复
    if (phone && phone !== user.phone) {
      const existingUser = await getAsync('SELECT id FROM users WHERE phone = ? AND id != ?', [phone, userId]);
      if (existingUser) {
        return res.status(400).json({ success: false, message: '手机号已被使用' });
      }
    }
    
    await beginTransaction();
    
    // 构建更新字段
    const updates = [];
    const params = [];
    
    if (name !== undefined) {
      updates.push('name = ?');
      params.push(name || null);
    }
    
    if (phone !== undefined) {
      updates.push('phone = ?');
      params.push(phone);
    }
    
    if (updates.length === 0) {
      await rollback();
      return res.status(400).json({ success: false, message: '没有需要更新的字段' });
    }
    
    params.push(userId);
    
    await runAsync(
      `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
      params
    );
    
    // 记录操作日志
    await logAction(req.session.adminId, 'UPDATE_USER', 'user', userId, {
      name: name !== undefined ? name : user.name,
      phone: phone !== undefined ? phone : user.phone
    }, req);
    
    await commit();
    
    res.json({ success: true, message: '用户信息更新成功' });
  } catch (error) {
    await rollback();
    logger.error('更新用户信息失败', { error: error.message, userId });
    res.status(500).json({ success: false, message: error.message || '更新用户信息失败' });
  }
});

/**
 * DELETE /api/admin/users/:userId
 * Delete a user
 * @param {number} userId - User ID
 * @returns {Object} Success message
 */
router.delete('/users/:userId', async (req, res) => {
  const { userId } = req.params;
  
  try {
    // 验证userId参数
    if (!userId || isNaN(parseInt(userId))) {
      logger.warn('删除用户：无效的userId参数', { userId, method: req.method, path: req.path });
      return res.status(400).json({ success: false, message: '无效的用户ID' });
    }
    
    // 检查用户是否存在
    const user = await getAsync('SELECT * FROM users WHERE id = ?', [userId]);
    if (!user) {
      logger.warn('删除用户：用户不存在', { userId });
      return res.status(404).json({ success: false, message: '用户不存在' });
    }
    
    await beginTransaction();
    
    try {
      // 获取用户的所有订单ID（用于统计和日志）
      const userOrders = await allAsync(
        'SELECT id, order_number, status FROM orders WHERE user_id = ?',
        [userId]
      );
      
      // 获取用户的余额变动记录数量（用于统计和日志）
      const balanceTransactions = await allAsync(
        'SELECT COUNT(*) as count FROM balance_transactions WHERE user_id = ?',
        [userId]
      );
      const transactionCount = balanceTransactions[0]?.count || 0;
      
      // 强制删除用户的所有订单（这会级联删除订单项，因为 order_items 有 ON DELETE CASCADE）
      await runAsync(
        'DELETE FROM orders WHERE user_id = ?',
        [userId]
      );
      
      // 删除余额变动记录（虽然外键约束是 ON DELETE CASCADE，但为了确保数据一致性，我们显式删除）
      // 注意：如果外键约束正常工作，这行可能不会删除任何记录，但不会报错
      await runAsync(
        'DELETE FROM balance_transactions WHERE user_id = ?',
        [userId]
      );
      
      // 删除用户
      await runAsync('DELETE FROM users WHERE id = ?', [userId]);
      
      // 记录操作日志
      await logAction(req.session.adminId, 'DELETE_USER', 'user', userId, {
        phone: user.phone,
        name: user.name,
        deletedOrdersCount: userOrders.length,
        deletedTransactionsCount: transactionCount,
        forceDelete: true
      }, req);
      
      await commit();
      
      logger.info('用户强制删除成功', {
        userId,
        phone: user.phone,
        deletedOrdersCount: userOrders.length,
        deletedTransactionsCount: transactionCount
      });
      
      res.json({ 
        success: true, 
        message: '用户删除成功',
        deletedOrdersCount: userOrders.length,
        deletedTransactionsCount: transactionCount
      });
    } catch (error) {
      await rollback();
      throw error;
    }
  } catch (error) {
    await rollback();
    logger.error('删除用户失败', { 
      error: error.message, 
      userId,
      stack: error.stack,
      method: req.method,
      path: req.path,
      params: req.params
    });
    res.status(500).json({ success: false, message: error.message || '删除用户失败' });
  }
});

/**
 * POST /api/admin/users/:userId/reset-pin
 * Reset (clear) user PIN
 * @param {number} userId - User ID
 * @returns {Object} Success message
 */
router.post('/users/:userId/reset-pin', async (req, res) => {
  const { userId } = req.params;
  
  try {
    // 检查用户是否存在
    const user = await getAsync('SELECT * FROM users WHERE id = ?', [userId]);
    if (!user) {
      return res.status(404).json({ success: false, message: '用户不存在' });
    }
    
    await beginTransaction();
    
    // 清空用户 PIN
    await runAsync('UPDATE users SET pin = NULL WHERE id = ?', [userId]);
    
    // 记录操作日志
    await logAction(req.session.adminId, 'RESET_USER_PIN', 'user', userId, {
      phone: user.phone,
      name: user.name
    }, req);
    
    await commit();
    
    res.json({ success: true, message: '用户PIN已重置，用户下次登录时需要重新设置PIN' });
  } catch (error) {
    await rollback();
    logger.error('重置用户PIN失败', { error: error.message, userId });
    res.status(500).json({ success: false, message: error.message || '重置用户PIN失败' });
  }
});

// 获取所有用户
/**
 * POST /api/admin/users/:phone/unlock
 * Unlock a user account and clear login failure records
 * @param {string} phone - User phone number
 * @returns {Object} Success message
 */
router.post('/users/:phone/unlock', async (req, res) => {
  const { phone } = req.params;
  
  try {
    // 检查用户是否存在
    const user = await getAsync('SELECT * FROM users WHERE phone = ?', [phone]);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    // 检查是否有失败记录（包括锁定和未锁定的）
    const attempt = await getAsync(
      'SELECT * FROM user_login_attempts WHERE phone = ?',
      [phone]
    );
    
    if (!attempt) {
      return res.json({ 
        success: true, 
        message: 'No login failure records found',
        hadRecords: false
      });
    }
    
    await beginTransaction();
    
    // 清除所有失败记录（包括锁定状态和失败计数）
    await runAsync(
      'DELETE FROM user_login_attempts WHERE phone = ?',
      [phone]
    );
    
    // 记录操作日志
    await logAction(req.session.adminId, 'UNLOCK_USER', 'user', user.id, {
      phone: user.phone,
      name: user.name,
      failedCount: attempt.failed_count || 0,
      lockedUntil: attempt.locked_until || null,
      wasLocked: !!attempt.locked_until
    }, req);
    
    await commit();
    
    logger.info('用户账户解锁/清除失败记录成功', {
      userId: user.id,
      phone: user.phone,
      failedCount: attempt.failed_count || 0,
      wasLocked: !!attempt.locked_until
    });
    
    res.json({ 
      success: true, 
      message: attempt.locked_until ? 'User unlocked successfully' : 'Login failure records cleared successfully',
      hadRecords: true,
      wasLocked: !!attempt.locked_until
    });
  } catch (error) {
    await rollback();
    logger.error('解锁/清除用户失败记录失败', { error: error.message, phone });
    res.status(500).json({ success: false, message: error.message || 'Failed to unlock/clear user records' });
  }
});

router.get('/users', async (req, res) => {
  try {
    const users = await allAsync(`
      SELECT u.*, COUNT(o.id) as order_count, SUM(o.final_amount) as total_spent
      FROM users u
      LEFT JOIN orders o ON u.id = o.user_id
      WHERE u.phone NOT LIKE 'TABLE-%'
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `);

    // 为每个用户添加锁定状态信息
    const usersWithLockStatus = await Promise.all(users.map(async (user) => {
      const attempt = await getAsync(
        'SELECT * FROM user_login_attempts WHERE phone = ?',
        [user.phone]
      );

      const now = new Date();
      let securityInfo = {
        isLocked: false,
        lockedUntil: null,
        remainingTime: null,
        failedCount: attempt ? (attempt.failed_count || 0) : 0,
        firstAttemptAt: attempt ? attempt.first_attempt_at : null,
        lastAttemptAt: attempt ? attempt.last_attempt_at : null
      };

      if (attempt && attempt.locked_until) {
        const lockedUntil = new Date(attempt.locked_until.replace(' ', 'T'));
        
        if (now < lockedUntil) {
          // 仍在锁定期间
          const remainingMs = lockedUntil.getTime() - now.getTime();
          const remainingMinutes = Math.ceil(remainingMs / (60 * 1000));
          const remainingHours = Math.floor(remainingMinutes / 60);
          const remainingMins = remainingMinutes % 60;
          
          let lockoutMessage = '';
          if (remainingHours > 0) {
            lockoutMessage = `${remainingHours}h ${remainingMins}m`;
          } else {
            lockoutMessage = `${remainingMinutes}m`;
          }
          
          securityInfo.isLocked = true;
          securityInfo.lockedUntil = attempt.locked_until;
          securityInfo.remainingTime = lockoutMessage;
        }
      }

      return {
        ...user,
        ...securityInfo
      };
    }));

    res.json({ success: true, users: usersWithLockStatus });
  } catch (error) {
    logger.error('获取用户列表失败', { error: error.message });
    res.status(500).json({ success: false, message: '获取用户列表失败' });
  }
});

// 更新用户权限
router.put('/users/:id/permission', async (req, res) => {
  try {
    const { id } = req.params;
    const { permission } = req.body;
    
    // 验证权限值
    if (permission !== 'readonly' && permission !== 'readwrite') {
      return res.status(400).json({ 
        success: false, 
        message: '权限值必须是 readonly 或 readwrite' 
      });
    }
    
    // 检查用户是否存在
    const user = await getAsync('SELECT id FROM users WHERE id = ?', [id]);
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: '用户不存在' 
      });
    }
    
    // 更新权限
    await runAsync(
      'UPDATE users SET permission = ? WHERE id = ?',
      [permission, id]
    );
    
    // 记录操作日志
    await logAction(
      req.session?.adminId || null,
      'UPDATE',
      'user',
      id,
      JSON.stringify({ permission }),
      req
    );
    
    res.json({ 
      success: true, 
      message: '用户权限更新成功',
      permission 
    });
  } catch (error) {
    logger.error('更新用户权限失败', { error: error.message });
    res.status(500).json({ success: false, message: '更新用户权限失败' });
  }
});

// ==================== IP锁定管理 ====================

/**
 * GET /api/admin/security/alerts/high-risk
 * 获取高危访问告警（持久化 + 已读/未读）
 */
router.get('/security/alerts/high-risk', async (req, res) => {
  try {
    const { hours = 24, limit = 200, unread_only = 'false', sync = 'false' } = req.query;

    if (String(sync) !== 'false') {
      await syncSecurityAlerts({
        hours,
        limit: Math.max(parseInt(limit, 10) || 200, 500),
        sendTelegram: true
      });
    }

    const result = await listPersistedHighRiskAlerts({
      hours,
      limit,
      unreadOnly: String(unread_only) === 'true'
    });

    res.json({
      success: true,
      summary: result.summary,
      topIps: result.topIps,
      topCategories: result.topCategories,
      alerts: result.alerts
    });
  } catch (error) {
    logger.error('获取高危告警失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: '获取高危告警失败'
    });
  }
});

/**
 * POST /api/admin/security/alerts/backfill-today
 * 手动补录今天告警（用于初始化展示）
 */
router.post('/security/alerts/backfill-today', async (req, res) => {
  try {
    const result = await syncSecurityAlerts({
      hours: 24,
      limit: 2000,
      sendTelegram: true
    });

    await logAction(req.session.adminId, 'SECURITY_ALERTS_BACKFILL', 'security_alert', null, result, req);

    res.json({
      success: true,
      message: '今天告警补录完成',
      result
    });
  } catch (error) {
    logger.error('补录今天告警失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: '补录今天告警失败'
    });
  }
});

/**
 * POST /api/admin/security/alerts/mark-read
 * 标记告警为已读（单条或批量）
 */
router.post('/security/alerts/mark-read', async (req, res) => {
  try {
    const { ids = [], all = false, hours = 24 } = req.body || {};
    let affected = 0;

    if (all) {
      const safeHours = Math.min(Math.max(parseInt(hours, 10) || 24, 1), 168);
      const updateResult = await runAsync(
        `UPDATE security_alerts
         SET is_read = 1, updated_at = datetime('now', 'localtime')
         WHERE is_read = 0
           AND severity = ?
           AND alert_time >= datetime('now', ?, 'localtime')`,
        [HIGH_RISK_SEVERITY, `-${safeHours} hours`]
      );
      affected = updateResult.changes || 0;
    } else if (Array.isArray(ids) && ids.length > 0) {
      const validIds = ids.map((id) => parseInt(id, 10)).filter((id) => Number.isInteger(id) && id > 0);
      if (validIds.length === 0) {
        return res.status(400).json({ success: false, message: 'ids 无效' });
      }

      const placeholders = validIds.map(() => '?').join(',');
      const updateResult = await runAsync(
        `UPDATE security_alerts
         SET is_read = 1, updated_at = datetime('now', 'localtime')
         WHERE id IN (${placeholders})`,
        validIds
      );
      affected = updateResult.changes || 0;
    } else {
      return res.status(400).json({ success: false, message: '请传入 ids 或 all=true' });
    }

    res.json({
      success: true,
      message: '告警已标记为已读',
      affected
    });
  } catch (error) {
    logger.error('标记告警已读失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: '标记告警已读失败'
    });
  }
});

/**
 * GET /api/admin/security/alerts/telegram-config
 * 读取 Telegram 告警配置（敏感信息做掩码）
 */
router.get('/security/alerts/telegram-config', async (req, res) => {
  try {
    const cfg = await getTelegramConfig();
    const maskedToken = cfg.botToken ? `${cfg.botToken.slice(0, 8)}***` : '';
    const maskedChatId = cfg.chatId ? `${cfg.chatId.slice(0, 4)}***` : '';
    res.json({
      success: true,
      config: {
        enabled: cfg.enabled,
        botTokenMasked: maskedToken,
        chatIdMasked: maskedChatId,
        hasBotToken: Boolean(cfg.botToken),
        hasChatId: Boolean(cfg.chatId)
      }
    });
  } catch (error) {
    logger.error('读取 Telegram 告警配置失败', { error: error.message });
    res.status(500).json({ success: false, message: '读取配置失败' });
  }
});

/**
 * POST /api/admin/security/alerts/telegram-config
 * 保存 Telegram 告警配置
 */
router.post('/security/alerts/telegram-config', async (req, res) => {
  try {
    const { enabled, botToken, chatId, test = false } = req.body || {};
    const normalizedEnabled = String(enabled) === 'true' || enabled === true;
    const existingCfg = await getTelegramConfig();
    const finalBotToken = (botToken && String(botToken).trim()) ? String(botToken).trim() : existingCfg.botToken;
    const finalChatId = (chatId && String(chatId).trim()) ? String(chatId).trim() : existingCfg.chatId;

    await beginTransaction();
    try {
      const updates = [
        ['telegram_alert_enabled', normalizedEnabled ? 'true' : 'false'],
        ['telegram_bot_token', finalBotToken || ''],
        ['telegram_chat_id', finalChatId || '']
      ];

      for (const [key, value] of updates) {
        await runAsync(
          `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now', 'localtime'))
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now', 'localtime')`,
          [key, value]
        );
      }
      await commit();
    } catch (error) {
      await rollback();
      throw error;
    }

    if (test && normalizedEnabled && finalBotToken && finalChatId) {
      await sendTelegramMessage(finalBotToken, finalChatId, '<b>Telegram 告警测试</b>\n配置保存成功。');
    }

    await logAction(req.session.adminId, 'UPDATE_TELEGRAM_ALERT_CONFIG', 'settings', null, { enabled: normalizedEnabled }, req);

    res.json({ success: true, message: 'Telegram 配置已保存' });
  } catch (error) {
    logger.error('保存 Telegram 配置失败', { error: error.message });
    res.status(500).json({ success: false, message: `保存配置失败: ${error.message}` });
  }
});

/**
 * GET /api/admin/security/blocked-ips
 * Get list of blocked IP addresses
 * @returns {Object} List of blocked IPs with details
 */
router.get('/security/blocked-ips', async (req, res) => {
  try {
    const now = new Date();
    
    // 获取所有有blocked_until的IP记录
    const blockedIps = await allAsync(`
      SELECT * FROM ip_login_attempts 
      WHERE blocked_until IS NOT NULL 
      AND blocked_until > datetime('now', 'localtime')
      ORDER BY blocked_until DESC
    `);
    
    // 获取所有有失败记录但未锁定的IP（用于显示警告）
    const warningIps = await allAsync(`
      SELECT * FROM ip_login_attempts 
      WHERE (blocked_until IS NULL OR blocked_until <= datetime('now', 'localtime'))
      AND failed_count > 0
      ORDER BY failed_count DESC, last_attempt_at DESC
    `);
    
    const blockedIpsWithDetails = blockedIps.map(ip => {
      const blockedUntil = new Date(ip.blocked_until.replace(' ', 'T'));
      const remainingMs = blockedUntil.getTime() - now.getTime();
      const remainingMinutes = Math.ceil(remainingMs / (60 * 1000));
      const remainingHours = Math.floor(remainingMinutes / 60);
      const remainingMins = remainingMinutes % 60;
      
      let remainingTime = '';
      if (remainingHours > 0) {
        remainingTime = `${remainingHours}h ${remainingMins}m`;
      } else {
        remainingTime = `${remainingMinutes}m`;
      }
      
      return {
        ipAddress: ip.ip_address,
        failedCount: ip.failed_count || 0,
        blockedUntil: ip.blocked_until,
        remainingTime: remainingTime,
        remainingMs: remainingMs,
        firstAttemptAt: ip.first_attempt_at,
        lastAttemptAt: ip.last_attempt_at
      };
    });
    
    const warningIpsWithDetails = warningIps.map(ip => {
      return {
        ipAddress: ip.ip_address,
        failedCount: ip.failed_count || 0,
        blockedUntil: null,
        remainingTime: null,
        remainingMs: 0,
        firstAttemptAt: ip.first_attempt_at,
        lastAttemptAt: ip.last_attempt_at
      };
    });
    
    res.json({ 
      success: true, 
      blockedIps: blockedIpsWithDetails,
      warningIps: warningIpsWithDetails
    });
  } catch (error) {
    logger.error('获取被锁定IP列表失败', { error: error.message });
    res.status(500).json({ success: false, message: '获取被锁定IP列表失败' });
  }
});

/**
 * POST /api/admin/security/blocked-ips/:ip/unlock
 * Unlock a blocked IP address
 * @param {string} ip - IP address
 * @returns {Object} Success message
 */
router.post('/security/blocked-ips/:ip/unlock', async (req, res) => {
  const { ip } = req.params;
  
  try {
    // 检查IP是否存在
    const attempt = await getAsync(
      'SELECT * FROM ip_login_attempts WHERE ip_address = ?',
      [ip]
    );
    
    if (!attempt) {
      return res.status(404).json({ success: false, message: 'IP address not found' });
    }
    
    await beginTransaction();
    
    // 清除IP锁定记录（包括blocked_until和failed_count）
    await runAsync(
      'DELETE FROM ip_login_attempts WHERE ip_address = ?',
      [ip]
    );
    
    // 记录操作日志
    await logAction(req.session.adminId, 'UNLOCK_IP', 'system', null, {
      ipAddress: ip,
      failedCount: attempt.failed_count || 0,
      blockedUntil: attempt.blocked_until || null
    }, req);
    
    await commit();
    
    logger.info('IP地址解锁成功', {
      ip: ip,
      failedCount: attempt.failed_count || 0
    });
    
    res.json({ 
      success: true, 
      message: 'IP address unlocked successfully'
    });
  } catch (error) {
    await rollback();
    logger.error('解锁IP失败', { error: error.message, ip });
    res.status(500).json({ success: false, message: error.message || 'Failed to unlock IP address' });
  }
});

// ==================== 管理员管理 ====================
// 注意：只有super_admin可以管理其他admin

// 检查是否为super_admin的中间件
function requireSuperAdmin(req, res, next) {
  if (!req.session || !req.session.adminId) {
    return res.status(401).json({ 
      success: false, 
      message: 'Please login first' 
    });
  }
  
  if (req.session.adminRole !== 'super_admin') {
    return res.status(403).json({ 
      success: false, 
      message: 'Access denied. Super admin privileges required.' 
    });
  }
  
  next();
}

// 获取所有管理员
router.get('/admins', requireAuth, async (req, res) => {
  try {
    const admins = await allAsync(
      'SELECT id, username, name, email, role, status, created_at FROM admins ORDER BY created_at DESC'
    );
    
    // 为每个管理员添加锁定状态信息
    const adminsWithLockStatus = await Promise.all(admins.map(async (admin) => {
      const attempt = await getAsync(
        'SELECT * FROM admin_login_attempts WHERE username = ?',
        [admin.username]
      );

      const now = new Date();
      let securityInfo = {
        isLocked: false,
        lockedUntil: null,
        remainingTime: null,
        failedCount: attempt ? (attempt.failed_count || 0) : 0,
        firstAttemptAt: attempt ? attempt.first_attempt_at : null,
        lastAttemptAt: attempt ? attempt.last_attempt_at : null
      };

      if (attempt && attempt.locked_until) {
        const lockedUntil = new Date(attempt.locked_until.replace(' ', 'T'));
        
        if (now < lockedUntil) {
          // 仍在锁定期间
          const remainingMs = lockedUntil.getTime() - now.getTime();
          const remainingMinutes = Math.ceil(remainingMs / (60 * 1000));
          const remainingHours = Math.floor(remainingMinutes / 60);
          const remainingMins = remainingMinutes % 60;
          
          let lockoutMessage = '';
          if (remainingHours > 0) {
            lockoutMessage = `${remainingHours}h ${remainingMins}m`;
          } else {
            lockoutMessage = `${remainingMinutes}m`;
          }
          
          securityInfo.isLocked = true;
          securityInfo.lockedUntil = attempt.locked_until;
          securityInfo.remainingTime = lockoutMessage;
        }
      }

      return {
        ...admin,
        ...securityInfo
      };
    }));
    
    res.json({ success: true, admins: adminsWithLockStatus });
  } catch (error) {
    logger.error('获取管理员列表失败', { error: error.message });
    res.status(500).json({ success: false, message: '获取管理员列表失败' });
  }
});

// 创建管理员（只有super_admin可以）
router.post('/admins', requireSuperAdmin, [
  body('username').trim().isLength({ min: 3, max: 50 }),
  body('password').isLength({ min: 6 }),
  body('name').optional({ nullable: true, checkFalsy: false }).trim(),
  body('email').optional({ nullable: true, checkFalsy: false }).normalizeEmail(),
  validate
], async (req, res) => {
  try {
    const { username, password, name, email, role } = req.body;

    // 记录接收到的数据（用于调试）
    logger.info('创建管理员请求', { 
      receivedData: { username, name, email, role, hasPassword: !!password },
      body: req.body 
    });

    // 检查用户名是否已存在
    const existing = await getAsync('SELECT id FROM admins WHERE username = ?', [username]);
    if (existing) {
      return res.status(400).json({ success: false, message: '用户名已存在' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    
    // 处理name和email字段（确保即使是空字符串也保存）
    const nameValue = name !== undefined ? (name || '') : '';
    const emailValue = email !== undefined ? (email || '') : '';
    
    logger.info('执行管理员创建', { 
      username, 
      name: nameValue, 
      email: emailValue, 
      role: role || 'admin' 
    });
    
    const result = await runAsync(
      'INSERT INTO admins (username, password, name, email, role) VALUES (?, ?, ?, ?, ?)',
      [username, hashedPassword, nameValue, emailValue, role || 'admin']
    );

    // 验证创建是否成功
    const createdAdmin = await getAsync('SELECT * FROM admins WHERE id = ?', [result.id]);
    logger.info('管理员创建后的数据', { id: result.id, name: createdAdmin?.name, email: createdAdmin?.email });

    // 记录详细的操作日志
    const logDetails = {
      username: username,
      name: nameValue,
      email: emailValue,
      role: role || 'admin'
    };
    await logAction(req.session.adminId, 'CREATE', 'admin', result.id, JSON.stringify(logDetails), req);

    res.json({ success: true, message: '管理员创建成功', id: result.id });
  } catch (error) {
    logger.error('创建管理员失败', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, message: '创建管理员失败' });
  }
});

// 更新管理员（只有super_admin可以）
router.put('/admins/:id', requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, role, status, password, username } = req.body;

    // 记录接收到的数据（用于调试）
    logger.info('更新管理员请求', { 
      id, 
      receivedData: { name, email, role, status, username, hasPassword: !!password },
      body: req.body 
    });

    const updates = [];
    const params = [];

    // 处理name字段（允许空字符串，但要明确处理）
    if (name !== undefined) {
      updates.push('name = ?');
      params.push(name || ''); // 如果name是null或undefined，保存为空字符串
    }
    if (email !== undefined) {
      updates.push('email = ?');
      params.push(email || ''); // 如果email是null或undefined，保存为空字符串
    }
    if (role !== undefined) {
      updates.push('role = ?');
      params.push(role);
    }
    if (status !== undefined) {
      updates.push('status = ?');
      params.push(status);
    }
    if (password) {
      updates.push('password = ?');
      params.push(await bcrypt.hash(password, 10));
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, message: '没有要更新的字段' });
    }

    updates.push("updated_at = datetime('now', 'localtime')");
    params.push(id);

    // 记录要执行的SQL更新
    logger.info('执行管理员更新', { 
      id, 
      updates, 
      params: params.slice(0, -1) // 不记录id参数
    });

    await runAsync(
      `UPDATE admins SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    // 验证更新是否成功
    const updatedAdmin = await getAsync('SELECT * FROM admins WHERE id = ?', [id]);
    logger.info('管理员更新后的数据', { id, name: updatedAdmin?.name, email: updatedAdmin?.email });

    // 记录详细的操作日志（包含username以便在日志中显示）
    const logDetails = {
      username: username || updatedAdmin?.username || '',
      name: name !== undefined ? (name || '') : (updatedAdmin?.name || ''),
      email: email !== undefined ? (email || '') : (updatedAdmin?.email || ''),
      status: status || updatedAdmin?.status || '',
      role: role || updatedAdmin?.role || ''
    };
    await logAction(req.session.adminId, 'UPDATE', 'admin', id, JSON.stringify(logDetails), req);

    res.json({ success: true, message: '管理员更新成功' });
  } catch (error) {
    logger.error('更新管理员失败', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, message: '更新管理员失败' });
  }
});

// 删除管理员（只有super_admin可以）
router.delete('/admins/:id', requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    // 不能删除自己
    if (req.session.adminId == id) {
      return res.status(400).json({ 
        success: false, 
        message: 'You cannot delete yourself' 
      });
    }
    
    // 检查管理员是否存在
    const admin = await getAsync('SELECT id FROM admins WHERE id = ?', [id]);
    if (!admin) {
      return res.status(404).json({ 
        success: false, 
        message: 'Admin not found' 
      });
    }
    
    await runAsync('DELETE FROM admins WHERE id = ?', [id]);
    
    await logAction(req.session.adminId, 'DELETE', 'admin', id, null, req);
    
    res.json({ success: true, message: '管理员删除成功' });
  } catch (error) {
    logger.error('删除管理员失败', { error: error.message });
    res.status(500).json({ success: false, message: '删除管理员失败' });
  }
});

/**
 * POST /api/admin/admins/:username/unlock
 * Unlock an admin account and clear login failure records
 * @param {string} username - Admin username
 * @returns {Object} Success message
 */
router.post('/admins/:username/unlock', requireSuperAdmin, async (req, res) => {
  const { username } = req.params;
  
  try {
    // 检查管理员是否存在
    const admin = await getAsync('SELECT * FROM admins WHERE username = ?', [username]);
    if (!admin) {
      return res.status(404).json({ success: false, message: 'Admin not found' });
    }
    
    // 检查是否有失败记录（包括锁定和未锁定的）
    const attempt = await getAsync(
      'SELECT * FROM admin_login_attempts WHERE username = ?',
      [username]
    );
    
    if (!attempt) {
      return res.json({ 
        success: true, 
        message: 'No login failure records found',
        hadRecords: false
      });
    }
    
    await beginTransaction();
    
    // 清除所有失败记录（包括锁定状态和失败计数）
    await runAsync(
      'DELETE FROM admin_login_attempts WHERE username = ?',
      [username]
    );
    
    // 如果管理员状态是inactive（由于锁定），自动激活
    if (admin.status === 'inactive') {
      await runAsync(
        'UPDATE admins SET status = ? WHERE username = ?',
        ['active', username]
      );
    }
    
    // 记录操作日志
    await logAction(req.session.adminId, 'UNLOCK_ADMIN', 'admin', admin.id, {
      username: admin.username,
      name: admin.name,
      failedCount: attempt.failed_count || 0,
      lockedUntil: attempt.locked_until || null,
      wasLocked: !!attempt.locked_until,
      wasInactive: admin.status === 'inactive'
    }, req);
    
    await commit();
    
    logger.info('管理员账户解锁/清除失败记录成功', {
      adminId: admin.id,
      username: admin.username,
      failedCount: attempt.failed_count || 0,
      wasLocked: !!attempt.locked_until,
      wasInactive: admin.status === 'inactive'
    });
    
    res.json({ 
      success: true, 
      message: attempt.locked_until ? 'Admin unlocked and activated successfully' : 'Login failure records cleared successfully',
      hadRecords: true,
      wasLocked: !!attempt.locked_until,
      wasInactive: admin.status === 'inactive'
    });
  } catch (error) {
    await rollback();
    logger.error('解锁/清除管理员失败记录失败', { error: error.message, username });
    res.status(500).json({ success: false, message: error.message || 'Failed to unlock/clear admin records' });
  }
});

// ==================== 日志查询 ====================

// 获取操作日志
router.get('/logs', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 30,  // 默认每页30条
      action, 
      admin_id,
      target_type,
      ip_address,
      operator,
      details,     // Details字段模糊匹配
      start_date,  // 开始日期（YYYY-MM-DD格式）
      end_date,    // 结束日期（YYYY-MM-DD格式）
      days = 30    // 如果没有指定日期范围，默认显示最近30天
    } = req.query;
    const offset = (page - 1) * limit;

    let sql = `
      SELECT l.*, a.username as admin_username 
      FROM logs l 
      LEFT JOIN admins a ON l.admin_id = a.id 
      WHERE 1=1
    `;
    const params = [];

    // 日期范围过滤（优先使用start_date和end_date，否则使用days）
    if (start_date && end_date) {
      // 使用指定的日期范围
      sql += ' AND l.created_at >= ? AND l.created_at <= ?';
      params.push(`${start_date} 00:00:00`, `${end_date} 23:59:59`);
    } else if (start_date) {
      // 只有开始日期
      sql += ' AND l.created_at >= ?';
      params.push(`${start_date} 00:00:00`);
    } else if (end_date) {
      // 只有结束日期
      sql += ' AND l.created_at <= ?';
      params.push(`${end_date} 23:59:59`);
    } else if (days) {
      // 使用days参数（向后兼容）
      // 安全验证：确保days是有效的正整数，防止SQL注入
      const daysInt = parseInt(days, 10);
      if (isNaN(daysInt) || daysInt <= 0 || daysInt > 3650) {
        // 限制范围：最多10年，防止异常值
        return res.status(400).json({ 
          success: false, 
          message: 'days参数必须是1-3650之间的整数' 
        });
      }
      // 使用参数化查询更安全，但SQLite的datetime函数不支持参数化
      // 由于daysInt已经验证为整数，这里使用字符串拼接是安全的
      const dateStr = `datetime('now', '-${daysInt} days', 'localtime')`;
      sql += ` AND l.created_at >= ${dateStr}`;
    }

    // 操作类型过滤
    if (action) {
      sql += ' AND l.action = ?';
      params.push(action);
    }

    // 管理员ID过滤
    if (admin_id) {
      sql += ' AND l.admin_id = ?';
      params.push(admin_id);
    }

    // 资源类型过滤
    if (target_type) {
      sql += ' AND l.target_type = ?';
      params.push(target_type);
    }

    // IP地址过滤（支持部分匹配）
    if (ip_address) {
      sql += ' AND l.ip_address LIKE ?';
      params.push(`%${ip_address}%`);
    }

    // 操作者过滤（通过用户名，支持System关键字）
    if (operator) {
      if (operator.toLowerCase() === 'system') {
        sql += ' AND l.action = ?';
        params.push('USER_LOGIN');
      } else {
        sql += ' AND a.username LIKE ?';
        params.push(`%${operator}%`);
      }
    }

    // Details字段模糊匹配
    if (details) {
      sql += ' AND l.details LIKE ?';
      params.push(`%${details}%`);
    }

    sql += ' ORDER BY l.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const logs = await allAsync(sql, params);

    // 获取总数
    let countSql = `
      SELECT COUNT(*) as total 
      FROM logs l 
      LEFT JOIN admins a ON l.admin_id = a.id 
      WHERE 1=1
    `;
    const countParams = [];
    
    // 应用相同的过滤条件（日期范围）
    if (start_date && end_date) {
      countSql += ' AND l.created_at >= ? AND l.created_at <= ?';
      countParams.push(`${start_date} 00:00:00`, `${end_date} 23:59:59`);
    } else if (start_date) {
      countSql += ' AND l.created_at >= ?';
      countParams.push(`${start_date} 00:00:00`);
    } else if (end_date) {
      countSql += ' AND l.created_at <= ?';
      countParams.push(`${end_date} 23:59:59`);
    } else if (days) {
      // 安全验证：确保days是有效的正整数，防止SQL注入
      const daysInt = parseInt(days, 10);
      if (isNaN(daysInt) || daysInt <= 0 || daysInt > 3650) {
        // 限制范围：最多10年，防止异常值
        return res.status(400).json({ 
          success: false, 
          message: 'days参数必须是1-3650之间的整数' 
        });
      }
      // 使用参数化查询更安全，但SQLite的datetime函数不支持参数化
      // 由于daysInt已经验证为整数，这里使用字符串拼接是安全的
      const dateStr = `datetime('now', '-${daysInt} days', 'localtime')`;
      countSql += ` AND l.created_at >= ${dateStr}`;
    }
    if (action) {
      countSql += ' AND l.action = ?';
      countParams.push(action);
    }
    if (admin_id) {
      countSql += ' AND l.admin_id = ?';
      countParams.push(admin_id);
    }
    if (target_type) {
      countSql += ' AND l.target_type = ?';
      countParams.push(target_type);
    }
    if (ip_address) {
      countSql += ' AND l.ip_address LIKE ?';
      countParams.push(`%${ip_address}%`);
    }
    if (operator) {
      if (operator.toLowerCase() === 'system') {
        countSql += ' AND l.action = ?';
        countParams.push('USER_LOGIN');
      } else {
        countSql += ' AND a.username LIKE ?';
        countParams.push(`%${operator}%`);
      }
    }

    // Details字段模糊匹配（计数查询）
    if (details) {
      countSql += ' AND l.details LIKE ?';
      countParams.push(`%${details}%`);
    }

    const { total } = await getAsync(countSql, countParams);

    res.json({ 
      success: true, 
      logs, 
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    logger.error('获取日志失败', { error: error.message });
    res.status(500).json({ success: false, message: '获取日志失败' });
  }
});

// 获取日志过滤器选项（用于下拉菜单）
router.get('/logs/filter-options', async (req, res) => {
  try {
    // 获取所有唯一的操作类型
    const actionTypes = await allAsync(`
      SELECT DISTINCT action 
      FROM logs 
      WHERE action IS NOT NULL AND action != ''
      ORDER BY action
    `);
    
    // 获取所有唯一的资源类型
    const resourceTypes = await allAsync(`
      SELECT DISTINCT target_type 
      FROM logs 
      WHERE target_type IS NOT NULL AND target_type != ''
      ORDER BY target_type
    `);
    
    // 获取所有唯一的操作者（管理员用户名）
    const operators = await allAsync(`
      SELECT DISTINCT a.username 
      FROM logs l
      LEFT JOIN admins a ON l.admin_id = a.id
      WHERE a.username IS NOT NULL AND a.username != ''
      ORDER BY a.username
    `);
    
    res.json({
      success: true,
      options: {
        actions: actionTypes.map(row => row.action),
        resourceTypes: resourceTypes.map(row => row.target_type),
        operators: operators.map(row => row.username)
      }
    });
  } catch (error) {
    logger.error('获取日志过滤器选项失败', { error: error.message });
    res.status(500).json({ success: false, message: '获取过滤器选项失败' });
  }
});

// ==================== 开发者工具 ====================
// 注意：这些接口只有super_admin可以访问

// 获取所有数据库表
router.get('/developer/tables', requireSuperAdmin, async (req, res) => {
  try {
    // 获取所有表名
    const tables = await allAsync(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    );
    
    // 获取每个表的行数
    const tablesWithCount = await Promise.all(
      tables.map(async (table) => {
        try {
          const countResult = await getAsync(`SELECT COUNT(*) as count FROM ${table.name}`);
          return {
            name: table.name,
            rowCount: countResult.count || 0
          };
        } catch (error) {
          return {
            name: table.name,
            rowCount: 0
          };
        }
      })
    );
    
    res.json({ success: true, tables: tablesWithCount });
  } catch (error) {
    logger.error('获取表列表失败', { error: error.message });
    res.status(500).json({ success: false, message: '获取表列表失败' });
  }
});

// 获取表结构
router.get('/developer/table-schema/:tableName', requireSuperAdmin, async (req, res) => {
  try {
    const { tableName } = req.params;
    
    // 验证表名（防止SQL注入）
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
      return res.status(400).json({ success: false, message: 'Invalid table name' });
    }
    
    const schema = await allAsync(`PRAGMA table_info(${tableName})`);
    
    res.json({ success: true, schema });
  } catch (error) {
    logger.error('获取表结构失败', { error: error.message, tableName: req.params.tableName });
    res.status(500).json({ success: false, message: '获取表结构失败' });
  }
});

// 获取表数据
router.get('/developer/table-data/:tableName', requireSuperAdmin, async (req, res) => {
  try {
    const { tableName } = req.params;
    const { limit = 1000, offset = 0 } = req.query;
    
    // 验证表名（防止SQL注入）
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
      return res.status(400).json({ success: false, message: 'Invalid table name' });
    }
    
    const data = await allAsync(
      `SELECT * FROM ${tableName} LIMIT ? OFFSET ?`,
      [parseInt(limit), parseInt(offset)]
    );
    
    res.json({ success: true, data });
  } catch (error) {
    logger.error('获取表数据失败', { error: error.message, tableName: req.params.tableName });
    res.status(500).json({ success: false, message: '获取表数据失败' });
  }
});

// 更新表数据
router.put('/developer/table-data/:tableName', requireSuperAdmin, async (req, res) => {
  try {
    const { tableName } = req.params;
    const { updates, deletes, inserts } = req.body;
    
    // 验证表名（防止SQL注入）
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
      return res.status(400).json({ success: false, message: 'Invalid table name' });
    }
    
    // 获取表结构
    const schema = await allAsync(`PRAGMA table_info(${tableName})`);
    const primaryKey = schema.find(col => col.pk === 1);
    
    if (!primaryKey) {
      return res.status(400).json({ success: false, message: 'Table must have a primary key' });
    }
    
    await beginTransaction();
    
    try {
      // 执行删除
      if (deletes && deletes.length > 0) {
        for (const pkValue of deletes) {
          await runAsync(`DELETE FROM ${tableName} WHERE ${primaryKey.name} = ?`, [pkValue]);
        }
      }
      
      // 执行更新
      if (updates && updates.length > 0) {
        for (const row of updates) {
          const pkValue = row[primaryKey.name];
          if (!pkValue) continue;
          
          const columns = Object.keys(row).filter(key => key !== primaryKey.name);
          const values = columns.map(col => row[col]);
          const setClause = columns.map(col => `${col} = ?`).join(', ');
          
          await runAsync(
            `UPDATE ${tableName} SET ${setClause} WHERE ${primaryKey.name} = ?`,
            [...values, pkValue]
          );
        }
      }
      
      // 执行插入
      if (inserts && inserts.length > 0) {
        for (const row of inserts) {
          const columns = Object.keys(row).filter(key => {
            const col = schema.find(c => c.name === key);
            return col && col.pk !== 1; // 排除主键
          });
          const values = columns.map(col => row[col] || null);
          const columnsStr = columns.join(', ');
          const placeholders = columns.map(() => '?').join(', ');
          
          await runAsync(
            `INSERT INTO ${tableName} (${columnsStr}) VALUES (${placeholders})`,
            values
          );
        }
      }
      
      await commit();
      
      await logAction(req.session.adminId, 'UPDATE', 'developer_table', tableName, {
        updates: updates?.length || 0,
        deletes: deletes?.length || 0,
        inserts: inserts?.length || 0
      }, req);
      
      res.json({ success: true, message: 'Changes saved successfully' });
    } catch (error) {
      await rollback();
      throw error;
    }
  } catch (error) {
    logger.error('更新表数据失败', { error: error.message, tableName: req.params.tableName });
    res.status(500).json({ success: false, message: '更新表数据失败: ' + error.message });
  }
});

// ==================== 文件管理 ====================
// 注意：这些接口只有super_admin可以访问

// 获取项目根目录路径（安全限制：只允许访问项目目录）
function getProjectRoot() {
  const projectRoot = fs.existsSync('/data') ? '/data' : path.join(__dirname, '..');
  return path.resolve(projectRoot);
}

// 验证路径是否在项目目录内（防止路径遍历攻击）
function isPathSafe(filePath, basePath) {
  const resolvedPath = path.resolve(filePath);
  const resolvedBase = path.resolve(basePath);
  return resolvedPath.startsWith(resolvedBase);
}

// 列出目录内容
router.get('/developer/files/list', requireSuperAdmin, async (req, res) => {
  try {
    const { path: dirPath = '' } = req.query;
    const projectRoot = getProjectRoot();
    const fullPath = dirPath ? path.join(projectRoot, dirPath) : projectRoot;
    
    // 验证路径安全性
    if (!isPathSafe(fullPath, projectRoot)) {
      return res.status(403).json({ success: false, message: 'Access denied: Path outside project directory' });
    }
    
    // 检查路径是否存在
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ success: false, message: 'Directory not found' });
    }
    
    // 检查是否为目录
    const stats = fs.statSync(fullPath);
    if (!stats.isDirectory()) {
      return res.status(400).json({ success: false, message: 'Path is not a directory' });
    }
    
    // 读取目录内容
    const items = fs.readdirSync(fullPath).map(item => {
      const itemPath = path.join(fullPath, item);
      const itemStats = fs.statSync(itemPath);
      const relativePath = dirPath ? path.join(dirPath, item) : item;
      
      return {
        name: item,
        path: relativePath,
        isDirectory: itemStats.isDirectory(),
        size: itemStats.isFile() ? itemStats.size : 0,
        modified: itemStats.mtime.toISOString(),
        permissions: itemStats.mode.toString(8).slice(-3)
      };
    });
    
    // 排序：目录在前，然后按名称排序
    items.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) {
        return a.isDirectory ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
    
    res.json({ 
      success: true, 
      path: dirPath || '/',
      items 
    });
  } catch (error) {
    logger.error('列出目录失败', { error: error.message, path: req.query.path });
    res.status(500).json({ success: false, message: 'Failed to list directory: ' + error.message });
  }
});

// 读取文件内容
router.get('/developer/files/read', requireSuperAdmin, async (req, res) => {
  try {
    const { path: filePath } = req.query;
    if (!filePath) {
      return res.status(400).json({ success: false, message: 'File path is required' });
    }
    
    const projectRoot = getProjectRoot();
    const fullPath = path.join(projectRoot, filePath);
    
    // 验证路径安全性
    if (!isPathSafe(fullPath, projectRoot)) {
      return res.status(403).json({ success: false, message: 'Access denied: Path outside project directory' });
    }
    
    // 检查文件是否存在
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ success: false, message: 'File not found' });
    }
    
    // 检查是否为文件
    const stats = fs.statSync(fullPath);
    if (!stats.isFile()) {
      return res.status(400).json({ success: false, message: 'Path is not a file' });
    }
    
    // 检查文件大小（限制为10MB）
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (stats.size > maxSize) {
      return res.status(400).json({ success: false, message: 'File too large (max 10MB)' });
    }
    
    // 读取文件内容
    const content = fs.readFileSync(fullPath, 'utf8');
    
    // 判断文件类型
    const ext = path.extname(filePath).toLowerCase();
    const textExtensions = ['.txt', '.js', '.json', '.md', '.log', '.css', '.html', '.xml', '.yaml', '.yml', '.env', '.sh', '.sql', '.py', '.java', '.cpp', '.c', '.h', '.ts', '.tsx', '.jsx', '.vue', '.php', '.rb', '.go', '.rs', '.swift', '.kt'];
    const isTextFile = textExtensions.includes(ext) || stats.size < 1024 * 1024; // 小于1MB的文件也尝试作为文本
    
    res.json({ 
      success: true, 
      path: filePath,
      content: isTextFile ? content : null,
      isTextFile,
      size: stats.size,
      encoding: isTextFile ? 'utf8' : 'binary',
      modified: stats.mtime.toISOString()
    });
  } catch (error) {
    logger.error('读取文件失败', { error: error.message, path: req.query.path });
    res.status(500).json({ success: false, message: 'Failed to read file: ' + error.message });
  }
});

// 写入文件内容
router.post('/developer/files/write', requireSuperAdmin, async (req, res) => {
  try {
    const { path: filePath, content } = req.body;
    if (!filePath) {
      return res.status(400).json({ success: false, message: 'File path is required' });
    }
    
    const projectRoot = getProjectRoot();
    const fullPath = path.join(projectRoot, filePath);
    
    // 验证路径安全性
    if (!isPathSafe(fullPath, projectRoot)) {
      return res.status(403).json({ success: false, message: 'Access denied: Path outside project directory' });
    }
    
    // 确保目录存在
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // 写入文件
    fs.writeFileSync(fullPath, content || '', 'utf8');
    
    await logAction(req.session.adminId, 'UPDATE', 'file', filePath, JSON.stringify({
      action: '文件编辑',
      path: filePath
    }), req);
    
    res.json({ success: true, message: 'File saved successfully' });
  } catch (error) {
    logger.error('写入文件失败', { error: error.message, path: req.body.path });
    res.status(500).json({ success: false, message: 'Failed to write file: ' + error.message });
  }
});

// 删除文件或目录
router.delete('/developer/files', requireSuperAdmin, async (req, res) => {
  try {
    const { path: filePath } = req.query;
    if (!filePath) {
      return res.status(400).json({ success: false, message: 'File path is required' });
    }
    
    const projectRoot = getProjectRoot();
    const fullPath = path.join(projectRoot, filePath);
    
    // 验证路径安全性
    if (!isPathSafe(fullPath, projectRoot)) {
      return res.status(403).json({ success: false, message: 'Access denied: Path outside project directory' });
    }
    
    // 检查路径是否存在
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ success: false, message: 'File or directory not found' });
    }
    
    // 防止删除关键目录
    const criticalDirs = ['db', 'node_modules', '.git'];
    const pathParts = filePath.split(path.sep);
    if (criticalDirs.some(dir => pathParts.includes(dir))) {
      return res.status(403).json({ success: false, message: 'Cannot delete critical directories' });
    }
    
    // 删除文件或目录
    const stats = fs.statSync(fullPath);
    if (stats.isDirectory()) {
      fs.rmSync(fullPath, { recursive: true, force: true });
    } else {
      fs.unlinkSync(fullPath);
    }
    
    await logAction(req.session.adminId, 'DELETE', 'file', filePath, JSON.stringify({
      action: '删除文件/目录',
      path: filePath,
      isDirectory: stats.isDirectory()
    }), req);
    
    res.json({ success: true, message: 'File or directory deleted successfully' });
  } catch (error) {
    logger.error('删除文件失败', { error: error.message, path: req.query.path });
    res.status(500).json({ success: false, message: 'Failed to delete file: ' + error.message });
  }
});

// 创建目录
router.post('/developer/files/mkdir', requireSuperAdmin, async (req, res) => {
  try {
    const { path: dirPath } = req.body;
    if (!dirPath) {
      return res.status(400).json({ success: false, message: 'Directory path is required' });
    }
    
    const projectRoot = getProjectRoot();
    const fullPath = path.join(projectRoot, dirPath);
    
    // 验证路径安全性
    if (!isPathSafe(fullPath, projectRoot)) {
      return res.status(403).json({ success: false, message: 'Access denied: Path outside project directory' });
    }
    
    // 创建目录
    if (fs.existsSync(fullPath)) {
      return res.status(400).json({ success: false, message: 'Directory already exists' });
    }
    
    fs.mkdirSync(fullPath, { recursive: true });
    
    await logAction(req.session.adminId, 'CREATE', 'file', dirPath, JSON.stringify({
      action: '创建目录',
      path: dirPath
    }), req);
    
    res.json({ success: true, message: 'Directory created successfully' });
  } catch (error) {
    logger.error('创建目录失败', { error: error.message, path: req.body.path });
    res.status(500).json({ success: false, message: 'Failed to create directory: ' + error.message });
  }
});

// 上传文件
const tempDir = path.join(__dirname, '..', 'temp');
// 确保temp目录存在
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}
const fileManagerUpload = multer({
  dest: tempDir,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

router.post('/developer/files/upload', requireSuperAdmin, fileManagerUpload.single('file'), async (req, res) => {
  try {
    const { path: targetPath } = req.body;
    if (!targetPath || !req.file) {
      return res.status(400).json({ success: false, message: 'File path and file are required' });
    }
    
    const projectRoot = getProjectRoot();
    const fullPath = path.join(projectRoot, targetPath);
    
    // 验证路径安全性
    if (!isPathSafe(fullPath, projectRoot)) {
      // 清理临时文件
      if (req.file && req.file.path) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(403).json({ success: false, message: 'Access denied: Path outside project directory' });
    }
    
    // 确保目录存在
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // 移动文件到目标位置
    fs.renameSync(req.file.path, fullPath);
    
    await logAction(req.session.adminId, 'CREATE', 'file', targetPath, JSON.stringify({
      action: '上传文件',
      path: targetPath,
      size: req.file.size
    }), req);
    
    res.json({ success: true, message: 'File uploaded successfully' });
  } catch (error) {
    // 清理临时文件
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    logger.error('上传文件失败', { error: error.message, path: req.body.path });
    res.status(500).json({ success: false, message: 'Failed to upload file: ' + error.message });
  }
});

// 获取文件的MIME类型
function getMimeType(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  const mimeTypes = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
    '.ico': 'image/x-icon',
    '.pdf': 'application/pdf',
    '.zip': 'application/zip',
    '.json': 'application/json',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.html': 'text/html',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.xml': 'application/xml'
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

// 下载文件
router.get('/developer/files/download', requireSuperAdmin, async (req, res) => {
  try {
    const { path: filePath, preview } = req.query;
    if (!filePath) {
      return res.status(400).json({ success: false, message: 'File path is required' });
    }
    
    const projectRoot = getProjectRoot();
    const fullPath = path.join(projectRoot, filePath);
    
    // 验证路径安全性
    if (!isPathSafe(fullPath, projectRoot)) {
      return res.status(403).json({ success: false, message: 'Access denied: Path outside project directory' });
    }
    
    // 检查文件是否存在
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ success: false, message: 'File not found' });
    }
    
    // 检查是否为文件
    const stats = fs.statSync(fullPath);
    if (!stats.isFile()) {
      return res.status(400).json({ success: false, message: 'Path is not a file' });
    }
    
    // 设置Content-Type
    const mimeType = getMimeType(filePath);
    res.setHeader('Content-Type', mimeType);
    
    // 如果是预览模式（用于图片显示），不设置Content-Disposition
    // 否则设置为下载
    if (preview !== 'true') {
      const fileName = path.basename(filePath);
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
    }
    
    // 发送文件
    const fileStream = fs.createReadStream(fullPath);
    fileStream.pipe(res);
  } catch (error) {
    logger.error('下载文件失败', { error: error.message, path: req.query.path });
    res.status(500).json({ success: false, message: 'Failed to download file: ' + error.message });
  }
});

// 执行SQL查询
router.post('/developer/execute-sql', requireSuperAdmin, async (req, res) => {
  try {
    const { sql } = req.body;
    
    if (!sql || typeof sql !== 'string') {
      return res.status(400).json({ success: false, message: 'SQL query is required' });
    }
    
    // 安全检查：只允许SELECT, INSERT, UPDATE, DELETE语句
    const trimmedSql = sql.trim().toUpperCase();
    const allowedKeywords = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'PRAGMA'];
    const firstWord = trimmedSql.split(/\s+/)[0];
    
    if (!allowedKeywords.includes(firstWord)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Only SELECT, INSERT, UPDATE, DELETE, and PRAGMA statements are allowed' 
      });
    }
    
    // 禁止危险操作
    const dangerousKeywords = ['DROP', 'ALTER', 'CREATE', 'TRUNCATE', 'EXEC', 'EXECUTE'];
    for (const keyword of dangerousKeywords) {
      if (trimmedSql.includes(keyword)) {
        return res.status(400).json({ 
          success: false, 
          message: `Dangerous keyword '${keyword}' is not allowed` 
        });
      }
    }
    
    try {
      // 判断是查询还是修改
      if (firstWord === 'SELECT' || firstWord === 'PRAGMA') {
        const result = await allAsync(sql);
        await logAction(req.session.adminId, 'QUERY', 'developer_sql', null, { sql: sql.substring(0, 200) }, req);
        res.json({ success: true, result });
      } else {
        // INSERT, UPDATE, DELETE
        const result = await runAsync(sql);
        await logAction(req.session.adminId, 'EXECUTE', 'developer_sql', null, { sql: sql.substring(0, 200) }, req);
        res.json({ success: true, result: { affectedRows: result.changes || 0 } });
      }
    } catch (sqlError) {
      logger.error('SQL执行失败', { error: sqlError.message, sql: sql.substring(0, 200) });
      res.status(400).json({ success: false, message: 'SQL execution failed: ' + sqlError.message });
    }
  } catch (error) {
    logger.error('执行SQL失败', { error: error.message });
    res.status(500).json({ success: false, message: '执行SQL失败' });
  }
});

/**
 * POST /api/admin/backup/create
 * Create a database backup
 */
router.post('/backup/create', async (req, res) => {
  try {
    const { type = 'db' } = req.body; // 'db' or 'full'
    const result = type === 'full' ? await backupFull() : await backupDatabase();
    
    if (result.success) {
      await logAction(req.session.adminId, 'BACKUP_CREATE', 'system', null, JSON.stringify({
        action: type === 'full' ? '创建完整备份' : '创建数据库备份',
        fileName: result.fileName,
        sizeMB: result.sizeMB,
        type: type
      }), req);
      
      res.json({
        success: true,
        fileName: result.fileName,
        sizeMB: result.sizeMB,
        type: type,
        message: result.message
      });
    } else {
      res.status(500).json({
        success: false,
        message: result.message
      });
    }
  } catch (error) {
    logger.error('创建备份失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to create backup'
    });
  }
});

// ==================== 产品和分类备份/导入 ====================

/**
 * POST /api/admin/menu/backup
 * 备份产品和分类数据（包括图片）
 */
router.post('/menu/backup', async (req, res) => {
  try {
    const { BACKUP_DIR } = require('../utils/backup');
    const exportDir = path.join(DATA_DIR, 'logs', 'export');
    if (!fs.existsSync(exportDir)) {
      fs.mkdirSync(exportDir, { recursive: true });
    }
    
    // 获取所有分类
    const categories = await allAsync('SELECT * FROM categories ORDER BY sort_order, id');
    
    // 获取所有产品
    const products = await allAsync('SELECT * FROM products ORDER BY category_id, sort_order, id');
    
    // 收集所有图片路径
    const imagePaths = new Set();
    products.forEach(product => {
      if (product.image_url) {
        const imagePath = product.image_url.startsWith('/') 
          ? path.join(DATA_DIR, product.image_url.substring(1))
          : path.join(DATA_DIR, product.image_url);
        if (fs.existsSync(imagePath)) {
          imagePaths.add(product.image_url);
        }
      }
    });
    
    // 创建备份数据对象
    // 注意：categories保留id用于导入时的ID映射，products移除id因为会重新生成
    const backupData = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      categories: categories, // 保留id用于导入时的ID映射
      products: products.map(p => {
        // 使用解构和rest操作符，确保所有字段都被备份（除了id和时间戳）
        const { id, created_at, updated_at, ...rest } = p;
        // 确保所有JSON字段都是字符串格式（如果数据库返回的是对象，转换为字符串）
        const productBackup = { ...rest };
        
        // 确保JSON字段以字符串形式保存（即使值为null或空字符串也要保留）
        // sizes
        if (productBackup.sizes !== undefined && productBackup.sizes !== null) {
          productBackup.sizes = typeof productBackup.sizes === 'string' ? productBackup.sizes : JSON.stringify(productBackup.sizes);
        } else {
          productBackup.sizes = '{}';
        }
        // sugar_levels
        if (productBackup.sugar_levels !== undefined && productBackup.sugar_levels !== null) {
          productBackup.sugar_levels = typeof productBackup.sugar_levels === 'string' ? productBackup.sugar_levels : JSON.stringify(productBackup.sugar_levels);
        } else {
          productBackup.sugar_levels = '["0","30","50","70","100"]';
        }
        // available_toppings - 重要：确保正确备份
        if (productBackup.available_toppings !== undefined && productBackup.available_toppings !== null) {
          if (typeof productBackup.available_toppings === 'string') {
            // 已经是字符串，直接保留（包括空字符串）
            productBackup.available_toppings = productBackup.available_toppings;
          } else {
            // 是数组或其他类型，转换为JSON字符串
            productBackup.available_toppings = JSON.stringify(productBackup.available_toppings);
          }
        } else {
          productBackup.available_toppings = '[]';
        }
        // ice_options
        if (productBackup.ice_options !== undefined && productBackup.ice_options !== null) {
          productBackup.ice_options = typeof productBackup.ice_options === 'string' ? productBackup.ice_options : JSON.stringify(productBackup.ice_options);
        } else {
          productBackup.ice_options = '["normal","less","no","room","hot"]';
        }
        
        return productBackup;
      })
    };
    
    // 记录备份数据内容用于调试
    logger.info('创建菜单备份', {
      categoriesCount: categories.length,
      productsCount: products.length,
      categories: categories.map(c => ({ id: c.id, name: c.name, status: c.status })),
      sampleProducts: products.slice(0, 3).map(p => {
        // 检查所有字段是否存在
        const productFields = {
          name: p.name,
          category_id: p.category_id,
          description: p.description,
          price: p.price,
          image_url: p.image_url,
          status: p.status,
          sort_order: p.sort_order,
          sizes: p.sizes,
          sugar_levels: p.sugar_levels,
          available_toppings: p.available_toppings,
          ice_options: p.ice_options
        };
        logger.info('备份产品字段检查', { product: p.name, fields: productFields, allKeys: Object.keys(p) });
        return productFields;
      })
    });
    
    // 生成备份文件名
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const backupFileName = `menu-backup-${timestamp}.zip`;
    const backupPath = path.join(exportDir, backupFileName);
    
    // 创建ZIP文件
    const output = fs.createWriteStream(backupPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    
    return new Promise((resolve, reject) => {
      output.on('close', async () => {
        const stats = fs.statSync(backupPath);
        const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
        
        await logAction(req.session.adminId, 'BACKUP_CREATE', 'menu', null, JSON.stringify({
          action: '备份菜单数据',
          fileName: backupFileName,
          sizeMB: sizeMB,
          categories: categories.length,
          products: products.length,
          images: imagePaths.size
        }), req);
        
        res.json({
          success: true,
          fileName: backupFileName,
          sizeMB: parseFloat(sizeMB),
          categories: categories.length,
          products: products.length,
          images: imagePaths.size,
          message: 'Menu backup created successfully'
        });
        resolve();
      });
      
      archive.on('error', (err) => {
        logger.error('创建菜单备份失败', { error: err.message });
        res.status(500).json({
          success: false,
          message: 'Failed to create menu backup: ' + err.message
        });
        reject(err);
      });
      
      archive.pipe(output);
      
      // 添加JSON数据
      archive.append(JSON.stringify(backupData, null, 2), { name: 'data.json' });
      
      // 添加图片文件
      imagePaths.forEach(imageUrl => {
        const imagePath = imageUrl.startsWith('/') 
          ? path.join(DATA_DIR, imageUrl.substring(1))
          : path.join(DATA_DIR, imageUrl);
        if (fs.existsSync(imagePath)) {
          const fileName = path.basename(imagePath);
          archive.file(imagePath, { name: `images/${fileName}` });
        }
      });
      
      archive.finalize();
    });
  } catch (error) {
    logger.error('创建菜单备份失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to create menu backup: ' + error.message
    });
  }
});

/**
 * POST /api/admin/menu/import
 * 导入产品和分类数据（从ZIP文件）
 */
const menuImportUpload = multer({
  dest: path.join(__dirname, '..', 'temp'),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/zip' || file.originalname.endsWith('.zip')) {
      cb(null, true);
    } else {
      cb(new Error('Only .zip backup files are allowed'));
    }
  }
});

router.post('/menu/import', menuImportUpload.single('backupFile'), async (req, res) => {
  let tempFilePath = null;
  
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Backup file is required'
      });
    }
    
    // 获取导入选项
    const clearExisting = req.body.clearExisting === 'true';
    
    tempFilePath = req.file.path;
    const zip = new AdmZip(tempFilePath);
    const zipEntries = zip.getEntries();
    
    // 查找data.json文件
    let dataEntry = null;
    for (const entry of zipEntries) {
      if (entry.entryName === 'data.json' || entry.entryName.endsWith('/data.json')) {
        dataEntry = entry;
        break;
      }
    }
    
    if (!dataEntry) {
      return res.status(400).json({
        success: false,
        message: 'Invalid backup file: data.json not found'
      });
    }
    
    // 解析备份数据
    const backupData = JSON.parse(dataEntry.getData().toString('utf8'));
    
      // 记录备份文件内容
      const sampleProduct = backupData.products?.[0];
      logger.info('备份文件内容检查', {
        categoriesCount: backupData.categories?.length || 0,
        productsCount: backupData.products?.length || 0,
        categories: backupData.categories?.map(c => ({ id: c.id, name: c.name })) || [],
        hasCategories: !!backupData.categories,
        hasProducts: !!backupData.products,
        sampleProduct: sampleProduct ? {
          name: sampleProduct.name,
          allKeys: Object.keys(sampleProduct),
          sizes: sampleProduct.sizes,
          sugar_levels: sampleProduct.sugar_levels,
          available_toppings: sampleProduct.available_toppings,
          ice_options: sampleProduct.ice_options,
          description: sampleProduct.description,
          price: sampleProduct.price,
          category_id: sampleProduct.category_id,
          image_url: sampleProduct.image_url,
          status: sampleProduct.status,
          sort_order: sampleProduct.sort_order
        } : null
      });
    
    if (!backupData.categories || !backupData.products) {
      return res.status(400).json({
        success: false,
        message: 'Invalid backup file: missing categories or products',
        backupDataKeys: Object.keys(backupData),
        categoriesCount: backupData.categories?.length || 0,
        productsCount: backupData.products?.length || 0
      });
    }
    
    // 如果选择清空现有数据，需要在事务开始前禁用外键约束
    let foreignKeysWasEnabled = true;
    if (clearExisting) {
      // 检查当前外键约束状态
      const fkResult = await getAsync('PRAGMA foreign_keys');
      foreignKeysWasEnabled = fkResult && fkResult.foreign_keys === 1;
      
      // 在事务开始前禁用外键约束（SQLite 要求在事务外设置）
      await runAsync('PRAGMA foreign_keys = OFF');
    }
    
    await beginTransaction();
    
    try {
      // 如果选择清空现有数据，先删除所有产品和分类
      if (clearExisting) {
        // 注意：不删除 order_items，保留历史订单记录
        // 即使产品被删除，order_items 中已保存了 product_name，可以正常显示
        
        // 1. 删除产品（引用categories）
        // 注意：外键约束已在事务开始前禁用
        await runAsync('DELETE FROM products');
        // 2. 删除分类
        await runAsync('DELETE FROM categories');
        
        // 注意：order_items 保留，因为：
        // - 订单是历史记录，不应该被删除
        // - order_items 中已保存了 product_name，即使 product_id 无效也能显示
        // - 外键约束已在事务开始前禁用，所以可以删除 products 而不影响 order_items
      }
      
      // 创建分类ID映射（旧ID -> 新ID）
      const categoryIdMap = new Map();
      
      // 导入分类
      for (const category of backupData.categories) {
        const { id: oldId, created_at, updated_at, ...categoryData } = category;
        
        // 确保oldId的类型一致性：转换为数字（SQLite的ID通常是整数）
        const oldIdAsNumber = oldId != null ? Number(oldId) : null;
        
        // 检查分类是否已存在（按名称）
        const existing = await getAsync('SELECT id FROM categories WHERE name = ?', [categoryData.name]);
        
        if (existing) {
          // 更新现有分类（导入后统一设置为active）
          await runAsync(
            'UPDATE categories SET description = ?, sort_order = ?, status = ?, updated_at = datetime("now", "localtime") WHERE id = ?',
            [categoryData.description || '', categoryData.sort_order || 0, 'active', existing.id]
          );
          // 同时存储数字和字符串键，确保匹配成功
          categoryIdMap.set(oldIdAsNumber, existing.id);
          categoryIdMap.set(String(oldId), existing.id);
          if (oldId != null && oldId !== oldIdAsNumber && oldId !== String(oldId)) {
            categoryIdMap.set(oldId, existing.id);
          }
        } else {
          // 插入新分类（导入后统一设置为active）
          const result = await runAsync(
            'INSERT INTO categories (name, description, sort_order, status) VALUES (?, ?, ?, ?)',
            [categoryData.name, categoryData.description || '', categoryData.sort_order || 0, 'active']
          );
          // runAsync返回 { id: lastID, changes: changes }
          const newCategoryId = result.id;
          if (!newCategoryId) {
            logger.error('分类插入失败，未获取到ID', { categoryName: categoryData.name, result });
            throw new Error(`Failed to insert category: ${categoryData.name}`);
          }
          // 同时存储数字和字符串键，确保匹配成功
          categoryIdMap.set(oldIdAsNumber, newCategoryId);
          categoryIdMap.set(String(oldId), newCategoryId);
          if (oldId != null && oldId !== oldIdAsNumber && oldId !== String(oldId)) {
            categoryIdMap.set(oldId, newCategoryId);
          }
        }
      }
      
      // 验证分类导入结果
      const importedCategories = await allAsync('SELECT id, name, status FROM categories ORDER BY id');
      logger.info('分类导入完成', { 
        importedCount: importedCategories.length,
        categoryIdMapSize: categoryIdMap.size,
        backupCategoriesCount: backupData.categories.length,
        importedCategories: importedCategories,
        categoryIdMap: Array.from(categoryIdMap.entries()).map(([oldId, newId]) => ({ oldId, newId }))
      });
      
      // 导入产品
      const uploadDir = path.join(DATA_DIR, 'uploads/products');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      
      for (const product of backupData.products) {
        // 记录原始产品数据用于调试
        if (backupData.products.indexOf(product) < 3) {
          logger.info('导入产品原始数据', {
            productName: product.name,
            allKeys: Object.keys(product),
            sizes: product.sizes,
            sugar_levels: product.sugar_levels,
            available_toppings: product.available_toppings,
            ice_options: product.ice_options,
            available_toppings_type: typeof product.available_toppings,
            available_toppings_value: product.available_toppings
          });
        }
        
        // 提取字段，保留所有其他字段
        const { created_at, updated_at, category_id: oldCategoryId, image_url, ...productData } = product;
        
        // 映射分类ID（确保类型一致：都转换为数字或字符串）
        let newCategoryId = null;
        if (oldCategoryId != null) {
          // 尝试多种类型匹配：数字、字符串
          const oldIdAsNumber = Number(oldCategoryId);
          const oldIdAsString = String(oldCategoryId);
          
          // 先尝试数字匹配
          newCategoryId = categoryIdMap.get(oldIdAsNumber);
          // 如果数字匹配失败，尝试字符串匹配
          if (newCategoryId === undefined) {
            newCategoryId = categoryIdMap.get(oldIdAsString);
          }
          // 如果都失败，尝试原始值匹配
          if (newCategoryId === undefined) {
            newCategoryId = categoryIdMap.get(oldCategoryId);
          }
          
          if (newCategoryId === undefined) {
            // 如果分类ID映射失败，记录警告但继续导入（产品将没有分类）
            logger.warn('分类ID映射失败', { 
              oldCategoryId,
              oldCategoryIdType: typeof oldCategoryId,
              oldIdAsNumber,
              oldIdAsString,
              productName: productData.name,
              availableCategoryIds: Array.from(categoryIdMap.keys()),
              categoryIdMapSample: Array.from(categoryIdMap.entries()).slice(0, 5)
            });
            newCategoryId = null;
          }
        }
        
        // 处理图片
        let newImageUrl = null;
        if (image_url) {
          const imageFileName = path.basename(image_url);
          const imageEntry = zipEntries.find(e => 
            e.entryName === `images/${imageFileName}` || 
            e.entryName.endsWith(`/images/${imageFileName}`)
          );
          
          if (imageEntry) {
            // 生成新的文件名
            const ext = path.extname(imageFileName);
            const newFileName = `product-${Date.now()}-${uuidv4()}${ext}`;
            const newImagePath = path.join(uploadDir, newFileName);
            
            // 提取并保存图片
            fs.writeFileSync(newImagePath, imageEntry.getData());
            // 压缩导入的图片
            await compressProductImage(newImagePath);
            newImageUrl = `/uploads/products/${newFileName}`;
          }
        }
        
        // 检查产品是否已存在（按名称和分类）
        const existing = await getAsync(
          'SELECT id FROM products WHERE name = ? AND category_id = ?',
          [productData.name, newCategoryId]
        );
        
        // 确保可选参数正确保留（如果备份数据中有值就使用，否则使用默认值）
        // 注意：这些字段在数据库中存储为JSON字符串，需要确保正确保留
        let sizes = '{}';
        if (productData.sizes !== undefined && productData.sizes !== null) {
          // 如果是字符串（包括空字符串），直接使用；如果是对象，转换为JSON字符串
          if (typeof productData.sizes === 'string') {
            sizes = productData.sizes; // 保留原始字符串值
          } else {
            sizes = JSON.stringify(productData.sizes);
          }
        }
        
        let sugarLevels = '["0","30","50","70","100"]';
        if (productData.sugar_levels !== undefined && productData.sugar_levels !== null) {
          if (typeof productData.sugar_levels === 'string') {
            sugarLevels = productData.sugar_levels; // 保留原始字符串值
          } else {
            sugarLevels = JSON.stringify(productData.sugar_levels);
          }
        }
        
        let availableToppings = '[]';
        if (productData.available_toppings !== undefined && productData.available_toppings !== null) {
          // 如果是字符串（包括空字符串），直接使用；如果是数组，转换为JSON字符串
          if (typeof productData.available_toppings === 'string') {
            // 保留原始字符串值，即使是空字符串也要保留
            availableToppings = productData.available_toppings;
          } else if (Array.isArray(productData.available_toppings)) {
            // 如果是数组，转换为JSON字符串
            availableToppings = JSON.stringify(productData.available_toppings);
          } else {
            // 其他类型也尝试转换为JSON字符串
            availableToppings = JSON.stringify(productData.available_toppings);
          }
        }
        
        let iceOptions = '["normal","less","no","room","hot"]';
        if (productData.ice_options !== undefined && productData.ice_options !== null) {
          if (typeof productData.ice_options === 'string') {
            iceOptions = productData.ice_options; // 保留原始字符串值
          } else {
            iceOptions = JSON.stringify(productData.ice_options);
          }
        }
        
        // 记录处理后的值用于调试
        if (backupData.products.indexOf(product) < 3) {
          logger.info('导入产品处理后的值', {
            productName: productData.name,
            sizes,
            sugarLevels,
            availableToppings,
            iceOptions
          });
        }
        
        if (existing) {
          // 更新现有产品（导入后统一设置为active）
          await runAsync(
            `UPDATE products SET 
              description = ?, price = ?, image_url = ?, sort_order = ?, status = ?,
              sizes = ?, sugar_levels = ?, available_toppings = ?, ice_options = ?,
              updated_at = datetime("now", "localtime")
              WHERE id = ?`,
            [
              productData.description || '',
              productData.price,
              newImageUrl || productData.image_url,
              productData.sort_order || 0,
              'active', // 导入后统一设置为active
              sizes,
              sugarLevels,
              availableToppings,
              iceOptions,
              existing.id
            ]
          );
        } else {
          // 插入新产品（导入后统一设置为active）
          await runAsync(
            `INSERT INTO products 
              (name, description, price, category_id, image_url, sort_order, status, sizes, sugar_levels, available_toppings, ice_options)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              productData.name,
              productData.description || '',
              productData.price,
              newCategoryId,
              newImageUrl || productData.image_url,
              productData.sort_order || 0,
              'active', // 导入后统一设置为active
              sizes,
              sugarLevels,
              availableToppings,
              iceOptions
            ]
          );
        }
      }
      
      await commit();
      
      // 如果之前禁用了外键约束，现在重新启用
      if (clearExisting) {
        await runAsync('PRAGMA foreign_keys = ON');
      }
      
      // 清除缓存
      cache.delete('categories');
      cache.delete('products');
      
      // 最终验证
      const finalCategories = await allAsync('SELECT COUNT(*) as count FROM categories');
      const finalProducts = await allAsync('SELECT COUNT(*) as count FROM products');
      const finalCategoriesCount = finalCategories[0]?.count || 0;
      const finalProductsCount = finalProducts[0]?.count || 0;
      
      await logAction(req.session.adminId, 'BACKUP_RESTORE', 'menu', null, JSON.stringify({
        action: '导入菜单数据',
        clearExisting: clearExisting,
        backupCategories: backupData.categories.length,
        backupProducts: backupData.products.length,
        finalCategories: finalCategoriesCount,
        finalProducts: finalProductsCount
      }), req);
      
      res.json({
        success: true,
        message: clearExisting 
          ? 'Menu imported successfully (existing data cleared)' 
          : 'Menu imported successfully (existing data merged)',
        clearExisting: clearExisting,
        backupCategories: backupData.categories.length,
        backupProducts: backupData.products.length,
        finalCategories: finalCategoriesCount,
        finalProducts: finalProductsCount
      });
    } catch (error) {
      await rollback();
      
      // 如果之前禁用了外键约束，现在重新启用（即使发生错误也要恢复）
      if (clearExisting) {
        await runAsync('PRAGMA foreign_keys = ON').catch(() => {
          // 忽略恢复外键约束时的错误，确保继续执行
        });
      }
      
      throw error;
    }
  } catch (error) {
    logger.error('导入菜单失败', { error: error.message });
    
    // 确保外键约束被恢复（即使发生未捕获的错误）
    if (clearExisting) {
      await runAsync('PRAGMA foreign_keys = ON').catch(() => {
        // 忽略恢复外键约束时的错误
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Failed to import menu: ' + error.message
    });
  } finally {
    // 清理临时文件
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
  }
});

/**
 * GET /api/admin/menu/backup/download
 * Download menu backup file
 */
router.get('/menu/backup/download', async (req, res) => {
  try {
    const { fileName } = req.query;
    
    if (!fileName || !fileName.startsWith('menu-backup-') || !fileName.endsWith('.zip')) {
      return res.status(400).json({
        success: false,
        message: 'Invalid backup file name'
      });
    }
    
    const exportDir = path.join(DATA_DIR, 'logs', 'export');
    const backupPath = path.join(exportDir, fileName);
    
    if (!fs.existsSync(backupPath)) {
      return res.status(404).json({
        success: false,
        message: 'Backup file not found'
      });
    }
    
    res.download(backupPath, fileName);
  } catch (error) {
    logger.error('下载菜单备份文件失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to download backup file'
    });
  }
});

/**
 * GET /api/admin/backup/list
 * Get list of backup files
 */
router.get('/backup/list', async (req, res) => {
  try {
    const backups = getBackupList();
    
    res.json({
      success: true,
      backups: backups.map(backup => ({
        fileName: backup.fileName,
        size: backup.size,
        sizeMB: backup.sizeMB,
        created: backup.created.toISOString(),
        type: backup.type || 'db'
      }))
    });
  } catch (error) {
    logger.error('获取备份列表失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to get backup list'
    });
  }
});

/**
 * GET /api/admin/backup/download/:fileName
 * Download a backup file
 */
router.get('/backup/download/:fileName', async (req, res) => {
  try {
    const { fileName } = req.params;
    
    // 支持数据库备份(.db)和完整备份(.zip)
    if (!fileName.startsWith('boda-backup-') && !fileName.startsWith('boda-full-backup-')) {
      return res.status(400).json({
        success: false,
        message: 'Invalid backup file name'
      });
    }
    
    if (!fileName.endsWith('.db') && !fileName.endsWith('.zip')) {
      return res.status(400).json({
        success: false,
        message: 'Invalid backup file extension'
      });
    }
    
    const { BACKUP_DIR } = require('../utils/backup');
    const backupPath = path.join(BACKUP_DIR, fileName);
    
    if (!fs.existsSync(backupPath)) {
      return res.status(404).json({
        success: false,
        message: 'Backup file not found'
      });
    }
    
    res.download(backupPath, fileName);
  } catch (error) {
    logger.error('下载备份文件失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to download backup file'
    });
  }
});

/**
 * POST /api/admin/backup/restore
 * Restore database from backup
 */
router.post('/backup/restore', async (req, res) => {
  try {
    const { fileName } = req.body;
    
    // 支持数据库备份(.db)和完整备份(.zip)
    if (!fileName || 
        (!fileName.startsWith('boda-backup-') && !fileName.startsWith('boda-full-backup-')) ||
        (!fileName.endsWith('.db') && !fileName.endsWith('.zip'))) {
      return res.status(400).json({
        success: false,
        message: 'Invalid backup file name'
      });
    }
    
    const backupType = fileName.endsWith('.zip') ? '完整备份' : '数据库备份';
    await logAction(req.session.adminId, 'BACKUP_RESTORE', 'system', null, JSON.stringify({
      action: `恢复${backupType}`,
      fileName: fileName
    }), req);
    
    const result = await restoreDatabase(fileName);
    
    if (result.success) {
      logger.info('备份恢复成功', { fileName, adminId: req.session.adminId, type: backupType });
      res.json({
        success: true,
        message: result.message
      });
    } else {
      res.status(500).json({
        success: false,
        message: result.message
      });
    }
  } catch (error) {
    logger.error('恢复备份失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to restore backup'
    });
  }
});

/**
 * DELETE /api/admin/backup/delete
 * Delete a backup file
 */
router.delete('/backup/delete', async (req, res) => {
  try {
    const { fileName } = req.body;
    
    // 支持数据库备份(.db)和完整备份(.zip)
    if (!fileName || 
        (!fileName.startsWith('boda-backup-') && !fileName.startsWith('boda-full-backup-')) ||
        (!fileName.endsWith('.db') && !fileName.endsWith('.zip'))) {
      return res.status(400).json({
        success: false,
        message: 'Invalid backup file name'
      });
    }
    
    const result = await deleteBackup(fileName);
    
    if (result.success) {
      res.json({
        success: true,
        message: result.message
      });
    } else {
      res.status(500).json({
        success: false,
        message: result.message
      });
    }
  } catch (error) {
    logger.error('删除备份文件失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to delete backup file'
    });
  }
});

/**
 * POST /api/admin/backup/upload
 * Upload a backup file
 */
const backupUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const { BACKUP_DIR } = require('../utils/backup');
      if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
      }
      cb(null, BACKUP_DIR);
    },
    filename: (req, file, cb) => {
      // 保持原始文件名，但如果是备份文件格式，直接使用；否则添加前缀
      const originalName = file.originalname;
      if ((originalName.startsWith('boda-backup-') || originalName.startsWith('boda-full-backup-')) && 
          (originalName.endsWith('.db') || originalName.endsWith('.zip'))) {
        cb(null, originalName);
      } else {
        // 如果不是标准格式，添加时间戳前缀
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const ext = path.extname(originalName);
        const baseName = path.basename(originalName, ext);
        const prefix = ext === '.zip' ? 'boda-full-backup-' : 'boda-backup-';
        cb(null, `${prefix}${timestamp}-${baseName}${ext}`);
      }
    }
  }),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB（完整备份可能较大）
  fileFilter: (req, file, cb) => {
    // 允许 .db 和 .zip 文件（数据库备份和完整备份）
    if (file.originalname.endsWith('.db') || file.originalname.endsWith('.zip')) {
      cb(null, true);
    } else {
      cb(new Error('Only .db or .zip backup files are allowed'));
    }
  }
});

router.post('/backup/upload', (req, res, next) => {
  // 记录上传请求开始
  logger.info('备份上传请求开始', {
    contentType: req.get('content-type'),
    contentLength: req.get('content-length'),
    method: req.method,
    path: req.path
  });
  next();
}, backupUpload.single('backupFile'), (err, req, res, next) => {
  // Multer错误处理中间件
  if (err) {
    logger.error('Multer上传错误', {
      error: err.message,
      code: err.code,
      field: err.field,
      name: err.name
    });
    
    let errorMessage = 'File upload failed';
    if (err.code === 'LIMIT_FILE_SIZE') {
      errorMessage = 'File size exceeds 500MB limit';
    } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      errorMessage = 'Unexpected file field name. Expected: backupFile';
    } else if (err.message) {
      errorMessage = err.message;
    }
    
    return res.status(400).json({
      success: false,
      message: errorMessage
    });
  }
  next();
}, async (req, res) => {
  try {
    // 记录上传请求信息（用于调试）
    logger.info('备份上传请求处理', {
      hasFile: !!req.file,
      fileSize: req.file?.size,
      fileName: req.file?.originalname,
      filePath: req.file?.path
    });
    
    if (!req.file) {
      logger.warn('备份上传失败：未检测到文件', {
        body: req.body,
        files: req.files
      });
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    const fileName = req.file.filename;
    const filePath = req.file.path;
    const fileSize = req.file.size;
    const sizeMB = (fileSize / 1024 / 1024).toFixed(2);

    // 验证文件格式
    try {
      if (fileName.endsWith('.db')) {
        // 验证 SQLite 数据库文件
        // SQLite 数据库文件的前16字节是文件头，应该以 "SQLite format 3\000" 开头
        const fileBuffer = fs.readFileSync(filePath, { start: 0, end: 15 });
        const header = fileBuffer.toString('utf8');
        
        if (!header.startsWith('SQLite format 3')) {
          // 如果文件头不正确，删除文件并返回错误
          fs.unlinkSync(filePath);
          return res.status(400).json({
            success: false,
            message: 'Invalid SQLite database file: file header does not match SQLite format'
          });
        }
      } else if (fileName.endsWith('.zip')) {
        // 验证 ZIP 文件（完整备份）
        // ZIP 文件的前4字节是文件头，应该是 "PK\03\04" 或 "PK\05\06"（空ZIP）
        const fileBuffer = fs.readFileSync(filePath, { start: 0, end: 3 });
        const header = fileBuffer.toString('binary');
        
        if (!header.startsWith('PK')) {
          // 如果文件头不正确，删除文件并返回错误
          fs.unlinkSync(filePath);
          return res.status(400).json({
            success: false,
            message: 'Invalid ZIP file: file header does not match ZIP format'
          });
        }
      }
    } catch (error) {
      // 如果文件不存在或无法读取，删除文件
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      return res.status(400).json({
        success: false,
        message: 'Failed to validate backup file: ' + error.message
      });
    }

    const backupType = fileName.endsWith('.zip') ? '完整备份' : '数据库备份';
    await logAction(req.session.adminId, 'BACKUP_UPLOAD', 'system', null, JSON.stringify({
      action: `上传${backupType}`,
      fileName: fileName,
      sizeMB: parseFloat(sizeMB),
      type: fileName.endsWith('.zip') ? 'full' : 'db'
    }), req);

    logger.info('备份文件上传成功', { fileName, sizeMB, adminId: req.session.adminId });

    res.json({
      success: true,
      fileName: fileName,
      sizeMB: parseFloat(sizeMB),
      message: `Backup file uploaded successfully: ${fileName} (${sizeMB}MB)`
    });
  } catch (error) {
    logger.error('上传备份文件失败', { 
      error: error.message,
      stack: error.stack,
      code: error.code,
      name: error.name
    });
    
    // 如果上传失败，删除文件
    if (req.file && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkError) {
        logger.warn('删除上传失败的文件时出错', { error: unlinkError.message });
      }
    }
    
    // 检查是否是multer错误（文件大小超限等）
    let errorMessage = 'Failed to upload backup file: ' + error.message;
    if (error.code === 'LIMIT_FILE_SIZE') {
      errorMessage = 'File size exceeds 500MB limit';
    } else if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      errorMessage = 'Unexpected file field name';
    }
    
    res.status(500).json({
      success: false,
      message: errorMessage
    });
  }
});

/**
 * GET /api/admin/cleanup/info
 * Get cleanup information (preview what will be deleted)
 */
router.get('/cleanup/info', async (req, res) => {
  try {
    const { days = 30, cleanPaymentScreenshots = false, cleanLogs = false } = req.query;
    
    const info = await getCleanupInfo({
      days: parseInt(days),
      cleanPaymentScreenshots: cleanPaymentScreenshots === 'true',
      cleanLogs: cleanLogs === 'true'
    });
    
    res.json({
      success: true,
      info
    });
  } catch (error) {
    logger.error('获取清理信息失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to get cleanup info'
    });
  }
});

/**
 * POST /api/admin/cleanup/execute
 * Execute cleanup (delete old files)
 */
router.post('/cleanup/execute', async (req, res) => {
  try {
    const { days = 30, cleanPaymentScreenshots = false, cleanLogs = false } = req.body;
    
    await logAction(req.session.adminId, 'CLEANUP_EXECUTE', 'system', null, JSON.stringify({
      action: '执行文件清理',
      days: parseInt(days),
      cleanPaymentScreenshots: cleanPaymentScreenshots === true,
      cleanLogs: cleanLogs === true
    }), req);
    
    const result = await cleanupOldFiles({
      days: parseInt(days),
      cleanPaymentScreenshots: cleanPaymentScreenshots === true,
      cleanLogs: cleanLogs === true
    });
    
    if (result.success) {
      logger.info('文件清理成功', { 
        deletedFiles: result.deletedFiles, 
        freedSpaceMB: result.freedSpaceMB,
        adminId: req.session.adminId 
      });
      res.json({
        success: true,
        deletedFiles: result.deletedFiles,
        freedSpaceMB: result.freedSpaceMB,
        message: result.message
      });
    } else {
      res.status(500).json({
        success: false,
        message: result.message
      });
    }
  } catch (error) {
    logger.error('执行清理失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to execute cleanup'
    });
  }
});

// ==================== 远程备份功能 ====================

/**
 * GET /api/admin/remote-backup/configs
 * 获取所有推送配置
 */
router.get('/remote-backup/configs', async (req, res) => {
  try {
    const configs = await allAsync('SELECT * FROM remote_backup_configs ORDER BY created_at DESC');
    res.json({
      success: true,
      configs: configs.map(config => ({
        ...config,
        enabled: config.enabled === 1
      }))
    });
  } catch (error) {
    logger.error('获取推送配置失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to get backup configs'
    });
  }
});

/**
 * POST /api/admin/remote-backup/configs
 * 创建推送配置
 */
router.post('/remote-backup/configs', async (req, res) => {
  try {
    const { name, target_url, api_token, schedule_type, schedule_time, schedule_day, enabled } = req.body;

    if (!name || !target_url || !api_token) {
      return res.status(400).json({
        success: false,
        message: 'Name, target_url, and api_token are required'
      });
    }

    // 验证URL格式
    try {
      new URL(target_url);
    } catch (e) {
      return res.status(400).json({
        success: false,
        message: 'Invalid target URL format'
      });
    }

    const result = await runAsync(
      `INSERT INTO remote_backup_configs (name, target_url, api_token, schedule_type, schedule_time, schedule_day, enabled)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [name, target_url, api_token, schedule_type || 'manual', schedule_time || null, schedule_day || null, enabled ? 1 : 0]
    );

    await logAction(req.session.adminId, 'REMOTE_BACKUP_CONFIG_CREATE', 'system', result.id.toString(), JSON.stringify({
      name,
      target_url,
      schedule_type: schedule_type || 'manual'
    }), req);

    res.json({
      success: true,
      id: result.id,
      message: 'Backup config created successfully'
    });
  } catch (error) {
    logger.error('创建推送配置失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to create backup config'
    });
  }
});

/**
 * PUT /api/admin/remote-backup/configs/:id
 * 更新推送配置
 */
router.put('/remote-backup/configs/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, target_url, api_token, schedule_type, schedule_time, schedule_day, enabled } = req.body;

    // 检查配置是否存在
    const existing = await getAsync('SELECT * FROM remote_backup_configs WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Config not found'
      });
    }

    // 如果提供了URL，验证格式
    if (target_url) {
      try {
        new URL(target_url);
      } catch (e) {
        return res.status(400).json({
          success: false,
          message: 'Invalid target URL format'
        });
      }
    }

    await runAsync(
      `UPDATE remote_backup_configs 
       SET name = COALESCE(?, name),
           target_url = COALESCE(?, target_url),
           api_token = COALESCE(?, api_token),
           schedule_type = COALESCE(?, schedule_type),
           schedule_time = ?,
           schedule_day = ?,
           enabled = COALESCE(?, enabled),
           updated_at = datetime('now', 'localtime')
       WHERE id = ?`,
      [name || null, target_url || null, api_token || null, schedule_type || null, schedule_time || null, schedule_day || null, enabled !== undefined ? (enabled ? 1 : 0) : null, id]
    );

    await logAction(req.session.adminId, 'REMOTE_BACKUP_CONFIG_UPDATE', 'system', id, JSON.stringify({
      name,
      target_url,
      schedule_type
    }), req);

    res.json({
      success: true,
      message: 'Backup config updated successfully'
    });
  } catch (error) {
    logger.error('更新推送配置失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to update backup config'
    });
  }
});

/**
 * DELETE /api/admin/remote-backup/configs/:id
 * 删除推送配置
 */
router.delete('/remote-backup/configs/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await getAsync('SELECT * FROM remote_backup_configs WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Config not found'
      });
    }

    await runAsync('DELETE FROM remote_backup_configs WHERE id = ?', [id]);

    await logAction(req.session.adminId, 'REMOTE_BACKUP_CONFIG_DELETE', 'system', id, JSON.stringify({
      name: existing.name
    }), req);

    res.json({
      success: true,
      message: 'Backup config deleted successfully'
    });
  } catch (error) {
    logger.error('删除推送配置失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to delete backup config'
    });
  }
});

/**
 * POST /api/admin/remote-backup/configs/:id/push
 * 手动触发推送
 */
router.post('/remote-backup/configs/:id/push', async (req, res) => {
  try {
    const { id } = req.params;

    const config = await getAsync('SELECT * FROM remote_backup_configs WHERE id = ?', [id]);
    if (!config) {
      return res.status(404).json({
        success: false,
        message: 'Config not found'
      });
    }

    // 异步执行推送（不阻塞响应）
    pushBackupToRemote(config)
      .then(result => {
        logger.info('手动推送完成', { configId: id, success: result.success });
      })
      .catch(error => {
        logger.error('手动推送失败', { configId: id, error: error.message });
      });

    await logAction(req.session.adminId, 'REMOTE_BACKUP_MANUAL_PUSH', 'system', id, JSON.stringify({
      name: config.name,
      target_url: config.target_url
    }), req);

    res.json({
      success: true,
      message: 'Push started, check logs for status'
    });
  } catch (error) {
    logger.error('手动触发推送失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to trigger push'
    });
  }
});

/**
 * GET /api/admin/remote-backup/receive-config
 * 获取接收配置
 */
router.get('/remote-backup/receive-config', async (req, res) => {
  try {
    const config = await getAsync('SELECT * FROM backup_receive_config LIMIT 1');
    if (!config) {
      // 如果没有配置，返回默认值
      return res.json({
        success: true,
        config: {
          api_token: '',
          auto_restore: false
        }
      });
    }

    res.json({
      success: true,
      config: {
        api_token: config.api_token,
        auto_restore: config.auto_restore === 1
      }
    });
  } catch (error) {
    logger.error('获取接收配置失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to get receive config'
    });
  }
});

/**
 * PUT /api/admin/remote-backup/receive-config
 * 更新接收配置
 */
router.put('/remote-backup/receive-config', async (req, res) => {
  try {
    const { api_token, auto_restore } = req.body;

    if (!api_token) {
      return res.status(400).json({
        success: false,
        message: 'API token is required'
      });
    }

    // 检查是否已存在配置
    const existing = await getAsync('SELECT * FROM backup_receive_config LIMIT 1');

    if (existing) {
      // 更新现有配置
      await runAsync(
        `UPDATE backup_receive_config 
         SET api_token = ?, auto_restore = ?, updated_at = datetime('now', 'localtime')`,
        [api_token, auto_restore ? 1 : 0]
      );
    } else {
      // 创建新配置
      await runAsync(
        `INSERT INTO backup_receive_config (api_token, auto_restore)
         VALUES (?, ?)`,
        [api_token, auto_restore ? 1 : 0]
      );
    }

    await logAction(req.session.adminId, 'REMOTE_BACKUP_RECEIVE_CONFIG_UPDATE', 'system', null, JSON.stringify({
      auto_restore: auto_restore ? 1 : 0
    }), req);

    res.json({
      success: true,
      message: 'Receive config updated successfully'
    });
  } catch (error) {
    logger.error('更新接收配置失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to update receive config'
    });
  }
});

/**
 * GET /api/admin/remote-backup/push-logs
 * 获取推送日志列表
 */
router.get('/remote-backup/push-logs', async (req, res) => {
  try {
    const { config_id, limit = 100, offset = 0 } = req.query;
    
    let sql = 'SELECT * FROM backup_push_logs';
    const params = [];

    if (config_id) {
      sql += ' WHERE config_id = ?';
      params.push(config_id);
    }

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const logs = await allAsync(sql, params);

    res.json({
      success: true,
      logs
    });
  } catch (error) {
    logger.error('获取推送日志失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to get push logs'
    });
  }
});

/**
 * GET /api/admin/remote-backup/received
 * 获取接收到的备份列表
 */
router.get('/remote-backup/received', async (req, res) => {
  try {
    const backups = await allAsync(
      'SELECT * FROM backup_received ORDER BY created_at DESC LIMIT 100'
    );

    res.json({
      success: true,
      backups: backups.map(backup => ({
        ...backup,
        sizeMB: backup.file_size ? (backup.file_size / 1024 / 1024).toFixed(2) : '0'
      }))
    });
  } catch (error) {
    logger.error('获取接收备份列表失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to get received backups'
    });
  }
});

/**
 * POST /api/admin/remote-backup/received/:id/restore
 * 手动恢复接收到的备份
 */
router.post('/remote-backup/received/:id/restore', async (req, res) => {
  try {
    const { id } = req.params;

    const backup = await getAsync('SELECT * FROM backup_received WHERE id = ?', [id]);
    if (!backup) {
      return res.status(404).json({
        success: false,
        message: 'Backup not found'
      });
    }

    if (backup.status === 'restored') {
      return res.status(400).json({
        success: false,
        message: 'Backup already restored'
      });
    }

    // 检查文件是否存在
    const receivedDir = getReceivedBackupDir();
    const filePath = path.join(receivedDir, backup.backup_file_name);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: 'Backup file not found'
      });
    }

    // 将文件移动到备份目录以便恢复
    const { BACKUP_DIR } = require('../utils/backup');
    const targetPath = path.join(BACKUP_DIR, backup.backup_file_name);
    fs.renameSync(filePath, targetPath);

    // 执行恢复
    const restoreResult = await restoreDatabase(backup.backup_file_name);

    if (restoreResult.success) {
      await runAsync(
        `UPDATE backup_received 
         SET status = 'restored', restored_at = datetime('now', 'localtime')
         WHERE id = ?`,
        [id]
      );

      await logAction(req.session.adminId, 'REMOTE_BACKUP_RESTORE', 'system', id.toString(), JSON.stringify({
        fileName: backup.backup_file_name,
        sourceUrl: backup.source_url
      }), req);

      res.json({
        success: true,
        message: 'Backup restored successfully'
      });
    } else {
      await runAsync(
        `UPDATE backup_received 
         SET status = 'failed'
         WHERE id = ?`,
        [id]
      );

      res.status(500).json({
        success: false,
        message: restoreResult.message || 'Restore failed'
      });
    }
  } catch (error) {
    logger.error('恢复接收备份失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to restore backup: ' + error.message
    });
  }
});

// ==================== 业务测试用例 API ====================

const { spawn } = require('child_process');

// 测试运行状态
let testRunState = {
  running: false,
  process: null,
  progress: { current: 0, total: 0, currentTest: '' },
  completed: false,
  logs: [], // 存储测试日志（带时间戳）
  selectedSuites: [] // 存储选中的测试套件，用于生成报告
};

// 获取时间戳格式化函数（统一使用）
function getLogTimestamp() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const milliseconds = String(now.getMilliseconds()).padStart(3, '0');
  return `${hours}:${minutes}:${seconds}.${milliseconds}`;
}

// 添加带时间戳的日志（辅助函数）
function addTimestampedLog(message, level = 'INFO') {
  const timestamp = getLogTimestamp();
  if (level === 'ERROR') {
    testRunState.logs.push(`[${timestamp}] [ERROR] ${message}`);
  } else if (level === 'WARN') {
    testRunState.logs.push(`[${timestamp}] [WARN] ${message}`);
  } else {
    testRunState.logs.push(`[${timestamp}] [INFO] ${message}`);
  }
  // 只保留最近1000行日志
  if (testRunState.logs.length > 1000) {
    testRunState.logs = testRunState.logs.slice(-1000);
  }
}

// 获取测试套件列表
router.get('/developer/test-suites', requireSuperAdmin, async (req, res) => {
  try {
    const testDir = path.join(__dirname, '..', 'tests');
    const suites = [];
    
    // 扫描测试文件
    const testFiles = [
      // Routes 测试
      { name: 'routes/admin.test.js', displayName: '管理员接口测试', path: 'tests/routes/admin.test.js' },
      { name: 'routes/auth.test.js', displayName: '认证接口测试', path: 'tests/routes/auth.test.js' },
      { name: 'routes/user.test.js', displayName: '用户接口测试', path: 'tests/routes/user.test.js' },
      { name: 'routes/public.test.js', displayName: '公开接口测试', path: 'tests/routes/public.test.js' },
      // Middleware 测试
      { name: 'middleware/auth.test.js', displayName: '认证中间件测试', path: 'tests/middleware/auth.test.js' },
      { name: 'middleware/monitoring.test.js', displayName: '监控中间件测试', path: 'tests/middleware/monitoring.test.js' },
      { name: 'middleware/validation.test.js', displayName: '验证中间件测试', path: 'tests/middleware/validation.test.js' },
      // Utils 测试
      { name: 'utils/order-helper.test.js', displayName: '订单辅助函数测试', path: 'tests/utils/order-helper.test.js' },
      { name: 'utils/cache.test.js', displayName: '缓存系统测试', path: 'tests/utils/cache.test.js' },
      { name: 'utils/cycle-helper.test.js', displayName: '周期辅助函数测试', path: 'tests/utils/cycle-helper.test.js' },
      { name: 'utils/health-check.test.js', displayName: '健康检查测试', path: 'tests/utils/health-check.test.js' },
      { name: 'utils/logger.test.js', displayName: '日志工具测试', path: 'tests/utils/logger.test.js' },
      // Database 测试
      { name: 'db/database.test.js', displayName: '数据库操作测试', path: 'tests/db/database.test.js' },
      // Integration 测试
      { name: 'integration/order-discount-cycle.test.js', displayName: '订单折扣周期集成测试', path: 'tests/integration/order-discount-cycle.test.js' },
      // Frontend 测试
      { name: 'frontend/ui.test.js', displayName: '前端UI组件测试', path: 'tests/frontend/ui.test.js' },
      { name: 'frontend/api.test.js', displayName: '前端API工具测试', path: 'tests/frontend/api.test.js' },
      { name: 'frontend/validation.test.js', displayName: '前端验证工具测试', path: 'tests/frontend/validation.test.js' },
      { name: 'frontend/error-handler.test.js', displayName: '前端错误处理测试', path: 'tests/frontend/error-handler.test.js' }
    ];
    
    // 统计每个测试文件的测试数量（简化版，实际可以从Jest获取）
    for (const file of testFiles) {
      const filePath = path.join(__dirname, '..', file.path);
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        const testCount = (content.match(/it\(|test\(/g) || []).length;
        suites.push({
          name: file.name,
          displayName: file.displayName,
          path: file.path,
          testCount: testCount
        });
      }
    }
    
    res.json({ success: true, suites });
  } catch (error) {
    logger.error('获取测试套件列表失败', { error: error.message });
    res.status(500).json({ success: false, message: 'Failed to get test suites' });
  }
});

// 运行测试
router.post('/developer/run-tests', requireSuperAdmin, async (req, res) => {
  try {
    if (testRunState.running) {
      return res.status(400).json({ success: false, message: 'Tests are already running' });
    }
    
    const { suites } = req.body;
    if (!suites || !Array.isArray(suites) || suites.length === 0) {
      return res.status(400).json({ success: false, message: 'Test suites are required' });
    }
    
    // 构建Jest命令
    const projectRoot = path.join(__dirname, '..');
    
    // 构建测试路径参数 - 使用testPathPattern匹配测试文件
    const testPatterns = suites.map(suite => {
      // 将 routes/admin.test.js 转换为 routes/admin 或 admin
      // 保持路径结构，例如：routes/admin.test.js -> routes/admin
      const pattern = suite.replace(/^tests\//, '').replace(/\.test\.js$/, '');
      return pattern;
    });
    
    // 使用jest直接运行，而不是npm test，以便更好地控制参数
    // 注意：--json会抑制大部分输出，所以我们不使用它，改用--verbose来获取实时输出
    // 测试完成后，我们会单独运行一次来生成JSON报告
    const jestArgs = [
      '--coverage',
      // 不使用--json，因为它会抑制实时输出
      // '--json',
      // '--outputFile=reports/test-results.json',
      '--forceExit', // 确保Jest在测试完成后退出
      '--verbose', // 启用详细输出，确保所有日志都被实时输出
      '--no-cache', // 禁用缓存，确保每次都是全新运行
      '--colors=false' // 禁用颜色输出，避免ANSI码干扰日志解析
    ];
    
    // 如果包含前端测试，需要移除默认配置中的testPathIgnorePatterns限制
    // 通过使用自定义配置或覆盖选项来实现
    const hasFrontendTests = suites.some(s => s.includes('frontend/'));
    if (hasFrontendTests) {
      // 使用前端配置运行所有测试（前端配置应该也能运行后端测试）
      // 或者分别运行，但为了简化，我们先尝试使用前端配置
      // 注意：前端配置使用jsdom环境，可能不适合后端测试
      // 更好的方法是修改默认配置，移除对前端测试的排除
      // 这里我们暂时注释掉，需要修改jest.config.js
    }
    
    // 构建Jest命令 - 使用单个testPathPattern，用正则表达式匹配多个文件
    // 格式: (pattern1|pattern2|pattern3)
    if (testPatterns.length > 0) {
      const combinedPattern = '(' + testPatterns.join('|') + ')';
      jestArgs.push('--testPathPattern', combinedPattern);
    }
    
    // 启动测试进程
    testRunState.running = true;
    testRunState.completed = false;
    testRunState.logs = []; // 清空之前的日志
    testRunState.selectedSuites = suites; // 保存选中的测试套件，用于生成报告
    testRunState.progress = { 
      current: 0, 
      total: 0, 
      currentTest: 'Starting tests...',
      currentSuite: ''
    };
    
    // 添加启动日志
    testRunState.logs.push(`[INFO] 开始运行测试套件: ${suites.join(', ')}`);
    // 构建显示用的命令字符串（用于日志）
    const commandStr = 'npx jest ' + jestArgs.map(arg => {
      // 如果参数包含空格或特殊字符，用引号包裹
      if (arg.includes(' ') || arg.includes('(') || arg.includes(')') || arg.includes('|')) {
        return `"${arg}"`;
      }
      return arg;
    }).join(' ');
    addTimestampedLog(`Jest命令: ${commandStr}`);
    
    logger.info('启动测试', { 
      suites, 
      patterns: testPatterns, 
      combinedPattern: testPatterns.length > 0 ? '(' + testPatterns.join('|') + ')' : 'all',
      args: jestArgs 
    });
    
    // 不使用shell: true，直接传递参数数组，避免shell解析特殊字符
    // 设置环境变量确保Jest实时输出（不缓冲）
    const jestProcess = spawn('npx', ['jest', ...jestArgs], {
      cwd: projectRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        FORCE_COLOR: '0', // 禁用颜色输出，避免ANSI码干扰
        CI: 'true' // 设置为CI模式，确保实时输出
      }
    });
    
    testRunState.process = jestProcess;
    
    let stdout = '';
    let stderr = '';
    
    // 解析Jest输出以获取进度
    let totalTests = 0;
    let completedTests = 0;
    let currentTestName = '';
    let lastProgressUpdate = Date.now();
    
    jestProcess.stdout.on('data', (data) => {
      const output = data.toString();
      stdout += output;
      
      // 存储日志（限制日志数量，避免内存溢出）
      // 在服务器端添加时间戳，确保每条日志都有准确的时间
      // 注意：保留所有非空行，包括格式化的输出
      const lines = output.split('\n');
      lines.forEach(line => {
        const trimmed = line.trim();
        // 保留所有有内容的行（包括只有空格的行，可能是格式化的输出）
        if (trimmed || line.length > 0) {
          const timestamp = getLogTimestamp();
          // 如果日志已经包含 [INFO] 或 [ERROR] 等前缀，在时间戳后添加
          if (trimmed.startsWith('[')) {
            testRunState.logs.push(`[${timestamp}] ${trimmed}`);
          } else if (trimmed) {
            testRunState.logs.push(`[${timestamp}] ${trimmed}`);
          } else {
            // 空行也记录，但使用时间戳
            testRunState.logs.push(`[${timestamp}]`);
          }
        }
      });
      
      // 只保留最近1000行日志
      if (testRunState.logs.length > 1000) {
        testRunState.logs = testRunState.logs.slice(-1000);
      }
      
      // 从文本输出中解析进度（Jest的--json输出在最后，我们需要从文本中解析）
      // Jest文本输出示例：
      // PASS tests/routes/admin.test.js
      //   Admin Routes
      //     ✓ should get all categories (123 ms)
      // 注意：lines已经在上面定义过了，直接使用
      for (const line of lines) {
        const trimmed = line.trim();
        
        // 检测测试用例完成（以✓或✗开头）
        if (trimmed.match(/^[✓✗○]\s+/)) {
          completedTests++;
          // 提取测试名称
          const match = trimmed.match(/^[✓✗○]\s+(.+?)\s*\(/);
          if (match) {
            currentTestName = match[1];
          }
          // 立即更新进度（不等待300ms）
          // 只有在知道总数或已完成测试数大于0时才更新，避免初始状态显示100%
          if (totalTests > 0 || completedTests > 0) {
            testRunState.progress = {
              current: completedTests,
              total: totalTests || Math.max(completedTests * 3, 50), // 更保守的估算
              currentTest: currentTestName || 'Running tests...',
              currentSuite: testRunState.progress.currentSuite || ''
            };
          }
        }
        
        // 检测测试套件名称（PASS/FAIL后面的文件路径）
        const suiteMatch = trimmed.match(/^(PASS|FAIL)\s+(.+?\.test\.js)/);
        if (suiteMatch) {
          // 提取测试套件名称（去掉路径，只保留文件名）
          const suitePath = suiteMatch[2];
          const suiteName = suitePath.split('/').pop().replace('.test.js', '');
          testRunState.progress.currentSuite = suiteName;
        }
        
        // 检测最终统计（Test Suites: X passed, Y total）
        const suiteStatsMatch = trimmed.match(/Test Suites:\s+(\d+)\s+(passed|failed)/);
        if (suiteStatsMatch) {
          // 可以用于验证
        }
        
        // 检测测试总数（Tests: X passed, Y total）
        // 匹配格式: "Tests:       124 passed, 124 total"
        const testMatch = trimmed.match(/Tests:\s+(\d+)\s+(passed|failed|skipped).*?(\d+)\s+total/i);
        if (testMatch) {
          const newTotalTests = parseInt(testMatch[3]) || totalTests;
          if (newTotalTests > totalTests) {
            totalTests = newTotalTests;
            // 立即更新进度
            testRunState.progress = {
              current: completedTests,
              total: totalTests,
              currentTest: currentTestName || 'Running tests...',
              currentSuite: testRunState.progress.currentSuite || ''
            };
          }
        }
        
        // 也尝试从JSON输出中解析（如果Jest输出了JSON行）
        try {
          const jsonMatch = trimmed.match(/\{"numTotalTests":(\d+)/);
          if (jsonMatch) {
            totalTests = parseInt(jsonMatch[1]);
            // 立即更新进度
            testRunState.progress = {
              current: completedTests,
              total: totalTests,
              currentTest: currentTestName || 'Running tests...',
              currentSuite: testRunState.progress.currentSuite || ''
            };
          }
        } catch (e) {
          // 忽略JSON解析错误
        }
      }
      
      // 定期更新进度（即使没有新测试完成，也更新当前状态）
      const now = Date.now();
      if (now - lastProgressUpdate > 200 || completedTests === 0) { // 每200ms更新一次，或首次更新
        // 如果检测到测试套件完成，可以估算总数
        if (completedTests > 0 && totalTests === 0) {
          // 估算：已完成测试数 * 3（更保守的估计，避免过早显示高百分比）
          totalTests = Math.max(completedTests * 3, 50);
        }
        
        // 只有在有实际进度时才更新
        if (completedTests > 0 || totalTests > 0) {
          testRunState.progress = {
            current: completedTests,
            total: totalTests || Math.max(completedTests * 3, 50), // 更保守的估算
            currentTest: currentTestName || 'Running tests...',
            currentSuite: testRunState.progress.currentSuite || ''
          };
        }
        lastProgressUpdate = now;
      }
    });
    
    jestProcess.stderr.on('data', (data) => {
      const errorOutput = data.toString();
      stderr += errorOutput;
      
      // 存储错误日志，在服务器端添加时间戳
      const errorLines = errorOutput.split('\n').filter(line => line.trim());
      errorLines.forEach(line => {
        if (line) {
          const timestamp = getLogTimestamp();
          testRunState.logs.push(`[${timestamp}] [ERROR] ${line}`);
        }
      });
      // 只保留最近1000行日志
      if (testRunState.logs.length > 1000) {
        testRunState.logs = testRunState.logs.slice(-1000);
      }
    });
    
    jestProcess.on('close', async (code) => {
      testRunState.running = false;
      testRunState.process = null;
      
      // 尝试从JSON输出文件中读取准确的测试总数
      let finalTotalTests = totalTests;
      let finalCompletedTests = completedTests;
      
      try {
        const testResultsPath = path.join(projectRoot, 'reports', 'test-results.json');
        if (fs.existsSync(testResultsPath)) {
          const testResults = JSON.parse(fs.readFileSync(testResultsPath, 'utf8'));
          if (testResults && testResults.numTotalTests) {
            finalTotalTests = testResults.numTotalTests;
            finalCompletedTests = testResults.numPassedTests + testResults.numFailedTests + (testResults.numPendingTests || 0);
            addTimestampedLog(`从JSON文件读取: 总测试数=${finalTotalTests}, 已完成=${finalCompletedTests}`);
          }
        }
      } catch (e) {
        addTimestampedLog(`无法读取测试结果JSON: ${e.message}`, 'WARN');
      }
      
      // 只有在有实际测试运行时才标记为完成
      // 如果没有任何测试运行（totalTests和completedTests都为0），说明测试可能没有启动或立即失败
      const hasTestsRun = finalTotalTests > 0 || finalCompletedTests > 0;
      
      if (hasTestsRun) {
        testRunState.completed = true;
        // 最终更新进度
        testRunState.progress = {
          current: finalCompletedTests,
          total: finalTotalTests,
          currentTest: code === 0 ? 'All tests completed' : 'Tests completed with errors',
          currentSuite: testRunState.progress.currentSuite || ''
        };
      } else {
        // 测试可能没有运行，不标记为完成，保持运行状态以便用户看到错误
        testRunState.completed = false;
        testRunState.progress = {
          current: 0,
          total: 0,
          currentTest: code === 0 ? 'Tests completed (no tests found)' : 'Tests failed to run',
          currentSuite: testRunState.progress.currentSuite || ''
        };
      }
      
      // 添加完成日志
      addTimestampedLog(`测试完成，退出代码: ${code}`);
      addTimestampedLog(`总测试数: ${finalTotalTests}, 已完成: ${finalCompletedTests}`);
      
      // 只有在测试真正完成时才生成报告
      if (hasTestsRun) {
        // 生成测试报告
        try {
          addTimestampedLog('正在生成测试报告...');
          const { execSync } = require('child_process');
          
          // 先运行一次Jest来生成JSON结果文件（使用相同的测试模式）
          // 注意：由于suites在外层作用域，我们需要从req.body中获取
          const reportJestArgs = [
            '--coverage',
            '--json',
            '--outputFile=reports/test-results.json',
            '--forceExit'
          ];
          
          // 使用保存的测试套件信息（从testRunState中获取）
          const reportSuites = testRunState.selectedSuites || [];
          if (reportSuites.length > 0) {
            const reportPatterns = reportSuites.map(suite => {
              const pattern = suite.replace(/^tests\//, '').replace(/\.test\.js$/, '');
              return pattern;
            });
            if (reportPatterns.length > 0) {
              const combinedPattern = '(' + reportPatterns.join('|') + ')';
              reportJestArgs.push('--testPathPattern', combinedPattern);
            }
          }
          
          // 静默运行，只生成JSON文件
          // 使用 spawn 而不是 execSync，避免 shell 解析特殊字符的问题
          const { spawnSync } = require('child_process');
          const reportResult = spawnSync('npx', ['jest', ...reportJestArgs], {
            cwd: projectRoot,
            stdio: 'pipe', // 捕获输出以便记录错误
            env: {
              ...process.env,
              FORCE_COLOR: '0',
              CI: 'true'
            },
            encoding: 'utf8'
          });
          
          if (reportResult.error) {
            throw new Error(`生成JSON报告失败: ${reportResult.error.message}`);
          }
          
          if (reportResult.status !== 0) {
            const errorOutput = reportResult.stderr || reportResult.stdout || 'Unknown error';
            throw new Error(`生成JSON报告失败 (退出代码: ${reportResult.status}): ${errorOutput.toString().substring(0, 500)}`);
          }
          
          addTimestampedLog('JSON测试结果文件生成成功');
          
          // 然后生成HTML报告
          const reportGenResult = spawnSync('node', ['scripts/generate-test-report.js'], {
            cwd: projectRoot,
            stdio: 'pipe',
            encoding: 'utf8'
          });
          
          if (reportGenResult.error) {
            throw new Error(`生成HTML报告失败: ${reportGenResult.error.message}`);
          }
          
          if (reportGenResult.status !== 0) {
            const errorOutput = reportGenResult.stderr || reportGenResult.stdout || 'Unknown error';
            throw new Error(`生成HTML报告失败 (退出代码: ${reportGenResult.status}): ${errorOutput.toString().substring(0, 500)}`);
          }
          
          addTimestampedLog('测试报告生成成功');
          logger.info('测试报告生成成功', { code, totalTests: finalTotalTests, completedTests: finalCompletedTests });
        } catch (e) {
          addTimestampedLog(`生成测试报告失败: ${e.message}`, 'ERROR');
          logger.error('生成测试报告失败', { error: e.message });
        }
      }
    });
    
    jestProcess.on('error', (error) => {
      logger.error('测试进程启动失败', { error: error.message, stack: error.stack });
      testRunState.running = false;
      testRunState.completed = true;
      testRunState.process = null;
      testRunState.logs = testRunState.logs || [];
      testRunState.logs.push(`[ERROR] 测试进程启动失败: ${error.message}`);
    });
    
    res.json({ success: true, message: 'Tests started' });
  } catch (error) {
    logger.error('运行测试失败', { error: error.message, stack: error.stack });
    testRunState.running = false;
    testRunState.completed = false;
    testRunState.logs = testRunState.logs || [];
    addTimestampedLog(`启动测试失败: ${error.message}`, 'ERROR');
    res.status(500).json({ 
      success: false, 
      message: 'Failed to run tests',
      error: error.message 
    });
  }
});

// 获取测试进度
router.get('/developer/test-progress', requireSuperAdmin, async (req, res) => {
  try {
    res.json({
      success: true,
      running: testRunState.running,
      completed: testRunState.completed,
      progress: testRunState.progress,
      logs: testRunState.logs || [] // 返回测试日志
    });
  } catch (error) {
    logger.error('获取测试进度失败', { error: error.message });
    res.status(500).json({ success: false, message: 'Failed to get test progress' });
  }
});

// 停止测试
router.post('/developer/stop-tests', requireSuperAdmin, async (req, res) => {
  try {
    if (testRunState.running && testRunState.process) {
      testRunState.process.kill();
      testRunState.running = false;
      testRunState.process = null;
      res.json({ success: true, message: 'Tests stopped' });
    } else {
      res.json({ success: false, message: 'No tests running' });
    }
  } catch (error) {
    logger.error('停止测试失败', { error: error.message });
    res.status(500).json({ success: false, message: 'Failed to stop tests' });
  }
});

// 获取测试报告
router.get('/developer/test-report', requireSuperAdmin, async (req, res) => {
  try {
    const reportPath = path.join(__dirname, '..', 'reports', 'test-report.html');
    
    if (!fs.existsSync(reportPath)) {
      // 返回一个简单的占位页面，而不是404
      const placeholder = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>Test Report - Not Ready</title>
          <style>
            body { 
              font-family: Arial, sans-serif; 
              display: flex; 
              align-items: center; 
              justify-content: center; 
              height: 100vh; 
              margin: 0;
              background: #f5f5f5;
            }
            .container {
              text-align: center;
              padding: 40px;
              background: white;
              border-radius: 8px;
              box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            }
            .spinner {
              border: 4px solid #f3f3f3;
              border-top: 4px solid #3498db;
              border-radius: 50%;
              width: 40px;
              height: 40px;
              animation: spin 1s linear infinite;
              margin: 0 auto 20px;
            }
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="spinner"></div>
            <h2>Test Report Not Ready</h2>
            <p>The test report is still being generated. Please wait...</p>
          </div>
        </body>
        </html>
      `;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(placeholder);
    }
    
    const html = fs.readFileSync(reportPath, 'utf8');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.send(html);
  } catch (error) {
    logger.error('获取测试报告失败', { error: error.message });
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Error</title>
        <style>
          body { 
            font-family: Arial, sans-serif; 
            display: flex; 
            align-items: center; 
            justify-content: center; 
            height: 100vh; 
            margin: 0;
            background: #f5f5f5;
          }
          .container {
            text-align: center;
            padding: 40px;
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            color: #e74c3c;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>Error Loading Test Report</h2>
          <p>${error.message}</p>
        </div>
      </body>
      </html>
    `);
  }
});

// ==================== 展示图片管理 ====================

// 配置展示图片上传
const showcaseStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    // 优先使用 DATA_DIR/show（持久化），如果不存在则回退到项目根目录（兼容性）
    const SHOW_DIR = path.join(DATA_DIR, 'show');
    const FALLBACK_SHOW_DIR = path.join(__dirname, '../show');
    const showDir = fs.existsSync(SHOW_DIR) ? SHOW_DIR : FALLBACK_SHOW_DIR;
    
    if (!fs.existsSync(showDir)) {
      fs.mkdirSync(showDir, { recursive: true });
    }
    cb(null, showDir);
  },
  filename: (req, file, cb) => {
    // 保持原始文件名，但添加时间戳前缀避免冲突
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, ext);
    // 清理文件名，只保留字母、数字、连字符和下划线
    const cleanBaseName = baseName.replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `${timestamp}-${cleanBaseName}${ext}`);
  }
});

const showcaseUpload = multer({
  storage: showcaseStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error('Only image formats are supported'));
    }
  }
});

// 配置自定义API图片上传
const customApiImageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(DATA_DIR, 'uploads/custom-api-images');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const ext = path.extname(file.originalname).toLowerCase();
    // 生成随机字符串确保唯一性（8位）
    const randomStr = Math.random().toString(36).substring(2, 10);
    // 只使用时间戳和随机字符串，保持文件名简洁
    cb(null, `${timestamp}-${randomStr}${ext}`);
  }
});

const customApiImageUpload = multer({
  storage: customApiImageStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error('Only image formats are supported'));
    }
  }
});

// 配置自定义API视频上传
const customApiVideoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(DATA_DIR, 'uploads/custom-api-videos');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const ext = path.extname(file.originalname).toLowerCase();
    // 生成随机字符串确保唯一性（8位）
    const randomStr = Math.random().toString(36).substring(2, 10);
    // 只使用时间戳和随机字符串，保持文件名简洁
    cb(null, `${timestamp}-${randomStr}${ext}`);
  }
});

const customApiVideoUpload = multer({
  storage: customApiVideoStorage,
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /mp4|webm|ogg|mov|avi|wmv|flv|mkv/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = /^video\//.test(file.mimetype);
    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error('Only video formats are supported (mp4, webm, ogg, mov, avi, wmv, flv, mkv)'));
    }
  }
});

// 视频上传任务状态存储（用于进度跟踪）
const videoUploadTasks = new Map();

// 清理过期的任务（超过1小时）
setInterval(() => {
  const now = Date.now();
  for (const [taskId, task] of videoUploadTasks.entries()) {
    if (now - task.createdAt > 60 * 60 * 1000) { // 1小时
      videoUploadTasks.delete(taskId);
    }
  }
}, 10 * 60 * 1000); // 每10分钟清理一次

/**
 * GET /api/admin/showcase-images
 * Get list of showcase images
 */
router.get('/showcase-images', async (req, res) => {
  try {
    // 优先使用 DATA_DIR/show（持久化），如果不存在则回退到项目根目录（兼容性）
    const SHOW_DIR = path.join(DATA_DIR, 'show');
    const FALLBACK_SHOW_DIR = path.join(__dirname, '../show');
    const showDir = fs.existsSync(SHOW_DIR) ? SHOW_DIR : FALLBACK_SHOW_DIR;
    
    // 检查目录是否存在
    if (!fs.existsSync(showDir)) {
      return res.json({ success: true, images: [] });
    }
    
    const files = fs.readdirSync(showDir);
    const images = files
      .filter(file => /\.(jpg|jpeg|png|gif|webp)$/i.test(file))
      .map(file => ({
        filename: file,
        url: `/show/${file}`
      }))
      .sort(); // 按文件名排序
    
    res.json({ success: true, images });
  } catch (error) {
    logger.error('获取展示图片列表失败', { error: error.message });
    res.status(500).json({ success: false, message: 'Failed to get showcase images' });
  }
});

/**
 * POST /api/admin/showcase-images
 * Upload a new showcase image
 */
router.post('/showcase-images', showcaseUpload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No image file provided' });
    }
    
    const filename = req.file.filename;
    const url = `/show/${filename}`;
    
    await logAction(req.session.adminId, 'CREATE', 'showcase_image', null, JSON.stringify({
      filename: filename,
      url: url
    }), req);
    
    res.json({ 
      success: true, 
      message: 'Image uploaded successfully',
      image: {
        filename: filename,
        url: url
      }
    });
  } catch (error) {
    logger.error('上传展示图片失败', { error: error.message });
    res.status(500).json({ success: false, message: 'Failed to upload image: ' + error.message });
  }
});

/**
 * DELETE /api/admin/showcase-images/:filename
 * Delete a showcase image
 */
router.delete('/showcase-images/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    
    // 验证文件名（防止路径遍历攻击）
    if (!/^[a-zA-Z0-9._-]+$/.test(filename)) {
      return res.status(400).json({ success: false, message: 'Invalid filename' });
    }
    
    // 优先使用 DATA_DIR/show（持久化），如果不存在则回退到项目根目录（兼容性）
    const SHOW_DIR = path.join(DATA_DIR, 'show');
    const FALLBACK_SHOW_DIR = path.join(__dirname, '../show');
    const showDir = fs.existsSync(SHOW_DIR) ? SHOW_DIR : FALLBACK_SHOW_DIR;
    const filePath = path.join(showDir, filename);
    
    // 验证文件路径安全性（防止路径遍历）
    const resolvedPath = path.resolve(filePath);
    const resolvedShowDir = path.resolve(showDir);
    if (!resolvedPath.startsWith(resolvedShowDir)) {
      return res.status(400).json({ success: false, message: 'Invalid file path' });
    }
    
    // 检查文件是否存在
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'Image not found' });
    }
    
    // 删除文件
    fs.unlinkSync(filePath);
    
    await logAction(req.session.adminId, 'DELETE', 'showcase_image', null, JSON.stringify({
      filename: filename
    }), req);
    
    res.json({ success: true, message: 'Image deleted successfully' });
  } catch (error) {
    logger.error('删除展示图片失败', { error: error.message });
    res.status(500).json({ success: false, message: 'Failed to delete image: ' + error.message });
  }
});

// ==================== 自定义API管理 ====================

/**
 * GET /api/admin/custom-apis
 * 获取所有API列表（包括系统API和自定义API）
 */
router.get('/custom-apis', requireAuth, async (req, res) => {
  try {
    // 获取所有自定义API（性能优化：不查询response_content字段，列表页面不需要）
    const customApis = await allAsync(`
      SELECT id, name, path, method, requires_token, description, status, created_at, updated_at
      FROM custom_apis
      ORDER BY created_at DESC
    `);

    // 获取所有系统API路由信息
    const systemApis = [];
    
    // 从路由文件中提取API信息
    const routes = [
      { path: '/api/auth/login', method: 'POST', requires_token: false, description: '管理员登录' },
      { path: '/api/auth/logout', method: 'POST', requires_token: true, description: '管理员登出' },
      { path: '/api/admin/dashboard', method: 'GET', requires_token: true, description: '获取仪表盘数据' },
      { path: '/api/admin/orders', method: 'GET', requires_token: true, description: '获取订单列表' },
      { path: '/api/admin/products', method: 'GET', requires_token: true, description: '获取产品列表' },
      { path: '/api/admin/categories', method: 'GET', requires_token: true, description: '获取分类列表' },
      { path: '/api/admin/users', method: 'GET', requires_token: true, description: '获取用户列表' },
      { path: '/api/public/menu', method: 'GET', requires_token: false, description: '获取公开菜单' },
      { path: '/api/public/settings', method: 'GET', requires_token: false, description: '获取公开设置' },
      { path: '/api/user/profile', method: 'GET', requires_token: true, description: '获取用户资料' },
      { path: '/api/user/orders', method: 'GET', requires_token: true, description: '获取用户订单' },
    ];

    // 遍历所有注册的路由（从app._router中获取）
    // 注意：这需要访问Express的内部路由结构，可能不可靠
    // 所以我们使用预定义的列表

    res.json({
      success: true,
      data: {
        systemApis: routes.map(route => ({
          ...route,
          type: 'system',
          id: `system-${route.path}-${route.method}`
        })),
        customApis: customApis.map(api => ({
          ...api,
          type: 'custom',
          requires_token: api.requires_token === 1
        }))
      }
    });
  } catch (error) {
    logger.error('获取API列表失败', { error: error.message });
    res.status(500).json({ success: false, message: 'Failed to get API list: ' + error.message });
  }
});

/**
 * POST /api/admin/custom-apis
 * 创建自定义API
 */
router.post('/custom-apis', requireAuth, [
  body('name').notEmpty().withMessage('API名称不能为空'),
  body('path').notEmpty().withMessage('API路径不能为空'),
  body('method').isIn(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']).withMessage('请求方法无效'),
  body('response_content').notEmpty().withMessage('返回内容不能为空'),
  validate
], async (req, res) => {
  try {
    const { name, path, method, requires_token, response_content, description, status } = req.body;

    // 验证路径格式
    if (!path.startsWith('/')) {
      return res.status(400).json({ success: false, message: '路径必须以 / 开头' });
    }

    // 检查路径是否已存在
    const existing = await getAsync('SELECT id FROM custom_apis WHERE path = ?', [path]);
    if (existing) {
      return res.status(400).json({ success: false, message: '该路径已存在' });
    }

    // 验证返回内容是否为有效的JSON
    try {
      JSON.parse(response_content);
    } catch (e) {
      return res.status(400).json({ success: false, message: '返回内容必须是有效的JSON格式' });
    }

    // 插入数据库
    const result = await runAsync(`
      INSERT INTO custom_apis (name, path, method, requires_token, response_content, description, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      name,
      path,
      method || 'GET',
      requires_token ? 1 : 0,
      response_content,
      description || null,
      status || 'active'
    ]);

    await logAction(req.session.adminId, 'CREATE', 'custom_api', result.id.toString(), JSON.stringify({
      name,
      path,
      method
    }), req);

    // 重新加载自定义API路由
    const { reloadCustomApiRoutes } = require('../utils/custom-api-router');
    await reloadCustomApiRoutes();

    res.json({
      success: true,
      message: '自定义API创建成功',
      data: { id: result.id }
    });
  } catch (error) {
    logger.error('创建自定义API失败', { error: error.message });
    res.status(500).json({ success: false, message: 'Failed to create custom API: ' + error.message });
  }
});

/**
 * PUT /api/admin/custom-apis/:id
 * 更新自定义API
 */
router.put('/custom-apis/:id', requireAuth, [
  body('name').notEmpty().withMessage('API名称不能为空'),
  body('path').notEmpty().withMessage('API路径不能为空'),
  body('method').isIn(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']).withMessage('请求方法无效'),
  body('response_content').notEmpty().withMessage('返回内容不能为空'),
  validate
], async (req, res) => {
  try {
    const { id } = req.params;
    const { name, path, method, requires_token, response_content, description, status } = req.body;

    // 检查API是否存在
    const existing = await getAsync('SELECT id FROM custom_apis WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'API不存在' });
    }

    // 验证路径格式
    if (!path.startsWith('/')) {
      return res.status(400).json({ success: false, message: '路径必须以 / 开头' });
    }

    // 检查路径和方法组合是否被其他API使用
    const pathConflict = await getAsync(
      'SELECT id FROM custom_apis WHERE path = ? AND method = ? AND id != ?', 
      [path, method || 'GET', id]
    );
    if (pathConflict) {
      return res.status(400).json({ success: false, message: '该路径和方法组合已被其他API使用' });
    }

    // 验证返回内容是否为有效的JSON
    let parsedContent;
    try {
      parsedContent = JSON.parse(response_content);
    } catch (e) {
      return res.status(400).json({ success: false, message: '返回内容必须是有效的JSON格式' });
    }

    // 保护文章ID：如果这是GET方法的API（可能包含博客文章），需要保护文章的ID不被修改
    if (method === 'GET' || method === undefined || !method) {
      try {
        // 获取原始API数据
        const originalApi = await getAsync(
          'SELECT response_content FROM custom_apis WHERE id = ?',
          [id]
        );
        
        if (originalApi && originalApi.response_content) {
          const originalContent = JSON.parse(originalApi.response_content);
          
          // 检查是否是天气路况的对象格式（特殊处理）
          const isWeatherObjectFormat = 
            originalContent.globalAlert && 
            originalContent.attractions && 
            originalContent.traffic &&
            parsedContent.globalAlert &&
            parsedContent.attractions &&
            parsedContent.traffic;
          
          if (isWeatherObjectFormat) {
            // 天气路况对象格式：只包含globalAlert、attractions、traffic
            logger.info('检测到天气路况对象格式', { apiId: id });
            
            // 确保不包含data字段
            if (parsedContent.data !== undefined) {
              delete parsedContent.data;
            }
            
            // 验证天气路况对象结构
            if (!parsedContent.globalAlert || !parsedContent.attractions || !parsedContent.traffic) {
              logger.warn('天气路况对象格式不完整', {
                hasGlobalAlert: !!parsedContent.globalAlert,
                hasAttractions: !!parsedContent.attractions,
                hasTraffic: !!parsedContent.traffic
              });
            }
            
            // 更新response_content（天气路况对象格式直接使用整个对象）
            response_content = JSON.stringify(parsedContent);
            logger.info('API Management更新天气路况对象', {
              apiId: id,
              globalAlert: parsedContent.globalAlert,
              attractionsCount: parsedContent.attractions ? parsedContent.attractions.length : 0,
              trafficCount: parsedContent.traffic ? parsedContent.traffic.length : 0,
              hasDataField: parsedContent.data !== undefined
            });
          } else {
            // 普通格式：检查是否是数组格式或包含data数组的对象格式
            let originalItems = [];
            let newItems = [];
            
            if (Array.isArray(originalContent)) {
              originalItems = originalContent;
              newItems = Array.isArray(parsedContent) ? parsedContent : [];
            } else if (originalContent.data && Array.isArray(originalContent.data)) {
              originalItems = originalContent.data;
              newItems = (parsedContent.data && Array.isArray(parsedContent.data)) ? parsedContent.data : [];
            }
            
            // 如果有文章数据，保护ID和slug
            if (originalItems.length > 0 && newItems.length > 0) {
            const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            
            // 创建原始ID和slug映射（基于name/title匹配，因为ID可能被修改）
            const originalIdMap = new Map();
            const originalSlugMap = new Map();
            originalItems.forEach(item => {
              const key = String(item.name || item.title || '').toLowerCase();
              if (item.id && UUID_REGEX.test(String(item.id))) {
                originalIdMap.set(key, item.id);
                if (item.slug) {
                  originalSlugMap.set(String(item.id), item.slug);
                }
              }
            });
            
            // 恢复被修改的ID和slug
            let hasIdChanged = false;
            let hasSlugChanged = false;
            const usedSlugs = new Set(); // 跟踪已使用的slug
            
            newItems.forEach((item, index) => {
              const key = String(item.name || item.title || '').toLowerCase();
              const originalId = originalIdMap.get(key);
              
              if (originalId) {
                const currentId = String(item.id || '');
                // 如果ID被修改了（不是UUID或与原始ID不同），恢复原始ID
                if (!UUID_REGEX.test(currentId) || currentId !== originalId) {
                  item.id = originalId;
                  hasIdChanged = true;
                }
                
                // 恢复或生成稳定的slug
                const originalSlug = originalSlugMap.get(String(originalId));
                if (originalSlug && !usedSlugs.has(originalSlug)) {
                  item.slug = originalSlug;
                  usedSlugs.add(originalSlug);
                  if (item.slug !== originalSlug) {
                    hasSlugChanged = true;
                  }
                } else if (!item.slug || usedSlugs.has(item.slug)) {
                  // 如果没有slug或slug冲突，基于ID生成稳定的slug
                  const name = item.name || item.title || '未命名';
                  let baseSlug = name
                    .toLowerCase()
                    .replace(/[^\w\s-]/g, '')
                    .replace(/\s+/g, '-')
                    .replace(/-+/g, '-')
                    .trim();
                  
                  if (!baseSlug) {
                    baseSlug = String(originalId).substring(0, 8).replace(/[^a-z0-9]/g, '');
                  }
                  
                  const idSuffix = String(originalId).substring(0, 8).replace(/[^a-z0-9]/g, '');
                  let newSlug = `${baseSlug}-${idSuffix}`;
                  
                  // 确保唯一性
                  let counter = 1;
                  while (usedSlugs.has(newSlug)) {
                    const baseSlugPart = newSlug.split('-').slice(0, -1).join('-') || newSlug;
                    newSlug = `${baseSlugPart}-${counter}`;
                    counter++;
                  }
                  
                  item.slug = newSlug;
                  usedSlugs.add(newSlug);
                  hasSlugChanged = true;
                } else {
                  usedSlugs.add(item.slug);
                }
              }
            });
            
            // 如果有ID或slug被恢复，更新parsedContent
            if (hasIdChanged || hasSlugChanged) {
              if (Array.isArray(parsedContent)) {
                parsedContent = newItems;
              } else {
                parsedContent.data = newItems;
              }
              response_content = JSON.stringify(parsedContent);
              logger.info('API Management更新时保护了文章ID和slug', { 
                apiId: id, 
                idChanged: hasIdChanged, 
                slugChanged: hasSlugChanged 
              });
            }
          }
        }
      }
      } catch (e) {
        // 如果保护ID时出错，记录警告但继续保存（不阻止用户操作）
        logger.warn('保护文章ID时出错，继续保存', { error: e.message, apiId: id });
      }
    }

    // 更新数据库
    await runAsync(`
      UPDATE custom_apis
      SET name = ?, path = ?, method = ?, requires_token = ?, response_content = ?, description = ?, status = ?, updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `, [
      name,
      path,
      method || 'GET',
      requires_token ? 1 : 0,
      response_content,
      description || null,
      status || 'active',
      id
    ]);

    await logAction(req.session.adminId, 'UPDATE', 'custom_api', id, JSON.stringify({
      name,
      path,
      method
    }), req);

    // 重新加载自定义API路由
    const { reloadCustomApiRoutes } = require('../utils/custom-api-router');
    await reloadCustomApiRoutes();

    res.json({
      success: true,
      message: '自定义API更新成功'
    });
  } catch (error) {
    logger.error('更新自定义API失败', { error: error.message });
    res.status(500).json({ success: false, message: 'Failed to update custom API: ' + error.message });
  }
});

/**
 * POST /api/admin/custom-apis/upload-image
 * 上传自定义API图片
 */
router.post('/custom-apis/upload-image', requireAuth, customApiImageUpload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No image file provided' });
    }
    
    const filename = req.file.filename;
    
    // 获取完整的URL（包含协议和域名）
    // 优先检查代理头（适用于反向代理场景）
    const protocol = req.get('x-forwarded-proto') || req.protocol || (req.secure ? 'https' : 'http');
    const host = req.get('x-forwarded-host') || req.get('host') || req.headers.host;
    const fullUrl = `${protocol}://${host}/uploads/custom-api-images/${filename}`;
    const relativeUrl = `/uploads/custom-api-images/${filename}`;
    
    await logAction(req.session.adminId, 'CREATE', 'custom_api_image', null, JSON.stringify({
      filename: filename,
      url: fullUrl,
      relativeUrl: relativeUrl
    }), req);
    
    res.json({ 
      success: true, 
      message: 'Image uploaded successfully',
      image: {
        filename: filename,
        url: fullUrl, // 返回完整URL
        relativeUrl: relativeUrl // 也返回相对URL供需要时使用
      }
    });
  } catch (error) {
    logger.error('上传自定义API图片失败', { error: error.message });
    res.status(500).json({ success: false, message: 'Failed to upload image: ' + error.message });
  }
});

/**
 * 将视频转换为MP4格式（兼容微信小程序）
 * @param {string} inputPath - 输入视频文件路径
 * @param {string} outputPath - 输出MP4文件路径
 * @returns {Promise<void>}
 */
function convertVideoToMp4(inputPath, outputPath, onProgress) {
  return new Promise((resolve, reject) => {
    // 检查ffmpeg是否可用
    ffmpeg.ffprobe(inputPath, (err, metadata) => {
      if (err) {
        return reject(new Error('无法读取视频文件，可能格式不兼容: ' + err.message));
      }
      
      // 获取视频格式
      const format = metadata.format ? metadata.format.format_name : '';
      const ext = path.extname(inputPath).toLowerCase();
      
      // 如果已经是MP4格式，检查编码是否兼容
      if (ext === '.mp4' && format && format.includes('mp4')) {
        // 检查视频编码（微信小程序主要支持H.264）
        const videoStream = metadata.streams.find(s => s.codec_type === 'video');
        if (videoStream && videoStream.codec_name === 'h264') {
          // 已经是兼容的MP4格式，直接复制
          fs.copyFileSync(inputPath, outputPath);
          if (onProgress) {
            onProgress(100);
          }
          return resolve();
        }
      }
      
      // 转换为MP4格式（H.264编码，兼容微信小程序）
      ffmpeg(inputPath)
        .videoCodec('libx264') // H.264编码
        .audioCodec('aac') // AAC音频编码
        .format('mp4')
        .outputOptions([
          '-preset medium', // 编码速度和质量平衡
          '-crf 23', // 质量参数（18-28，23是默认值）
          '-movflags +faststart' // 优化网络播放
        ])
        .on('start', (commandLine) => {
          logger.info('开始转换视频', { inputPath, commandLine });
          if (onProgress) {
            onProgress(0);
          }
        })
        .on('progress', (progress) => {
          if (progress.percent !== undefined) {
            const percent = Math.min(Math.round(progress.percent), 99); // 最多99%，完成时设为100%
            logger.debug('视频转换进度', { percent });
            if (onProgress) {
              onProgress(percent);
            }
          }
        })
        .on('end', () => {
          logger.info('视频转换完成', { inputPath, outputPath });
          // 删除原始文件（如果不是MP4）
          if (ext !== '.mp4') {
            try {
              fs.unlinkSync(inputPath);
              logger.info('已删除原始视频文件', { inputPath });
            } catch (e) {
              logger.warn('删除原始视频文件失败', { error: e.message });
            }
          }
          if (onProgress) {
            onProgress(100);
          }
          resolve();
        })
        .on('error', (err) => {
          logger.error('视频转换失败', { error: err.message, inputPath });
          reject(new Error('视频格式不兼容，无法转换为MP4: ' + err.message));
        })
        .save(outputPath);
    });
  });
}

/**
 * 提取视频的第一帧并保存为图片
 * @param {string} videoPath - 视频文件路径
 * @param {string} outputPath - 输出图片路径
 * @returns {Promise<string>} 返回图片文件路径
 */
function extractVideoFirstFrame(videoPath, outputPath) {
  return new Promise((resolve, reject) => {
    // 确保输出目录存在
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // 使用ffmpeg提取第一帧（在0秒处）
    // 根据输出文件扩展名确定格式
    const ext = path.extname(outputPath).toLowerCase();
    const isJpeg = ext === '.jpg' || ext === '.jpeg';
    
    ffmpeg(videoPath)
      .seekInput(0) // 从0秒开始
      .frames(1) // 只提取1帧
      .format(isJpeg ? 'image2' : 'image2') // 图片格式
      .outputOptions([
        '-q:v', '2' // 高质量JPEG（1-31，2是高质量，值越小质量越高）
      ])
      .on('start', (commandLine) => {
        logger.info('开始提取视频第一帧', { videoPath, outputPath, commandLine });
      })
      .on('end', () => {
        logger.info('视频第一帧提取完成', { videoPath, outputPath });
        resolve(outputPath);
      })
      .on('error', (err) => {
        logger.error('提取视频第一帧失败', { error: err.message, videoPath });
        reject(new Error('提取视频第一帧失败: ' + err.message));
      })
      .save(outputPath);
  });
}

/**
 * GET /api/admin/custom-apis/video-upload-progress/:taskId
 * 获取视频上传任务进度
 */
router.get('/custom-apis/video-upload-progress/:taskId', requireAuth, (req, res) => {
  const { taskId } = req.params;
  const task = videoUploadTasks.get(taskId);
  
  if (!task) {
    return res.json({ 
      success: false, 
      message: '任务不存在或已过期',
      running: false 
    });
  }
  
  res.json({
    success: true,
    running: task.running,
    progress: task.progress,
    status: task.status,
    error: task.error,
    result: task.result
  });
});

/**
 * POST /api/admin/custom-apis/upload-video
 * 上传自定义API视频（自动转换为MP4格式以兼容微信小程序）
 */
router.post('/custom-apis/upload-video', requireAuth, customApiVideoUpload.single('video'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No video file provided' });
    }
    
    // 生成任务ID
    const taskId = `video-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    
    // 创建任务状态
    const task = {
      taskId,
      running: true,
      progress: {
        stage: 'uploading', // uploading, converting, extracting_poster, completed
        percent: 0,
        message: '视频上传完成，开始处理...'
      },
      status: 'uploading',
      createdAt: Date.now(),
      error: null,
      result: null
    };
    
    videoUploadTasks.set(taskId, task);
    
    // 立即返回任务ID，让前端开始轮询
    res.json({ 
      success: true, 
      taskId: taskId,
      message: '视频上传成功，正在处理...'
    });
    
    // 异步处理视频（不阻塞响应）
    (async () => {
      try {
        const originalFilename = req.file.filename;
        const originalPath = req.file.path;
        const ext = path.extname(originalFilename).toLowerCase();
        const baseName = path.basename(originalFilename, ext);
        
        // 目标文件路径（始终使用MP4扩展名）
        const uploadDir = path.join(DATA_DIR, 'uploads/custom-api-videos');
        const outputFilename = `${baseName}.mp4`;
        const outputPath = path.join(uploadDir, outputFilename);
        
        let finalFilename = originalFilename;
        let finalPath = originalPath;
        let converted = false;
        
        // 更新状态：检查格式
        task.progress = {
          stage: 'checking',
          percent: 5,
          message: '正在检查视频格式...'
        };
        
        // 如果不是MP4格式，尝试转换
        if (ext !== '.mp4') {
          try {
            logger.info('检测到非MP4格式视频，开始转换', { 
              originalFormat: ext, 
              originalPath,
              outputPath 
            });
            
            task.progress = {
              stage: 'converting',
              percent: 10,
              message: `正在将${ext.toUpperCase()}格式转换为MP4...`
            };
            
            // 转换视频，带进度回调
            await convertVideoToMp4(originalPath, outputPath, (percent) => {
              // 转换进度：10% - 90%
              const conversionPercent = 10 + Math.round(percent * 0.8);
              task.progress = {
                stage: 'converting',
                percent: conversionPercent,
                message: `正在转换视频... ${percent}%`
              };
            });
            
            finalFilename = outputFilename;
            finalPath = outputPath;
            converted = true;
            
            logger.info('视频转换成功', { 
              originalFormat: ext,
              finalFilename 
            });
          } catch (conversionError) {
            // 转换失败，删除原始文件
            try {
              fs.unlinkSync(originalPath);
            } catch (e) {
              logger.warn('删除转换失败的视频文件时出错', { error: e.message });
            }
            
            logger.error('视频转换失败', { 
              error: conversionError.message,
              originalFormat: ext 
            });
            
            task.running = false;
            task.error = `视频格式不兼容（${ext}），无法转换为MP4。错误详情: ${conversionError.message}`;
            task.status = 'error';
            return;
          }
        } else {
          // 已经是MP4，检查是否需要重新编码以确保兼容性
          try {
            task.progress = {
              stage: 'checking',
              percent: 20,
              message: '正在检查视频编码...'
            };
            
            // 检查视频编码
            await new Promise((resolve, reject) => {
              ffmpeg.ffprobe(originalPath, (err, metadata) => {
                if (err) {
                  // 如果无法读取，可能文件损坏，但不阻止上传
                  logger.warn('无法读取MP4视频信息', { error: err.message });
                  return resolve();
                }
                
                const videoStream = metadata.streams.find(s => s.codec_type === 'video');
                if (videoStream && videoStream.codec_name !== 'h264') {
                  // 不是H.264编码，需要转换
                  logger.info('MP4视频不是H.264编码，开始转换', { 
                    codec: videoStream.codec_name,
                    originalPath,
                    outputPath 
                  });
                  
                  task.progress = {
                    stage: 'converting',
                    percent: 20,
                    message: '正在重新编码视频以确保兼容性...'
                  };
                  
                  convertVideoToMp4(originalPath, outputPath, (percent) => {
                    // 转换进度：20% - 90%
                    const conversionPercent = 20 + Math.round(percent * 0.7);
                    task.progress = {
                      stage: 'converting',
                      percent: conversionPercent,
                      message: `正在重新编码视频... ${percent}%`
                    };
                  })
                    .then(() => {
                      finalFilename = outputFilename;
                      finalPath = outputPath;
                      converted = true;
                      resolve();
                    })
                    .catch(reject);
                } else {
                  resolve();
                }
              });
            });
          } catch (conversionError) {
            logger.warn('MP4视频编码检查/转换失败，使用原始文件', { 
              error: conversionError.message 
            });
            // 转换失败但文件是MP4，继续使用原始文件
          }
        }
        
        // 获取完整的URL（包含协议和域名）
        const protocol = req.get('x-forwarded-proto') || req.protocol || (req.secure ? 'https' : 'http');
        const host = req.get('x-forwarded-host') || req.get('host') || req.headers.host;
        const fullUrl = `${protocol}://${host}/uploads/custom-api-videos/${finalFilename}`;
        const relativeUrl = `/uploads/custom-api-videos/${finalFilename}`;
        
        // 自动提取视频第一帧作为poster
        let posterUrl = '';
        let posterRelativeUrl = '';
        
        task.progress = {
          stage: 'extracting_poster',
          percent: 90,
          message: '正在提取视频封面...'
        };
        
        try {
          const posterImageDir = path.join(DATA_DIR, 'uploads/custom-api-images');
          if (!fs.existsSync(posterImageDir)) {
            fs.mkdirSync(posterImageDir, { recursive: true });
          }
          
          // 生成poster图片文件名（与视频文件名对应，但使用.jpg扩展名）
          const posterFilename = `${baseName}.jpg`;
          const posterPath = path.join(posterImageDir, posterFilename);
          
          // 提取第一帧
          await extractVideoFirstFrame(finalPath, posterPath);
          
          // 生成poster URL
          posterRelativeUrl = `/uploads/custom-api-images/${posterFilename}`;
          posterUrl = `${protocol}://${host}${posterRelativeUrl}`;
          
          logger.info('成功提取视频第一帧作为poster', { 
            videoPath: finalPath, 
            posterPath,
            posterUrl 
          });
        } catch (posterError) {
          // poster提取失败不影响视频上传，只记录警告
          logger.warn('提取视频第一帧失败，继续上传视频', { 
            error: posterError.message,
            videoPath: finalPath 
          });
        }
        
        await logAction(req.session.adminId, 'CREATE', 'custom_api_video', null, JSON.stringify({
          filename: finalFilename,
          originalFilename: converted ? originalFilename : undefined,
          converted: converted,
          url: fullUrl,
          relativeUrl: relativeUrl,
          posterUrl: posterUrl || undefined,
          posterRelativeUrl: posterRelativeUrl || undefined
        }), req);
        
        // 完成任务
        task.running = false;
        task.status = 'completed';
        task.progress = {
          stage: 'completed',
          percent: 100,
          message: converted ? '视频处理完成，已自动转换为MP4格式' : '视频处理完成'
        };
        task.result = {
          filename: finalFilename,
          originalFilename: converted ? originalFilename : undefined,
          converted: converted,
          url: fullUrl,
          relativeUrl: relativeUrl,
          posterUrl: posterUrl,
          posterRelativeUrl: posterRelativeUrl
        };
      } catch (error) {
        logger.error('处理视频失败', { error: error.message });
        task.running = false;
        task.error = '处理视频失败: ' + error.message;
        task.status = 'error';
      }
    })();
  } catch (error) {
    logger.error('上传自定义API视频失败', { error: error.message });
    res.status(500).json({ success: false, message: 'Failed to upload video: ' + error.message });
  }
});

/**
 * DELETE /api/admin/custom-apis/:id
 * 删除自定义API
 */
router.delete('/custom-apis/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    // 检查API是否存在
    const existing = await getAsync('SELECT id, name, path FROM custom_apis WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'API不存在' });
    }

    // 删除数据库记录
    await runAsync('DELETE FROM custom_apis WHERE id = ?', [id]);

    await logAction(req.session.adminId, 'DELETE', 'custom_api', id, JSON.stringify({
      name: existing.name,
      path: existing.path
    }), req);

    // 重新加载自定义API路由
    const { reloadCustomApiRoutes } = require('../utils/custom-api-router');
    await reloadCustomApiRoutes();

    res.json({
      success: true,
      message: '自定义API删除成功'
    });
  } catch (error) {
    logger.error('删除自定义API失败', { error: error.message });
    res.status(500).json({ success: false, message: 'Failed to delete custom API: ' + error.message });
  }
});

/**
 * POST /api/admin/custom-apis/backup
 * 备份所有自定义API数据
 */
router.post('/custom-apis/backup', requireAuth, async (req, res) => {
  try {
    // 获取所有自定义API数据
    const apis = await allAsync(`
      SELECT id, name, path, method, requires_token, response_content, description, status, created_at, updated_at
      FROM custom_apis
      ORDER BY id ASC
    `);

    // 构建备份数据
    const backupData = {
      version: '1.0',
      backupTime: new Date().toISOString(),
      apiCount: apis.length,
      apis: apis.map(api => ({
        ...api,
        requires_token: api.requires_token === 1 || api.requires_token === '1' ? 1 : 0
      }))
    };

    await logAction(req.session.adminId, 'BACKUP', 'custom_api', null, JSON.stringify({
      apiCount: apis.length
    }), req);

    res.json({
      success: true,
      message: '备份成功',
      data: backupData
    });
  } catch (error) {
    logger.error('备份自定义API失败', { error: error.message });
    res.status(500).json({ 
      success: false, 
      message: '备份失败: ' + error.message 
    });
  }
});

/**
 * POST /api/admin/custom-apis/restore
 * 恢复自定义API数据（会清空现有数据）
 */
router.post('/custom-apis/restore', requireAuth, [
  body('backupData').notEmpty().withMessage('备份数据不能为空'),
  validate
], async (req, res) => {
  try {
    const { backupData } = req.body;

    // 验证备份数据格式
    if (!backupData || typeof backupData !== 'object') {
      return res.status(400).json({ 
        success: false, 
        message: '备份数据格式无效' 
      });
    }

    if (!backupData.apis || !Array.isArray(backupData.apis)) {
      return res.status(400).json({ 
        success: false, 
        message: '备份数据中缺少API列表' 
      });
    }

    // 开始事务
    await beginTransaction();

    try {
      // 1. 删除所有现有自定义API
      await runAsync('DELETE FROM custom_apis');

      // 2. 插入备份数据中的所有API
      let restoredCount = 0;
      for (const api of backupData.apis) {
        // 验证必需字段
        if (!api.name || !api.path || !api.method || !api.response_content) {
          logger.warn('跳过无效的API数据', { api });
          continue;
        }

        // 验证response_content是否为有效JSON
        try {
          JSON.parse(api.response_content);
        } catch (e) {
          logger.warn('跳过response_content无效的API', { apiId: api.id, apiName: api.name });
          continue;
        }

        // 转换日期格式：ISO格式转SQLite datetime格式
        let createdAt = api.created_at;
        let updatedAt = api.updated_at;
        
        if (createdAt) {
          // 如果是ISO格式，转换为SQLite格式
          if (createdAt.includes('T')) {
            createdAt = createdAt.replace('T', ' ').substring(0, 19);
          }
        } else {
          // 使用当前时间
          const now = new Date();
          createdAt = now.toISOString().replace('T', ' ').substring(0, 19);
        }
        
        if (updatedAt) {
          // 如果是ISO格式，转换为SQLite格式
          if (updatedAt.includes('T')) {
            updatedAt = updatedAt.replace('T', ' ').substring(0, 19);
          }
        } else {
          // 使用当前时间
          const now = new Date();
          updatedAt = now.toISOString().replace('T', ' ').substring(0, 19);
        }

        // 插入API（不保留原ID，使用新的自增ID）
        await runAsync(`
          INSERT INTO custom_apis (name, path, method, requires_token, response_content, description, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          api.name,
          api.path,
          api.method || 'GET',
          api.requires_token ? 1 : 0,
          api.response_content,
          api.description || null,
          api.status || 'active',
          createdAt,
          updatedAt
        ]);
        restoredCount++;
      }

      // 提交事务
      await commit();

      // 重新加载自定义API路由
      const { reloadCustomApiRoutes } = require('../utils/custom-api-router');
      await reloadCustomApiRoutes();

      await logAction(req.session.adminId, 'RESTORE', 'custom_api', null, JSON.stringify({
        backupTime: backupData.backupTime,
        originalCount: backupData.apiCount,
        restoredCount: restoredCount
      }), req);

      res.json({
        success: true,
        message: `恢复成功，已恢复 ${restoredCount} 个API`,
        data: {
          restoredCount,
          originalCount: backupData.apiCount
        }
      });
    } catch (error) {
      // 回滚事务
      await rollback();
      throw error;
    }
  } catch (error) {
    logger.error('恢复自定义API失败', { error: error.message });
    res.status(500).json({ 
      success: false, 
      message: '恢复失败: ' + error.message 
    });
  }
});

/**
 * GET /api/admin/custom-apis/:id/logs
 * 获取指定自定义API的日志列表
 */
router.get('/custom-apis/:id/logs', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // 检查API是否存在
    const api = await getAsync('SELECT id, name FROM custom_apis WHERE id = ?', [id]);
    if (!api) {
      return res.status(404).json({ success: false, message: 'API不存在' });
    }

    // 获取日志总数
    const totalResult = await getAsync(
      'SELECT COUNT(*) as total FROM custom_api_logs WHERE api_id = ?',
      [id]
    );
    const total = totalResult.total;

    // 获取日志列表
    const logs = await allAsync(`
      SELECT 
        id, request_method, request_path, request_headers, request_query, request_body,
        response_status, response_body, response_time_ms, ip_address, user_agent, error_message, created_at
      FROM custom_api_logs
      WHERE api_id = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `, [id, parseInt(limit), offset]);

    res.json({
      success: true,
      data: {
        logs: logs.map(log => ({
          ...log,
          request_headers: typeof log.request_headers === 'string' ? JSON.parse(log.request_headers) : log.request_headers,
          request_query: typeof log.request_query === 'string' ? JSON.parse(log.request_query) : log.request_query,
          request_body: typeof log.request_body === 'string' ? JSON.parse(log.request_body) : log.request_body,
          response_body: typeof log.response_body === 'string' ? JSON.parse(log.response_body) : log.response_body
        })),
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    logger.error('获取API日志失败', { error: error.message });
    res.status(500).json({ success: false, message: 'Failed to get API logs: ' + error.message });
  }
});

/**
 * POST /api/admin/parse-google-maps-link
 * 解析谷歌地图链接（包括短链接），提取经纬度或地址信息
 */
router.post('/parse-google-maps-link', requireAuth, [
  body('link').notEmpty().withMessage('链接不能为空').trim(),
  validate
], async (req, res) => {
  try {
    const { link } = req.body;
    const https = require('https');
    const http = require('http');
    const { URL } = require('url');

    let finalUrl = link;
    let lat = null;
    let lng = null;
    let address = null;

    // 检查是否是短链接（goo.gl 或 maps.app.goo.gl）
    const isShortLink = /^(https?:\/\/)?(maps\.app\.)?goo\.gl\/.+$/i.test(link) || 
                        /^(https?:\/\/)?maps\.app\.goo\.gl\/.+$/i.test(link);

    // 如果是短链接，先获取真实URL
    if (isShortLink) {
      try {
        // 确保URL有协议
        if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
          finalUrl = 'https://' + finalUrl;
        }

        // 使用GET请求获取重定向后的URL（HEAD请求可能不返回Location头）
        const urlObj = new URL(finalUrl);
        
        // 创建一个Promise来处理重定向
        finalUrl = await new Promise((resolve, reject) => {
          const protocol = urlObj.protocol === 'https:' ? https : http;
          let redirectCount = 0;
          const maxRedirects = 5;

          const makeRequest = (url) => {
            const currentUrl = new URL(url);
            const reqOptions = {
              hostname: currentUrl.hostname,
              path: currentUrl.pathname + currentUrl.search,
              method: 'GET',
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
              },
              timeout: 5000,
              maxRedirects: 0 // 手动处理重定向
            };

            const req = protocol.request(reqOptions, (res) => {
              // 处理重定向（3xx状态码）
              if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                redirectCount++;
                if (redirectCount > maxRedirects) {
                  req.destroy();
                  reject(new Error('重定向次数过多'));
                  return;
                }
                // 处理相对路径和绝对路径
                let redirectUrl = res.headers.location;
                if (!redirectUrl.startsWith('http://') && !redirectUrl.startsWith('https://')) {
                  redirectUrl = new URL(redirectUrl, url).href;
                }
                // 继续跟踪重定向
                makeRequest(redirectUrl);
              } else if (res.statusCode >= 200 && res.statusCode < 300) {
                // 成功响应，返回当前URL
                req.destroy();
                resolve(url);
              } else {
                // 其他状态码，返回当前URL
                req.destroy();
                resolve(url);
              }
              // 不需要读取响应体，直接销毁
              res.on('data', () => {});
              res.on('end', () => {});
            });

            req.on('error', (error) => {
              reject(error);
            });

            req.on('timeout', () => {
              req.destroy();
              reject(new Error('请求超时'));
            });

            req.end();
          };

          makeRequest(finalUrl);
        });
      } catch (error) {
        logger.warn('解析短链接失败，尝试直接解析原链接', { error: error.message, link });
        // 如果短链接解析失败，继续尝试直接解析原链接
      }
    }

    // 解析各种谷歌地图链接格式
    // 格式1: https://www.google.com/maps?q=30.0444,31.2357
    // 格式2: https://maps.google.com/?q=30.0444,31.2357
    let match = finalUrl.match(/[?&]q=([^&]+)/);
    if (match) {
      const qValue = decodeURIComponent(match[1]);
      // 检查是否是经纬度格式 (lat,lng)
      const coordsMatch = qValue.match(/^(-?\d+\.?\d*),(-?\d+\.?\d*)$/);
      if (coordsMatch) {
        lat = parseFloat(coordsMatch[1]);
        lng = parseFloat(coordsMatch[2]);
      } else {
        // 否则是地址名称
        address = qValue;
      }
    }

    // 格式3: https://www.google.com/maps/@30.0444,31.2357,15z
    // 格式4: https://www.google.com/maps/place/.../@30.0444,31.2357,15z
    if (lat === null || lng === null) {
      match = finalUrl.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
      if (match) {
        lat = parseFloat(match[1]);
        lng = parseFloat(match[2]);
      }
    }

    // 格式5: 直接包含经纬度的URL参数
    if (lat === null || lng === null) {
      match = finalUrl.match(/[?&]ll=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
      if (match) {
        lat = parseFloat(match[1]);
        lng = parseFloat(match[2]);
      }
    }

    // 格式6: place链接
    if (lat === null || lng === null) {
      match = finalUrl.match(/place\/[^/]+\/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
      if (match) {
        lat = parseFloat(match[1]);
        lng = parseFloat(match[2]);
      }
    }

    // 验证经纬度范围
    if (lat !== null && lng !== null && !isNaN(lat) && !isNaN(lng)) {
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        return res.json({
          success: true,
          data: {
            lat: lat,
            lng: lng,
            address: address || null,
            finalUrl: finalUrl
          }
        });
      }
    }

    // 如果只有地址名称，返回地址信息
    if (address) {
      return res.json({
        success: true,
        data: {
          lat: null,
          lng: null,
          address: address,
          finalUrl: finalUrl
        }
      });
    }

    // 如果都没有找到
    return res.status(400).json({
      success: false,
      message: '无法从链接中提取位置信息，请检查链接格式',
      data: {
        finalUrl: finalUrl
      }
    });
  } catch (error) {
    logger.error('解析谷歌地图链接失败', { error: error.message, link: req.body.link });
    res.status(500).json({
      success: false,
      message: '解析失败：' + error.message
    });
  }
});

/**
 * POST /api/admin/weather/update
 * 手动触发天气路况更新
 */
router.post('/weather/update', requireAuth, async (req, res) => {
  try {
    const { allAsync, runAsync } = require('../db/database');
    const { fetchWeatherRoadData } = require('../utils/weather-fetcher');
    const { updateWeatherAPI, findWeatherApi } = require('../utils/weather-updater');

    const settings = await allAsync('SELECT key, value FROM settings');
    const settingsObj = {};
    settings.forEach((s) => {
      settingsObj[s.key] = s.value;
    });

    const weatherApi = await findWeatherApi();
    if (!weatherApi) {
      return res.status(404).json({
        success: false,
        message: '未找到天气路况API（/weather）'
      });
    }

    let existingContent = null;
    if (weatherApi.response_content) {
      try {
        existingContent = JSON.parse(weatherApi.response_content);
      } catch (error) {
        existingContent = null;
      }
    }

    logger.info('手动触发天气路况更新', {
      city: settingsObj.weather_city_name || 'Cairo',
      hasTomTomKey: Boolean(settingsObj.weather_tomtom_api_key)
    });

    const weatherData = await fetchWeatherRoadData(settingsObj, existingContent);
    await updateWeatherAPI(weatherData);

    const now = new Date();
    await runAsync(
      `INSERT INTO settings (key, value, updated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = datetime('now')`,
      ['weather_last_update', now.toISOString(), now.toISOString()]
    );

    await logAction(
      req.session.adminId,
      'UPDATE',
      'weather',
      'manual',
      JSON.stringify({
        city: settingsObj.weather_city_name || 'Cairo',
        attractions: weatherData.attractions?.length || 0,
        traffic: weatherData.traffic?.length || 0,
        source: weatherData.data?.source
      }),
      req
    );

    res.json({
      success: true,
      message: '天气路况更新成功',
      data: {
        attractions: weatherData.attractions?.length || 0,
        traffic: weatherData.traffic?.length || 0,
        updateTime: weatherData.data?.updatedAt || now.toISOString(),
        source: weatherData.data?.source || {}
      }
    });
  } catch (error) {
    logger.error('手动更新天气路况失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: '天气路况更新失败: ' + error.message
    });
  }
});

/**
 * POST /api/admin/exchange-rate/update
 * 手动触发汇率更新
 */
router.post('/exchange-rate/update', requireAuth, async (req, res) => {
  try {
    const { fetchExchangeRates } = require('../utils/exchange-rate-fetcher');
    const { updateExchangeRateAPI } = require('../utils/exchange-rate-updater');
    const { allAsync, runAsync } = require('../db/database');

    // 获取设置
    const settings = await allAsync('SELECT key, value FROM settings');
    const settingsObj = {};
    settings.forEach(s => {
      settingsObj[s.key] = s.value;
    });

    // 检查是否配置了API密钥
    const freecurrencyapiKey = settingsObj.freecurrencyapi_api_key;
    const exchangerateKey = settingsObj.exchangerate_api_key;
    
    if (!freecurrencyapiKey && !exchangerateKey) {
      return res.status(400).json({
        success: false,
        message: '未配置任何汇率API密钥，请在设置中配置'
      });
    }

    // 获取汇率
    logger.info('手动触发汇率更新', {
      hasFreecurrencyAPI: !!freecurrencyapiKey,
      hasExchangeRateAPI: !!exchangerateKey
    });

    const exchangeRatesResult = await fetchExchangeRates({
      freecurrencyapi_api_key: freecurrencyapiKey,
      exchangerate_api_key: exchangerateKey,
      exchange_rate_base_currencies: settingsObj.exchange_rate_base_currencies || 'CNY,USD,EUR,GBP,JPY,SAR,AED,RUB,INR,KRW,THB',
      exchange_rate_target_currency: settingsObj.exchange_rate_target_currency || 'EGP'
    });

    // 更新API（updateExchangeRateAPI会自动处理新格式和旧格式）
    const result = await updateExchangeRateAPI(exchangeRatesResult);

    // 获取实际的汇率数据（兼容新格式和旧格式）
    const ratesData = exchangeRatesResult.rates || exchangeRatesResult;
    const currencies = Object.keys(ratesData);

    // 更新最后更新时间（统一使用UTC时间，避免时区混淆）
    const now = new Date();
    await runAsync(
      `INSERT INTO settings (key, value, updated_at) 
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = datetime('now')`,
      ['exchange_rate_last_update', now.toISOString(), now.toISOString()]
    );

    await logAction(
      req.session.adminId,
      'UPDATE',
      'exchange_rate',
      'manual',
      JSON.stringify({
        currencies: currencies.length,
        updatedCurrencies: currencies
      }),
      req
    );

    res.json({
      success: true,
      message: '汇率更新成功',
      data: {
        currencies: result.currencies,
        updatedCurrencies: currencies,
        updateTime: result.updateTime || now.toISOString()
      }
    });
  } catch (error) {
    logger.error('手动更新汇率失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: '汇率更新失败: ' + error.message
    });
  }
});

router.syncSecurityAlerts = syncSecurityAlerts;

module.exports = router;
