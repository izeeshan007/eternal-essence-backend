// models/Order.js
import mongoose from 'mongoose';

const OrderSchema = new mongoose.Schema({
  orderId: { type: String, required: true, index: true },
  buyerEmail: { type: String, required: true, lowercase: true, trim: true },
  name: { type: String },
  phone: { type: String },
  shippingAddress: { type: String },
  items: { type: Array, default: [] },
  subtotal: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  paymentMethod: { type: String, default: 'Guest' },
  status: { type: String, default: 'Created' },
  razorpay_order_id: { type: String },
  razorpay_payment_id: { type: String },
  razorpay_signature: { type: String },
  metadata: { type: Object, default: {} }
}, { timestamps: true });

export default mongoose.models.Order || mongoose.model('Order', OrderSchema);
