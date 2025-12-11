// utils/mailer.js
import nodemailer from 'nodemailer';
import { ENV } from '../config/env.js';

let transporter = null;

function createTransport() {
  if (!ENV.SMTP_HOST || !ENV.SMTP_USER || !ENV.SMTP_PASS) {
    console.warn('⚠️ SMTP not configured. ENV variables missing.');
    return null;
  }

  // nodemailer createTransport
  const t = nodemailer.createTransport({
    host: ENV.SMTP_HOST,
    port: ENV.SMTP_PORT || 587,
    secure: String(ENV.SMTP_PORT) === '465', // true for 465
    auth: {
      user: ENV.SMTP_USER,
      pass: ENV.SMTP_PASS
    },
    logger: false,
    debug: false
  });

  // Optional verify on startup
  t.verify()
    .then(() => console.log('✅ SMTP transporter ready.'))
    .catch(err => console.warn('⚠️ SMTP transporter verify failed:', err && err.message ? err.message : err));

  return t;
}

transporter = createTransport();

export async function sendTestEmail(to) {
  if (!transporter) throw new Error('transporter-not-configured');
  const info = await transporter.sendMail({
    from: ENV.SMTP_FROM || ENV.SMTP_USER,
    to,
    subject: 'Eternal Essence — SMTP test',
    text: 'This is a test email from your backend.'
  });
  return info;
}

export async function sendOtpEmail({ to, code, purpose = 'signup', name = '' }) {
  if (!transporter) {
    console.warn('⚠️ Mailer: transporter not initialized; skipping sendOtpEmail.');
    throw new Error('transporter-not-configured');
  }

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:18px;border:1px solid #eee;">
      <h2 style="text-align:center;color:#222;">Eternal Essence</h2>
      <p>Hello ${name || 'there'},</p>
      <p>Your verification OTP is:</p>
      <p style="font-size:28px;font-weight:bold;text-align:center;letter-spacing:4px;">${code}</p>
      <p style="font-size:12px;color:#666;">This OTP is valid for 10 minutes.</p>
    </div>
  `;

  try {
    const info = await transporter.sendMail({
      from: ENV.SMTP_FROM || ENV.SMTP_USER,
      to,
      subject: 'Your Eternal Essence Verification OTP',
      html
    });
    console.log(`Mailer: OTP sent -> to=${to} envelopeId=${info.envelope ? JSON.stringify(info.envelope) : ''} messageId=${info.messageId || ''}`);
    return info;
  } catch (err) {
    console.error('Mailer: sendOtpEmail failed for', to, err && err.message ? err.message : err);
    throw err;
  }
}

export { transporter };
