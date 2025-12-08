// server.js – main entry (ESM)

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDB } from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import orderRoutes from './routes/orderRoutes.js';

dotenv.config();

// ===== ENV =====
const PORT = process.env.PORT || 5000;
const FRONTEND_URL = process.env.FRONTEND_URL || '*';

if (!process.env.MONGODB_URI) {
  console.error('❌ MONGODB_URI is not set in .env');
}
if (!process.env.JWT_SECRET) {
  console.warn('⚠️ JWT_SECRET is not set in .env — using a weak fallback (dev-only).');
}
if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
  console.warn('⚠️ EMAIL_USER or EMAIL_PASS not set — OTP emails will fail.');
}

// ===== APP SETUP =====
const app = express();

app.use(
  cors({
    origin: FRONTEND_URL,
    credentials: true
  })
);

app.use(express.json());

// Health check
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Eternal Essence backend running.',
    frontend: FRONTEND_URL
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/orders', orderRoutes);

// ===== START SERVER AFTER DB CONNECT =====
connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log('✅ MongoDB connected');
      console.log(`🚀 Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('❌ Failed to connect to MongoDB:', err.message);
    process.exit(1);
  });
