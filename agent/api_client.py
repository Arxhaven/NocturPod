"""NocturPod Agent API Client
Handles authenticated communication, requests, retries, and media uploads to the Flask backend.
"""
from __future__ import annotations

import datetime
from pathlib import Path
from typing import Any

import requests
from agent.config import BACKEND_URL, DEVICE_ID, DEVICE_TOKEN


class NocturPodApiClient:
    def __init__(self, backend_url: str = BACKEND_URL, token: str = DEVICE_TOKEN) -> None:
        self.backend_url = backend_url.rstrip("/")
        self.token = token
        self.session = requests.Session()
        self.session.headers.update({
            "X-Device-Token": self.token
        })
        print(f"[API Client] Configured target: {self.backend_url} (Token: {self.token[:4]}****)")

    def send_heartbeat(self, telemetry: dict[str, Any]) -> bool:
        url = f"{self.backend_url}/api/device/heartbeat"
        try:
<<<<<<< ours
            res = self.session.post(url, json=telemetry, timeout=5.0)
            if res.status_code == 200:
                print(f"[Heartbeat] -> OK (Status: {telemetry.get('status')}, Temp: {telemetry.get('cpu_temp_c')}°C)")
                return True
            else:
                print(f"[Heartbeat] -> Failed with HTTP {res.status_code}: {res.text}")
                return False
        except Exception as e:
            print(f"[Heartbeat] -> Connection error contacting {url}: {e}")
            return False
=======
            res = self.session.post(
                f"{self.backend_url}/api/device/heartbeat",
                json=telemetry,
                timeout=4.0
            )
            return res.status_code == 200
        except Exception as e:
            print("[Stream] ERROR:", e); return False
>>>>>>> theirs

    def poll_commands(self) -> list[dict[str, Any]]:
        try:
            res = self.session.get(
                f"{self.backend_url}/api/device/commands/poll?device_id={DEVICE_ID}",
                timeout=3.0
            )
            if res.status_code == 200:
                data = res.json()
<<<<<<< ours
                cmds = data.get("commands", [])
                if cmds:
                    print(f"[Commands] Received {len(cmds)} command(s)")
                return cmds
            elif res.status_code == 401:
                print("[Commands] Unauthorized: Check NOCTURPOD_DEVICE_TOKEN match with Render backend")
=======
                return data.get("commands", [])
>>>>>>> theirs
        except Exception as e:
            pass
        return []

    def ack_command(self, command_id: str, status: str = "EXECUTED", error_message: str | None = None) -> bool:
        try:
            payload = {"status": status}
            if error_message:
                payload["error_message"] = error_message
            res = self.session.post(
                f"{self.backend_url}/api/device/commands/{command_id}/ack",
                json=payload,
                timeout=4.0
            )
            return res.status_code == 200
        except Exception as e:
            print("[Stream] ERROR:", e); return False

    def push_stream_frame(self, jpeg_bytes: bytes) -> bool:
        try:
            res = self.session.post(
                f"{self.backend_url}/api/stream/frame",
                data=jpeg_bytes,
                headers={"Content-Type": "image/jpeg"},
                timeout=2.0
            )
            return res.status_code == 200
        except Exception as e:
            print("[Stream] ERROR:", e); return False

    def upload_media(self, file_path: Path, event_id: str, media_type: str, duration: str = "0s") -> bool:
        if not file_path.exists():
            print("[Stream] ERROR:", e); return False
        try:
            mime = "image/jpeg" if media_type == "IMAGE" else "video/mp4"
            with open(file_path, "rb") as f:
                files = {"file": (file_path.name, f, mime)}
                data = {
                    "event_id": event_id,
                    "device_id": DEVICE_ID,
                    "media_type": media_type,
                    "duration": duration
                }
                res = self.session.post(
                    f"{self.backend_url}/api/media/upload",
                    files=files,
                    data=data,
                    timeout=30.0
                )
                if res.status_code in (200, 202):
                    print(f"[Upload] Successfully uploaded {file_path.name} ({media_type})")
                    return True
                else:
                    print(f"[Upload] Upload failed ({res.status_code}): {res.text}")
                    return False
        except Exception as e:
            print(f"[API Client] Media upload failed for {file_path.name}: {e}")
            print("[Stream] ERROR:", e); return False
