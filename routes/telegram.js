const express = require('express');
const { logger } = require('../utils/logger');
const { getAsync, allAsync } = require('../db/database');
const { getTelegramConfig, getBotMenuConfig, buildBotWelcomeMessage, sendTelegramMessage, answerTelegramCallbackQuery, editTelegramMessage, escapeTelegramHtml } = require('../utils/telegram');
const { generateAiSummary } = require('../utils/ai');

const router = express.Router();

function normalizeCommand(text = '') {
  const trimmed = String(text || '').trim();
  if (!trimmed.startsWith('/')) return '';
  const command = trimmed.split(/\s+/)[0].toLowerCase();
  return command.replace(/@.+$/, '');
}

function normalizeIdList(values) {
  if (!Array.isArray(values)) return [];
  return values.map((value) => String(value).trim()).filter(Boolean);
}

function getAuthorizationConfig(draft) {
  const auth = draft?.authorization || {};
  return {
    groupWide: auth.group_wide !== false,
    groupIds: normalizeIdList(auth.authorized_group_ids || []),
    userIds: normalizeIdList(auth.authorized_user_ids || []),
    unauthorizedReply: auth.unauthorized_reply || {
      en: 'This group is not authorized. Please contact admin.',
      zh: '当前群组未授权，请联系管理员。'
    }
  };
}

function isAuthorizedMessage(message, authConfig, actorUserId = null) {
  if (!message || !message.chat) return false;
  const chatType = message.chat.type;
  const chatId = String(message.chat.id);
  const userId = actorUserId ? String(actorUserId) : (message.from?.id ? String(message.from.id) : '');

  if (chatType === 'group' || chatType === 'supergroup') {
    if (!authConfig.groupWide) return false;
    return authConfig.groupIds.includes(chatId);
  }

  if (chatType === 'private') {
    return authConfig.userIds.includes(userId);
  }

  return false;
}

function pickUnauthorizedReply(authConfig) {
  return authConfig.unauthorizedReply?.zh || authConfig.unauthorizedReply?.en || '未授权';
}

function buildMenuMessage(draft) {
  const root = draft?.menu_structure?.[0];
  const items = root?.children || draft?.menu_items || [];
  if (!items.length) {
    return '暂无可用菜单。';
  }
  const lines = items.map((item, index) => `${index + 1}. ${item.title?.zh || item.title?.en || item.label || ''}`);
  return ['菜单列表：', ...lines].join('\n');
}

function buildHelpMessage() {
  return [
    '可用命令：',
    '/start - 欢迎并展示主菜单',
    '/menu - 查看菜单列表',
    '/alerts - 查看告警摘要（待接入）',
    '/help - 帮助信息'
  ].join('\n');
}

