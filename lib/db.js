/**
 * Tiny JSON-file database for the agency backend.
 * Collections: leads, clients, payments, campaigns.
 * Good for a small agency; swap for SQLite/Postgres when you outgrow it.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const LEGACY_LEADS_FILE = path.join(DATA_DIR, 'leads.json');

const EMPTY = { leads: [], clients: [], payments: [], campaigns: [] };

function load() {
  let db;
  try {
    db = { ...EMPTY, ...JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) };
  } catch {
    db = { ...EMPTY };
  }
  // One-time migration from the old leads.json format
  if (fs.existsSync(LEGACY_LEADS_FILE)) {
    try {
      const legacy = JSON.parse(fs.readFileSync(LEGACY_LEADS_FILE, 'utf8'));
      const known = new Set(db.leads.map((l) => l.id));
      legacy.forEach((l) => { if (!known.has(l.id)) db.leads.push(l); });
      fs.renameSync(LEGACY_LEADS_FILE, LEGACY_LEADS_FILE + '.migrated');
      persist(db);
    } catch { /* leave the legacy file alone if unreadable */ }
  }
  return db;
}

function persist(db) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

const db = load();

function id() {
  return crypto.randomUUID();
}

module.exports = {
  db,
  persist: () => persist(db),
  id,

  addLead(lead) {
    db.leads.push(lead);
    persist(db);
    return lead;
  },

  addClient(data) {
    const client = {
      id: id(),
      name: data.name || '',
      business: data.business || '',
      email: data.email || '',
      phone: data.phone || '',
      plan: data.plan || 'Inicial',
      monthlyFee: Number(data.monthlyFee) || 0,
      status: data.status || 'active', // active | paused | churned
      industry: data.industry || '',
      goals: data.goals || '',
      notes: data.notes || '',
      language: data.language || 'es',
      startedAt: data.startedAt || new Date().toISOString().slice(0, 10),
      createdAt: new Date().toISOString(),
    };
    db.clients.push(client);
    persist(db);
    return client;
  },

  updateClient(clientId, patch) {
    const client = db.clients.find((c) => c.id === clientId);
    if (!client) return null;
    const editable = ['name', 'business', 'email', 'phone', 'plan', 'monthlyFee',
      'status', 'industry', 'goals', 'notes', 'language', 'startedAt'];
    for (const key of editable) {
      if (key in patch) client[key] = key === 'monthlyFee' ? Number(patch[key]) || 0 : patch[key];
    }
    persist(db);
    return client;
  },

  deleteClient(clientId) {
    const i = db.clients.findIndex((c) => c.id === clientId);
    if (i === -1) return false;
    db.clients.splice(i, 1);
    db.payments = db.payments.filter((p) => p.clientId !== clientId);
    db.campaigns = db.campaigns.filter((c) => c.clientId !== clientId);
    persist(db);
    return true;
  },

  addPayment(data) {
    const payment = {
      id: id(),
      clientId: data.clientId,
      amount: Number(data.amount) || 0,
      date: data.date || new Date().toISOString().slice(0, 10),
      method: data.method || '',
      note: data.note || '',
      createdAt: new Date().toISOString(),
    };
    db.payments.push(payment);
    persist(db);
    return payment;
  },

  deletePayment(paymentId) {
    const i = db.payments.findIndex((p) => p.id === paymentId);
    if (i === -1) return false;
    db.payments.splice(i, 1);
    persist(db);
    return true;
  },

  addCampaign(campaign) {
    db.campaigns.push(campaign);
    persist(db);
    return campaign;
  },

  deleteLead(leadId) {
    const i = db.leads.findIndex((l) => l.id === leadId);
    if (i === -1) return false;
    db.leads.splice(i, 1);
    persist(db);
    return true;
  },
};
