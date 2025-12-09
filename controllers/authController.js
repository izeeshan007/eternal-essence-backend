// controllers/authController.js
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Otp from '../models/Otp.js';
import { sendOtpEmail } from '../utils/mailer.js';

const OTP_TTL_MINUTES = 10;
const RESET_TOKEN_TTL_MINUTES = 15;

function generateOtpCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function sendOtpHandler(req, res) {
  try {
    const { email, phone, purpose = 'signup' } = req.body;
    if (!email) return res.status(400).json({ success: false, error: 'Email is required.' });

    const code = generateOtpCode();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + OTP_TTL_MINUTES * 60 * 1000);

    await Otp.findOneAndUpdate(
      { email: email.toLowerCase(), purpose },
      { code, createdAt: now, expiresAt, attempts: 0 },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await sendOtpEmail({ to: email, code, purpose });
    console.log(`OTP sent for ${email} purpose=${purpose} code=${code}`);
    return res.json({ success: true, message: `OTP sent to ${email}` });
  } catch (err) {
    console.error('sendOtpHandler error', err);
    return res.status(500).json({ success: false, error: 'Server error while sending OTP email.' });
  }
}

export async function verifyOtpHandler(req, res) {
  try {
    const { email, otp, purpose = 'signup', name } = req.body;
    if (!email || !otp) return res.status(400).json({ success: false, error: 'Email and OTP are required.' });

    const record = await Otp.findOne({ email: email.toLowerCase(), purpose });
    if (!record) {
      console.log(`verifyOtp: no OTP record for ${email} purpose=${purpose}`);
      return res.status(400).json({ success: false, error: 'OTP not generated' });
    }

    if (new Date() > new Date(record.expiresAt)) {
      console.log(`verifyOtp: otp expired for ${email}`);
      return res.status(400).json({ success: false, error: 'OTP expired' });
    }

    if (record.code !== otp) {
      await Otp.updateOne({ _id: record._id }, { $inc: { attempts: 1 } });
      return res.status(400).json({ success: false, error: 'Invalid OTP' });
    }

    // valid OTP: delete record
    await Otp.deleteOne({ _id: record._id });

    // Purpose-based handling
    if (purpose === 'signup') {
      let user = await User.findOne({ email: email.toLowerCase() });
      if (!user) {
        user = new User({ email: email.toLowerCase(), name: name || '', isVerified: true });
        await user.save();
      } else {
        user.isVerified = true;
        await user.save();
      }
      const token = jwt.sign({ id: user._id, email: user.email }, process.env.JWT_SECRET || 'devsecret', { expiresIn: '30d' });
      return res.json({ success: true, message: 'OTP verified', token, user: { email: user.email, id: user._id, name: user.name } });
    }

    if (purpose === 'guest') {
      let user = await User.findOne({ email: email.toLowerCase() });
      if (!user) {
        user = new User({ email: email.toLowerCase(), name: name || 'Guest', isVerified: true });
        await user.save();
      }
      const token = jwt.sign({ id: user._id, email: user.email }, process.env.JWT_SECRET || 'devsecret', { expiresIn: '7d' });
      return res.json({ success: true, message: 'Guest verified', token, user: { email: user.email, id: user._id } });
    }

    if (purpose === 'reset') {
      // return a short-lived reset token (JWT) which client will use to change password
      const user = await User.findOne({ email: email.toLowerCase() });
      if (!user) {
        // create a stub? Usually we fail if no account exists for reset
        return res.status(404).json({ success: false, error: 'No account found for this email.' });
      }
      const resetToken = jwt.sign({ id: user._id, email: user.email, reset: true }, process.env.JWT_SECRET || 'devsecret', { expiresIn: `${RESET_TOKEN_TTL_MINUTES}m` });
      return res.json({ success: true, message: 'OTP verified for reset', resetToken });
    }

    return res.json({ success: true, message: 'OTP verified' });
  } catch (err) {
    console.error('verifyOtpHandler error', err);
    return res.status(500).json({ success: false, error: 'Server error during OTP verification.' });
  }
}

export async function registerHandler(req, res) {
  try {
    const { name, email, phone, password } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, error: 'Email and password required' });

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(409).json({ success: false, error: 'User already exists' });

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const user = new User({ name, email: email.toLowerCase(), phone, passwordHash, isVerified: false });
    await user.save();

    // create + send OTP for signup
    const code = generateOtpCode();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + OTP_TTL_MINUTES * 60 * 1000);

    await Otp.findOneAndUpdate(
      { email: email.toLowerCase(), purpose: 'signup' },
      { code, createdAt: now, expiresAt, attempts: 0 },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await sendOtpEmail({ to: email, code, purpose: 'signup' });
    return res.json({ success: true, message: 'OTP sent to your email. Please verify to complete registration.' });
  } catch (err) {
    console.error('registerHandler error', err);
    return res.status(500).json({ success: false, error: 'Server error during registration.' });
  }
}

