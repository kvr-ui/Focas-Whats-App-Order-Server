import express from "express"
import dotenv from "dotenv"
import bodyParser from "body-parser"
import webhookRouter from "./routes/webhookRoute.js"
import adminRouter from "./routes/adminRoute.js"
import authRouter from "./routes/authRoute.js"
import connectDB from "./config/connectDB.js"
dotenv.config()
const PORT = process.env.PORT || 5000

connectDB()

const app = express()

// Keep the raw body — the wacrm signature is an HMAC over the exact bytes sent
app.use(
    express.json({
        verify: (req, res, buf) => {
            req.rawBody = buf
        },
    })
)
app.use(bodyParser.urlencoded({ extended: true }))

// Health check
app.get("/", (req, res) => {
    res.send("wacrm order webhook server is running")
})

app.use("/api/auth", authRouter)
app.use("/api/admin", adminRouter)
app.use("/", webhookRouter)

app.listen(PORT, () => {
    console.log(`Server is running on ${PORT}`)
})
