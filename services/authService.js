import jwt from "jsonwebtoken"
import dotenv from "dotenv"
dotenv.config()

// Admin phones are stored like order phones: digits with country code.
// A bare 10-digit Indian mobile gets 91 prefixed.
export const normalizePhone = (input) => {
    const digits = String(input || "").replace(/\D/g, "")
    if (digits.length === 10) return `91${digits}`
    return digits
}

export const isValidPhone = (phone) => /^\d{11,15}$/.test(phone)

export const signAdminToken = (admin) =>
    jwt.sign({ sub: String(admin._id), phone: admin.phone }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRES_IN || "1d",
    })

// Throws if the token is invalid or expired
export const verifyAdminToken = (token) => jwt.verify(token, process.env.JWT_SECRET)

export const publicAdmin = (admin) => ({
    id: admin._id,
    name: admin.name,
    phone: admin.phone,
})