export async function loginHandler(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, error: 'Email and password are required.' });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(400).json({ success: false, error: 'Invalid credentials.' });

    const ok = await bcrypt.compare(password, user.passwordHash || '');
    if (!ok) return res.status(400).json({ success: false, error: 'Invalid credentials.' });

    if (!user.isVerified) return res.status(403).json({ success: false, error: 'Account not verified. Please verify using OTP.' });

    const token = jwt.sign({ id: user._id, email: user.email }, process.env.JWT_SECRET || 'devsecret', { expiresIn: '30d' });
    return res.json({ success: true, token, user: { id: user._id, email: user.email, name: user.name } });
  } catch (err) {
    console.error('loginHandler error', err);
    return res.status(500).json({ success: false, error: 'Server error during login.' });
  }
}

// reset password: need resetToken (from verify OTP purpose reset) + newPassword
export async function resetPasswordHandler(req, res) {
  try {
    const { email, resetToken, newPassword } = req.body;
    if (!email || !resetToken || !newPassword) return res.status(400).json({ success: false, error: 'Missing parameters.' });

    try {
      const payload = jwt.verify(resetToken, process.env.JWT_SECRET || 'devsecret');
      if (!payload || !payload.reset || payload.email !== email.toLowerCase()) {
        return res.status(400).json({ success: false, error: 'Invalid reset token.' });
      }
    } catch (err) {
      return res.status(400).json({ success: false, error: 'Reset token invalid or expired.' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(404).json({ success: false, error: 'User not found.' });

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);
    user.passwordHash = passwordHash;
    await user.save();

    return res.json({ success: true, message: 'Password updated successfully.' });
  } catch (err) {
    console.error('resetPasswordHandler error', err);
    return res.status(500).json({ success: false, error: 'Server error updating password.' });
  }
}

/* PROFILE / WISHLIST endpoints (small helpers) */

export async function getProfileHandler(req, res) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'Missing token.' });

    let payload;
    try { payload = jwt.verify(token, process.env.JWT_SECRET || 'devsecret'); } catch (e) { return res.status(401).json({ success: false, error: 'Invalid token.' }); }

    const user = await User.findById(payload.id).select('-passwordHash');
    if (!user) return res.status(404).json({ success: false, error: 'User not found.' });

    return res.json({ success: true, user });
  } catch (err) {
    console.error('getProfileHandler error', err);
    return res.status(500).json({ success: false, error: 'Server error.' });
  }
}

export async function updateProfileHandler(req, res) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'Missing token.' });

    let payload;
    try { payload = jwt.verify(token, process.env.JWT_SECRET || 'devsecret'); } catch (e) { return res.status(401).json({ success: false, error: 'Invalid token.' }); }

    const { name, phone, address } = req.body;
    const user = await User.findById(payload.id);
    if (!user) return res.status(404).json({ success: false, error: 'User not found.' });

    if (typeof name === 'string') user.name = name;
    if (typeof phone === 'string') user.phone = phone;
    if (address && typeof address === 'object') user.address = address;

    await user.save();
    return res.json({ success: true, user: { id: user._id, email: user.email, name: user.name, phone: user.phone, address: user.address } });
  } catch (err) {
    console.error('updateProfileHandler error', err);
    return res.status(500).json({ success: false, error: 'Server error.' });
  }
}

export async function addToWishlistHandler(req, res) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'Missing token.' });

    let payload;
    try { payload = jwt.verify(token, process.env.JWT_SECRET || 'devsecret'); } catch (e) { return res.status(401).json({ success: false, error: 'Invalid token.' }); }

    const { productId } = req.body;
    if (typeof productId !== 'number') return res.status(400).json({ success: false, error: 'productId (number) required.' });

    const user = await User.findById(payload.id);
    if (!user) return res.status(404).json({ success: false, error: 'User not found.' });

    if (!user.wishlist) user.wishlist = [];
    if (!user.wishlist.includes(productId)) user.wishlist.push(productId);
    await user.save();

    return res.json({ success: true, wishlist: user.wishlist });
  } catch (err) {
    console.error('addToWishlistHandler error', err);
    return res.status(500).json({ success: false, error: 'Server error.' });
  }
}

export async function removeFromWishlistHandler(req, res) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'Missing token.' });

    let payload;
    try { payload = jwt.verify(token, process.env.JWT_SECRET || 'devsecret'); } catch (e) { return res.status(401).json({ success: false, error: 'Invalid token.' }); }

    const { productId } = req.body;
    if (typeof productId !== 'number') return res.status(400).json({ success: false, error: 'productId (number) required.' });

    const user = await User.findById(payload.id);
    if (!user) return res.status(404).json({ success: false, error: 'User not found.' });

    user.wishlist = (user.wishlist || []).filter(id => id !== productId);
    await user.save();

    return res.json({ success: true, wishlist: user.wishlist });
  } catch (err) {
    console.error('removeFromWishlistHandler error', err);
    return res.status(500).json({ success: false, error: 'Server error.' });
  }
}
