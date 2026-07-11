// ============ LocalLift Marketing — site scripts ============

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

// Pricing buttons pre-fill the contact message
document.querySelectorAll('[data-plan]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const message = document.querySelector('#contact-form [name="message"]');
    if (message && !message.value.trim()) {
      message.value = `Hi! I'm interested in the ${btn.dataset.plan} plan. My business is...`;
    }
  });
});

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
  if (!data.name || data.name.trim().length < 2) return showError('Please enter your name.');
  if (!data.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return showError('Please enter a valid email address.');
  if (!data.message || data.message.trim().length < 10) return showError('Please tell us a bit about your business.');

  submitBtn.disabled = true;
  submitBtn.textContent = 'Sending...';

  try {
    const res = await fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const body = await res.json().catch(() => ({}));

    if (res.ok && body.ok) {
      form.reset();
      status.textContent = "Thanks! We got your message — you'll hear from us within one business day.";
      status.classList.add('ok');
    } else {
      showError(body.error || 'Something went wrong. Please try again or email us directly.');
    }
  } catch {
    showError('Could not reach the server. Please check your connection and try again.');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Send me my free plan';
  }
});

function showError(msg) {
  status.textContent = msg;
  status.classList.add('err');
}
