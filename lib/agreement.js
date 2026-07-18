/**
 * Per-client Service Plan ("Plan de Servicio").
 * Generated from the client's actual plan so both sides know exactly what is
 * included, what gets delivered, and when. Doubles as the team's checklist:
 * every deliverable prints with a checkbox.
 */

// What each monthly plan includes. Kept in sync with the pricing on the site.
const PLAN_SCOPES = {
  Inicial: {
    aka: 'Starter',
    tagline: 'Presencia local sólida y publicaciones constantes.',
    timeline30: [
      { week: 'Semana 1 — Arranque', items: [
        'Llamada de bienvenida (15 min): conocemos tu negocio, tu voz y tus metas.',
        'Te pedimos acceso por invitación de Meta Business (nunca tu contraseña).',
        'Reclamamos y completamos tu perfil de Google Business: fotos, horario, categorías y descripción.',
      ] },
      { week: 'Semana 2 — Contenido', items: [
        'Te presentamos el calendario de contenido del mes (tú lo apruebas antes de publicar).',
        'Salen tus primeras publicaciones en Instagram y Facebook.',
      ] },
      { week: 'Semanas 3–4 — Ritmo', items: [
        'Publicaciones corriendo en su calendario fijo.',
        'Sofía respondiendo mensajes y reseñas.',
        'Revisión de resultados iniciales y ajustes.',
      ] },
    ],
    monthly: [
      { what: '8 publicaciones en Instagram y Facebook', when: 'lunes, miércoles o viernes, según tu calendario aprobado' },
      { what: 'Optimización de tu perfil de Google Business', when: 'revisión cada semana' },
      { what: 'Respuesta a reseñas y mensajes (asistente Sofía)', when: 'todos los días, 24/7' },
      { what: 'Calendario de contenido del mes siguiente para tu aprobación', when: 'última semana del mes' },
      { what: 'Reporte mensual en palabras claras', when: 'primeros 3 días del mes' },
    ],
    notIncluded: [
      'Anuncios pagados (disponibles desde el plan Crecimiento).',
      'Diseño de logo o identidad de marca (plan Crecimiento).',
      'Página web (proyecto aparte de pago único).',
    ],
  },
  Crecimiento: {
    aka: 'Growth',
    tagline: 'Todo lo de Inicial, más marca propia y anuncios que traen clientes.',
    timeline30: [
      { week: 'Semana 1 — Arranque', items: [
        'Llamada de bienvenida (15 min): negocio, voz, metas y estilo visual.',
        'Acceso por invitación de Meta Business (nunca tu contraseña).',
        'Google Business completo: fotos, horario, categorías, descripción.',
        'Arrancamos el diseño de tu logo y mini guía de marca (colores + tipografía).',
      ] },
      { week: 'Semana 2 — Marca y contenido', items: [
        'Te presentamos 2 propuestas de logo; eliges y afinamos.',
        'Calendario de contenido del mes para tu aprobación.',
        'Salen tus primeras publicaciones.',
      ] },
      { week: 'Semana 3 — Anuncios', items: [
        'Entrega final de logo y mini guía de marca.',
        'Lanzamos tu primera campaña de anuncios en Meta (tú apruebas el anuncio y el presupuesto).',
      ] },
      { week: 'Semana 4 — Ritmo completo', items: [
        'Publicaciones + campaña corriendo.',
        'SEO local: ajustes para que aparezcas cuando buscan tu giro en tu zona.',
        'Revisión de resultados del primer mes.',
      ] },
    ],
    monthly: [
      { what: '16 publicaciones en Instagram y Facebook', when: '4 por semana en calendario fijo aprobado por ti' },
      { what: '1 campaña de anuncios en Meta', when: 'se lanza la primera semana del mes; optimización continua' },
      { what: 'Optimización de Google Business + SEO local', when: 'revisión cada semana' },
      { what: 'Respuesta a reseñas y mensajes (asistente Sofía)', when: 'todos los días, 24/7' },
      { what: 'Calendario del mes siguiente para tu aprobación', when: 'última semana del mes' },
      { what: 'Reporte mensual con resultados y recomendaciones', when: 'primeros 3 días del mes' },
    ],
    notIncluded: [
      'La inversión en anuncios (el dinero que se paga a Meta) es aparte y la decides tú — recomendamos desde $150/mes.',
      'Página web (proyecto aparte de pago único).',
      'Email marketing y landing pages (plan Pro).',
    ],
  },
  Pro: {
    aka: 'Pro',
    tagline: 'Todo lo de Crecimiento, con más campañas y atención prioritaria.',
    timeline30: [
      { week: 'Semana 1 — Arranque', items: [
        'Llamada de estrategia (30 min): negocio, metas, competencia y plan del trimestre.',
        'Acceso por invitación de Meta Business (nunca tu contraseña).',
        'Google Business completo + auditoría de tu presencia actual.',
        'Arrancamos tu identidad de marca completa (logo, paleta, tipografía, guía de uso).',
      ] },
      { week: 'Semana 2 — Marca y contenido', items: [
        'Propuestas de identidad; eliges y afinamos.',
        'Calendario de contenido del mes para tu aprobación.',
        'Primeras publicaciones + primera landing page en preparación.',
      ] },
      { week: 'Semana 3 — Campañas', items: [
        'Entrega de identidad de marca completa.',
        'Lanzamos tus primeras campañas (tú apruebas anuncios y presupuestos).',
        'Primera campaña de email a tus clientes.',
      ] },
      { week: 'Semana 4 — Ritmo completo', items: [
        'Publicaciones + campañas + email corriendo.',
        'Revisión de resultados con recomendaciones del mes 2.',
      ] },
    ],
    monthly: [
      { what: '16+ publicaciones en Instagram y Facebook', when: '4+ por semana en calendario fijo aprobado por ti' },
      { what: 'Varias campañas de anuncios + landing pages', when: 'lanzamiento la primera semana; optimización continua' },
      { what: 'Email marketing a tu lista de clientes', when: 'al menos 1 envío al mes' },
      { what: 'Google Business + SEO local continuos', when: 'revisión cada semana' },
      { what: 'Respuesta a reseñas y mensajes (asistente Sofía)', when: 'todos los días, 24/7' },
      { what: 'Reporte mensual detallado + llamada de resultados', when: 'primeros 3 días del mes' },
    ],
    notIncluded: [
      'La inversión en anuncios (lo que se paga a Meta/Google) es aparte y la decides tú.',
      'Página web (proyecto aparte de pago único).',
    ],
  },
};

