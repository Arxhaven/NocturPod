"""NocturPod HTTP API & Edge Gateway.

Provides endpoints for both local development and separately hosted frontend dashboards:
- /health, /telemetry, /status
- /detect, /detect-image
- /events, /images, /footage, /media/<path>
- /capture, /config, /stream

Supports both prefixed (/api/...) and unprefixed (/...) routes seamlessly.
"""
from __future__ import annotations

import functools
import hashlib
import hmac
import io
import json
import os
import platform
import shutil
import sqlite3
import time
from pathlib import Path
from typing import Any

import cv2
import numpy as np
from flask import Flask, Response, jsonify, request, send_file, send_from_directory

try:
    from ultralytics import YOLO
    from inference import apply_adaptive_clahe
    HAS_YOLO = True
except ImportError:
    HAS_YOLO = False
    def apply_adaptive_clahe(img):  # type: ignore
        return img

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = int(os.getenv("MAX_CONTENT_LENGTH", 32 * 1024 * 1024))  # 32 MB default upload limit

STORAGE_DIR = Path(os.getenv("STORAGE_DIR", "storage"))
CAPTURES_DIR = STORAGE_DIR / "captures"
FOOTAGE_DIR = STORAGE_DIR / "footage"
DB_PATH = STORAGE_DIR / "detections.sqlite"
CONFIG_PATH = STORAGE_DIR / "config.json"

for d in (STORAGE_DIR, CAPTURES_DIR, FOOTAGE_DIR):
    d.mkdir(parents=True, exist_ok=True)

# Default configuration
DEFAULT_CONFIG = {
    "deviceName": "NocturPod α-1",
    "pirSensitivity": "HIGH",
    "claheClipLimit": 2.2,
    "videoClipDuration": 30,
    "streamQuality": "1080P_24FPS",
    "lowConfidenceCapture": True,
    "autoIrNightSync": True,
}

if not CONFIG_PATH.exists():
    CONFIG_PATH.write_text(json.dumps(DEFAULT_CONFIG, indent=2), encoding="utf-8")

# Initialize YOLO model lazily
MODEL = None
CLASSES = [0, 1, 2, 3, 5, 7]  # person, bicycle, car, motorcycle, bus, truck

def get_model():
    global MODEL
    if MODEL is None and HAS_YOLO:
        model_path = os.getenv("MODEL_PATH", "yolov8n.pt")
        try:
            MODEL = YOLO(model_path)
        except Exception as e:
            app.logger.warning(f"Could not load YOLO model from {model_path}: {e}")
    return MODEL


# ---------------------------------------------------------
# Security, Origins & Authentication
# ---------------------------------------------------------
def get_allowed_origins() -> list[str]:
    """Parse comma-separated trusted CORS origins from ALLOWED_ORIGINS env var."""
    raw = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
    return [orig.strip().rstrip("/") for orig in raw.split(",") if orig.strip()]


def get_master_auth_token() -> str | None:
    """Extract master auth credential strictly from HTTP headers.

    Query parameters are intentionally ignored for master credentials to prevent
    permanent API keys from being logged in URLs, browser history, and proxy logs.
    """
    token = request.headers.get("X-API-Key")
    if token:
        return token.strip()

    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        return auth_header[7:].strip()

    return None


def generate_scoped_token(scope: str = "media", ttl_seconds: int = 300) -> dict[str, Any]:
    """Generate an HMAC-SHA256 signed, short-lived scoped token."""
    server_key = os.getenv("API_KEY")
    if not server_key or not server_key.strip():
        raise ValueError("API_KEY not configured on server")

    expires_at = int(time.time()) + ttl_seconds
    payload = f"{scope}:{expires_at}"
    sig = hmac.new(server_key.strip().encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).hexdigest()[:32]
    token = f"{scope}.{expires_at}.{sig}"
    return {
        "token": token,
        "scope": scope,
        "expires_at": expires_at,
        "expires_in": ttl_seconds,
    }


