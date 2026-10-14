"""OmniVision OV5647 Camera Capture Module for Raspberry Pi 4.

Supports:
1. Picamera2 (modern libcamera stack on 64-bit Raspberry Pi OS Bullseye/Bookworm)
2. OpenCV VideoCapture(0) fallback
3. Standby synthetic frame generator when physical camera is offline

Hardware status: UNVERIFIED until tested on the physical Raspberry Pi 4 with camera attached.
"""
import logging
import time
from typing import Optional, Tuple
import cv2
import numpy as np

logger = logging.getLogger("NocturPod.Camera")

class CameraStream:
    def __init__(self, resolution: Tuple[int, int] = (1920, 1080), framerate: int = 24):
        self.resolution = resolution
        self.framerate = framerate
        self.backend_type = "NONE"
        self._picam2 = None
        self._cap = None
        self._init_camera()

    def _init_camera(self):
        # 1. Attempt modern Picamera2
        try:
            from picam2 import Picamera2
            self._picam2 = Picamera2()
            config = self._picam2.create_preview_configuration(
                main={"size": self.resolution, "format": "RGB888"}
            )
            self._picam2.configure(config)
            self._picam2.start()
            self.backend_type = "PICAMERA2_LIBCAMERA"
            logger.info(f"[UNVERIFIED] OV5647 initialized via Picamera2 ({self.resolution[0]}x{self.resolution[1]}).")
            return
        except (ImportError, Exception) as e:
            logger.debug(f"Picamera2 initialization skipped: {e}")

        # 2. Attempt standard OpenCV VideoCapture
        try:
            cap = cv2.VideoCapture(0)
            if cap.isOpened():
                cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.resolution[0])
                cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.resolution[1])
                cap.set(cv2.CAP_PROP_FPS, self.framerate)
                ret, frame = cap.read()
                if ret and frame is not None:
                    self._cap = cap
                    self.backend_type = "OPENCV_V4L2"
                    logger.info(f"[UNVERIFIED] Camera initialized via OpenCV VideoCapture ({self.resolution}).")
                    return
                cap.release()
        except Exception as e:
            logger.debug(f"OpenCV capture skipped: {e}")

        # 3. Offline / Simulation fallback
        self.backend_type = "SYNTHETIC_STANDBY"
        logger.warning("[UNVERIFIED] Physical OV5647 camera not accessible. Using standby test stream.")

    def capture_frame(self) -> np.ndarray:
        """Capture a single frame as BGR numpy array."""
        if self.backend_type == "PICAMERA2_LIBCAMERA" and self._picam2:
            try:
                frame_rgb = self._picam2.capture_array()
                return cv2.cvtColor(frame_rgb, cv2.COLOR_RGB2BGR)
            except Exception as e:
                logger.error(f"Picamera2 capture error: {e}")

        elif self.backend_type == "OPENCV_V4L2" and self._cap:
            try:
                ret, frame = self._cap.read()
                if ret and frame is not None:
                    return frame
            except Exception as e:
                logger.error(f"OpenCV capture error: {e}")

        # Standby synthetic nocturnal frame
        w, h = self.resolution
        frame = np.zeros((h, w, 3), dtype=np.uint8)
        now_str = time.strftime("%Y-%m-%d %H:%M:%S")
        cv2.putText(frame, "NOCTURPOD // OV5647 NIGHT SENSOR (STANDBY)", (50, 100), cv2.FONT_HERSHEY_SIMPLEX, 1.2, (0, 255, 120), 2)
        cv2.putText(frame, f"EDGE TIMESTAMP: {now_str}", (50, 160), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (180, 200, 180), 2)
        cv2.putText(frame, "STATUS: UNVERIFIED HARDWARE (WAITING FOR DEVICE TEST)", (50, 220), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 180, 255), 2)
        return frame

    def release(self):
        if self._picam2:
            try:
                self._picam2.stop()
                self._picam2.close()
            except Exception:
                pass
        if self._cap:
            try:
                self._cap.release()
            except Exception:
                pass
