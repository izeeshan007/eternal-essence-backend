// routes/testEmail.js
import express from 'express';
import { sendTestEmail } from '../utils/mailer.js';

const router = express.Router();

/**
 * GET /api/test-email
 * Quick route to test mail sending (sends to SMTP_USER/BREVO_SMTP_USER by default)
 */
router.get('/api/test-email', async (req, res) => {
  try {
    const to = process.env.BREVO_SMTP_USER || process.env.SMTP_USER;
    if (!to) return res.status(400).json({ success: false, error: 'No recipient configured (set SMTP_USER or BREVO_SMTP_USER in .env)' });
    const info = await sendTestEmail(to);
    return res.json({ success: true, message: 'Test email sent', info: { messageId: info.messageId } });
  } catch (err) {
    console.error('/api/test-email error', err && (err.message || err));
    return res.status(500).json({ success: false, error: err.message || 'Test email failed' });
  }
});

export default router;
