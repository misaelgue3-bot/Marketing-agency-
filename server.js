/**
 * LocalLift Marketing — site server + agency backend
 *
 * Public:
 *   - Static landing site (Spanish at /, English at /en.html)
 *   - POST /api/contact — lead capture (validation, honeypot, rate limit)
 *
 * Admin (basic auth, ADMIN_PASSWORD required):
 *   - GET  /admin                  — dashboard UI (clients, money, leads, campaigns)
 *   - /api/admin/*                 — JSON API backing the dashboard
 *
 * AI automation (ANTHROPIC_API_KEY required):
 *   - POST /api/admin/clients/:id/campaigns — agents brainstorm + build a campaign
 *   - AUTO_CAMPAIGNS=true — every active client gets a fresh campaign each month,
 *     generated automatically with no human input
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const store = require('./lib/db');
const agents = require('./lib/agents');
const mailer = require('./lib/mailer');
const automations = require('./lib/automations');
const telegram = require('./lib/telegram');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '64kb' }));

/* ============================================================
 * Page rendering — the landing pages are templates: {{WHATSAPP}},
 * {{EMAIL}}, {{PRICE_1..3}} are filled from the editable settings
 * in the admin, so content changes apply instantly without a deploy.
 * ============================================================ */

function renderPage(file) {
  const s = store.db.settings;
  return fs
    .readFileSync(path.join(__dirname, 'public', file), 'utf8')
    .replaceAll('{{WHATSAPP}}', s.whatsapp)
    .replaceAll('{{EMAIL}}', s.email)
    .replaceAll('{{PRICE_1}}', s.price1)
    .replaceAll('{{PRICE_2}}', s.price2)
    .replaceAll('{{PRICE_3}}', s.price3);
}

app.get(['/', '/index.html'], (req, res) => res.type('html').send(renderPage('index.html')));
app.get('/en.html', (req, res) => res.type('html').send(renderPage('en.html')));

app.use(express.static(path.join(__dirname, 'public')));

/* ============================================================
 * Email notifications (optional)
 * ============================================================ */

function sendNotification(lead) {
  if (!mailer.available() || !process.env.NOTIFY_EMAIL) return;
  mailer
    .send({
      to: process.env.NOTIFY_EMAIL,
      subject: `New lead: ${lead.name} (${lead.business || 'no business name'})`,
      text: [
        `Name:     ${lead.name}`,
        `Email:    ${lead.email}`,
        `Phone:    ${lead.phone || '-'}`,
        `Business: ${lead.business || '-'}`,
        `Plan:     ${lead.plan || '-'}`,
        `Budget:   ${lead.budget || '-'}`,
        '',
        'Message:',
        lead.message,
        '',
        `Received: ${lead.receivedAt}`,
      ].join('\n'),
    })
    .catch((err) => console.error('Email notification failed:', err.message));
}

/* ============================================================
 * Public contact endpoint
 * ============================================================ */

const submissions = new Map(); // ip -> timestamps
function rateLimited(ip) {
  const now = Date.now();
  const windowMs = 10 * 60 * 1000;
  const recent = (submissions.get(ip) || []).filter((t) => now - t < windowMs);
  submissions.set(ip, recent);
  if (recent.length >= 5) return true;
  recent.push(now);
  return false;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

app.post('/api/contact', (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';

  if (rateLimited(String(ip))) {
    return res.status(429).json({ ok: false, error: 'Too many submissions. Please try again later.' });
  }

  const { name, email, phone, business, plan, budget, message, website } = req.body || {};

  // Honeypot: hidden field humans never fill
  if (website) return res.json({ ok: true });

  const errors = [];
  if (!name || String(name).trim().length < 2) errors.push('Please enter your name.');
  if (!email || !EMAIL_RE.test(String(email))) errors.push('Please enter a valid email address.');
  if (!message || String(message).trim().length < 10) errors.push('Please tell us a bit about your business (10+ characters).');

  if (errors.length) return res.status(400).json({ ok: false, error: errors.join(' ') });

  const clean = (v, max) => String(v || '').trim().slice(0, max);
  const lead = {
    id: crypto.randomUUID(),
    name: clean(name, 100),
    email: clean(email, 150),
    phone: clean(phone, 40),
    business: clean(business, 120),
    plan: clean(plan, 40),
    budget: clean(budget, 40),
    message: clean(message, 2000),
    status: 'new', // new | contacted | converted | closed
    receivedAt: new Date().toISOString(),
  };

  try {
    store.addLead(lead);
  } catch (err) {
    console.error('Failed to save lead:', err);
    return res.status(500).json({ ok: false, error: 'Something went wrong. Please email us directly.' });
  }

  sendNotification(lead);
  // Sofía answers the lead automatically when AUTO_LEAD_REPLY=true
  automations.replyToLead(lead, (m) => console.log(`[auto-reply] ${m}`)).catch(() => {});
  res.json({ ok: true });
});

/* ============================================================
 * Admin auth
 * ============================================================ */

function requireAdmin(req, res, next) {
  const user = process.env.ADMIN_USER || 'admin';
  const pass = process.env.ADMIN_PASSWORD;

  if (!pass) {
    return res
      .status(503)
      .send('Admin is disabled. Set ADMIN_PASSWORD in your .env file to enable it.');
  }

  const header = req.headers.authorization || '';
  const [scheme, encoded] = header.split(' ');
  if (scheme === 'Basic' && encoded) {
    const [u, p] = Buffer.from(encoded, 'base64').toString().split(':');
    const ok =
      u && p &&
      u.length === user.length && p.length === pass.length &&
      crypto.timingSafeEqual(Buffer.from(u), Buffer.from(user)) &&
      crypto.timingSafeEqual(Buffer.from(p), Buffer.from(pass));
    if (ok) return next();
  }

  res.set('WWW-Authenticate', 'Basic realm="LocalLift Admin"');
  res.status(401).send('Authentication required.');
}

app.get('/admin', requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'admin-ui', 'index.html'));
});

