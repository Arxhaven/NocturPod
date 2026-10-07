"""NocturPod Physical Camera Interface
Controls the OmniVision OV5647 IR-Cut camera on Raspberry Pi 4 Model B.
Uses Picamera2 when running under Raspberry Pi OS libcamera stack,
with OpenCV VideoCapture fallback for V4L2 compatibility.
NEVER generates synthetic or artificial camera frames.
"""
from __future__ import annotations

import time
from typing import Any

import cv2
import numpy as np

from agent.config import CAMERA_INDEX, STREAM_HEIGHT, STREAM_WIDTH


class OV5647Camera:
    def __init__(self, camera_index: int = CAMERA_INDEX, width: int = STREAM_WIDTH, height: int = STREAM_HEIGHT):
        self.camera_index = camera_index
        self.width = width
        self.height = height
        self.cap: cv2.VideoCapture | None = None
        self.picam2: Any = None
        self.is_opened = False
        self._init_camera()

    def _init_camera(self) -> None:
        # 1. Try modern Picamera2 (recommended on Raspberry Pi OS Bookworm / Bullseye)
        try:
            from picamera2 import Picamera2
            self.picam2 = Picamera2()
            config = self.picam2.create_video_configuration(main={"size": (self.width, self.height), "format": "RGB888"})
            self.picam2.configure(config)
            self.picam2.start()
            self.is_opened = True
            print("[Camera] OV5647 initialized via Picamera2 libcamera stack.")
            return
        except Exception:
            self.picam2 = None

        # 2. Try V4L2 VideoCapture (standard camera device node /dev/video0)
        try:
            self.cap = cv2.VideoCapture(self.camera_index)
            if self.cap.isOpened():
                self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.width)
                self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.height)
                ret, test_frame = self.cap.read()
                if ret and test_frame is not None and test_frame.size > 0:
                    self.is_opened = True
                    print(f"[Camera] OV5647 initialized via V4L2 VideoCapture (index {self.camera_index}).")
                    return
        except Exception as e:
            print(f"[Camera] OpenCV VideoCapture init failed: {e}")

        print("[Camera] Notice: Physical OV5647 camera not detected or busy.")
        self.is_opened = False

    def read_frame(self) -> np.ndarray | None:
        """Reads a genuine optical frame from the OV5647 camera.
        Returns None if camera is offline. NEVER fabricates a synthetic frame.
        """
        if self.picam2:
            try:
                frame_rgb = self.picam2.capture_array()
                if frame_rgb is not None and frame_rgb.size > 0:
                    # Convert RGB to BGR for OpenCV
                    return cv2.cvtColor(frame_rgb, cv2.COLOR_RGB2BGR)
            except Exception:
                pass

        if self.cap and self.cap.isOpened():
            ret, frame = self.cap.read()
            if ret and frame is not None and frame.size > 0:
                return frame

        return None

    def release(self) -> None:
        if self.picam2:
            try:
                self.picam2.stop()
                self.picam2.close()
            except Exception:
                pass
            self.picam2 = None

        if self.cap:
            self.cap.release()
            self.cap = None
        self.is_opened = False
