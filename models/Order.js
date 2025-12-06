// models/Order.js
const mongoose = require('mongoose');

const OrderSchema = new mongoose.Schema({
  orderId: { type: String, required: true, unique: true },
  createdAt: { type: Date, default: Date.now },
  buyerEmail: { type: String, required: true },
  name: String,
  phone: String,
  shippingAddress: String,
  items: { type: Array, default: [] },
  subtotal: Number,
  discount: Number,
  total: Number,
  paymentMethod: String,
  status: String,
  razorpay_payment_id: String,
  razorpay_order_id: String,
  razorpay_signature: String,
  metadata: { type: Object, default: {} }
}, { collection: 'orders' });

module.exports = mongoose.model('Order', OrderSchema);
