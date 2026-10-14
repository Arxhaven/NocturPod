# Drone AI edge pipeline

This project fine-tunes an aerial-specific YOLOv8n detector and runs it with gentle adaptive CLAHE, low-confidence evidence capture, and GPS/attitude metadata logging. It is designed to export to NCNN for Raspberry Pi 4 deployment.

## Setup

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Prepare images and labels in standard YOLO format under `datasets/aerial/`, then update `data/custom_aerial_drone.yaml`. Include genuine daytime and low-light drone imagery; hold out a low-light validation/test split.

## Train and evaluate

```powershell
python train.py
yolo val model=runs/aerial/yolov8n_lowlight/weights/best.pt data=data/custom_aerial_drone.yaml split=test
python export_ncnn.py --weights runs/aerial/yolov8n_lowlight/weights/best.pt
```

The validation command writes `metrics.csv` in the Ultralytics run directory. Report day and low-light sets separately.

## Run inference

```powershell
python inference.py --model runs/aerial/yolov8n_lowlight/weights/best_ncnn_model --source sample.mp4 --telemetry-json telemetry.json --show
```

For immediate CPU testing without training, use the pretrained COCO model. The first run downloads `yolov8n.pt`; by default it displays only people and common vehicle types:

```powershell
python inference.py --model yolov8n.pt --source 0 --show
```

Test a single JPG or PNG and save an annotated result:

```powershell
python test_image.py --image C:\path\to\photo.jpg --show
```

`--source 0` opens the default camera. `telemetry.json` is optional and may be refreshed by a MAVLink bridge with this shape:

```json
{"latitude": 12.9716, "longitude": 77.5946, "relative_altitude_m": 18.2, "yaw_deg": 124.1, "pitch_deg": -15.0}
```

Ambiguous detections (0.30–0.65 confidence) are cropped and queued to a background worker. The worker applies lightweight crop-only enhancement, saves JPEG evidence, and writes `storage/detections.sqlite`; the inference loop never waits for disk I/O. Confirmed targets are overlaid but not stored by default.

## Frontend API

Start the local API for a separate website or frontend:

```powershell
python api_server.py
```

The frontend can send an HTTP `POST` to `http://127.0.0.1:5000/detect` with a multipart image field named `image`. It receives JSON with `label`, `confidence`, and pixel-coordinate `box` values. Send to `/detect-image` with the same upload to receive a JPEG with boxes drawn on it. `GET /health` checks that the server is running.

## Deployment notes

- Run at a camera capture resolution such as 640×480; inference is letterboxed to 640.
- Use the exported `*_ncnn_model` folder on the Pi. Benchmark it on the exact Pi, camera, and cooling setup.
- Calibrate any INT8 export against representative aerial low-light frames before deployment; do not assume an uncalibrated conversion preserves recall for tiny targets.
- Integrate the telemetry JSON writer with MAVLink in the flight-control/GCS process, keeping the detector isolated from serial-link failures.
