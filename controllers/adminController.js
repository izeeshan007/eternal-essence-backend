// controllers/adminController.js
import Order from '../models/Order.js';
import User from '../models/User.js';
import mongoose from 'mongoose';

/**
 * Helper: resolve an order by id that might be either _id or orderId
 */
async function findOrderByIdOrOrderId(idOrOrderId) {
  if (!idOrOrderId) return null;
  // try as ObjectId first
  if (mongoose.Types.ObjectId.isValid(idOrOrderId)) {
    const byId = await Order.findById(idOrOrderId).lean();
    if (byId) return byId;
  }
  // try by orderId field
  const byOrderId = await Order.findOne({ orderId: idOrOrderId }).lean();
  return byOrderId || null;
}

/**
 * GET /api/admin/orders
 * returns list of orders (recent first) - optional query: q, status, limit
 */
export async function getOrders(req, res) {
  try {
    const q = (req.query.q || '').trim();
    const status = (req.query.status || '').trim();
    const limit = Math.min(200, Number(req.query.limit) || 200);

    const filter = {};
    if (status) filter.status = status;
    if (q) {
      // search in orderId, buyerEmail, name
      filter.$or = [
        { orderId: { $regex: q, $options: 'i' } },
        { buyerEmail: { $regex: q, $options: 'i' } },
        { name: { $regex: q, $options: 'i' } }
      ];
    }

    const orders = await Order.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
    return res.json({ success: true, orders });
  } catch (err) {
    console.error('getOrders error', err);
    return res.status(500).json({ success: false, error: 'Server error fetching orders' });
  }
}

/**
 * GET /api/admin/orders/:id
 */
