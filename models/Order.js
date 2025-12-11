// models/Order.js
import mongoose from 'mongoose';

const ItemSchema = new mongoose.Schema({
  productId: { type: Number },
  name: String,
  size: String,
  price: Number,
  image: String,
}, { _id: false });

const OrderSchema = new mongoose.Schema({
  orderId: { type: String, index: true }, // e.g. "EE-2025-..."
  buyerEmail: String,
  name: String, // customer name
  phone: String,
  shippingAddress: String, // full address string
  items: [ItemSchema],
  subtotal: Number,
  discount: Number,
  total: Number,
  paymentMethod: String,
  status: String,
  metadata: Object,
  razorpay_order_id: String,
  razorpay_payment_id: String,
  razorpay_signature: String,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

export default mongoose.models.Order || mongoose.model('Order', OrderSchema);