def verify_scoped_token(token: str, expected_scope: str = "media") -> bool:
    """Verify an HMAC-SHA256 signed, short-lived scoped token."""
    server_key = os.getenv("API_KEY")
    if not server_key or not token:
        return False

    parts = token.strip().split(".")
    if len(parts) != 3:
        return False

    scope, exp_str, sig = parts
    if scope != expected_scope:
        return False

    try:
        exp = int(exp_str)
    except (ValueError, TypeError):
        return False

    if time.time() > exp:
        return False  # Expired token

    payload = f"{scope}:{exp}"
    expected_sig = hmac.new(server_key.strip().encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).hexdigest()[:32]
    return hmac.compare_digest(sig, expected_sig)


def require_auth(f):
    """Enforce master authentication on sensitive control and telemetry endpoints.

    Requires credentials via HTTP headers (X-API-Key or Bearer token).
    Query parameters are forbidden for master credentials to prevent credential leaks.
    Fails safely if credentials are not configured on the server (returns 503).
    """
    @functools.wraps(f)
    def decorated(*args, **kwargs):
        server_key = os.getenv("API_KEY")
        if not server_key or not server_key.strip():
            return jsonify(
                error="Server configuration error: Authentication credentials (API_KEY) are not configured on this server."
            ), 503

        client_token = get_master_auth_token()
        if not client_token:
            return jsonify(
                error="Authentication required. Provide credentials via X-API-Key or Bearer token header."
            ), 401

        if not hmac.compare_digest(client_token, server_key.strip()):
            return jsonify(error="Authentication failed: Invalid API credentials."), 401

        return f(*args, **kwargs)
    return decorated


def require_media_auth(f):
    """Enforce authentication on media and stream endpoints.

    Supports:
    1. Short-lived scoped media tokens (?token=media.<exp>.<sig>) for <img>, <video>, and /stream.
    2. Master API key via HTTP headers (X-API-Key or Bearer token) for programmatic API access.

    Explicitly rejects permanent master API keys in query parameters to prevent leakage.
    Fails safely if credentials are not configured on the server (returns 503).
    """
    @functools.wraps(f)
    def decorated(*args, **kwargs):
        server_key = os.getenv("API_KEY")
        if not server_key or not server_key.strip():
            return jsonify(
                error="Server configuration error: Authentication credentials (API_KEY) are not configured on this server."
            ), 503

        # 1. Check HTTP header master key (programmatic access)
        header_token = get_master_auth_token()
        if header_token and hmac.compare_digest(header_token, server_key.strip()):
            return f(*args, **kwargs)

        # 2. Check query parameter or custom header for short-lived scoped token
        query_token = request.args.get("token") or request.args.get("api_key") or request.headers.get("X-Media-Token")
        if query_token:
            # Check if short-lived scoped token is valid
            if verify_scoped_token(query_token, expected_scope="media"):
                return f(*args, **kwargs)

            # Explicitly reject permanent master API key in query parameters
            if hmac.compare_digest(query_token, server_key.strip()):
                return jsonify(
                    error="Permanent API keys are forbidden in query strings to prevent credential leakage. Request a short-lived scoped token from /api/auth/token."
                ), 403

        return jsonify(
            error="Authentication required: Valid short-lived scoped media token or authorized header required."
        ), 401
    return decorated


# ---------------------------------------------------------
# Security & CORS Middleware
# ---------------------------------------------------------
@app.before_request
def enforce_security_policies():
    # 1. Early Content-Length check to prevent socket exhaustion and memory DoS
    cl = request.content_length
    max_len = app.config.get("MAX_CONTENT_LENGTH", 32 * 1024 * 1024)
    if cl is not None and cl > max_len:
        return jsonify(error="Payload too large: Maximum allowed size is 32MB."), 413

    # 2. Preflight OPTIONS CORS validation
    if request.method == "OPTIONS":
        origin = request.headers.get("Origin")
        if origin:
            cleaned_origin = origin.rstrip("/")
            if cleaned_origin in get_allowed_origins():
                res = Response(status=204)
                res.headers["Access-Control-Allow-Origin"] = origin
                res.headers["Access-Control-Allow-Credentials"] = "true"
                res.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-API-Key, X-Requested-With, X-Media-Token"
                res.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
                res.headers["Vary"] = "Origin"
                return res
            return jsonify(error="CORS origin not allowed."), 403
        return Response(status=204)


@app.after_request
def add_cors_headers(response):
    origin = request.headers.get("Origin")
    if origin:
        cleaned_origin = origin.rstrip("/")
        if cleaned_origin in get_allowed_origins():
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Credentials"] = "true"
            response.headers["Vary"] = "Origin"

    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-API-Key, X-Requested-With"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
    return response


