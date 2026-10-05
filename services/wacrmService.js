import dotenv from "dotenv"
dotenv.config()

const sendMessage = async (body) => {
    try {
        const response = await fetch(`${process.env.WACRM_BASE_URL}/api/v1/messages`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${process.env.WACRM_API_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
        })

        const data = await response.json()

        if (!response.ok) {
            console.error("wacrm API error:", JSON.stringify(data.error || data))
        }

        return data
    } catch (error) {
        console.error("Error sending message via wacrm:", error)
    }
}

// Sends a WhatsApp message through the wacrm public API.
// The CRM owns the Meta connection — this server never calls Meta directly.
// Free-form text only reaches numbers that messaged us in the last 24h.
export const sendTextMessage = (to, text) => sendMessage({ to, type: "text", text })

// Sends an approved AUTHENTICATION template (Meta WhatsApp Manager → copy-code
// OTP). Unlike text, templates deliver even outside the 24h window. The code
// fills body {{1}} and the copy-code button (index 0).
export const sendOtpTemplate = (to, otp) =>
    sendMessage({
        to,
        type: "template",
        template: {
            name: process.env.WACRM_OTP_TEMPLATE,
            language: process.env.WACRM_OTP_TEMPLATE_LANGUAGE || "en",
            params: { body: [otp], buttonParams: { 0: otp } },
        },
    })

// wacrm accepts a send straight away; Meta may reject it a moment later
// (e.g. outside the 24h window). Poll the conversation briefly for the
// final status so callers can tell "sent" from "failed".
export const waitForDelivery = async (sendResult, { timeoutMs = 6000 } = {}) => {
    const messageId = sendResult?.data?.message_id
    const conversationId = sendResult?.data?.conversation_id
    if (!messageId || !conversationId) return "unknown"

    // "sent" is wacrm's initial status, so only delivered/read/failed are final
    let status = "pending"
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 1500))
        try {
            const response = await fetch(
                `${process.env.WACRM_BASE_URL}/api/v1/conversations/${conversationId}/messages?limit=10`,
                { headers: { Authorization: `Bearer ${process.env.WACRM_API_KEY}` } }
            )
            const data = await response.json()
            status = data.data?.find((m) => m.id === messageId)?.status || status
            if (["failed", "delivered", "read"].includes(status)) return status
        } catch (error) {
            console.error("Error checking wacrm delivery status:", error)
            return "unknown"
        }
    }
    return status
}
