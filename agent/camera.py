"""Physical OV5647 camera interface with configurable libcamera controls.

Automatic exposure and white balance are the safe default. Sensor gain is exposed
as analogue gain (an ISO-like control); OV5647/Picamera2 does not expose a universal
ISO number. Individual control support depends on the camera and driver.
"""
from __future__ import annotations

import threading
import time
from typing import Any

import cv2
import numpy as np

from agent.config import CAMERA_INDEX, STREAM_HEIGHT, STREAM_WIDTH


CAMERA_DEFAULTS: dict[str, Any] = {
    "auto_exposure": True,
    "exposure_time_us": 20000,
    "analogue_gain": 3.0,
    "auto_white_balance": True,
    "brightness": 0.0,
    "contrast": 1.0,
    "saturation": 0.65,
    "sharpness": 1.0,
}


def _bounded_settings(settings: dict[str, Any] | None) -> dict[str, Any]:
    values = {**CAMERA_DEFAULTS, **(settings or {})}
    return {
        "auto_exposure": bool(values["auto_exposure"]),
        "exposure_time_us": int(max(1000, min(60000, float(values["exposure_time_us"])))),
        "analogue_gain": float(max(1.0, min(8.0, float(values["analogue_gain"])))),
        "auto_white_balance": bool(values["auto_white_balance"]),
        "brightness": float(max(-1.0, min(1.0, float(values["brightness"])))),
        "contrast": float(max(0.5, min(2.0, float(values["contrast"])))),
        "saturation": float(max(0.0, min(2.0, float(values["saturation"])))),
        "sharpness": float(max(0.0, min(2.0, float(values["sharpness"])))),
    }


class OV5647Camera:
    def __init__(self, camera_index: int = CAMERA_INDEX, width: int = STREAM_WIDTH, height: int = STREAM_HEIGHT):
        self.camera_index = camera_index
        self.width = width
        self.height = height
        self.cap: cv2.VideoCapture | None = None
        self.picam2: Any = None
        self.is_opened = False
        self.backend = "unavailable"
        self.current_settings = dict(CAMERA_DEFAULTS)
        self._frame_lock = threading.RLock()
        self._init_camera()

    def _init_camera(self) -> None:
        try:
            from picamera2 import Picamera2
            self.picam2 = Picamera2()
            config = self.picam2.create_video_configuration(
                main={"size": (self.width, self.height), "format": "RGB888"}
            )
            self.picam2.configure(config)
            self.picam2.start()
            self.is_opened = True
            self.backend = "picamera2"
            print("[Camera] OV5647 initialized via Picamera2/libcamera.")
            return
        except Exception as exc:
            self.picam2 = None
            print(f"[Camera] Picamera2 unavailable; trying V4L2: {exc}")

        try:
            self.cap = cv2.VideoCapture(self.camera_index)
            if self.cap.isOpened():
                self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.width)
                self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.height)
                ret, frame = self.cap.read()
                if ret and frame is not None and frame.size:
                    self.is_opened = True
                    self.backend = "opencv-v4l2"
                    print(f"[Camera] OV5647 initialized via V4L2 device index {self.camera_index}.")
                    return
        except Exception as exc:
            print(f"[Camera] V4L2 initialization failed: {exc}")

        print("[Camera] ERROR: No physical camera backend is available.")
        self.is_opened = False
        self.backend = "unavailable"

    def apply_settings(self, settings: dict[str, Any]) -> dict[str, Any]:
        """Apply only camera controls the active driver actually supports."""
        normalized = _bounded_settings(settings)
        applied: list[str] = []
        unsupported: list[str] = []
        errors: list[str] = []

        with self._frame_lock:
            if not self.is_opened:
                return {
                    "success": False,
                    "backend": self.backend,
                    "applied": [],
                    "unsupported": list(normalized.keys()),
                    "error": "Camera is not open; settings were not applied.",
                    "settings": normalized,
                }

            if self.picam2:
                try:
                    supported = getattr(self.picam2, "camera_controls", {}) or {}
                    controls: dict[str, Any] = {}
                    mapping = {
                        "AeEnable": ("auto_exposure", normalized["auto_exposure"]),
                        "AwbEnable": ("auto_white_balance", normalized["auto_white_balance"]),
                        "Brightness": ("brightness", normalized["brightness"]),
                        "Contrast": ("contrast", normalized["contrast"]),
                        "Saturation": ("saturation", normalized["saturation"]),
                        "Sharpness": ("sharpness", normalized["sharpness"]),
                    }
                    if not normalized["auto_exposure"]:
                        mapping["ExposureTime"] = ("exposure_time_us", normalized["exposure_time_us"])
                        mapping["AnalogueGain"] = ("analogue_gain", normalized["analogue_gain"])
                    for control, (setting_key, value) in mapping.items():
                        if control not in supported:
                            unsupported.append(setting_key)
                            continue
                        limits = supported[control]
                        if isinstance(limits, (tuple, list)) and len(limits) >= 2:
                            try:
                                value = max(limits[0], min(limits[1], value))
                            except TypeError:
                                pass
                        controls[control] = value
                        applied.append(setting_key)
                    if controls:
                        self.picam2.set_controls(controls)
                except Exception as exc:
                    errors.append(str(exc))
            elif self.cap and self.cap.isOpened():
                properties = {
                    "auto_exposure": (cv2.CAP_PROP_AUTO_EXPOSURE, 0.75 if not normalized["auto_exposure"] else 0.25),
                    "brightness": (cv2.CAP_PROP_BRIGHTNESS, normalized["brightness"]),
                    "contrast": (cv2.CAP_PROP_CONTRAST, normalized["contrast"]),
                    "saturation": (cv2.CAP_PROP_SATURATION, normalized["saturation"]),
                    "sharpness": (cv2.CAP_PROP_SHARPNESS, normalized["sharpness"]),
                }
                if not normalized["auto_exposure"]:
                    properties["exposure_time_us"] = (cv2.CAP_PROP_EXPOSURE, normalized["exposure_time_us"])
                    properties["analogue_gain"] = (cv2.CAP_PROP_GAIN, normalized["analogue_gain"])
                for key, (prop, value) in properties.items():
                    try:
                        if self.cap.set(prop, float(value)):
                            applied.append(key)
                        else:
                            unsupported.append(key)
                    except Exception:
                        unsupported.append(key)
            else:
                unsupported.extend(normalized.keys())

            success = bool(applied) and not errors
            if success:
                self.current_settings.update(normalized)
            return {
                "success": success,
                "backend": self.backend,
                "applied": applied,
                "unsupported": sorted(set(unsupported)),
                "error": "; ".join(errors) if errors else None,
                "settings": normalized,
                "message": (
                    f"Applied {len(applied)} camera control(s)"
                    if success else "The active camera driver did not accept these controls."
                ),
            }

    def read_frame(self) -> np.ndarray | None:
        """Read genuine camera pixels. Never synthesizes a frame."""
        with self._frame_lock:
            if self.picam2:
                try:
                    frame_rgb = self.picam2.capture_array()
                    if frame_rgb is not None and frame_rgb.size:
                        return cv2.cvtColor(frame_rgb, cv2.COLOR_RGB2BGR)
                except Exception as exc:
                    print(f"[Camera] Picamera2 frame read failed: {exc}")
            if self.cap and self.cap.isOpened():
                try:
                    ret, frame = self.cap.read()
                    if ret and frame is not None and frame.size:
                        return frame
                except Exception as exc:
                    print(f"[Camera] V4L2 frame read failed: {exc}")
        return None

    def release(self) -> None:
        with self._frame_lock:
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
            self.backend = "unavailable"
