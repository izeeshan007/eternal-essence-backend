// utils/mailer.js
import nodemailer from 'nodemailer';

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER;

let transporter = null;

if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465, // true for 465, false for 587
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS
    }
  });
} else {
  console.warn('⚠️ SMTP not configured - email sending disabled.');
}

export async function sendMail({ to, subject, text, html }) {
  if (!transporter) throw new Error('SMTP not configured');
  const info = await transporter.sendMail({
    from: SMTP_FROM,
    to,
    subject,
    text: text || '',
    html: html || text || ''
  });
  return info;
}
