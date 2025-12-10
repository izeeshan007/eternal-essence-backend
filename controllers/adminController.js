// ===== UPDATE ORDER STATUS =====
export const updateOrderStatus = async (req, res) => {
  try {
    const Order = await resolveOrderModel();
    const { id } = req.params;
    const { status } = req.body;

    const allowed = ["Pending", "Processing", "Shipped", "Delivered", "Cancelled"];
    if (!allowed.includes(status)) {
      return res.status(400).json({ success: false, error: "Invalid status" });
    }

    const order = await Order.findByIdAndUpdate(id, { status }, { new: true });
    if (!order) return res.status(404).json({ success: false, error: "Order not found" });

    return res.json({ success: true, order });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};


// ===== CANCEL ORDER =====
export const cancelOrder = async (req, res) => {
  try {
    const Order = await resolveOrderModel();
    const { id } = req.params;

    const order = await Order.findByIdAndUpdate(id, { status: "Cancelled" }, { new: true });
    if (!order) return res.status(404).json({ success: false, error: "Order not found" });

    return res.json({ success: true, order });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};


// ===== MONTHLY SALES REPORT =====
export const getMonthlySales = async (req, res) => {
  try {
    const Order = await resolveOrderModel();
    const now = new Date();

    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay  = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const orders = await Order.find({
      createdAt: { $gte: firstDay, $lte: lastDay },
      status: { $ne: "Cancelled" }
    });

    let totalSales = 0;
    orders.forEach(o => totalSales += Number(o.total || 0));

    return res.json({
      success: true,
      month: now.getMonth() + 1,
      totalSales,
      orderCount: orders.length
    });

  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};
