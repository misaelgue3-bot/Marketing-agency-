/**
 * Automation engine — the agency on autopilot.
 *
 * Runs an hourly tick. Each automation is opt-in via .env and idempotent
 * (a marker in the database guarantees it never fires twice for the same
 * period). Every message produced lands in the admin Outbox — sent by
 * email when SMTP is configured, kept as a draft for you to copy when not.
 *
 *   AUTO_LEAD_REPLY=true        Sofía answers every new lead within a minute
 *                               (wired in server.js at submission time)
 *   AUTO_MONTHLY_CHECKINS=true  Sofía checks in with every active client on
 *                               the 1st of the month
 *   AUTO_PAYMENT_REMINDERS=true Sofía nudges clients with no payment
 *                               recorded by the 7th of the month
 *   AUTO_CAMPAIGNS=true         The creative team builds each active
 *                               client's monthly campaign (wired in server.js)
 *   WEEKLY_DIGEST=true          You get a Monday business summary at
 *                               NOTIFY_EMAIL (no AI needed)
 */

const store = require('./db');
const agents = require('./agents');
const mailer = require('./mailer');

const flag = (name) => process.env[name] === 'true';

/**
 * Drafts a message with Sofía, then emails it (if possible) and logs it
 * to the outbox. Never throws — automation failures are logged and skipped.
 */
async function draftAndDeliver(client, purpose, context, type, log) {
  try {
    const m = await agents.draftClientMessage(client, { purpose, context });
    const subject = client.language === 'en' ? m.subjectEn : m.subjectEs;
    const message = client.language === 'en' ? m.messageEn : m.messageEs;
    const bilingual = `${m.messageEs}\n\n---\n\n${m.messageEn}`;

    let status = 'draft';
    if (mailer.available() && client.email) {
      try {
        await mailer.send({ to: client.email, subject, text: message });
        status = 'sent';
      } catch (err) {
        log(`email to ${client.email} failed: ${err.message} — kept as draft`);
      }
    }

    store.addOutbox({
      type,
      clientId: client.id || null,
      to: client.email || '',
      subject,
      message: bilingual,
      status,
    });
    log(`${type} for ${client.business || client.name}: ${status}`);
    return status;
  } catch (err) {
    log(`${type} for ${client.business || client.name} failed: ${err.message}`);
    store.addOutbox({
      type,
      clientId: client.id || null,
      to: client.email || '',
      subject: `(failed) ${type}`,
      message: err.message,
      status: 'failed',
    });
    return 'failed';
  }
}

/** Instant reply to a brand-new website lead (called from server.js). */
async function replyToLead(lead, log = console.log) {
  if (!flag('AUTO_LEAD_REPLY') || !agents.available()) return;
  const pseudoClient = {
    name: lead.name,
    business: lead.business,
    email: lead.email,
    plan: lead.plan || 'not chosen yet',
    monthlyFee: 0,
    goals: lead.message,
    language: 'es',
  };
  await draftAndDeliver(
    pseudoClient,
    'custom',
    `This person just submitted our website contact form (interested in: ${lead.plan || 'undecided'}, budget: ${lead.budget || 'unknown'}). ` +
    'Write a short first reply: thank them, tell them a real person reviews their info today and they will get their free written plan within 48 hours, ' +
    'and invite them to reply or WhatsApp us with anything else meanwhile. Do not sell; just reassure.',
    'lead_reply',
    log
  );
}

/* ---------------- scheduled automations ---------------- */

async function monthlyCheckins(now, log) {
  if (!flag('AUTO_MONTHLY_CHECKINS') || !agents.available()) return;
  const month = now.toISOString().slice(0, 7);
  for (const client of store.db.clients.filter((c) => c.status === 'active')) {
    const key = `checkin:${month}:${client.id}`;
    if (store.automationDone(key)) continue;
    store.markAutomation(key);
    await draftAndDeliver(client, 'monthly_update', '', 'monthly_checkin', log);
  }
}