export async function getOrderById(req, res) {
  try {
    const { id } = req.params;
    const order = await findOrderByIdOrOrderId(id);
    if (!order) return res.status(404).json({ success: false, error: 'Order not found' });
    return res.json({ success: true, order });
  } catch (err) {
    console.error('getOrderById error', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}

/**
 * PUT /api/admin/orders/:id  -> body { status }
 * - Validates allowed statuses
 */
export async function updateOrderStatus(req, res) {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const allowed = ["Created", "Pending", "Processing", "Shipped", "Delivered", "Cancelled", "Payment Success"];
    if (!status || !allowed.includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status' });
    }

    // update by either orderId or _id
    let order = await Order.findOneAndUpdate(
      { $or: [{ _id: mongoose.isValidObjectId(id) ? id : null }, { orderId: id }] },
      { status },
      { new: true }
    );

    // If not found via above (sometimes null _id passed), try lookup helper
    if (!order) {
      const found = await findOrderByIdOrOrderId(id);
      if (!found) return res.status(404).json({ success: false, error: 'Order not found' });
      order = await Order.findByIdAndUpdate(found._id, { status }, { new: true });
    }

    return res.json({ success: true, order });
  } catch (err) {
    console.error('updateOrderStatus error', err);
    return res.status(500).json({ success: false, error: 'Server error updating order' });
  }
}

/**
 * PUT /api/admin/orders/:id/cancel
 */
export async function cancelOrder(req, res) {
  try {
    const { id } = req.params;

    let order = await Order.findOneAndUpdate(
      { $or: [{ _id: mongoose.isValidObjectId(id) ? id : null }, { orderId: id }] },
      { status: 'Cancelled' },
      { new: true }
    );

    if (!order) {
      const found = await findOrderByIdOrOrderId(id);
      if (!found) return res.status(404).json({ success: false, error: 'Order not found' });
      order = await Order.findByIdAndUpdate(found._id, { status: 'Cancelled' }, { new: true });
    }

    return res.json({ success: true, order });
  } catch (err) {
    console.error('cancelOrder error', err);
    return res.status(500).json({ success: false, error: 'Server error cancelling order' });
  }
}

/**
 * GET /api/admin/dashboard
 * Returns KPIs and chart-ready data
 */
export async function getDashboard(req, res) {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    // 1) Monthly sales (non-cancelled)
    const monthlyOrders = await Order.find({
      createdAt: { $gte: startOfMonth, $lte: endOfMonth },
      status: { $ne: 'Cancelled' }
    }).lean();

    const monthlySales = monthlyOrders.reduce((s, o) => s + (Number(o.total) || 0), 0);
    const monthlyOrdersCount = monthlyOrders.length;

    // 2) Avg order value (last 30 days, excluding cancelled)
    const days30 = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const recent = await Order.find({ createdAt: { $gte: days30 }, status: { $ne: 'Cancelled' } }).lean();
    const avgOrderValue = recent.length ? Math.round(recent.reduce((s,o)=> s + (Number(o.total)||0), 0) / recent.length) : 0;

    // 3) pending / success counts (global, limited)
    const pendingCount = await Order.countDocuments({ status: { $in: ['Pending','Created','Pending (COD)', 'Pending Payment'] } });
    const successCount = await Order.countDocuments({ status: /success/i });

    // 4) salesByMonth for last 12 months
    const months = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      months.push({ key, date: d, label: d.toLocaleString('en-IN', { month: 'short', year: '2-digit' }) });
    }

    // Aggregate totals by month
    const monthlyAgg = await Order.aggregate([
      { $match: { status: { $ne: 'Cancelled' } } },
      { $project: { total: { $ifNull: ['$total', 0] }, year: { $year: '$createdAt' }, month: { $month: '$createdAt' } } },
      { $group: { _id: { year: '$year', month: '$month' }, total: { $sum: '$total' }, count: { $sum: 1 } } }
    ]);

    const monthlyMap = {};
    monthlyAgg.forEach(m => {
      const key = `${m._id.year}-${String(m._id.month).padStart(2,'0')}`;
      monthlyMap[key] = { total: m.total, count: m.count };
    });

    const salesByMonth = months.map(m => ({ month: m.key, label: m.label, total: monthlyMap[m.key]?.total || 0, count: monthlyMap[m.key]?.count || 0 }));

    // 5) ordersByStatus
    const statusAgg = await Order.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    const ordersByStatus = {};
    statusAgg.forEach(s => ordersByStatus[s._id || 'Unknown'] = s.count);

    // 6) salesByState (best effort: try to parse state from shippingAddress, fallback to raw)
    // This is a sample bucket: grouping by shippingAddress substring of last line (basic heuristic)
    const locationAgg = await Order.aggregate([
      { $match: { shippingAddress: { $exists: true, $ne: '' } } },
      { $project: {
        shippingAddress: 1,
        // take last line after newline if exists:
        stateCandidate: {
          $trim: { input: { $arrayElemAt: [{ $split: ['$shippingAddress', '\n'] }, -1] } }
        }
      } },
      { $group: { _id: '$stateCandidate', total: { $sum: { $ifNull: ['$total', 0] } }, count: { $sum: 1 } } },
      { $sort: { total: -1 } },
      { $limit: 20 }
    ]);

    const salesByState = (locationAgg || []).map(b => ({ key: b._id || 'Unknown', total: b.total || 0, count: b.count || 0 }));

    return res.json({
      success: true,
      monthlySales: Math.round(monthlySales),
      monthlyOrders: monthlyOrdersCount,
      avgOrderValue: Math.round(avgOrderValue),
      pendingCount,
      successCount,
      salesByMonth,
      ordersByStatus,
      salesByState
    });
  } catch (err) {
    console.error('getDashboard error', err);
    return res.status(500).json({ success: false, error: 'Server error building dashboard' });
  }
}

/**
 * GET /api/admin/users
 * query: page, limit, q
 */
export async function getUsers(req, res) {
  try {
    const q = (req.query.q || '').trim();
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(200, Number(req.query.limit) || 50);
    const skip = (page - 1) * limit;

    const filter = {};
    if (q) {
      filter.$or = [
        { email: { $regex: q, $options: 'i' } },
        { name: { $regex: q, $options: 'i' } },
        { phone: { $regex: q, $options: 'i' } }
      ];
    }

    const total = await User.countDocuments(filter);
    const users = await User.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('name email phone address isVerified createdAt')
      .lean();

    // normalize address shape for frontend
    const normalized = users.map(u => ({
      id: u._id,
      name: u.name || '',
      email: u.email || '',
      phone: u.phone || '',
      isVerified: !!u.isVerified,
      address: u.address || {},
      createdAt: u.createdAt
    }));

    return res.json({ success: true, users: normalized, total, page, limit });
  } catch (err) {
    console.error('getUsers error', err);
    return res.status(500).json({ success: false, error: 'Server error fetching users' });
  }
}
