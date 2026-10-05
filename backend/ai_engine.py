"""NocturPod Edge AI Vision Engine
Wraps YOLOv8n with Adaptive CLAHE luminance normalization and structured output formatting.
"""
from __future__ import annotations

import os
import time
from pathlib import Path
from typing import Any

import cv2
import numpy as np
import ultralytics
from ultralytics import YOLO

# Perimeter security classes: person (0), bicycle (1), car (2), motorcycle (3), bus (5), truck (7), cat (15), dog (16)
DEFAULT_CLASSES = [0, 1, 2, 3, 5, 7, 15, 16]
MODEL_PATH = os.getenv("MODEL_PATH", "yolov8n.pt")


def apply_adaptive_clahe(frame: np.ndarray, base_clip: float | None = None) -> np.ndarray:
    """Gentle LAB-luminance enhancement; avoids noisy global contrast boosts."""
    if frame is None or frame.size == 0:
        return frame
    lab = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB)
    l_channel, a_channel, b_channel = cv2.split(lab)
    if base_clip is not None:
        clip_limit = float(base_clip)
    else:
        brightness = float(np.mean(l_channel))
        clip_limit = float(np.clip(2.5 - brightness / 255.0 * 0.7, 1.8, 2.5))
    clahe = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=(8, 8))
    enhanced = cv2.merge((clahe.apply(l_channel), a_channel, b_channel))
    return cv2.cvtColor(enhanced, cv2.COLOR_LAB2BGR)


class NocturPodAIEngine:
    def __init__(self, model_path: str = MODEL_PATH):
        self.model_path = model_path
        self.model_name = Path(model_path).stem
        self.classes = DEFAULT_CLASSES
        self._model = None
        self._load_model()

    def _load_model(self) -> None:
        try:
            self._model = YOLO(self.model_path)
        except Exception as e:
            print(f"[AI Engine] Error loading model from {self.model_path}: {e}")
            self._model = None

    @property
    def is_ready(self) -> bool:
        return self._model is not None

    def infer(self, image_bgr: np.ndarray, conf: float = 0.28, apply_clahe: bool = True, custom_clip: float | None = None) -> dict[str, Any]:
        """Runs adaptive CLAHE + YOLOv8n inference on a BGR image array."""
        if image_bgr is None or image_bgr.size == 0:
            return {
                "status": "FAILED",
                "error": "Empty or invalid image frame",
                "detections": [],
                "count": 0,
                "processing_time_ms": 0.0
            }

        start = time.perf_counter()
        
        # 1. Preprocessing Stage: Adaptive CLAHE
        processed = apply_adaptive_clahe(image_bgr, base_clip=custom_clip) if apply_clahe else image_bgr

        if self._model is None:
            self._load_model()

        if self._model is None:
            return {
                "status": "FAILED",
                "error": "Model failed to load or is unavailable",
                "detections": [],
                "count": 0,
                "processing_time_ms": round((time.perf_counter() - start) * 1000, 2)
            }

        try:
            results = self._model(processed, conf=conf, classes=self.classes, verbose=False)[0]
            elapsed_ms = round((time.perf_counter() - start) * 1000, 2)

            detections: list[dict[str, Any]] = []
            highest_conf = 0.0
            primary_label = "Optical Target"

            for box in results.boxes:
                conf_val = round(float(box.conf[0]), 4)
                cls_id = int(box.cls[0])
                name = results.names.get(cls_id, f"class_{cls_id}")
                xyxy = [round(float(v), 1) for v in box.xyxy[0].tolist()]
                
                detections.append({
                    "label": name,
                    "confidence": conf_val,
                    "box": xyxy
                })

                if conf_val > highest_conf:
                    highest_conf = conf_val
                    primary_label = name.capitalize()

            annotated_bgr = results.plot()

            return {
                "status": "COMPLETE",
                "model": "YOLOv8n-LowLight",
                "model_version": ultralytics.__version__,
                "processing_time_ms": elapsed_ms,
                "detections": detections,
                "count": len(detections),
                "primary_label": primary_label if detections else "Scene Clear",
                "highest_confidence": highest_conf,
                "clahe_applied": apply_clahe,
                "annotated_bgr": annotated_bgr
            }
        except Exception as ex:
            return {
                "status": "FAILED",
                "error": str(ex),
                "detections": [],
                "count": 0,
                "processing_time_ms": round((time.perf_counter() - start) * 1000, 2)
            }


# Singleton engine instance
ENGINE = NocturPodAIEngine()
