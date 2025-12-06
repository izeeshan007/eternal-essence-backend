// server.js


require('dotenv').config();
const express = require('express');
const Razorpay = require('razorpay');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');

const User = require('./models/User');


const Order = require('./models/Order');

function generateOrderId() {
  const year = new Date().getFullYear();
  const ts = Date.now().toString().slice(-6);
  return `EE-${year}-${ts}`;
}

// New: create OTP
function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit
}

// New: send OTP email
async function sendOtpEmail(toEmail, name, otp) {
  if (!mailerReady) {
    console.warn('Mailer not configured, cannot send OTP');
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

// New: create JWT
function createJwt(user) {
  return jwt.sign(
    {
      userId: user._id.toString(),
      email: user.email
    },
    JWT_SECRET,
    { expiresIn: '7d' } // 7 days
  );
}

// New: auth middleware
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }
  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    console.error('JWT verify error:', err.message);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}


const app = express();
app.use(bodyParser.json({ limit: '1mb' }));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors({
  origin: process.env.FRONTEND_ORIGIN || '*'
}));

// ====== ENV VARS ======
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI;
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('❌ Missing JWT_SECRET in .env');
  process.exit(1);
}

const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;

let mailerReady = false;
let transporter = null;

if (EMAIL_USER && EMAIL_PASS) {
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: EMAIL_USER,
      pass: EMAIL_PASS
    }
  });
  mailerReady = true;
} else {
  console.warn('⚠️ EMAIL_USER or EMAIL_PASS not set – OTP emails will not be sent.');
}


// ====== VALIDATION ======
if (!MONGODB_URI) {
  console.error('❌ Missing MONGODB_URI in .env');
  process.exit(1);
}
if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
  console.warn('⚠️ Razorpay keys missing – online payments will not work until added.');
}

// ====== MONGODB CONNECTION ======
mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('✅ MongoDB connected successfully'))
  .catch(err => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  });

// ====== RAZORPAY INSTANCE ======
const razorpay = new Razorpay({
  key_id: RAZORPAY_KEY_ID || '',
  key_secret: RAZORPAY_KEY_SECRET || ''
});

// ====== ROOT ENDPOINT ======
app.get('/', (req, res) => {
  res.send('<h2>Eternal Essence Backend Running</h2><p>Use /api/orders endpoints.</p>');
});


// ========== AUTH: REGISTER ==========
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    let existing = await User.findOne({ email: normalizedEmail });
    if (existing && existing.isVerified) {
      return res.status(400).json({ error: 'Account already exists. Please login.' });
    }

    if (!existing) {
      // create new user
      const passwordHash = await bcrypt.hash(password, 10);
      existing = new User({
        email: normalizedEmail,
        passwordHash,
        name: name || '',
        phone: phone || '',
        isVerified: false
      });
    } else {
      // user exists but not verified – update password/name/phone
      existing.passwordHash = await bcrypt.hash(password, 10);
      existing.name = name || existing.name;
      existing.phone = phone || existing.phone;
    }

    // generate OTP
    const otp = generateOtp();
    const otpHash = await bcrypt.hash(otp, 10);
    const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

    existing.otpHash = otpHash;
    existing.otpExpiresAt = expires;
    await existing.save();

    // send OTP email
    try {
      await sendOtpEmail(normalizedEmail, existing.name, otp);
    } catch (errMail) {
      console.error('Error sending OTP email:', errMail.message);
      // still respond success but note it
      return res.status(500).json({
        error: 'Could not send OTP email. Please try again later.'
      });
    }

    return res.json({
      success: true,
      message: 'OTP sent to your email. Please verify to activate your account.'
    });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ error: 'Registration failed' });
  }
});


// ========== AUTH: VERIFY OTP ==========
app.post('/api/auth/verify-otp', async (req, res) => {
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
});


// ========== AUTH: LOGIN ==========
app.post('/api/auth/login', async (req, res) => {
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
});

// ========== AUTH: CURRENT USER ==========
app.get('/api/auth/me', authMiddleware, async (req, res) => {
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
});


