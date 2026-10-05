"""NocturPod Database Layer
SQLite persistence for devices, events, detections, media, commands, and logs.
Enforces the event lifecycle and format: NP_YYYYMMDD_HHMMSS_###
"""
from __future__ import annotations

import datetime
import json
import sqlite3
import threading
from pathlib import Path
from typing import Any

DB_PATH = Path("storage") / "nocturpod.db"
_LOCK = threading.RLock()
_EVENT_COUNTER = 0
_LAST_SECOND = ""


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH), timeout=20.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn


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


def init_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with _LOCK, get_connection() as conn:
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
            battery_percent INTEGER,
            battery_voltage TEXT,
            power_source TEXT,
            cpu_temp_c REAL,
            cpu_usage_percent REAL,
            ram_usage_percent REAL,
            uptime_seconds INTEGER,
            last_heartbeat TIMESTAMP,
            software_version TEXT,
            ai_model_version TEXT,
            stream_fps INTEGER DEFAULT 24,
            stream_resolution TEXT DEFAULT '1920×1080',
            clahe_enabled INTEGER DEFAULT 1,
            ir_night_mode TEXT DEFAULT 'AUTO_ACTIVE',
            auth_token TEXT
        );

        CREATE TABLE IF NOT EXISTS events (
            event_id TEXT PRIMARY KEY,
            device_id TEXT NOT NULL,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            type TEXT NOT NULL,
            label TEXT,
            confidence REAL,
            ai_status TEXT NOT NULL,
            duration TEXT,
            media_url TEXT,
            thumbnail_url TEXT,
            media_type TEXT NOT NULL,
            notes TEXT,
            FOREIGN KEY(device_id) REFERENCES devices(device_id)
        );

        CREATE TABLE IF NOT EXISTS detections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_id TEXT NOT NULL,
            label TEXT NOT NULL,
            confidence REAL NOT NULL,
            x1 REAL, y1 REAL, x2 REAL, y2 REAL,
            FOREIGN KEY(event_id) REFERENCES events(event_id)
        );

        CREATE TABLE IF NOT EXISTS media (
            id TEXT PRIMARY KEY,
            event_id TEXT,
            title TEXT,
            filename TEXT NOT NULL,
            media_type TEXT NOT NULL,
            file_path TEXT NOT NULL,
            file_size_bytes INTEGER NOT NULL,
            resolution TEXT,
            duration TEXT,
            clahe_applied INTEGER DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS device_commands (
            command_id TEXT PRIMARY KEY,
            device_id TEXT NOT NULL,
            action TEXT NOT NULL,
            payload TEXT,
            status TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            executed_at TIMESTAMP
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


def check_device_timeouts(timeout_seconds: int = 15) -> None:
    """Updates device status to OFFLINE if no heartbeat received within threshold."""
    with _LOCK, get_connection() as conn:
        threshold = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(seconds=timeout_seconds)).isoformat()
        conn.execute(
            """UPDATE devices 
               SET status = 'OFFLINE', camera_status = 'OFFLINE' 
               WHERE last_heartbeat < ? AND status != 'OFFLINE'""",
            (threshold,)
        )
        conn.commit()


def upsert_device_heartbeat(data: dict[str, Any]) -> dict[str, Any]:
    with _LOCK, get_connection() as conn:
        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
        device_id = data.get("device_id", "nocturpod-edge-01")
        
        row = conn.execute("SELECT * FROM devices WHERE device_id = ?", (device_id,)).fetchone()
        if not row:
            conn.execute("""
            INSERT INTO devices (
                device_id, device_name, hardware_model, camera_model,
                status, camera_status, wifi_status, wifi_ssid, wifi_rssi,
                ip_address, storage_used_gb, storage_total_gb,
                battery_percent, battery_voltage, power_source,
                cpu_temp_c, cpu_usage_percent, ram_usage_percent,
                uptime_seconds, last_heartbeat, software_version,
                ai_model_version, stream_fps, stream_resolution,
                clahe_enabled, ir_night_mode, auth_token
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                device_id,
                data.get("device_name", "NocturPod α-1"),
                data.get("hardware_model", "Raspberry Pi 4 Model B (8GB)"),
                data.get("camera_model", "OmniVision OV5647 Night-Vision IR-Cut"),
                data.get("status", "ONLINE"),
                data.get("camera_status", "ONLINE"),
                data.get("wifi_status", "CONNECTED"),
                data.get("wifi_ssid", "NocturNet-Secure-5G"),
                data.get("wifi_rssi", -54),
                data.get("ip_address", "192.168.1.142"),
                data.get("storage_used_gb", 8.4),
                data.get("storage_total_gb", 64.0),
                data.get("battery_percent", 92),
                data.get("battery_voltage", "12.2V"),
                data.get("power_source", "BATTERY_DISCHARGING"),
                data.get("cpu_temp_c", 45.2),
                data.get("cpu_usage_percent", 22.0),
                data.get("ram_usage_percent", 38.0),
                data.get("uptime_seconds", 3600),
                now_iso,
                data.get("software_version", "1.2.0"),
                data.get("ai_model_version", "YOLOv8n-LowLight (NCNN INT8)"),
                data.get("stream_fps", 24),
                data.get("stream_resolution", "1920×1080"),
                data.get("clahe_enabled", 1),
                data.get("ir_night_mode", "AUTO_ACTIVE"),
                data.get("auth_token", "nocturpod-sec-key-2026")
            ))
        else:
            conn.execute("""
            UPDATE devices SET
                device_name = COALESCE(?, device_name),
                hardware_model = COALESCE(?, hardware_model),
                camera_model = COALESCE(?, camera_model),
                status = ?,
                camera_status = ?,
                wifi_status = COALESCE(?, wifi_status),
                wifi_ssid = COALESCE(?, wifi_ssid),
                wifi_rssi = COALESCE(?, wifi_rssi),
                ip_address = COALESCE(?, ip_address),
                storage_used_gb = COALESCE(?, storage_used_gb),
                storage_total_gb = COALESCE(?, storage_total_gb),
                battery_percent = COALESCE(?, battery_percent),
                battery_voltage = COALESCE(?, battery_voltage),
                power_source = COALESCE(?, power_source),
                cpu_temp_c = ?,
                cpu_usage_percent = ?,
                ram_usage_percent = ?,
                uptime_seconds = COALESCE(?, uptime_seconds),
                last_heartbeat = ?,
                software_version = COALESCE(?, software_version),
                ai_model_version = COALESCE(?, ai_model_version),
                stream_fps = COALESCE(?, stream_fps),
                stream_resolution = COALESCE(?, stream_resolution),
                clahe_enabled = COALESCE(?, clahe_enabled),
                ir_night_mode = COALESCE(?, ir_night_mode)
            WHERE device_id = ?
            """, (
                data.get("device_name"),
                data.get("hardware_model"),
                data.get("camera_model"),
                data.get("status", "ONLINE"),
                data.get("camera_status", "ONLINE"),
                data.get("wifi_status"),
                data.get("wifi_ssid"),
                data.get("wifi_rssi"),
                data.get("ip_address"),
                data.get("storage_used_gb"),
                data.get("storage_total_gb"),
                data.get("battery_percent"),
                data.get("battery_voltage"),
                data.get("power_source"),
                data.get("cpu_temp_c", 45.0),
                data.get("cpu_usage_percent", 20.0),
                data.get("ram_usage_percent", 35.0),
                data.get("uptime_seconds"),
                now_iso,
                data.get("software_version"),
                data.get("ai_model_version"),
                data.get("stream_fps"),
                data.get("stream_resolution"),
                data.get("clahe_enabled"),
                data.get("ir_night_mode"),
                device_id
            ))
        conn.commit()
    return get_device_status(device_id)


def get_device_status(device_id: str = "nocturpod-edge-01") -> dict[str, Any] | None:
    with _LOCK, get_connection() as conn:
        row = conn.execute("SELECT * FROM devices WHERE device_id = ?", (device_id,)).fetchone()
        if not row:
            return None
        d = dict(row)
        # Compute last heartbeat seconds elapsed
        if d.get("last_heartbeat"):
            try:
                hb = datetime.datetime.fromisoformat(d["last_heartbeat"].replace("Z", "+00:00"))
                if hb.tzinfo is None:
                    hb = hb.replace(tzinfo=datetime.timezone.utc)
                now = datetime.datetime.now(datetime.timezone.utc)
                delta_sec = max(0, int((now - hb).total_seconds()))
                d["lastHeartbeatSec"] = delta_sec
                if delta_sec > 15:
                    d["status"] = "OFFLINE"
                    d["cameraStatus"] = "OFFLINE"
            except Exception:
                d["lastHeartbeatSec"] = 999
        else:
            d["lastHeartbeatSec"] = 999
            d["status"] = "OFFLINE"

        # Format uptime string
        uptime = d.get("uptime_seconds") or 0
        d["uptimeHours"] = uptime // 3600
        d["uptimeMinutes"] = (uptime % 3600) // 60
        # Map DB snake_case to frontend camelCase expectations
        d["id"] = d["device_id"]
        d["name"] = d["device_name"]
        d["hardware"] = d["hardware_model"]
        d["cameraModel"] = d["camera_model"]
        d["cameraStatus"] = d["camera_status"]
        d["wifiStatus"] = d["wifi_status"]
        d["wifiSSID"] = d["wifi_ssid"]
        d["wifiRssi"] = d["wifi_rssi"]
        d["ipAddress"] = d["ip_address"]
        d["storageUsedGB"] = d["storage_used_gb"]
        d["storageTotalGB"] = d["storage_total_gb"]
        d["batteryPercent"] = d["battery_percent"]
        d["batteryVoltage"] = d["battery_voltage"]
        d["powerSource"] = d["power_source"]
        d["cpuTempC"] = d["cpu_temp_c"]
        d["cpuUsagePercent"] = d["cpu_usage_percent"]
        d["ramUsagePercent"] = d["ram_usage_percent"]
        d["streamFps"] = d["stream_fps"]
        d["streamResolution"] = d["stream_resolution"]
        d["claheEnabled"] = bool(d["clahe_enabled"])
        d["irNightMode"] = d["ir_night_mode"]
        return d


def create_event(data: dict[str, Any]) -> dict[str, Any]:
    with _LOCK, get_connection() as conn:
        event_id = data.get("event_id") or generate_event_id()
        device_id = data.get("device_id", "nocturpod-edge-01")
        now_iso = data.get("timestamp") or datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M:%S")

        conn.execute("""
        INSERT INTO events (
            event_id, device_id, timestamp, type, label, confidence,
            ai_status, duration, media_url, thumbnail_url, media_type, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(event_id) DO UPDATE SET
            label = COALESCE(excluded.label, events.label),
            confidence = COALESCE(excluded.confidence, events.confidence),
            ai_status = excluded.ai_status,
            media_url = COALESCE(excluded.media_url, events.media_url),
            thumbnail_url = COALESCE(excluded.thumbnail_url, events.thumbnail_url),
            notes = COALESCE(excluded.notes, events.notes)
        """, (
            event_id,
            device_id,
            now_iso,
            data.get("type", "MANUAL_CAPTURE"),
            data.get("label", "Optical Capture"),
            data.get("confidence", 0.0),
            data.get("ai_status", "CAPTURED"),
            data.get("duration", "0s"),
            data.get("media_url"),
            data.get("thumbnail_url"),
            data.get("media_type", "IMAGE"),
            data.get("notes", "NocturPod event")
        ))

        # Insert any initial detections
        detections = data.get("detections") or []
        for det in detections:
            box = det.get("box") or [0, 0, 0, 0]
            conn.execute("""
            INSERT INTO detections (event_id, label, confidence, x1, y1, x2, y2)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (
                event_id,
                det.get("label", "target"),
                float(det.get("confidence", 0.0)),
                float(box[0]), float(box[1]), float(box[2]), float(box[3])
            ))
        conn.commit()
    return get_event(event_id)


def update_event_ai_results(event_id: str, ai_status: str, detections: list[dict[str, Any]], primary_label: str = "", confidence: float = 0.0, annotated_url: str | None = None) -> dict[str, Any] | None:
    with _LOCK, get_connection() as conn:
        # Delete previous detections for this event to avoid duplicate rows on reprocessing
        conn.execute("DELETE FROM detections WHERE event_id = ?", (event_id,))
        for det in detections:
            box = det.get("box") or [0, 0, 0, 0]
            conn.execute("""
            INSERT INTO detections (event_id, label, confidence, x1, y1, x2, y2)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (
                event_id,
                det.get("label", "target"),
                float(det.get("confidence", 0.0)),
                float(box[0]), float(box[1]), float(box[2]), float(box[3])
            ))
        
        updates = ["ai_status = ?"]
        params: list[Any] = [ai_status]
        if primary_label:
            updates.append("label = ?")
            params.append(primary_label)
        if confidence > 0:
            updates.append("confidence = ?")
            params.append(confidence)
        if annotated_url:
            updates.append("thumbnail_url = ?")
            params.append(annotated_url)
            
        params.append(event_id)
        conn.execute(f"UPDATE events SET {', '.join(updates)} WHERE event_id = ?", tuple(params))
        conn.commit()
    return get_event(event_id)


def get_event(event_id: str) -> dict[str, Any] | None:
    with _LOCK, get_connection() as conn:
        row = conn.execute("SELECT * FROM events WHERE event_id = ?", (event_id,)).fetchone()
        if not row:
            return None
        ev = dict(row)
        ev["id"] = ev["event_id"]
        ev["deviceId"] = ev["device_id"]
        ev["aiStatus"] = ev["ai_status"]
        ev["mediaType"] = ev["media_type"]
        ev["fullMediaUrl"] = ev["media_url"]
        ev["thumbnail"] = ev["thumbnail_url"] or ev["media_url"]
        
        # Calculate human-friendly timeAgo
        try:
            ts = datetime.datetime.fromisoformat(ev["timestamp"].replace(" ", "T"))
            now = datetime.datetime.now()
            diff = (now - ts).total_seconds()
            if diff < 60:
                ev["timeAgo"] = "Just now"
            elif diff < 3600:
                ev["timeAgo"] = f"{int(diff // 60)}m ago"
            else:
                ev["timeAgo"] = f"{int(diff // 3600)}h ago"
        except Exception:
            ev["timeAgo"] = "Recent"

        # Detections
        det_rows = conn.execute("SELECT * FROM detections WHERE event_id = ?", (event_id,)).fetchall()
        ev["detections"] = [
            {
                "label": d["label"],
                "confidence": d["confidence"],
                "box": [d["x1"], d["y1"], d["x2"], d["y2"]]
            }
            for d in det_rows
        ]
        return ev


def list_events(limit: int = 50, filter_type: str | None = None, search: str | None = None) -> list[dict[str, Any]]:
    with _LOCK, get_connection() as conn:
        query = "SELECT event_id FROM events"
        params: list[Any] = []
        conditions = []
        if filter_type and filter_type != "ALL":
            conditions.append("type = ?")
            params.append(filter_type)
        if search and search.strip():
            conditions.append("(label LIKE ? OR event_id LIKE ? OR notes LIKE ?)")
            s_param = f"%{search.strip()}%"
            params.extend([s_param, s_param, s_param])
        if conditions:
            query += " WHERE " + " AND ".join(conditions)
        query += " ORDER BY timestamp DESC LIMIT ?"
        params.append(limit)

        rows = conn.execute(query, tuple(params)).fetchall()
        return [get_event(r["event_id"]) for r in rows if r["event_id"]]


def record_media(data: dict[str, Any]) -> dict[str, Any]:
    with _LOCK, get_connection() as conn:
        media_id = data.get("id") or ("med_" + generate_event_id()[3:])
        conn.execute("""
        INSERT INTO media (
            id, event_id, title, filename, media_type, file_path,
            file_size_bytes, resolution, duration, clahe_applied
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            title = COALESCE(excluded.title, media.title),
            file_path = excluded.file_path,
            file_size_bytes = excluded.file_size_bytes
        """, (
            media_id,
            data.get("event_id"),
            data.get("title", "NocturPod Media Capture"),
            data.get("filename", "capture.jpg"),
            data.get("media_type", "IMAGE"),
            data.get("file_path", ""),
            int(data.get("file_size_bytes", 0)),
            data.get("resolution", "1920×1080"),
            data.get("duration", "0s"),
            1 if data.get("clahe_applied", True) else 0
        ))
        conn.commit()
        row = conn.execute("SELECT * FROM media WHERE id = ?", (media_id,)).fetchone()
        return dict(row)


def list_media(media_type: str | None = None) -> list[dict[str, Any]]:
    with _LOCK, get_connection() as conn:
        if media_type:
            rows = conn.execute("SELECT * FROM media WHERE media_type = ? ORDER BY created_at DESC", (media_type,)).fetchall()
        else:
            rows = conn.execute("SELECT * FROM media ORDER BY created_at DESC").fetchall()
        
        result = []
        for r in rows:
            m = dict(r)
            m["claheApplied"] = bool(m.get("clahe_applied", 1))
            m["eventId"] = m.get("event_id")
            # Format URL for frontend access
            filename = m.get("filename")
            m["url"] = f"/storage/media/{filename}"
            m["thumbnail"] = f"/storage/media/{filename}"
            result.append(m)
        return result


def queue_command(device_id: str, action: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    with _LOCK, get_connection() as conn:
        cmd_id = f"cmd_{datetime.datetime.now().strftime('%Y%m%d%H%M%S%f')[:17]}"
        conn.execute("""
        INSERT INTO device_commands (command_id, device_id, action, payload, status)
        VALUES (?, ?, ?, ?, 'PENDING')
        """, (cmd_id, device_id, action, json.dumps(payload or {})))
        conn.commit()
        return {"command_id": cmd_id, "device_id": device_id, "action": action, "status": "PENDING"}


def poll_commands(device_id: str) -> list[dict[str, Any]]:
    with _LOCK, get_connection() as conn:
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
            # Mark dispatched
            conn.execute("UPDATE device_commands SET status = 'DISPATCHED' WHERE command_id = ?", (cmd["command_id"],))
            commands.append(cmd)
        conn.commit()
        return commands


def ack_command(command_id: str, status: str = "EXECUTED") -> bool:
    with _LOCK, get_connection() as conn:
        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
        conn.execute("""
        UPDATE device_commands 
        SET status = ?, executed_at = ? 
        WHERE command_id = ?
        """, (status, now_iso, command_id))
        conn.commit()
        return True


def log_system_event(level: str, source: str, message: str) -> None:
    with _LOCK, get_connection() as conn:
        conn.execute("INSERT INTO system_logs (level, source, message) VALUES (?, ?, ?)", (level, source, message))
        conn.commit()


def get_metrics_summary() -> dict[str, Any]:
    with _LOCK, get_connection() as conn:
        today_prefix = datetime.datetime.now().strftime("%Y-%m-%d")
        
        captures_count = conn.execute(
            "SELECT COUNT(*) FROM events WHERE timestamp LIKE ? AND media_type = 'IMAGE'",
            (f"{today_prefix}%",)
        ).fetchone()[0]
        
        recorded_clips = conn.execute(
            "SELECT COUNT(*) FROM events WHERE timestamp LIKE ? AND media_type = 'VIDEO'",
            (f"{today_prefix}%",)
        ).fetchone()[0]
        
        ai_detections_count = conn.execute(
            "SELECT COUNT(*) FROM detections d JOIN events e ON d.event_id = e.event_id WHERE e.timestamp LIKE ?",
            (f"{today_prefix}%",)
        ).fetchone()[0]
        
        motion_events_count = conn.execute(
            "SELECT COUNT(*) FROM events WHERE timestamp LIKE ? AND type IN ('MOTION_TRIGGERED', 'UNIDENTIFIED_TARGET')",
            (f"{today_prefix}%",)
        ).fetchone()[0]

        device = get_device_status()
        uptime_str = f"{device.get('uptimeHours', 0)}h {device.get('uptimeMinutes', 0)}m" if device else "0h 0m"

        return {
            "motionEventsToday": motion_events_count,
            "capturesToday": captures_count,
            "recordedMinutesToday": recorded_clips * 2,
            "aiDetectionsToday": ai_detections_count,
            "uptimeStr": uptime_str,
            "healthScore": "99.8%" if device and device.get("status") == "ONLINE" else "0.0%"
        }
