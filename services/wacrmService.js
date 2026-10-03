import dotenv from "dotenv"
dotenv.config()

// Sends a WhatsApp message through the wacrm public API.
// The CRM owns the Meta connection — this server never calls Meta directly.
export const sendTextMessage = async (to, text) => {
    try {
        const response = await fetch(`${process.env.WACRM_BASE_URL}/api/v1/messages`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${process.env.WACRM_API_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ to, type: "text", text }),
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
