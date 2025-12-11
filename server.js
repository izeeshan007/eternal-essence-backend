// server.js (updated)
import './config/env.js'; // must be first to load dotenv and normalize env

// server.js (place after import './config/env.js')
console.log('--- ADMIN ENV ---');
console.log('ADMIN_EMAIL:', (process.env.ADMIN_EMAIL||'').trim().toLowerCase());
console.log('ADMIN_PASSWORD set?', !!process.env.ADMIN_PASSWORD);
console.log('JWT_SECRET set?', !!process.env.JWT_SECRET);
console.log('-----------------');


import express from 'express';
import cors from 'cors';
import { ENV, isSmtpConfigured, isJwtConfigured } from './config/env.js';
import { connectDB } from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import orderRoutes from './routes/orderRoutes.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const app = express();
const PORT = ENV.PORT || 5000;

// ================= try to load admin routes (support ESM or CommonJS) =================
let adminRoutes = null;
try {
  // Try ESM dynamic import first (preferred)
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
    // fallback to require (CommonJS)
    adminRoutes = require('./routes/admin');
    console.log('Loaded admin routes via require().');
  } catch (err) {
    console.warn('Could not load admin routes. If you intend to use admin routes, ensure routes/admin.js exists and exports an express router.', err?.message || err);
  }
}
// =====================================================================================

// honest diagnostics (uncomment if needed)
// console.log('--- ENV DIAGNOSTIC (server.js) ---');
// console.log('PORT:', PORT);
// console.log('FRONTEND_URL:', ENV.FRONTEND_URL || '(not set)');
// console.log('MONGODB_URI present:', !!ENV.MONGODB_URI);
// console.log('JWT_SECRET present:', isJwtConfigured());
// console.log('SMTP_HOST present:', !!ENV.SMTP_HOST);
// console.log('SMTP_USER present:', !!ENV.SMTP_USER);
// console.log('SMTP_PASS present:', !!ENV.SMTP_PASS);
// console.log('----------------------');

if (!isJwtConfigured()) {
  console.warn('⚠️ JWT_SECRET not set — features depending on JWT (auth tokens) will not work correctly.');
}
if (!isSmtpConfigured()) {
  console.warn('⚠️ SMTP not configured - email sending disabled.');
}

// ================== MIDDLEWARE ==================
/**
 * CORS config:
 * - allow requests from FRONTEND_URL if set
 * - allow Netlify deploy domains (common pattern)
 * - allow no-origin (curl/postman)
 */
const allowedOrigins = [];
if (ENV.FRONTEND_URL) allowedOrigins.push(ENV.FRONTEND_URL);
if (ENV.FRONTEND_URL?.includes('netlify.app')) {
  allowedOrigins.push(ENV.FRONTEND_URL);
}
const corsOptions = {
  origin: function (origin, callback) {
    // allow requests with no origin (mobile apps, curl, postman)
    if (!origin) return callback(null, true);
    // allow if in allowedOrigins or wildcard is set
    if (allowedOrigins.length === 0 || allowedOrigins.includes(origin) || ENV.FRONTEND_URL === '*') {
      return callback(null, true);
    }
    // optionally allow netlify previews if you want: check for '.netlify.app' substring
    if (origin.includes('.netlify.app')) return callback(null, true);
    return callback(new Error('CORS policy: This origin is not allowed: ' + origin));
  },
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ================== HEALTH CHECK ==================
app.get('/', (req, res) => res.json({ success: true, message: 'Eternal Essence backend running.' }));

// ================== SMTP TEST (optional) ==================
if (isSmtpConfigured()) {
  import('nodemailer').then(nodemailerMod => {
    const nodemailer = nodemailerMod.default;
    const transporter = nodemailer.createTransport({
      host: ENV.SMTP_HOST,
      port: ENV.SMTP_PORT || 587,
      secure: String(ENV.SMTP_PORT) === '465', // true for 465, false for others
      auth: {
        user: ENV.SMTP_USER,
        pass: ENV.SMTP_PASS
      }
    });

    // lightweight test route to verify SMTP (remove or protect in production)
    app.get('/api/test-email', async (req, res) => {
      try {
        await transporter.verify();
        const info = await transporter.sendMail({
          from: ENV.SMTP_FROM || ENV.SMTP_USER,
          to: ENV.SMTP_USER,
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
  // helpful placeholder route
  app.get('/api/test-email', (req, res) => {
    return res.status(400).json({ success: false, error: 'SMTP not configured. Set SMTP_HOST/SMTP_USER/SMTP_PASS in .env' });
  });
}

// ================== ROUTES ==================
// mount admin routes if loaded
if (adminRoutes) {
  app.use('/api/admin', adminRoutes);
}

// existing app routes (preserve previous functionality)
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
