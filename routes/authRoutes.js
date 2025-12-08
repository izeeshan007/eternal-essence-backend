// routes/authRoutes.js
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import { User } from '../models/User.js';
import { Otp } from '../models/Otp.js';

const router = express.Router();

// mail transporter
function getTransporter() {
  if (!process.env.SMTP_HOST) {
    console.warn('SMTP not configured – OTP email will not work');
  }
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function signToken(user) {
  return jwt.sign(
    { id: user._id.toString(), email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, phone, email, password } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json({ success: false, error: 'Name, email and password are required.' });
    }

    const normalizedEmail = email.toLowerCase();

    // Check if user already exists
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(400).json({
        success: false,
        error: 'User already exists. Please login instead.'
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const otpCode = generateOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    // Upsert OTP record
    await Otp.findOneAndUpdate(
      { email: normalizedEmail },
      { email: normalizedEmail, otp: otpCode, name, phone, passwordHash, expiresAt, used: false },
      { upsert: true, new: true }
    );

    // Send email
    const transporter = getTransporter();
    if (process.env.SMTP_HOST) {
      const from = process.env.SMTP_FROM || process.env.SMTP_USER;
      await transporter.sendMail({
        from: from,
        to: normalizedEmail,
        subject: 'Your Eternal Essence OTP',
        text: `Your Eternal Essence verification code is: ${otpCode}. It is valid for 10 minutes.`,
        html: `<p>Your Eternal Essence verification code is:</p>
               <p style="font-size:24px;font-weight:bold;">${otpCode}</p>
               <p>This code is valid for 10 minutes.</p>`
      });
    }

    return res.json({
      success: true,
      message: 'OTP sent to your email. Please check your inbox/spam.'
    });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ success: false, error: 'Server error during registration.' });
  }
});

// POST /api/auth/verify-otp
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ success: false, error: 'Email and OTP are required.' });
    }

    const normalizedEmail = email.toLowerCase();
    const record = await Otp.findOne({ email: normalizedEmail }).sort({ createdAt: -1 });

    if (!record) {
      return res.status(400).json({ success: false, error: 'No OTP request found for this email.' });
    }

    if (record.used) {
      return res.status(400).json({ success: false, error: 'OTP already used. Please request a new one.' });
    }

    if (record.expiresAt < new Date()) {
      return res.status(400).json({ success: false, error: 'OTP has expired. Please request a new one.' });
    }

    if (record.otp !== otp) {
      return res.status(400).json({ success: false, error: 'Invalid OTP.' });
    }

    // Mark OTP as used
    record.used = true;
    await record.save();

    // Create user if not existing
    let user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      user = await User.create({
        name: record.name || 'User',
        phone: record.phone || '',
        email: normalizedEmail,
        passwordHash: record.passwordHash
      });
    }

    const token = signToken(user);

    return res.json({
      success: true,
      message: 'Account verified successfully.',
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        phone: user.phone
      }
    });
  } catch (err) {
    console.error('Verify OTP error:', err);
    return res.status(500).json({ success: false, error: 'Server error during OTP verification.' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required.' });
    }

    const normalizedEmail = email.toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(400).json({ success: false, error: 'Invalid email or password.' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(400).json({ success: false, error: 'Invalid email or password.' });
    }

    const token = signToken(user);

    return res.json({
      success: true,
      message: 'Login successful.',
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        phone: user.phone
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ success: false, error: 'Server error during login.' });
  }
});

export default router;
