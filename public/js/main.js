// ============ LocalLift Marketing — site scripts ============

// Language-aware UI strings (page language comes from <html lang>)
const es = document.documentElement.lang.startsWith('es');
const t = es
  ? {
      sending: 'Enviando...',
      submit: 'Enviarme mi plan gratis',
      thanks: '¡Gracias! Recibimos tu mensaje — te respondemos en máximo un día hábil.',
      errGeneric: 'Algo salió mal. Intenta de nuevo o escríbenos directamente.',
      errNetwork: 'No pudimos conectar con el servidor. Revisa tu conexión e intenta de nuevo.',
      errName: 'Por favor escribe tu nombre.',
      errEmail: 'Por favor escribe un correo electrónico válido.',
      errMessage: 'Cuéntanos un poco sobre tu negocio, por favor.',
      planPrefill: (plan) => `¡Hola! Me interesa el plan ${plan}. Mi negocio es...`,
    }
  : {
      sending: 'Sending...',
      submit: 'Send me my free plan',
      thanks: "Thanks! We got your message — you'll hear from us within one business day.",
      errGeneric: 'Something went wrong. Please try again or email us directly.',
      errNetwork: 'Could not reach the server. Please check your connection and try again.',
      errName: 'Please enter your name.',
      errEmail: 'Please enter a valid email address.',
      errMessage: 'Please tell us a bit about your business.',
      planPrefill: (plan) => `Hi! I'm interested in the ${plan} plan. My business is...`,
    };

// Footer year
document.getElementById('year').textContent = new Date().getFullYear();

// Mobile nav toggle
const navToggle = document.querySelector('.nav-toggle');
const navLinks = document.querySelector('.nav-links');

navToggle.addEventListener('click', () => {
  const open = navLinks.classList.toggle('open');
  navToggle.setAttribute('aria-expanded', String(open));
});

navLinks.addEventListener('click', (e) => {
  if (e.target.tagName === 'A') {
    navLinks.classList.remove('open');
    navToggle.setAttribute('aria-expanded', 'false');
  }
});

// Reveal-on-scroll animations
const revealEls = document.querySelectorAll('.reveal');
if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12 }
  );
  revealEls.forEach((el) => io.observe(el));
} else {
  revealEls.forEach((el) => el.classList.add('in'));
}

// Pricing buttons pre-select the plan in the contact form
document.querySelectorAll('[data-plan]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const planSelect = document.getElementById('plan-select');
    if (planSelect) planSelect.value = btn.dataset.plan;
    const message = document.querySelector('#contact-form [name="message"]');
    if (message && !message.value.trim()) {
      message.value = t.planPrefill(btn.dataset.plan);
    }
  });
});

// Sofía hint bubble: appears after a moment, dismissible per session
const fabHint = document.getElementById('fab-hint');
if (fabHint && !sessionStorage.getItem('sofia-hint-dismissed')) {
  setTimeout(() => { fabHint.hidden = false; }, 2200);
  fabHint.querySelector('.fab-hint-close').addEventListener('click', () => {
    fabHint.hidden = true;
    sessionStorage.setItem('sofia-hint-dismissed', '1');
  });
}

// Contact form submission
const form = document.getElementById('contact-form');
const status = form.querySelector('.form-status');
const submitBtn = form.querySelector('button[type="submit"]');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  status.textContent = '';
  status.className = 'form-status';

  const data = Object.fromEntries(new FormData(form).entries());

  // Client-side checks mirror the server's
  if (!data.name || data.name.trim().length < 2) return showError(t.errName);
  if (!data.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return showError(t.errEmail);
  if (!data.message || data.message.trim().length < 10) return showError(t.errMessage);

  submitBtn.disabled = true;
  submitBtn.textContent = t.sending;

  try {
    const res = await fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const body = await res.json().catch(() => ({}));

    if (res.ok && body.ok) {
      form.reset();
      status.textContent = t.thanks;
      status.classList.add('ok');
    } else {
      showError(body.error || t.errGeneric);
    }
  } catch {
    showError(t.errNetwork);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = t.submit;
  }
});

function showError(msg) {
  status.textContent = msg;
  status.classList.add('err');
}
