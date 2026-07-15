// ============ LocalLift Marketing — checkout / onboarding ============

const es = document.documentElement.lang.startsWith('es');
const P = window.CO_PRICES || { p1: 199, p2: 399, p3: 699 };

const PLANS = es
  ? {
      Inicial: {
        price: P.p1,
        feats: ['Perfil de Google Business optimizado', '8 publicaciones en redes al mes', 'Reporte mensual en palabras claras'],
      },
      Crecimiento: {
        price: P.p2,
        feats: ['Todo lo del plan Inicial', 'Logo y mini guía de marca + SEO local', '16 publicaciones + 1 campaña de anuncios'],
      },
      Pro: {
        price: P.p3,
        feats: ['Todo lo del plan Crecimiento', 'Varias campañas + landing pages', 'Email marketing y soporte prioritario'],
      },
      Web: {
        price: P.w1, per: ' pago único',
        feats: ['Sitio profesional de una página', 'Tuya para siempre — pagas una vez', 'Hosting aparte: $' + P.host + '/mes'],
      },
      WebPro: {
        price: P.w2, per: ' pago único',
        feats: ['Sitio completo de varias páginas', 'Tuyo para siempre — pagas una vez', 'Hosting aparte: $' + P.host + '/mes'],
      },
    }
  : {
      Starter: {
        price: P.p1,
        feats: ['Optimized Google Business profile', '8 social posts per month', 'Monthly report in plain words'],
      },
      Growth: {
        price: P.p2,
        feats: ['Everything in Starter', 'Logo & mini brand guide + local SEO', '16 posts + 1 ad campaign'],
      },
      Pro: {
        price: P.p3,
        feats: ['Everything in Growth', 'Multiple campaigns + landing pages', 'Email marketing & priority support'],
      },
      Website: {
        price: P.w1, per: ' one-time',
        feats: ['Professional one-page site', 'Yours forever — pay once', 'Hosting billed separately: $' + P.host + '/mo'],
      },
      WebsitePro: {
        price: P.w2, per: ' one-time',
        feats: ['Full multi-page website', 'Yours forever — pay once', 'Hosting billed separately: $' + P.host + '/mo'],
      },
    };

const t = es
  ? {
      per: '/mes',
      steps: ['Paso 1 de 3 — Tu negocio', 'Paso 2 de 3 — Tu presencia y metas', 'Paso 3 de 3 — Tus datos'],
      errBusiness: 'Por favor escribe el nombre de tu negocio.',
      errType: 'Elige qué tipo de negocio es.',
      errCity: 'Dinos en qué ciudad o zona están tus clientes.',
      errGoal: 'Elige tu meta principal.',
      errName: 'Por favor escribe tu nombre.',
      errPhone: 'Por favor escribe tu teléfono.',
      errEmail: 'Por favor escribe un correo electrónico válido.',
      sending: 'Enviando…',
      errGeneric: 'Algo salió mal. Intenta de nuevo o escríbenos directamente.',
      errNetwork: 'No pudimos conectar con el servidor. Revisa tu conexión e intenta de nuevo.',
      opening: 'Abriendo el pago seguro…',
      paidTitle: '¡Pago recibido! Tu plan está activo. 🎉',
      paidText: (plan) => `Bienvenido a Your LocalLift. Tu plan ${plan} ya está activo y hoy mismo nos ponemos a trabajar — te contactamos en las próximas horas para arrancar.`,
      cancelled: 'El pago se canceló — no se cobró nada. Puedes intentarlo de nuevo cuando quieras.',
    }
  : {
      per: '/mo',
      steps: ['Step 1 of 3 — Your business', 'Step 2 of 3 — Your presence & goals', 'Step 3 of 3 — Your info'],
      errBusiness: 'Please enter your business name.',
      errType: 'Choose what kind of business it is.',
      errCity: 'Tell us the city or area where your customers are.',
      errGoal: 'Choose your main goal.',
      errName: 'Please enter your name.',
      errPhone: 'Please enter your phone number.',
      errEmail: 'Please enter a valid email address.',
      sending: 'Sending…',
      errGeneric: 'Something went wrong. Please try again or email us directly.',
      errNetwork: 'Could not reach the server. Please check your connection and try again.',
      opening: 'Opening secure payment…',
      paidTitle: 'Payment received! Your plan is active. 🎉',
      paidText: (plan) => `Welcome to Your LocalLift. Your ${plan} plan is now active and we get to work today — we'll reach out within hours to kick things off.`,
      cancelled: 'The payment was cancelled — nothing was charged. You can try again anytime.',
    };

const form = document.getElementById('co-form');
const status = form.querySelector('.form-status');
const steps = [...form.querySelectorAll('.co-step')];
const backBtn = document.getElementById('co-back');
const nextBtn = document.getElementById('co-next');
const submitBtn = document.getElementById('co-submit');
const planSelect = document.getElementById('co-plan-select');
const langLink = document.getElementById('co-lang-link');

// Plan from the URL (?plan=...), falling back to the featured plan
const names = Object.keys(PLANS);
let plan = new URLSearchParams(location.search).get('plan');
if (!names.includes(plan)) plan = names[1];

const PLAN_NAMES = { Web: 'Página web', WebPro: 'Sitio completo', Website: 'One-page website', WebsitePro: 'Full website' };

