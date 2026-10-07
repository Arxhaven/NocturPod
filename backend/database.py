"""NocturPod Production Database & Persistence Layer
Interacts with Supabase PostgreSQL and Supabase Storage via REST / PostgREST.
Falls back safely to local structured storage when offline or configuring credentials.
Strictly removes all simulated/fake hardware metrics, PIR sensors, and drone references.
"""
from __future__ import annotations

import datetime
import json
import os
import sqlite3
import threading
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
SUPABASE_STORAGE_BUCKET = os.getenv("SUPABASE_STORAGE_BUCKET", "nocturpod-media")

# Fallback local SQLite file path if Supabase is not yet configured
LOCAL_DB_PATH = Path("storage") / "nocturpod_local.db"
_LOCK = threading.RLock()
_EVENT_COUNTER = 0
_LAST_SECOND = ""


def has_supabase_config() -> bool:
    return bool(SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)


def generate_event_id() -> str:
    """Generates unique deterministic event ID: NP_YYYYMMDD_HHMMSS_###"""
    global _EVENT_COUNTER, _LAST_SECOND
    with _LOCK:
        now = datetime.datetime.now(datetime.timezone.utc)
        current_sec = now.strftime("%Y%m%d_%H%M%S")
        if current_sec == _LAST_SECOND:
            _EVENT_COUNTER += 1
        else:
            _LAST_SECOND = current_sec
            _EVENT_COUNTER = 1
        return f"NP_{current_sec}_{_EVENT_COUNTER:03d}"


# -----------------------------------------------------------------------------
# Supabase REST Helper
# -----------------------------------------------------------------------------
def _supabase_request(endpoint: str, method: str = "GET", data: dict | list | None = None, headers: dict | None = None) -> Any:
    if not has_supabase_config():
        return None

    url = f"{SUPABASE_URL}/rest/v1/{endpoint.lstrip('/')}"
    req_headers = {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation"
    }
    if headers:
        req_headers.update(headers)

    body = json.dumps(data).encode("utf-8") if data is not None else None
    req = urllib.request.Request(url, data=body, headers=req_headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=8.0) as resp:
            content = resp.read().decode("utf-8")
            return json.loads(content) if content else None
    except Exception as e:
        print(f"[Supabase] Request failed ({method} {url}): {e}")
        return None


def get_signed_storage_url(storage_path: str, expires_in: int = 7200) -> str:
    """Generates a secure signed URL from Supabase Storage for private media assets."""
    if not has_supabase_config():
        # Fallback to backend media route if not configured
        return f"/api/media/file/{storage_path}"

    url = f"{SUPABASE_URL}/storage/v1/object/sign/{SUPABASE_STORAGE_BUCKET}/{storage_path.lstrip('/')}"
    req_headers = {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json"
    }
    body = json.dumps({"expiresIn": expires_in}).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers=req_headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=6.0) as resp:
            res = json.loads(resp.read().decode("utf-8"))
            signed_path = res.get("signedURL")
            if signed_path:
                return f"{SUPABASE_URL}/storage/v1{signed_path}"
    except Exception as e:
        print(f"[Supabase Storage] Signed URL generation failed for {storage_path}: {e}")
    return f"/api/media/file/{storage_path}"


def upload_to_supabase_storage(local_path: Path | str, storage_path: str, content_type: str = "image/jpeg") -> bool:
    """Uploads file to the Supabase Storage bucket."""
    if not has_supabase_config():
        return False
    local_p = Path(local_path)
    if not local_p.exists():
        return False

    url = f"{SUPABASE_URL}/storage/v1/object/{SUPABASE_STORAGE_BUCKET}/{storage_path.lstrip('/')}"
    req_headers = {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": content_type,
        "x-upsert": "true"
    }
    try:
        with open(local_p, "rb") as f:
            data = f.read()
        req = urllib.request.Request(url, data=data, headers=req_headers, method="POST")
        with urllib.request.urlopen(req, timeout=25.0) as resp:
            return resp.status in (200, 201)
    except Exception as e:
        print(f"[Supabase Storage] Upload error ({storage_path}): {e}")
        return False


