import express from "express"
import { receiveWebhook } from "../controllers/webhookController.js"
import { receiveRazorpayWebhook } from "../controllers/razorpayController.js"

const router = express.Router()

// wacrm delivers order.received events as signed POSTs here
router.post("/webhook", receiveWebhook)

// Razorpay delivers payment_link.paid events here (configure in Razorpay
// dashboard → Settings → Webhooks, with RAZORPAY_WEBHOOK_SECRET as the secret)
router.post("/razorpay/webhook", receiveRazorpayWebhook)

export default router
