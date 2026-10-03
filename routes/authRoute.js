import express from "express"
import adminAuth from "../middleware/adminAuth.js"
import { sendOtp, verifyOtp, loginWithPassword, me } from "../controllers/authController.js"

const router = express.Router()

// Admin dashboard sign-in: mobile + WhatsApp OTP, or mobile + password.
// Both return a JWT valid for JWT_EXPIRES_IN.
router.post("/send-otp", sendOtp)
router.post("/verify-otp", verifyOtp)
router.post("/login", loginWithPassword)
router.get("/me", adminAuth, me)

export default router
