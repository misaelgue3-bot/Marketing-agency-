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
const stripePay = require('./lib/stripe');

const app = express();
const PORT = process.env.PORT || 3000;

/* ============================================================
 * Stripe webhook — registered before the JSON parser because
 * signature verification needs the raw request body.
 * ============================================================ */

app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  if (!stripePay.webhookReady()) return res.status(503).send('STRIPE_WEBHOOK_SECRET is not configured');

  const event = stripePay.verifyWebhook(req.body.toString('utf8'), req.headers['stripe-signature']);
  if (!event) return res.status(400).send('Invalid signature');

  try {
    handleStripeEvent(event);
  } catch (err) {
    console.error('[stripe] webhook handler error:', err.message);
  }
  res.json({ received: true });
});

function findClientByStripe(customerId, email) {
  return (
    store.db.clients.find((c) => c.stripeCustomerId && c.stripeCustomerId === customerId) ||
    (email ? store.db.clients.find((c) => c.email && c.email.toLowerCase() === String(email).toLowerCase()) : null)
  );
}

function handleStripeEvent(event) {
  const obj = event.data && event.data.object;
  if (!obj) return;

  // First payment: subscription activated from the checkout page
  if (event.type === 'checkout.session.completed' && obj.mode === 'subscription') {
    const md = obj.metadata || {};
    const email = (obj.customer_details && obj.customer_details.email) || obj.customer_email || '';
    const amount = (obj.amount_total || 0) / 100;

    let client = findClientByStripe(obj.customer, email);
    if (!client) {
      client = store.addClient({
        name: md.name || (obj.customer_details && obj.customer_details.name) || 'Cliente Stripe',
        business: md.business || '',
        email,
        phone: md.phone || '',
        plan: md.plan || 'Inicial',
        monthlyFee: amount,
        status: 'active',
      });
    } else {
      store.updateClient(client.id, { plan: md.plan || client.plan, monthlyFee: amount, status: 'active' });
    }
    client.stripeCustomerId = obj.customer;

    // The lead that filled the questionnaire is now a paying client
    if (md.leadId) {
      const lead = store.db.leads.find((l) => l.id === md.leadId);
      if (lead) lead.status = 'converted';
    }
    store.persist();

    store.addPayment({ clientId: client.id, amount, method: 'stripe', note: `Primer pago — plan ${client.plan} activado (Stripe)` });
    const who = client.business || client.name;
    telegram.notifyOwner(`🎉 ¡Pago recibido! ${who} activó el plan ${client.plan} — $${amount}/mes.\nYa aparece en /admin → Clients y Payments.`).catch(() => {});
    if (mailer.available() && process.env.NOTIFY_EMAIL) {
      mailer.send({
        to: process.env.NOTIFY_EMAIL,
        subject: `🎉 Pago recibido: ${who} — plan ${client.plan} ($${amount}/mes)`,
        text: `${client.name} (${email}) activó el plan ${client.plan} por $${amount}/mes vía Stripe.\n\nYa está registrado como cliente activo y el pago quedó anotado.`,
      }).catch((err) => console.error('[stripe] notify email failed:', err.message));
    }
    console.log(`[stripe] subscription started: ${who} — $${amount}/mes`);
    return;
  }

  // One-time payment: a website project (separate from the marketing plans)
  if (event.type === 'checkout.session.completed' && obj.mode === 'payment') {
    const md = obj.metadata || {};
    const email = (obj.customer_details && obj.customer_details.email) || obj.customer_email || '';
    const amount = (obj.amount_total || 0) / 100;
    const planLabel = md.plan === 'WebPro' || md.plan === 'WebsitePro' ? 'Sitio web completo' : 'Página web';

    let client = findClientByStripe(obj.customer, email);
    if (!client) {
      client = store.addClient({
        name: md.name || (obj.customer_details && obj.customer_details.name) || 'Cliente Stripe',
        business: md.business || '',
        email,
        phone: md.phone || '',
        plan: planLabel,
        monthlyFee: 0,
        status: 'active',
        notes: `Proyecto web pagado ($${amount}). Hosting mensual aparte pendiente de configurar.`,
      });
    }
    if (obj.customer) { client.stripeCustomerId = obj.customer; }
    if (md.leadId) {
      const lead = store.db.leads.find((l) => l.id === md.leadId);
      if (lead) lead.status = 'converted';
    }
    store.persist();

    store.addPayment({ clientId: client.id, amount, method: 'stripe', note: `${planLabel} — pago único (Stripe)` });
    const who = client.business || client.name;
    telegram.notifyOwner(`🎉 ¡Proyecto web pagado! ${who} — ${planLabel}, $${amount} (pago único).\nRecuerda: el hosting ($${store.db.settings.priceHosting || 15}/mes) se cobra aparte.`).catch(() => {});
    console.log(`[stripe] one-time web project paid: ${who} — $${amount}`);
    return;
  }

  // Monthly renewals (the first invoice is covered by checkout.session.completed)
  if (event.type === 'invoice.paid' && obj.billing_reason === 'subscription_cycle') {
    const amount = (obj.amount_paid || 0) / 100;
    const client = findClientByStripe(obj.customer, obj.customer_email);
    if (!client) {
      console.error(`[stripe] renewal for unknown customer ${obj.customer}`);
      return;
    }
    store.addPayment({ clientId: client.id, amount, method: 'stripe', note: 'Renovación mensual (Stripe)' });
    telegram.notifyOwner(`💵 Renovación cobrada: ${client.business || client.name} — $${amount}.`).catch(() => {});
    return;
  }

  if (event.type === 'invoice.payment_failed') {
    const client = findClientByStripe(obj.customer, obj.customer_email);
    const who = client ? client.business || client.name : obj.customer_email || obj.customer;
    telegram.notifyOwner(`⚠️ Pago fallido de ${who}. Stripe reintentará automáticamente — avísale a tu cliente por si cambió de tarjeta.`).catch(() => {});
  }
}

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
    .replaceAll('{{TELEGRAM}}', s.telegram)
    .replaceAll('{{EMAIL}}', s.email)
    .replaceAll('{{PRICE_1}}', s.price1)
    .replaceAll('{{PRICE_2}}', s.price2)
    .replaceAll('{{PRICE_3}}', s.price3)
    .replaceAll('{{PRICE_WEB1}}', s.priceWeb1 || 499)
    .replaceAll('{{PRICE_WEB2}}', s.priceWeb2 || 899)
    .replaceAll('{{PRICE_HOST}}', s.priceHosting || 15)
    .replaceAll('{{STRIPE_ON}}', stripePay.available() ? '1' : '0');
}