// ========== GET MY ORDERS (AUTH REQUIRED) ==========
app.get('/api/orders/my', authMiddleware, async (req, res) => {
  try {
    const email = (req.user.email || '').toString().trim().toLowerCase();
    if (!email) {
      return res.status(400).json({ error: 'User email missing from token' });
    }

    const list = await Order.find({ buyerEmail: email })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    return res.json({ success: true, orders: list });
  } catch (err) {
    console.error('/my orders error:', err);
    return res
      .status(500)
      .json({ error: 'Could not fetch orders', details: err.message });
  }
});



// ====== CREATE RAZORPAY ORDER ======
app.post('/api/orders/create-razorpay-order', async (req, res) => {
  try {
    const { cart = [], subtotal, discount, total, customer, couponCode } = req.body;

    if (!total || total <= 0) {
      return res.status(400).json({ error: 'Invalid total amount' });
    }

    const serverOrderId = `EE-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
    const amountPaise = total * 100;

    const options = {
      amount: amountPaise,
      currency: 'INR',
      receipt: serverOrderId
    };

    const rzpOrder = await razorpay.orders.create(options);

    const newOrder = new Order({
      orderId: serverOrderId,
      buyerEmail: customer.email,
      name: customer.name,
      phone: customer.phone,
      shippingAddress: customer.address,
      items: cart,
      subtotal,
      discount,
      total,
      paymentMethod: 'Razorpay',
      status: 'Created',
      razorpay_order_id: rzpOrder.id,
      metadata: { couponCode }
    });

    await newOrder.save();

    return res.json({
      success: true,
      orderId: serverOrderId,
      razorpayOrderId: rzpOrder.id,
      amount: rzpOrder.amount,
      keyId: RAZORPAY_KEY_ID
    });

  } catch (err) {
    console.error('❌ Error creating Razorpay order:', err);
    return res.status(500).json({ error: 'Could not create Razorpay order' });
  }
});

// ====== VERIFY RAZORPAY PAYMENT ======
app.post('/api/orders/verify-razorpay', async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    const hmac = crypto.createHmac('sha256', RAZORPAY_KEY_SECRET);
    hmac.update(`${razorpay_order_id}|${razorpay_payment_id}`);
    const expectedSig = hmac.digest('hex');

    if (expectedSig !== razorpay_signature) {
      return res.status(400).json({ error: 'Invalid signature' });
    }

    const order = await Order.findOneAndUpdate(
      { razorpay_order_id },
      {
        status: 'Payment Success',
        razorpay_payment_id,
        razorpay_signature
      },
      { new: true }
    );

    if (!order) return res.status(404).json({ error: 'Order not found' });

    return res.json({ success: true, message: 'Payment verified', orderId: order.orderId });

  } catch (err) {
    console.error('❌ Error verifying Razorpay:', err);
    return res.status(500).json({ error: 'Verification failed' });
  }
});

// ====== CASH ON DELIVERY ======
app.post('/api/orders/cod', async (req, res) => {
  try {
    const { cart, subtotal, discount, total, customer, couponCode } = req.body;

    const serverOrderId = `EE-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;

    const newOrder = new Order({
      orderId: serverOrderId,
      buyerEmail: customer.email,
      name: customer.name,
      phone: customer.phone,
      shippingAddress: customer.address,
      items: cart,
      subtotal,
      discount,
      total,
      paymentMethod: 'Cash on Delivery',
      status: 'Pending (COD)',
      metadata: { couponCode }
    });

    await newOrder.save();

    return res.json({ success: true, orderId: serverOrderId });

  } catch (err) {
    console.error('❌ COD error:', err);
    return res.status(500).json({ error: 'Could not create COD order' });
  }
});

// ====== FETCH ORDERS BY EMAIL ======
app.get('/api/orders/my', async (req, res) => {
  try {
    const email = req.query.email?.toLowerCase();
    if (!email) return res.status(400).json({ error: 'Email required' });

    const list = await Order.find({ buyerEmail: email }).sort({ createdAt: -1 });

    return res.json({ success: true, orders: list });

  } catch (err) {
    console.error('❌ Fetch orders error:', err);
    return res.status(500).json({ error: 'Could not fetch orders' });
  }
});

// ====== START SERVER ======
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