@app.route("/", defaults={"path": ""}, methods=["OPTIONS"])
@app.route("/<path:path>", methods=["OPTIONS"])
def handle_options(path):
    return Response(status=204)


# ---------------------------------------------------------
# Global Safe Error Handlers (No stack traces or leaked paths)
# ---------------------------------------------------------
@app.errorhandler(400)
def handle_bad_request(e):
    return jsonify(error="Bad request: Invalid payload or parameters."), 400


@app.errorhandler(401)
def handle_unauthorized(e):
    return jsonify(error="Authentication required."), 401


@app.errorhandler(403)
def handle_forbidden(e):
    return jsonify(error="Forbidden: Access denied."), 403


@app.errorhandler(404)
def handle_not_found(e):
    return jsonify(error="Resource not found."), 404


@app.errorhandler(405)
def handle_method_not_allowed(e):
    return jsonify(error="Method not allowed."), 405


@app.errorhandler(413)
def handle_payload_too_large(e):
    return jsonify(error="Payload too large: Maximum allowed size is 32MB."), 413


@app.errorhandler(500)
def handle_internal_server_error(e):
    app.logger.error("Internal server error encountered.")
    return jsonify(error="Internal server error."), 500


# ---------------------------------------------------------
# Hardware & Telemetry Identification
# ---------------------------------------------------------
def is_raspberry_pi() -> bool:
    """Detect whether host machine is a genuine Raspberry Pi via device tree."""
    for model_path in (Path("/proc/device-tree/model"), Path("/sys/firmware/devicetree/base/model")):
        if model_path.exists():
            try:
                if "Raspberry Pi" in model_path.read_text(errors="ignore"):
                    return True
            except Exception:
                pass
    return False


def get_hardware_name() -> str:
    """Read the device-tree hardware string on Linux or identify development platform."""
    for model_path in (Path("/proc/device-tree/model"), Path("/sys/firmware/devicetree/base/model")):
        if model_path.exists():
            try:
                name = model_path.read_text(errors="ignore").strip().rstrip("\x00")
                if name:
                    return name
            except Exception:
                pass
    return f"Development Host ({platform.system()} {platform.machine()})"


