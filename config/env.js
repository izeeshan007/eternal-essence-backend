// config/env.js
import dotenv from 'dotenv';
dotenv.config(); // load .env immediately

// Normalize env variable names used across app
const ENV = {
  PORT: process.env.PORT || '5000',
  FRONTEND_URL: process.env.FRONTEND_URL || process.env.FRONTEND_ORIGIN || process.env.FRONTEND || '',
  MONGODB_URI: process.env.MONGODB_URI || '',
  JWT_SECRET: process.env.JWT_SECRET || '',
  RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID || '',
  RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET || '',
  // SMTP/email
  SMTP_HOST: process.env.SMTP_HOST || process.env.EMAIL_SMTP_HOST || '',
  SMTP_PORT: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : (process.env.SMTP_PORT || 587),
  SMTP_USER: process.env.SMTP_USER || process.env.EMAIL_USER || '',
  SMTP_PASS: process.env.SMTP_PASS || process.env.EMAIL_PASS || '',
  SMTP_FROM: process.env.SMTP_FROM || process.env.EMAIL_FROM || '',
};

function isSmtpConfigured() {
  return !!(ENV.SMTP_HOST && ENV.SMTP_USER && ENV.SMTP_PASS);
}

function isJwtConfigured() {
  return !!ENV.JWT_SECRET;
}

export { ENV, isSmtpConfigured, isJwtConfigured };
