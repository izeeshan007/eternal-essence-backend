// models/Otp.js
import mongoose from 'mongoose';

const otpSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, lowercase: true },
    otp: { type: String, required: true }, // 6-digit string
    name: { type: String },
    phone: { type: String },
    passwordHash: { type: String }, // hashed password from signup
    expiresAt: { type: Date, required: true },
    used: { type: Boolean, default: false }
  },
  { timestamps: true }
);

otpSchema.index({ email: 1 });

export const Otp = mongoose.model('Otp', otpSchema);
