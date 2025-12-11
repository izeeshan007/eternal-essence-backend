// controllers/authController.js
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Otp from '../models/Otp.js';
import { sendOtpEmail } from '../utils/mailer.js'; // keep your existing mailer
import { ENV } from '../config/env.js';

const OTP_TTL_MINUTES = 10;
const RESET_TOKEN_TTL_MINUTES = 15;
const JWT_SECRET = process.env.JWT_SECRET || ENV.JWT_SECRET || 'devsecret';

/* helpers */
function generateOtpCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function signJwt(payload, expiresIn = '30d') {
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

/* ========== SEND OTP (generic) ========== */
export async function sendOtpHandler(req, res) {
  try {
    const { email, phone, purpose = 'signup', name } = req.body;
    if (!email) return res.status(400).json({ success: false, error: 'Email is required.' });

    const normalized = email.toLowerCase().trim();
    const code = generateOtpCode();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + OTP_TTL_MINUTES * 60 * 1000);

    await Otp.findOneAndUpdate(
      { email: normalized, purpose },
      { code, createdAt: now, expiresAt, attempts: 0 },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // attempt to send email using existing mailer helper shape
    try {
      // keep existing signature (your code base calls sendOtpEmail({ to, code, purpose }) in many places)
      await sendOtpEmail({ to: normalized, code, purpose, name });
    } catch (mailErr) {
      console.warn('sendOtp email failed:', mailErr && mailErr.message);
      // continue, OTP record exists regardless — caller can retry
    }

    return res.json({ success: true, message: `OTP sent to ${normalized}` });
  } catch (err) {
    console.error('sendOtpHandler error', err);
    return res.status(500).json({ success: false, error: 'Server error while sending OTP email.' });
  }
}

/* ========== VERIFY OTP ========== */
export async function verifyOtpHandler(req, res) {
  try {
    const { email, otp, purpose = 'signup', name } = req.body;
    if (!email || !otp) return res.status(400).json({ success: false, error: 'Email and OTP are required.' });

    const normalized = email.toLowerCase().trim();
    const record = await Otp.findOne({ email: normalized, purpose });
    if (!record) return res.status(400).json({ success: false, error: 'OTP not generated' });

    if (new Date() > new Date(record.expiresAt)) {
      await Otp.deleteOne({ _id: record._id }).catch(()=>{});
      return res.status(400).json({ success: false, error: 'OTP expired' });
    }

    if (record.code !== otp) {
      await Otp.updateOne({ _id: record._id }, { $inc: { attempts: 1 } });
      return res.status(400).json({ success: false, error: 'Invalid OTP' });
    }

    // valid OTP -> remove it
    await Otp.deleteOne({ _id: record._id });

    /* Handle purposes */
    if (purpose === 'signup') {
      let user = await User.findOne({ email: normalized });
      if (!user) {
        user = new User({ email: normalized, name: name || '', isVerified: true });
        await user.save();
      } else {
        // mark verified and keep other fields intact
        user.isVerified = true;
        await user.save();
      }
      const token = signJwt({ id: user._id, email: user.email }, '30d');
      return res.json({ success: true, message: 'OTP verified', token, user: { email: user.email, id: user._id, name: user.name } });
    }

    if (purpose === 'guest') {
      let user = await User.findOne({ email: normalized });
      if (!user) {
        user = new User({ email: normalized, name: name || 'Guest', isVerified: true });
        await user.save();
      }
      const token = signJwt({ id: user._id, email: user.email, guest: true }, '7d');
      return res.json({ success: true, message: 'Guest verified', token, user: { email: user.email, id: user._id } });
    }

    if (purpose === 'reset') {
      const user = await User.findOne({ email: normalized });
      if (!user) return res.status(404).json({ success: false, error: 'No account found for this email.' });

      const resetToken = signJwt({ id: user._id, email: user.email, reset: true }, `${RESET_TOKEN_TTL_MINUTES}m`);
      return res.json({ success: true, message: 'OTP verified for reset', resetToken });
    }

    // default
    return res.json({ success: true, message: 'OTP verified' });
  } catch (err) {
    console.error('verifyOtpHandler error', err);
    return res.status(500).json({ success: false, error: 'Server error during OTP verification.' });
  }
}



/**
 * POST /api/auth/verify-reset-otp
 * body: { email, otp }
 * Verifies an OTP with purpose='reset' and returns a short-lived resetToken JWT
 */
export async function verifyResetOtpHandler(req, res) {
  try {
    const { email, otp } = req.body || {};
    if (!email || !otp) return res.status(400).json({ success: false, error: 'Email and OTP are required.' });

    const record = await Otp.findOne({ email: email.toLowerCase(), purpose: 'reset' });
    if (!record) {
      console.log(`verifyResetOtp: no OTP record for ${email}`);
      return res.status(400).json({ success: false, error: 'OTP not generated.' });
    }

    if (new Date() > new Date(record.expiresAt)) {
      console.log(`verifyResetOtp: otp expired for ${email}`);
      return res.status(400).json({ success: false, error: 'OTP expired.' });
    }

    if (record.code !== String(otp).trim()) {
      await Otp.updateOne({ _id: record._id }, { $inc: { attempts: 1 } });
      return res.status(400).json({ success: false, error: 'Invalid OTP.' });
    }

    // valid OTP -> delete record and issue short-lived reset JWT
    await Otp.deleteOne({ _id: record._id });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(404).json({ success: false, error: 'No account found for this email.' });

    const resetToken = jwt.sign(
      { id: user._id, email: user.email, reset: true },
      process.env.JWT_SECRET || 'devsecret',
      { expiresIn: '15m' } // keep this consistent with RESET_TOKEN_TTL_MINUTES if defined
    );

    return res.json({ success: true, message: 'OTP verified for reset', resetToken });
  } catch (err) {
    console.error('verifyResetOtpHandler error', err);
    return res.status(500).json({ success: false, error: 'Server error during OTP verification.' });
  }
}


/* ========== REGISTER ========== */
/**
 * registerHandler:
 * - If user exists & isVerified => 409
 * - If user exists & !isVerified => update passwordHash and resend OTP instead of blocking
 * - If new user => create user with isVerified=false, save passwordHash, create OTP and send
 */
export async function registerHandler(req, res) {
  try {
    const { name, email, phone, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ success: false, error: 'Email and password required' });

    const normalized = email.toLowerCase().trim();
    const existing = await User.findOne({ email: normalized });

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    if (existing) {
      if (existing.isVerified) {
        return res.status(409).json({ success: false, error: 'User already exists' });
      } else {
        // existing but not verified -> update their passwordHash + name/phone and (re)send OTP
        existing.passwordHash = passwordHash;
        if (typeof name === 'string' && name) existing.name = name;
        if (typeof phone === 'string' && phone) existing.phone = phone;
        await existing.save();

        // create OTP record
        const code = generateOtpCode();
        const now = new Date();
        const expiresAt = new Date(now.getTime() + OTP_TTL_MINUTES * 60 * 1000);
        await Otp.findOneAndUpdate(
          { email: normalized, purpose: 'signup' },
          { code, createdAt: now, expiresAt, attempts: 0 },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        try { await sendOtpEmail({ to: normalized, code, purpose: 'signup', name }); } catch (e){ console.warn('resend signup OTP mail failed', e?.message || e); }
        return res.json({ success: true, message: 'Existing unverified account updated. OTP resent to email.' });
      }
    }

    // create a new user record (unverified)
    const user = new User({ name, email: normalized, phone, passwordHash, isVerified: false });
    await user.save();

    const code = generateOtpCode();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + OTP_TTL_MINUTES * 60 * 1000);

    await Otp.findOneAndUpdate(
      { email: normalized, purpose: 'signup' },
      { code, createdAt: now, expiresAt, attempts: 0 },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    try { await sendOtpEmail({ to: normalized, code, purpose: 'signup', name }); } catch (e){ console.warn('signup OTP mail failed', e?.message || e); }

    return res.json({ success: true, message: 'OTP sent to your email. Please verify to complete registration.' });
  } catch (err) {
    console.error('registerHandler error', err);
    // handle duplicate key gracefully
    if (String(err).includes('E11000') || String(err).includes('duplicate')) {
      return res.status(409).json({ success: false, error: 'User already exists' });
    }
    return res.status(500).json({ success: false, error: 'Server error during registration.' });
  }
}

/* ========== LOGIN ========== */
export async function loginHandler(req, res) {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ success: false, error: 'Email and password are required.' });

    const normalized = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalized });
    if (!user) return res.status(400).json({ success: false, error: 'Invalid credentials.' });

    const ok = await bcrypt.compare(password, user.passwordHash || '');
    if (!ok) return res.status(400).json({ success: false, error: 'Invalid credentials.' });

    // normalize isVerified (avoid undefined)
    const verified = !!user.isVerified;
    if (!verified) return res.status(403).json({ success: false, error: 'Account not verified. Please verify using OTP.' });

    const token = signJwt({ id: user._id, email: user.email }, '30d');
    return res.json({ success: true, token, user: { id: user._id, email: user.email, name: user.name, phone: user.phone } });
  } catch (err) {
    console.error('loginHandler error', err);
    return res.status(500).json({ success: false, error: 'Server error during login.' });
  }
}



