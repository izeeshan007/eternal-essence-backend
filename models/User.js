// models/User.js
import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true, index: true, required: true },
  phone: String,
  passwordHash: String, // hashed password (bcrypt)
  isVerified: { type: Boolean, default: false },
  otp: {
    code: String,
    expiresAt: Date
  },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('User', userSchema);