app.get(['/', '/index.html'], (req, res) => res.type('html').send(renderPage('index.html')));
app.get('/en.html', (req, res) => res.type('html').send(renderPage('en.html')));
app.get('/sofia-app.html', (req, res) => res.type('html').send(renderPage('sofia-app.html')));
app.get('/checkout.html', (req, res) => res.type('html').send(renderPage('checkout.html')));
app.get('/checkout-en.html', (req, res) => res.type('html').send(renderPage('checkout-en.html')));

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
  // Telegram alert too, so no lead is ever lost silently
  telegram
    .notifyOwner(`📥 Nuevo lead del formulario web: ${lead.name}${lead.business ? ' — ' + lead.business : ''}\nPlan: ${lead.plan || '—'} · ${lead.email}${lead.phone ? ' · ' + lead.phone : ''}\n"${lead.message.slice(0, 200)}"`)
    .catch(() => {});
  // Sofía answers the lead automatically when AUTO_LEAD_REPLY=true
  automations.replyToLead(lead, (m) => console.log(`[auto-reply] ${m}`)).catch(() => {});
  res.json({ ok: true });
});

/* ============================================================
 * Quick brief — the 3-tap wizard on the landing page.
 * One contact field (phone or email), so no email requirement.
 * ============================================================ */

app.post('/api/brief', (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
  if (rateLimited(String(ip))) {
    return res.status(429).json({ ok: false, error: 'Too many submissions. Please try again later.' });
  }

  const b = req.body || {};
  if (b.website) return res.json({ ok: true }); // honeypot

  const clean = (v, max) => String(v || '').trim().slice(0, max);
  const name = clean(b.name, 100);
  const contact = clean(b.contact, 150);
  if (name.length < 2 || contact.length < 5) {
    return res.status(400).json({ ok: false, error: 'Please enter your name and a way to contact you.' });
  }

  const isEmail = EMAIL_RE.test(contact);
  const lead = {
    id: crypto.randomUUID(),
    name,
    email: isEmail ? contact : '',
    phone: isEmail ? '' : contact,
    business: clean(b.biz, 120),
    plan: '',
    budget: '',
    message: `Brief rápido (3 toques)\nTipo de negocio: ${clean(b.biz, 120) || '—'}\nNecesita: ${clean(b.need, 120) || '—'}`,
    status: 'new',
    source: 'quick-brief',
    receivedAt: new Date().toISOString(),
  };

  try {
    store.addLead(lead);
  } catch (err) {
    console.error('Failed to save brief lead:', err);
    return res.status(500).json({ ok: false, error: 'Something went wrong. Please email us directly.' });
  }

  sendNotification(lead);
  telegram
    .notifyOwner(`📥 Brief rápido: ${lead.name}${lead.business ? ' — ' + lead.business : ''}\nNecesita: ${clean(b.need, 120) || '—'}\nContacto: ${contact}`)
    .catch(() => {});
  if (lead.email) automations.replyToLead(lead, (m) => console.log(`[auto-reply] ${m}`)).catch(() => {});
  res.json({ ok: true });
});