async function buildAlertSummaryMessage() {
  const hours = 24;
  const summaryRow = await getAsync(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END) AS unread,
       COUNT(DISTINCT ip) AS unique_ips
     FROM security_alerts
     WHERE severity = 'high'
       AND alert_time >= datetime('now', ?, 'localtime')`,
    [`-${hours} hours`]
  );

  const recentAlerts = await allAsync(
    `SELECT alert_time, category, ip, path
     FROM security_alerts
     WHERE severity = 'high'
       AND alert_time >= datetime('now', ?, 'localtime')
     ORDER BY alert_time DESC
     LIMIT 5`,
    [`-${hours} hours`]
  );

  const total = summaryRow?.total || 0;
  const unread = summaryRow?.unread || 0;
  const uniqueIps = summaryRow?.unique_ips || 0;

  const lines = [
    `<b>高危告警摘要（最近 ${hours} 小时）</b>`,
    `• 总数: ${total}`,
    `• 未读: ${unread}`,
    `• 唯一 IP: ${uniqueIps}`
  ];

  if (recentAlerts.length > 0) {
    lines.push('', '<b>最近 5 条</b>');
    recentAlerts.forEach((alert, index) => {
      const when = alert.alert_time || '';
      const category = alert.category || '-';
      const ip = alert.ip || '-';
      const path = alert.path || '-';
      lines.push(`${index + 1}. ${escapeTelegramHtml(when)} | ${escapeTelegramHtml(category)} | ${escapeTelegramHtml(ip)} | ${escapeTelegramHtml(path)}`);
    });
  }

  return lines.join('\n');
}

async function buildSystemStatusMessage() {
  const now = new Date().toISOString();
  const restartRow = await getAsync('SELECT value FROM settings WHERE key = ?', ['last_restart_at']);
  const restartAt = restartRow?.value || '-';
  const orderCountRow = await getAsync('SELECT COUNT(*) AS count FROM orders');
  const userCountRow = await getAsync('SELECT COUNT(*) AS count FROM users');
  const orderCount = orderCountRow?.count || 0;
  const userCount = userCountRow?.count || 0;

  return [
    '<b>系统状态</b>',
    `• 当前时间: ${escapeTelegramHtml(now)}`,
    `• 最近重启: ${escapeTelegramHtml(restartAt)}`,
    `• 订单总数: ${orderCount}`,
    `• 用户总数: ${userCount}`
  ].join('\n');
}

async function buildRecentOrdersMessage() {
  const rows = await allAsync(
    `SELECT order_number, customer_name, customer_phone, final_amount, status, created_at
     FROM orders
     ORDER BY created_at DESC
     LIMIT 5`
  );
  if (!rows || rows.length === 0) {
    return '<b>最近订单</b>\n暂无订单。';
  }
  const lines = ['<b>最近订单（5条）</b>'];
  rows.forEach((row, index) => {
    const name = row.customer_name || '-';
    const phone = row.customer_phone || '-';
    const amount = row.final_amount ?? 0;
    const status = row.status || '-';
    const time = row.created_at || '';
    lines.push(`${index + 1}. ${escapeTelegramHtml(row.order_number)} | ${escapeTelegramHtml(name)} ${escapeTelegramHtml(phone)} | ${amount} | ${escapeTelegramHtml(status)} | ${escapeTelegramHtml(time)}`);
  });
  return lines.join('\n');
}

async function buildRecentUsersMessage() {
  const rows = await allAsync(
    `SELECT name, phone, created_at, last_login
     FROM users
     ORDER BY created_at DESC
     LIMIT 5`
  );
  if (!rows || rows.length === 0) {
    return '<b>最近用户</b>\n暂无用户。';
  }
  const lines = ['<b>最近用户（5条）</b>'];
  rows.forEach((row, index) => {
    const name = row.name || '-';
    const phone = row.phone || '-';
    const created = row.created_at || '';
    const lastLogin = row.last_login || '-';
    lines.push(`${index + 1}. ${escapeTelegramHtml(name)} | ${escapeTelegramHtml(phone)} | ${escapeTelegramHtml(created)} | ${escapeTelegramHtml(lastLogin)}`);
  });
  return lines.join('\n');
}

function buildAiPrompt(title, mapping, payload) {
  const intro = [
    '你是管理系统的智能助手。',
    '基于以下结构化数据生成简洁中文总结，最多 6 条要点。',
    '只使用提供的数据，不要编造。',
    '输出纯文本，不要使用 Markdown 或 HTML。'
  ].join('\n');
  const dataText = JSON.stringify(payload || {}, null, 2);
  return `${intro}\n\n菜单: ${title || '-'}\n映射: ${mapping || '-'}\n数据:\n${dataText}`;
}

function extractJsonObject(text = '') {
  const raw = String(text || '').trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch (err) {
      return null;
    }
  }
}

function sanitizeSql(sql = '', allowedTables = new Set(), defaultLimit = 20, forbiddenKeywords = []) {
  let text = String(sql || '').trim();
  if (!text) return { ok: false, reason: 'SQL 为空' };
  if (/;/.test(text)) return { ok: false, reason: '禁止多语句 SQL' };
  const lowered = text.toLowerCase();
  const forbidden = Array.isArray(forbiddenKeywords) && forbiddenKeywords.length
    ? forbiddenKeywords.map((kw) => String(kw).toLowerCase())
    : ['insert', 'update', 'delete', 'drop', 'alter', 'attach', 'pragma', 'vacuum', 'create', 'replace'];
  const hit = forbidden.find((kw) => {
    if (!kw) return false;
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'i');
    return regex.test(text);
  });
  if (hit) {
    return { ok: false, reason: `SQL 包含禁止关键字: ${hit}` };
  }
  if (!lowered.startsWith('select')) {
    return { ok: false, reason: '仅允许 SELECT 查询' };
  }

  const tableMatches = [];
  const fromRegex = /\bfrom\s+([`"[]?)([a-zA-Z0-9_]+)\1/gi;
  const joinRegex = /\bjoin\s+([`"[]?)([a-zA-Z0-9_]+)\1/gi;
  let match = null;
  while ((match = fromRegex.exec(lowered)) !== null) {
    tableMatches.push(match[2]);
  }
  while ((match = joinRegex.exec(lowered)) !== null) {
    tableMatches.push(match[2]);
  }
  if (tableMatches.length === 0) {
    return { ok: false, reason: '未识别到 FROM 表' };
  }
  const invalidTable = tableMatches.find((t) => allowedTables.size && !allowedTables.has(t));
  if (invalidTable) {
    return { ok: false, reason: `表 ${invalidTable} 未被允许` };
  }

  if (!/\blimit\s+\d+/i.test(text)) {
    text = `${text} LIMIT ${defaultLimit}`;
  }
  return { ok: true, sql: text };
}

async function listDbTables() {
  const rows = await allAsync(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  );
  return rows.map((row) => row.name);
}

async function getTableSchema(table) {
  const rows = await allAsync(`PRAGMA table_info(${table})`);
  return rows.map((row) => ({ name: row.name, type: row.type }));
}

async function buildSchemaContext(allowedTables = []) {
  const schema = [];
  for (const table of allowedTables) {
    const columns = await getTableSchema(table);
    schema.push({ table, columns });
  }
  return schema;
}

function buildSqlPrompt(menuTitle, mapping, schema, defaultLimit) {
  const intro = [
    '你是数据助理，只能输出 JSON。',
    '根据菜单意图生成只读 SQL（SELECT），不要编造表或字段。',
    `必须包含 LIMIT，默认 ${defaultLimit}。`,
    '输出格式：{"sql":"SELECT ...","reason":"..."}'
  ].join('\n');
  return `${intro}\n\n菜单: ${menuTitle || '-'}\n映射: ${mapping || '-'}\n可用表结构:\n${JSON.stringify(schema, null, 2)}`;
}

async function buildAiSummaryFromPayload(draft, mapping, menuTitle, menuNode, payload) {
  const aiConfig = draft?.ai || {};
  if (!aiConfig || !aiConfig.provider) return '';
  if (!payload) return '';
  const prompt = buildAiPrompt(menuTitle || payload.title, mapping, payload.data);
  const aiConfigScoped = { ...aiConfig };
  if (menuNode?.ai_prompt) {
    aiConfigScoped.system_prompt = menuNode.ai_prompt;
  }
  return await generateAiSummary(aiConfigScoped, prompt);
}

async function buildAiSummaryFromSql(draft, mapping, menuTitle, menuNode) {
  const aiConfig = draft?.ai || {};
  if (!aiConfig?.sql_mode_enabled) return '';
  if (!aiConfig.provider) return '';
  const allTables = await listDbTables();
  const blocked = Array.isArray(aiConfig.sql_blocked_tables) ? aiConfig.sql_blocked_tables.map((t) => String(t).toLowerCase()) : [];
  const allowedTables = allTables.filter((t) => !blocked.includes(String(t).toLowerCase()));
  if (allowedTables.length === 0) return '';
  const schema = await buildSchemaContext(allowedTables);
  const defaultLimit = Number.isFinite(aiConfig.sql_default_limit) ? aiConfig.sql_default_limit : 20;
  const forbidden = Array.isArray(aiConfig.sql_forbidden_keywords) ? aiConfig.sql_forbidden_keywords : [];
  const sqlPrompt = buildSqlPrompt(menuTitle, mapping, schema, defaultLimit);
  const sqlText = await generateAiSummary(aiConfig, sqlPrompt);
  const parsed = extractJsonObject(sqlText || '');
  const sql = parsed?.sql || '';
  const validated = sanitizeSql(sql, new Set(allowedTables.map((t) => t.toLowerCase())), defaultLimit, forbidden);
  if (!validated.ok) {
    const reason = validated.reason || 'SQL 校验失败';
    throw new Error(`${reason} (${sql || 'empty'})`);
  }
  const rows = await allAsync(validated.sql);
  const payload = {
    title: menuTitle || '查询结果',
    data: {
      sql: validated.sql,
      rows: rows || []
    }
  };
  return await buildAiSummaryFromPayload(draft, mapping, menuTitle, menuNode, payload);
}

async function handleCommand(command, draft) {
  switch (command) {
    case '/start':
      return buildWelcomeMessage(draft);
    case '/menu':
      return buildMenuMessage(draft);
    case '/alerts':
      return await buildAlertSummaryMessage();
    case '/status':
      return await buildSystemStatusMessage();
    case '/recent_orders':
      return await buildRecentOrdersMessage();
    case '/recent_users':
      return await buildRecentUsersMessage();
    case '/help':
      return buildHelpMessage();
    default:
      return '';
  }
}

function parseCallbackData(data) {
  const parts = String(data || '').split('|');
  const head = parts[0] || '';
  const extra = {};
  parts.slice(1).forEach((part) => {
    const [key, value] = part.split(':');
    if (key && value) {
      extra[key] = value;
    }
  });
  const [type, value] = head.split(':');
  return { type, value, extra };
}

function getMenuNodes(draft) {
  const structure = Array.isArray(draft?.menu_structure) ? draft.menu_structure : [];
  if (structure.length > 0) {
    return structure;
  }
  if (Array.isArray(draft?.menu_items) && draft.menu_items.length > 0) {
    return [
      {
        id: 'root',
        label: { zh: '主菜单', en: 'Main Menu' },
        children: draft.menu_items
      }
    ];
  }
  return [];
}

function attachParentIds(nodes, parentId = null) {
  nodes.forEach((node) => {
    node.parentId = parentId;
    if (Array.isArray(node.children)) {
      attachParentIds(node.children, node.id || parentId);
    }
  });
  return nodes;
}

function findMenuNodeById(nodes, nodeId) {
  for (const node of nodes) {
    if (node.id === nodeId || node.mapping === nodeId) return node;
    const children = node.children || [];
    const found = findMenuNodeById(children, nodeId);
    if (found) return found;
  }
  return null;
}

function buildBreadcrumb(nodes, currentId) {
  if (!currentId || currentId === 'root') {
    const rootLabel = nodes?.[0]?.label?.zh || nodes?.[0]?.label?.en || '主菜单';
    return [String(rootLabel)];
  }
  const map = new Map();
  const stack = [...nodes];
  while (stack.length) {
    const node = stack.pop();
    if (!node) continue;
    map.set(node.id, node);
    if (Array.isArray(node.children)) {
      node.children.forEach((child) => stack.push(child));
    }
  }
  const path = [];
  let cursor = map.get(currentId);
  while (cursor) {
    const label = cursor.label?.zh || cursor.label?.en || cursor.title?.zh || cursor.title?.en || '菜单';
    path.unshift(String(label));
    if (!cursor.parentId) break;
    cursor = map.get(cursor.parentId);
  }
  if (!path.length) {
    path.push('主菜单');
  }
  return path;
}

function buildMenuMessageContext(nodes, currentId, items, page = 1, pageSize = 8) {
  const { pageItems, totalPages, page: safePage } = paginateMenuItems(items, page, pageSize);
  const breadcrumb = buildBreadcrumb(nodes, currentId).join(' > ');
  const description = currentId && currentId !== 'root'
    ? getMenuItemDescription(findMenuNodeById(nodes, currentId))
    : '';

  const groups = new Map();
  pageItems.forEach((entry) => {
    const label = getMenuItemLabel(entry.item, entry.index);
    const key = getGroupLabel(entry.group);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(label);
  });

  const lines = [];
  lines.push(`<b>${escapeTelegramHtml(breadcrumb)}</b>`);
  if (description) {
    lines.push(escapeTelegramHtml(description));
  }
  if (totalPages > 1) {
    lines.push(`第 ${safePage} / ${totalPages} 页`);
  }
  groups.forEach((labels, key) => {
    lines.push('');
    lines.push(`<b>${escapeTelegramHtml(key)}</b>`);
    labels.forEach((label) => {
      lines.push(`• ${escapeTelegramHtml(label)}`);
    });
  });

  return {
    text: lines.join('\n'),
    items: pageItems.map((entry) => entry.item),
    page: safePage,
    totalPages
  };
}

function getMenuItemLabel(item, index) {
  if (!item) return `Menu ${index + 1}`;
  const fromTitle = item.title?.zh || item.title?.en;
  const fromLabel = item.label?.zh || item.label?.en || item.label;
  const raw = fromTitle || fromLabel || `Menu ${index + 1}`;
  return String(raw);
}

function getMenuItemDescription(item) {
  if (!item) return '';
  const desc = item.description?.zh || item.description?.en || item.desc?.zh || item.desc?.en || item.desc;
  if (desc) return String(desc);
  if (item.mapping) return String(item.mapping);
  return '';
}

function getGroupLabel(key) {
  if (!key) return '菜单';
  return String(key);
}

function resolveGroupKey(item) {
  const rawGroup = item?.group?.zh || item?.group?.en || item?.group;
  if (rawGroup) return String(rawGroup);
  const type = item?.type || (item?.children ? 'submenu' : 'action');
  if (type === 'submenu') return '分类';
  return '功能';
}

function paginateMenuItems(items = [], page = 1, pageSize = 8) {
  const flat = items.map((item, index) => ({
    item,
    index,
    group: resolveGroupKey(item)
  }));
  const totalItems = flat.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const start = (safePage - 1) * pageSize;
  const pageItems = flat.slice(start, start + pageSize);
  return { pageItems, totalPages, page: safePage };
}

function buildMenuKeyboard(items = [], parentId = 'root', meta = {}) {
  const rows = [];
  let currentRow = [];
  items.forEach((item, index) => {
    const label = getMenuItemLabel(item, index);
    if (!label || typeof label !== 'string') {
      return;
    }
    const actionType = item.type || (item.children ? 'submenu' : 'action');
    const mapping = item.mapping || item.id || `item-${index + 1}`;
    let callbackData = 'menu:root';
    if (actionType === 'submenu' || item.children) {
      callbackData = `submenu:${item.id || mapping}|p:${parentId}`;
    } else if (actionType === 'page') {
      callbackData = `page:${mapping}|p:${parentId}`;
    } else {
      callbackData = `action:${mapping}|p:${parentId}`;
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
  if (meta.page && meta.totalPages && meta.totalPages > 1) {
    const pagingRow = [];
    if (meta.page > 1) {
      pagingRow.push({ text: '⬅ 上一页', callback_data: `submenu:${meta.currentId || 'root'}|p:${parentId}|page:${meta.page - 1}` });
    }
    if (meta.page < meta.totalPages) {
      pagingRow.push({ text: '下一页 ➡', callback_data: `submenu:${meta.currentId || 'root'}|p:${parentId}|page:${meta.page + 1}` });
    }
    if (pagingRow.length) {
      rows.push(pagingRow);
    }
  }
  return rows.length ? { inline_keyboard: rows } : null;
}

function buildNavigationKeyboard(meta = {}) {
  const rows = [];
  rows.push([{ text: '⬅ 返回上级', callback_data: `submenu:${meta.backId || 'root'}` }]);
  rows.push([{ text: '🏠 主菜单', callback_data: 'submenu:root' }]);
  return rows;
}

async function sendMenuResponse(botToken, chatId, text, items, meta = {}) {
  const replyMarkup = buildMenuKeyboard(items, meta.currentId || 'root', meta);
  const navRows = buildNavigationKeyboard(meta);
  const finalMarkup = replyMarkup
    ? { inline_keyboard: [...replyMarkup.inline_keyboard, ...navRows] }
    : { inline_keyboard: navRows };

  if (meta.editMessageId) {
    await editTelegramMessage(botToken, chatId, meta.editMessageId, text, {
      parseMode: 'HTML',
      replyMarkup: finalMarkup
    });
    return;
  }

  await sendTelegramMessage(botToken, chatId, text, {
    parseMode: 'HTML',
    replyMarkup: finalMarkup
  });
}

router.post('/webhook/:token', async (req, res) => {
  try {
    const config = await getTelegramConfig();
    if (!config.botToken || !config.enabled) {
      return res.status(503).json({ success: false, message: 'Telegram bot disabled' });
    }

    if (req.params.token !== config.botToken) {
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }

    const update = req.body || {};
    const message = update.message || update.edited_message || null;
    const callbackQuery = update.callback_query || null;

    const draft = await getBotMenuConfig();
    const authConfig = getAuthorizationConfig(draft);
    const nodes = attachParentIds(getMenuNodes(draft));
    const root = nodes[0] || { id: 'root', children: [] };

    const safeAnswerCallback = async (text = '') => {
      try {
        await answerTelegramCallbackQuery(config.botToken, callbackQuery.id, text);
      } catch (error) {
        logger.warn('Telegram callback应答失败', { error: error.message });
      }
    };

    if (callbackQuery) {
      const callbackMessage = callbackQuery.message;
      if (!callbackMessage) return res.json({ success: true, ignored: true });
      if (!isAuthorizedMessage(callbackMessage, authConfig, callbackQuery.from?.id)) {
        const reply = pickUnauthorizedReply(authConfig);
        await safeAnswerCallback(reply);
        return res.json({ success: true, unauthorized: true });
      }

      const data = String(callbackQuery.data || '');
      await safeAnswerCallback('处理中，请稍候...');
      const parsed = parseCallbackData(data);
      const messageId = callbackMessage.message_id;
      if (parsed.type === 'submenu') {
        const submenuId = parsed.value;
        const submenu = findMenuNodeById(nodes, submenuId);
        const items = submenu?.children || [];
        const backId = parsed.extra.p || submenu?.parentId || 'root';
        const page = Number(parsed.extra.page || 1);
        const context = buildMenuMessageContext(nodes, submenuId, items, page);
        await sendMenuResponse(
          config.botToken,
          callbackMessage.chat.id,
          context.text,
          context.items,
          { backId, currentId: submenuId, editMessageId: messageId, page: context.page, totalPages: context.totalPages }
        );
        return res.json({ success: true });
      }
      if (parsed.type === 'page') {
        const mapping = parsed.value;
        const backId = parsed.extra.p || 'root';
        const menuNode = findMenuNodeById(nodes, mapping);
        const menuTitle = menuNode?.label?.zh || menuNode?.label?.en || menuNode?.title?.zh || menuNode?.title?.en || mapping;
        let aiText = '';
        if (draft?.ai?.sql_mode_enabled) {
          await sendMenuResponse(
            config.botToken,
            callbackMessage.chat.id,
            `<b>${escapeTelegramHtml(menuTitle)}</b>\n${escapeTelegramHtml('处理中，请稍候...')}`,
            [],
            { backId, currentId: backId, editMessageId: messageId }
          );
          try {
            aiText = await buildAiSummaryFromSql(draft, mapping, menuTitle, menuNode);
          } catch (error) {
            logger.warn('AI SQL 模式失败', { error: error.message, mapping });
          }
        }
        if (aiText) {
          await sendMenuResponse(
            config.botToken,
            callbackMessage.chat.id,
            `<b>${escapeTelegramHtml(menuTitle)}</b>\n${escapeTelegramHtml(aiText)}`,
            [],
            { backId, currentId: backId, editMessageId: messageId }
          );
        } else {
          await sendMenuResponse(
            config.botToken,
            callbackMessage.chat.id,
            draft?.ai?.sql_mode_enabled
              ? `${escapeTelegramHtml('AI 未返回结果，请检查配置或稍后再试。')}`
              : `${escapeTelegramHtml('AI SQL 模式未启用，请在管理端开启。')}`,
            [],
            { backId, currentId: backId, editMessageId: messageId }
          );
        }
        return res.json({ success: true });
      }
      if (parsed.type === 'action') {
        const mapping = parsed.value;
        const backId = parsed.extra.p || 'root';
        const menuNode = findMenuNodeById(nodes, mapping);
        const menuTitle = menuNode?.label?.zh || menuNode?.label?.en || menuNode?.title?.zh || menuNode?.title?.en || mapping;
        let aiText = '';
        if (draft?.ai?.sql_mode_enabled) {
          await sendMenuResponse(
            config.botToken,
            callbackMessage.chat.id,
            `<b>${escapeTelegramHtml(menuTitle)}</b>\n${escapeTelegramHtml('处理中，请稍候...')}`,
            [],
            { backId, currentId: backId, editMessageId: messageId }
          );
          try {
            aiText = await buildAiSummaryFromSql(draft, mapping, menuTitle, menuNode);
          } catch (error) {
            logger.warn('AI SQL 模式失败', { error: error.message, mapping });
          }
        }
        if (aiText) {
          await sendMenuResponse(
            config.botToken,
            callbackMessage.chat.id,
            `<b>${escapeTelegramHtml(menuTitle)}</b>\n${escapeTelegramHtml(aiText)}`,
            [],
            { backId, currentId: backId, editMessageId: messageId }
          );
          return res.json({ success: true });
        }
        await sendMenuResponse(
          config.botToken,
          callbackMessage.chat.id,
          draft?.ai?.sql_mode_enabled
            ? `${escapeTelegramHtml('AI 未返回结果，请检查配置或稍后再试。')}`
            : `${escapeTelegramHtml('AI SQL 模式未启用，请在管理端开启。')}`,
          [],
          { backId, currentId: backId, editMessageId: messageId }
        );
        return res.json({ success: true });
      }
      {
        const context = buildMenuMessageContext(nodes, 'root', root.children || [], 1);
        await sendMenuResponse(
          config.botToken,
          callbackMessage.chat.id,
          context.text,
          context.items,
          { backId: 'root', currentId: 'root', editMessageId: messageId, page: context.page, totalPages: context.totalPages }
        );
      }
      return res.json({ success: true });
    }

    if (!message || !message.text) {
      return res.json({ success: true, ignored: true });
    }

    if (!isAuthorizedMessage(message, authConfig)) {
      const reply = pickUnauthorizedReply(authConfig);
      await sendTelegramMessage(
        config.botToken,
        message.chat.id,
        escapeTelegramHtml(reply),
        { parseMode: 'HTML' }
      );
      return res.json({ success: true, unauthorized: true });
    }

    const command = normalizeCommand(message.text);
    if (!command) {
      return res.json({ success: true, ignored: true });
    }

    if (command === '/start') {
      const welcomeText = await buildBotWelcomeMessage(draft);
      const context = buildMenuMessageContext(nodes, 'root', root.children || [], 1);
      const text = `${welcomeText}\n\n${context.text}`;
      await sendMenuResponse(config.botToken, message.chat.id, text, context.items, { backId: 'root', currentId: 'root', page: context.page, totalPages: context.totalPages });
      return res.json({ success: true });
    }

    if (command === '/menu') {
      const context = buildMenuMessageContext(nodes, 'root', root.children || [], 1);
      await sendMenuResponse(config.botToken, message.chat.id, context.text, context.items, { backId: 'root', currentId: 'root', page: context.page, totalPages: context.totalPages });
      return res.json({ success: true });
    }

    const responseText = await handleCommand(command, draft);
    if (!responseText) {
      return res.json({ success: true, ignored: true });
    }

    await sendTelegramMessage(
      config.botToken,
      message.chat.id,
      escapeTelegramHtml(responseText),
      { parseMode: 'HTML' }
    );

    return res.json({ success: true });
  } catch (error) {
    logger.error('Telegram bot webhook处理失败', { error: error.message });
    return res.status(500).json({ success: false, message: 'Webhook error' });
  }
});

module.exports = router;
