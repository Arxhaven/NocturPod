# NocturPod Project Guide
## Mini-project explanation, system architecture, implementation details, and guide viva notes

**Project:** NocturPod - Nocturnal Automated Surveillance System  
**Purpose:** Low-light surveillance, event-based capture, remote review, and image/video visibility enhancement  
**Project status:** Engineering prototype. Physical reliability, detection accuracy, environmental durability, and operational suitability require testing before any field or defence deployment.

---

## 1. The project in one minute

NocturPod is a camera-based night-surveillance prototype. A Raspberry Pi is intended to sit near the camera and sensors, collect real camera frames, detect motion through a PIR sensor, record still images or video, and send media to a backend. A web dashboard lets an operator check device status, view the live feed, review saved captures, and compare the original media with a processed version. The backend saves event metadata and media in Supabase and applies a low-light visibility enhancement pipeline.

The central aim is to make night-time observation easier to review and operate remotely, while preserving the original evidence. It is designed as a modular prototype: sensor and camera at the edge, a service layer for processing and coordination, cloud storage/database, and a web UI.

**Important wording for the viva:** describe NocturPod as a *low-light surveillance prototype with AI-assisted image enhancement and object detection capability*. Do not claim that it is already a certified military-grade product, is officially deployed by the Indian Army, or reliably identifies threats without validation.

## 2. What problem does it address?

Night surveillance can be difficult because a person watching a conventional camera may have to monitor a dark or noisy image for long periods. If the connection fails, capturing and later retrieving evidence can also become difficult. NocturPod attempts to address this with:

- **Event capture:** motion-triggered still capture using a PIR sensor, as well as manual still capture and operator-controlled recordings.
- **Remote monitoring:** dashboard access to device heartbeat/status, camera stream, saved images, and recordings.
- **Media retention:** original media is stored separately from the processed version, so enhancement does not overwrite the captured source.
- **Visibility enhancement:** local contrast enhancement and detail enhancement can make some low-light frames easier to inspect.
- **Future extensibility:** object detection, additional sensors, edge-side inference, power management, and offline-first operation can be developed and measured as separate features.

The system can be useful in many civilian contexts too: campus/security perimeters, warehouses, infrastructure, wildlife observation, and night-time site monitoring. A defence use is a possible future application, not a proven deployment outcome.

## 3. Main objective and potential Indian Army relevance

### Core objective
Capture and organize night-time visual evidence with minimal operator intervention, preserve the source file, improve viewability where possible, and make the record accessible for remote review.

### Potential defence relevance (conceptual)
If tested, ruggedized, secured, and approved by the relevant authorities, a platform of this type could support:
- monitoring of a perimeter or fixed installation at night;
- unattended observation of a remote point where continuous human viewing is difficult;
- event-triggered evidence capture for later review;
- reducing the amount of footage an operator has to inspect manually;
- remote checking of device health and camera availability.

These are *potential roles only*. This project has not been shown to satisfy military environmental, cybersecurity, electromagnetic compatibility, reliability, or procurement requirements. It is not a replacement for trained personnel, approved surveillance systems, or validated command-and-control systems. Do not present an algorithmic enhancement as proof that a person or object is present; inspect the original and report uncertainty.

## 4. System architecture

### Logical block diagram

```text
 PIR motion sensor (HC-SR501) ──GPIO 17──┐
                                         v
 Camera module ──CSI/libcamera or V4L2 -> Raspberry Pi 4
                                         |
                         NocturPod edge agent (Python)
                  ┌──────────────────────┼────────────────────┐
                  |                      |                    |
             Capture/record         Live MJPEG          Heartbeat/status
             local spool            frame upload        command polling
                  |                      |                    |
                  └──────────────────────┴────────────────────┘
                                         | HTTPS
                                         v
                      Railway - Flask/Gunicorn backend
                  ┌──────────────────────┼────────────────────┐
                  |                      |                    |
             Event/asset API      CLAHE + detail        YOLO object
             + command queue      enhancement           detections
                  |                      |                    |
                  └──────────────────────┴────────────────────┘
                                         |
                               Supabase REST / Storage
                         ┌───────────────┴───────────────┐
                         |                               |
                 PostgreSQL metadata                Private media bucket
                 events, media_assets,               originals/enhanced
                 detections, devices, logs
                         |                               |
                         └───────────────┬───────────────┘
                                         v
                            Vercel - React/Vite dashboard
                    live view, gallery, original/enhanced toggle,
                    recordings, events, telemetry, light controls
```

