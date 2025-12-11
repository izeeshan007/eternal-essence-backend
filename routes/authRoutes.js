// routes/authRoutes.js
import express from "express";
import {
  registerHandler,
  sendOtpHandler,
  verifyOtpHandler,
  loginHandler,
  forgotPasswordHandler,
  verifyResetOtpHandler,
  resetPasswordHandler,
  getProfileHandler,
  updateProfileHandler,
  addToWishlistHandler,
  removeFromWishlistHandler
} from "../controllers/authController.js";

const router = express.Router();

/* ============ AUTH / OTP ============ */

// Register (creates user unverified + sends OTP)
router.post("/register", registerHandler);

// Generic OTP sender for signup / login / reset
router.post("/send-otp", sendOtpHandler);

// Verifies OTP (signup / login / reset)
router.post("/verify-otp", verifyOtpHandler);

// Login with password (user must be verified)
router.post("/login", loginHandler);

/* ============ FORGOT PASSWORD ============ */

// Step 1: send reset OTP
router.post("/forgot-password", forgotPasswordHandler);

// Step 2: verify OTP and get resetToken
router.post("/verify-reset-otp", verifyResetOtpHandler);

// Step 3: change password using resetToken
router.post("/reset-password", resetPasswordHandler);

/* ============ PROFILE ============ */

// Get profile info
router.get("/me", getProfileHandler);

// Update profile info
router.put("/me", updateProfileHandler);

/* ============ WISHLIST ============ */
router.post("/wishlist/add", addToWishlistHandler);
router.post("/wishlist/remove", removeFromWishlistHandler);

export default router;