function renderPlan() {
  document.getElementById('co-plan-name').textContent = PLAN_NAMES[plan] || plan;
  document.getElementById('co-plan-price').innerHTML = '$' + PLANS[plan].price + '<small>' + (PLANS[plan].per || t.per) + '</small>';
  const ul = document.getElementById('co-plan-feats');
  ul.innerHTML = '';
  PLANS[plan].feats.forEach((f) => {
    const li = document.createElement('li');
    li.textContent = f;
    ul.appendChild(li);
  });
  planSelect.value = plan;
  // Keep the language switch pointing at the same plan
  const other = { Inicial: 'Starter', Crecimiento: 'Growth', Pro: 'Pro', Starter: 'Inicial', Growth: 'Crecimiento', Web: 'Website', Website: 'Web', WebPro: 'WebsitePro', WebsitePro: 'WebPro' }[plan] || plan;
  langLink.href = langLink.href.split('?')[0] + '?plan=' + encodeURIComponent(other);
}

planSelect.addEventListener('change', () => {
  plan = planSelect.value;
  renderPlan();
});
renderPlan();

// ---- step navigation ----
let current = 0;

function showStep(i) {
  current = i;
  steps.forEach((s, n) => { s.hidden = n !== i; });
  document.getElementById('co-step-label').textContent = t.steps[i];
  document.getElementById('co-bar-fill').style.width = ((i + 1) / steps.length) * 100 + '%';
  backBtn.hidden = i === 0;
  nextBtn.hidden = i === steps.length - 1;
  submitBtn.hidden = i !== steps.length - 1;
  status.textContent = '';
  status.className = 'form-status';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showError(msg) {
  status.textContent = msg;
  status.classList.add('err');
}

const val = (name) => (form.elements[name] ? form.elements[name].value.trim() : '');

function validateStep(i) {
  if (i === 0) {
    if (val('business').length < 2) return t.errBusiness;
    if (!val('type')) return t.errType;
    if (val('city').length < 2) return t.errCity;
  }
  if (i === 1) {
    if (!val('goal')) return t.errGoal;
  }
  if (i === 2) {
    if (val('name').length < 2) return t.errName;
    if (val('phone').replace(/\D/g, '').length < 7) return t.errPhone;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val('email'))) return t.errEmail;
  }
  return '';
}

nextBtn.addEventListener('click', () => {
  const err = validateStep(current);
  if (err) return showError(err);
  showStep(current + 1);
});

backBtn.addEventListener('click', () => showStep(current - 1));

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = validateStep(current);
  if (err) return showError(err);

  submitBtn.disabled = true;
  const label = submitBtn.textContent;
  submitBtn.textContent = t.sending;

  const data = Object.fromEntries(new FormData(form).entries());
  data.plan = plan;

  try {
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok && body.ok) {
      leadId = body.leadId || '';
      contact = { name: data.name, email: data.email, phone: data.phone, business: data.business };
      showDone();
    } else {
      showError(body.error || t.errGeneric);
    }
  } catch {
    showError(t.errNetwork);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = label;
  }
});

// ---- payment (Stripe) ----
let leadId = '';
let contact = {};
const payBox = document.getElementById('co-pay');
const payBtn = document.getElementById('co-pay-btn');
const payStatus = document.getElementById('co-pay-status');

function showDone() {
  document.getElementById('co-intro').hidden = true;
  document.getElementById('co-plan-card').hidden = true;
  form.hidden = true;
  document.getElementById('co-done-plan').textContent = PLAN_NAMES[plan] || plan;
  if (window.CO_STRIPE && payBox) {
    document.getElementById('co-pay-amt').textContent = PLANS[plan].price;
    const suffixEl = document.getElementById('co-pay-amt').nextSibling;
    if (suffixEl && PLANS[plan].per) suffixEl.textContent = PLANS[plan].per.trim() === 'pago único' || PLANS[plan].per.trim() === 'one-time' ? ' ' + PLANS[plan].per.trim() : suffixEl.textContent;
    payBox.hidden = false;
  }
  document.getElementById('co-done').hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

if (payBtn) {
  payBtn.addEventListener('click', async () => {
    payBtn.disabled = true;
    payStatus.textContent = t.opening;
    payStatus.className = 'form-status';
    try {
      const res = await fetch('/api/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, lang: es ? 'es' : 'en', leadId, ...contact }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.url) {
        location.href = body.url; // Stripe's hosted checkout page
        return;
      }
      payStatus.textContent = body.error || t.errGeneric;
      payStatus.classList.add('err');
    } catch {
      payStatus.textContent = t.errNetwork;
      payStatus.classList.add('err');
    }
    payBtn.disabled = false;
  });
}

// ---- returning from Stripe ----
const query = new URLSearchParams(location.search);
if (query.get('paid') === '1') {
  document.getElementById('co-intro').hidden = true;
  document.getElementById('co-plan-card').hidden = true;
  form.hidden = true;
  const done = document.getElementById('co-done');
  done.querySelector('h1').textContent = t.paidTitle;
  document.getElementById('co-done-text').textContent = t.paidText(plan);
  done.hidden = false;
} else if (query.get('cancelled') === '1') {
  showError(t.cancelled);
}
