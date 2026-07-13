// ============ LocalLift Marketing — checkout / onboarding ============

const es = document.documentElement.lang.startsWith('es');
const P = window.CO_PRICES || { p1: 199, p2: 399, p3: 699 };

const PLANS = es
  ? {
      Inicial: {
        price: P.p1,
        feats: ['Página web de una página', 'Perfil de Google Business optimizado', '8 publicaciones en redes al mes'],
      },
      Crecimiento: {
        price: P.p2,
        feats: ['Todo lo del plan Inicial', 'Web completa + SEO local', '16 publicaciones + 1 campaña de anuncios'],
      },
      Pro: {
        price: P.p3,
        feats: ['Todo lo del plan Crecimiento', 'Varias campañas + landing pages', 'Email marketing y soporte prioritario'],
      },
    }
  : {
      Starter: {
        price: P.p1,
        feats: ['One-page website', 'Optimized Google Business profile', '8 social posts per month'],
      },
      Growth: {
        price: P.p2,
        feats: ['Everything in Starter', 'Full website + local SEO', '16 posts + 1 ad campaign'],
      },
      Pro: {
        price: P.p3,
        feats: ['Everything in Growth', 'Multiple campaigns + landing pages', 'Email marketing & priority support'],
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

function renderPlan() {
  document.getElementById('co-plan-name').textContent = plan;
  document.getElementById('co-plan-price').innerHTML = '$' + PLANS[plan].price + '<small>' + t.per + '</small>';
  const ul = document.getElementById('co-plan-feats');
  ul.innerHTML = '';
  PLANS[plan].feats.forEach((f) => {
    const li = document.createElement('li');
    li.textContent = f;
    ul.appendChild(li);
  });
  planSelect.value = plan;
  // Keep the language switch pointing at the same plan
  const other = { Inicial: 'Starter', Crecimiento: 'Growth', Pro: 'Pro', Starter: 'Inicial', Growth: 'Crecimiento' }[plan] || plan;
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
      document.getElementById('co-intro').hidden = true;
      document.getElementById('co-plan-card').hidden = true;
      form.hidden = true;
      document.getElementById('co-done-plan').textContent = plan;
      document.getElementById('co-done').hidden = false;
      window.scrollTo({ top: 0, behavior: 'smooth' });
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
