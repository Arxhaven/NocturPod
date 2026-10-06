"""NocturPod Live MJPEG Frame Streamer
Streams real OV5647 optical frames to backend /api/stream/frame.
Strictly sends only genuine camera frames.
"""
from __future__ import annotations

import time
import cv2
from agent.api_client import NocturPodApiClient
from agent.camera import OV5647Camera
from agent.config import STREAM_FRAME_INTERVAL


class StreamManager:
    def __init__(self, camera: OV5647Camera, api_client: NocturPodApiClient):
        self.camera = camera
        self.api_client = api_client
        self.is_streaming = True

    def stream_step(self) -> bool:
        """Grabs one genuine camera frame and pushes to backend."""
        frame = self.camera.read_frame()
        if frame is None:
            return False

        ret, jpeg_bytes = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
        if ret:
            return self.api_client.push_stream_frame(jpeg_bytes.tobytes())
        return False
