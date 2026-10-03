import crypto from "crypto"
import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import Admin from "../models/adminModel.js"
import { sendTextMessage } from "../services/wacrmService.js"
import {
    normalizePhone,
    isValidPhone,
    signAdminToken,
    publicAdmin,
} from "../services/authService.js"

const OTP_TTL_MS = 5 * 60 * 1000
const OTP_RESEND_MS = 60 * 1000
const OTP_MAX_ATTEMPTS = 5

const hashOtp = (otp) => crypto.createHash("sha256").update(otp).digest("hex")

const sendSession = (res, admin) => {
    const token = signAdminToken(admin)
    const { exp } = jwt.decode(token)
    res.json({ token, expiresAt: exp * 1000, admin: publicAdmin(admin) })
}

// POST /api/auth/send-otp { phone }
export const sendOtp = async (req, res) => {
    try {
        const phone = normalizePhone(req.body?.phone)
        if (!isValidPhone(phone)) {
            return res.status(400).json({ error: "Enter a valid mobile number" })
        }

        const admin = await Admin.findOne({ phone, isActive: true }).select("+otpSentAt")
        if (!admin) {
            return res.status(404).json({ error: "No admin account for this number" })
        }

        if (admin.otpSentAt && Date.now() - admin.otpSentAt.getTime() < OTP_RESEND_MS) {
            const wait = Math.ceil((OTP_RESEND_MS - (Date.now() - admin.otpSentAt.getTime())) / 1000)
            return res.status(429).json({ error: `Please wait ${wait}s before requesting another OTP` })
        }

        const otp = String(crypto.randomInt(0, 1000000)).padStart(6, "0")

        admin.otpHash = hashOtp(otp)
        admin.otpExpiresAt = new Date(Date.now() + OTP_TTL_MS)
        admin.otpAttempts = 0
        admin.otpSentAt = new Date()
        await admin.save()

        const result = await sendTextMessage(
            phone,
            `${otp} is your Orders admin login OTP. It is valid for 5 minutes. Do not share it with anyone.`
        )

        if (process.env.NODE_ENV !== "production") {
            console.log(`[dev] OTP for ${phone}: ${otp}`)
        }

        if (!result || result.error) {
            return res.status(502).json({ error: "Could not send the OTP on WhatsApp. Try again or use password." })
        }

        res.json({ message: "OTP sent on WhatsApp", expiresIn: OTP_TTL_MS / 1000 })
    } catch (error) {
        console.error("Error sending OTP:", error)
        res.status(500).json({ error: "Failed to send OTP" })
    }
}

// POST /api/auth/verify-otp { phone, otp }
export const verifyOtp = async (req, res) => {
    try {
        const phone = normalizePhone(req.body?.phone)
        const otp = String(req.body?.otp || "").trim()

        const admin = await Admin.findOne({ phone, isActive: true }).select(
            "+otpHash +otpExpiresAt +otpAttempts"
        )

        if (!admin || !admin.otpHash || admin.otpExpiresAt < new Date()) {
            return res.status(400).json({ error: "OTP expired. Request a new one." })
        }

        if (admin.otpAttempts >= OTP_MAX_ATTEMPTS) {
            return res.status(429).json({ error: "Too many wrong attempts. Request a new OTP." })
        }

        const a = Buffer.from(hashOtp(otp))
        const b = Buffer.from(admin.otpHash)
        if (!crypto.timingSafeEqual(a, b)) {
            admin.otpAttempts += 1
            await admin.save()
            return res.status(400).json({ error: "Incorrect OTP" })
        }

        // One-time: clear it so it can't be reused
        admin.otpHash = undefined
        admin.otpExpiresAt = undefined
        admin.otpAttempts = 0
        admin.lastLoginAt = new Date()
        await admin.save()

        sendSession(res, admin)
    } catch (error) {
        console.error("Error verifying OTP:", error)
        res.status(500).json({ error: "Failed to verify OTP" })
    }
}

// POST /api/auth/login { phone, password }
export const loginWithPassword = async (req, res) => {
    try {
        const phone = normalizePhone(req.body?.phone)
        const password = String(req.body?.password || "")

        const admin = await Admin.findOne({ phone, isActive: true }).select("+password")

        // Same message for unknown number / no password / wrong password
        if (!admin || !admin.password || !(await bcrypt.compare(password, admin.password))) {
            return res.status(401).json({ error: "Incorrect mobile number or password" })
        }

        admin.lastLoginAt = new Date()
        await admin.save()

        sendSession(res, admin)
    } catch (error) {
        console.error("Error logging in:", error)
        res.status(500).json({ error: "Failed to log in" })
    }
}

// GET /api/auth/me (needs a valid JWT)
export const me = (req, res) => {
    res.json({ admin: publicAdmin(req.admin) })
}
