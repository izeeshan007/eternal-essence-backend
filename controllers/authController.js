// controllers/authController.js
import User from "../models/User.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { sendOtpEmail } from "../utils/email.js";

// Generate OTP
function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Create JWT
function createToken(user) {
  return jwt.sign(
    { id: user._id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

// =============================
// REGISTER / SEND OTP HANDLER
// =============================
export async function registerHandler(req, res) {
  try {
    const { name, email, phone, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ error: "Email and password required" });

    let user = await User.findOne({ email });
    const otp = generateOtp();
    const otpHash = await bcrypt.hash(otp, 10);

    if (!user) {
      user = new User({
        name,
        email,
        phone,
        passwordHash: await bcrypt.hash(password, 10),
        isVerified: false,
        otpHash,
        otpExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
      });
    } else {
      user.passwordHash = await bcrypt.hash(password, 10);
      user.otpHash = otpHash;
      user.otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
    }

    await user.save();

    // Send OTP
    await sendOtpEmail({
      to: email,
      subject: "Your Eternal Essence OTP",
      text: `Your OTP is ${otp}`,
      html: `<h2>Your OTP is: ${otp}</h2>`,
    });

    res.json({ success: true, message: "OTP sent to email." });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ error: "Server error during registration" });
  }
}

// =============================
// VERIFY OTP HANDLER
// =============================
export async function verifyOtpHandler(req, res) {
  try {
    const { email, otp } = req.body;
    const user = await User.findOne({ email });

    if (!user) return res.status(404).json({ error: "User not found" });
    if (!user.otpHash) return res.status(400).json({ error: "OTP not generated" });
    if (user.otpExpiresAt < new Date())
      return res.status(400).json({ error: "OTP expired" });

    const match = await bcrypt.compare(otp, user.otpHash);
    if (!match) return res.status(400).json({ error: "Incorrect OTP" });

    user.isVerified = true;
    user.otpHash = null;
    user.otpExpiresAt = null;
    await user.save();

    const token = createToken(user);

    res.json({
      success: true,
      token,
      user: { email: user.email, name: user.name, phone: user.phone },
    });
  } catch (err) {
    console.error("OTP verify error:", err);
    res.status(500).json({ error: "Server error verifying OTP" });
  }
}

// =============================
// LOGIN HANDLER
// =============================
export async function loginHandler(req, res) {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: "Invalid login" });

    if (!user.isVerified)
      return res.status(403).json({ error: "Verify email first" });

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) return res.status(400).json({ error: "Invalid login" });

    const token = createToken(user);

    res.json({
      success: true,
      token,
      user: { email: user.email, name: user.name, phone: user.phone },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Login failed" });
  }
}