/* ========== FORGOT PASSWORD (send OTP) ========== */
export async function forgotPasswordHandler(req, res) {
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ success: false, error: 'Email is required.' });

    const normalized = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalized });
    if (!user) return res.status(404).json({ success: false, error: 'No account found for this email.' });

    const code = generateOtpCode();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + OTP_TTL_MINUTES * 60 * 1000);

    await Otp.findOneAndUpdate(
      { email: normalized, purpose: 'reset' },
      { code, createdAt: now, expiresAt, attempts: 0 },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    try { await sendOtpEmail({ to: normalized, code, purpose: 'reset', name: user.name }); } catch (e){ console.warn('forgot pwd mail failed', e?.message || e); }

    return res.json({ success: true, message: `OTP sent to ${normalized}` });
  } catch (err) {
    console.error('forgotPasswordHandler error', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}

/* ========== RESET PASSWORD (requires resetToken from verify OTP purpose=reset) ========== */
export async function resetPasswordHandler(req, res) {
  try {
    const { email, resetToken, newPassword } = req.body || {};
    if (!email || !resetToken || !newPassword) return res.status(400).json({ success: false, error: 'Missing parameters.' });

    try {
      const payload = jwt.verify(resetToken, JWT_SECRET);
      if (!payload || !payload.reset || payload.email !== email.toLowerCase()) {
        return res.status(400).json({ success: false, error: 'Invalid reset token.' });
      }
    } catch (err) {
      return res.status(400).json({ success: false, error: 'Reset token invalid or expired.' });
    }

    const normalized = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalized });
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

/* ========== PROFILE & HELPERS ========== */
export async function getProfileHandler(req, res) {
  try {
    // token comes from Authorization header or middleware decoding
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) return res.status(401).json({ success: false, error: 'Missing token.' });

    let payload;
    try { payload = jwt.verify(token, JWT_SECRET); } catch (e) { return res.status(401).json({ success: false, error: 'Invalid token.' }); }

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
    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) return res.status(401).json({ success: false, error: 'Missing token.' });

    let payload;
    try { payload = jwt.verify(token, JWT_SECRET); } catch (e) { return res.status(401).json({ success: false, error: 'Invalid token.' }); }

    const { name, phone, address } = req.body;
    const user = await User.findById(payload.id);
    if (!user) return res.status(404).json({ success: false, error: 'User not found.' });

    if (typeof name === 'string') user.name = name;
    if (typeof phone === 'string') user.phone = phone;
    if (address && typeof address === 'object') {
      user.address = {
        name: address.name || user.address?.name || '',
        phone: address.phone || user.address?.phone || '',
        addressLine: address.addressLine || user.address?.addressLine || '',
        city: address.city || user.address?.city || '',
        pincode: address.pincode || user.address?.pincode || '',
        state: address.state || user.address?.state || ''
      };
    }

    await user.save();
    return res.json({ success: true, user: { id: user._id, email: user.email, name: user.name, phone: user.phone, address: user.address } });
  } catch (err) {
    console.error('updateProfileHandler error', err);
    return res.status(500).json({ success: false, error: 'Server error.' });
  }
}