### Main components

| Component | Responsibility | What actually runs there |
|---|---|---|
| Raspberry Pi 4 Model B (8GB) | Physical edge controller | Python agent, camera input, motion signal handling, capture/recording, live frame upload, device heartbeat, command polling and local retry spool |
| Camera module | Optical source | Captures real frames; the repository labels it OV5647, so the installed sensor part number should be physically verified |
| PIR sensor | Motion event input | HC-SR501-style input through GPIO Zero on BCM GPIO 17 (physical pin 11), after the Pi code update and once the service is deployed |
| Railway backend | API/orchestration | Flask endpoints, device command queue, media ingestion, asynchronous enhancement, detection calls |
| Supabase PostgreSQL | Structured persistence | Device heartbeat/status, capture events, media-asset variants, object detections, commands and logs |
| Supabase Storage | File persistence | Private original and enhanced image/video objects, surfaced to the UI through signed URLs |
| Vercel frontend | Operator UI | React/Vite dashboard for live view, capture/record controls, status, events and original/enhanced comparison |

The live MJPEG relay in the current backend is in process memory. It is not an archival video store. Recorded images/videos are persisted separately in Supabase Storage when upload succeeds.

## 5. Capture and media lifecycle: start to finish

### A. Motion-triggered image
1. The PIR changes state when motion is detected.
2. The GPIO callback sets an event flag. The main agent loop handles the flag so the sensor callback does not compete directly with the camera stream for a frame.
3. The Pi asks the camera interface for a real frame and writes an original JPEG to its local media folder.
4. The agent attempts to upload it to `/api/media/upload`. If upload fails, the spool manifest queues the file for a retry.
5. The backend registers an event and an `ORIGINAL` row in `media_assets`, and uploads the original into the private Supabase media bucket.
6. The backend submits a background job to enhance the media. The source file is kept; the processed file is stored as a separate `ENHANCED` asset.
7. The frontend fetches event/asset metadata and uses signed URLs to show the original and enhanced variants.

The current Pi implementation includes a motion-capture cooldown (default 10 seconds) to avoid a rapid stream of repeated captures. Hardware triggering still has to be physically tested on the actual sensor and GPIO wiring.

### B. Manual still
1. The user clicks a capture control in the dashboard.
2. The dashboard posts a capture command to the backend command queue.
3. The Pi agent polls the command endpoint and executes the command through the capture controller.
4. The upload and enhancement flow above follows.

### C. Video recording
1. The dashboard requests start recording.
2. The Pi starts a video writer and stores camera frames while recording is active.
3. Stop recording closes/finalizes the video file.
4. The Pi uploads the original video or queues it for retry.
5. The backend creates a separate enhanced video by reading frames, enhancing each frame, and re-encoding the video.
6. Both variants are registered separately and can be played/downloaded from the dashboard.

### D. Historical media
Older files did not automatically get enhanced just because the current enhancement feature was added. The updated backend adds a queued backfill endpoint at `POST /api/media/enhance-missing`. The new control in the Images and Footage pages queues every registered `ORIGINAL` asset for which no `ENHANCED` asset exists. The worker retrieves the original from Supabase Storage (or a local fallback), runs the same pipeline, and stores the enhanced asset. The dashboard refreshes media status in the background.

Backfill only works if the original object still exists and its event/asset metadata is registered. Missing files cannot be reconstructed from a URL or a database row. A missing or corrupt original is reported as a failed backfill; it is not silently replaced.

