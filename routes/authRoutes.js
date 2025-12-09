import express from "express";
import {
  registerHandler,
  verifyOtpHandler,
  loginHandler
} from "../controllers/authController.js";

const router = express.Router();

// /api/auth/register → sends OTP
router.post("/register", registerHandler);

// /api/auth/verify-otp → verifies OTP
router.post("/verify-otp", verifyOtpHandler);

// /api/auth/login
router.post("/login", loginHandler);

export default router;
