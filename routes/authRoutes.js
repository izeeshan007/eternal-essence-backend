// routes/authRoutes.js
import express from 'express';
import { registerHandler, verifyOtpHandler, loginHandler } from '../controllers/authController.js';

const router = express.Router();

router.post('/register', registerHandler);
router.post('/verify-otp', verifyOtpHandler);
router.post('/login', loginHandler);

export default router;
