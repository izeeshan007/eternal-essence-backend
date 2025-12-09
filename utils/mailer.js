// utils/mailer.js
import nodemailer from 'nodemailer';

const getTransporter = () => {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.warn('⚠️ SMTP not configured - email sending disabled.');
    return null;
  }
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT || 587),
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });
};

export async function sendOtpEmail({ to, code, purpose = 'signup' }) {
  const transporter = getTransporter();
  if (!transporter) throw new Error('SMTP not configured');

  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const subject = purpose === 'guest' ? 'Your guest OTP — Eternal Essence' : (purpose === 'reset' ? 'Password reset OTP — Eternal Essence' : 'Your OTP — Eternal Essence');
  const text = `Your ${purpose} OTP is: ${code}. It will expire in 10 minutes.`;

  const html = `
    <div style="font-family: sans-serif; color:#111;">
      <h3 style="color:#111">Eternal Essence</h3>
      <p>Your ${purpose} OTP is:</p>
      <h2 style="letter-spacing:6px">${code}</h2>
      <p style="color:#777; font-size:13px">This OTP will expire in 10 minutes.</p>
    </div>
  `;

  return transporter.sendMail({ from, to, subject, text, html });
}
