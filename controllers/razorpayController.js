import crypto from "crypto"
import mongoose from "mongoose"
import Order from "../models/orderModel.js"
import { sendTextMessage } from "../services/wacrmService.js"

// X-Razorpay-Signature = HMAC-SHA256(webhook_secret, rawBody) as hex
const verifyRazorpaySignature = (req) => {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET

    if (!secret) {
        console.warn("RAZORPAY_WEBHOOK_SECRET not set — skipping signature verification")
        return true
    }

    const signature = req.get("x-razorpay-signature") || ""
    const expected = crypto.createHmac("sha256", secret).update(req.rawBody).digest("hex")

    const a = Buffer.from(expected)
    const b = Buffer.from(signature)
    return a.length === b.length && crypto.timingSafeEqual(a, b)
}

// Any of these mean the payment link was paid. A link payment fires all three;
// the dashboard webhook may be subscribed to only one of them.
const PAID_EVENTS = ["payment_link.paid", "order.paid", "payment.captured"]

// POST /razorpay/webhook — payment events from the Razorpay dashboard webhook.
// Subscribe this URL to payment_link.paid (order.paid / payment.captured also work).
export const receiveRazorpayWebhook = async (req, res) => {
    if (!verifyRazorpaySignature(req)) {
        console.warn("Rejected Razorpay webhook with invalid signature")
        return res.sendStatus(401)
    }

    res.sendStatus(200)

    const { event, payload } = req.body || {}

    try {
        if (!PAID_EVENTS.includes(event)) {
            console.log(`Ignoring Razorpay event: ${event}`)
            return
        }

        const payment = payload?.payment?.entity
        const linkId = payload?.payment_link?.entity?.id
        const paymentId = payment?.id
        // Only payment_link.paid carries the link; the others carry our notes
        const orderId = payment?.notes?.order_id || payload?.order?.entity?.notes?.order_id

        let match
        if (linkId) match = { razorpayLinkId: linkId }
        else if (mongoose.isValidObjectId(orderId)) match = { _id: orderId }
        else {
            console.log(`Razorpay ${event} for payment ${paymentId} is not one of our orders`)
            return
        }

        // Atomic flip so retries / several paid events for one payment thank the customer once
        const order = await Order.findOneAndUpdate(
            { ...match, paymentStatus: { $ne: "paid" } },
            { paymentStatus: "paid", razorpayPaymentId: paymentId },
            { new: true }
        )

        if (!order) {
            console.log(`Razorpay ${event}: order ${linkId || orderId} unknown or already paid`)
            return
        }

        console.log(`Order ${order._id} PAID via ${event} (payment ${paymentId})`)

        await sendTextMessage(
            order.phone,
            `Payment received ✅\n\nThank you ${order.contactName || ""}! Your order is confirmed.\n\nOrder ref: ${order._id}`
        )
    } catch (error) {
        console.error("Error handling Razorpay webhook:", error)
    }
}
