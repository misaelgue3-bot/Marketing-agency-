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
      errContact: 'Dinos tu teléfono, WhatsApp o correo para mandarte tu plan.',
      thanks2: '¡Gracias! Recibimos tu solicitud — hoy confirmamos y en 48 h tienes tu plan.',
    }
  : {
      sending: 'Sending...',
      submit: 'Send me my free plan',
      thanks: "Thanks! We got your message — you'll hear from us within one business day.",
      errGeneric: 'Something went wrong. Please try again or email us directly.',
      errNetwork: 'Could not reach the server. Please check your connection and try again.',
      errName: 'Please enter your name.',
      errContact: 'Tell us your phone, WhatsApp or email so we can send your plan.',
      thanks2: "Thanks! We got your request — we'll confirm today and your plan lands within 48h.",
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

// Sofía hint bubble: appears after a moment, dismissible per session
const fabHint = document.getElementById('fab-hint');
if (fabHint && !sessionStorage.getItem('sofia-hint-dismissed')) {
  setTimeout(() => { fabHint.hidden = false; }, 2200);
  fabHint.querySelector('.fab-hint-close').addEventListener('click', () => {
    fabHint.hidden = true;
    sessionStorage.setItem('sofia-hint-dismissed', '1');
  });
}

// Quick brief — 3-tap contact wizard
const brief = document.getElementById('brief-form');
if (brief) {
  const status = brief.querySelector('.form-status');
  const steps = [...brief.querySelectorAll('.brief-step')];
  const dots = [...brief.querySelectorAll('.bdot')];
  const submitBtn = brief.querySelector('button[type="submit"]');
  const picked = { biz: '', need: '' };
  let step = 1;

  const showError = (msg) => { status.textContent = msg; status.className = 'form-status err'; };

  function goTo(n) {
    step = n;
    steps.forEach((s) => { s.hidden = Number(s.dataset.bstep) !== n; });
    dots.forEach((d) => d.classList.toggle('on', Number(d.dataset.dot) <= n));
    document.getElementById('brief-num').textContent = n;
    status.textContent = '';
    status.className = 'form-status';
    if (n === 3) {
      document.getElementById('brief-resumen').textContent = `${picked.biz || '…'} · ${picked.need || '…'}`;
    }
  }

  brief.addEventListener('click', (e) => {
    const chip = e.target.closest('.bchip');
    if (chip) {
      const field = chip.closest('.brief-chips').dataset.field;
      picked[field] = chip.textContent.trim();
      chip.closest('.brief-chips').querySelectorAll('.bchip').forEach((b) => b.classList.toggle('sel', b === chip));
      goTo(field === 'biz' ? 2 : 3);
      return;
    }
    if (e.target.closest('.brief-back')) goTo(Math.max(1, step - 1));
  });

  brief.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = brief.elements.name.value.trim();
    const contact = brief.elements.contact.value.trim();
    if (name.length < 2) return showError(t.errName);
    if (contact.length < 5) return showError(t.errContact);

    submitBtn.disabled = true;
    const label = submitBtn.textContent;
    submitBtn.textContent = t.sending;

    try {
      const res = await fetch('/api/brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          biz: picked.biz, need: picked.need, name, contact,
          website: brief.elements.website.value,
          lang: es ? 'es' : 'en',
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.ok) {
        steps.forEach((s) => { s.hidden = true; });
        brief.querySelector('.brief-progress').hidden = true;
        status.textContent = t.thanks2;
        status.className = 'form-status ok';
      } else {
        showError(body.error || t.errGeneric);
      }
    } catch {
      showError(t.errNetwork);
    }
    submitBtn.disabled = false;
    submitBtn.textContent = label;
  });
}
