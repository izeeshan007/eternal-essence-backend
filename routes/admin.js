// routes/admin.js (ESM)
import express from 'express';
import { 
  login, 
  getAllOrders, 
  updateOrderStatus, 
  cancelOrder, 
  getMonthlySales
} from '../controllers/adminController.js';

import adminAuth from '../middleware/adminAuth.js';

const router = express.Router();

router.post('/login', login);
router.get('/orders', adminAuth, getAllOrders);

// NEW FEATURES:
router.put('/orders/:id/status', adminAuth, updateOrderStatus);
router.put('/orders/:id/cancel', adminAuth, cancelOrder);
router.get('/sales/monthly', adminAuth, getMonthlySales);

export default router;
