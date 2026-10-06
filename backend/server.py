"""NocturPod Production Backend API Server
Provides real OV5647 stream ingestion and relay, device heartbeat and telemetry tracking,
command queueing/polling, asynchronous AI low-light enhancement processing, and
Supabase PostgreSQL / Storage persistence.
"""
from __future__ import annotations

import concurrent.futures
import datetime
import os
import shutil
import time
from pathlib import Path
from typing import Any, Generator

import cv2
import numpy as np
from flask import Flask, Response, jsonify, request, send_from_directory

from backend.ai_engine import ENGINE, enhance_image, enhance_video
from backend.database import (
    ack_command,
    check_device_timeouts,
    create_event,
    generate_event_id,
    get_device_status,
    get_event,
    get_signed_storage_url,
    init_db,
    list_events,
    list_media_events,
    log_system_event,
    poll_commands,
    queue_command,
    record_detection,
    record_media_asset,
    update_event_status,
    upload_to_supabase_storage,
    upsert_device_heartbeat,
)

BASE_DIR = Path(__file__).resolve().parent.parent
STORAGE_DIR = BASE_DIR / "storage"
MEDIA_DIR = STORAGE_DIR / "media"
MEDIA_DIR.mkdir(parents=True, exist_ok=True)

app = Flask(__name__, static_folder=str(MEDIA_DIR))

# Device authorization token from environment
DEVICE_AUTH_TOKEN = os.getenv("NOCTURPOD_DEVICE_TOKEN", "nocturpod-sec-key-replace-with-secure-token")

# Thread pool for asynchronous AI enhancement jobs
ENHANCE_EXECUTOR = concurrent.futures.ThreadPoolExecutor(max_workers=3)


# --------------------------------------------------------------------------
# Real-Time Live Streaming Relay (Strictly Real OV5647 Frames)
# --------------------------------------------------------------------------
class RealStreamRelay:
    def __init__(self) -> None:
        self.latest_jpeg: bytes | None = None
        self.last_update_ts: float = 0.0

    def push_frame(self, jpeg_bytes: bytes) -> None:
        self.latest_jpeg = jpeg_bytes
        self.last_update_ts = time.time()

    def get_frame(self) -> bytes | None:
        # Only return frame if received within last 4 seconds
        if self.latest_jpeg and (time.time() - self.last_update_ts < 4.0):
            return self.latest_jpeg
        return None


STREAM_RELAY = RealStreamRelay()


# --------------------------------------------------------------------------
# Device Authentication Helper
# --------------------------------------------------------------------------
def verify_device_auth() -> bool:
    token = request.headers.get("X-Device-Token") or request.headers.get("Authorization", "").replace("Bearer ", "")
    if token and token == DEVICE_AUTH_TOKEN:
        return True
    return False


# --------------------------------------------------------------------------
# Health & Status Endpoints
# --------------------------------------------------------------------------
@app.get("/health")
def root_health():
    return jsonify({
        "status": "ok",
        "service": "NocturPod Production Backend",
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()
    })


@app.get("/api/device/health")
def device_health():
    check_device_timeouts()
    device = get_device_status()
    return jsonify({
        "status": "ok",
        "backend": "ONLINE",
        "ai_engine": "READY" if ENGINE.is_ready else "AVAILABLE",
        "device": device
    })


@app.get("/api/device/status")
def device_status_route():
    check_device_timeouts()
    status = get_device_status()
    if not status:
        return jsonify({"status": "OFFLINE", "message": "No device telemetry registered"}), 200
    return jsonify(status)


@app.post("/api/device/heartbeat")
def device_heartbeat():
    if not verify_device_auth():
        return jsonify({"error": "Unauthorized device"}), 401

    payload = request.get_json(silent=True) or {}
    device_id = payload.get("device_id", "nocturpod-edge-01")
    updated = upsert_device_heartbeat(payload)
    return jsonify({"status": "ACK", "device_id": device_id, "server_time": datetime.datetime.now(datetime.timezone.utc).isoformat()})


