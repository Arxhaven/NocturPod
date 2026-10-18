"""NocturPod Production Backend API Server
Provides real OV5647 stream ingestion and relay, device heartbeat and telemetry tracking,
command queueing/polling, asynchronous AI low-light enhancement processing, and
Supabase PostgreSQL / Storage persistence.
"""
from __future__ import annotations

import concurrent.futures
import datetime
import hashlib
import json
import mimetypes
import os
import shutil
import time
import threading
import tempfile
import urllib.request
import urllib.parse
from pathlib import Path
from typing import Any, Generator

import cv2
import numpy as np
from flask import Flask, Response, jsonify, redirect, request, send_file, send_from_directory
from flask_cors import CORS

from backend.ai_engine import ENGINE, enhance_image, enhance_video, _transcode_browser_mp4
from backend.super_resolution import clear_cached_session_error, get_super_resolution_status
from backend.database import (
    ack_command,
    check_device_timeouts,
    create_event,
    clear_detections_for_event,
    generate_event_id,
    get_device_status,
    get_event,
    get_signed_storage_url,
    has_supabase_config,
    init_db,
    list_events,
    list_media_events,
    log_system_event,
    poll_commands,
    queue_command,
    record_detection,
    record_media_asset,
    delete_all_events,
    delete_event,
    update_event_status,
    upload_to_supabase_storage,
    upsert_device_heartbeat,
)

BASE_DIR = Path(__file__).resolve().parent.parent
STORAGE_DIR = BASE_DIR / "storage"
MEDIA_DIR = STORAGE_DIR / "media"
MEDIA_DIR.mkdir(parents=True, exist_ok=True)

app = Flask(__name__, static_folder=str(MEDIA_DIR))

CORS(
    app,
    resources={
        r"/api/*": {
            "origins": [
                "https://noctur-pod.vercel.app"
            ],
            "methods": ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
            "allow_headers": [
                "Content-Type",
                "Authorization",
                "X-Device-Token"
            ]
        }
    }
)

# Device authorization token from environment.
# Environment providers can accidentally preserve a leading/trailing newline or space.
# Trim surrounding whitespace, but do not alter any other characters in the credential.
_RAW_DEVICE_AUTH_TOKEN = os.getenv("NOCTURPOD_DEVICE_TOKEN")
_DEFAULT_DEVICE_AUTH_TOKEN = "nocturpod-sec-key-replace-with-secure-token"
DEVICE_AUTH_TOKEN = (
    _RAW_DEVICE_AUTH_TOKEN
    if _RAW_DEVICE_AUTH_TOKEN is not None
    else _DEFAULT_DEVICE_AUTH_TOKEN
).strip()
_AUTH_TOKEN_FINGERPRINT = hashlib.sha256(DEVICE_AUTH_TOKEN.encode("utf-8")).hexdigest()[:12]
_raw_token_length = (
    len(_RAW_DEVICE_AUTH_TOKEN)
    if _RAW_DEVICE_AUTH_TOKEN is not None
    else len(_DEFAULT_DEVICE_AUTH_TOKEN)
)
print(
    "[Auth] Device-token diagnostic: "
    f"configured_env={'yes' if _RAW_DEVICE_AUTH_TOKEN is not None else 'no (using default)'}, "
    f"raw_length={_raw_token_length}, "
    f"normalized_length={len(DEVICE_AUTH_TOKEN)}, "
    f"whitespace_trimmed={'yes' if _raw_token_length != len(DEVICE_AUTH_TOKEN) else 'no'}, "
    f"fingerprint={_AUTH_TOKEN_FINGERPRINT}"
)

# Keep this marker in sync with backend.ai_engine's enhancement_mode. It prevents
# a permanently failing capture from being retried on every gallery poll while
# allowing failures from an older pipeline version to receive one migration retry.
CURRENT_ENHANCEMENT_VERSION = "NOCTURPOD_REAL_ESRGAN_4K_V3"

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
@app.get("/")
def root_index():
    return jsonify({
        "service": "NocturPod Production Backend API",
        "status": "ONLINE",
        "endpoints": {
            "health": "/health",
            "device_health": "/api/device/health",
            "device_status": "/api/device/status",
            "events": "/api/events",
            "images": "/api/media/images",
            "footage": "/api/media/footage",
            "stream_live": "/api/stream/live",
            "stream_status": "/api/stream/status",
            "ai_status": "/api/ai/status"
        }
    })


@app.get("/health")
def root_health():
    return jsonify({
        "status": "ok",
        "service": "NocturPod Production Backend",
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()
    })

