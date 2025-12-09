// models/User.js
import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  name: { type: String, default: '' },
  email: { type: String, unique: true, required: true, lowercase: true, trim: true },
  phone: { type: String, default: '' },
  passwordHash: { type: String, default: '' },
  isVerified: { type: Boolean, default: false },
  wishlist: [{ type: Number }], // store product ids (match frontend product ids)
  address: {
    name: String,
    phone: String,
    addressLine: String,
    city: String,
    pincode: String,
    state: String
  },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.models.User || mongoose.model('User', userSchema);