# --------------------------------------------------------------------------
# Command Queue Endpoints
# --------------------------------------------------------------------------
@app.post("/api/device/commands/capture")
def command_trigger_capture():
    cmd = queue_command("nocturpod-edge-01", "CAPTURE_IMAGE", {"timestamp": datetime.datetime.now().isoformat()})
    log_system_event("INFO", "DASHBOARD", "Snapshot capture command queued for NocturPod edge node")
    return jsonify(cmd)


@app.post("/api/device/commands/record")
def command_toggle_record():
    data = request.get_json(silent=True) or {}
    action = "START_RECORDING" if data.get("recording", True) else "STOP_RECORDING"
    cmd = queue_command("nocturpod-edge-01", action, data)
    log_system_event("INFO", "DASHBOARD", f"{action} command queued for NocturPod edge node")
    return jsonify(cmd)


@app.get("/api/device/commands/poll")
def command_poll():
    if not verify_device_auth():
        return jsonify({"error": "Unauthorized device"}), 401
    device_id = request.args.get("device_id", "nocturpod-edge-01")
    commands = poll_commands(device_id)
    return jsonify({"commands": commands})


@app.post("/api/device/commands/<command_id>/ack")
def command_ack(command_id: str):
    if not verify_device_auth():
        return jsonify({"error": "Unauthorized device"}), 401
    data = request.get_json(silent=True) or {}
    status = data.get("status", "EXECUTED")
    error_msg = data.get("error_message")
    ack_command(command_id, status=status, error_message=error_msg)
    return jsonify({"status": "ACK", "command_id": command_id})


# --------------------------------------------------------------------------
# Real Live Stream Endpoints (Strictly Genuine Camera)
# --------------------------------------------------------------------------
@app.post("/api/stream/frame")
def stream_ingest_frame():
    if not verify_device_auth():
        return jsonify({"error": "Unauthorized device"}), 401
    raw = request.data
    if raw:
        STREAM_RELAY.push_frame(raw)
        return jsonify({"status": "FRAME_ACCEPTED"})
    return jsonify({"error": "No frame data"}), 400


def stream_generator() -> Generator[bytes, None, None]:
    while True:
        frame_bytes = STREAM_RELAY.get_frame()
        if frame_bytes:
            yield (
                b"--frame\r\n"
                b"Content-Type: image/jpeg\r\n\r\n" + frame_bytes + b"\r\n"
            )
        time.sleep(1.0 / 15.0)


@app.get("/api/stream/live")
def stream_live():
    if STREAM_RELAY.get_frame() is None:
        return Response("CAMERA OFFLINE OR WAITING FOR STREAM", status=503, mimetype="text/plain")
    return Response(stream_generator(), mimetype="multipart/x-mixed-replace; boundary=frame")


@app.get("/api/stream/status")
def stream_status():
    check_device_timeouts()
    device = get_device_status()
    has_active_feed = STREAM_RELAY.get_frame() is not None
    return jsonify({
        "status": "STREAMING" if has_active_feed else "WAITING_FOR_CAMERA",
        "fps": device.get("stream_fps", 15) if has_active_feed else 0,
        "resolution": device.get("stream_resolution", "1280x720") if device else "1280x720",
        "camera_status": device.get("camera_status", "OFFLINE") if device else "OFFLINE"
    })


