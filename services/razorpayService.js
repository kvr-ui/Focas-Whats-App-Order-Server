import dotenv from "dotenv"
dotenv.config()

// Creates a Razorpay Payment Link for an order.
// Returns { id, short_url, ... } on success, or null on failure —
// callers must handle null and fall back gracefully.
export const createPaymentLink = async (order) => {
    const keyId = process.env.RAZORPAY_KEY_ID
    const keySecret = process.env.RAZORPAY_KEY_SECRET

    if (!keyId || !keySecret) {
        console.warn("Razorpay credentials not set — skipping payment link")
        return null
    }

    const itemSummary = order.items
        .map((item) => `${item.name || item.productRetailerId} x${item.quantity}`)
        .join(", ")

    try {
        const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64")

        const response = await fetch("https://api.razorpay.com/v1/payment_links", {
            method: "POST",
            headers: {
                Authorization: `Basic ${auth}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                // Razorpay wants paise; order amounts are in rupees
                amount: Math.round(order.totalAmount * 100),
                currency: order.currency || "INR",
                accept_partial: false,
                description: itemSummary.slice(0, 255),
                customer: {
                    name: order.contactName || order.senderName || undefined,
                    contact: `+${order.waId}`,
                },
                // We deliver the link over WhatsApp ourselves via the CRM
                notify: { sms: false, email: false },
                reminder_enable: false,
                notes: {
                    order_id: String(order._id),
                    whatsapp_message_id: order.whatsappMessageId,
                },
            }),
        })

        const data = await response.json()

        if (!response.ok) {
            console.error("Razorpay API error:", JSON.stringify(data.error || data))
            return null
        }

        return data
    } catch (error) {
        console.error("Error creating Razorpay payment link:", error)
        return null
    }
}