async function paymentReminders(now, log) {
  if (!flag('AUTO_PAYMENT_REMINDERS') || !agents.available()) return;
  if (now.getDate() < 7) return; // give people the first week
  const month = now.toISOString().slice(0, 7);
  for (const client of store.db.clients.filter((c) => c.status === 'active' && c.monthlyFee > 0)) {
    const paid = store.db.payments.some(
      (p) => p.clientId === client.id && (p.date || '').slice(0, 7) === month
    );
    if (paid) continue;
    const key = `payrem:${month}:${client.id}`;
    if (store.automationDone(key)) continue;
    store.markAutomation(key);
    await draftAndDeliver(client, 'payment_reminder', `Their monthly plan is $${client.monthlyFee} (${client.plan}).`, 'payment_reminder', log);
  }
}

function isoWeek(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return `${date.getUTCFullYear()}-W${Math.ceil(((date - yearStart) / 86400000 + 1) / 7)}`;
}

async function weeklyDigest(now, log) {
  if (!flag('WEEKLY_DIGEST') || !mailer.available() || !process.env.NOTIFY_EMAIL) return;
  if (now.getDay() !== 1) return; // Mondays
  const key = `digest:${isoWeek(now)}`;
  if (store.automationDone(key)) return;
  store.markAutomation(key);

  const { leads, clients, payments, campaigns } = store.db;
  const weekAgo = new Date(now - 7 * 86400000).toISOString();
  const month = now.toISOString().slice(0, 7);
  const active = clients.filter((c) => c.status === 'active');
  const mrr = active.reduce((s, c) => s + (c.monthlyFee || 0), 0);
  const collectedThisMonth = payments
    .filter((p) => (p.date || '').slice(0, 7) === month)
    .reduce((s, p) => s + p.amount, 0);
  const newLeads = leads.filter((l) => l.receivedAt >= weekAgo);
  const drafts = campaigns.filter((c) => c.status === 'draft');

  const text = [
    `LocalLift — weekly summary`,
    ``,
    `Money`,
    `  Monthly recurring: $${mrr} (${active.length} active clients)`,
    `  Collected so far this month: $${collectedThisMonth}`,
    ``,
    `Leads (last 7 days): ${newLeads.length}`,
    ...newLeads.slice(0, 10).map((l) => `  - ${l.name} (${l.business || 'no business name'}) — ${l.plan || 'no plan chosen'}`),
    ``,
    `Campaigns waiting for your review: ${drafts.length}`,
    ...drafts.slice(0, 10).map((c) => `  - ${c.month}: ${c.plan?.name || '(unnamed)'}`),
    ``,
    `Open your dashboard for details: /admin`,
  ].join('\n');

  try {
    await mailer.send({ to: process.env.NOTIFY_EMAIL, subject: 'LocalLift — your weekly summary', text });
    store.addOutbox({ type: 'weekly_digest', to: process.env.NOTIFY_EMAIL, subject: 'Weekly summary', message: text, status: 'sent' });
    log('weekly digest sent');
  } catch (err) {
    log(`weekly digest failed: ${err.message}`);
  }
}

/* ---------------- tick ---------------- */

let running = false;

async function runTick(log = (m) => console.log(`[automations] ${m}`)) {
  if (running) return;
  running = true;
  const now = new Date();
  try {
    await monthlyCheckins(now, log);
    await paymentReminders(now, log);
    await weeklyDigest(now, log);
  } catch (err) {
    log(`tick error: ${err.message}`);
  } finally {
    running = false;
  }
}

function enabledFlags() {
  return {
    leadReply: flag('AUTO_LEAD_REPLY'),
    monthlyCheckins: flag('AUTO_MONTHLY_CHECKINS'),
    paymentReminders: flag('AUTO_PAYMENT_REMINDERS'),
    campaigns: flag('AUTO_CAMPAIGNS'),
    weeklyDigest: flag('WEEKLY_DIGEST'),
    email: mailer.available(),
  };
}

module.exports = { runTick, replyToLead, enabledFlags };
