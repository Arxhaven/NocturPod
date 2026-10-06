"""NocturPod Still Capture & Video Recording Handlers."""
from __future__ import annotations

import datetime
import time
from pathlib import Path
from typing import Any

import cv2
import numpy as np

from agent.api_client import NocturPodApiClient
from agent.camera import OV5647Camera
from agent.config import (
    ORIGINAL_IMAGES_DIR,
    ORIGINAL_VIDEOS_DIR,
    STREAM_FPS,
    STREAM_HEIGHT,
    STREAM_WIDTH,
)
from agent.uploader import SpoolUploader


def generate_event_id() -> str:
    now = datetime.datetime.now(datetime.timezone.utc)
    sec_str = now.strftime("%Y%m%d_%H%M%S")
    ms = int(time.time() * 1000) % 1000
    return f"NP_{sec_str}_{ms:03d}"


class CaptureController:
    def __init__(self, camera: OV5647Camera, api_client: NocturPodApiClient, spool: SpoolUploader):
        self.camera = camera
        self.api_client = api_client
        self.spool = spool

    def capture_image(self) -> tuple[bool, str, str | None]:
        """Captures a real frame from the OV5647 camera, saves locally as ORIGINAL,
        and uploads to backend or spools for retry.
        Returns: (success, event_id, error_message)
        """
        frame = self.camera.read_frame()
        if frame is None:
            return False, "", "OV5647 camera is offline or not producing frames"

        event_id = generate_event_id()
        file_path = ORIGINAL_IMAGES_DIR / f"{event_id}.jpg"

        # Save ORIGINAL image
        ok = cv2.imwrite(str(file_path), frame, [cv2.IMWRITE_JPEG_QUALITY, 95])
        if not ok:
            return False, event_id, "Failed to write image to disk"

        # Try immediate upload
        uploaded = self.api_client.upload_media(file_path, event_id=event_id, media_type="IMAGE", duration="0s")
        if not uploaded:
            # Retain locally and spool for network recovery
            self.spool.enqueue(file_path, event_id=event_id, media_type="IMAGE", duration="0s")

        return True, event_id, None


class RecordController:
    def __init__(self, camera: OV5647Camera, api_client: NocturPodApiClient, spool: SpoolUploader):
        self.camera = camera
        self.api_client = api_client
        self.spool = spool
        self.is_recording = False
        self.writer: cv2.VideoWriter | None = None
        self.current_event_id: str = ""
        self.current_file_path: Path | None = None
        self.start_time: float = 0.0

    def start_recording(self) -> tuple[bool, str, str | None]:
        if self.is_recording:
            return True, self.current_event_id, None

        if not self.camera.is_opened:
            return False, "", "Camera is offline"

        self.current_event_id = generate_event_id()
        self.current_file_path = ORIGINAL_VIDEOS_DIR / f"{self.current_event_id}.mp4"
        self.start_time = time.time()

        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        self.writer = cv2.VideoWriter(
            str(self.current_file_path),
            fourcc,
            float(STREAM_FPS),
            (STREAM_WIDTH, STREAM_HEIGHT)
        )
        self.is_recording = True
        print(f"[Record] Started video recording: {self.current_file_path.name}")
        return True, self.current_event_id, None

    def record_step(self) -> None:
        """Call repeatedly during active recording to write camera frames."""
        if not self.is_recording or self.writer is None:
            return
        frame = self.camera.read_frame()
        if frame is not None:
            self.writer.write(frame)

    def stop_recording(self) -> tuple[bool, str, str | None]:
        if not self.is_recording:
            return False, "", "No active recording"

        self.is_recording = False
        duration_sec = round(time.time() - self.start_time, 1)
        duration_str = f"{int(duration_sec)}s"

        if self.writer:
            self.writer.release()
            self.writer = None

        file_path = self.current_file_path
        event_id = self.current_event_id

        if not file_path or not file_path.exists():
            return False, event_id, "Video recording output file not found"

        print(f"[Record] Finalized recording {file_path.name} (Duration: {duration_str})")

        # Upload original video
        uploaded = self.api_client.upload_media(
            file_path,
            event_id=event_id,
            media_type="VIDEO",
            duration=duration_str
        )
        if not uploaded:
            self.spool.enqueue(file_path, event_id=event_id, media_type="VIDEO", duration=duration_str)

        return True, event_id, None
