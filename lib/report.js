/**
 * Monthly client report ("Reporte del mes") — plain words, real data.
 * Auto-fills from what the system actually tracked that month (published
 * posts, campaigns, payments). The editable boxes can be typed into right
 * on the page before printing, so the team adds the human summary without
 * needing another tool.
 */

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const MONTHS_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function monthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS_ES[(m || 1) - 1]} de ${y}`;
}

/**
 * data: { posts: [published posts of that client+month],
 *         campaigns: [campaigns of that client],
 *         payments: [payments of that client+month] }
 */
function render(client, data, settings = {}, monthKey) {
  const email = settings.email || 'hola@yourlocallift.com';
  const posts = data.posts || [];
  const campaigns = data.campaigns || [];
  const payments = data.payments || [];
  const byNetwork = {};
  posts.forEach((p) => { byNetwork[p.network] = (byNetwork[p.network] || 0) + 1; });

  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Reporte ${esc(monthLabel(monthKey))} — ${esc(client.business || client.name)}</title>
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
  h1 { font-size:24px; margin:24px 0 2px; letter-spacing:-.01em; }
  .sub { color:var(--muted); font-size:15px; margin-bottom:22px; }
  .tiles { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin-bottom:24px; }
  .tile { background:var(--cream); border:1px solid var(--line); border-radius:12px; padding:14px 16px; }
  .tile b { display:block; font-size:26px; }
  .tile span { font-size:12.5px; color:var(--muted); }
  h2 { font-size:15px; text-transform:uppercase; letter-spacing:.08em; color:var(--teal); margin:24px 0 10px; border-bottom:1px solid var(--line); padding-bottom:6px; }
  ul { padding-left:20px; }
  li { margin-bottom:6px; font-size:14px; }
  .edit { border:1.5px dashed var(--gold); border-radius:10px; padding:12px 16px; font-size:14px; min-height:64px; background:#fffdf6; }
  .edit:empty::before { content:attr(data-ph); color:var(--muted); }
  .edit:focus { outline:2px solid var(--gold); }
  .hint { font-size:11.5px; color:var(--muted); margin:4px 0 0; }
  table { width:100%; border-collapse:collapse; font-size:13.5px; margin-top:4px; }
  td { padding:7px 10px; border-bottom:1px solid var(--line); }
  td:last-child { text-align:right; color:var(--muted); white-space:nowrap; }
  footer { margin-top:32px; padding-top:14px; border-top:1px solid var(--line); font-size:12.5px; color:var(--muted); display:flex; justify-content:space-between; flex-wrap:wrap; gap:8px; }
  .actions { max-width:840px; margin:0 auto 20px; text-align:right; }
  .btn { font:inherit; font-weight:700; font-size:14px; background:var(--ink); color:#fff; border:0; border-radius:999px; padding:11px 22px; cursor:pointer; }
  @media print { body { background:#fff; } .sheet { box-shadow:none; margin:0; max-width:none; padding:0 6mm; } .actions, .hint { display:none; } .edit { border-style:solid; border-color:var(--line); background:#fff; } h2 { break-after:avoid; } }
  @media (max-width:640px){ .sheet { padding:26px 20px; } .tiles { grid-template-columns:1fr; } }
</style></head>
<body>
  <div class="actions"><button class="btn" onclick="window.print()">🖨️ Imprimir / Guardar PDF</button></div>
  <div class="sheet">
    <div class="top">
      <div class="brand">
        <svg viewBox="-100 -100 200 200"><defs><linearGradient id="g" gradientUnits="userSpaceOnUse" x1="0" y1="-88" x2="0" y2="74"><stop offset="0" stop-color="#ffb525"/><stop offset="1" stop-color="#e8542f"/></linearGradient></defs><path d="M 0,74 C -40,24 -60,0 -60,-28 A 60,60 0 1 1 60,-28 C 60,0 40,24 0,74 Z" fill="url(#g)"/><path d="M 0,-62 L 38,-24 L -38,-24 Z" fill="#1d2c30"/><path d="M -26,-18 L 26,-18 L 26,8 L -26,8 Z" fill="#1d2c30"/><path d="M -8,11 L 8,11 L 8,-8 L -8,-8 Z" fill="url(#g)"/></svg>
        <span>Your Local<b>Lift</b></span>
      </div>
      <div class="doc"><strong>Reporte del mes</strong>${esc(monthLabel(monthKey))}<br>Plan ${esc(client.plan || '')}</div>
    </div>

    <h1>${esc(client.business || client.name)}</h1>
    <p class="sub">Hola ${esc((client.name || '').split(' ')[0] || '')}: aquí está, en palabras claras, lo que hicimos por tu negocio este mes.</p>

    <div class="tiles">
      <div class="tile"><b>${posts.length}</b><span>publicaciones publicadas${Object.keys(byNetwork).length ? ' — ' + Object.entries(byNetwork).map(([n, c]) => `${c} en ${esc(n)}`).join(', ') : ''}</span></div>
      <div class="tile"><b>${campaigns.filter((k) => k.status === 'live' || k.status === 'approved').length}</b><span>campaña(s) activas este mes</span></div>
      <div class="tile"><b>24/7</b><span>Sofía respondiendo mensajes y reseñas</span></div>
    </div>

    <h2>Lo más importante este mes</h2>
    <div class="edit" contenteditable="true" data-ph="Escribe aquí 2 o 3 logros en palabras simples. Ej.: 'Tu perfil de Google ya tiene 12 fotos nuevas y 5 reseñas respondidas. La publicación del 2×1 fue la que más gente alcanzó.'"></div>
    <p class="hint">✏️ Haz clic y escribe — esto se imprime tal cual. (No se guarda al cerrar: escribe e imprime.)</p>

    ${posts.length ? `<h2>Publicaciones de ${esc(monthLabel(monthKey))}</h2>
    <table>${posts.map((p) => `<tr><td>${esc(p.caption.split('\n')[0].slice(0, 70))}</td><td>${esc(p.network)} · ${esc(p.date)}</td></tr>`).join('')}</table>` : ''}

    ${campaigns.length ? `<h2>Campañas</h2><ul>${campaigns.map((k) => `<li><strong>${esc(k.plan?.name || 'Campaña')}</strong> — ${esc(k.status === 'live' ? 'activa' : k.status === 'approved' ? 'aprobada' : k.status)}</li>`).join('')}</ul>` : ''}

    <h2>El mes que viene</h2>
    <div class="edit" contenteditable="true" data-ph="Qué sigue. Ej.: 'Calendario de agosto listo para tu aprobación. Vamos a probar anuncios de pasteles por encargo, que fue lo que más preguntaron.'"></div>

    ${payments.length ? `<h2>Pagos de este mes</h2><table>${payments.map((p) => `<tr><td>${esc(p.note || 'Pago')}</td><td>$${p.amount} · ${esc(p.date)}</td></tr>`).join('')}</table>` : ''}

    <footer>
      <span>¿Preguntas? Escríbenos — hablamos tu idioma.</span>
      <span>${esc(email)} · yourlocallift.com</span>
    </footer>
  </div>
</body></html>`;
}

module.exports = { render, monthLabel };
