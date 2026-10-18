# NocturPod Edge Surveillance System

NocturPod is an edge-native night surveillance system engineered around the **Raspberry Pi 4 Model B (8GB)**, **OmniVision OV5647 IR-Cut camera**, and **850nm IR illumination**, coupled to a cloud architecture powered by **Railway** (Flask backend), **Supabase** (PostgreSQL & Private Media Storage), and **Vercel** (React Frontend).

```
Vercel Frontend (React + Vite)
      ↓ HTTPS
Railway Backend (Flask + Gunicorn)
      ↓ HTTPS / PostgREST
Supabase (PostgreSQL + Media Storage)
      ↑ HTTPS
Raspberry Pi 4 Edge Node (OV5647 + NocturPod Agent)
```

---

## 1. System Architecture

- **Raspberry Pi 4 Model B (8GB)**: Runs `agent/main.py` as a systemd service (`nocturpod-agent.service`). Connects to the OV5647 camera, transmits live MJPEG frames, sends hardware telemetry heartbeats, polls dashboard commands, buffers media locally in `~/nocturpod/media/`, and uploads captures.
- **Backend (Railway / Flask / Gunicorn)**: Ingests real camera streams, verifies `X-Device-Token` authorization, queues commands, manages Supabase PostgreSQL and Supabase Storage access, and executes asynchronous AI enhancement pipelines immediately after media ingestion.
- **AI Enhancement Engine**: Uses noise-aware CLAHE in LAB luminance, adaptive denoising, and automatic grayscale normalization when dark frames have a strong red/purple IR colour cast. YOLOv8 attempts to detect people and selected objects with a more permissive threshold/larger inference size in very dark scenes. Every capture keeps separate **ORIGINAL** and **ENHANCED** assets; the original is never overwritten.
- **Frontend (Vercel)**: Displays real camera feed, hardware telemetry, and provides controls for manual still captures, video recording start/stop, and side-by-side inspection and download of Original vs. Enhanced media.

---

## 1.1 Reading AI quality numbers correctly

The image/video viewer displays a **Visibility Index** before and after enhancement and its **relative change**. These are engineering heuristics based on luminance/exposure, contrast, edge detail, estimated noise, and clipping. They are useful for comparing the same capture before and after processing, but they are **not a percentage of human-recognition accuracy**.

The object-detection labels display YOLO model confidence, also not ground-truth accuracy. Real accuracy/precision/recall must be measured against a manually labelled test set with people visible at known distances, with and without flashlight/IR illumination. For the current enhancement version, each processed capture records the visibility metrics and whether IR colour-cast normalization was applied. Old assets without the V2 marker are eligible for automatic reprocessing when the gallery is requested.

The screenshot samples showed strong red/purple chroma noise and limited scene detail. Grayscale normalization and denoising can reduce distracting colour noise, but they cannot recover detail never captured by the sensor. Adjust exposure, gain, illumination, camera focus and shutter before relying on enhancement; long exposures can blur moving people and high analogue gain increases noise.

---
## 2. Environment Configuration

Copy `.env.example` to configure your environment:

```bash
cp .env.example .env
```

### Backend (Railway / Local):
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
VITE_API_URL=https://nocturpod-production.up.railway.app
```

### Raspberry Pi Agent:
```ini
NOCTURPOD_BACKEND_URL=https://nocturpod-production.up.railway.app
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

1. Install the Raspberry Pi OS hardware packages first. Use a virtual environment that can see the OS-provided Picamera2, OpenCV, GPIO Zero and lgpio libraries:
   ```bash
   sudo apt update
   sudo apt install -y python3-venv python3-picamera2 python3-opencv python3-numpy python3-psutil python3-requests python3-gpiozero python3-lgpio
   git clone https://github.com/Arxhaven/NocturPod.git ~/NocturPod
   cd ~/NocturPod
   python3 -m venv --system-site-packages .venv
   source .venv/bin/activate
   pip install -r agent/requirements-pi.txt
   ```

2. Create a protected environment file with the actual production backend URL and the same device token used by Railway. Do not commit this file or put the token in Git:
   ```bash
   sudo nano /etc/nocturpod-agent.env
   ```
   Add these values, replacing the token placeholder:
   ```ini
   NOCTURPOD_BACKEND_URL=https://nocturpod-production.up.railway.app
   NOCTURPOD_DEVICE_ID=nocturpod-edge-01
   NOCTURPOD_DEVICE_TOKEN=PASTE_YOUR_EXISTING_DEVICE_TOKEN
   GPIOZERO_PIN_FACTORY=lgpio
   ```
   Then protect the secret:
   ```bash
   sudo chown root:root /etc/nocturpod-agent.env
   sudo chmod 600 /etc/nocturpod-agent.env
   ```

3. Install and start the systemd service:
   ```bash
   sudo cp agent/nocturpod-agent.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable --now nocturpod-agent.service
   sudo systemctl status nocturpod-agent.service
   journalctl -u nocturpod-agent.service -f
   ```
   The checked-in service targets the existing `arxshar` account and `/home/arxshar/NocturPod` path used in your setup. If your Pi installation uses a different account or clone path, update those fields before starting the service.

### PIR sensor wiring and diagnostics

The HC-SR501 PIR interface uses **BCM GPIO 17 (physical pin 11)** by default:
- PIR VCC -> the supply voltage supported by your exact sensor board (check its markings/specification).
- PIR GND -> Raspberry Pi GND (common ground is required).
- PIR OUT -> BCM GPIO 17 / physical pin 11. Raspberry Pi GPIO must never receive 5V logic.
- Allow the PIR to warm up/calibrate after boot. The agent listens for real gpiozero motion edges and applies a software cooldown before taking another still.

For a direct sensor test, stop the daemon first so it does not hold the same GPIO line:
```bash
sudo systemctl stop nocturpod-agent.service
source .venv/bin/activate
python -m agent.pir_diagnostic --pin 17 --calibration 30 --duration 90
sudo systemctl start nocturpod-agent.service
journalctl -u nocturpod-agent.service -f
```
The test reports each real motion/no-motion edge. The agent itself uses an explicit lgpio factory when available and has a watchdog poll path in case a gpiozero callback edge is missed. The runtime log must report the HC-SR501 initialized on GPIO 17. If the diagnostic never observes motion, check the sensor's VCC/GND/OUT wiring, warm-up time, sensitivity/time-delay potentiometers, jumper mode, and GPIO permissions. GPIO 17 must never receive 5V logic.

### Camera and illumination controls

The dashboard Settings panel can queue OV5647/libcamera controls for exposure, analogue gain, auto white balance, brightness, contrast, saturation, and sharpness. Manual exposure and analogue gain are used only when automatic exposure is disabled. Driver support varies; the Pi agent logs unsupported controls instead of pretending they changed.

Set saturation to 0 for grayscale images if IR illumination creates strong red/purple color casts. Software cannot change the actual wavelength of physical IR LEDs. Dimming requires the illumination outputs to be connected to **PWM-compatible LED drivers**; only then set `LIGHT_PWM_ENABLED=1` in the Pi service environment. Do not enable PWM if the GPIOs control mechanical relays.

The AUTO illumination mode uses average luminance measured from real camera frames with hysteresis to switch between WHITE and NIGHT. It is a camera-frame estimate rather than a dedicated lux sensor.

---

## 5. Local Development & Verification

### Backend:
```bash
python -m venv .venv
source .venv/bin/activate # or .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m backend.server
```
Production test:
```bash
gunicorn --config gunicorn.conf.py backend.server:app
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