## 6. AI/image processing: what is actually implemented?

### Low-light enhancement pipeline
The deployed backend module `backend/ai_engine.py` currently uses the following OpenCV operations:

1. **BGR to LAB colour conversion** using OpenCV.
2. **Adaptive CLAHE on the L (luminance) channel.** CLAHE stands for Contrast Limited Adaptive Histogram Equalization. It improves local contrast tile by tile while clipping excessive histogram amplification. The code uses an 8 by 8 tile grid and chooses a clip limit between 1.8 and 2.5 based on average luminance.
3. **LAB back to BGR conversion.** The original colour channels are retained while the adjusted luminance is recombined.
4. **Detail enhancement** using `cv2.detailEnhance(..., sigma_s=5, sigma_r=0.10)`. This is an edge-preserving detail enhancement operation from OpenCV. If that call fails, the function falls back to the CLAHE output.
5. **Save a separate derivative.** Stills are saved as JPEG at quality 95. Videos are processed frame-by-frame and written with the OpenCV `mp4v` writer at the input frame rate and dimensions reported by the video reader.

Libraries used in this pipeline: **Python, OpenCV (`cv2`), NumPy**, and the standard Python filesystem/time modules. Flask serves the API; the UI uses React.

### Is this a trained AI super-resolution model?
**No, not in the current media enhancement code.** The currently implemented enhancement does not use a trained super-resolution network. It improves local contrast and perceived detail but does not genuinely reconstruct missing sensor detail. It can also make sensor noise more visible in very dark frames, so results should be reviewed against the original.

### Which interpolation method is used?
The current enhancement functions do **not** perform image upscaling or choose an interpolation method such as nearest-neighbour, bilinear, bicubic, or Lanczos. They keep the still's source resolution and keep a video's source frame geometry and frame rate. Ultralytics handles its own internal image resizing/letterboxing for object-detection inference; that is preprocessing for the detector, not the image-enhancement method. The application does not currently include frame interpolation or an explicit super-resolution/upscaling stage.

### Object detection is separate from enhancement
The backend's `NocturPodAIEngine` optionally loads Ultralytics YOLO using `MODEL_PATH`, whose default in code is `yolov8n.pt`. The image enhancement job sends still images through detection and can save labels, confidence scores and bounding boxes in the `detections` table. In the existing upload pipeline, video enhancement is frame-by-frame but object detection is not automatically run on every frame of each uploaded recording.

The `ai_model_source/` directory also contains a training/export scaffold for a custom aerial YOLOv8n detector and an NCNN export script that is intended for ARM/Raspberry Pi deployment. The current Pi agent in `agent/main.py` does not launch that detector. Production use of custom aerial weights is not established merely by those scripts existing: a trained weights file must be produced, configured as `MODEL_PATH` on the backend or wired into a Pi-side NCNN service, then tested and measured.

### Practical limitations to be honest about
- CLAHE/detail enhancement is not a guarantee of face, plate, uniform, weapon, or target identification.
- No interpolation means the enhancement is not an upscaler; output pixels are not increased by the processing function.
- For a particular scene, compare the source and derivative and keep the source as the evidential record.
- Detection accuracy needs test data, precision/recall or mAP metrics, representative night conditions, and false-positive/false-negative analysis.
- A low confidence score or a visual enhancement must not be treated as ground truth.

## 7. What is the Raspberry Pi actually used for?

The Pi is meant to be the **edge computer** at the physical camera. It is not merely a case or an extra board. Once the agent service is running, it is responsible for:
- opening the camera with Picamera2/libcamera when possible, or V4L2/OpenCV as a fallback;
- obtaining genuine camera frames;
- receiving PIR motion signals and triggering still capture;
- recording video when requested by the dashboard;
- transmitting the live MJPEG frames to the backend;
- sending heartbeat telemetry such as CPU temperature/usage, RAM/disk usage, camera state, Wi-Fi state, uptime and configured light mode;
- polling the backend command queue and acknowledging commands;
- buffering upload failures locally and retrying them when the network returns;
- switching the configured visible/night-light outputs through a driver circuit attached to BCM GPIO 18 and 23, when the hardware is wired and GPIO access works.

