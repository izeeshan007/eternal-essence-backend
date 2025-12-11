// routes/admin.js
import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { requireAdmin } from '../middleware/adminAuth.js';
import * as adminCtrl from '../controllers/adminController.js';
import User from '../models/User.js';
import { ENV } from '../config/env.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || ENV.JWT_SECRET || 'change_this_secret';
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || ''; // plaintext from .env (small sites)

router.post('/login', async (req, res) => {
  try {
    const { email = '', password = '' } = req.body || {};
    if (!email || !password) return res.status(400).json({ success: false, error: 'Email and password required' });

    const normalized = String(email).trim().toLowerCase();

    // 1) Fast path: environment-provided admin credentials
    if (ADMIN_EMAIL && ADMIN_PASSWORD && normalized === ADMIN_EMAIL) {
      if (password === ADMIN_PASSWORD) {
        const token = jwt.sign({ email: normalized, isAdmin: true }, JWT_SECRET, { expiresIn: '30d' });
        console.log(`admin.login: env-admin login success for ${normalized}`);
        return res.json({ success: true, token, email: normalized });
      } else {
        console.warn(`admin.login: env-admin invalid password for ${normalized}`);
        return res.status(401).json({ success: false, error: 'Invalid credentials' });
      }
    }

    // 2) DB fallback: find user by email and verify password
    const user = await User.findOne({ email: normalized }).select('+passwordHash isAdmin isVerified');
    if (!user) {
      console.warn(`admin.login: db user not found for ${normalized}`);
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    // If account exists but not verified, give a clearer error
    if (typeof user.isVerified !== 'undefined' && !user.isVerified) {
      console.warn(`admin.login: db user ${normalized} not verified`);
      return res.status(403).json({ success: false, error: 'Account not verified. Please verify using OTP.' });
    }

    const pwHash = user.passwordHash || '';
    const ok = await bcrypt.compare(password, pwHash);
    if (!ok) {
      console.warn(`admin.login: db user ${normalized} invalid password`);
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    // Allow admin if this DB user is explicitly the ADMIN_EMAIL
    if (ADMIN_EMAIL && normalized === ADMIN_EMAIL) {
      const token = jwt.sign({ email: normalized, isAdmin: true, id: user._id }, JWT_SECRET, { expiresIn: '30d' });
      console.log(`admin.login: db-admin login success for ${normalized} (matched ADMIN_EMAIL)`);
      return res.json({ success: true, token, email: normalized });
    }

    // Or allow if user.isAdmin is true
    if (user.isAdmin) {
      const token = jwt.sign({ email: normalized, isAdmin: true, id: user._id }, JWT_SECRET, { expiresIn: '30d' });
      console.log(`admin.login: db-admin login success for ${normalized} (isAdmin)`);
      return res.json({ success: true, token, email: normalized });
    }

    // not an admin
    console.warn(`admin.login: ${normalized} authenticated but not an admin`);
    return res.status(403).json({ success: false, error: 'Not authorized as admin' });

  } catch (err) {
    console.error('admin login err', err);
    return res.status(500).json({ success: false, error: 'Server error during login' });
  }
});

router.get('/orders', requireAdmin, adminCtrl.getOrders);
router.get('/orders/:id', requireAdmin, adminCtrl.getOrderById);
router.put('/orders/:id', requireAdmin, adminCtrl.updateOrderStatus);
router.put('/orders/:id/cancel', requireAdmin, adminCtrl.cancelOrder);
router.get('/dashboard', requireAdmin, adminCtrl.getDashboard);
router.get('/users', requireAdmin, adminCtrl.getUsers);

export default router;
