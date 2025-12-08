// server.js
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDB } from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import orderRoutes from './routes/orderRoutes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// ========== BASIC LOG OF IMPORTANT ENVs ==========
console.log('✅ Using PORT:', PORT);
console.log('✅ FRONTEND_URL:', process.env.FRONTEND_URL || '(not set, using *)');

// ========== CORS ==========
// For now: allow ALL origins so Netlify + local dev both work without "Failed to fetch"
// Once everything works, you can tighten this.
app.use(cors());

// If later you want stricter CORS, replace above with:
// const allowedOrigins = [
//   'https://eternnalessence.netlify.app',
//   'http://localhost:5500',   // or whatever you use locally
// ];
//
// app.use(
//   cors({
//     origin(origin, callback) {
//       if (!origin) return callback(null, true); // allow non-browser tools
//       if (allowedOrigins.includes(origin)) return callback(null, true);
//       console.log('❌ CORS blocked origin:', origin);
//       return callback(new Error('Not allowed by CORS'));
//     },
//     credentials: true
//   })
// );

// ========== BODY PARSING ==========
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// ========== HEALTH CHECK ==========
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Eternal Essence backend running.',
    timestamp: new Date().toISOString()
  });
});

// ========== ROUTES ==========
app.use('/api/auth', authRoutes);    // /api/auth/register, /api/auth/verify-otp, /api/auth/login, /api/auth/me
app.use('/api/orders', orderRoutes); // /api/orders/create-razorpay-order, /api/orders/verify-razorpay, /api/orders/cod, /api/orders/my

// ========== 404 HANDLER ==========
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Not found',
    path: req.originalUrl
  });
});

// ========== GLOBAL ERROR HANDLER (optional but helpful) ==========
app.use((err, req, res, next) => {
  console.error('🔥 Global error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    details: err.message || 'Unknown error'
  });
});

// ========== START SERVER AFTER DB CONNECTS ==========
connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('❌ Failed to connect DB, shutting down:', err);
    process.exit(1);
  });
