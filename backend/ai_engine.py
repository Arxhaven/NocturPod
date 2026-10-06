"""NocturPod AI Low-Light Enhancement and Vision Inference Pipeline
Integrates the genuine Adaptive CLAHE + Detail Sharpening enhancement algorithm
from ai_model_source, along with YOLOv8 perimeter security detection.

Clean unified API:
- enhance_image(input_path, output_path) -> dict
- enhance_video(input_path, output_path) -> dict
- run_detections(image_bgr) -> list[dict]
"""
from __future__ import annotations

import os
import time
from pathlib import Path
from typing import Any

import cv2
import numpy as np

try:
    from ultralytics import YOLO
    _YOLO_AVAILABLE = True
except ImportError:
    _YOLO_AVAILABLE = False


MODEL_PATH = os.getenv("MODEL_PATH", "yolov8n.pt")
# COCO Perimeter classes: person(0), bicycle(1), car(2), motorcycle(3), bus(5), truck(7), cat(15), dog(16)
DETECTION_CLASSES = [0, 1, 2, 3, 5, 7, 15, 16]


def apply_adaptive_clahe(frame: np.ndarray, base_clip: float | None = None) -> np.ndarray:
    """LAB luminance enhancement from ai_model_source/inference.py.
    Provides gentle luminance normalization without introducing noisy global contrast boosts.
    """
    if frame is None or frame.size == 0:
        return frame
    lab = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB)
    l_channel, a_channel, b_channel = cv2.split(lab)
    if base_clip is not None:
        clip_limit = float(base_clip)
    else:
        brightness = float(np.mean(l_channel))
        # Darker scenes get slightly more lift, bounded to the recommended 1.8–2.5 range.
        clip_limit = float(np.clip(2.5 - brightness / 255.0 * 0.7, 1.8, 2.5))
    clahe = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=(8, 8))
    enhanced = cv2.merge((clahe.apply(l_channel), a_channel, b_channel))
    return cv2.cvtColor(enhanced, cv2.COLOR_LAB2BGR)


def enhance_frame(frame: np.ndarray) -> np.ndarray:
    """Enhances a single frame using the ai_model_source pipeline:
    1. Adaptive CLAHE on LAB luminance
    2. Detail enhancement (sigma_s=5, sigma_r=0.10) for sharpness preservation
    """
    if frame is None or frame.size == 0:
        return frame
    clahe_frame = apply_adaptive_clahe(frame)
    # Detail enhancement from ai_model_source EvidenceWorker
    try:
        sharpened = cv2.detailEnhance(clahe_frame, sigma_s=5, sigma_r=0.10)
        return sharpened
    except Exception:
        return clahe_frame


def enhance_image(input_path: str | Path, output_path: str | Path) -> dict[str, Any]:
    """Enhance still image from input_path and write to output_path.
    Returns status and metrics.
    """
    input_p = Path(input_path)
    output_p = Path(output_path)
    output_p.parent.mkdir(parents=True, exist_ok=True)

    start = time.perf_counter()
    img = cv2.imread(str(input_p))
    if img is None:
        return {"status": "FAILED", "error": f"Could not read input image: {input_path}"}

    enhanced = enhance_frame(img)
    cv2.imwrite(str(output_p), enhanced, [cv2.IMWRITE_JPEG_QUALITY, 95])
    elapsed_ms = round((time.perf_counter() - start) * 1000, 2)

    return {
        "status": "COMPLETE",
        "output_path": str(output_p),
        "processing_time_ms": elapsed_ms,
        "resolution": f"{img.shape[1]}x{img.shape[0]}",
        "file_size_bytes": output_p.stat().st_size if output_p.exists() else 0
    }


def enhance_video(input_path: str | Path, output_path: str | Path) -> dict[str, Any]:
    """Enhance video file frame-by-frame, preserving framerate and timing.
    Extracts frames, applies the enhancement pipeline, and re-encodes to MP4.
    """
    input_p = Path(input_path)
    output_p = Path(output_path)
    output_p.parent.mkdir(parents=True, exist_ok=True)

    start = time.perf_counter()
    cap = cv2.VideoCapture(str(input_p))
    if not cap.isOpened():
        return {"status": "FAILED", "error": f"Could not open video file: {input_path}"}

    fps = cap.get(cv2.CAP_PROP_FPS) or 24.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) or 1280
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) or 720
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 0

    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    out = cv2.VideoWriter(str(output_p), fourcc, fps, (width, height))

    processed_frames = 0
    try:
        while True:
            ret, frame = cap.read()
            if not ret or frame is None:
                break
            enhanced = enhance_frame(frame)
            out.write(enhanced)
            processed_frames += 1
    finally:
        cap.release()
        out.release()

    elapsed_ms = round((time.perf_counter() - start) * 1000, 2)
    duration_sec = round(processed_frames / fps, 1) if fps > 0 else 0

    return {
        "status": "COMPLETE",
        "output_path": str(output_p),
        "processing_time_ms": elapsed_ms,
        "processed_frames": processed_frames,
        "duration_sec": duration_sec,
        "resolution": f"{width}x{height}",
        "file_size_bytes": output_p.stat().st_size if output_p.exists() else 0
    }


class NocturPodAIEngine:
    """Manages AI model loading and object detection inference on enhanced frames."""
    def __init__(self, model_path: str = MODEL_PATH):
        self.model_path = model_path
        self._model = None
        self.is_ready = False
        if _YOLO_AVAILABLE:
            self._load_model()

    def _load_model(self) -> None:
        try:
            self._model = YOLO(self.model_path)
            self.is_ready = True
        except Exception as e:
            print(f"[AI Engine] Notice: YOLO model ({self.model_path}) not loaded immediately: {e}")
            self._model = None
            self.is_ready = False

    def infer(self, image_bgr: np.ndarray, conf: float = 0.30) -> dict[str, Any]:
        """Runs object detection on frame using the genuine classes from ai_model_source."""
        if image_bgr is None or image_bgr.size == 0:
            return {"status": "FAILED", "detections": [], "count": 0}

        # First enhance the frame
        enhanced = enhance_frame(image_bgr)

        if not self.is_ready and _YOLO_AVAILABLE:
            self._load_model()

        if not self.is_ready or self._model is None:
            return {
                "status": "SKIPPED",
                "detections": [],
                "count": 0,
                "enhanced_bgr": enhanced
            }

        try:
            start = time.perf_counter()
            results = self._model(enhanced, conf=conf, classes=DETECTION_CLASSES, verbose=False)[0]
            elapsed_ms = round((time.perf_counter() - start) * 1000, 2)

            detections = []
            for box in results.boxes:
                cls_id = int(box.cls[0])
                name = results.names.get(cls_id, f"class_{cls_id}")
                conf_val = round(float(box.conf[0]), 4)
                xyxy = [round(float(v), 1) for v in box.xyxy[0].tolist()]
                detections.append({
                    "label": name,
                    "confidence": conf_val,
                    "box": xyxy,
                    "x1": xyxy[0],
                    "y1": xyxy[1],
                    "x2": xyxy[2],
                    "y2": xyxy[3]
                })

            annotated_bgr = results.plot()
            return {
                "status": "COMPLETE",
                "detections": detections,
                "count": len(detections),
                "processing_time_ms": elapsed_ms,
                "annotated_bgr": annotated_bgr,
                "enhanced_bgr": enhanced
            }
        except Exception as ex:
            return {
                "status": "FAILED",
                "error": str(ex),
                "detections": [],
                "count": 0,
                "enhanced_bgr": enhanced
            }


# Singleton engine instance
ENGINE = NocturPodAIEngine()
