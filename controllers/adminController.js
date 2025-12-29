import Order from '../models/Order.js';
import User from '../models/User.js';
import mongoose from 'mongoose';

/* ================== CONSTANTS ================== */
const COMPLETED_STATUSES = ['Shipped', 'Delivered'];

/**
 * Helper: resolve an order by id that might be either _id or orderId
 */
async function findOrderByIdOrOrderId(idOrOrderId) {
  if (!idOrOrderId) return null;

  if (mongoose.Types.ObjectId.isValid(idOrOrderId)) {
    const byId = await Order.findById(idOrOrderId).lean();
    if (byId) return byId;
  }

  return Order.findOne({ orderId: idOrOrderId }).lean();
}

/* ================== ORDERS ================== */
export async function getOrders(req, res) {
  try {
    const q = (req.query.q || '').trim();
    const status = (req.query.status || '').trim();
    const limit = Math.min(200, Number(req.query.limit) || 200);
    const { startDate, endDate } = req.query;

    const filter = {};

    /* ===== STATUS ===== */
    if (status) {
      filter.status = status;
    }

    /* ===== SEARCH ===== */
    if (q) {
      filter.$or = [
        { orderId: { $regex: q, $options: 'i' } },
        { buyerEmail: { $regex: q, $options: 'i' } },
        { name: { $regex: q, $options: 'i' } }
      ];
    }

    /* ===== DATE FILTER ===== */
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate + 'T23:59:59');
    }

    const orders = await Order.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    res.json({ success: true, orders });

  } catch (err) {
    console.error('getOrders error', err);
    res.status(500).json({
      success: false,
      error: 'Server error fetching orders'
    });
  }
}


export async function getOrderById(req, res) {
  try {
    const order = await findOrderByIdOrOrderId(req.params.id);
    if (!order) return res.status(404).json({ success: false, error: 'Order not found' });
    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Server error' });
  }
}

/* ================== DASHBOARD ================== */
export async function getDashboard(req, res) {
  try {
    const { startDate, endDate } = req.query;

    const COMPLETED = ['Shipped', 'Delivered'];

    const from = startDate
      ? new Date(startDate)
      : new Date(new Date().getFullYear(), new Date().getMonth(), 1);

    const to = endDate ? new Date(endDate) : new Date();

    /* ================= REVENUE (SHIPPED + DELIVERED) ================= */
    const completedOrders = await Order.find({
      createdAt: { $gte: from, $lte: to },
      status: { $in: COMPLETED }
    }).lean();

    const revenue = completedOrders.reduce(
      (sum, o) => sum + Number(o.total || 0),
      0
    );

    /* ================= AVG ORDER VALUE (LAST 30 DAYS) ================= */
    const days30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const recentCompleted = await Order.find({
      createdAt: { $gte: days30 },
      status: { $in: COMPLETED }
    }).lean();

    const avgOrderValue = recentCompleted.length
      ? Math.round(
          recentCompleted.reduce((s, o) => s + Number(o.total || 0), 0) /
            recentCompleted.length
        )
      : 0;

    /* ================= COUNTS ================= */
    const pendingCount = await Order.countDocuments({
      status: { $in: ['Pending', 'Processing'] }
    });

    const deliveredCount = await Order.countDocuments({
      status: 'Delivered'
    });

    /* ================= SALES BY MONTH (DATE FILTERED) ================= */
    const salesByMonth = await Order.aggregate([
      {
        $match: {
          status: { $in: COMPLETED },
          createdAt: { $gte: from, $lte: to }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          total: { $sum: { $toDouble: '$total' } }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    const monthly = salesByMonth.map(m => ({
      label: `${m._id.month}/${m._id.year}`,
      total: m.total
    }));

    /* ================= STATUS BREAKDOWN ================= */
    const statusAgg = await Order.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    const ordersByStatus = {};
    statusAgg.forEach(s => {
      ordersByStatus[s._id] = s.count;
    });

    return res.json({
      success: true,
      monthlySales: revenue,
      monthlyOrders: completedOrders.length,
      avgOrderValue,
      pendingCount,
      successCount: deliveredCount,
      salesByMonth: monthly,
      ordersByStatus
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
}



/* ================== USERS ================== */
export async function getUsers(req, res) {
  try {
    const q = (req.query.q || '').trim();
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(200, Number(req.query.limit) || 50);
    const skip = (page - 1) * limit;

    const filter = q
      ? {
          $or: [
            { email: { $regex: q, $options: 'i' } },
            { name: { $regex: q, $options: 'i' } },
            { phone: { $regex: q, $options: 'i' } }
          ]
        }
      : {};

    const total = await User.countDocuments(filter);
    const users = await User.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('name email phone address isVerified createdAt')
      .lean();

    res.json({ success: true, users, total, page, limit });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Server error fetching users' });
  }
}



/* ================== UPDATE ORDER STATUS ================== */
export async function updateOrderStatus(req, res) {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ success: false, error: 'Status required' });
    }

    const order = await Order.findOneAndUpdate(
      {
        $or: [
          { _id: mongoose.Types.ObjectId.isValid(id) ? id : null },
          { orderId: id }
        ]
      },
      { status },
      { new: true }
    );

    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    res.json({ success: true, order });
  } catch (err) {
    console.error('updateOrderStatus error', err);
    res.status(500).json({ success: false, error: 'Update failed' });
  }
}

/* ================== CANCEL ORDER ================== */
export async function cancelOrder(req, res) {
  try {
    const { id } = req.params;

    const order = await Order.findOneAndUpdate(
      {
        $or: [
          { _id: mongoose.Types.ObjectId.isValid(id) ? id : null },
          { orderId: id }
        ]
      },
      { status: 'Cancelled' },
      { new: true }
    );

    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    res.json({ success: true, order });
  } catch (err) {
    console.error('cancelOrder error', err);
    res.status(500).json({ success: false, error: 'Cancel failed' });
  }
}

/* ================== DELETE ORDER ================== */
export async function deleteOrder(req, res) {
  try {
    const { id } = req.params;

    const order = await Order.findOneAndDelete({
      $or: [
        { _id: mongoose.Types.ObjectId.isValid(id) ? id : null },
        { orderId: id }
      ]
    });

    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('deleteOrder error', err);
    res.status(500).json({ success: false, error: 'Delete failed' });
  }
}