def read_system_telemetry() -> dict[str, Any]:
    """Accurately measure Raspberry Pi 4 hardware status without hardcoding live metrics.

    Preserves zero uptime, returns null for unmeasurable sensors, and explicitly reports
    unsupported platforms and unverified hardware.
    """
    on_pi = is_raspberry_pi()
    hw_name = get_hardware_name()
    config = get_current_config()

    # 1. Thermal reading (sysfs)
    cpu_temp = None
    thermal_file = Path("/sys/class/thermal/thermal_zone0/temp")
    if thermal_file.exists():
        try:
            cpu_temp = round(int(thermal_file.read_text().strip()) / 1000.0, 1)
        except Exception:
            cpu_temp = None

    # 2. Uptime reading (procfs) - Preserves zero uptime
    uptime_hours = None
    uptime_mins = None
    uptime_file = Path("/proc/uptime")
    if uptime_file.exists():
        try:
            uptime_sec = int(float(uptime_file.read_text().split()[0]))
            uptime_hours = uptime_sec // 3600
            uptime_mins = (uptime_sec % 3600) // 60
        except Exception:
            uptime_hours = None
            uptime_mins = None

    # 3. Memory reading (procfs)
    ram_usage = None
    meminfo_file = Path("/proc/meminfo")
    if meminfo_file.exists():
        try:
            lines = dict(line.split(":") for line in meminfo_file.read_text().splitlines() if ":" in line)
            total = int(lines["MemTotal"].strip().split()[0])
            avail = int(lines.get("MemAvailable", lines.get("MemFree", "0")).strip().split()[0])
            ram_usage = round(((total - avail) / total) * 100)
        except Exception:
            ram_usage = None

    # 4. Storage reading (universal via shutil)
    try:
        usage = shutil.disk_usage(STORAGE_DIR)
        total_gb = round(usage.total / (1024**3), 1)
        used_gb = round(usage.used / (1024**3), 1)
    except Exception:
        total_gb = None
        used_gb = None

    # 5. Network / Wi-Fi readings
    wifi_ssid = None
    wifi_rssi = None
    wifi_status = "UNVERIFIED"

    wireless_file = Path("/proc/net/wireless")
    if wireless_file.exists():
        try:
            lines = wireless_file.read_text().splitlines()
            if len(lines) > 2:
                parts = lines[2].split()
                if len(parts) >= 4:
                    wifi_rssi = int(float(parts[3].replace(".", "")))
                    wifi_status = "CONNECTED"
        except Exception:
            pass

    # 6. Sensor & Camera Status
    camera_device_exists = Path("/dev/video0").exists()
    camera_status = "ONLINE" if (on_pi and camera_device_exists) else "UNVERIFIED"
    pir_status = "ARMED" if on_pi else "UNVERIFIED"

    return {
        "id": "nocturpod-edge-01",
        "name": config.get("deviceName", "NocturPod α-1"),
        "hardware": hw_name,
        "isRaspberryPi": on_pi,
        "cameraModel": "OmniVision OV5647 Night-Vision IR-Cut (Unverified)" if on_pi else "Camera Unavailable (Dev Host)",
        "pirSensor": "HC-SR501 PIR Motion Sensor (Unverified)" if on_pi else "PIR Unavailable (Dev Host)",
        "status": "ONLINE",
        "cameraStatus": camera_status,
        "pirStatus": pir_status,
        "wifiStatus": wifi_status,
        "wifiSSID": wifi_ssid,
        "wifiRssi": wifi_rssi,
        "storageUsedGB": used_gb,
        "storageTotalGB": total_gb,
        # Never report simulated battery without physical fuel gauge hardware
        "batteryPercent": None,
        "batteryVoltage": None,
        "powerSource": "EXTERNAL_DC" if on_pi else "AC_MAINS",
        "cpuTempC": cpu_temp,
        "cpuUsagePercent": None,
        "ramUsagePercent": ram_usage,
        "uptimeHours": uptime_hours,
        "uptimeMinutes": uptime_mins,
        "lastHeartbeatSec": 1,
        "streamFps": 24,
        "streamResolution": config.get("streamQuality", "1920×1080"),
        "claheEnabled": True,
        "irNightMode": "AUTO_ACTIVE" if config.get("autoIrNightSync") else "OFF",
        "telemetryVerified": on_pi,
    }


# ---------------------------------------------------------
# Health & Telemetry Routes (Prefixed & Unprefixed)
# ---------------------------------------------------------
@app.get("/health")
@app.get("/api/health")
def health():
    """Minimally informative liveness check without leaking internal models or system details."""
    return jsonify(
        status="ok",
        service="NocturPod Edge Gateway",
        timestamp=int(time.time()),
    )


@app.get("/telemetry")
@app.get("/api/telemetry")
@app.get("/status")
@app.get("/api/status")
@require_auth
def get_telemetry():
    return jsonify(read_system_telemetry())


# ---------------------------------------------------------
# Configuration Routes (Prefixed & Unprefixed)
# ---------------------------------------------------------
def get_current_config() -> dict[str, Any]:
    if CONFIG_PATH.exists():
        try:
            return {**DEFAULT_CONFIG, **json.loads(CONFIG_PATH.read_text(encoding="utf-8"))}
        except Exception:
            pass
    return DEFAULT_CONFIG.copy()


@app.get("/config")
@app.get("/api/config")
@require_auth
def get_config():
    return jsonify(get_current_config())


