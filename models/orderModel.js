import mongoose from "mongoose"
import { Schema } from "mongoose"

const orderSchema = new Schema(
    {
        // WhatsApp message id of the cart — unique so redelivered events don't duplicate orders
        whatsappMessageId: {
            type: String,
            required: true,
            unique: true,
        },
        conversationId: String,
        contactId: String,
        phone: String,
        waId: String,
        senderName: String,
        contactName: String,
        catalogId: String,
        note: String,
        items: [
            {
                productRetailerId: String,
                // null until the product is named in wacrm (Settings → Catalog products)
                name: String,
                quantity: Number,
                // In currency UNITS (1.5 = ₹1.50) — multiply by 100 for Razorpay paise
                itemPrice: Number,
                currency: String,
            },
        ],
        totalAmount: Number,
        currency: String,
        orderTimestamp: Date,
        paymentStatus: {
            type: String,
            enum: ["pending", "link_sent", "paid", "failed"],
            default: "pending",
        },
        // Razorpay payment link (plink_...), its customer-facing short URL,
        // and the payment id (pay_...) once payment_link.paid arrives
        razorpayLinkId: String,
        paymentLinkUrl: String,
        razorpayPaymentId: String,
        raw: Object,
    },
    { timestamps: true }
)

const orderModel = mongoose.model("order", orderSchema)

export default orderModel