# --------------------------------------------------------------------------
# Asynchronous AI Enhancement Pipeline
# --------------------------------------------------------------------------
def _process_enhancement_async(event_id: str, device_id: str, orig_path: Path, media_type: str, date_str: str) -> None:
    """Runs immediately after original capture/recording is finalized:
    1. Sets event to ENHANCEMENT_PROCESSING
    2. Runs AI enhancement model
    3. Saves separate ENHANCED media file
    4. Uploads ENHANCED asset to Supabase Storage
    5. Records detections if image
    6. Updates database event to COMPLETE
    """
    try:
        update_event_status(event_id, status="ENHANCEMENT_PROCESSING", ai_status="PROCESSING")
        ext = orig_path.suffix.lower()
        enhanced_filename = f"{event_id}_enhanced{ext}"
        enhanced_local_path = MEDIA_DIR / enhanced_filename

        storage_folder = "images" if media_type == "IMAGE" else "videos"
        enhanced_storage_path = f"enhanced/{storage_folder}/{device_id}/{date_str}/{enhanced_filename}"

        if media_type == "IMAGE":
            res = enhance_image(orig_path, enhanced_local_path)
            if res.get("status") != "COMPLETE":
                update_event_status(event_id, status="ENHANCEMENT_FAILED", ai_status="FAILED", notes=res.get("error"))
                return

            # Object detection on enhanced image
            img_bgr = cv2.imread(str(enhanced_local_path))
            if img_bgr is not None:
                det_res = ENGINE.infer(img_bgr)
                for d in det_res.get("detections", []):
                    record_detection(event_id, d["label"], d["confidence"], d["x1"], d["y1"], d["x2"], d["y2"])

            # Upload enhanced image to Supabase Storage
            upload_to_supabase_storage(enhanced_local_path, enhanced_storage_path, content_type="image/jpeg")

            # Record ENHANCED media asset
            record_media_asset({
                "id": f"med_{event_id}_enhanced",
                "event_id": event_id,
                "device_id": device_id,
                "media_type": "IMAGE",
                "variant": "ENHANCED",
                "filename": enhanced_filename,
                "storage_path": enhanced_storage_path,
                "file_size_bytes": enhanced_local_path.stat().st_size if enhanced_local_path.exists() else 0,
                "resolution": res.get("resolution", "1280x720"),
                "duration": "0s",
                "processing_status": "COMPLETE"
            })

        else:
            # Video enhancement
            res = enhance_video(orig_path, enhanced_local_path)
            if res.get("status") != "COMPLETE":
                update_event_status(event_id, status="ENHANCEMENT_FAILED", ai_status="FAILED", notes=res.get("error"))
                return

            upload_to_supabase_storage(enhanced_local_path, enhanced_storage_path, content_type="video/mp4")

            record_media_asset({
                "id": f"med_{event_id}_enhanced",
                "event_id": event_id,
                "device_id": device_id,
                "media_type": "VIDEO",
                "variant": "ENHANCED",
                "filename": enhanced_filename,
                "storage_path": enhanced_storage_path,
                "file_size_bytes": enhanced_local_path.stat().st_size if enhanced_local_path.exists() else 0,
                "resolution": res.get("resolution", "1280x720"),
                "duration": f"{res.get('duration_sec', 0)}s",
                "processing_status": "COMPLETE"
            })

        update_event_status(event_id, status="COMPLETE", ai_status="COMPLETE")
        log_system_event("INFO", "AI_ENGINE", f"Enhancement completed for event {event_id}")

    except Exception as ex:
        print(f"[AI Pipeline] Enhancement error for {event_id}: {ex}")
        update_event_status(event_id, status="ENHANCEMENT_FAILED", ai_status="FAILED", notes=str(ex))