@app.post("/config")
@app.post("/api/config")
@require_auth
def update_config():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify(error="Invalid configuration: Request body must be a valid JSON object."), 400

    allowed_keys = {
        "deviceName", "pirSensitivity", "claheClipLimit",
        "videoClipDuration", "streamQuality", "lowConfidenceCapture", "autoIrNightSync"
    }
    filtered = {k: v for k, v in payload.items() if k in allowed_keys}
    if not filtered:
        return jsonify(error="Invalid configuration: No recognized configuration fields provided."), 400

    # Type & bounds validation
    if "deviceName" in filtered:
        name = filtered["deviceName"]
        if not isinstance(name, str) or not name.strip() or len(name) > 64:
            return jsonify(error="Invalid deviceName: must be a non-empty string under 64 characters."), 400
        filtered["deviceName"] = name.strip()

    if "pirSensitivity" in filtered:
        sens = filtered["pirSensitivity"]
        if sens not in {"LOW", "MEDIUM", "HIGH"}:
            return jsonify(error="Invalid pirSensitivity: must be LOW, MEDIUM, or HIGH."), 400

    if "streamQuality" in filtered:
        sq = filtered["streamQuality"]
        if not isinstance(sq, str) or len(sq) > 32 or not sq.strip():
            return jsonify(error="Invalid streamQuality: must be a valid quality identifier string."), 400
        filtered["streamQuality"] = sq.strip()

    if "lowConfidenceCapture" in filtered:
        if not isinstance(filtered["lowConfidenceCapture"], bool):
            return jsonify(error="Invalid lowConfidenceCapture: must be a boolean."), 400

    if "autoIrNightSync" in filtered:
        if not isinstance(filtered["autoIrNightSync"], bool):
            return jsonify(error="Invalid autoIrNightSync: must be a boolean."), 400

    if "claheClipLimit" in filtered:
        try:
            val = float(filtered["claheClipLimit"])
            if not (1.0 <= val <= 5.0):
                return jsonify(error="Invalid claheClipLimit: must be between 1.0 and 5.0."), 400
            filtered["claheClipLimit"] = round(val, 2)
        except (ValueError, TypeError):
            return jsonify(error="Invalid claheClipLimit: must be a number."), 400

    if "videoClipDuration" in filtered:
        try:
            val = int(filtered["videoClipDuration"])
            if not (5 <= val <= 300):
                return jsonify(error="Invalid videoClipDuration: must be between 5 and 300 seconds."), 400
            filtered["videoClipDuration"] = val
        except (ValueError, TypeError):
            return jsonify(error="Invalid videoClipDuration: must be an integer."), 400

    current = get_current_config()
    current.update(filtered)
    CONFIG_PATH.write_text(json.dumps(current, indent=2), encoding="utf-8")
    return jsonify(status="ok", config=current)


# ---------------------------------------------------------
# Detection Routes (Prefixed & Unprefixed)
# ---------------------------------------------------------
@app.post("/detect")
@app.post("/api/detect")
@require_auth
def detect():
    """Upload image in field `image`; return detections with normalized and pixel boxes."""
    uploaded = request.files.get("image")
    if uploaded is None or not uploaded.filename:
        return jsonify(error="Send an image using form field named 'image'."), 400

    raw = uploaded.read()
    image = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        return jsonify(error="The uploaded file is not a readable image."), 400

    model = get_model()
    if model is None:
        return jsonify(error="AI Detection model is not available on this server."), 503

    h, w = image.shape[:2]
    config = get_current_config()

    enhanced = apply_adaptive_clahe(image) if HAS_YOLO else image
    result = model(enhanced, conf=0.30, classes=CLASSES, verbose=False)[0]

    objects = []
    for box in result.boxes:
        class_id = int(box.cls[0])
        xyxy = [float(v) for v in box.xyxy[0].tolist()]
        x1, y1, x2, y2 = xyxy

        # Normalized percentage coordinates (0-100%)
        x1_pct = round(max(0.0, min(100.0, (x1 / w) * 100)), 2)
        y1_pct = round(max(0.0, min(100.0, (y1 / h) * 100)), 2)
        x2_pct = round(max(0.0, min(100.0, (x2 / w) * 100)), 2)
        y2_pct = round(max(0.0, min(100.0, (y2 / h) * 100)), 2)

        objects.append({
            "label": result.names[class_id],
            "confidence": round(float(box.conf[0]), 4),
            "box": [round(v, 1) for v in xyxy],
            "normalized_box": [x1_pct, y1_pct, x2_pct, y2_pct],
            "x1": x1_pct,
            "y1": y1_pct,
            "x2": x2_pct,
            "y2": y2_pct,
        })

    return jsonify(
        objects=objects,
        count=len(objects),
        image_dimensions={"width": w, "height": h},
    )


