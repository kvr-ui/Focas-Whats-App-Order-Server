// Registers (or updates) this server's public URL as a wacrm webhook endpoint.
//
// Usage:
//   node scripts/registerWebhook.js https://<public-url-of-this-server>
//
// - Appends /webhook automatically if you leave it off.
// - If an endpoint is already registered (matched by WACRM_WEBHOOK_SECRET being
//   set and exactly one endpoint pointing at a /webhook path), it PATCHes that
//   endpoint's URL instead of creating a new one — the signing secret is kept,
//   so you do NOT need to change .env. Use this whenever your ngrok URL changes.
// - On a fresh registration the response includes the signing secret
//   (whsec_...) EXACTLY ONCE — copy it into WACRM_WEBHOOK_SECRET immediately.
import dotenv from "dotenv"
dotenv.config()

const EVENTS = ["order.received"]

let url = process.argv[2]

if (!url || !url.startsWith("https://")) {
    console.error("Usage: node scripts/registerWebhook.js https://<public-url>")
    console.error("(wacrm only delivers to public https:// URLs — use ngrok for local testing)")
    process.exit(1)
}

url = url.replace(/\/+$/, "")
if (!url.endsWith("/webhook")) url = `${url}/webhook`

const api = async (method, path, body) => {
    const response = await fetch(`${process.env.WACRM_BASE_URL}/api/v1${path}`, {
        method,
        headers: {
            Authorization: `Bearer ${process.env.WACRM_API_KEY}`,
            "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
    })
    return { ok: response.ok, data: await response.json() }
}

// If we already hold a secret, look for the endpoint it belongs to and update
// its URL in place — re-registering would issue a new secret and orphan ours.
if (process.env.WACRM_WEBHOOK_SECRET) {
    const list = await api("GET", "/webhooks")
    const existing = (list.data.data || []).filter((endpoint) =>
        endpoint.url.endsWith("/webhook")
    )

    if (existing.length === 1) {
        const endpoint = existing[0]
        if (endpoint.url === url) {
            console.log(`Already registered: ${url} (id ${endpoint.id}) — nothing to do.`)
            process.exit(0)
        }
        const result = await api("PATCH", `/webhooks/${endpoint.id}`, {
            url,
            events: EVENTS,
            is_active: true,
        })
        console.log(JSON.stringify(result.data, null, 2))
        if (result.ok) {
            console.log(`\nUpdated endpoint ${endpoint.id} → ${url}`)
            console.log("Signing secret unchanged — .env needs no edits.")
        }
        process.exit(result.ok ? 0 : 1)
    }

    if (existing.length > 1) {
        console.error("Multiple /webhook endpoints registered — clean up first:")
        console.error(JSON.stringify(existing, null, 2))
        process.exit(1)
    }
    // No matching endpoint — fall through and register fresh
}

const result = await api("POST", "/webhooks", { url, events: EVENTS })
console.log(JSON.stringify(result.data, null, 2))

if (result.ok && result.data.data?.secret) {
    console.log("\n^ Copy the secret above into WACRM_WEBHOOK_SECRET in .env — it is shown only once.")
}
