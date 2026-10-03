// Creates (or updates) an admin who can sign in to the orders dashboard.
//
// Usage:
//   node scripts/createAdmin.js <mobile> [name] [password]
//
// Examples:
//   node scripts/createAdmin.js 9876543210 "Dinesh" "S3cret-pass"   # OTP + password login
//   node scripts/createAdmin.js 9876543210 "Dinesh"                  # OTP login only
//
// - A 10-digit mobile gets 91 prefixed; otherwise include the country code.
// - The mobile must be on WhatsApp — OTPs are sent through wacrm.
// - Running it again for the same mobile updates the name / password and
//   re-activates the account. Omit the password to keep the existing one.
// - Disable an admin:  node scripts/createAdmin.js <mobile> --disable
import mongoose from "mongoose"
import bcrypt from "bcryptjs"
import dotenv from "dotenv"
import Admin from "../models/adminModel.js"
import { normalizePhone, isValidPhone } from "../services/authService.js"
dotenv.config()

const MIN_PASSWORD_LENGTH = 8

const [rawPhone, nameArg, passwordArg] = process.argv.slice(2)
const phone = normalizePhone(rawPhone)

if (!isValidPhone(phone)) {
    console.error("Usage: node scripts/createAdmin.js <mobile> [name] [password]")
    console.error("       node scripts/createAdmin.js <mobile> --disable")
    process.exit(1)
}

await mongoose.connect(process.env.MONGO_URI)

try {
    if (nameArg === "--disable") {
        const admin = await Admin.findOneAndUpdate({ phone }, { isActive: false })
        console.log(admin ? `Disabled admin ${phone}` : `No admin with mobile ${phone}`)
    } else {
        const update = { isActive: true }
        if (nameArg) update.name = nameArg

        if (passwordArg) {
            if (passwordArg.length < MIN_PASSWORD_LENGTH) {
                throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
            }
            update.password = await bcrypt.hash(passwordArg, 10)
        }

        const existing = await Admin.exists({ phone })
        const admin = await Admin.findOneAndUpdate({ phone }, update, { upsert: true, returnDocument: "after" })

        console.log(`${existing ? "Updated" : "Created"} admin ${admin.name || ""} (${admin.phone})`)
        console.log(passwordArg ? "Login: OTP or password" : "Login: OTP (password unchanged/unset)")
    }
} catch (error) {
    console.error("Error:", error.message)
    process.exitCode = 1
} finally {
    await mongoose.disconnect()
}
