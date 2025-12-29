// routes/productRoutes.js
import express from 'express';
import Product from '../models/Product.js';

const router = express.Router();

/**
 * PUBLIC PRODUCTS
 * Visible on website (no auth)
 */
router.get('/', async (req, res) => {
  try {
    const products = await Product.find({ isActive: true })
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      products
    });
  } catch (err) {
    console.error('Public products error', err);
    res.status(500).json({
      success: false,
      error: 'Failed to load products'
    });
  }
});

export default router;
