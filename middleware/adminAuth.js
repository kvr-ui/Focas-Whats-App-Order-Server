import Admin from "../models/adminModel.js"
import { verifyAdminToken } from "../services/authService.js"

// Admin API requests carry `Authorization: Bearer <JWT>` from /api/auth login
const adminAuth = async (req, res, next) => {
    const header = req.get("authorization") || ""
    const token = header.startsWith("Bearer ") ? header.slice(7) : ""

    let payload
    try {
        payload = verifyAdminToken(token)
    } catch (error) {
        const expired = error.name === "TokenExpiredError"
        return res.status(401).json({ error: expired ? "Session expired" : "Not signed in" })
    }

    try {
        // Re-check the account so a deactivated admin is locked out immediately
        const admin = await Admin.findById(payload.sub)
        if (!admin || !admin.isActive) {
            return res.status(401).json({ error: "Account disabled" })
        }

        req.admin = admin
        next()
    } catch (error) {
        console.error("Error checking admin session:", error)
        res.status(500).json({ error: "Failed to check session" })
    }
}

export default adminAuth
