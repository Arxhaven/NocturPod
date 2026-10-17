"""NocturPod Production Backend API Server
Provides real OV5647 stream ingestion and relay, device heartbeat and telemetry tracking,
command queueing/polling, asynchronous AI low-light enhancement processing, and
Supabase PostgreSQL / Storage persistence.
"""
from __future__ import annotations

import concurrent.futures
import datetime
import hashlib
import mimetypes
import os
import shutil
import time
import tempfile
import urllib.request
from pathlib import Path
from typing import Any, Generator

import cv2
import numpy as np
from flask import Flask, Response, jsonify, redirect, request, send_from_directory
from flask_cors import CORS

from backend.ai_engine import ENGINE, enhance_image, enhance_video
from backend.database import (
    ack_command,
    check_device_timeouts,
    create_event,
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


@app.post("/api/device/light/mode")
def set_light_mode_endpoint():
    data = request.get_json(silent=True) or {}
    raw_mode = (data.get("mode") or "").strip().upper()
    if raw_mode not in ("WHITE", "NIGHT"):
        if raw_mode in ("NORMAL", "WHITE_LIGHT", "DAY"):
            raw_mode = "WHITE"
        elif raw_mode in ("LOW_LIGHT", "IR", "NIGHT_MODE", "DARK"):
            raw_mode = "NIGHT"
        else:
            return jsonify({"success": False, "error": f"Invalid mode '{raw_mode}'. Must be WHITE or NIGHT."}), 400

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

            # Object detection on enhanced image (safely isolated)
            img_bgr = cv2.imread(str(enhanced_local_path))
            if img_bgr is not None:
                try:
                    det_res = ENGINE.infer(img_bgr)
                    for d in det_res.get("detections", []):
                        record_detection(event_id, d["label"], d["confidence"], d["x1"], d["y1"], d["x2"], d["y2"])
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
def _reprocess_existing_media_worker(
    event_id: str,
    device_id: str,
    original_url: str,
    media_type: str,
    extension: str,
) -> None:
    """Download a persisted ORIGINAL object and run the same enhancement pipeline."""
    local_original: Path | None = None
    try:
        safe_event_id = "".join(ch for ch in event_id if ch.isalnum() or ch in ("-", "_"))
        suffix = extension if extension and len(extension) <= 8 else (".mp4" if media_type == "VIDEO" else ".jpg")
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
            update_event_status(event_id, status="ENHANCEMENT_FAILED", ai_status="FAILED",
                                notes=f"Legacy enhancement backfill failed: {type(exc).__name__}")
        except Exception:
            pass
    finally:
        if local_original:
            try:
                local_original.unlink(missing_ok=True)
            except Exception:
                pass


@app.post("/api/media/reprocess-missing")
def reprocess_missing_media():
    """Queue old events with an ORIGINAL asset but no ENHANCED asset.

    Requires the same device token as the edge agent. This is an explicit one-time
    backfill endpoint; it never deletes or overwrites original media.
    """
    if not verify_device_auth():
        return jsonify({"error": "Unauthorized device"}), 401

    try:
        # A single pass covers up to the newest 1000 events. Call again after a
        # pass has completed if the project has more than 1000 historical events.
        events = list_events(limit=1000)
        queued = []
        skipped = []
        for event in events:
            event_id = event.get("event_id")
            if not event_id or event.get("type") not in ("MANUAL_CAPTURE", "VIDEO_RECORDING"):
                continue
            original_url = event.get("original_url")
            enhanced_url = event.get("enhanced_url")
            if not original_url:
                skipped.append({"event_id": event_id, "reason": "original asset URL missing"})
                continue
            if enhanced_url:
                continue

            media_type = "VIDEO" if event.get("type") == "VIDEO_RECORDING" else "IMAGE"
            parsed_path = original_url.split("?", 1)[0].rstrip("/")
            extension = Path(parsed_path).suffix.lower()
            if extension not in (".jpg", ".jpeg", ".png", ".webp", ".mp4", ".mov", ".mkv", ".avi"):
                extension = ".mp4" if media_type == "VIDEO" else ".jpg"
            if original_url.startswith("/"):
                original_url = request.host_url.rstrip("/") + original_url

            ENHANCE_EXECUTOR.submit(
                _reprocess_existing_media_worker,
                event_id,
                event.get("device_id") or "nocturpod-edge-01",
                original_url,
                media_type,
                extension,
            )
            queued.append(event_id)

        log_system_event(
            "INFO", "AI_BACKFILL",
            f"Queued {len(queued)} legacy media enhancement job(s); skipped {len(skipped)} missing original(s)"
        )
        return jsonify({
            "status": "QUEUED",
            "queued_count": len(queued),
            "queued_event_ids": queued,
            "skipped_count": len(skipped),
            "skipped": skipped,
            "note": "Originals are preserved. Wait for jobs to finish, then refresh the dashboard."
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
    captures = list_media_events("IMAGE")
    return jsonify(captures)


@app.get("/api/media/footage")
def get_footage():
    recordings = list_media_events("VIDEO")
    return jsonify(recordings)


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