/* ============================================================
 * Admin API
 * ============================================================ */

const admin = express.Router();
admin.use(requireAdmin);

// ---- overview / money progress ----
admin.get('/overview', (req, res) => {
  const { clients, payments, leads, campaigns } = store.db;
  const active = clients.filter((c) => c.status === 'active');
  const mrr = active.reduce((sum, c) => sum + (c.monthlyFee || 0), 0);
  const totalRevenue = payments.reduce((sum, p) => sum + p.amount, 0);

  // Revenue by month, last 6 months
  const months = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = d.toISOString().slice(0, 7);
    months.push({
      month: key,
      revenue: payments
        .filter((p) => (p.date || '').slice(0, 7) === key)
        .reduce((sum, p) => sum + p.amount, 0),
    });
  }

  res.json({
    mrr,
    totalRevenue,
    activeClients: active.length,
    totalClients: clients.length,
    newLeads: leads.filter((l) => l.status === 'new').length,
    totalLeads: leads.length,
    draftCampaigns: campaigns.filter((c) => c.status === 'draft').length,
    revenueByMonth: months,
    aiEnabled: agents.available(),
    aiProvider: agents.providerLabel(),
    imagesEnabled: agents.imagesAvailable(),
    autoCampaigns: process.env.AUTO_CAMPAIGNS === 'true',
    automations: automations.enabledFlags(),
    telegramEnabled: telegram.available(),
  });
});

// ---- leads ----
admin.get('/leads', (req, res) => res.json(store.db.leads.slice().reverse()));