/* ============================================================
 * Checkout / onboarding — plan buttons lead here. Collects the
 * business questionnaire and files it as a high-intent lead.
 * ============================================================ */

app.post('/api/checkout', (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
  if (rateLimited(String(ip))) {
    return res.status(429).json({ ok: false, error: 'Too many submissions. Please try again later.' });
  }

  const b = req.body || {};

  // Honeypot: hidden field humans never fill
  if (b.website) return res.json({ ok: true });

  const errors = [];
  if (!b.business || String(b.business).trim().length < 2) errors.push('Please enter your business name.');
  if (!b.name || String(b.name).trim().length < 2) errors.push('Please enter your name.');
  if (!b.email || !EMAIL_RE.test(String(b.email))) errors.push('Please enter a valid email address.');
  if (errors.length) return res.status(400).json({ ok: false, error: errors.join(' ') });

  const clean = (v, max) => String(v || '').trim().slice(0, max);
  const row = (label, v, max = 200) => (v ? `${label}: ${clean(v, max)}\n` : '');
  const message =
    '📋 Solicitud de plan (checkout)\n\n' +
    row('Tipo de negocio', b.type) +
    row('Ciudad/zona', b.city) +
    row('Tiempo con el negocio', b.years) +
    row('Página web', b.hasWebsite) +
    row('Google Business', b.hasGoogle) +
    row('Redes sociales', b.social) +
    row('Logo y marca', b.hasBrand) +
    row('Meta principal', b.goal) +
    row('Contacto preferido', b.contactPref) +
    row('Idioma', b.langPref) +
    row('Notas', b.notes, 1000);

  const lead = {
    id: crypto.randomUUID(),
    name: clean(b.name, 100),
    email: clean(b.email, 150),
    phone: clean(b.phone, 40),
    business: clean(b.business, 120),
    plan: clean(b.plan, 40),
    budget: '',
    message: message.trim(),
    status: 'new',
    source: 'checkout',
    receivedAt: new Date().toISOString(),
  };

  try {
    store.addLead(lead);
  } catch (err) {
    console.error('Failed to save checkout lead:', err);
    return res.status(500).json({ ok: false, error: 'Something went wrong. Please email us directly.' });
  }

  sendNotification(lead);
  telegram
    .notifyOwner(`🛒 ¡Solicitud de plan ${lead.plan}!\n${lead.business} — ${lead.name} (${lead.phone || lead.email})\nRespuestas completas en /admin → Leads.`)
    .catch(() => {});
  automations.replyToLead(lead, (m) => console.log(`[auto-reply] ${m}`)).catch(() => {});
  res.json({ ok: true, leadId: lead.id });
});

/* ============================================================
 * Stripe payment — opens a hosted checkout for a monthly plan.
 * Amounts always come from the server's Settings, never the client.
 * ============================================================ */

