// controllers/authController.js
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import User from '../models/User.js';
import { sendOtpEmail } from '../config/mailer.js';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'dev-very-weak-secret';

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function createJwt(user) {
  return jwt.sign(
    {
      userId: user._id.toString(),
      email: user.email
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// POST /api/auth/register
export async function register(req, res) {
  try {
    const { name, email, phone, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    let user = await User.findOne({ email: normalizedEmail });

    if (user && user.isVerified) {
      return res.status(400).json({ error: 'Account already exists. Please login.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    if (!user) {
      user = new User({
        email: normalizedEmail,
        name: name || '',
        phone: phone || '',
        passwordHash,
        isVerified: false
      });
    } else {
      user.name = name || user.name;
      user.phone = phone || user.phone;
      user.passwordHash = passwordHash;
    }

    const otp = generateOtp();
    const otpHash = await bcrypt.hash(otp, 10);
    const expires = new Date(Date.now() + 10 * 60 * 1000);

    user.otpHash = otpHash;
    user.otpExpiresAt = expires;

    await user.save();

    try {
      await sendOtpEmail(normalizedEmail, user.name, otp);
    } catch (errMail) {
      console.error('Error sending OTP email:', errMail.message);
      return res.status(500).json({ error: 'Could not send OTP email. Please try again later.' });
    }

    return res.json({
      success: true,
      message: 'OTP sent to your email. Please verify to activate your account.'
    });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ error: 'Registration failed' });
  }
}

// POST /api/auth/verify-otp
export async function verifyOtp(req, res) {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ error: 'Email and OTP are required' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.otpHash || !user.otpExpiresAt) {
      return res.status(400).json({ error: 'No OTP pending for this user' });
    }
    if (user.otpExpiresAt < new Date()) {
      return res.status(400).json({ error: 'OTP has expired. Please request a new one.' });
    }

    const match = await bcrypt.compare(otp.toString(), user.otpHash);
    if (!match) {
      return res.status(400).json({ error: 'Incorrect OTP' });
    }

    user.isVerified = true;
    user.otpHash = null;
    user.otpExpiresAt = null;
    await user.save();

    const token = createJwt(user);

    return res.json({
      success: true,
      message: 'Account verified successfully',
      token,
      user: {
        email: user.email,
        name: user.name,
        phone: user.phone
      }
    });
  } catch (err) {
    console.error('Verify OTP error:', err);
    return res.status(500).json({ error: 'Failed to verify OTP' });
  }
}

// POST /api/auth/login
export async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }
    if (!user.isVerified) {
      return res.status(403).json({ error: 'Please verify your email via OTP before login.' });
    }

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    const token = createJwt(user);

    return res.json({
      success: true,
      token,
      user: {
        email: user.email,
        name: user.name,
        phone: user.phone
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Login failed' });
  }
}

// GET /api/auth/me
export async function getMe(req, res) {
  try {
    const user = await User.findById(req.user.userId).lean();
    if (!user) return res.status(404).json({ error: 'User not found' });

    return res.json({
      success: true,
      user: {
        email: user.email,
        name: user.name,
        phone: user.phone
      }
    });
  } catch (err) {
    console.error('Get me error:', err);
    return res.status(500).json({ error: 'Failed to fetch user' });
  }
}