admin.patch('/leads/:id', (req, res) => {
  const lead = store.db.leads.find((l) => l.id === req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  if (req.body.status) lead.status = String(req.body.status);
  store.persist();
  res.json(lead);
});

admin.post('/leads/:id/convert', (req, res) => {
  const lead = store.db.leads.find((l) => l.id === req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  const client = store.addClient({
    name: lead.name,
    business: lead.business,
    email: lead.email,
    phone: lead.phone,
    plan: req.body.plan || lead.plan || 'Inicial',
    monthlyFee: req.body.monthlyFee || 0,
    goals: lead.message,
  });
  lead.status = 'converted';
  store.persist();
  res.json(client);
});

admin.delete('/leads/:id', (req, res) => {
  res.json({ ok: store.deleteLead(req.params.id) });
});

// ---- clients ----
admin.get('/clients', (req, res) => {
  const clients = store.db.clients.map((c) => ({
    ...c,
    totalPaid: store.db.payments
      .filter((p) => p.clientId === c.id)
      .reduce((sum, p) => sum + p.amount, 0),
    campaigns: store.db.campaigns.filter((k) => k.clientId === c.id).length,
  }));
  res.json(clients.slice().reverse());
});

admin.post('/clients', (req, res) => res.json(store.addClient(req.body || {})));

admin.patch('/clients/:id', (req, res) => {
  const client = store.updateClient(req.params.id, req.body || {});
  if (!client) return res.status(404).json({ error: 'Client not found' });
  res.json(client);
});

admin.delete('/clients/:id', (req, res) => {
  res.json({ ok: store.deleteClient(req.params.id) });
});

// ---- payments ----
admin.get('/payments', (req, res) => {
  const byClient = new Map(store.db.clients.map((c) => [c.id, c]));
  res.json(
    store.db.payments
      .slice()
      .reverse()
      .map((p) => ({
        ...p,
        clientName: byClient.get(p.clientId)?.business || byClient.get(p.clientId)?.name || '(deleted client)',
      }))
  );
});

admin.post('/payments', (req, res) => {
  const { clientId, amount } = req.body || {};
  if (!clientId || !store.db.clients.some((c) => c.id === clientId)) {
    return res.status(400).json({ error: 'Valid clientId is required' });
  }
  if (!Number(amount)) return res.status(400).json({ error: 'Amount is required' });
  res.json(store.addPayment(req.body));
});

admin.delete('/payments/:id', (req, res) => {
  res.json({ ok: store.deletePayment(req.params.id) });
});

// ---- campaigns ----
admin.get('/campaigns', (req, res) => {
  const byClient = new Map(store.db.clients.map((c) => [c.id, c]));
  res.json(
    store.db.campaigns
      .slice()
      .reverse()
      .map((k) => ({
        ...k,
        clientName: byClient.get(k.clientId)?.business || byClient.get(k.clientId)?.name || '(deleted client)',
      }))
  );
});

admin.post('/clients/:id/campaigns', async (req, res) => {
  const client = store.db.clients.find((c) => c.id === req.params.id);
  if (!client) return res.status(404).json({ error: 'Client not found' });
  try {
    const campaign = await agents.generateCampaign(client, {
      month: req.body?.month,
      log: (msg) => console.log(`[campaign:${client.business || client.name}] ${msg}`),
    });
    store.addCampaign(campaign);
    res.json(campaign);
  } catch (err) {
    console.error('Campaign generation failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// Sofía (client relations) drafts a bilingual message for a client
admin.post('/clients/:id/message', async (req, res) => {
  const client = store.db.clients.find((c) => c.id === req.params.id);
  if (!client) return res.status(404).json({ error: 'Client not found' });
  try {
    const draft = await agents.draftClientMessage(client, {
      purpose: req.body?.purpose,
      context: req.body?.context,
    });
    res.json(draft);
  } catch (err) {
    console.error('Message drafting failed:', err);
    res.status(500).json({ error: err.message });
  }
});

admin.patch('/campaigns/:id', (req, res) => {
  const campaign = store.db.campaigns.find((c) => c.id === req.params.id);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  if (req.body.status) campaign.status = String(req.body.status);
  store.persist();
  res.json(campaign);
});

admin.delete('/campaigns/:id', (req, res) => {
  const i = store.db.campaigns.findIndex((c) => c.id === req.params.id);
  if (i === -1) return res.status(404).json({ error: 'Campaign not found' });
  store.db.campaigns.splice(i, 1);
  store.persist();
  res.json({ ok: true });
});

// ---- site settings (editable website content) ----
admin.get('/settings', (req, res) => res.json(store.db.settings));

admin.patch('/settings', (req, res) => {
  res.json(store.updateSettings(req.body || {}));
});

// ---- outbox (everything the automations drafted or sent) ----
admin.get('/outbox', (req, res) => {
  const byClient = new Map(store.db.clients.map((c) => [c.id, c]));
  res.json(
    store.db.outbox
      .slice()
      .reverse()
      .map((o) => ({
        ...o,
        clientName: o.clientId
          ? byClient.get(o.clientId)?.business || byClient.get(o.clientId)?.name || '(deleted client)'
          : '',
      }))
  );
});

app.use('/api/admin', admin);

/* ============================================================
 * Auto-campaign scheduler
 * When AUTO_CAMPAIGNS=true, checks daily whether each active client
 * has a campaign for the current month; if not, the agents create one.
 * ============================================================ */

let autoRunning = false;

async function autoCampaignSweep() {
  if (autoRunning || process.env.AUTO_CAMPAIGNS !== 'true' || !agents.available()) return;
  autoRunning = true;
  const month = new Date().toISOString().slice(0, 7);
  try {
    for (const client of store.db.clients.filter((c) => c.status === 'active')) {
      const has = store.db.campaigns.some((k) => k.clientId === client.id && k.month === month);
      if (has) continue;
      try {
        console.log(`[auto-campaigns] Generating ${month} campaign for ${client.business || client.name}...`);
        const campaign = await agents.generateCampaign(client, {
          month,
          log: (msg) => console.log(`[auto-campaigns:${client.business || client.name}] ${msg}`),
        });
        store.addCampaign(campaign);
        console.log(`[auto-campaigns] Done: "${campaign.plan.name}"`);
      } catch (err) {
        console.error(`[auto-campaigns] Failed for ${client.business || client.name}:`, err.message);
      }
    }
  } finally {
    autoRunning = false;
  }
}

setInterval(autoCampaignSweep, 6 * 60 * 60 * 1000); // check every 6 hours
setTimeout(autoCampaignSweep, 15 * 1000); // and shortly after boot

// Sofía's automations (check-ins, payment reminders, weekly digest) — hourly
setInterval(() => automations.runTick(), 60 * 60 * 1000);
setTimeout(() => automations.runTick(), 30 * 1000);

/* ============================================================ */

app.listen(PORT, () => {
  console.log(`LocalLift running at http://localhost:${PORT}`);
  if (!process.env.ADMIN_PASSWORD) console.log('Tip: set ADMIN_PASSWORD in .env to enable the /admin dashboard.');
  if (!agents.available()) console.log('Tip: set ANTHROPIC_API_KEY (Claude) or GROQ_API_KEY (Groq) in .env to enable the AI team.');
  else console.log(`AI team provider: ${agents.providerLabel()}`);
  if (process.env.AUTO_CAMPAIGNS === 'true') console.log('Auto-campaigns: ON — monthly campaigns generate themselves.');
  if (telegram.start()) console.log('Telegram: Sofía answers the bot chat live.');
  else console.log('Tip: set TELEGRAM_BOT_TOKEN in .env and Sofía will answer a Telegram bot 24/7.');
});
