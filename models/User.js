// models/User.js
const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    name: { type: String, default: '' },
    phone: { type: String, default: '' },

    isVerified: { type: Boolean, default: false },

    // OTP for email verification
    otpHash: { type: String, default: null },
    otpExpiresAt: { type: Date, default: null }
  },
  { collection: 'users', timestamps: true }
);

module.exports = mongoose.model('User', UserSchema);
