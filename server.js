/**
 * LocalLift Marketing — site server + lead capture backend
 *
 * - Serves the static landing site from /public
 * - POST /api/contact  -> validates + stores leads in data/leads.json,
 *                         optionally emails you (set SMTP_* in .env)
 * - GET  /admin        -> password-protected lead dashboard
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let nodemailer = null;
try { nodemailer = require('nodemailer'); } catch { /* email disabled */ }

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const LEADS_FILE = path.join(DATA_DIR, 'leads.json');

app.use(express.json({ limit: '32kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---------- lead storage ----------

function readLeads() {
  try {
    return JSON.parse(fs.readFileSync(LEADS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function saveLead(lead) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const leads = readLeads();
  leads.push(lead);
  fs.writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2));
}

// ---------- email notifications (optional) ----------

function sendNotification(lead) {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, NOTIFY_EMAIL } = process.env;
  if (!nodemailer || !SMTP_HOST || !SMTP_USER || !SMTP_PASS || !NOTIFY_EMAIL) return;

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  transporter
    .sendMail({
      from: `"LocalLift Website" <${SMTP_USER}>`,
      to: NOTIFY_EMAIL,
      subject: `New lead: ${lead.name} (${lead.business || 'no business name'})`,
      text: [
        `Name:     ${lead.name}`,
        `Email:    ${lead.email}`,
        `Phone:    ${lead.phone || '-'}`,
        `Business: ${lead.business || '-'}`,
        `Budget:   ${lead.budget || '-'}`,
        ``,
        `Message:`,
        lead.message,
        ``,
        `Received: ${lead.receivedAt}`,
      ].join('\n'),
    })
    .catch((err) => console.error('Email notification failed:', err.message));
}

// ---------- simple rate limiting ----------

const submissions = new Map(); // ip -> timestamps
function rateLimited(ip) {
  const now = Date.now();
  const windowMs = 10 * 60 * 1000; // 10 minutes
  const recent = (submissions.get(ip) || []).filter((t) => now - t < windowMs);
  submissions.set(ip, recent);
  if (recent.length >= 5) return true;
  recent.push(now);
  return false;
}

// ---------- contact endpoint ----------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

app.post('/api/contact', (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';

  if (rateLimited(String(ip))) {
    return res.status(429).json({ ok: false, error: 'Too many submissions. Please try again later.' });
  }

  const { name, email, phone, business, budget, message, website } = req.body || {};

  // Honeypot: the hidden "website" field should stay empty for humans.
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
    budget: clean(budget, 40),
    message: clean(message, 2000),
    receivedAt: new Date().toISOString(),
  };

  try {
    saveLead(lead);
  } catch (err) {
    console.error('Failed to save lead:', err);
    return res.status(500).json({ ok: false, error: 'Something went wrong. Please email us directly.' });
  }

  sendNotification(lead);
  res.json({ ok: true });
});

// ---------- admin dashboard ----------

function requireAdmin(req, res, next) {
  const user = process.env.ADMIN_USER || 'admin';
  const pass = process.env.ADMIN_PASSWORD;

  if (!pass) {
    return res
      .status(503)
      .send('Admin dashboard is disabled. Set ADMIN_PASSWORD in your .env file to enable it.');
  }

  const header = req.headers.authorization || '';
  const [scheme, encoded] = header.split(' ');
  if (scheme === 'Basic' && encoded) {
    const [u, p] = Buffer.from(encoded, 'base64').toString().split(':');
    const ok =
      u &&
      p &&
      u.length === user.length &&
      p.length === pass.length &&
      crypto.timingSafeEqual(Buffer.from(u), Buffer.from(user)) &&
      crypto.timingSafeEqual(Buffer.from(p), Buffer.from(pass));
    if (ok) return next();
  }

  res.set('WWW-Authenticate', 'Basic realm="LocalLift Admin"');
  res.status(401).send('Authentication required.');
}

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

app.get('/admin', requireAdmin, (req, res) => {
  const leads = readLeads().slice().reverse();
  const rows = leads
    .map(
      (l) => `<tr>
        <td>${esc(new Date(l.receivedAt).toLocaleString())}</td>
        <td>${esc(l.name)}</td>
        <td><a href="mailto:${esc(l.email)}">${esc(l.email)}</a></td>
        <td>${esc(l.phone)}</td>
        <td>${esc(l.business)}</td>
        <td>${esc(l.budget)}</td>
        <td class="msg">${esc(l.message)}</td>
      </tr>`
    )
    .join('\n');

  res.send(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Leads — LocalLift Admin</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 2rem; color: #1a2233; }
  h1 { font-size: 1.4rem; }
  .count { color: #5a6478; margin-bottom: 1rem; }
  table { border-collapse: collapse; width: 100%; font-size: 0.9rem; }
  th, td { text-align: left; padding: 0.6rem 0.8rem; border-bottom: 1px solid #e3e7ef; vertical-align: top; }
  th { background: #f4f6fa; position: sticky; top: 0; }
  tr:hover { background: #fafbfe; }
  .msg { max-width: 420px; white-space: pre-wrap; }
  .empty { padding: 3rem; text-align: center; color: #5a6478; background: #f4f6fa; border-radius: 8px; }
  a.export { display: inline-block; margin-bottom: 1rem; }
</style>
</head>
<body>
  <h1>Leads</h1>
  <p class="count">${leads.length} total</p>
  <a class="export" href="/admin/leads.json">Download raw JSON</a>
  ${
    leads.length
      ? `<table><thead><tr><th>Received</th><th>Name</th><th>Email</th><th>Phone</th><th>Business</th><th>Budget</th><th>Message</th></tr></thead><tbody>${rows}</tbody></table>`
      : `<div class="empty">No leads yet. Share your site and they'll show up here.</div>`
  }
</body>
</html>`);
});

app.get('/admin/leads.json', requireAdmin, (req, res) => {
  res.json(readLeads());
});

app.listen(PORT, () => {
  console.log(`LocalLift site running at http://localhost:${PORT}`);
  if (!process.env.ADMIN_PASSWORD) {
    console.log('Tip: set ADMIN_PASSWORD in .env to enable the /admin lead dashboard.');
  }
});
