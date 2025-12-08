// controllers/authController.js
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import User from '../models/User.js';

const JWT_SECRET = process.env.JWT_SECRET;
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;

if (!JWT_SECRET) {
  console.error('❌ JWT_SECRET not set in env');
}

// ========= Email Transport (Gmail) =========
let transporter = null;

if (EMAIL_USER && EMAIL_PASS) {
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: EMAIL_USER,
      pass: EMAIL_PASS
    }
  });

  transporter.verify((err, success) => {
    if (err) {
      console.error('❌ Error verifying mail transporter:', err);
    } else {
      console.log('✅ Mail transporter ready (Gmail)');
    }
  });
} else {
  console.warn('⚠️ EMAIL_USER or EMAIL_PASS not set — OTP emails will not be sent.');
}

// ========= Helper functions =========
function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString(); // 6 digits
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

async function sendOtpEmail(toEmail, name, otp) {
  if (!transporter) {
    console.warn('⚠️ No transporter configured — skipping OTP email send');
    return;
  }

  const mailOptions = {
    from: `"Eternal Essence" <${EMAIL_USER}>`,
    to: toEmail,
    subject: 'Your Eternal Essence Verification OTP',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;border:1px solid #eee;padding:20px;">
        <h2 style="text-align:center;color:#222;">Eternal Essence</h2>
        <p>Hi ${name || 'there'},</p>
        <p>Thank you for creating an account with <strong>Eternal Essence</strong>.</p>
        <p>Your verification OTP is:</p>
        <p style="font-size:32px;font-weight:bold;text-align:center;letter-spacing:4px;">${otp}</p>
        <p>This OTP is valid for 10 minutes. If you did not request this, you can ignore this email.</p>
        <br/>
        <p style="font-size:12px;color:#888;">Byculla, Mumbai • Essence, Redefined.</p>
      </div>
    `
  };

  await transporter.sendMail(mailOptions);
}

// ========= Controllers =========

// POST /api/auth/register
export const register = async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    let existing = await User.findOne({ email: normalizedEmail });

    // Verified user already exists
    if (existing && existing.isVerified) {
      return res.status(400).json({ error: 'Account already exists. Please login.' });
    }

    // If no user yet, create new
    if (!existing) {
      const passwordHash = await bcrypt.hash(password, 10);
      existing = new User({
        email: normalizedEmail,
        passwordHash,
        name: name || '',
        phone: phone || '',
        isVerified: false
      });
    } else {
      // User exists but not verified -> update password/name/phone
      existing.passwordHash = await bcrypt.hash(password, 10);
      existing.name = name || existing.name;
      existing.phone = phone || existing.phone;
    }

    // Generate OTP
    const otp = generateOtp();
    const otpHash = await bcrypt.hash(otp, 10);
    const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

    existing.otpHash = otpHash;
    existing.otpExpiresAt = expires;
    await existing.save();

    try {
      await sendOtpEmail(normalizedEmail, existing.name, otp);
    } catch (mailErr) {
      console.error('❌ Error sending OTP email:', mailErr);
      return res.status(500).json({
        error: 'Could not send OTP email. Please check your email configuration.'
      });
    }

    return res.json({
      success: true,
      message: 'OTP sent to your email. Please verify to activate your account.'
    });
  } catch (err) {
    console.error('❌ Register error:', err);
    return res.status(500).json({ error: 'Registration failed on server.' });
  }
};

// POST /api/auth/verify-otp
export const verifyOtp = async (req, res) => {
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
    console.error('❌ Verify OTP error:', err);
    return res.status(500).json({ error: 'Failed to verify OTP on server.' });
  }
};

// POST /api/auth/login
export const login = async (req, res) => {
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
      return res
        .status(403)
        .json({ error: 'Please verify your email via OTP before login.' });
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
    console.error('❌ Login error:', err);
    return res.status(500).json({ error: 'Login failed on server.' });
  }
};

// GET /api/auth/me
export const getMe = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const user = await User.findById(userId).lean();
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
    console.error('❌ getMe error:', err);
    return res.status(500).json({ error: 'Failed to fetch user info.' });
  }
};
