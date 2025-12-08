// models/Order.js
import mongoose from 'mongoose';

const orderItemSchema = new mongoose.Schema(
  {
    productId: Number,
    name: String,
    size: String,
    price: Number,
    image: String
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderId: { type: String, required: true, unique: true },
    email: { type: String, required: true, lowercase: true },
    customerName: String,
    phone: String,
    address: String,

    items: [orderItemSchema],
    subtotal: Number,
    discount: Number,
    total: Number,
    couponCode: String,

    paymentMethod: { type: String, enum: ['Cash on Delivery', 'Razorpay Online Payment'], required: true },
    status: { type: String, default: 'Pending' },

    razorpayOrderId: String,
    razorpayPaymentId: String,
    razorpaySignature: String
  },
  { timestamps: true }
);

orderSchema.index({ email: 1, createdAt: -1 });

export const Order = mongoose.model('Order', orderSchema);