// The website is a separate one-time product, never part of a monthly plan.
const WEB_SCOPE = {
  tagline: 'Tu página web — tuya para siempre, pagada una vez.',
  timeline30: [
    { week: 'Días 1–3', items: ['Nos mandas tu información: fotos, menú o servicios, horarios y datos de contacto.'] },
    { week: 'Días 4–10', items: ['Diseñamos y construimos tu sitio.', 'Te lo enseñamos y haces hasta 2 rondas de cambios.'] },
    { week: 'Días 10–14', items: ['Publicamos tu sitio en tu dominio.', 'Lo conectamos a tu Google Business.'] },
  ],
  monthly: [
    { what: 'Hosting: tu sitio en línea, con seguridad y respaldos', when: 'servicio mensual aparte' },
  ],
  notIncluded: ['Marketing mensual (redes, Google, anuncios) — ese es un plan mensual aparte.'],
};

function scopeFor(plan) {
  return PLAN_SCOPES[plan] || (/web|sitio|página/i.test(String(plan)) ? WEB_SCOPE : {
    tagline: 'Plan personalizado.',
    timeline30: [{ week: 'Arranque', items: ['Alcance definido contigo por escrito en tu propuesta.'] }],
    monthly: [{ what: 'Entregables acordados en tu propuesta', when: 'según lo acordado' }],
    notIncluded: [],
  });
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Returns a complete, printable HTML document for one client's service plan. */
function render(client, settings = {}) {
  const scope = scopeFor(client.plan);
  const fee = Number(client.monthlyFee) || 0;
  const started = client.startedAt || new Date().toISOString().slice(0, 10);
  const email = settings.email || 'hola@yourlocallift.com';

  const checkItem = (text) => `<li><span class="box"></span><span>${esc(text)}</span></li>`;

  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Plan de Servicio — ${esc(client.business || client.name)}</title>
<style>
  :root { --ink:#1d2c30; --muted:#5a6f74; --line:#e9ddc9; --gold:#ffb525; --terra:#e8542f; --teal:#0f766b; --cream:#fbf6ed; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; color:var(--ink); background:#efe9dc; line-height:1.55; }
  .sheet { max-width:840px; margin:24px auto; background:#fff; padding:46px 54px; box-shadow:0 10px 40px rgba(29,44,48,.14); }
  .top { display:flex; justify-content:space-between; align-items:flex-start; gap:20px; border-bottom:3px solid var(--ink); padding-bottom:18px; }
  .brand { display:flex; align-items:center; gap:10px; font-weight:800; font-size:20px; }
  .brand b { color:var(--terra); }
  .brand svg { width:34px; height:34px; }
  .doc { text-align:right; font-size:13px; color:var(--muted); }
  .doc strong { display:block; font-size:15px; color:var(--ink); }
  h1 { font-size:26px; margin:24px 0 4px; letter-spacing:-.01em; }
  .tagline { color:var(--muted); font-size:15px; margin-bottom:20px; }
  .facts { display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px 22px; background:var(--cream); border:1px solid var(--line); border-radius:12px; padding:16px 20px; margin-bottom:22px; font-size:13.5px; }
  .facts div span { color:var(--muted); font-size:12px; text-transform:uppercase; letter-spacing:.05em; }
  .facts div b { display:block; font-size:14.5px; }
  .price { display:flex; align-items:baseline; gap:8px; margin:2px 0 20px; }
  .price b { font-size:30px; }
  .price span { color:var(--muted); }
  h2 { font-size:15px; text-transform:uppercase; letter-spacing:.08em; color:var(--teal); margin:26px 0 10px; border-bottom:1px solid var(--line); padding-bottom:6px; }
  h3 { font-size:14.5px; margin:14px 0 8px; }
  ul.check { list-style:none; }
  ul.check li { display:flex; gap:10px; align-items:flex-start; margin-bottom:8px; font-size:14px; }
  .box { flex:none; width:15px; height:15px; border:2px solid var(--ink); border-radius:4px; margin-top:2px; }
  table { width:100%; border-collapse:collapse; font-size:13.5px; }
  th { text-align:left; text-transform:uppercase; font-size:11.5px; letter-spacing:.05em; color:var(--muted); padding:6px 10px; border-bottom:2px solid var(--ink); }
  td { padding:9px 10px; border-bottom:1px solid var(--line); vertical-align:top; }
  td:first-child { font-weight:600; width:55%; }
  td .box { display:inline-block; margin-right:8px; vertical-align:-2px; }
  .note { background:#fff7e6; border-left:4px solid var(--gold); padding:12px 16px; border-radius:0 8px 8px 0; font-size:13.5px; margin:16px 0; }
  .nocover li { color:var(--muted); font-size:13px; margin-bottom:5px; }
  .terms { font-size:12.5px; color:var(--muted); }
  .terms li { margin-bottom:5px; }
  footer { margin-top:30px; padding-top:14px; border-top:1px solid var(--line); font-size:12.5px; color:var(--muted); display:flex; justify-content:space-between; flex-wrap:wrap; gap:8px; }
  .actions { max-width:840px; margin:0 auto 20px; text-align:right; }
  .btn { font:inherit; font-weight:700; font-size:14px; background:var(--ink); color:#fff; border:0; border-radius:999px; padding:11px 22px; cursor:pointer; }
  @media print { body { background:#fff; } .sheet { box-shadow:none; margin:0; max-width:none; padding:0 6mm; } .actions { display:none; } h2 { break-after:avoid; } tr, ul.check li { break-inside:avoid; } }
  @media (max-width:640px){ .sheet { padding:26px 20px; } .facts { grid-template-columns:1fr 1fr; } }
</style></head>
<body>
  <div class="actions"><button class="btn" onclick="window.print()">🖨️ Imprimir / Guardar PDF</button></div>
  <div class="sheet">
    <div class="top">
      <div class="brand">
        <svg viewBox="-100 -100 200 200"><defs><linearGradient id="g" gradientUnits="userSpaceOnUse" x1="0" y1="-88" x2="0" y2="74"><stop offset="0" stop-color="#ffb525"/><stop offset="1" stop-color="#e8542f"/></linearGradient></defs><path d="M 0,74 C -40,24 -60,0 -60,-28 A 60,60 0 1 1 60,-28 C 60,0 40,24 0,74 Z" fill="url(#g)"/><path d="M 0,-62 L 38,-24 L -38,-24 Z" fill="#1d2c30"/><path d="M -26,-18 L 26,-18 L 26,8 L -26,8 Z" fill="#1d2c30"/><path d="M -8,11 L 8,11 L 8,-8 L -8,-8 Z" fill="url(#g)"/></svg>
        <span>Your Local<b>Lift</b></span>
      </div>
      <div class="doc"><strong>Plan de Servicio</strong>Emitido: ${esc(new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' }))}<br>Ref: LL-${esc(String(client.id || '').slice(0, 8).toUpperCase())}</div>
    </div>

    <h1>${esc(client.business || client.name)}</h1>
    <p class="tagline">${esc(scope.tagline)}</p>

    <div class="facts">
      <div><span>Cliente</span><b>${esc(client.name || '—')}</b></div>
      <div><span>Plan contratado</span><b>${esc(client.plan)}${scope.aka && scope.aka !== client.plan ? ' (' + esc(scope.aka) + ')' : ''}</b></div>
      <div><span>Inicio</span><b>${esc(started)}</b></div>
      <div><span>Contacto</span><b>${esc(client.email || '—')}</b></div>
      <div><span>Teléfono</span><b>${esc(client.phone || '—')}</b></div>
      <div><span>Giro</span><b>${esc(client.industry || '—')}</b></div>
    </div>

    ${fee ? `<div class="price"><b>$${fee}</b><span>/ mes · en dólares · sin contrato forzoso — cancelas cuando quieras</span></div>` : ''}

    ${client.goals ? `<h2>Tus metas (lo que venimos a lograr)</h2><p style="font-size:14.5px">${esc(client.goals)}</p>` : ''}

    <h2>Tu primer mes, semana por semana</h2>
    ${(scope.timeline30 || []).map((t) => `<h3>${esc(t.week)}</h3><ul class="check">${t.items.map(checkItem).join('')}</ul>`).join('')}

    <h2>Lo que entregamos cada mes (y cuándo)</h2>
    <table>
      <thead><tr><th>Entregable</th><th>Cuándo</th></tr></thead>
      <tbody>
        ${(scope.monthly || []).map((m) => `<tr><td><span class="box"></span>${esc(m.what)}</td><td>${esc(m.when)}</td></tr>`).join('')}
      </tbody>
    </table>

    ${(scope.notIncluded || []).length ? `<h2>Qué NO incluye este plan (para que no haya sorpresas)</h2><ul class="nocover">${scope.notIncluded.map((x) => `<li>· ${esc(x)}</li>`).join('')}</ul>` : ''}

    <div class="note"><strong>Claridad en los costos.</strong> Los planes mensuales cubren marketing e identidad de marca. La página web es un proyecto aparte de pago único (desde $${esc(settings.priceWeb1 || 499)}); el hosting se cobra aparte ($${esc(settings.priceHosting || 15)}/mes); y la inversión en anuncios pagados (lo que Meta o Google cobran por mostrar tus anuncios) es aparte y siempre la decides tú.</div>

    <h2>Cómo trabajamos</h2>
    <ul class="terms">
      <li>Nos das acceso a tus redes por invitación de Meta Business — nunca te pedimos contraseñas.</li>
      <li>Nada se publica sin tu aprobación: apruebas el calendario de contenido cada mes.</li>
      <li>El cobro es mensual y automático con tarjeta (Stripe). Puedes cancelar cuando quieras; el servicio corre hasta el fin del mes ya pagado.</li>
      <li>Todo lo que creamos para tu marca es tuyo: logo, publicaciones, y tu sitio web si lo contratas.</li>
      <li>Hablamos tu idioma: todo el servicio, los reportes y el soporte son en español (o inglés si prefieres).</li>
    </ul>

    <footer>
      <span>Your LocalLift · Marketing para negocios locales</span>
      <span>${esc(email)} · yourlocallift.com</span>
    </footer>
  </div>
</body></html>`;
}

module.exports = { render, scopeFor, PLAN_SCOPES };
