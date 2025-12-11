// utils/mailer.js
import nodemailer from 'nodemailer';
import { ENV, isSmtpConfigured } from '../config/env.js';

let transporter = null;

if (isSmtpConfigured()) {
  transporter = nodemailer.createTransport({
    host: ENV.SMTP_HOST,
    port: ENV.SMTP_PORT || 587,
    secure: String(ENV.SMTP_PORT) === '465', // true for 465
    auth: {
      user: ENV.SMTP_USER,
      pass: ENV.SMTP_PASS
    }
  });

  transporter.verify().then(() => {
    console.log('✅ SMTP transporter ready.');
  }).catch(err => {
    console.warn('⚠️ SMTP verify failed:', err.message || err);
    transporter = null;
  });
} else {
  console.warn('⚠️ SMTP not configured — emails will not be sent. Set SMTP_HOST / SMTP_USER / SMTP_PASS in .env');
}

/**
 * sendGenericEmail({ to, subject, text, html })
 * returns info or throws
 */
export async function sendGenericEmail({ to, subject, text = '', html = '' }) {
  if (!transporter) {
    console.warn('Skipping sendGenericEmail (transporter not configured).', { to, subject });
    return null;
  }
  const from = ENV.SMTP_FROM || ENV.SMTP_USER;
  const info = await transporter.sendMail({ from, to, subject, text, html });
  return info;
}

/**
 * sendOtpEmail({ to, name, code, purpose })
 * - Builds a small HTML template for OTP emails.
 */
export async function sendOtpEmail({ to, name = '', code, purpose = 'signup' }) {
  if (!transporter) {
    console.warn('Skipping sendOtpEmail (transporter not configured).', { to, purpose });
    return null;
  }
  const subject = purpose === 'reset' ? 'Your Eternal Essence Password Reset OTP' : 'Your Eternal Essence Verification OTP';
  const safeName = name || 'there';
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;border:1px solid #eee;padding:20px;">
      <h2 style="text-align:center;color:#222;">Eternal Essence</h2>
      <p>Hi ${safeName},</p>
      <p>Your ${purpose === 'reset' ? 'password reset' : 'verification'} OTP is:</p>
      <p style="font-size:28px;font-weight:bold;text-align:center;letter-spacing:4px;">${code}</p>
      <p>This OTP is valid for 10 minutes. If you did not request this, please ignore this email.</p>
      <br/>
      <p style="font-size:12px;color:#888;">Byculla, Mumbai • Essence, Redefined.</p>
    </div>
  `;
  const from = ENV.SMTP_FROM || ENV.SMTP_USER;
  const info = await transporter.sendMail({ from, to, subject, html });
  return info;
}
