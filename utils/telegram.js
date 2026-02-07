const https = require('https');
const { allAsync, getAsync, runAsync } = require('../db/database');
const { logger } = require('./logger');

function escapeTelegramHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
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

function loadBotMenuDraftFromFile() {
  try {
    const fs = require('fs');
    const path = require('path');
    const filePath = path.join(__dirname, '..', 'docs', 'telegram-bot-menu.json');
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    logger.warn('读取 Bot 菜单草稿失败', { error: error.message });
    return null;
  }
}

async function getBotMenuConfig() {
  try {
    const row = await getAsync('SELECT value FROM settings WHERE key = ?', ['telegram_bot_menu_config']);
    if (row && row.value) {
      return JSON.parse(row.value);
    }
  } catch (error) {
    logger.warn('读取 Bot 菜单配置失败', { error: error.message });
  }
  return loadBotMenuDraftFromFile() || {};
}

async function saveBotMenuConfig(config) {
  await runAsync(
    `INSERT INTO settings (key, value, updated_at)
     VALUES (?, ?, datetime('now', 'localtime'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now', 'localtime')`,
    ['telegram_bot_menu_config', JSON.stringify(config || {})]
  );
}

async function getLastRestartInfo() {
  try {
    const row = await getAsync('SELECT value FROM settings WHERE key = ?', ['last_restart_at']);
    return row?.value || null;
  } catch (error) {
    logger.warn('读取重启时间失败', { error: error.message });
    return null;
  }
}

async function getLastAdminLoginInfo() {
  try {
    const row = await getAsync(
      `SELECT created_at, ip_address, admin_id
       FROM logs
       WHERE action = 'LOGIN' AND target_type = 'admin'
       ORDER BY created_at DESC
       LIMIT 1`
    );
    if (!row) return null;
    return {
      time: row.created_at || null,
      ip: row.ip_address || null,
      adminId: row.admin_id || null
    };
  } catch (error) {
    logger.warn('读取管理员登录时间失败', { error: error.message });
    return null;
  }
}

