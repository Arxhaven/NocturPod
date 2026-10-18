"""NocturPod learned low-light restoration, 4K super-resolution, and object detection.
Uses tiled Real-ESRGAN general x4v3 ONNX for restoration/upscaling, conservative
low-light tone normalization, and YOLOv8 perimeter security detection.

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

from backend.super_resolution import (
    SuperResolutionUnavailable,
    target_4k_dimensions,
    upscale_to_4k,
)

try:
    from ultralytics import YOLO
    _YOLO_AVAILABLE = True
except ImportError:
    _YOLO_AVAILABLE = False


MODEL_PATH = os.getenv("MODEL_PATH", "yolov8n.pt")
# COCO Perimeter classes: person(0), bicycle(1), car(2), motorcycle(3), bus(5), truck(7), cat(15), dog(16)
DETECTION_CLASSES = [0, 1, 2, 3, 5, 7, 15, 16]


def _has_ir_color_cast(frame: np.ndarray) -> bool:
    """Detect a strong red/purple cast in a dark frame, commonly caused by IR illumination.

    This is a conservative heuristic: it only normalizes colour when luminance is low,
    saturation is high, and red or magenta channels dominate green across the frame.
    It does not modify the ORIGINAL asset or change the physical LED wavelength.
    """
    if frame is None or frame.size == 0 or frame.ndim != 3 or frame.shape[2] < 3:
        return False
    try:
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        mean_luminance = float(np.mean(gray))
        if mean_luminance >= 145.0:
            return False
        hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
        mean_saturation = float(np.mean(hsv[:, :, 1]))
        if mean_saturation < 32.0:
            return False
        b_mean, g_mean, r_mean = [float(v) for v in cv2.mean(frame)[:3]]
        red_cast = r_mean > max(g_mean * 1.13, g_mean + 10.0) and r_mean > b_mean * 1.03
        magenta_cast = (
            r_mean > max(g_mean * 1.10, g_mean + 8.0)
            and b_mean > max(g_mean * 1.10, g_mean + 8.0)
        )
        return bool(red_cast or magenta_cast)
    except Exception:
        return False


def apply_adaptive_clahe(frame: np.ndarray, base_clip: float | None = None) -> np.ndarray:
    """Legacy utility retained for comparison; not the active production enhancement path.

    It denoises low-light luminance/chroma, then applies noise-aware CLAHE in LAB.

    Very dark, grainy IR frames must not receive the strongest contrast boost:
    that amplifies sensor speckles and makes people less recognizable.
    """
    if frame is None or frame.size == 0:
        return frame

    # IR illumination may produce saturated red/purple imagery with unusable colour
    # information. Preserve the original file; normalize only the ENHANCED output to
    # grayscale in these dark, strongly colour-biased scenes.
    if _has_ir_color_cast(frame):
        frame = cv2.cvtColor(cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY), cv2.COLOR_GRAY2BGR)

    lab = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB)
    l_channel, a_channel, b_channel = cv2.split(lab)

    # A light, edge-preserving luminance denoise plus a 3x3 chroma median suppresses
    # the red/purple sensor speckles visible in the provided gallery screenshot.
    raw_luma = float(np.mean(l_channel))
    # Use stronger denoising only for very dark captures, where sensor grain would
    # otherwise be exaggerated by local contrast. Keep brighter scenes sharper.
    denoise_strength = 7.0 if raw_luma < 55 else (5.5 if raw_luma < 100 else 3.5)
    l_denoised = cv2.fastNlMeansDenoising(
        l_channel, None, h=denoise_strength, templateWindowSize=7, searchWindowSize=15
    )
    a_denoised = cv2.medianBlur(a_channel, 3)
    b_denoised = cv2.medianBlur(b_channel, 3)

    mean_luma = float(np.mean(l_denoised))
    residual = cv2.absdiff(l_denoised, cv2.medianBlur(l_denoised, 3))
    noise_estimate = float(np.median(residual))
    if base_clip is not None:
        clip_limit = float(base_clip)
    else:
        # Use less local contrast for noisier frames so noise is not mistaken for detail.
        clip_limit = float(np.clip(2.0 - noise_estimate * 0.07, 1.2, 2.0))
        if mean_luma < 55:
            clip_limit = min(2.05, clip_limit + 0.12)

    clahe = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=(8, 8))
    enhanced_luma = clahe.apply(l_denoised)

    # Mild luminance-only sharpening preserves edges without sharpening chroma noise.
    sigma = 0.8
    blurred = cv2.GaussianBlur(enhanced_luma, (0, 0), sigmaX=sigma)
    sharpen_amount = float(np.clip(0.16 - noise_estimate * 0.004, 0.06, 0.16))
    sharpened_luma = cv2.addWeighted(
        enhanced_luma, 1.0 + sharpen_amount, blurred, -sharpen_amount, 0
    )
    enhanced = cv2.merge((sharpened_luma, a_denoised, b_denoised))
    return cv2.cvtColor(enhanced, cv2.COLOR_LAB2BGR)


def measure_visibility_index(frame: np.ndarray) -> dict[str, float]:
    """Return an explainable image-quality proxy, not a recognition accuracy metric."""
    if frame is None or frame.size == 0:
        return {
            "visibility_index": 0.0,
            "mean_luminance": 0.0,
            "contrast": 0.0,
            "detail": 0.0,
            "noise_estimate": 0.0,
            "clipped_pixels_pct": 0.0,
        }
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY) if frame.ndim == 3 else frame
    smooth = cv2.medianBlur(gray, 3) if min(gray.shape[:2]) >= 3 else gray
    mean_luma = float(np.mean(smooth))
    contrast = float(np.std(smooth))
    residual = cv2.absdiff(gray, smooth)
    noise = float(np.median(residual))
    lap_var = float(cv2.Laplacian(smooth, cv2.CV_32F).var())
    clipped = float(np.mean((gray <= 5) | (gray >= 250)) * 100.0)

    exposure_score = max(0.0, 100.0 - abs(mean_luma - 88.0) * 1.1)
    contrast_score = min(100.0, contrast * 1.7)
    detail_score = min(100.0, float(np.sqrt(max(0.0, lap_var))) * 3.0)
    noise_score = max(0.0, 100.0 - noise * 4.0)
    clipping_score = max(0.0, 100.0 - clipped * 3.0)
    score = (
        0.30 * exposure_score
        + 0.20 * contrast_score
        + 0.20 * detail_score
        + 0.20 * noise_score
        + 0.10 * clipping_score
    )
    return {
        "visibility_index": round(float(np.clip(score, 0.0, 100.0)), 1),
        "mean_luminance": round(mean_luma, 1),
        "contrast": round(contrast, 1),
        "detail": round(detail_score, 1),
        "noise_estimate": round(noise, 1),
        "clipped_pixels_pct": round(clipped, 2),
    }


def _compare_visibility(original: np.ndarray, enhanced: np.ndarray) -> dict[str, Any]:
    """Compare at source dimensions; resolution changes alone must not inflate scores."""
    if original is None or original.size == 0 or enhanced is None or enhanced.size == 0:
        raise ValueError("Cannot compare empty source/enhanced frames.")
    source_h, source_w = original.shape[:2]
    if enhanced.shape[:2] != (source_h, source_w):
        comparable = cv2.resize(enhanced, (source_w, source_h), interpolation=cv2.INTER_AREA)
    else:
        comparable = enhanced

    before = measure_visibility_index(original)
    after = measure_visibility_index(comparable)
    before_index = before["visibility_index"]
    after_index = after["visibility_index"]
    relative_change = round(((after_index - before_index) / max(before_index, 1.0)) * 100.0, 1)
    return {
        "metric_type": "heuristic_visibility_index_not_accuracy",
        "before": before,
        "after": after,
        "relative_change_pct": relative_change,
        "explanation": (
            "Visibility Index is a heuristic based on exposure, contrast, edge detail, "
            "noise and clipping, measured after resizing the enhanced output back to source "
            "dimensions. It is not a percentage of AI accuracy or proof that a person is recognizable."
        ),
    }


def _prepare_low_light_frame(frame: np.ndarray) -> tuple[np.ndarray, bool, float]:
    """Normalize strong IR colour casts and gently lift very dark input shadows."""
    ir_cast_detected = _has_ir_color_cast(frame)
    prepared = frame
    if ir_cast_detected:
        # Keep the original untouched; only the enhanced copy is normalized.
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        prepared = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)

    gray_pre = cv2.cvtColor(prepared, cv2.COLOR_BGR2GRAY)
    mean_luminance = float(np.mean(gray_pre))
    # A restrained gamma lift helps the SR model see shadow detail without the heavy
    # local-contrast boost that previously made sensor noise dominate the person.
    gamma = 0.86 if mean_luminance < 55.0 else (0.92 if mean_luminance < 90.0 else 1.0)
    if gamma != 1.0:
        lut = np.array(
            [np.clip(((index / 255.0) ** gamma) * 255.0, 0, 255) for index in range(256)],
            dtype=np.uint8,
        )
        prepared = cv2.LUT(prepared, lut)
    return prepared, ir_cast_detected, gamma


def enhance_frame_with_details(frame: np.ndarray) -> tuple[np.ndarray, dict[str, Any]]:
    """Restore and upscale a BGR frame using Real-ESRGAN; output targets a 4K long edge."""
    if frame is None or frame.size == 0:
        raise ValueError("Cannot enhance an empty frame.")
    prepared, ir_cast_detected, gamma = _prepare_low_light_frame(frame)

    # Do not silently substitute CLAHE/Lanczos and call it AI super-resolution if
    # the learned model is unavailable. The calling pipeline records a failed job
    # while preserving the uploaded ORIGINAL for retry.
    enhanced, upscale_details = upscale_to_4k(prepared)
    source_h, source_w = frame.shape[:2]
    output_h, output_w = enhanced.shape[:2]
    expected_w, expected_h = target_4k_dimensions(source_w, source_h)
    if (output_w, output_h) != (expected_w, expected_h):
        raise SuperResolutionUnavailable(
            f"Super-resolution output was {output_w}x{output_h}; expected {expected_w}x{expected_h}."
        )

    details = {
        **upscale_details,
        "enhancement_mode": "NOCTURPOD_REAL_ESRGAN_4K_V3",
        "ir_color_cast_detected": ir_cast_detected,
        "ir_color_cast_normalized": ir_cast_detected,
        "shadow_gamma": gamma,
        "resolution_before": f"{source_w}x{source_h}",
        "resolution_after": f"{output_w}x{output_h}",
        "explanation": (
            "Real-ESRGAN x4 learned restoration/upscaling plus a restrained shadow lift. "
            "The output is sized to a 3840-pixel long edge (4K UHD for 16:9 sources). "
            "The learned model may infer plausible texture; it cannot guarantee that newly "
            "generated facial or object detail is factually accurate."
        ),
    }
    return enhanced, details


def enhance_frame(frame: np.ndarray) -> np.ndarray:
    """Return a learned super-resolved frame; never silently fall back to contrast-only output."""
    enhanced, _details = enhance_frame_with_details(frame)
    return enhanced


def _quality_metrics_for_output(
    original: np.ndarray,
    enhanced: np.ndarray,
    details: dict[str, Any],
) -> dict[str, Any]:
    metrics = _compare_visibility(original, enhanced)
    metrics.update({
        "enhancement_mode": details.get("enhancement_mode", "NOCTURPOD_REAL_ESRGAN_4K_V3"),
        "upscaler": details.get("upscaler"),
        "model_sha256": details.get("model_sha256"),
        "resolution_before": details.get("resolution_before"),
        "resolution_after": details.get("resolution_after") or details.get("output_target"),
        "upscale_factor_effective": details.get("upscale_factor_effective"),
        "super_resolution_used": bool(details.get("super_resolution_used")),
        "ir_color_cast_detected": bool(details.get("ir_color_cast_detected")),
        "ir_color_cast_normalized": bool(details.get("ir_color_cast_normalized")),
        "shadow_gamma": details.get("shadow_gamma", 1.0),
        "explanation": details.get("explanation", metrics["explanation"]),
    })
    return metrics


def enhance_image(input_path: str | Path, output_path: str | Path) -> dict[str, Any]:
    """Enhance a still image with Real-ESRGAN and write a separate 4K-target output."""
    input_p = Path(input_path)
    output_p = Path(output_path)
    output_p.parent.mkdir(parents=True, exist_ok=True)

    start = time.perf_counter()
    img = cv2.imread(str(input_p), cv2.IMREAD_COLOR)
    if img is None:
        return {"status": "FAILED", "error": f"Could not read input image: {input_path}"}

    try:
        enhanced, details = enhance_frame_with_details(img)
    except Exception as exc:
        return {
            "status": "FAILED",
            "error": f"Real-ESRGAN enhancement failed; original preserved: {type(exc).__name__}: {exc}",
        }

    write_ok = cv2.imwrite(str(output_p), enhanced, [cv2.IMWRITE_JPEG_QUALITY, 95])
    elapsed_ms = round((time.perf_counter() - start) * 1000, 2)
    if not write_ok:
        return {"status": "FAILED", "error": f"Could not write enhanced image: {output_p}"}

    output_h, output_w = enhanced.shape[:2]
    return {
        "status": "COMPLETE",
        "output_path": str(output_p),
        "processing_time_ms": elapsed_ms,
        "resolution_before": f"{img.shape[1]}x{img.shape[0]}",
        "resolution": f"{output_w}x{output_h}",
        "file_size_bytes": output_p.stat().st_size if output_p.exists() else 0,
        "quality_metrics": _quality_metrics_for_output(img, enhanced, details),
    }


def enhance_video(input_path: str | Path, output_path: str | Path) -> dict[str, Any]:
    """Apply the learned restoration model to each video frame and encode at 4K target size."""
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
    output_width, output_height = target_4k_dimensions(width, height)

    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    out = cv2.VideoWriter(str(output_p), fourcc, fps, (output_width, output_height))
    if not out.isOpened():
        cap.release()
        return {"status": "FAILED", "error": "Could not initialize 4K video writer."}

    processed_frames = 0
    quality_before: list[dict[str, float]] = []
    quality_after: list[dict[str, float]] = []
    ir_cast_sample_count = 0
    sample_interval = max(1, int(round(fps * 2.0)))
    last_details: dict[str, Any] = {}
    try:
        while True:
            ret, frame = cap.read()
            if not ret or frame is None:
                break
            enhanced, details = enhance_frame_with_details(frame)
            last_details = details
            if enhanced.shape[1] != output_width or enhanced.shape[0] != output_height:
                enhanced = cv2.resize(enhanced, (output_width, output_height), interpolation=cv2.INTER_AREA)
            out.write(enhanced)

            if processed_frames % sample_interval == 0:
                quality_before.append(measure_visibility_index(frame))
                source_sized_enhanced = cv2.resize(
                    enhanced, (frame.shape[1], frame.shape[0]), interpolation=cv2.INTER_AREA
                )
                quality_after.append(measure_visibility_index(source_sized_enhanced))
                if details.get("ir_color_cast_detected"):
                    ir_cast_sample_count += 1
            processed_frames += 1
    except Exception as exc:
        cap.release()
        out.release()
        try:
            output_p.unlink(missing_ok=True)
        except Exception:
            pass
        return {
            "status": "FAILED",
            "error": f"Real-ESRGAN video enhancement failed; original preserved: {type(exc).__name__}: {exc}",
        }
    finally:
        cap.release()
        out.release()

    elapsed_ms = round((time.perf_counter() - start) * 1000, 2)
    duration_sec = round(processed_frames / fps, 1) if fps > 0 else 0

    if processed_frames == 0 or not output_p.exists() or output_p.stat().st_size == 0:
        return {"status": "FAILED", "error": "Video contained no decodable frames."}

    def average_metrics(samples: list[dict[str, float]]) -> dict[str, float]:
        if not samples:
            return {}
        keys = samples[0].keys()
        return {key: round(float(np.mean([sample[key] for sample in samples])), 1) for key in keys}

    before_metrics = average_metrics(quality_before)
    after_metrics = average_metrics(quality_after)
    before_index = before_metrics.get("visibility_index", 0.0)
    after_index = after_metrics.get("visibility_index", 0.0)
    quality_metrics = {
        "metric_type": "heuristic_visibility_index_not_accuracy",
        "enhancement_mode": "NOCTURPOD_REAL_ESRGAN_4K_V3",
        "upscaler": last_details.get("upscaler"),
        "model_sha256": last_details.get("model_sha256"),
        "resolution_before": f"{width}x{height}",
        "resolution_after": f"{output_width}x{output_height}",
        "upscale_factor_effective": last_details.get("upscale_factor_effective"),
        "super_resolution_used": bool(last_details.get("super_resolution_used")),
        "shadow_gamma": last_details.get("shadow_gamma", 1.0),
        "sample_interval_seconds": 2,
        "sample_count": len(quality_before),
        "ir_cast_sample_count": ir_cast_sample_count,
        "ir_cast_sample_pct": round((ir_cast_sample_count / max(len(quality_before), 1)) * 100.0, 1),
        "ir_color_cast_detected": ir_cast_sample_count > 0,
        "ir_color_cast_normalized": ir_cast_sample_count > 0,
        "before": before_metrics,
        "after": after_metrics,
        "relative_change_pct": round(((after_index - before_index) / max(before_index, 1.0)) * 100.0, 1),
        "explanation": (
            "Visibility Index before/after is measured at the source frame dimensions. "
            "The video output is upscaled to a 3840-pixel long edge. The percentage is a change "
            "in a heuristic image-quality index, not object-recognition accuracy. Real-ESRGAN "
            "can infer plausible detail but cannot guarantee that generated detail is factual."
        ),
    }

    return {
        "status": "COMPLETE",
        "output_path": str(output_p),
        "processing_time_ms": elapsed_ms,
        "processed_frames": processed_frames,
        "duration_sec": duration_sec,
        "resolution_before": f"{width}x{height}",
        "resolution": f"{output_width}x{output_height}",
        "file_size_bytes": output_p.stat().st_size,
        "quality_metrics": quality_metrics,
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

    def infer(self, image_bgr: np.ndarray, conf: float = 0.22, already_enhanced: bool = False) -> dict[str, Any]:
        """Runs object detection on frame using the genuine classes from ai_model_source."""
        if image_bgr is None or image_bgr.size == 0:
            return {"status": "FAILED", "detections": [], "count": 0}

        # Avoid enhancing the same image twice in the ingestion pipeline.
        enhanced = image_bgr if already_enhanced else enhance_frame(image_bgr)

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
            # Low-light imagery needs a slightly more permissive detector threshold and
            # larger inference size to improve recall for people at a distance. The
            # returned confidence is still a model score, not a verified accuracy rate.
            gray_for_detection = cv2.cvtColor(enhanced, cv2.COLOR_BGR2GRAY)
            input_mean_luminance = float(np.mean(gray_for_detection))
            if input_mean_luminance < 70.0:
                effective_conf = min(float(conf), 0.15)
                inference_size = 832
            elif input_mean_luminance < 115.0:
                effective_conf = min(float(conf), 0.18)
                inference_size = 768
            else:
                effective_conf = float(conf)
                inference_size = 640

            start = time.perf_counter()
            results = self._model(
                enhanced,
                conf=effective_conf,
                classes=DETECTION_CLASSES,
                imgsz=inference_size,
                verbose=False,
            )[0]
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
                "confidence_threshold_used": effective_conf,
                "inference_size": inference_size,
                "input_mean_luminance": round(input_mean_luminance, 1),
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
