/**
 * Tiny JSON-file database for the agency backend.
 * Collections: leads, clients, payments, campaigns.
 * Good for a small agency; swap for SQLite/Postgres when you outgrow it.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// DATA_DIR can be overridden so the JSON db lives on a mounted persistent
// disk regardless of where the repo is deployed (e.g. DATA_DIR=/var/data).
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const LEGACY_LEADS_FILE = path.join(DATA_DIR, 'leads.json');

const DEFAULT_SETTINGS = {
  whatsapp: '15551234567',          // country code + number, digits only
  telegram: 'yourlocallift_bot',    // bot username, no @ (the site's chat button)
  email: 'hola@yourlocallift.com',
  price1: 199,
  price2: 399,
  price3: 699,
  priceWeb1: 499,   // one-page website, one-time project
  priceWeb2: 899,   // full multi-page website, one-time project
  priceHosting: 15, // monthly hosting, always billed separately
};

const EMPTY = { leads: [], clients: [], payments: [], campaigns: [], outbox: [], automations: {}, prospects: [], settings: { ...DEFAULT_SETTINGS } };

function load() {
  let db;
  try {
    db = { ...EMPTY, ...JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) };
  } catch {
    db = { ...EMPTY };
  }
  db.settings = { ...DEFAULT_SETTINGS, ...(db.settings || {}) };
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

/**
 * Copies the current db.json into DATA_DIR/backups with a timestamp and
 * keeps the most recent 40 copies. Returns the backup filename or null.
 */
function backupNow() {
  try {
    if (!fs.existsSync(DB_FILE)) return null;
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
    const file = path.join(BACKUP_DIR, `db-${stamp}.json`);
    fs.copyFileSync(DB_FILE, file);
    const all = fs.readdirSync(BACKUP_DIR).filter((f) => f.startsWith('db-')).sort();
    while (all.length > 40) fs.unlinkSync(path.join(BACKUP_DIR, all.shift()));
    return path.basename(file);
  } catch (err) {
    console.error('[db] backup failed:', err.message);
    return null;
  }
}

function listBackups() {
  try {
    return fs.readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith('db-'))
      .sort()
      .reverse()
      .map((f) => ({ file: f, bytes: fs.statSync(path.join(BACKUP_DIR, f)).size }));
  } catch { return []; }
}

const db = load();

function id() {
  return crypto.randomUUID();
}

/**
 * Standard onboarding protocol created for every new client, so the
 * business runs the same playbook no matter who does the work.
 * Phases: dia0 (welcome) -> montaje (setup) -> semana1 (launch) -> dia30 (renew).
 */
const PROTOCOL_STEPS = [
  ['dia0', 'Mandar mensaje de bienvenida por WhatsApp'],
  ['dia0', 'Enviar el brief de marca (logo, colores, fotos, metas)'],
  ['dia0', 'Pedir acceso con invitación de Meta Business (nunca contraseñas)'],
  ['montaje', 'Reclamar y completar Google Business (fotos, horario, categorías)'],
  ['montaje', 'Armar el calendario de contenido del mes 1'],
  ['montaje', 'Configurar a Sofía con los datos del negocio'],
  ['semana1', 'Publicar las primeras 3 publicaciones'],
  ['semana1', 'Lanzar la campaña de anuncios (si el plan la incluye)'],
  ['semana1', 'Llamada de arranque con el cliente (15 min)'],
  ['dia30', 'Enviar el reporte mensual en palabras claras'],
  ['dia30', 'Pedir la reseña de Google'],
  ['dia30', 'Proponer el siguiente paso (subir de plan / página web)'],
];

function defaultProtocol() {
  return PROTOCOL_STEPS.map(([phase, label]) => ({ id: id(), phase, label, done: false }));
}

// Migration: clients created before the protocol existed get one on boot.
let migrated = false;
for (const c of db.clients) {
  if (!Array.isArray(c.tasks)) { c.tasks = defaultProtocol(); migrated = true; }
}
if (migrated) persist(db);