The current AI visibility-enhancement job runs on the **Railway backend**, not on the Pi capture loop. The separate custom YOLO/NCNN code is a potential route to edge inference, but it is not started by the current main agent automatically.

### Why the Pi may appear not to be doing anything
The repository is only software source; it does not remotely start a process on the physical Pi. The code must be present on the Pi, its virtual environment installed, the service configured with the real backend URL and matching device token, and the systemd service enabled and running. The checked-in service was previously a template with a placeholder Render URL/token and fixed `/home/pi` paths. The updated template now reads settings from `/etc/nocturpod/nocturpod.env`, but the user must adapt the service user/paths to the actual Pi account and install/update the file on the device.

Use:
```bash
whoami
pwd
sudo systemctl status nocturpod-agent.service
sudo journalctl -u nocturpod-agent.service -n 100 --no-pager
sudo journalctl -u nocturpod-agent.service -f
```
If the unit does not exist, install it using the repository instructions. If the status is failed, the journal output is the next source of truth. Once the repo is updated on the Pi, run `sudo systemctl daemon-reload` and `sudo systemctl restart nocturpod-agent.service`.

**Camera model check:** the repository labels its camera interface and telemetry as OV5647. The team's hardware notes have also referred to an 8 MP Sony IMX219 module. These are different camera sensors. Read the model printed on the actual camera/module or check the vendor listing and correct the code/documentation to match; do not report the sensor as confirmed until verified.

## 8. Hardware pin reference

| Function | BCM GPIO | Physical header pin | Notes |
|---|---:|---:|---|
| PIR motion input | 17 | 11 | Code uses GPIO Zero `MotionSensor`; common ground required |
| White-light output | 18 | 12 | Intended to control a white-light driver, not power a high-current lamp directly |
| Night/IR-light output | 23 | 16 | Intended to control a night/IR-light driver, not power a high-current lamp directly |
| Pi ground | GND | Any GND pin | Ground reference shared by sensor/driver as appropriate |

Confirm the exact PIR board output voltage before connecting it to GPIO. Raspberry Pi GPIO is 3.3 V logic and must not be exposed to a 5 V signal. The light pins should switch a suitable driver/transistor/relay module; do not connect high-current illumination hardware directly to a GPIO.

## 9. Software stack

| Layer | Technology in repository | Role |
|---|---|---|
| Edge agent | Python, Picamera2/libcamera, OpenCV, Requests, GPIO Zero, psutil | Camera, PIR, capture/record, stream, telemetry, command polling, retry spool |
| Backend API | Python, Flask, Flask-CORS, Gunicorn | REST endpoints, stream relay, media ingestion, background jobs |
| Image/video processing | OpenCV, NumPy | CLAHE, detail enhancement, frame extraction and encoding |
| Detection | Ultralytics YOLOv8n (configured model path) | Person/vehicle/animal classes as configured by the backend |
| Database | Supabase PostgreSQL through REST/PostgREST | Event, asset, device, detection, command and log metadata |
| Media files | Supabase private Storage, signed URLs | Preserve original and enhanced files separately |
| Frontend | React, Vite, CSS and lucide-react | Dashboard and operator controls |
| Hosting | Vercel frontend, Railway backend | Public web delivery and backend runtime |

## 10. Data model: important records

- **devices:** device identity, last heartbeat, camera/network state, CPU/RAM/disk telemetry, light mode and software metadata.
- **events:** one capture/recording event, event ID, timestamp, type, status, AI status and notes.
- **media_assets:** one row per file variant. The same event can have an `ORIGINAL` row and an `ENHANCED` row, each with its own private Storage path and processing status.
- **detections:** object label, confidence and bounding-box coordinates associated with an event.
- **device_commands:** dashboard-generated commands that the Pi polls and acknowledges.
- **system_logs:** backend/system activity notes.

