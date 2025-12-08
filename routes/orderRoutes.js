// routes/orderRoutes.js
import express from 'express';
import {
  createRazorpayOrder,
  verifyRazorpay,
  createCODOrder,
  getMyOrders
} from '../controllers/orderController.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// Checkout (guest allowed)
router.post('/create-razorpay-order', createRazorpayOrder);
router.post('/verify-razorpay', verifyRazorpay);
router.post('/cod', createCODOrder);

// Orders for logged-in user
router.get('/my', authMiddleware, getMyOrders);

export default router;
