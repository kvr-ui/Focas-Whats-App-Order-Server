import mongoose from "mongoose"
import { Schema } from "mongoose"

const adminSchema = new Schema(
    {
        name: String,
        // Digits only with country code, e.g. 917305504500 — same format as order.phone
        phone: {
            type: String,
            required: true,
            unique: true,
        },
        // bcrypt hash; unset means this admin can only sign in with OTP
        password: {
            type: String,
            select: false,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        // Current OTP (sha256 hash), when it expires, wrong guesses so far,
        // and when it was sent (for the resend cooldown)
        otpHash: { type: String, select: false },
        otpExpiresAt: { type: Date, select: false },
        otpAttempts: { type: Number, default: 0, select: false },
        otpSentAt: { type: Date, select: false },
        lastLoginAt: Date,
    },
    { timestamps: true }
)

const adminModel = mongoose.model("admin", adminSchema)

export default adminModel