function callTelegramApi(botToken, apiPath, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload || {});
    const req = https.request(
      {
        hostname: 'api.telegram.org',
        path: `/bot${botToken}/${apiPath}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        },
        timeout: 8000
      },
      (res) => {
        let responseBody = '';
        res.on('data', (chunk) => {
          responseBody += chunk;
        });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(responseBody);
            return;
          }
          reject(new Error(`Telegram API ${res.statusCode}: ${responseBody}`));
        });
      }
    );

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error('Telegram request timeout'));
    });
    req.write(body);
    req.end();
  });
}

async function setTelegramWebhook(botToken, url) {
  return callTelegramApi(botToken, 'setWebhook', { url });
}

async function setTelegramCommands(botToken, commands) {
  return callTelegramApi(botToken, 'setMyCommands', { commands });
}

function sendTelegramMessage(botToken, chatId, text, options = {}) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: options.parseMode || 'HTML',
      disable_web_page_preview: options.disablePreview ?? true,
      reply_markup: options.replyMarkup || undefined
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

async function answerTelegramCallbackQuery(botToken, callbackQueryId, text = '') {
  return callTelegramApi(botToken, 'answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    text: text || undefined,
    show_alert: false
  });
}

async function editTelegramMessage(botToken, chatId, messageId, text, options = {}) {
  try {
    return await callTelegramApi(botToken, 'editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: options.parseMode || 'HTML',
      disable_web_page_preview: options.disablePreview ?? true,
      reply_markup: options.replyMarkup || undefined
    });
  } catch (error) {
    const msg = String(error?.message || '');
    if (msg.includes('message is not modified')) {
      return 'not_modified';
    }
    throw error;
  }
}

function normalizeBotMenuNodes(config) {
  if (!config) return [];
  if (Array.isArray(config.menu_structure) && config.menu_structure.length > 0) {
    return config.menu_structure;
  }
  if (Array.isArray(config.menu_items) && config.menu_items.length > 0) {
    return [
      {
        id: 'root',
        label: { zh: '主菜单', en: 'Main Menu' },
        children: config.menu_items
      }
    ];
  }
  return [];
}

function getBotMenuItemLabel(item, index) {
  if (!item) return `Menu ${index + 1}`;
  const fromTitle = item.title?.zh || item.title?.en;
  const fromLabel = item.label?.zh || item.label?.en || item.label;
  const raw = fromTitle || fromLabel || `Menu ${index + 1}`;
  return String(raw);
}

function buildBotMenuKeyboard(items = []) {
  const rows = [];
  let currentRow = [];
  items.forEach((item, index) => {
    const label = getBotMenuItemLabel(item, index);
    if (!label || typeof label !== 'string') {
      return;
    }
    const actionType = item.type || (item.children ? 'submenu' : 'action');
    const mapping = item.mapping || item.id || `item-${index + 1}`;
    let callbackData = 'menu:root';
    if (actionType === 'submenu' || item.children) {
      callbackData = `submenu:${item.id || mapping}`;
    } else if (actionType === 'page') {
      callbackData = `page:${mapping}`;
    } else {
      callbackData = `action:${mapping}`;
    }
    currentRow.push({ text: label, callback_data: callbackData });
    if (currentRow.length === 2) {
      rows.push(currentRow);
      currentRow = [];
    }
  });
  if (currentRow.length) {
    rows.push(currentRow);
  }
  return rows.length ? { inline_keyboard: rows } : null;
}

function buildBotWelcomeText(config) {
  const welcome = config?.welcome || {};
  const title = welcome.title?.zh || welcome.title?.en || '欢迎使用 Bot 菜单';
  const message = welcome.message?.zh || welcome.message?.en || '请选择下方菜单开始。';
  const intro = welcome.intro?.zh || welcome.intro?.en || '这是 BOBA TEA 一体化管理系统，覆盖点单、运营、用户、告警与系统配置。';
  return `<b>${escapeTelegramHtml(title)}</b>\n${escapeTelegramHtml(message)}\n\n${escapeTelegramHtml(intro)}`;
}

async function buildBotWelcomeMessage(config) {
  const base = buildBotWelcomeText(config);
  const restartAt = await getLastRestartInfo();
  const loginInfo = await getLastAdminLoginInfo();
  const lines = [];
  if (restartAt) {
    lines.push(`• 最近重启: ${escapeTelegramHtml(restartAt)}`);
  }
  if (loginInfo?.time) {
    const ipText = loginInfo.ip ? ` (${escapeTelegramHtml(loginInfo.ip)})` : '';
    lines.push(`• 最近管理员登录: ${escapeTelegramHtml(loginInfo.time)}${ipText}`);
  }
  if (!lines.length) {
    return base;
  }
  return `${base}\n\n${lines.join('\n')}`;
}

async function sendBotWelcomeToAuthorizedGroups() {
  try {
    const telegramConfig = await getTelegramConfig();
    if (!telegramConfig.enabled || !telegramConfig.botToken) return false;

    const botConfig = await getBotMenuConfig();
    const groupIds = Array.isArray(botConfig?.authorization?.authorized_group_ids)
      ? botConfig.authorization.authorized_group_ids
      : [];
    const userIds = Array.isArray(botConfig?.authorization?.authorized_user_ids)
      ? botConfig.authorization.authorized_user_ids
      : [];

    if (groupIds.length === 0 && userIds.length === 0) return false;

    const nodes = normalizeBotMenuNodes(botConfig);
    const root = nodes[0] || { children: [] };
    const replyMarkup = buildBotMenuKeyboard(root.children || []);
    const welcomeText = await buildBotWelcomeMessage(botConfig);

    const targets = Array.from(new Set([...groupIds, ...userIds].map((id) => String(id).trim()).filter(Boolean)));
    for (const targetId of targets) {
      await sendTelegramMessage(telegramConfig.botToken, targetId, welcomeText, {
        parseMode: 'HTML',
        replyMarkup: replyMarkup || undefined
      });
    }

    return true;
  } catch (error) {
    logger.warn('启动时发送 Bot 欢迎菜单失败', { error: error.message });
    return false;
  }
}

async function sendTelegramIfEnabled(text, options = {}) {
  try {
    const config = await getTelegramConfig();
    if (!config.enabled || !config.botToken) {
      return false;
    }
    const botConfig = await getBotMenuConfig();
    const userIds = Array.isArray(botConfig?.authorization?.authorized_user_ids)
      ? botConfig.authorization.authorized_user_ids
      : [];
    const targets = new Set();
    if (config.chatId) {
      targets.add(String(config.chatId).trim());
    }
    userIds.forEach((id) => {
      const normalized = String(id).trim();
      if (normalized) targets.add(normalized);
    });
    if (targets.size === 0) {
      return false;
    }
    for (const targetId of targets) {
      await sendTelegramMessage(config.botToken, targetId, text, options);
    }
    return true;
  } catch (error) {
    logger.warn('发送 Telegram 通知失败', { error: error.message });
    return false;
  }
}

module.exports = {
  escapeTelegramHtml,
  getTelegramConfig,
  getBotMenuConfig,
  saveBotMenuConfig,
  setTelegramWebhook,
  setTelegramCommands,
  answerTelegramCallbackQuery,
  editTelegramMessage,
  sendBotWelcomeToAuthorizedGroups,
  buildBotWelcomeMessage,
  getLastRestartInfo,
  getLastAdminLoginInfo,
  sendTelegramMessage,
  sendTelegramIfEnabled
};
