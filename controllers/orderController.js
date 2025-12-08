// controllers/orderController.js
import Razorpay from 'razorpay';
import crypto from 'crypto';
import dotenv from 'dotenv';
import Order from '../models/Order.js';

dotenv.config();

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || '';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';

const razorpay = new Razorpay({
  key_id: RAZORPAY_KEY_ID,
  key_secret: RAZORPAY_KEY_SECRET
});

function generateOrderId() {
  const year = new Date().getFullYear();
  const ts = Date.now().toString().slice(-6);
  return `EE-${year}-${ts}`;
}

// POST /api/orders/create-razorpay-order
export async function createRazorpayOrder(req, res) {
  try {
    const { cart = [], subtotal, discount, total, customer, couponCode } = req.body;

    if (!total || total <= 0) {
      return res.status(400).json({ error: 'Invalid total amount' });
    }

    const serverOrderId = generateOrderId();
    const amountPaise = total * 100;

    const options = {
      amount: amountPaise,
      currency: 'INR',
      receipt: serverOrderId
    };

    const rzpOrder = await razorpay.orders.create(options);

    const newOrder = new Order({
      orderId: serverOrderId,
      buyerEmail: (customer?.email || '').toLowerCase(),
      name: customer?.name || '',
      phone: customer?.phone || '',
      shippingAddress: customer?.address || '',
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
}

// POST /api/orders/verify-razorpay
export async function verifyRazorpay(req, res) {
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
}

// POST /api/orders/cod
export async function createCODOrder(req, res) {
  try {
    const { cart, subtotal, discount, total, customer, couponCode } = req.body;

    const serverOrderId = generateOrderId();

    const newOrder = new Order({
      orderId: serverOrderId,
      buyerEmail: (customer?.email || '').toLowerCase(),
      name: customer?.name || '',
      phone: customer?.phone || '',
      shippingAddress: customer?.address || '',
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
}

// GET /api/orders/my  (auth, by token email)
export async function getMyOrders(req, res) {
  try {
    const email = (req.user?.email || '').toLowerCase();
    if (!email) return res.status(400).json({ error: 'User email missing in token' });

    const list = await Order.find({ buyerEmail: email }).sort({ createdAt: -1 }).limit(100).lean();

    return res.json({ success: true, orders: list });
  } catch (err) {
    console.error('/api/orders/my error:', err);
    return res.status(500).json({ error: 'Could not fetch orders' });
  }
}