app.post('/api/pay', async (req, res) => {
  if (!stripePay.available()) {
    return res.status(503).json({ error: 'Los pagos en línea aún no están activados. / Online payments are not enabled yet.' });
  }

  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
  if (rateLimited(String(ip))) {
    return res.status(429).json({ error: 'Too many attempts. Please try again later.' });
  }

  const b = req.body || {};
  const s = store.db.settings;
  const PLAN_AMOUNTS = {
    Inicial: s.price1, Starter: s.price1,
    Crecimiento: s.price2, Growth: s.price2,
    Pro: s.price3,
  };
  // One-time website projects — separate from the monthly marketing plans
  const WEB_AMOUNTS = {
    Web: { amount: s.priceWeb1 || 499, product: 'Página web (una página) — Your LocalLift' },
    Website: { amount: s.priceWeb1 || 499, product: 'One-page website — Your LocalLift' },
    WebPro: { amount: s.priceWeb2 || 899, product: 'Sitio web completo — Your LocalLift' },
    WebsitePro: { amount: s.priceWeb2 || 899, product: 'Full website — Your LocalLift' },
  };
  const plan = String(b.plan || '');
  const amount = PLAN_AMOUNTS[plan];
  const webTier = WEB_AMOUNTS[plan];
  if (!amount && !webTier) return res.status(400).json({ error: 'Unknown plan' });

  const clean = (v, max) => String(v || '').trim().slice(0, max);
  const base = (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
  const page = b.lang === 'en' ? 'checkout-en.html' : 'checkout.html';
  const metadata = {
    plan,
    name: clean(b.name, 100),
    business: clean(b.business, 120),
    phone: clean(b.phone, 40),
    leadId: clean(b.leadId, 40),
  };
  const urls = {
    successUrl: `${base}/${page}?paid=1&plan=${encodeURIComponent(plan)}`,
    cancelUrl: `${base}/${page}?plan=${encodeURIComponent(plan)}&cancelled=1`,
  };
  const customerEmail = EMAIL_RE.test(String(b.email || '')) ? clean(b.email, 150) : undefined;

  try {
    const session = webTier
      ? await stripePay.createOneTimeCheckout({ productName: webTier.product, amountUsd: webTier.amount, customerEmail, metadata, ...urls })
      : await stripePay.createSubscriptionCheckout({ plan, amountUsd: amount, customerEmail, metadata, ...urls });
    res.json({ url: session.url });
  } catch (err) {
    console.error('[stripe] checkout session failed:', err.message);
    res.status(502).json({
      error: 'No pudimos abrir el pago en este momento. Intenta de nuevo en un minuto. / We could not open the payment right now. Please try again in a minute.',
    });
  }
});

/* ============================================================
 * Sofía Mini App (Telegram Web App) chat endpoint
 * ============================================================ */

const miniappHits = new Map(); // telegram user id -> timestamps

app.post('/api/miniapp/chat', async (req, res) => {
  const { initData, message, history } = req.body || {};

  const session = telegram.verifyInitData(initData);
  if (!session.ok || !session.user?.id) {
    return res.status(401).json({ error: 'Abre esta app desde nuestro bot de Telegram. / Open this app from our Telegram bot.' });
  }

  // 20 messages per 10 minutes per user
  const uid = String(session.user.id);
  const now = Date.now();
  const recent = (miniappHits.get(uid) || []).filter((t) => now - t < 10 * 60 * 1000);
  if (recent.length >= 20) {
    return res.status(429).json({ error: 'Muchos mensajes muy rápido — dame un minutito. / Too many messages — give me a minute.' });
  }
  recent.push(now);
  miniappHits.set(uid, recent);

  const text = String(message || '').trim().slice(0, 1000);
  if (!text) return res.status(400).json({ error: 'Empty message' });

  // First contact becomes a lead (same identity as the bot chat — no duplicates)
  let lead = store.db.leads.find((l) => l.telegramChatId === uid);
  if (!lead) {
    const name = [session.user.first_name, session.user.last_name].filter(Boolean).join(' ') || 'Telegram user';
    lead = store.addLead({
      id: crypto.randomUUID(),
      name,
      email: '',
      phone: '',
      business: session.user.username ? `@${session.user.username} (Telegram)` : '(Telegram app)',
      plan: '',
      budget: '',
      message: text,
      status: 'new',
      source: 'telegram-app',
      telegramChatId: uid,
      receivedAt: new Date().toISOString(),
    });
    telegram.notifyOwner(`📥 Nuevo lead en la app de Sofía: ${lead.name}\n"${text.slice(0, 200)}"\nMíralo en /admin → Leads.`).catch(() => {});
  }

  const cleanHistory = (Array.isArray(history) ? history : [])
    .slice(-10)
    .filter((m) => m && (m.from === 'customer' || m.from === 'sofia') && typeof m.text === 'string')
    .map((m) => ({ from: m.from, text: m.text.slice(0, 1000) }));
  if (!cleanHistory.length || cleanHistory[cleanHistory.length - 1].text !== text) {
    cleanHistory.push({ from: 'customer', text });
  }

  let reply = telegram.CANNED_REPLY;
  if (agents.available()) {
    try {
      reply = await agents.chatReply(cleanHistory, {
        customerName: session.user.first_name || '',
        prices: store.db.settings,
      });
    } catch (err) {
      console.error('[miniapp] Sofía reply failed:', err.message);
    }
  }

  store.addOutbox({
    type: 'sofia_app_chat',
    clientId: null,
    to: lead.name,
    subject: `Mini app: ${text.slice(0, 60)}`,
    message: `Customer: ${text}\n\nSofía: ${reply}`,
    status: agents.available() ? 'sent' : 'draft',
  });

  res.json({ reply });
});

/* ============================================================
 * Sofía web chat — same app, no Telegram account needed.
 * Identity is a browser-generated session id, so it is rate
 * limited by both session and IP.
 * ============================================================ */

const webchatHits = new Map(); // "s:<sessionId>" / "ip:<ip>" -> timestamps

function webchatLimited(key) {
  const now = Date.now();
  const recent = (webchatHits.get(key) || []).filter((t) => now - t < 10 * 60 * 1000);
  if (recent.length >= 20) return true;
  recent.push(now);
  webchatHits.set(key, recent);
  if (webchatHits.size > 2000) {
    // Drop stale entries so the map can't grow forever
    for (const [k, times] of webchatHits) {
      if (!times.length || now - times[times.length - 1] > 10 * 60 * 1000) webchatHits.delete(k);
    }
  }
  return false;
}

app.post('/api/webchat', async (req, res) => {
  const { sessionId, message, history, lang } = req.body || {};

  const sid = String(sessionId || '');
  if (!/^[\w-]{8,64}$/.test(sid)) {
    return res.status(400).json({ error: 'Recarga la página e intenta de nuevo. / Reload the page and try again.' });
  }

  if (webchatLimited(`s:${sid}`) || webchatLimited(`ip:${req.ip || 'unknown'}`)) {
    return res.status(429).json({ error: 'Muchos mensajes muy rápido — dame un minutito. / Too many messages — give me a minute.' });
  }

  const text = String(message || '').trim().slice(0, 1000);
  if (!text) return res.status(400).json({ error: 'Empty message' });

  // First contact becomes a lead, deduped by browser session
  let lead = store.db.leads.find((l) => l.webChatId === sid);
  if (!lead) {
    lead = store.addLead({
      id: crypto.randomUUID(),
      name: lang === 'en' ? 'Web visitor' : 'Visitante web',
      email: '',
      phone: '',
      business: '(Web chat)',
      plan: '',
      budget: '',
      message: text,
      status: 'new',
      source: 'web-chat',
      webChatId: sid,
      receivedAt: new Date().toISOString(),
    });
    telegram.notifyOwner(`📥 Nuevo chat de Sofía en la web:\n"${text.slice(0, 200)}"\nMíralo en /admin → Leads.`).catch(() => {});
  }

  const cleanHistory = (Array.isArray(history) ? history : [])
    .slice(-10)
    .filter((m) => m && (m.from === 'customer' || m.from === 'sofia') && typeof m.text === 'string')
    .map((m) => ({ from: m.from, text: m.text.slice(0, 1000) }));
  if (!cleanHistory.length || cleanHistory[cleanHistory.length - 1].text !== text) {
    cleanHistory.push({ from: 'customer', text });
  }

  let reply = telegram.CANNED_REPLY;
  if (agents.available()) {
    try {
      reply = await agents.chatReply(cleanHistory, { customerName: '', prices: store.db.settings });
    } catch (err) {
      console.error('[webchat] Sofía reply failed:', err.message);
    }
  }

  store.addOutbox({
    type: 'sofia_web_chat',
    clientId: null,
    to: lead.name,
    subject: `Web chat: ${text.slice(0, 60)}`,
    message: `Customer: ${text}\n\nSofía: ${reply}`,
    status: agents.available() ? 'sent' : 'draft',
  });

  res.json({ reply });
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

// Internal marketing studio: the 2D animated ad spots (recordable to video)
app.get('/admin/animaciones', requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'admin-ui', 'animaciones.html'));
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

// ---- system health: the true, live state of every integration ----
admin.get('/health', (req, res) => {
  const checks = [
    {
      key: 'stripe', label: 'Cobros con tarjeta (Stripe)', critical: true,
      ok: stripePay.available(),
      onMsg: 'Puedes cobrar planes y proyectos web.',
      offMsg: 'Falta STRIPE_SECRET_KEY. Sin esto, el botón de pago no cobra.',
      how: 'Render → tu servicio → Environment → agrega STRIPE_SECRET_KEY con tu clave sk_live_… de stripe.com.',
    },
    {
      key: 'stripeWebhook', label: 'Pago → cliente automático (webhook)', critical: true,
      ok: stripePay.webhookReady(),
      onMsg: 'Cada pago crea el cliente y lo registra solo.',
      offMsg: 'Falta STRIPE_WEBHOOK_SECRET. Cobras, pero el cliente no se registra solo.',
      how: 'stripe.com → Developers → Webhooks → agrega endpoint https://yourlocallift.com/api/stripe/webhook (eventos checkout.session.completed, invoice.paid, invoice.payment_failed) → copia el Signing secret whsec_… a Render como STRIPE_WEBHOOK_SECRET.',
    },
    {
      key: 'ai', label: 'Sofía inteligente (IA)', critical: false,
      ok: agents.available(),
      onMsg: `Sofía responde sola con ${agents.providerLabel()}.`,
      offMsg: 'Sin clave de IA, Sofía solo da una respuesta fija y captura el contacto.',
      how: 'Render → Environment → agrega ANTHROPIC_API_KEY (de console.anthropic.com) o GROQ_API_KEY.',
    },
    {
      key: 'telegram', label: 'Bot de Telegram / avisos', critical: false,
      ok: telegram.available(),
      onMsg: 'Recibes cada lead y pago en tu Telegram al instante.',
      offMsg: 'Sin el token, no llegan los avisos por Telegram.',
      how: 'Habla con @BotFather en Telegram → crea el bot → copia el token a Render como TELEGRAM_BOT_TOKEN.',
    },
    {
      key: 'email', label: 'Avisos por correo', critical: false,
      ok: mailer.available() && Boolean(process.env.NOTIFY_EMAIL),
      onMsg: 'Recibes cada lead y pago por email.',
      offMsg: 'Opcional. Sin SMTP no llegan avisos por correo (los de Telegram sí).',
      how: 'Render → Environment → SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS y NOTIFY_EMAIL (tu correo).',
    },
  ];
  const criticalReady = checks.filter((c) => c.critical).every((c) => c.ok);
  res.json({ criticalReady, checks });
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

// ---- prospects (cold-call list) ----
admin.get('/prospects', (req, res) => res.json(store.db.prospects.slice().reverse()));

admin.post('/prospects', (req, res) => {
  const b = req.body || {};
  if (!b.business || String(b.business).trim().length < 2) {
    return res.status(400).json({ error: 'El nombre del negocio es obligatorio.' });
  }
  res.json(store.addProspect(b));
});

// Bulk import: one prospect per line — "Business | Phone | City | Category | Notes"
// (also accepts tab- or comma-separated columns pasted from Excel/CSV)
admin.post('/prospects/bulk', (req, res) => {
  const text = String((req.body || {}).text || '');
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 300);
  let added = 0;
  for (const line of lines) {
    const parts = line.includes('|') ? line.split('|') : line.includes('\t') ? line.split('\t') : line.split(',');
    const [business, phone, city, category, ...rest] = parts.map((p) => p.trim());
    if (!business || business.length < 3) continue;
    store.addProspect({ business, phone, city, category, notes: rest.join(', ') });
    added++;
  }
  res.json({ added });
});

admin.patch('/prospects/:id', (req, res) => {
  const p = store.updateProspect(req.params.id, req.body || {});
  if (!p) return res.status(404).json({ error: 'Prospect not found' });
  res.json(p);
});

// An interested prospect becomes a lead in the normal pipeline
admin.post('/prospects/:id/convert', (req, res) => {
  const p = store.db.prospects.find((x) => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: 'Prospect not found' });
  const lead = store.addLead({
    id: crypto.randomUUID(),
    name: p.contact || p.business,
    email: '',
    phone: p.phone,
    business: p.business,
    plan: '',
    budget: '',
    message: `Prospecto de llamada en frío (${p.category || 'negocio local'}${p.city ? ', ' + p.city : ''}).\nWeb: ${p.website} · Google: ${p.google}\nNotas: ${p.notes || '—'}`,
    status: 'contacted',
    source: 'cold-call',
    receivedAt: new Date().toISOString(),
  });
  store.updateProspect(p.id, { status: 'convertido' });
  res.json(lead);
});

admin.delete('/prospects/:id', (req, res) => {
  res.json({ ok: store.deleteProspect(req.params.id) });
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

// Toggle one step of a client's onboarding protocol
admin.post('/clients/:id/tasks/:taskId/toggle', (req, res) => {
  const client = store.toggleClientTask(req.params.id, req.params.taskId);
  if (!client) return res.status(404).json({ error: 'Client or task not found' });
  res.json(client);
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
