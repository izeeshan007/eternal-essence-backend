// server.js (updated)
import './config/env.js'; // must be first to load dotenv and normalize env
import express from 'express';
import cors from 'cors';
import { ENV, isSmtpConfigured, isJwtConfigured } from './config/env.js';
import { connectDB } from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import orderRoutes from './routes/orderRoutes.js';

const app = express();
const PORT = ENV.PORT || 5000;

// honest diagnostics
console.log('--- ENV DIAGNOSTIC (server.js) ---');
console.log('PORT:', PORT);
console.log('FRONTEND_URL:', ENV.FRONTEND_URL || '(not set)');
console.log('MONGODB_URI present:', !!ENV.MONGODB_URI);
console.log('JWT_SECRET present:', isJwtConfigured());
console.log('SMTP_HOST present:', !!ENV.SMTP_HOST);
console.log('SMTP_USER present:', !!ENV.SMTP_USER);
console.log('SMTP_PASS present:', !!ENV.SMTP_PASS);
console.log('----------------------');

if (!isJwtConfigured()) {
  console.warn('⚠️ JWT_SECRET not set — features depending on JWT (auth tokens) will not work correctly.');
}
if (!isSmtpConfigured()) {
  console.warn('⚠️ SMTP not configured - email sending disabled.');
}

app.use(cors({
  origin: ENV.FRONTEND_URL || '*',
  credentials: true
}));
app.use(express.json());

// simple health check
app.get('/', (req, res) => res.json({ success: true, message: 'Eternal Essence backend running.' }));

// Optional: test SMTP (only if configured)
if (isSmtpConfigured()) {
  import('nodemailer').then(nodemailerMod => {
    const nodemailer = nodemailerMod.default;
    const transporter = nodemailer.createTransport({
      host: ENV.SMTP_HOST,
      port: ENV.SMTP_PORT || 587,
      secure: ENV.SMTP_PORT === 465, // true for 465, false for 587
      auth: {
        user: ENV.SMTP_USER,
        pass: ENV.SMTP_PASS
      }
    });

    // lightweight test route to verify SMTP (remove or protect in production)
    app.get('/api/test-email', async (req, res) => {
      try {
        await transporter.verify();
        // try sending a test message
        const info = await transporter.sendMail({
          from: ENV.SMTP_FROM || ENV.SMTP_USER,
          to: ENV.SMTP_USER, // send to yourself
          subject: 'Eternal Essence - SMTP test',
          text: 'This is a test email from your Eternal Essence backend SMTP test route.'
        });
        return res.json({ success: true, message: 'SMTP OK, test email sent.', info });
      } catch (err) {
        console.error('SMTP test error:', err);
        return res.status(500).json({ success: false, error: err.message || String(err) });
      }
    });
  }).catch(e => {
    console.warn('Could not set up nodemailer test route:', e);
  });
} else {
  // add disabled route that returns a helpful error
  app.get('/api/test-email', (req, res) => {
    return res.status(400).json({ success: false, error: 'SMTP not configured. Set SMTP_HOST/SMTP_USER/SMTP_PASS in .env' });
  });
}

// routes
app.use('/api/auth', authRoutes);
app.use('/api/orders', orderRoutes);

// Start server after DB connects
(async () => {
  try {
    if (!ENV.MONGODB_URI) throw new Error('MONGODB_URI not set in env');
    await connectDB(ENV.MONGODB_URI);
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server due to DB connection error:', err.message || err);
    process.exit(1);
  }
})();