# --------------------------------------------------------------------------
# Media Ingestion & Upload Route
# --------------------------------------------------------------------------
@app.post("/api/media/upload")
def upload_media():
    """Ingests ORIGINAL media from Raspberry Pi edge agent, stores it as ORIGINAL,
    uploads to Supabase Storage, and queues asynchronous AI enhancement.
    """
    if not verify_device_auth():
        return jsonify({"error": "Unauthorized device"}), 401

    uploaded = request.files.get("file") or request.files.get("image") or request.files.get("video")
    if not uploaded or not uploaded.filename:
        return jsonify({"error": "Missing file payload"}), 400

    event_id = request.form.get("event_id") or generate_event_id()
    device_id = request.form.get("device_id") or "nocturpod-edge-01"
    media_type = request.form.get("media_type")
    
    ext = Path(uploaded.filename).suffix.lower()
    if not media_type:
        media_type = "VIDEO" if ext in (".mp4", ".mkv", ".avi", ".mov") else "IMAGE"

    now = datetime.datetime.now(datetime.timezone.utc)
    date_str = now.strftime("%Y-%m-%d")

    orig_filename = f"{event_id}_original{ext}"
    orig_local_path = MEDIA_DIR / orig_filename
    uploaded.save(str(orig_local_path))
    file_size = orig_local_path.stat().st_size

    # Define Storage Path
    storage_folder = "images" if media_type == "IMAGE" else "videos"
    orig_storage_path = f"original/{storage_folder}/{device_id}/{date_str}/{orig_filename}"

    # Upload ORIGINAL to Supabase Storage
    content_type = "image/jpeg" if media_type == "IMAGE" else "video/mp4"
    upload_to_supabase_storage(orig_local_path, orig_storage_path, content_type=content_type)

    # 1. Create Event
    create_event({
        "event_id": event_id,
        "device_id": device_id,
        "type": "MANUAL_CAPTURE" if media_type == "IMAGE" else "VIDEO_RECORDING",
        "status": "CAPTURED" if media_type == "IMAGE" else "RECORDED",
        "ai_status": "PENDING",
        "duration": request.form.get("duration", "0s"),
        "notes": f"Original media ingested. Size: {file_size / 1024:.1f} KB"
    })

    # 2. Record ORIGINAL media asset
    record_media_asset({
        "id": f"med_{event_id}_original",
        "event_id": event_id,
        "device_id": device_id,
        "media_type": media_type,
        "variant": "ORIGINAL",
        "filename": orig_filename,
        "storage_path": orig_storage_path,
        "file_size_bytes": file_size,
        "resolution": "1280x720",
        "duration": request.form.get("duration", "0s"),
        "processing_status": "COMPLETE"
    })

    # 3. Immediately queue AI enhancement asynchronously
    ENHANCE_EXECUTOR.submit(_process_enhancement_async, event_id, device_id, orig_local_path, media_type, date_str)

    return jsonify({
        "status": "ACCEPTED",
        "event_id": event_id,
        "original_storage_path": orig_storage_path
    })


# --------------------------------------------------------------------------
# Events & Media Access Endpoints
# --------------------------------------------------------------------------
@app.get("/api/events")
def get_events_list():
    filter_type = request.args.get("filter", "ALL")
    search = request.args.get("search", "")
    events = list_events(limit=50, filter_type=filter_type, search=search)
    return jsonify(events)


@app.get("/api/events/<event_id>")
def get_single_event(event_id: str):
    ev = get_event(event_id)
    if not ev:
        return jsonify({"error": "Event not found"}), 404
    return jsonify(ev)


@app.post("/api/events/<event_id>/complete")
def complete_event(event_id: str):
    if not verify_device_auth():
        return jsonify({"error": "Unauthorized"}), 401
    update_event_status(event_id, status="COMPLETE")
    return jsonify({"status": "SUCCESS", "event_id": event_id})


@app.get("/api/media/images")
def get_images():
    captures = list_media_events("IMAGE")
    return jsonify(captures)


@app.get("/api/media/footage")
def get_footage():
    recordings = list_media_events("VIDEO")
    return jsonify(recordings)


@app.get("/api/media/file/<path:filepath>")
def serve_local_media_fallback(filepath: str):
    filename = Path(filepath).name
    return send_from_directory(str(MEDIA_DIR), filename)


@app.get("/api/ai/status")
def ai_status():
    return jsonify({
        "status": "ONLINE",
        "enhancement_pipeline": "Adaptive CLAHE + Detail Sharpening (ai_model_source)",
        "detection_engine": "YOLOv8n Perimeter Security",
        "is_ready": ENGINE.is_ready
    })


# --------------------------------------------------------------------------
# Production Server Entrypoint
# --------------------------------------------------------------------------
def run_server(host: str = "0.0.0.0", port: int | None = None, debug: bool = False):
    p = port or int(os.getenv("PORT", "5000"))
    h = os.getenv("HOST", host)
    print(f"[NocturPod Production Backend] Listening on http://{h}:{p}")
    app.run(host=h, port=p, debug=debug, threaded=True)


if __name__ == "__main__":
    run_server()
