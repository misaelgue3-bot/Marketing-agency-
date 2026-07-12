/**
 * Telegram bot — Sofía answers customers live, 24/7.
 *
 * Setup (2 minutes):
 *   1. In Telegram, message @BotFather → /newbot → pick a name and username.
 *   2. Put the token it gives you in .env as TELEGRAM_BOT_TOKEN.
 *   3. Optional: message your new bot once, then set TELEGRAM_OWNER_CHAT_ID
 *      to your own chat id (the bot logs it on your first message) to get
 *      instant lead alerts in your Telegram.
 *
 * What it does:
 *   - Anyone who messages the bot gets answered by Sofía (in their language,
 *     using your real plan prices from Settings).
 *   - The first message from a new person is saved as a lead in the admin.
 *   - Every conversation is logged to the Outbox for supervision.
 *   - If the AI provider is not configured, a friendly canned reply is sent
 *     so no customer is ever left on read.
 *
 * Uses the official Bot API over long polling — no webhook, no public URL,
 * no extra dependencies required.
 */

const store = require('./db');
const agents = require('./agents');

const API = () => `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

const conversations = new Map(); // chatId -> [{from, text}] (last 10, in memory)
let running = false;

function available() {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN);
}

async function api(method, payload) {
  const res = await fetch(`${API()}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.ok) throw new Error(`Telegram ${method} failed: ${data.description || res.status}`);
  return data.result;
}

const sendMessage = (chatId, text) => api('sendMessage', { chat_id: chatId, text });

const CANNED_REPLY =
  '¡Gracias por escribirnos! Un miembro del equipo te responde muy pronto. / ' +
  'Thanks for reaching out! A team member will reply to you shortly.';

const WELCOME =
  '¡Hola! 👋 Soy Sofía, de Your LocalLift. Cuéntame de tu negocio y te digo cómo podemos ayudarte a conseguir más clientes. / ' +
  "Hi! I'm Sofía from Your LocalLift. Tell me about your business and I'll explain how we can help you get more customers.";

function rememberLead(msg) {
  const chatId = String(msg.chat.id);
  const existing = store.db.leads.find((l) => l.telegramChatId === chatId);
  if (existing) return { lead: existing, isNew: false };

  const name = [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(' ') || 'Telegram user';
  const lead = store.addLead({
    id: require('crypto').randomUUID(),
    name,
    email: '',
    phone: '',
    business: msg.from?.username ? `@${msg.from.username} (Telegram)` : '(Telegram)',
    plan: '',
    budget: '',
    message: msg.text || '',
    status: 'new',
    source: 'telegram',
    telegramChatId: chatId,
    receivedAt: new Date().toISOString(),
  });
  return { lead, isNew: true };
}

async function notifyOwner(text) {
  const owner = process.env.TELEGRAM_OWNER_CHAT_ID;
  if (!owner) return;
  await sendMessage(owner, text).catch((err) => console.error('[telegram] owner notify failed:', err.message));
}

async function handleMessage(msg, send = sendMessage) {
  const chatId = String(msg.chat.id);
  const text = (msg.text || '').trim();
  if (!text) return;

  // Help the owner discover their own chat id for TELEGRAM_OWNER_CHAT_ID
  if (text === '/id') {
    await send(chatId, `Your chat id: ${chatId}`);
    return;
  }

  if (text === '/start') {
    await send(chatId, WELCOME);
    return;
  }

  // Owner's own chat never gets treated as a lead
  if (chatId === String(process.env.TELEGRAM_OWNER_CHAT_ID || '')) return;

  const { lead, isNew } = rememberLead(msg);
  if (isNew) {
    console.log(`[telegram] new lead: ${lead.name}`);
    notifyOwner(`📥 Nuevo lead por Telegram: ${lead.name}\n"${text.slice(0, 200)}"\nMíralo en /admin → Leads.`);
  }

  const history = conversations.get(chatId) || [];
  history.push({ from: 'customer', text });

  let reply = CANNED_REPLY;
  if (agents.available()) {
    try {
      reply = await agents.chatReply(history, {
        customerName: msg.from?.first_name || '',
        prices: store.db.settings,
      });
    } catch (err) {
      console.error('[telegram] Sofía reply failed:', err.message);
    }
  }

  history.push({ from: 'sofia', text: reply });
  conversations.set(chatId, history.slice(-10));

  await send(chatId, reply);

  store.addOutbox({
    type: 'telegram_chat',
    clientId: null,
    to: lead.name,
    subject: `Telegram: ${text.slice(0, 60)}`,
    message: `Customer: ${text}\n\nSofía: ${reply}`,
    status: agents.available() ? 'sent' : 'draft',
  });
}

async function poll() {
  let offset = 0;
  console.log('[telegram] Sofía is online — polling for messages');
  while (running) {
    try {
      const updates = await api('getUpdates', { offset, timeout: 30, allowed_updates: ['message'] });
      for (const update of updates) {
        offset = update.update_id + 1;
        if (update.message) {
          handleMessage(update.message).catch((err) => console.error('[telegram] handler error:', err.message));
        }
      }
    } catch (err) {
      console.error('[telegram] poll error:', err.message);
      await new Promise((r) => setTimeout(r, 10000)); // back off, then retry
    }
  }
}

function start() {
  if (!available()) return false;
  if (running) return true;
  running = true;
  poll();
  return true;
}

function stop() {
  running = false;
}

module.exports = { start, stop, available, handleMessage, CANNED_REPLY };