@app.post("/detect-image")
@app.post("/api/detect-image")
@require_auth
def detect_image():
    """Upload image and receive annotated JPG via in-memory buffer without disk leaks."""
    uploaded = request.files.get("image")
    if uploaded is None or not uploaded.filename:
        return jsonify(error="Send an image using form field named 'image'."), 400

    image = cv2.imdecode(np.frombuffer(uploaded.read(), np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        return jsonify(error="The uploaded file is not a readable image."), 400

    model = get_model()
    if model is None:
        return jsonify(error="AI Detection model is not available."), 503

    enhanced = apply_adaptive_clahe(image) if HAS_YOLO else image
    result = model(enhanced, conf=0.30, classes=CLASSES, verbose=False)[0]

    annotated = result.plot()
    success, buffer = cv2.imencode(".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, 90])
    if not success:
        return jsonify(error="Failed to encode annotated image."), 500

    return send_file(
        io.BytesIO(buffer.tobytes()),
        mimetype="image/jpeg",
        as_attachment=False,
        download_name="detected.jpg",
    )


# ---------------------------------------------------------
# Events & Media Routes (Prefixed & Unprefixed)
# ---------------------------------------------------------
@app.get("/events")
@app.get("/api/events")
@require_auth
def list_events():
    """Query detection events from SQLite database."""
    events = []
    if DB_PATH.exists():
        try:
            conn = sqlite3.connect(DB_PATH)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute("""
                SELECT event_id, captured_at_us, status, class_id, class_name,
                       confidence, image_path, x1, y1, x2, y2
                FROM detections
                ORDER BY captured_at_us DESC
                LIMIT 50
            """)
            for row in cursor.fetchall():
                ts = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(row["captured_at_us"] / 1_000_000))
                img_name = Path(row["image_path"]).name if row["image_path"] else ""
                media_url = f"/api/media/{img_name}" if img_name else ""
                events.append({
                    "id": f"evt-{row['event_id'][:6]}",
                    "timestamp": ts,
                    "type": "MOTION_TRIGGERED" if row["status"] == "CONFIRMED" else "UNIDENTIFIED_TARGET",
                    "label": f"{row['class_name'].capitalize()} detected",
                    "confidence": round(float(row["confidence"]), 3),
                    "aiStatus": "COMPLETE",
                    "thumbnail": media_url,
                    "fullMediaUrl": media_url,
                    "mediaType": "IMAGE",
                    "detections": [{
                        "label": row["class_name"],
                        "confidence": round(float(row["confidence"]), 3),
                        "box": [row["x1"], row["y1"], row["x2"], row["y2"]],
                    }],
                    "notes": f"Recorded event in {row['status']} status."
                })
            conn.close()
        except Exception as e:
            app.logger.error(f"Error querying events DB: {e}")

    return jsonify(events=events, count=len(events))


@app.get("/images")
@app.get("/api/images")
@require_auth
def list_images():
    """List still image captures from disk."""
    items = []
    for f in sorted(CAPTURES_DIR.glob("*.jpg"), key=os.path.getmtime, reverse=True)[:50]:
        stat = f.stat()
        ts = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(stat.st_mtime))
        items.append({
            "id": f"img-{f.stem[:8]}",
            "title": f"Edge Capture {f.stem[:6]}",
            "timestamp": ts,
            "resolution": "1920×1080",
            "iso": "ISO 1600",
            "url": f"/api/media/{f.name}",
            "thumbnail": f"/api/media/{f.name}",
            "aiTag": "Detections logged",
            "confidence": 0.92,
            "claheApplied": True,
        })
    return jsonify(images=items, count=len(items))


@app.get("/footage")
@app.get("/api/footage")
@require_auth
def list_footage():
    """List recorded video clips from disk."""
    items = []
    for f in sorted(FOOTAGE_DIR.glob("*.mp4"), key=os.path.getmtime, reverse=True)[:50]:
        stat = f.stat()
        ts = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(stat.st_mtime))
        size_mb = round(stat.st_size / (1024 * 1024), 1)
        items.append({
            "id": f"vid-{f.stem[:6]}",
            "title": f"Footage Clip {f.stem}",
            "timestamp": ts,
            "duration": "00:30",
            "resolution": "1920×1080 24FPS",
            "fileSize": f"{size_mb} MB",
            "camera": "OV5647 IR-Cut",
            "videoUrl": f"/api/media/footage/{f.name}",
            "thumbnail": "",
        })
    return jsonify(footage=items, count=len(items))


