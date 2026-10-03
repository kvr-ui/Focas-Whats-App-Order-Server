import mongoose from "mongoose"
import Order from "../models/orderModel.js"

const STATUSES = ["pending", "link_sent", "paid", "failed"]

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

// GET /api/admin/orders?status=&q=&page=&limit=
export const listOrders = async (req, res) => {
    try {
        const page = Math.max(parseInt(req.query.page) || 1, 1)
        const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100)
        const { status } = req.query
        const q = (req.query.q || "").trim()

        const filter = {}
        if (STATUSES.includes(status)) filter.paymentStatus = status

        if (q) {
            const re = new RegExp(escapeRegex(q), "i")
            filter.$or = [
                { contactName: re },
                { senderName: re },
                { phone: re },
                { "items.name": re },
                { "items.productRetailerId": re },
                { razorpayPaymentId: re },
            ]
            if (mongoose.isValidObjectId(q)) filter.$or.push({ _id: q })
        }

        const [orders, total] = await Promise.all([
            Order.find(filter)
                .select("-raw")
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            Order.countDocuments(filter),
        ])

        res.json({ orders, total, page, pages: Math.ceil(total / limit) || 1 })
    } catch (error) {
        console.error("Error listing orders:", error)
        res.status(500).json({ error: "Failed to load orders" })
    }
}

// GET /api/admin/orders/stats
export const orderStats = async (req, res) => {
    try {
        const startOfToday = new Date()
        startOfToday.setHours(0, 0, 0, 0)

        const [byStatus, today] = await Promise.all([
            Order.aggregate([
                {
                    $group: {
                        _id: "$paymentStatus",
                        count: { $sum: 1 },
                        amount: { $sum: "$totalAmount" },
                    },
                },
            ]),
            Order.countDocuments({ createdAt: { $gte: startOfToday } }),
        ])

        const stats = { total: 0, today, revenue: 0, byStatus: {} }
        for (const status of STATUSES) stats.byStatus[status] = 0

        for (const row of byStatus) {
            stats.byStatus[row._id] = row.count
            stats.total += row.count
            if (row._id === "paid") stats.revenue = row.amount
        }

        res.json(stats)
    } catch (error) {
        console.error("Error computing order stats:", error)
        res.status(500).json({ error: "Failed to load stats" })
    }
}

// GET /api/admin/orders/:id
export const getOrder = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(404).json({ error: "Order not found" })
        }

        const order = await Order.findById(req.params.id).lean()
        if (!order) return res.status(404).json({ error: "Order not found" })

        res.json(order)
    } catch (error) {
        console.error("Error loading order:", error)
        res.status(500).json({ error: "Failed to load order" })
    }
}
