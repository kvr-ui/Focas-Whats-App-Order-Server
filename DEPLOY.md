# Deploying the order server

The server runs as a Docker container on the Hostinger VPS. Host nginx in front of it handles HTTPS.

| | |
|---|---|
| Public URL | https://order.focasedu.online |
| Code on the VPS | `/root/Focas-Whats-App-Order-Server` |
| Container / image name | `focas-order-server` |
| Port | `3020` (bound to `127.0.0.1` only; nginx proxies to it) |
| nginx site | `/etc/nginx/sites-available/order.focasedu.online` |
| SSL | Let's Encrypt via certbot (renews automatically) |

Port 3000 is already used by other apps on this VPS, so this server uses **3020**.

---

## Which command do I need?

| What changed | What to do |
|---|---|
| Code (after `git pull`) | [Rebuild and restart](#redeploy-after-a-code-change) |
| Only `.env` (DB, keys, secrets) | [Recreate the container](#redeploy-after-an-env-change), no rebuild |
| Nothing, just want it back up | `docker start focas-order-server` |

`docker restart` does **not** pick up `.env` changes. The container has to be removed and created again.

---

## Redeploy after a code change

```bash
cd /root/Focas-Whats-App-Order-Server
git pull
docker build -t focas-order-server .

docker rm -f focas-order-server
docker run -d \
  --name focas-order-server \
  --restart unless-stopped \
  --env-file .env \
  -e PORT=3020 \
  -p 127.0.0.1:3020:3020 \
  --log-opt max-size=10m --log-opt max-file=3 \
  focas-order-server

docker logs -f focas-order-server   # wait for "MongoDb connected", then Ctrl+C
```

## Redeploy after an `.env` change

```bash
cd /root/Focas-Whats-App-Order-Server
nano .env

docker rm -f focas-order-server
docker run -d \
  --name focas-order-server \
  --restart unless-stopped \
  --env-file .env \
  -e PORT=3020 \
  -p 127.0.0.1:3020:3020 \
  --log-opt max-size=10m --log-opt max-file=3 \
  focas-order-server

docker logs -f focas-order-server
```

If you switched to a **new, empty database**:
- Admin accounts live in the database, so create yours again (see [Admin accounts](#admin-accounts)).
- Orders from before the switch stay in the old database. A customer paying an old payment link won't get a confirmation message unless you copy the `orders` collection across (`mongodump` / `mongorestore`).

## Check it's working

```bash
docker ps --filter name=focas-order-server   # STATUS should end in (healthy)
curl http://127.0.0.1:3020/                  # from the VPS
curl https://order.focasedu.online/          # from anywhere
```

Both `curl`s should print `wacrm order webhook server is running`.

---

## First-time deploy (new VPS)

Only needed when setting this up from scratch.

**1. Get the code and create `.env`:**
```bash
cd /root
git clone https://github.com/kvr-ui/Focas-Whats-App-Order-Server.git
cd Focas-Whats-App-Order-Server
cp .env.example .env
nano .env
```

Fill in every value. Also add `NODE_ENV=production`, which stops OTPs being printed in the logs. If the MongoDB password has special characters, URL-encode them in `MONGO_URI` (`@` → `%40`).

**2. Build and run** using the commands in [Redeploy after a code change](#redeploy-after-a-code-change), skipping `git pull`.

**3. DNS:** in hPanel → Domains → `focasedu.online` → DNS, add an A record: name `order`, value = the VPS IP.

**4. nginx site:**
```bash
cat > /etc/nginx/sites-available/order.focasedu.online <<"EOF"
server {
    listen 80;
    listen [::]:80;
    server_name order.focasedu.online;

    location / {
        proxy_pass http://127.0.0.1:3020;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }
}
EOF
ln -s /etc/nginx/sites-available/order.focasedu.online /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

**5. HTTPS** (once the DNS record resolves):
```bash
certbot --nginx -d order.focasedu.online
```

**6. Webhooks:**
- **wacrm:** `docker exec focas-order-server node scripts/registerWebhook.js https://order.focasedu.online`
  If `WACRM_WEBHOOK_SECRET` is already set, this updates the existing endpoint's URL and the secret stays the same. On a fresh registration it prints a new `whsec_...` secret **once**. Put it in `.env` and [recreate the container](#redeploy-after-an-env-change).
- **Razorpay dashboard → Account & Settings → Webhooks:** URL `https://order.focasedu.online/razorpay/webhook`, event `payment_link.paid`. The secret entered there must match `RAZORPAY_WEBHOOK_SECRET` in `.env`.

**7. Create an admin** (next section).

---

## Admin accounts

Admins sign in to the dashboard with their mobile number, using either a WhatsApp OTP or a password.

```bash
# OTP + password login
docker exec focas-order-server node scripts/createAdmin.js 9876543210 "Name" "password-8-chars-min"

# OTP login only
docker exec focas-order-server node scripts/createAdmin.js 9876543210 "Name"

# Disable an admin (their current sessions stop working immediately)
docker exec focas-order-server node scripts/createAdmin.js 9876543210 --disable
```

Running it again for the same number updates the name and password and re-enables the account. A 10-digit number gets `91` added automatically.

---

## Useful commands

```bash
docker logs -f focas-order-server            # live logs
docker logs --since 1h focas-order-server    # last hour
docker stop focas-order-server               # stop (stays stopped after a reboot)
docker start focas-order-server              # start again
docker exec -it focas-order-server sh        # shell inside the container
docker image prune -f                        # remove old images after rebuilds
```

## Auto-start after a VPS reboot

This is already handled: the container uses `--restart unless-stopped` and the Docker service is enabled at boot. The container comes back on its own after a reboot or a crash, unless you stopped it with `docker stop`.

To confirm:
```bash
systemctl is-enabled docker                                                     # enabled
docker inspect -f '{{.HostConfig.RestartPolicy.Name}}' focas-order-server       # unless-stopped
```

## Troubleshooting

| Symptom | Check |
|---|---|
| Container keeps restarting | `docker logs focas-order-server`. "Connecting error in MongoDB" means `MONGO_URI` is wrong or the DB blocks the VPS IP (MongoDB Atlas → Network Access). |
| `https://order.focasedu.online` gives 502 | The container is down: `docker ps -a --filter name=focas-order-server` |
| No order confirmation on WhatsApp | Logs show `Rejected webhook with invalid signature` → `WACRM_WEBHOOK_SECRET` doesn't match the wacrm endpoint. |
| No payment confirmation | Razorpay dashboard → Webhooks: URL must be `https://order.focasedu.online/razorpay/webhook`. A 401 in the delivery log means `RAZORPAY_WEBHOOK_SECRET` doesn't match. |
| OTP never arrives | WhatsApp only delivers a free-form text if the admin's number messaged the business number in the last 24 hours. Send it a message, or log in with a password. |
| `.env` change had no effect | You ran `docker restart`. Recreate the container instead. |
| Dashboard shows "Failed to fetch" / CORS error in the browser console | Add the dashboard's exact origin (scheme + domain, no trailing slash) to `CORS_ORIGINS` in `.env`, comma-separated, then recreate the container. |