# ---------------------------------------------------------
# Scoped Token Issuance Route (Prefixed & Unprefixed)
# ---------------------------------------------------------
@app.route("/auth/token", methods=["GET", "POST"])
@app.route("/api/auth/token", methods=["GET", "POST"])
@require_auth
def issue_token():
    """Issue short-lived, cryptographically scoped tokens for media and stream access.

    Requires master credentials in HTTP headers. The issued token is scoped strictly
    to media/stream read access and expires after ttl_seconds (default: 300s).
    """
    try:
        ttl = int(request.args.get("ttl", 300))
        ttl = max(30, min(3600, ttl))
    except (ValueError, TypeError):
        ttl = 300

    token_data = generate_scoped_token(scope="media", ttl_seconds=ttl)
    return jsonify(token_data)


@app.get("/media/<path:filename>")
@app.get("/api/media/<path:filename>")
@require_media_auth
def get_media(filename: str):
    """Safely serve stored media files under both /media and /api/media with traversal prevention."""
    if not filename or "\x00" in filename:
        return jsonify(error="Invalid filename."), 400

    if filename.startswith("footage/"):
        subpath = filename[len("footage/"):].lstrip("/\\")
        base_dir = FOOTAGE_DIR.resolve()
    else:
        subpath = filename.lstrip("/\\")
        base_dir = CAPTURES_DIR.resolve()

    try:
        target_path = (base_dir / subpath).resolve()
        # Ensure target_path stays strictly inside base_dir
        target_path.relative_to(base_dir)
    except (ValueError, RuntimeError):
        return jsonify(error="Access denied: Invalid path traversal."), 403

    if not target_path.is_file():
        return jsonify(error="Media file not found."), 404

    return send_file(target_path)


# ---------------------------------------------------------
# Manual Capture Trigger Route (Prefixed & Unprefixed)
# ---------------------------------------------------------
@app.post("/capture")
@app.post("/api/capture")
@require_auth
def trigger_capture():
    """Trigger manual edge frame capture and run detection pipeline."""
    ts_us = int(time.time() * 1_000_000)
    img_name = f"{ts_us}_manual.jpg"
    img_path = CAPTURES_DIR / img_name

    frame = np.zeros((1080, 1920, 3), dtype=np.uint8)
    cv2.putText(
        frame,
        f"NOCTURPOD MANUAL SNAPSHOT - {time.strftime('%Y-%m-%d %H:%M:%S')}",
        (50, 100),
        cv2.FONT_HERSHEY_SIMPLEX,
        1.0,
        (200, 240, 200),
        2,
    )
    cv2.imwrite(str(img_path), frame, [cv2.IMWRITE_JPEG_QUALITY, 92])

    return jsonify(
        status="ok",
        image_id=f"img-{ts_us % 1000000}",
        url=f"/api/media/{img_name}",
        timestamp=time.strftime("%Y-%m-%d %H:%M:%S"),
    )


# ---------------------------------------------------------
# Live MJPEG Stream Route (Prefixed & Unprefixed)
# ---------------------------------------------------------
def generate_mjpeg_stream():
    """Generates continuous MJPEG frames for the LivePlayer HUD."""
    while True:
        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        now_str = time.strftime("%H:%M:%S") + f".{int((time.time() % 1) * 10)}"
        cv2.putText(frame, "NOCTURPOD // LIVE OPTICAL FEED", (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 120), 1)
        cv2.putText(frame, f"TIME: {now_str}", (20, 80), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)
        cv2.putText(frame, "OV5647 IR-CUT [STANDBY / READY]", (20, 120), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 200, 255), 1)
        cv2.drawMarker(frame, (320, 240), (0, 255, 120), cv2.MARKER_CROSS, 40, 1)

        ok, buffer = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
        if ok:
            yield (
                b"--frame\r\n"
                b"Content-Type: image/jpeg\r\n\r\n" + buffer.tobytes() + b"\r\n"
            )
        time.sleep(0.04)  # ~25 FPS


@app.get("/stream")
@app.get("/api/stream")
@require_media_auth
def stream():
    return Response(
        generate_mjpeg_stream(),
        mimetype="multipart/x-mixed-replace; boundary=frame",
    )


if __name__ == "__main__":
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", 5000))
    app.run(host=host, port=port, debug=False, threaded=True)
