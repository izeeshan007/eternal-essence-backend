// routes/authRoutes.js
import express from 'express';
import {
  registerHandler,
  sendOtpHandler,
  verifyOtpHandler,
  loginHandler,
  resetPasswordHandler,
  getProfileHandler,
  updateProfileHandler,
  addToWishlistHandler,
  removeFromWishlistHandler
} from '../controllers/authController.js';

const router = express.Router();

router.post('/register', registerHandler);
router.post('/send-otp', sendOtpHandler);       // { email, phone, purpose }
router.post('/verify-otp', verifyOtpHandler);   // { email, otp, purpose }
router.post('/login', loginHandler);
router.post('/reset-password', resetPasswordHandler); // { email, resetToken, newPassword }

// profile
router.get('/me', getProfileHandler);
router.put('/me', updateProfileHandler);

// wishlist
router.post('/wishlist/add', addToWishlistHandler);
router.post('/wishlist/remove', removeFromWishlistHandler);

export default router;
