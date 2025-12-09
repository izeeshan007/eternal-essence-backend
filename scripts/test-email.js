// scripts/test-email.js
import dotenv from 'dotenv';
dotenv.config();
import { sendOtpEmail } from '../utils/email.js';

(async () => {
  try {
    const res = await sendOtpEmail({
      to: process.env.SMTP_USER, // send to yourself to test
      subject: 'Test SMTP from Node',
      html: '<p>This is a test email from your Eternal Essence backend.</p>'
    });
    console.log('Email send result:', res);
  } catch (err) {
    console.error('Test email error:', err);
  }
})();