@app.get("/api/debug/routes")
def debug_routes():
    return jsonify({
        "routes": [
            str(rule)
            for rule in app.url_map.iter_rules()
        ]
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
    try:
        upsert_device_heartbeat(payload)
    except Exception as exc:
        print(f"[Heartbeat] Supabase persistence failed for {device_id}: {type(exc).__name__}: {exc}")
        return jsonify({
            "error": "Device telemetry could not be persisted",
            "retryable": True
        }), 503
    return jsonify({"status": "ACK", "device_id": device_id, "server_time": datetime.datetime.now(datetime.timezone.utc).isoformat()})


# --------------------------------------------------------------------------
# Command Queue & Lighting Endpoints
# --------------------------------------------------------------------------
@app.get("/api/device/light/mode")
def get_light_mode_endpoint():
    check_device_timeouts()
    device = get_device_status() or {}
    return jsonify({
        "success": True,
        "mode": device.get("light_mode", "WHITE"),
        "light_mode": device.get("light_mode", "WHITE"),
        "device_id": device.get("device_id", "nocturpod-edge-01"),
        "device_status": device.get("status", "OFFLINE"),
        "confirmed": device.get("status") in ("ONLINE", "RECORDING")
    })


@app.post("/api/device/camera/settings")
def set_camera_settings_endpoint():
    """Queue camera controls for application by the physical Raspberry Pi agent."""
    data = request.get_json(silent=True) or {}
    try:
        settings = {
            "auto_exposure": bool(data.get("auto_exposure", True)),
            "exposure_time_us": max(1000, min(60000, int(data.get("exposure_time_us", 20000)))),
            "analogue_gain": max(1.0, min(8.0, float(data.get("analogue_gain", 3.0)))),
            "auto_white_balance": bool(data.get("auto_white_balance", True)),
            "brightness": max(-1.0, min(1.0, float(data.get("brightness", 0.0)))),
            "contrast": max(0.5, min(2.0, float(data.get("contrast", 1.0)))),
            "saturation": max(0.0, min(2.0, float(data.get("saturation", 0.65)))),
            "sharpness": max(0.0, min(2.0, float(data.get("sharpness", 1.0)))),
        }
    except (TypeError, ValueError):
        return jsonify({"success": False, "error": "Invalid camera setting values."}), 400

    cmd = queue_command("nocturpod-edge-01", "SET_CAMERA_SETTINGS", settings)
    log_system_event("INFO", "DASHBOARD", "Camera controls queued for edge application")
    return jsonify({
        "success": True,
        "status": "QUEUED",
        "command_id": cmd.get("command_id"),
        "settings": settings,
        "note": "The Pi agent must be online and the active camera driver must support the requested controls."
    }), 202


@app.post("/api/device/pir/settings")
def set_pir_settings_endpoint():
    """Queue PIR enable/cooldown settings; physical GPIO setup is confirmed by the agent."""
    data = request.get_json(silent=True) or {}
    enabled = data.get("enabled", True)
    if not isinstance(enabled, bool):
        return jsonify({"success": False, "error": "'enabled' must be true or false."}), 400
    try:
        cooldown_seconds = max(5, min(300, int(data.get("cooldown_seconds", 15))))
    except (TypeError, ValueError):
        return jsonify({"success": False, "error": "cooldown_seconds must be an integer from 5 to 300."}), 400

    payload = {"enabled": enabled, "cooldown_seconds": cooldown_seconds}
    cmd = queue_command("nocturpod-edge-01", "SET_PIR_SETTINGS", payload)
    log_system_event("INFO", "DASHBOARD", f"PIR settings queued: enabled={enabled}, cooldown={cooldown_seconds}s")
    return jsonify({
        "success": True,
        "status": "QUEUED",
        "command_id": cmd.get("command_id"),
        "settings": payload,
        "note": "The Pi must be online; enabling PIR fails explicitly if GPIO hardware is unavailable."
    }), 202


@app.post("/api/device/light/intensity")
def set_light_intensity_endpoint():
    """Queue illumination intensity for a PWM-compatible LED driver."""
    data = request.get_json(silent=True) or {}
    mode = str(data.get("mode", "NIGHT")).strip().upper()
    if mode not in ("WHITE", "NIGHT"):
        return jsonify({"success": False, "error": "Intensity mode must be WHITE or NIGHT."}), 400
    try:
        intensity_pct = max(0, min(100, int(data.get("intensity_pct", 100))))
    except (TypeError, ValueError):
        return jsonify({"success": False, "error": "intensity_pct must be from 0 to 100."}), 400

    payload = {"mode": mode, "intensity_pct": intensity_pct}
    cmd = queue_command("nocturpod-edge-01", "SET_LIGHT_INTENSITY", payload)
    log_system_event("INFO", "DASHBOARD", f"{mode} light intensity queued: {intensity_pct}%")
    return jsonify({
        "success": True,
        "status": "QUEUED",
        "command_id": cmd.get("command_id"),
        "settings": payload,
        "note": "Physical dimming requires a PWM-compatible LED driver and LIGHT_PWM_ENABLED=1 on the Pi."
    }), 202


@app.post("/api/device/light/mode")
def set_light_mode_endpoint():
    data = request.get_json(silent=True) or {}
    raw_mode = (data.get("mode") or "").strip().upper()
    if raw_mode not in ("WHITE", "NIGHT", "AUTO"):
        if raw_mode in ("NORMAL", "WHITE_LIGHT", "DAY"):
            raw_mode = "WHITE"
        elif raw_mode in ("LOW_LIGHT", "IR", "NIGHT_MODE", "DARK"):
            raw_mode = "NIGHT"
        else:
            return jsonify({"success": False, "error": f"Invalid mode '{raw_mode}'. Must be WHITE, NIGHT, or AUTO."}), 400

    cmd = queue_command("nocturpod-edge-01", "SET_LIGHT_MODE", {"mode": raw_mode})
    log_system_event("INFO", "DASHBOARD", f"Lighting mode switch queued: {raw_mode}")
    return jsonify({
        "success": True,
        "status": "QUEUED",
        "mode": raw_mode,
        "light_mode": raw_mode,
        "command_id": cmd.get("command_id")
    })



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
def _mark_enhancement_failure(event_id: str, error_message: str) -> None:
    """Persist failure diagnostics and a pipeline-version marker without losing prior metrics.

    An old failed item can be retried after a model/config fix. If it fails under the
    current version, automatic gallery scans stop retrying it repeatedly, but the
    authenticated manual retry endpoint remains available.
    """
    try:
        event = get_event(event_id) or {}
        metrics = event.get("quality_metrics")
        metrics = dict(metrics) if isinstance(metrics, dict) else {}
        metrics["last_failed_enhancement_version"] = CURRENT_ENHANCEMENT_VERSION
        metrics["last_failed_enhancement_error"] = str(error_message)[:700]
        metrics.setdefault("metric_type", "heuristic_visibility_index_not_accuracy")
        note = "AI_QUALITY:" + json.dumps(metrics, separators=(",", ":"), ensure_ascii=True)
        update_event_status(
            event_id,
            status="ENHANCEMENT_FAILED",
            ai_status="FAILED",
            notes=note,
        )
    except Exception as exc:
        log_system_event(
            "ERROR", "AI_ENGINE",
            f"Could not persist enhancement failure marker for {event_id}: {type(exc).__name__}: {exc}"
        )
        # Always set the failure status even if diagnostic metadata could not be stored.
        update_event_status(event_id, status="ENHANCEMENT_FAILED", ai_status="FAILED")


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
                _mark_enhancement_failure(
                    event_id,
                    f"Image enhancement failed: {res.get('error', 'unknown error')}",
                )
                log_system_event(
                    "ERROR", "AI_ENGINE",
                    f"Image enhancement failed for {event_id}; original preserved: {res.get('error', 'unknown error')}"
                )
                print(f"[AI Pipeline] Image enhancement failed for {event_id}: {res.get('error', 'unknown error')}")
                return

            # Compute detections without mutating the database yet. During legacy
            # reprocessing, old results remain available until the new enhanced asset
            # has been saved successfully.
            pending_detections: list[dict[str, Any]] = []
            img_bgr = cv2.imread(str(enhanced_local_path))
            if img_bgr is not None:
                try:
                    det_res = ENGINE.infer(img_bgr, conf=0.22, already_enhanced=True)
                    pending_detections = det_res.get("detections", [])
                except Exception as det_err:
                    print(f"[AI Detection] Notice: Vision detection non-fatal skip ({det_err})")

            # Only publish an enhanced asset after its cloud upload succeeds.
            enhanced_uploaded = upload_to_supabase_storage(
                enhanced_local_path, enhanced_storage_path, content_type="image/jpeg"
            )
            if has_supabase_config() and not enhanced_uploaded:
                update_event_status(
                    event_id,
                    status="COMPLETE",
                    ai_status="ORIGINAL_PRESERVED",
                    notes="AI enhancement was generated but could not be saved to Supabase Storage; original media is preserved."
                )
                print(f"[AI Pipeline] Enhanced image upload failed for {event_id}; preserving original")
                return

            # Record ENHANCED media asset
            # Replace earlier detection rows only after the enhanced asset is safely stored.
            clear_detections_for_event(event_id)
            for detection in pending_detections:
                record_detection(
                    event_id, detection["label"], detection["confidence"],
                    detection["x1"], detection["y1"], detection["x2"], detection["y2"]
                )

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
                _mark_enhancement_failure(
                    event_id,
                    f"Video enhancement failed: {res.get('error', 'unknown error')}",
                )
                log_system_event(
                    "ERROR", "AI_ENGINE",
                    f"Video enhancement failed for {event_id}; original preserved: {res.get('error', 'unknown error')}"
                )
                print(f"[AI Pipeline] Video enhancement failed for {event_id}: {res.get('error', 'unknown error')}")
                return

            enhanced_uploaded = upload_to_supabase_storage(
                enhanced_local_path, enhanced_storage_path, content_type="video/mp4"
            )
            if has_supabase_config() and not enhanced_uploaded:
                update_event_status(
                    event_id,
                    status="COMPLETE",
                    ai_status="ORIGINAL_PRESERVED",
                    notes="Video enhancement was generated but could not be saved to Supabase Storage; original media is preserved."
                )
                print(f"[AI Pipeline] Enhanced video upload failed for {event_id}; preserving original")
                return

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

        quality_metrics = res.get("quality_metrics") if isinstance(res, dict) else None
        quality_note = (
            "AI_QUALITY:" + json.dumps(quality_metrics, separators=(",", ":"), ensure_ascii=True)
            if quality_metrics else "AI enhancement completed; no quality sample was available."
        )
        update_event_status(
            event_id, status="COMPLETE", ai_status="COMPLETE", notes=quality_note
        )
        log_system_event("INFO", "AI_ENGINE", f"Enhancement completed for event {event_id}")

    except Exception as ex:
        print(f"[AI Pipeline] Enhancement error for {event_id}: {ex}")
        log_system_event(
            "ERROR", "AI_ENGINE",
            f"Enhancement error for {event_id}; original preserved: {type(ex).__name__}: {ex}"
        )
        # Preserve any previous visibility metrics while marking this pipeline version failed.
        _mark_enhancement_failure(event_id, f"{type(ex).__name__}: {ex}")


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
    media_type = (request.form.get("media_type") or "").upper()
    capture_source = (request.form.get("capture_source") or "MANUAL").upper()

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

    # Upload ORIGINAL to Supabase Storage before publishing its database record.
    default_type = "image/jpeg" if media_type == "IMAGE" else "video/mp4"
    content_type = mimetypes.guess_type(orig_filename)[0] or default_type
    original_uploaded = upload_to_supabase_storage(
        orig_local_path, orig_storage_path, content_type=content_type
    )
    if has_supabase_config() and not original_uploaded:
        print(f"[Media Upload] Original upload to Supabase failed for event {event_id}; not creating a dangling asset record")
        return jsonify({
            "error": "Supabase Storage upload failed; original media was not registered.",
            "event_id": event_id,
            "retryable": True
        }), 503

    try:
        # 1. Create Event
        create_event({
            "event_id": event_id,
            "device_id": device_id,
            "type": ("MOTION_CAPTURE" if capture_source == "MOTION" else "MANUAL_CAPTURE") if media_type == "IMAGE" else "VIDEO_RECORDING",
            "status": "CAPTURED" if media_type == "IMAGE" else "RECORDED",
            "ai_status": "PENDING",
            "duration": request.form.get("duration", "0s"),
            "notes": f"{'PIR motion-triggered capture' if capture_source == 'MOTION' else 'Original media ingested'}. Size: {file_size / 1024:.1f} KB"
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
    except Exception as exc:
        print(f"[Media Upload] Metadata persistence failed for {event_id}: {type(exc).__name__}: {exc}")
        return jsonify({
            "error": "Supabase metadata persistence failed; retry the upload.",
            "event_id": event_id,
            "retryable": True
        }), 503

    # 3. Immediately queue AI enhancement asynchronously
    ENHANCE_EXECUTOR.submit(_process_enhancement_async, event_id, device_id, orig_local_path, media_type, date_str)

    return jsonify({
        "status": "ACCEPTED",
        "event_id": event_id,
        "original_storage_path": orig_storage_path
    })


# --------------------------------------------------------------------------
# Legacy Media Enhancement Backfill
# --------------------------------------------------------------------------
_BACKFILL_QUEUE_LOCK = threading.Lock()
_AUTO_BACKFILL_GUARD = threading.Lock()
_AUTO_BACKFILL_RUNNING = False
_AUTO_BACKFILL_LAST_START = 0.0
_AUTO_BACKFILL_COOLDOWN_SECONDS = 300.0


def _is_recent_media_event(event: dict[str, Any], within_seconds: int = 300) -> bool:
    """Leave newly ingested items to the normal upload pipeline."""
    raw_timestamp = event.get("timestamp")
    if not raw_timestamp:
        return False
    try:
        timestamp = datetime.datetime.fromisoformat(str(raw_timestamp).replace("Z", "+00:00"))
        if timestamp.tzinfo is None:
            timestamp = timestamp.replace(tzinfo=datetime.timezone.utc)
        return (datetime.datetime.now(datetime.timezone.utc) - timestamp).total_seconds() < within_seconds
    except Exception:
        return False


def _reprocess_existing_media_worker(
    event_id: str,
    device_id: str,
    original_source: str,
    media_type: str,
    extension: str,
    base_url: str = "",
) -> None:
    """Download a persisted ORIGINAL object and run the same enhancement pipeline.

    Storage paths are preferred over signed URLs so a large historical backfill
    renews each private Supabase URL when its job actually starts, rather than
    reusing an expiring URL created when the gallery was first scanned.
    """
    local_original: Path | None = None
    try:
        safe_event_id = "".join(ch for ch in event_id if ch.isalnum() or ch in ("-", "_"))
        suffix = extension if extension and len(extension) <= 8 else (".mp4" if media_type == "VIDEO" else ".jpg")

        if original_source.startswith(("original/images/", "original/videos/")):
            original_url = get_signed_storage_url(original_source)
        else:
            original_url = original_source
        if not original_url:
            raise RuntimeError("Could not resolve original media URL")
        if original_url.startswith("/") and base_url:
            original_url = base_url.rstrip("/") + original_url

        with urllib.request.urlopen(original_url, timeout=45) as response:
            with tempfile.NamedTemporaryFile(
                prefix=f"{safe_event_id}_backfill_", suffix=suffix,
                dir=str(MEDIA_DIR), delete=False
            ) as temp_file:
                shutil.copyfileobj(response, temp_file)
                local_original = Path(temp_file.name)

        date_str = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d")
        _process_enhancement_async(event_id, device_id, local_original, media_type, date_str)
    except Exception as exc:
        print(f"[AI Backfill] Failed to reprocess legacy event {event_id}: {type(exc).__name__}: {exc}")
        try:
            _mark_enhancement_failure(
                event_id,
                f"Legacy enhancement backfill failed: {type(exc).__name__}: {exc}",
            )
            log_system_event(
                "ERROR", "AI_BACKFILL",
                f"Legacy enhancement backfill failed for {event_id}: {type(exc).__name__}: {exc}"
            )
        except Exception:
            pass
    finally:
        if local_original:
            try:
                local_original.unlink(missing_ok=True)
            except Exception:
                pass


def _queue_missing_media_backfill(base_url: str, force_failed: bool = False) -> dict[str, Any]:
    """Queue captures whose existing enhanced asset is absent or predates Real-ESRGAN 4K.

    The original object is never overwritten. Event status is claimed before a job
    is submitted so subsequent gallery refreshes do not queue the same item again.
    Failed jobs only retry when this authenticated endpoint explicitly forces retries.
    """
    queued: list[str] = []
    skipped: list[dict[str, str]] = []
    offset = 0
    page_size = 100

    with _BACKFILL_QUEUE_LOCK:
        while True:
            events = list_events(limit=page_size, offset=offset)
            if not events:
                break

            for event in events:
                event_id = event.get("event_id")
                event_type = event.get("type")
                if not event_id or event_type not in ("MANUAL_CAPTURE", "MOTION_CAPTURE", "VIDEO_RECORDING"):
                    continue

                status = str(event.get("status") or "").upper()
                ai_status = str(event.get("ai_status") or "").upper()
                if status in ("AI_BACKFILL_QUEUED", "ENHANCEMENT_PROCESSING") or ai_status == "PROCESSING":
                    continue
                # Re-run old assets until they have the learned 4K Real-ESRGAN version.
                # Originals are never overwritten. Failed items stop auto-retrying on each
                # gallery poll; the authenticated manual endpoint can explicitly retry them.
                quality_metrics = event.get("quality_metrics") or {}
                current_mode = quality_metrics.get("enhancement_mode")
                if event.get("enhanced_url") and current_mode == CURRENT_ENHANCEMENT_VERSION:
                    continue
                if status == "ENHANCEMENT_FAILED" and not force_failed:
                    failed_version = quality_metrics.get("last_failed_enhancement_version")
                    if failed_version == CURRENT_ENHANCEMENT_VERSION:
                        skipped.append({
                            "event_id": str(event_id),
                            "reason": "enhancement already failed under the current pipeline version; manual retry is available",
                        })
                        continue
                    # No failure marker for this version means this old item failed
                    # before the checksum/model fix. Give it one automatic migration retry.

                # New uploads are handled by /api/media/upload. However, retry a
                # recently captured item immediately if its first enhancement failed.
                if _is_recent_media_event(event) and status != "ENHANCEMENT_FAILED" and ai_status not in ("FAILED", "ORIGINAL_PRESERVED"):
                    continue

                original_url = event.get("original_url")
                original_source = event.get("original_storage_path") or original_url
                if not original_source:
                    skipped.append({"event_id": str(event_id), "reason": "original asset path missing"})
                    continue

                media_type = "VIDEO" if event_type == "VIDEO_RECORDING" else "IMAGE"
                parsed_path = original_source.split("?", 1)[0].rstrip("/")
                extension = Path(parsed_path).suffix.lower()
                if extension not in (".jpg", ".jpeg", ".png", ".webp", ".mp4", ".mov", ".mkv", ".avi"):
                    extension = ".mp4" if media_type == "VIDEO" else ".jpg"
                if not original_source.startswith(("original/images/", "original/videos/")) and original_source.startswith("/"):
                    original_source = base_url.rstrip("/") + original_source

                # Claim the event before scheduling so repeated requests see a queued item.
                update_event_status(
                    str(event_id),
                    status="AI_BACKFILL_QUEUED",
                    ai_status="PROCESSING"
                )
                ENHANCE_EXECUTOR.submit(
                    _reprocess_existing_media_worker,
                    str(event_id),
                    event.get("device_id") or "nocturpod-edge-01",
                    original_source,
                    media_type,
                    extension,
                    base_url,
                )
                queued.append(str(event_id))

            if len(events) < page_size:
                break
            offset += len(events)

    log_system_event(
        "INFO",
        "AI_BACKFILL",
        f"Queued {len(queued)} legacy media enhancement job(s); skipped {len(skipped)} missing original(s)"
    )
    return {
        "queued_count": len(queued),
        "queued_event_ids": queued,
        "skipped_count": len(skipped),
        "skipped": skipped,
    }


def _start_auto_backfill(base_url: str) -> None:
    """Periodically scan once per cooldown while keeping overlapping scans out."""
    global _AUTO_BACKFILL_RUNNING, _AUTO_BACKFILL_LAST_START
    with _AUTO_BACKFILL_GUARD:
        now = time.monotonic()
        if _AUTO_BACKFILL_RUNNING:
            return
        if now - _AUTO_BACKFILL_LAST_START < _AUTO_BACKFILL_COOLDOWN_SECONDS:
            return
        _AUTO_BACKFILL_RUNNING = True
        _AUTO_BACKFILL_LAST_START = now

    def _run() -> None:
        global _AUTO_BACKFILL_RUNNING, _AUTO_BACKFILL_LAST_START
        try:
            result = _queue_missing_media_backfill(base_url)
            print(
                "[AI Backfill] Historical scan finished: "
                f"queued={result['queued_count']}, skipped_missing_original={result['skipped_count']}"
            )
        except Exception as exc:
            print(f"[AI Backfill] Automatic historical scan failed: {type(exc).__name__}: {exc}")
            # Permit an immediate retry after a scan-level/transient failure.
            with _AUTO_BACKFILL_GUARD:
                _AUTO_BACKFILL_LAST_START = 0.0
        finally:
            with _AUTO_BACKFILL_GUARD:
                _AUTO_BACKFILL_RUNNING = False

    threading.Thread(target=_run, name="nocturpod-ai-backfill", daemon=True).start()


@app.post("/api/media/reprocess-missing")
def reprocess_missing_media():
    """Explicitly queue legacy originals with no enhanced asset.

    Requires the same device token as the edge agent. This endpoint is useful for
    retrying failures; the gallery also starts a one-time automatic backfill.
    """
    if not verify_device_auth():
        return jsonify({"error": "Unauthorized device"}), 401

    try:
        # A failed download/session is cached to avoid retrying every gallery poll.
        # Explicit authenticated retry clears that cache so the model can be fetched again.
        clear_cached_session_error()
        result = _queue_missing_media_backfill(request.host_url.rstrip("/"), force_failed=True)
        return jsonify({
            "status": "QUEUED",
            **result,
            "note": "Originals are preserved. Refresh the gallery after jobs finish.",
        }), 202
    except Exception as exc:
        print(f"[AI Backfill] Could not queue legacy media: {type(exc).__name__}: {exc}")
        return jsonify({"error": "Could not queue legacy media enhancement"}), 500


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


@app.delete("/api/events/<event_id>")
def delete_single_event_route(event_id: str):
    success = delete_event(event_id)
    if not success:
        return jsonify({"error": "Failed to delete event"}), 500
    return jsonify({"status": "DELETED", "event_id": event_id})


@app.delete("/api/events")
def delete_all_events_route():
    count = delete_all_events()
    return jsonify({"status": "DELETED_ALL", "count": count})


@app.get("/api/media/images")
def get_images():
    _start_auto_backfill(request.host_url.rstrip("/"))
    captures = list_media_events("IMAGE")
    return jsonify(captures)


@app.get("/api/media/footage")
def get_footage():
    _start_auto_backfill(request.host_url.rstrip("/"))
    recordings = list_media_events("VIDEO")
    return jsonify(recordings)


# Browser video playback/download helpers
_BROWSER_PLAYBACK_LOCKS: dict[str, threading.Lock] = {}
_BROWSER_PLAYBACK_LOCKS_GUARD = threading.Lock()


def _safe_media_identifier(value: str) -> str:
    cleaned = "".join(ch for ch in str(value) if ch.isalnum() or ch in ("-", "_"))
    return cleaned[:180]


def _browser_playback_lock(key: str) -> threading.Lock:
    with _BROWSER_PLAYBACK_LOCKS_GUARD:
        return _BROWSER_PLAYBACK_LOCKS.setdefault(key, threading.Lock())


def _ensure_browser_video_asset(event_id: str, variant: str) -> tuple[str | None, Path | None, str | None]:
    """Return an H.264/yuv420p playback copy for an ORIGINAL or ENHANCED event video.

    Source assets are never modified. Legacy mp4v/other videos are transcoded once into
    separate playback assets, then cached in Supabase Storage as STREAM_ORIGINAL or
    STREAM_ENHANCED. A native enhanced output already marked H.264 can be streamed directly.
    """
    variant = variant.upper()
    if variant not in ("ORIGINAL", "ENHANCED"):
        return None, None, "Unsupported video variant"

    event = get_event(event_id)
    if not event:
        return None, None, "Recording not found"
    if event.get("type") != "VIDEO_RECORDING" and event.get("media_type") != "VIDEO":
        return None, None, "Requested event is not a video recording"

    source_path_key = "original_storage_path" if variant == "ORIGINAL" else "enhanced_storage_path"
    source_url_key = "original_url" if variant == "ORIGINAL" else "enhanced_url"
    stream_path_key = "original_stream_storage_path" if variant == "ORIGINAL" else "enhanced_stream_storage_path"
    stream_url_key = "original_stream_url" if variant == "ORIGINAL" else "enhanced_stream_url"

    existing_stream_path = event.get(stream_path_key)
    existing_stream_url = event.get(stream_url_key)
    if existing_stream_path and existing_stream_url:
        filename = Path(existing_stream_path).name
        if existing_stream_url.startswith(("https://", "http://")):
            return existing_stream_url, None, filename
        local_existing = MEDIA_DIR / filename
        if local_existing.is_file():
            return None, local_existing, filename
        return existing_stream_url, None, filename

    source_url = event.get(source_url_key)
    source_path = event.get(source_path_key)
    if not source_path or not source_url:
        return None, None, f"{variant.title()} video asset is missing"

    quality = event.get("quality_metrics") or {}
    if variant == "ENHANCED" and quality.get("browser_playback_compatible") and source_url:
        # New enhanced MP4s are written as H.264 + yuv420p + faststart by ai_engine.py.
        return source_url, None, Path(source_path).name

    safe_id = _safe_media_identifier(event_id)
    device_id = _safe_media_identifier(event.get("device_id") or "nocturpod-edge-01")
    stem = f"{safe_id}_{variant.lower()}_browser"
    local_output = MEDIA_DIR / f"{stem}.mp4"
    storage_path = f"playback/videos/{device_id}/{stem}.mp4"
    asset_variant = "STREAM_ORIGINAL" if variant == "ORIGINAL" else "STREAM_ENHANCED"
    filename = local_output.name

    with _browser_playback_lock(f"{event_id}:{variant}"):
        # Another request/process may have created the asset while we waited.
        event = get_event(event_id) or event
        existing_stream_path = event.get(stream_path_key)
        existing_stream_url = event.get(stream_url_key)
        if existing_stream_path and existing_stream_url:
            filename = Path(existing_stream_path).name
            if existing_stream_url.startswith(("https://", "http://")):
                return existing_stream_url, None, filename
            local_existing = MEDIA_DIR / filename
            if local_existing.is_file():
                return None, local_existing, filename
            return existing_stream_url, None, filename

        temp_input: Path | None = None
        try:
            if not local_output.is_file() or local_output.stat().st_size == 0:
                local_source = MEDIA_DIR / Path(source_path).name
                if local_source.is_file():
                    input_path = local_source
                elif source_url.startswith(("https://", "http://")):
                    extension = Path(source_path).suffix.lower()
                    if extension not in (".mp4", ".mov", ".mkv", ".avi", ".m4v"):
                        extension = ".mp4"
                    with tempfile.NamedTemporaryFile(
                        prefix=f"{safe_id}_{variant.lower()}_source_",
                        suffix=extension,
                        dir=str(MEDIA_DIR),
                        delete=False,
                    ) as temp:
                        temp_input = Path(temp.name)
                        with urllib.request.urlopen(source_url, timeout=60) as response:
                            shutil.copyfileobj(response, temp)
                    input_path = temp_input
                else:
                    # Supabase credentials are absent and this process has no local
                    # copy of a historical object, so it cannot transcode that object.
                    return None, None, "Source is not reachable from this backend"

                _transcode_browser_mp4(input_path, local_output)

            uploaded = upload_to_supabase_storage(
                local_output, storage_path, content_type="video/mp4"
            )
            if has_supabase_config() and not uploaded:
                log_system_event(
                    "ERROR", "VIDEO_PLAYBACK",
                    f"Could not upload browser-compatible playback copy for {event_id} ({variant})"
                )
                return None, local_output, filename

            record_media_asset({
                "id": f"med_{safe_id}_{asset_variant.lower()}",
                "event_id": event_id,
                "device_id": event.get("device_id") or "nocturpod-edge-01",
                "media_type": "VIDEO",
                "variant": asset_variant,
                "filename": filename,
                "storage_path": storage_path,
                "file_size_bytes": local_output.stat().st_size,
                "resolution": "Browser-compatible H.264 MP4",
                "duration": event.get("duration") or "0s",
                "processing_status": "COMPLETE",
            })
            log_system_event(
                "INFO", "VIDEO_PLAYBACK",
                f"Created browser-compatible {variant.lower()} playback copy for {event_id}"
            )

            playback_url = get_signed_storage_url(storage_path)
            if playback_url and playback_url.startswith(("https://", "http://")):
                return playback_url, None, filename
            # Local-only mode uses Flask's Range-capable send_file path directly.
            return None, local_output, filename
        except Exception as exc:
            log_system_event(
                "ERROR", "VIDEO_PLAYBACK",
                f"Could not prepare H.264 playback for {event_id} ({variant}): {type(exc).__name__}: {exc}"
            )
            return None, None, f"Could not prepare browser-playable video: {type(exc).__name__}: {exc}"
        finally:
            if temp_input is not None:
                try:
                    temp_input.unlink(missing_ok=True)
                except Exception:
                    pass


@app.get("/api/media/stream/<event_id>/<variant>")
def stream_event_video(event_id: str, variant: str):
    """Stream ORIGINAL or ENHANCED clips in a browser-compatible format.

    The exact stored original/enhanced object is preserved. Older mp4v recordings get
    a separate H.264 playback copy with byte-range support; new enhanced videos are
    served directly once their H.264 compatibility is recorded.
    """
    url, local_path, filename_or_error = _ensure_browser_video_asset(event_id, variant)
    if url:
        # Redirect to Supabase so range requests and seeking are handled by Storage/CDN.
        return redirect(url, code=302)
    if local_path and local_path.is_file():
        return send_file(
            local_path,
            mimetype="video/mp4",
            as_attachment=False,
            download_name=filename_or_error or local_path.name,
            conditional=True,
            max_age=3600,
        )
    status = 404 if filename_or_error in ("Recording not found", "Unsupported video variant") else 502
    return jsonify({"error": filename_or_error or "Video playback unavailable"}), status


@app.get("/api/media/download/<event_id>/<variant>")
def download_event_media(event_id: str, variant: str):
    """Force a named attachment download for the exact ORIGINAL or ENHANCED stored asset."""
    variant = variant.upper()
    if variant not in ("ORIGINAL", "ENHANCED"):
        return jsonify({"error": "Unsupported media variant"}), 400

    event = get_event(event_id)
    if not event:
        return jsonify({"error": "Recording not found"}), 404
    path_key = "original_storage_path" if variant == "ORIGINAL" else "enhanced_storage_path"
    url_key = "original_url" if variant == "ORIGINAL" else "enhanced_url"
    storage_path = event.get(path_key)
    media_url = event.get(url_key)
    if not storage_path or not media_url:
        return jsonify({"error": f"{variant.title()} video is not available"}), 404

    source_filename = Path(storage_path).name or f"{event_id}.mp4"
    safe_event = _safe_media_identifier(event_id) or "nocturpod-video"
    download_name = f"nocturpod-{safe_event}-{variant.lower()}{Path(source_filename).suffix or '.mp4'}"

    if media_url.startswith(("https://", "http://")):
        # Supabase Storage supports a download query parameter on signed object URLs.
        # This ensures cross-origin links return Content-Disposition: attachment instead
        # of depending on the HTML 'download' attribute, which browsers may ignore.
        parsed = urllib.parse.urlsplit(media_url)
        query = urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)
        query = [(key, value) for key, value in query if key.lower() != "download"]
        query.append(("download", download_name))
        download_url = urllib.parse.urlunsplit((
            parsed.scheme, parsed.netloc, parsed.path,
            urllib.parse.urlencode(query), parsed.fragment
        ))
        return redirect(download_url, code=302)

    local_path = MEDIA_DIR / source_filename
    if local_path.is_file():
        return send_file(
            local_path,
            mimetype="video/mp4",
            as_attachment=True,
            download_name=download_name,
            conditional=True,
        )
    return redirect(media_url, code=302)


@app.get("/api/media/file/<path:filepath>")
def serve_local_media_fallback(filepath: str):
    """Resolve legacy relative media URLs through Supabase before using local storage.

    Older API responses can contain /api/media/file/<storage_path> when signing a
    Supabase URL temporarily failed. Re-sign on demand so media survives Railway
    restarts even when the backend's ephemeral local copy is no longer available.
    """
    if not filepath or "\\" in filepath:
        return jsonify({"error": "Invalid media path"}), 400

    path_parts = filepath.split("/")
    if any(part in ("", ".", "..") for part in path_parts):
        return jsonify({"error": "Invalid media path"}), 400

    allowed_prefixes = (
        "original/images/",
        "original/videos/",
        "enhanced/images/",
        "enhanced/videos/",
        "playback/videos/",
    )
    if not filepath.startswith(allowed_prefixes):
        return jsonify({"error": "Unsupported media path"}), 404

    # A successful result is a freshly signed Supabase URL. Redirecting the client
    # keeps image/video delivery out of the Flask worker and supports byte-range
    # requests directly against Supabase Storage.
    signed_url = get_signed_storage_url(filepath)
    if signed_url and signed_url.startswith(("https://", "http://")):
        return redirect(signed_url, code=302)

    # Preserve the local fallback for development or a file uploaded in this
    # running instance. Never assume Railway's local disk contains older assets.
    filename = Path(filepath).name
    local_path = MEDIA_DIR / filename
    if local_path.is_file():
        return send_from_directory(str(MEDIA_DIR), filename)

    return jsonify({
        "error": "Media is not available from Supabase and no local copy exists",
        "storage_path": filepath,
    }), 404


@app.get("/api/ai/status")
def ai_status():
    sr_status = get_super_resolution_status()
    return jsonify({
        "status": "ONLINE",
        "enhancement_pipeline": "Real-ESRGAN general x4v3 ONNX — learned restoration and 4K super-resolution",
        "detection_engine": "YOLOv8n Perimeter Security",
        "super_resolution": sr_status,
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