/* ================= WISHLIST HANDLERS ================= */
// Assumes User model is already imported earlier in this file
// and JWT_SECRET / signJwt helpers are present.

function extractUserIdFromAuthHeader(req) {
  const authHeader = req.headers.authorization || req.headers.Authorization || '';
  const token = String(authHeader).replace(/^Bearer\s*/i, '').trim();
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    return payload?.id || null;
  } catch (e) {
    return null;
  }
}

/**
 * GET /api/auth/wishlist
 * Returns array of wishlist product ids for the authenticated user
 */
export async function getWishlistHandler(req, res) {
  try {
    // prefer middleware decoded id if you have one (req.user / req.admin), else extract from header
    const userId = (req.user && req.user.id) || extractUserIdFromAuthHeader(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const user = await User.findById(userId).select('wishlist email name');
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    return res.json({ success: true, wishlist: user.wishlist || [], user: { id: user._id, email: user.email, name: user.name } });
  } catch (err) {
    console.error('getWishlistHandler error', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}

/**
 * POST /api/auth/wishlist
 * body: { productId: number }
 * Adds productId to user's wishlist (if not present)
 */
export async function addToWishlistHandler(req, res) {
  try {
    const userId = (req.user && req.user.id) || extractUserIdFromAuthHeader(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const { productId } = req.body || {};
    if (typeof productId === 'undefined' || productId === null) return res.status(400).json({ success: false, error: 'productId required' });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    // keep wishlist unique and as numbers
    const pid = Number(productId);
    user.wishlist = Array.isArray(user.wishlist) ? user.wishlist.map(Number) : [];
    if (!user.wishlist.includes(pid)) user.wishlist.push(pid);

    await user.save();
    return res.json({ success: true, message: 'Added to wishlist', wishlist: user.wishlist });
  } catch (err) {
    console.error('addToWishlistHandler error', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}

/**
 * DELETE /api/auth/wishlist/:productId
 * Removes productId from wishlist
 */
export async function removeFromWishlistHandler(req, res) {
  try {
    const userId = (req.user && req.user.id) || extractUserIdFromAuthHeader(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const productId = req.params.productId || req.body.productId;
    if (typeof productId === 'undefined' || productId === null) return res.status(400).json({ success: false, error: 'productId required' });

    const pid = Number(productId);
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    user.wishlist = (user.wishlist || []).map(Number).filter(x => x !== pid);
    await user.save();
    return res.json({ success: true, message: 'Removed from wishlist', wishlist: user.wishlist });
  } catch (err) {
    console.error('removeFromWishlistHandler error', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
