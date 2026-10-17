# Raspberry Pi Deployment and Troubleshooting

This guide ensures the NocturPod edge agent uses the live backend, not placeholder URLs, and explains how to verify camera and PIR operation.

## 1. Before installing
On the Raspberry Pi, open a terminal and run:

```bash
whoami
pwd
ls -la ~/NocturPod
```

The checked-in service file uses `pi` and `/home/pi/NocturPod` as example values. If your login is different (for example, `arxshar`) or the repository is in another directory, edit `agent/nocturpod-agent.service` and adjust `User`, `Group`, `WorkingDirectory`, `ExecStart`, and `ReadWritePaths` to match your actual setup.

## 2. Configure the service environment
Create the environment file:

```bash
sudo mkdir -p /etc/nocturpod
sudo nano /etc/nocturpod/nocturpod.env
```

Add the live backend URL, device ID and the same device token configured in Railway:

```ini
NOCTURPOD_BACKEND_URL=https://nocturpod-production.up.railway.app
NOCTURPOD_DEVICE_ID=nocturpod-edge-01
NOCTURPOD_DEVICE_TOKEN=PASTE_THE_EXACT_MATCHING_DEVICE_TOKEN
NOCTURPOD_MOTION_COOLDOWN=10
```

Do not leave the example token in place. The token must match the Railway `NOCTURPOD_DEVICE_TOKEN` environment variable exactly. Protect the file:

```bash
sudo chown root:root /etc/nocturpod/nocturpod.env
sudo chmod 600 /etc/nocturpod/nocturpod.env
```

## 3. Install or update the code and service
From the repository folder:

```bash
cd ~/NocturPod
git pull
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

For a lean Pi install, use `agent/requirements-edge.txt` only if the main dependency set is not needed on the Pi. The agent imports OpenCV, Requests, psutil and GPIO Zero; Picamera2 is supplied by Raspberry Pi OS packages when available.

Edit the service template if necessary, then install it:

```bash
sudo nano agent/nocturpod-agent.service
sudo cp agent/nocturpod-agent.service /etc/systemd/system/nocturpod-agent.service
sudo systemctl daemon-reload
sudo systemctl enable --now nocturpod-agent.service
sudo systemctl restart nocturpod-agent.service
```

## 4. Check if it is actually running

```bash
sudo systemctl status nocturpod-agent.service --no-pager
sudo journalctl -u nocturpod-agent.service -n 100 --no-pager
sudo journalctl -u nocturpod-agent.service -f
```

Look for messages about camera initialization, backend connection/heartbeats, command polling, and PIR initialization. After the PIR integration is installed, the agent should log one of these outcomes:
- PIR GPIO initialized and motion-triggered capture enabled; or
- sensor unavailable, in which case manual capture remains available but automatic PIR capture cannot be assumed.

If systemd reports a missing executable, fix `ExecStart` to the actual virtual environment path. If the journal shows HTTP 401, the device token does not match the backend. If it shows connection errors, check the backend URL and network connectivity. If the camera cannot open, check the sensor/module compatibility, ribbon orientation, `libcamera-hello --list-cameras` where available, and whether another program is using the camera.

## 5. PIR wiring and operation
The software uses GPIO Zero `MotionSensor` on **BCM GPIO 17, physical pin 11**. For a compatible HC-SR501 module, connect VCC/GND/OUT according to that board's datasheet, share ground with the Pi, and route OUT to GPIO17. Raspberry Pi GPIO is 3.3 V logic; never feed a 5 V signal directly into a GPIO input.

The callback only raises a signal. The main loop takes the still capture and applies a default 10-second cooldown, reducing camera contention with streaming/recording.

## 6. Light outputs
The current lighting controller is configured for white light on BCM GPIO 18 (physical pin 12) and night/IR light on BCM GPIO 23 (physical pin 16). These pins are low-current control signals for a suitable transistor, MOSFET or relay driver circuit—not power outputs for high-current lamps. Verify polarity and the actual connected driver before switching modes.

## 7. End-to-end check
1. Confirm the backend health endpoint responds.
2. Confirm the Pi sends a fresh heartbeat and appears online in the dashboard.
3. Walk through the PIR field of view and check the service log for a motion capture.
4. Confirm the original image appears in the gallery.
5. Confirm an enhanced derivative is added by the backend and the original/enhanced toggle works.
6. Test network interruption and confirm that pending local files are retried after connectivity returns.

## 8. Important implementation detail
The Pi agent captures and transfers media; the current automatic CLAHE/detail enhancement pipeline runs on the Railway backend. The separate `ai_model_source` YOLO/NCNN scaffold is not launched by `agent/main.py` unless a further integration is implemented. The gallery backfill action handles older records only when their ORIGINAL database asset metadata and original Storage object still exist.
