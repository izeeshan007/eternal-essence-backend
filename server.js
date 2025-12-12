// server.js
import './config/env.js'; // load dotenv + env normalization first

import express from 'express';
import cors from 'cors';
import { ENV, isSmtpConfigured, isJwtConfigured } from './config/env.js';
import { connectDB } from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import orderRoutes from './routes/orderRoutes.js';
import { createRequire } from 'module';


// unified mailer utilities (from utils/mailer.js)
import { sendTestEmail } from './utils/mailer.js';

// Optionally run a lightweight test using sendTestEmail (non-blocking)
// note: this attempts to send and may log failures if config incorrect
sendTestEmail(process.env.SMTP_USER || process.env.BREVO_SMTP_USER || 'test@example.com')
  .then(r => console.log('Test email send result (async):', r?.info || r))
  .catch(e => console.warn('sendTestEmail error (ignored):', e && e.message));



const require = createRequire(import.meta.url);
const app = express();
const PORT = ENV.PORT || 5000;

// ================== DIAGNOSTICS (startup) ==================
console.log('--- ADMIN ENV ---');
console.log('FRONTEND_URL:', ENV.FRONTEND_URL || '(not set)');
console.log('SMTP configured (env):', isSmtpConfigured());
console.log('JWT configured:', isJwtConfigured());
console.log('PORT:', PORT);
console.log('--------------------------------');

// ================== CORS ==================
const allowedOrigins = [];
if (ENV.FRONTEND_URL) allowedOrigins.push(ENV.FRONTEND_URL);
if (ENV.FRONTEND_URL?.includes('netlify.app')) allowedOrigins.push(ENV.FRONTEND_URL);
 // also allow common localhost variants for dev convenience
allowedOrigins.push('http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:5173', 'http://127.0.0.1:5173');

const corsOptions = {
  origin: function (origin, callback) {
    // allow requests with no origin (curl/postman)
    if (!origin) return callback(null, true);
    if (allowedOrigins.length === 0 || allowedOrigins.includes(origin) || ENV.FRONTEND_URL === '*') {
      return callback(null, true);
    }
    // allow Netlify previews broadly
    if (String(origin).includes('.netlify.app')) return callback(null, true);
    return callback(new Error('CORS policy: This origin is not allowed: ' + origin));
  },
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ================== HEALTH CHECK ==================
app.get('/', (req, res) => res.json({ success: true, message: 'Eternal Essence backend running.' }));

// ================== SMTP / Mailer startup (non-blocking) ==================
(async () => {
  try {
    // Try to create/verify SMTP transporter (if SMTP config present).
    // Note: our mailer prefers Brevo REST if BREVO_API_KEY present; getSmtpTransporter will
    // only succeed if SMTP envs are present and valid.
    if (isSmtpConfigured()) {
      getSmtpTransporter()
        .then(() => {
          console.log('✅ SMTP transporter ready.');
        })
        .catch((err) => {
          console.warn('SMTP transporter creation error (ignored):', err && err.message ? err.message : err);
        });
    } else {
      console.log('⚠️ SMTP not configured - email sending may be disabled or will use REST API if configured.');
    }
  } catch (err) {
    console.warn('Mailer startup error (ignored):', err && err.message ? err.message : err);
  }
})();

// ================== ROUTES ==================
// Provide a test-email route that uses the mailer helper (single source)
app.get('/api/test-email', async (req, res) => {
  try {
    // prefer explicit query param ?to=someone@example.com
    let to = (req.query.to || process.env.TEST_EMAIL_TO || process.env.ADMIN_EMAIL || process.env.BREVO_SMTP_USER || process.env.SMTP_USER || '').trim();

    // if someone accidentally put quoted FROM header or the "Eternal Essence <email>" style, extract the email
    const m = to.match(/<([^>]+)>/);
    if (m && m[1]) to = m[1].trim();

    // simple email validation
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!to || !emailRe.test(to)) {
      return res.status(400).json({ success: false, error: 'Missing or invalid recipient email. Call /api/test-email?to=you@example.com' });
    }

    // call the mailer helper (sendTestEmail should return info or throw)
    const { sendTestEmail } = await import('./utils/mailer.js'); // dynamic import to avoid circular deps
    const info = await sendTestEmail(to);
    return res.json({ success: true, message: 'Test email sent', info: info?.messageId ? { messageId: info.messageId } : info });
  } catch (err) {
    console.error('/api/test-email error', err && err.message ? err.message : err);
    return res.status(500).json({ success: false, error: err.message || 'Test email failed' });
  }
});

// ================= try to load admin routes (support ESM or CommonJS) =================
let adminRoutes = null;
try {
  // Try ESM dynamic import first
  const mod = await import('./routes/admin.js').catch(() => null);
  if (mod && (mod.default || mod)) {
    adminRoutes = mod.default || mod;
    console.log('Loaded admin routes via ESM import.');
  }
} catch (err) {
  console.warn('ESM import for admin routes failed (will try require).', err?.message || err);
}
if (!adminRoutes) {
  try {
    adminRoutes = require('./routes/admin');
    console.log('Loaded admin routes via require().');
  } catch (err) {
    console.warn('Could not load admin routes. If you intend to use admin routes, ensure routes/admin.js exists and exports an express router.', err?.message || err);
  }
}
// =====================================================================================

// mount admin routes if loaded
if (adminRoutes) {
  app.use('/api/admin', adminRoutes);
}

// existing app routes
app.use('/api/auth', authRoutes);
app.use('/api/orders', orderRoutes);

// ================== START SERVER AFTER DB CONNECT ==================
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
