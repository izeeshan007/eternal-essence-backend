// routes/orderRoutes.js
import express from 'express';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import { Order } from '../models/Order.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

let razorpayInstance = null;
if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
  razorpayInstance = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
  });
}

function generateOrderId() {
  const year = new Date().getFullYear();
  const random = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  return `EE-${year}-${random}`;
}

// Helper to build base order object from frontend payload
function buildOrderFromPayload(payload, email) {
  const { cart, subtotal, discount, total, customer, couponCode } = payload;

  return {
    orderId: generateOrderId(),
    email: email,
    customerName: customer?.name || '',
    phone: customer?.phone || '',
    address: customer?.address || '',
    items: cart || [],
    subtotal: subtotal || 0,
    discount: discount || 0,
    total: total || 0,
    couponCode: couponCode || null
  };
}

// POST /api/orders/cod
router.post('/cod', authMiddleware, async (req, res) => {
  try {
    const userEmail = req.user.email;
    const payload = req.body;

    const baseOrder = buildOrderFromPayload(payload, userEmail);
    baseOrder.paymentMethod = 'Cash on Delivery';
    baseOrder.status = 'Pending (COD)';

    const order = await Order.create(baseOrder);

    return res.json({
      success: true,
      message: 'COD order placed successfully.',
      orderId: order.orderId
    });
  } catch (err) {
    console.error('COD order error:', err);
    return res.status(500).json({ success: false, error: 'Could not place COD order.' });
  }
});

// POST /api/orders/create-razorpay-order
router.post('/create-razorpay-order', authMiddleware, async (req, res) => {
  try {
    if (!razorpayInstance) {
      return res.status(500).json({ success: false, error: 'Razorpay is not configured.' });
    }

    const userEmail = req.user.email;
    const payload = req.body;
    const baseOrder = buildOrderFromPayload(payload, userEmail);
    baseOrder.paymentMethod = 'Razorpay Online Payment';
    baseOrder.status = 'Created';

    const amount = Math.round((baseOrder.total || 0) * 100);
    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid amount.' });
    }

    // Create local DB order first
    const order = await Order.create(baseOrder);

    // Create Razorpay order
    const options = {
      amount,
      currency: 'INR',
      receipt: order.orderId,
      notes: { email: userEmail }
    };

    const rpOrder = await razorpayInstance.orders.create(options);

    // Save Razorpay order id
    order.razorpayOrderId = rpOrder.id;
    await order.save();

    return res.json({
      success: true,
      orderId: order.orderId,
      razorpayOrderId: rpOrder.id,
      amount: rpOrder.amount,
      currency: rpOrder.currency,
      keyId: process.env.RAZORPAY_KEY_ID
    });
  } catch (err) {
    console.error('Create Razorpay order error:', err);
    return res.status(500).json({ success: false, error: 'Could not create Razorpay order.' });
  }
});

// POST /api/orders/verify-razorpay
router.post('/verify-razorpay', authMiddleware, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ success: false, error: 'Missing Razorpay parameters.' });
    }

    const body = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ success: false, error: 'Invalid payment signature.' });
    }

    const order = await Order.findOne({ razorpayOrderId: razorpay_order_id, email: req.user.email });
    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found.' });
    }

    order.razorpayPaymentId = razorpay_payment_id;
    order.razorpaySignature = razorpay_signature;
    order.status = 'Payment Success (Online)';
    await order.save();

    return res.json({
      success: true,
      message: 'Payment verified successfully.',
      orderId: order.orderId
    });
  } catch (err) {
    console.error('Verify Razorpay error:', err);
    return res.status(500).json({ success: false, error: 'Payment verification failed.' });
  }
});

// GET /api/orders/my
router.get('/my', authMiddleware, async (req, res) => {
  try {
    // For security, we trust token email, ignore query param
    const email = req.user.email;

    const orders = await Order.find({ email }).sort({ createdAt: -1 });
    return res.json({ success: true, orders });
  } catch (err) {
    console.error('Get orders error:', err);
    return res.status(500).json({ success: false, error: 'Could not fetch orders.' });
  }
});

export default router;
