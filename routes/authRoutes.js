// routes/authRoutes.js
import express from 'express';
import { register, verifyOtp, login, getMe } from '../controllers/authController.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

router.post('/register', register);
router.post('/verify-otp', verifyOtp);
router.post('/login', login);
router.get('/me', authMiddleware, getMe);

export default router;
