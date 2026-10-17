# NocturPod: reliable hosting and data-retention plan

## Why the dashboard can appear to lose everything

The frontend polls the Railway API for device status and asks it for events, captures, and recordings. If the API stops responding, older frontend code treated a failed request like a valid empty database result and cleared the visible lists. The UI now keeps the last successful lists in browser storage and only replaces them when a media endpoint returns a successful array.

That cache is a resilience aid, not the source of truth. Supabase PostgreSQL and the private `nocturpod-media` Storage bucket remain the system of record. Signed media links can expire, so previews or playback may remain unavailable until a healthy API can issue new signed links.

## Durable production architecture

- **Vercel:** static React frontend only.
- **Always-on VPS or budgeted always-on container:** Flask/Gunicorn API and live-stream relay. This repository includes a VPS-specific Dockerfile at `deploy/vps.Dockerfile`.
- **Supabase:** persistent device, event, media-asset and detection records, plus originals/enhanced files in the private Storage bucket. Do not rely on container-local files as the only copy.
- **Raspberry Pi:** continues sending heartbeats, commands and stream frames to the API's HTTPS URL.

There is no guaranteed lifetime-free host for a continuously running live-video relay. The stable fix is to choose a host with an explicit monthly budget and always-on policy. Railway's trial/free credits can be exhausted; if you keep Railway, confirm the billing plan and the project's estimated usage first. A VPS avoids trial-credit shutdowns but still requires a paid subscription and basic server maintenance.

## Deploy the backend to a VPS

1. Provision an always-on Linux VPS with at least 2 GB RAM; 4 GB gives more headroom for the YOLO/OpenCV pipeline. Use an x86_64 image compatible with the current Python wheels unless you have separately tested ARM support.
2. Install Docker and Docker Compose, clone this repository, and build the image:
   ```bash
   docker build -f deploy/vps.Dockerfile -t nocturpod-api .
   ```
3. Create a server-side `.env` file based on `.env.example`. Set the real `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`, and `NOCTURPOD_DEVICE_TOKEN`. Never commit this file or expose the service-role key to Vercel.
4. Run the API behind an HTTPS reverse proxy (for example, Caddy) with automatic TLS for a DNS name. Do not expose a plain HTTP API to the HTTPS frontend.
5. Configure the container to restart on failure/reboot and expose `/health` to the host's health check. Confirm `https://YOUR_API_HOST/health` returns JSON and inspect logs for Supabase connectivity.
6. In Vercel project settings, set `VITE_API_URL=https://YOUR_API_HOST`, then redeploy the frontend. In `/etc/nocturpod-agent.env` on the Pi, change `NOCTURPOD_BACKEND_URL` to the same HTTPS origin, then restart the agent:
   ```bash
   sudo systemctl restart nocturpod-agent.service
   sudo journalctl -u nocturpod-agent.service -f
   ```
7. Verify: device heartbeat stays fresh for at least 15 minutes; stream status remains fresh; take a test image and a short video; confirm both metadata and files exist in Supabase; then restart the API container and repeat the checks.

## Important operational notes

- A VPS deployment cannot be switched on automatically from a GitHub commit alone. It needs a server, DNS/TLS, and the environment values configured in that provider. Keep the current Railway API URL until the new host passes the checks above.
- The frontend's browser cache prevents a temporary API outage from blanking the last known event/capture lists, but the cache is per browser and does not replace backups.
- Keep original captures immutable. If an enhanced asset is missing, retry enhancement into a separate asset record; never overwrite the original.
- Back up Supabase database metadata and review Storage retention/versioning separately. Hosting the API elsewhere does not itself back up Supabase.
- The current enhancement task executor is in-process. If unattended AI processing must survive API restarts, the next backend phase should move processing work to a durable database-backed job queue rather than relying on in-memory executor tasks.