module.exports = {
  db,
  persist: () => persist(db),
  backupNow,
  listBackups,
  DATA_DIR,
  id,

  addLead(lead) {
    db.leads.push(lead);
    persist(db);
    return lead;
  },

  // Cold-call prospecting list (found by hand, worked by phone)
  addProspect(data) {
    const prospect = {
      id: id(),
      business: String(data.business || '').trim().slice(0, 120),
      contact: String(data.contact || '').trim().slice(0, 100),
      phone: String(data.phone || '').trim().slice(0, 40),
      city: String(data.city || '').trim().slice(0, 80),
      category: String(data.category || '').trim().slice(0, 60),
      website: data.website || 'no', // no | mala | si
      google: data.google || 'no', // no | incompleto | si
      notes: String(data.notes || '').trim().slice(0, 2000),
      status: 'por-llamar', // por-llamar | sin-respuesta | llamar-despues | interesado | cita | convertido | no-interesado
      callbackAt: String(data.callbackAt || '').slice(0, 10),
      createdAt: new Date().toISOString(),
    };
    db.prospects.push(prospect);
    persist(db);
    return prospect;
  },

  updateProspect(prospectId, patch) {
    const p = db.prospects.find((x) => x.id === prospectId);
    if (!p) return null;
    const editable = ['business', 'contact', 'phone', 'city', 'category', 'website', 'google', 'notes', 'status', 'callbackAt'];
    for (const key of editable) {
      if (key in patch) p[key] = String(patch[key] ?? '').slice(0, key === 'notes' ? 2000 : 120);
    }
    persist(db);
    return p;
  },

  deleteProspect(prospectId) {
    const before = db.prospects.length;
    db.prospects = db.prospects.filter((p) => p.id !== prospectId);
    persist(db);
    return db.prospects.length < before;
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
      tasks: defaultProtocol(), // onboarding protocol, same playbook for every client
      createdAt: new Date().toISOString(),
    };
    db.clients.push(client);
    persist(db);
    return client;
  },

  toggleClientTask(clientId, taskId) {
    const client = db.clients.find((c) => c.id === clientId);
    if (!client) return null;
    if (!Array.isArray(client.tasks)) client.tasks = defaultProtocol();
    const task = client.tasks.find((t) => t.id === taskId);
    if (!task) return null;
    task.done = !task.done;
    task.doneAt = task.done ? new Date().toISOString() : undefined;
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

  updateSettings(patch) {
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      if (!(key in patch)) continue;
      if (key.startsWith('price')) {
        const n = Number(patch[key]);
        if (n > 0) db.settings[key] = Math.round(n);
      } else if (key === 'whatsapp') {
        const digits = String(patch[key]).replace(/[^\d]/g, '');
        if (digits.length >= 8) db.settings.whatsapp = digits;
      } else if (key === 'telegram') {
        const username = String(patch[key]).trim().replace(/^@/, '').replace(/[^\w]/g, '');
        if (username.length >= 4) db.settings.telegram = username;
      } else {
        const v = String(patch[key]).trim();
        if (v) db.settings[key] = v.slice(0, 150);
      }
    }
    persist(db);
    return db.settings;
  },

  addOutbox(entry) {
    const record = {
      id: id(),
      createdAt: new Date().toISOString(),
      ...entry, // type, clientId?, to, subject, message, status: 'sent' | 'draft' | 'failed'
    };
    db.outbox.push(record);
    if (db.outbox.length > 500) db.outbox.splice(0, db.outbox.length - 500);
    persist(db);
    return record;
  },

  // One-shot markers so automations never fire twice for the same period
  automationDone(key) {
    return Boolean(db.automations[key]);
  },
  markAutomation(key) {
    db.automations[key] = new Date().toISOString();
    persist(db);
  },

  deleteLead(leadId) {
    const i = db.leads.findIndex((l) => l.id === leadId);
    if (i === -1) return false;
    db.leads.splice(i, 1);
    persist(db);
    return true;
  },
};
