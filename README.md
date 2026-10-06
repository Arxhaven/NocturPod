# NocturPod Edge Surveillance System

NocturPod is an edge-native night surveillance system engineered around the **Raspberry Pi 4 Model B (8GB)**, **OmniVision OV5647 IR-Cut camera**, and **850nm IR illumination**, coupled to a cloud architecture powered by **Render** (Flask backend), **Supabase** (PostgreSQL & Private Media Storage), and **Vercel** (React Frontend).

```
Vercel Frontend (React + Vite)
      ↓ HTTPS
Render Backend (Flask + Gunicorn)
      ↓ HTTPS / PostgREST
Supabase (PostgreSQL + Media Storage)
      ↑ HTTPS
Raspberry Pi 4 Edge Node (OV5647 + NocturPod Agent)
```

---

## 1. System Architecture

- **Raspberry Pi 4 Model B (8GB)**: Runs `agent/main.py` as a systemd service (`nocturpod-agent.service`). Connects to the OV5647 camera, transmits live MJPEG frames, sends hardware telemetry heartbeats, polls dashboard commands, buffers media locally in `~/nocturpod/media/`, and uploads captures.
- **Backend (Render / Flask / Gunicorn)**: Ingests real camera streams, verifies `X-Device-Token` authorization, queues commands, manages Supabase PostgreSQL and Supabase Storage access, and executes asynchronous AI enhancement pipelines immediately after media ingestion.
- **AI Enhancement Engine**: Utilizes the genuine Adaptive CLAHE LAB luminance normalization and detail sharpening algorithm from `ai_model_source`, alongside YOLOv8 perimeter security classification. Every capture creates distinct **ORIGINAL** and **ENHANCED** assets.
- **Frontend (Vercel)**: Displays real camera feed, hardware telemetry, and provides controls for manual still captures, video recording start/stop, and side-by-side inspection and download of Original vs. Enhanced media.

---

## 2. Environment Configuration

Copy `.env.example` to configure your environment:

```bash
cp .env.example .env
```

### Backend (Render / Local):
```ini
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
SUPABASE_STORAGE_BUCKET=nocturpod-media
NOCTURPOD_DEVICE_TOKEN=your-secure-device-token
PORT=5000
HOST=0.0.0.0
```

### Frontend (Vercel):
```ini
VITE_API_URL=https://your-render-service.onrender.com
```

### Raspberry Pi Agent:
```ini
NOCTURPOD_BACKEND_URL=https://your-render-service.onrender.com
NOCTURPOD_DEVICE_TOKEN=your-secure-device-token
NOCTURPOD_DEVICE_ID=nocturpod-edge-01
```

---

## 3. Supabase Setup

1. Open your project at [Supabase](https://supabase.com/).
2. Navigate to **SQL Editor** and run the contents of [`backend/schema_supabase.sql`](file:///c:/Users/sharv/Documents/GitHub/NocturPod/backend/schema_supabase.sql) to create:
   - `devices`
   - `events`
   - `media_assets`
   - `detections`
   - `device_commands`
   - `system_logs`
3. Navigate to **Storage** and create a new bucket:
   - Name: `nocturpod-media`
   - Public: Unchecked (private; backend issues signed URLs for secure viewing and download).

---

## 4. Raspberry Pi Deployment & Auto-Start

1. Clone NocturPod onto the Raspberry Pi:
   ```bash
   git clone https://github.com/Arxhaven/NocturPod.git ~/NocturPod
   cd ~/NocturPod
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   ```

2. Install systemd service for automatic boot:
   ```bash
   sudo cp agent/nocturpod-agent.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable nocturpod-agent.service
   sudo systemctl start nocturpod-agent.service
   ```

3. Check agent status:
   ```bash
   sudo systemctl status nocturpod-agent.service
   journalctl -u nocturpod-agent.service -f
   ```

---

## 5. Local Development & Verification

### Backend:
```bash
python -m venv .venv
source .venv/bin/activate # or .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python api_server.py
```
Production test:
```bash
gunicorn api_server:app
```

### Run Tests:
```bash
python -m unittest tests/test_backend.py
```

### Frontend:
```bash
npm install
npm run dev
```
Build verification:
```bash
npm run build
```
