// models/Order.js
import mongoose from 'mongoose';

const itemSchema = new mongoose.Schema(
  {
    productId: Number,
    name: String,
    selectedSize: String,
    finalPrice: Number,
    quantity: { type: Number, default: 1 },
    image: String
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderId: { type: String, required: true, unique: true },
    buyerEmail: { type: String, required: true, lowercase: true, trim: true },
    name: String,
    phone: String,

    shippingAddress: String,

    items: [itemSchema],

    subtotal: Number,
    discount: Number,
    total: Number,

    paymentMethod: String,
    status: String,

    razorpay_order_id: String,
    razorpay_payment_id: String,
    razorpay_signature: String,

    metadata: mongoose.Schema.Types.Mixed
  },
  { timestamps: true }
);

const Order = mongoose.model('Order', orderSchema);
export default Order;
