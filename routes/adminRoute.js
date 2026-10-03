import express from "express"
import adminAuth from "../middleware/adminAuth.js"
import { listOrders, orderStats, getOrder } from "../controllers/adminController.js"

const router = express.Router()

// Everything here is for the admin dashboard (client/) and needs an admin JWT
router.use(adminAuth)

router.get("/orders", listOrders)
// Before /orders/:id so "stats" isn't treated as an id
router.get("/orders/stats", orderStats)
router.get("/orders/:id", getOrder)

export default router