def delete_from_supabase_storage(storage_paths: list[str]) -> bool:
    """Deletes multiple files from the Supabase Storage bucket."""
    if not has_supabase_config() or not storage_paths:
        return False

    url = f"{SUPABASE_URL}/storage/v1/object/{SUPABASE_STORAGE_BUCKET}"
    req_headers = {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json"
    }
    body = json.dumps({"prefixes": [p.lstrip('/') for p in storage_paths if p]}).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers=req_headers, method="DELETE")
    try:
        with urllib.request.urlopen(req, timeout=15.0) as resp:
            return resp.status in (200, 204)
    except Exception as e:
        print(f"[Supabase Storage] Delete error: {e}")
        return False


# -----------------------------------------------------------------------------
# Local Fallback SQLite Initialization
# -----------------------------------------------------------------------------
def _get_local_connection() -> sqlite3.Connection:
    LOCAL_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(LOCAL_DB_PATH), timeout=15.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL;")
    return conn


def init_db() -> None:
    """Initializes local schema fallback if Supabase is offline or not configured."""
    with _LOCK, _get_local_connection() as conn:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS devices (
            device_id TEXT PRIMARY KEY,
            device_name TEXT NOT NULL,
            hardware_model TEXT NOT NULL,
            camera_model TEXT NOT NULL,
            status TEXT NOT NULL,
            camera_status TEXT NOT NULL,
            wifi_status TEXT NOT NULL,
            wifi_ssid TEXT,
            wifi_rssi INTEGER,
            ip_address TEXT,
            storage_used_gb REAL,
            storage_total_gb REAL,
            cpu_temp_c REAL,
            cpu_usage_percent REAL,
            ram_usage_percent REAL,
            uptime_seconds INTEGER,
            software_version TEXT,
            ai_model_version TEXT,
            stream_fps INTEGER DEFAULT 15,
            stream_resolution TEXT DEFAULT '1280x720',
            last_heartbeat TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS events (
            event_id TEXT PRIMARY KEY,
            device_id TEXT NOT NULL,
            type TEXT NOT NULL,
            status TEXT NOT NULL,
            ai_status TEXT NOT NULL,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            duration TEXT,
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS media_assets (
            id TEXT PRIMARY KEY,
            event_id TEXT NOT NULL,
            device_id TEXT NOT NULL,
            media_type TEXT NOT NULL,
            variant TEXT NOT NULL,
            filename TEXT NOT NULL,
            storage_path TEXT NOT NULL,
            file_size_bytes INTEGER NOT NULL,
            resolution TEXT,
            duration TEXT,
            processing_status TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS detections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_id TEXT NOT NULL,
            label TEXT NOT NULL,
            confidence REAL NOT NULL,
            x1 REAL, y1 REAL, x2 REAL, y2 REAL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS device_commands (
            command_id TEXT PRIMARY KEY,
            device_id TEXT NOT NULL,
            action TEXT NOT NULL,
            payload TEXT,
            status TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            executed_at TIMESTAMP,
            error_message TEXT
        );

        CREATE TABLE IF NOT EXISTS system_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            level TEXT NOT NULL,
            source TEXT NOT NULL,
            message TEXT NOT NULL
        );
        """)
        conn.commit()


# -----------------------------------------------------------------------------
# Device & Heartbeat Operations
# -----------------------------------------------------------------------------
def upsert_device_heartbeat(data: dict[str, Any]) -> dict[str, Any]:
    device_id = data.get("device_id", "nocturpod-edge-01")
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    record = {
        "device_id": device_id,
        "device_name": data.get("device_name", "NocturPod Alpha-1"),
        "hardware_model": data.get("hardware_model", "Raspberry Pi 4 Model B 8GB"),
        "camera_model": data.get("camera_model", "OV5647 IR-Cut"),
        "status": data.get("status", "ONLINE"),
        "camera_status": data.get("camera_status", "ONLINE"),
        "wifi_status": data.get("wifi_status", "CONNECTED"),
        "wifi_ssid": data.get("wifi_ssid"),
        "wifi_rssi": data.get("wifi_rssi"),
        "ip_address": data.get("ip_address"),
        "storage_used_gb": data.get("storage_used_gb"),
        "storage_total_gb": data.get("storage_total_gb"),
        "cpu_temp_c": data.get("cpu_temp_c"),
        "cpu_usage_percent": data.get("cpu_usage_percent"),
        "ram_usage_percent": data.get("ram_usage_percent"),
        "uptime_seconds": data.get("uptime_seconds"),
        "software_version": data.get("software_version", "1.0.0"),
        "ai_model_version": data.get("ai_model_version", "Adaptive CLAHE + YOLOv8n"),
        "stream_fps": data.get("stream_fps", 15),
        "stream_resolution": data.get("stream_resolution", "1280x720"),
        "last_heartbeat": now_iso,
        "updated_at": now_iso
    }

    if has_supabase_config():
        _supabase_request("devices", method="POST", data=record, headers={"Prefer": "resolution=merge-duplicates"})
        return record

    # Local fallback
    with _LOCK, _get_local_connection() as conn:
        conn.execute("""
        INSERT INTO devices (
            device_id, device_name, hardware_model, camera_model,
            status, camera_status, wifi_status, wifi_ssid, wifi_rssi,
            ip_address, storage_used_gb, storage_total_gb,
            cpu_temp_c, cpu_usage_percent, ram_usage_percent,
            uptime_seconds, software_version, ai_model_version,
            stream_fps, stream_resolution, last_heartbeat, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(device_id) DO UPDATE SET
            status = excluded.status,
            camera_status = excluded.camera_status,
            wifi_status = excluded.wifi_status,
            wifi_ssid = excluded.wifi_ssid,
            wifi_rssi = excluded.wifi_rssi,
            ip_address = excluded.ip_address,
            storage_used_gb = excluded.storage_used_gb,
            storage_total_gb = excluded.storage_total_gb,
            cpu_temp_c = excluded.cpu_temp_c,
            cpu_usage_percent = excluded.cpu_usage_percent,
            ram_usage_percent = excluded.ram_usage_percent,
            uptime_seconds = excluded.uptime_seconds,
            last_heartbeat = excluded.last_heartbeat,
            updated_at = excluded.updated_at
        """, (
            device_id, record["device_name"], record["hardware_model"], record["camera_model"],
            record["status"], record["camera_status"], record["wifi_status"], record["wifi_ssid"],
            record["wifi_rssi"], record["ip_address"], record["storage_used_gb"], record["storage_total_gb"],
            record["cpu_temp_c"], record["cpu_usage_percent"], record["ram_usage_percent"],
            record["uptime_seconds"], record["software_version"], record["ai_model_version"],
            record["stream_fps"], record["stream_resolution"], now_iso, now_iso
        ))
        conn.commit()
    return record


def get_device_status(device_id: str = "nocturpod-edge-01") -> dict[str, Any] | None:
    now = datetime.datetime.now(datetime.timezone.utc)
    if has_supabase_config():
        res = _supabase_request(f"devices?device_id=eq.{device_id}")
        if res and len(res) > 0:
            dev = res[0]
            # Check 15-second heartbeat timeout
            last_hb = dev.get("last_heartbeat")
            if last_hb:
                try:
                    dt = datetime.datetime.fromisoformat(last_hb.replace("Z", "+00:00"))
                    if (now - dt).total_seconds() > 15.0:
                        dev["status"] = "OFFLINE"
                        dev["camera_status"] = "OFFLINE"
                except Exception:
                    pass
            return dev

    with _LOCK, _get_local_connection() as conn:
        row = conn.execute("SELECT * FROM devices WHERE device_id = ?", (device_id,)).fetchone()
        if not row:
            return None
        dev = dict(row)
        last_hb = dev.get("last_heartbeat")
        if last_hb:
            try:
                dt = datetime.datetime.fromisoformat(last_hb.replace("Z", "+00:00"))
                if (now - dt).total_seconds() > 15.0:
                    dev["status"] = "OFFLINE"
                    dev["camera_status"] = "OFFLINE"
            except Exception:
                pass
        return dev


def check_device_timeouts(timeout_seconds: int = 15) -> None:
    now = datetime.datetime.now(datetime.timezone.utc)
    cutoff = (now - datetime.timedelta(seconds=timeout_seconds)).isoformat()
    if has_supabase_config():
        encoded_cutoff = urllib.parse.quote(cutoff)
        _supabase_request(
            f"devices?last_heartbeat=lt.{encoded_cutoff}&status=neq.OFFLINE",
            method="PATCH",
            data={"status": "OFFLINE", "camera_status": "OFFLINE"}
        )
        return

    with _LOCK, _get_local_connection() as conn:
        conn.execute("""
        UPDATE devices SET status = 'OFFLINE', camera_status = 'OFFLINE'
        WHERE last_heartbeat < ? AND status != 'OFFLINE'
        """, (cutoff,))
        conn.commit()


# -----------------------------------------------------------------------------
# Event & Media Operations
# -----------------------------------------------------------------------------
def create_event(data: dict[str, Any]) -> dict[str, Any]:
    event_id = data.get("event_id") or generate_event_id()
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    record = {
        "event_id": event_id,
        "device_id": data.get("device_id", "nocturpod-edge-01"),
        "type": data.get("type", "MANUAL_CAPTURE"),
        "status": data.get("status", "CAPTURE_REQUESTED"),
        "ai_status": data.get("ai_status", "PENDING"),
        "timestamp": data.get("timestamp") or now_iso,
        "duration": data.get("duration", "0s"),
        "notes": data.get("notes", "")
    }

    if has_supabase_config():
        _supabase_request("events", method="POST", data=record, headers={"Prefer": "resolution=merge-duplicates"})
    else:
        with _LOCK, _get_local_connection() as conn:
            conn.execute("""
            INSERT INTO events (event_id, device_id, type, status, ai_status, timestamp, duration, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(event_id) DO UPDATE SET
                status = excluded.status,
                ai_status = excluded.ai_status,
                notes = excluded.notes,
                duration = excluded.duration
            """, (
                event_id, record["device_id"], record["type"], record["status"],
                record["ai_status"], record["timestamp"], record["duration"], record["notes"]
            ))
            conn.commit()
    return record


def update_event_status(event_id: str, status: str, ai_status: str | None = None, notes: str | None = None) -> None:
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    patch: dict[str, Any] = {"status": status, "updated_at": now_iso}
    if ai_status:
        patch["ai_status"] = ai_status
    if notes:
        patch["notes"] = notes

    if has_supabase_config():
        _supabase_request(f"events?event_id=eq.{event_id}", method="PATCH", data=patch)
        return

    with _LOCK, _get_local_connection() as conn:
        updates = ["status = ?", "updated_at = ?"]
        params: list[Any] = [status, now_iso]
        if ai_status:
            updates.append("ai_status = ?")
            params.append(ai_status)
        if notes:
            updates.append("notes = ?")
            params.append(notes)
        params.append(event_id)
        conn.execute(f"UPDATE events SET {', '.join(updates)} WHERE event_id = ?", tuple(params))
        conn.commit()


def record_media_asset(data: dict[str, Any]) -> dict[str, Any]:
    asset_id = data.get("id") or f"asset_{generate_event_id()[3:]}_{data.get('variant', 'orig').lower()}"
    record = {
        "id": asset_id,
        "event_id": data.get("event_id"),
        "device_id": data.get("device_id", "nocturpod-edge-01"),
        "media_type": data.get("media_type", "IMAGE"),
        "variant": data.get("variant", "ORIGINAL"),
        "filename": data.get("filename", ""),
        "storage_path": data.get("storage_path", ""),
        "file_size_bytes": int(data.get("file_size_bytes", 0)),
        "resolution": data.get("resolution", "1280x720"),
        "duration": data.get("duration", "0s"),
        "processing_status": data.get("processing_status", "COMPLETE")
    }

    if has_supabase_config():
        _supabase_request("media_assets", method="POST", data=record, headers={"Prefer": "resolution=merge-duplicates"})
    else:
        with _LOCK, _get_local_connection() as conn:
            conn.execute("""
            INSERT INTO media_assets (
                id, event_id, device_id, media_type, variant, filename,
                storage_path, file_size_bytes, resolution, duration, processing_status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                file_size_bytes = excluded.file_size_bytes,
                processing_status = excluded.processing_status
            """, (
                asset_id, record["event_id"], record["device_id"], record["media_type"],
                record["variant"], record["filename"], record["storage_path"],
                record["file_size_bytes"], record["resolution"], record["duration"],
                record["processing_status"]
            ))
            conn.commit()
    return record


def record_detection(event_id: str, label: str, confidence: float, x1: float, y1: float, x2: float, y2: float) -> None:
    record = {
        "event_id": event_id,
        "label": label,
        "confidence": confidence,
        "x1": x1,
        "y1": y1,
        "x2": x2,
        "y2": y2
    }
    if has_supabase_config():
        _supabase_request("detections", method="POST", data=record)
    else:
        with _LOCK, _get_local_connection() as conn:
            conn.execute("""
            INSERT INTO detections (event_id, label, confidence, x1, y1, x2, y2)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (event_id, label, confidence, x1, y1, x2, y2))
            conn.commit()


def get_event(event_id: str) -> dict[str, Any] | None:
    if has_supabase_config():
        evs = _supabase_request(f"events?event_id=eq.{event_id}")
        if not evs or len(evs) == 0:
            return None
        ev = evs[0]
        # Attach media assets
        assets = _supabase_request(f"media_assets?event_id=eq.{event_id}") or []
        detections = _supabase_request(f"detections?event_id=eq.{event_id}") or []
    else:
        with _LOCK, _get_local_connection() as conn:
            row = conn.execute("SELECT * FROM events WHERE event_id = ?", (event_id,)).fetchone()
            if not row:
                return None
            ev = dict(row)
            asset_rows = conn.execute("SELECT * FROM media_assets WHERE event_id = ?", (event_id,)).fetchall()
            assets = [dict(a) for a in asset_rows]
            det_rows = conn.execute("SELECT * FROM detections WHERE event_id = ?", (event_id,)).fetchall()
            detections = [dict(d) for d in det_rows]

    # Format media asset URLs
    orig = next((a for a in assets if a.get("variant") == "ORIGINAL"), None)
    enh = next((a for a in assets if a.get("variant") == "ENHANCED"), None)

    ev["original_url"] = get_signed_storage_url(orig["storage_path"]) if orig else None
    ev["enhanced_url"] = get_signed_storage_url(enh["storage_path"]) if enh else None
    ev["media_type"] = ev.get("type") == "VIDEO_RECORDING" and "VIDEO" or "IMAGE"
    ev["processing_status"] = enh.get("processing_status", "PENDING") if enh else (orig and "PENDING" or "NONE")
    ev["detections"] = detections
    return ev


def list_events(limit: int = 50, filter_type: str | None = None, search: str | None = None) -> list[dict[str, Any]]:
    if has_supabase_config():
        query = f"events?select=*&order=timestamp.desc&limit={limit}"
        if filter_type and filter_type != "ALL":
            query += f"&type=eq.{filter_type}"
        if search and search.strip():
            query += f"&or=(event_id.ilike.*{search.strip()}*,notes.ilike.*{search.strip()}*)"
        evs = _supabase_request(query) or []
        return [get_event(e["event_id"]) for e in evs if e.get("event_id")]

    with _LOCK, _get_local_connection() as conn:
        q = "SELECT event_id FROM events"
        params: list[Any] = []
        conds = []
        if filter_type and filter_type != "ALL":
            conds.append("type = ?")
            params.append(filter_type)
        if search and search.strip():
            conds.append("(event_id LIKE ? OR notes LIKE ?)")
            s_param = f"%{search.strip()}%"
            params.extend([s_param, s_param])
        if conds:
            q += " WHERE " + " AND ".join(conds)
        q += " ORDER BY timestamp DESC LIMIT ?"
        params.append(limit)

        rows = conn.execute(q, tuple(params)).fetchall()
        return [get_event(r["event_id"]) for r in rows if r["event_id"]]


def list_media_events(media_type: str = "IMAGE") -> list[dict[str, Any]]:
    """Fetches completed or in-progress events with original and enhanced media URLs."""
    target_type = "MANUAL_CAPTURE" if media_type == "IMAGE" else "VIDEO_RECORDING"
    events = list_events(limit=100, filter_type=target_type)
    return events


def delete_event(event_id: str) -> bool:
    """Deletes an event, associated media assets, detections, and storage files."""
    storage_paths: list[str] = []

    if has_supabase_config():
        assets = _supabase_request(f"media_assets?event_id=eq.{event_id}") or []
        for a in assets:
            if a.get("storage_path"):
                storage_paths.append(a["storage_path"])
        if storage_paths:
            delete_from_supabase_storage(storage_paths)
        _supabase_request(f"events?event_id=eq.{event_id}", method="DELETE")

    # Clean up local SQLite fallback if used
    with _LOCK, _get_local_connection() as conn:
        asset_rows = conn.execute("SELECT storage_path FROM media_assets WHERE event_id = ?", (event_id,)).fetchall()
        for r in asset_rows:
            p = r["storage_path"]
            if p:
                storage_paths.append(p)
        conn.execute("DELETE FROM detections WHERE event_id = ?", (event_id,))
        conn.execute("DELETE FROM media_assets WHERE event_id = ?", (event_id,))
        conn.execute("DELETE FROM events WHERE event_id = ?", (event_id,))
        conn.commit()

    # Clean local disk files matching event_id
    media_dir = Path("storage") / "media"
    if media_dir.exists():
        for f in media_dir.glob(f"{event_id}*"):
            try:
                f.unlink(missing_ok=True)
            except Exception:
                pass

    log_system_event("INFO", "DASHBOARD", f"Deleted event {event_id} and associated assets")
    return True


def delete_all_events() -> int:
    """Deletes all events, media assets, detections, and storage files."""
    deleted_count = 0
    if has_supabase_config():
        evs = _supabase_request("events?select=event_id") or []
        deleted_count = len(evs)
        for e in evs:
            eid = e.get("event_id")
            if eid:
                delete_event(eid)
    else:
        with _LOCK, _get_local_connection() as conn:
            rows = conn.execute("SELECT event_id FROM events").fetchall()
            deleted_count = len(rows)
            for r in rows:
                delete_event(r["event_id"])
    return deleted_count


# -----------------------------------------------------------------------------
# Command Queue
# -----------------------------------------------------------------------------
def queue_command(device_id: str, action: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    cmd_id = f"cmd_{datetime.datetime.now().strftime('%Y%m%d%H%M%S%f')[:17]}"
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    record = {
        "command_id": cmd_id,
        "device_id": device_id,
        "action": action,
        "payload": payload or {},
        "status": "PENDING",
        "created_at": now_iso
    }

    if has_supabase_config():
        _supabase_request("device_commands", method="POST", data=record)
    else:
        with _LOCK, _get_local_connection() as conn:
            conn.execute("""
            INSERT INTO device_commands (command_id, device_id, action, payload, status, created_at)
            VALUES (?, ?, ?, ?, 'PENDING', ?)
            """, (cmd_id, device_id, action, json.dumps(payload or {}), now_iso))
            conn.commit()
    return record


def poll_commands(device_id: str) -> list[dict[str, Any]]:
    if has_supabase_config():
        cmds = _supabase_request(f"device_commands?device_id=eq.{device_id}&status=eq.PENDING&order=created_at.asc") or []
        for cmd in cmds:
            _supabase_request(f"device_commands?command_id=eq.{cmd['command_id']}", method="PATCH", data={"status": "DISPATCHED"})
            if isinstance(cmd.get("payload"), str):
                try:
                    cmd["payload"] = json.loads(cmd["payload"])
                except Exception:
                    pass
        return cmds

    with _LOCK, _get_local_connection() as conn:
        rows = conn.execute("""
        SELECT * FROM device_commands
        WHERE device_id = ? AND status = 'PENDING'
        ORDER BY created_at ASC
        """, (device_id,)).fetchall()
        commands = []
        for r in rows:
            cmd = dict(r)
            try:
                cmd["payload"] = json.loads(cmd["payload"]) if cmd.get("payload") else {}
            except Exception:
                cmd["payload"] = {}
            conn.execute("UPDATE device_commands SET status = 'DISPATCHED' WHERE command_id = ?", (cmd["command_id"],))
            commands.append(cmd)
        conn.commit()
        return commands


def ack_command(command_id: str, status: str = "EXECUTED", error_message: str | None = None) -> bool:
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    patch = {"status": status, "executed_at": now_iso, "error_message": error_message}
    if has_supabase_config():
        res = _supabase_request(f"device_commands?command_id=eq.{command_id}", method="PATCH", data=patch)
        return res is not None

    with _LOCK, _get_local_connection() as conn:
        conn.execute("""
        UPDATE device_commands SET status = ?, executed_at = ?, error_message = ?
        WHERE command_id = ?
        """, (status, now_iso, error_message, command_id))
        conn.commit()
        return True


def log_system_event(level: str, source: str, message: str) -> None:
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    record = {"timestamp": now_iso, "level": level, "source": source, "message": message}
    if has_supabase_config():
        _supabase_request("system_logs", method="POST", data=record)
    else:
        with _LOCK, _get_local_connection() as conn:
            conn.execute("INSERT INTO system_logs (timestamp, level, source, message) VALUES (?, ?, ?, ?)",
                         (now_iso, level, source, message))
            conn.commit()


# Initialize database schema on module import
init_db()
