import mongoose from "mongoose"
import { Schema } from "mongoose"

// One document per processed wacrm delivery, so retried/duplicate
// deliveries (same `id` in the envelope) are handled only once.
const webhookEventSchema = new Schema(
    {
        deliveryId: {
            type: String,
            required: true,
            unique: true,
        },
        event: String,
    },
    { timestamps: true }
)

const webhookEventModel = mongoose.model("webhook_event", webhookEventSchema)

export default webhookEventModel
