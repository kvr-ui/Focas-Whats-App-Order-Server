import crypto from "crypto"
import Order from "../models/orderModel.js"
import WebhookEvent from "../models/webhookEventModel.js"
import { sendTextMessage } from "../services/wacrmService.js"
import { createPaymentLink } from "../services/razorpayService.js"

// Reject deliveries whose signature timestamp is older than this (replay protection)
const SIGNATURE_TOLERANCE_SECONDS = 300

// X-Wacrm-Signature: t=<unix_seconds>,v1=<hex>
// v1 = HMAC-SHA256(secret, "<t>.<rawBody>")
const verifySignature = (req) => {
    const secret = process.env.WACRM_WEBHOOK_SECRET

    if (!secret) {
        console.warn("WACRM_WEBHOOK_SECRET not set — skipping signature verification")
        return true
    }

    const header = req.get("X-Wacrm-Signature") || ""
    const match = header.match(/t=(\d+),v1=([0-9a-f]+)/)
    if (!match) return false

    const [, t, v1] = match

    if (Math.abs(Date.now() / 1000 - Number(t)) > SIGNATURE_TOLERANCE_SECONDS) {
        return false
    }

    const expected = crypto
        .createHmac("sha256", secret)
        .update(`${t}.${req.rawBody}`)
        .digest("hex")

    const a = Buffer.from(expected)
    const b = Buffer.from(v1)
    return a.length === b.length && crypto.timingSafeEqual(a, b)
}

// POST /webhook — wacrm events arrive here.
// This server only subscribes to order.received; other events are logged and ignored.
// Envelope: { id, event, occurred_at, account_id, data }
export const receiveWebhook = async (req, res) => {
    if (!verifySignature(req)) {
        console.warn("Rejected webhook with invalid signature")
        return res.sendStatus(401)
    }

    // Answer 200 immediately — wacrm delivers with a short timeout and a
    // single attempt, and disables the endpoint after repeated failures
    res.sendStatus(200)

    const { id, event, data } = req.body || {}
    if (!id || !event) return

    try {
        // Dedupe: the unique index makes a redelivered id throw 11000
        await WebhookEvent.create({ deliveryId: id, event })
    } catch (error) {
        if (error.code === 11000) {
            console.log(`Duplicate delivery ${id} — already processed`)
        } else {
            console.error("Error recording webhook event:", error)
        }
        return
    }

    try {
        if (event === "order.received") {
            await handleOrderReceived(data)
        } else {
            console.log(`Ignoring event: ${event}`)
        }
    } catch (error) {
        console.error(`Error handling ${event}:`, error)
    }
}

const handleOrderReceived = async (data) => {
    console.log(`Order from ${data.contact_name || data.phone}: ${data.items?.length} item(s), total ${data.total_amount} ${data.currency}`)

    let order
    try {
        order = await Order.create({
            whatsappMessageId: data.whatsapp_message_id,
            conversationId: data.conversation_id,
            contactId: data.contact_id,
            phone: data.phone,
            waId: data.wa_id,
            senderName: data.sender_name,
            contactName: data.contact_name,
            catalogId: data.catalog_id,
            note: data.note,
            items: (data.items || []).map((item) => ({
                productRetailerId: item.product_retailer_id,
                name: item.name,
                quantity: item.quantity,
                itemPrice: item.item_price,
                currency: item.currency,
            })),
            totalAmount: data.total_amount,
            currency: data.currency,
            orderTimestamp: data.timestamp,
            raw: data,
        })
    } catch (error) {
        if (error.code === 11000) {
            console.log(`Order ${data.whatsapp_message_id} already exists — skipping`)
            return
        }
        throw error
    }

    console.log(`Order saved: ${order._id}`)

    const itemLines = order.items
        .map((item) => `• ${item.name || item.productRetailerId} × ${item.quantity}`)
        .join("\n")

    const link = await createPaymentLink(order)

    if (link) {
        order.razorpayLinkId = link.id
        order.paymentLinkUrl = link.short_url
        order.paymentStatus = "link_sent"
        await order.save()
        console.log(`Payment link ${link.short_url} created for order ${order._id}`)

        await sendTextMessage(
            data.phone,
            `Hi ${data.contact_name || data.sender_name || "there"}, we received your order:\n\n${itemLines}\n\nTotal: ₹${data.total_amount}\n\nPay securely here: ${link.short_url}`
        )
    } else {
        // No Razorpay credentials or link creation failed — still confirm the order
        await sendTextMessage(
            data.phone,
            `Hi ${data.contact_name || data.sender_name || "there"}, we received your order:\n\n${itemLines}\n\nTotal: ₹${data.total_amount}\n\nWe will send you the payment link shortly.`
        )
    }
}