This separation is important: an event is not the image itself, and the original asset is not overwritten by the enhanced one.

## 11. How to explain the contribution to guides

A clear and defensible explanation is:

> “We built a modular nocturnal surveillance prototype around a Raspberry Pi, a camera and a motion sensor. The edge unit is intended to capture real events and send the media to a backend. The web dashboard provides remote monitoring and archive review. The backend stores event metadata separately from the original media files, creates an enhanced derivative using adaptive CLAHE and OpenCV detail enhancement, and uses YOLO-based object detection where configured. We preserve the original so that users can compare processing results with the captured evidence. Our next validation tasks are to verify the physical sensor/camera, confirm the Pi service is online, backfill legacy original-only captures, measure enhancement/detection quality, and test reliability under low-light/network-loss conditions.”

Do not say that the current algorithm restores information that the sensor never captured, does 4K enhancement, or is already deployed with the Indian Army.

## 12. Suggested verification checklist

### Hardware and edge
- [ ] Confirm camera model and actual captured resolution.
- [ ] Confirm camera ribbon orientation, stable power, and cooling.
- [ ] Confirm PIR VCC/GND/OUT wiring and motion-trigger logs.
- [ ] Confirm driver circuit on the white/night light GPIOs.
- [ ] Confirm the correct Linux username and repository path in systemd.
- [ ] Confirm the Pi service uses the live Railway URL and the exact matching device token.

### Backend, storage and UI
- [ ] `/health` responds from the backend.
- [ ] Device status changes after the Pi heartbeat arrives.
- [ ] Original capture appears in `events` and `media_assets`.
- [ ] Both original and enhanced objects exist in private Supabase Storage.
- [ ] Original/enhanced toggle works for a new still and a new recording.
- [ ] Run the “Enhance All Legacy Media” action and confirm old originals get enhanced assets.
- [ ] Confirm the UI updates from queued/processing to complete and failures remain visible.
- [ ] Check missing originals and Storage errors rather than silently assuming completion.

### Quality / research
- [ ] Record sample scenes in dark, medium-light and normal-light conditions.
- [ ] Compare original and enhanced files side by side; note noise amplification and artifacts.
- [ ] Evaluate detector precision, recall, mAP and false-positive rate on a labelled test set.
- [ ] Test network outage and spool retry without losing the original.
- [ ] Document frame rate, resolution, processing time, storage use, and power/runtime estimates.
- [ ] Do not use "military-grade" until there is formal evidence of required tests and certification.

## 13. Future development priorities

1. Add authentication and role-based access for dashboard actions, especially bulk enhancement and deletion.
2. Add a visible enhancement job queue with progress, retry state and error details.
3. Add resumable or chunked uploads for long recordings, and test offline spool limits.
4. Store verified hardware model, sensor wiring, power draw and environmental test results in the logbook.
5. Decide whether AI detection should run at the edge (e.g. a verified NCNN model) or centrally on the backend; benchmark rather than assume.
6. If super-resolution is required, select a trained SR model, compare against OpenCV baselines, measure latency on target hardware and avoid promising details unsupported by the captured signal.
7. For a defence-oriented proposal, obtain field requirements and approval from qualified stakeholders, then validate environmental durability, network security, robustness and detection performance.

---

## References within the project repository
- `backend/ai_engine.py` - implemented enhancement and YOLO wrapper
- `backend/server.py` - APIs, upload pipeline, media backfill and stream relay
- `backend/database.py` - event and media persistence, Supabase Storage helpers
- `agent/main.py` - Pi agent loop and motion/capture coordination
- `agent/camera.py` - real camera interface
- `agent/pir_sensor.py` - HC-SR501 style PIR input
- `agent/uploader.py` - local upload retry spool
- `ai_model_source/inference.py`, `train.py`, `export_ncnn.py` - separate YOLO/NCNN research scaffold
- `src/screens/ImagesScreen.jsx`, `src/screens/FootageScreen.jsx`, and the viewer modals - archive and original/enhanced controls
