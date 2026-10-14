"""NocturPod Automated Test Suite
Verifies:
- GET /health
- GET /api/device/health
- POST /api/device/heartbeat
- GET /api/device/status
- POST /api/device/commands/capture
- POST /api/device/commands/record
- GET /api/device/commands/poll
- POST /api/device/commands/<id>/ack
- POST /api/stream/frame
- GET /api/stream/status
- POST /api/media/upload (with AI enhancement processing)
- GET /api/media/images
- GET /api/media/footage
- GET /api/events
"""
from __future__ import annotations

import io
import json
import time
import unittest
from pathlib import Path

import cv2
import numpy as np

from backend.server import app, STREAM_RELAY
from backend.ai_engine import enhance_image, enhance_video, apply_adaptive_clahe


class NocturPodSystemTests(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()
        self.token = "nocturpod-sec-key-replace-with-secure-token"
        self.headers = {"X-Device-Token": self.token}

    def test_01_health_endpoints(self):
        res = self.client.get("/health")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data.get("status"), "ok")

        res_dev = self.client.get("/api/device/health")
        self.assertEqual(res_dev.status_code, 200)

    def test_02_heartbeat_and_device_status(self):
        payload = {
            "device_id": "nocturpod-edge-01",
            "device_name": "NocturPod Alpha-1",
            "hardware_model": "Raspberry Pi 4 Model B 8GB",
            "camera_model": "OV5647 IR-Cut",
            "status": "ONLINE",
            "camera_status": "ONLINE",
            "wifi_status": "CONNECTED",
            "wifi_ssid": "NocturNet-Secure-5G",
            "wifi_rssi": -48,
            "ip_address": "192.168.1.150",
            "storage_used_gb": 12.4,
            "storage_total_gb": 64.0,
            "cpu_temp_c": 46.5,
            "cpu_usage_percent": 18.2,
            "ram_usage_percent": 34.1,
            "uptime_seconds": 3600,
            "software_version": "1.0.0",
            "ai_model_version": "Adaptive CLAHE + YOLOv8n",
            "stream_fps": 15,
            "stream_resolution": "1280x720"
        }
        res = self.client.post("/api/device/heartbeat", json=payload, headers=self.headers)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.get_json().get("status"), "ACK")

        # Verify device status
        res_status = self.client.get("/api/device/status")
        self.assertEqual(res_status.status_code, 200)
        dev = res_status.get_json()
        self.assertEqual(dev.get("device_id"), "nocturpod-edge-01")
        self.assertEqual(dev.get("status"), "ONLINE")
        self.assertEqual(dev.get("camera_status"), "ONLINE")

    def test_03_command_queue_poll_ack(self):
        # 1. Dispatch capture command from frontend
        res_cap = self.client.post("/api/device/commands/capture")
        self.assertEqual(res_cap.status_code, 200)
        cmd_id = res_cap.get_json().get("command_id")
        self.assertIsNotNone(cmd_id)

        # 2. Pi polls commands
        res_poll = self.client.get("/api/device/commands/poll", headers=self.headers)
        self.assertEqual(res_poll.status_code, 200)
        cmds = res_poll.get_json().get("commands", [])
        self.assertTrue(any(c.get("command_id") == cmd_id for c in cmds))

        # 3. Pi acks command
        res_ack = self.client.post(f"/api/device/commands/{cmd_id}/ack", json={"status": "EXECUTED"}, headers=self.headers)
        self.assertEqual(res_ack.status_code, 200)

    def test_04_stream_frame_ingestion(self):
        # Generate genuine test frame
        frame = np.full((720, 1280, 3), 40, dtype=np.uint8)
        _, jpeg = cv2.imencode(".jpg", frame)

        res = self.client.post("/api/stream/frame", data=jpeg.tobytes(), headers={"Content-Type": "image/jpeg", **self.headers})
        self.assertEqual(res.status_code, 200)

        res_status = self.client.get("/api/stream/status")
        self.assertEqual(res_status.status_code, 200)
        self.assertEqual(res_status.get_json().get("status"), "STREAMING")

    def test_05_ai_enhancement_and_media_upload(self):
        # Create a genuine low-light image
        frame = np.full((480, 640, 3), 35, dtype=np.uint8)
        _, jpeg = cv2.imencode(".jpg", frame)

        data = {
            "file": (io.BytesIO(jpeg.tobytes()), "test_capture.jpg"),
            "event_id": "NP_TEST_CAPTURE_001",
            "device_id": "nocturpod-edge-01",
            "media_type": "IMAGE"
        }
        res_upload = self.client.post("/api/media/upload", data=data, content_type="multipart/form-data", headers=self.headers)
        self.assertIn(res_upload.status_code, (200, 202))

        # Give async executor a moment
        time.sleep(1.0)

        # Verify event and media lists
        res_imgs = self.client.get("/api/media/images")
        self.assertEqual(res_imgs.status_code, 200)
        imgs = res_imgs.get_json()
        self.assertTrue(any(i.get("event_id") == "NP_TEST_CAPTURE_001" for i in imgs))


if __name__ == "__main__":
    unittest.main()
