// controllers/authController.js
import User from '../models/User.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { sendMail } from '../utils/mailer.js';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) console.warn('⚠️ JWT_SECRET not set');

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000)); // 6-digit
}

export async function registerHandler(req, res) {
  try {
    const { name, email, phone, password } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, error: 'Email and password required' });

    const emailLc = String(email).toLowerCase();
    let user = await User.findOne({ email: emailLc });

    const otpCode = generateOtp();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    if (!user) {
      // create a temporary user record containing hashed password and otp (unverified)
      const salt = await bcrypt.genSalt(10);
      const hash = await bcrypt.hash(password, salt);
      user = new User({
        name,
        email: emailLc,
        phone,
        passwordHash: hash,
        isVerified: false,
        otp: { code: otpCode, expiresAt: otpExpiry }
      });
    } else {
      // update OTP and (optionally) update phone/name/password if provided
      if (password) {
        const salt = await bcrypt.genSalt(10);
        user.passwordHash = await bcrypt.hash(password, salt);
      }
      user.name = name || user.name;
      user.phone = phone || user.phone;
      user.otp = { code: otpCode, expiresAt: otpExpiry };
      user.isVerified = false;
    }

    await user.save();

    // send OTP email (may throw)
    try {
      await sendMail({
        to: emailLc,
        subject: 'Your Eternal Essence OTP',
        html: `<p>Hello ${user.name || ''},</p>
               <p>Your OTP to verify your Eternal Essence account is <strong>${otpCode}</strong>. It will expire in 10 minutes.</p>
               <p>If you did not request this, ignore this email.</p>`
      });
    } catch (emailErr) {
      console.error('Email send error:', emailErr);
      // still respond success so flow can proceed with OTP if you want — but inform client
      return res.status(500).json({ success: false, error: 'Server error while sending OTP email.' });
    }

    return res.json({ success: true, message: 'OTP sent to email.' });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ success: false, error: 'Server error during registration.' });
  }
}

export async function verifyOtpHandler(req, res) {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ success: false, error: 'Email and OTP are required.' });

    const emailLc = String(email).toLowerCase();
    const user = await User.findOne({ email: emailLc });
    if (!user) return res.status(404).json({ success: false, error: 'No user found.' });

    if (!user.otp || user.otp.code !== String(otp)) {
      return res.status(400).json({ success: false, error: 'Invalid OTP.' });
    }

    if (new Date() > new Date(user.otp.expiresAt)) {
      return res.status(400).json({ success: false, error: 'OTP has expired.' });
    }

    user.isVerified = true;
    user.otp = null;
    await user.save();

    // create JWT
    const token = jwt.sign({ id: user._id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '30d' });

    return res.json({ success: true, message: 'Account verified.', token, user: { email: user.email, name: user.name, phone: user.phone } });
  } catch (err) {
    console.error('Verify OTP error:', err);
    return res.status(500).json({ success: false, error: 'Server error during OTP verification.' });
  }
}

export async function loginHandler(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, error: 'Email and password required' });

    const emailLc = String(email).toLowerCase();
    const user = await User.findOne({ email: emailLc });
    if (!user) return res.status(400).json({ success: false, error: 'Invalid credentials' });

    const ok = await bcrypt.compare(password, user.passwordHash || '');
    if (!ok) return res.status(400).json({ success: false, error: 'Invalid credentials' });
    if (!user.isVerified) return res.status(403).json({ success: false, error: 'Account not verified. Please verify via OTP.' });

    const token = jwt.sign({ id: user._id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '30d' });
    return res.json({ success: true, token, user: { email: user.email, name: user.name, phone: user.phone } });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ success: false, error: 'Server error during login.' });
  }
}
