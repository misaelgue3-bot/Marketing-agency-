/**
 * Shared email sender (SMTP via nodemailer).
 * Configure SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS in .env.
 */

let nodemailer = null;
try { nodemailer = require('nodemailer'); } catch { /* dep not installed */ }

function available() {
  const { SMTP_HOST, SMTP_USER, SMTP_PASS } = process.env;
  return Boolean(nodemailer && SMTP_HOST && SMTP_USER && SMTP_PASS);
}

async function send({ to, subject, text }) {
  if (!available()) throw new Error('Email is not configured. Set SMTP_* in .env');

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  await transporter.sendMail({
    from: `"LocalLift Marketing" <${process.env.SMTP_USER}>`,
    to,
    subject,
    text,
  });
}

module.exports = { send, available };
