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
import subprocess
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


MODEL_PATH = os.getenv("NOCTURPOD_YOLO_MODEL_PATH", os.getenv("MODEL_PATH", "yolov8n.pt"))
# By default run against all 80 classes in the standard COCO model. Deployments can
# narrow the set with NOCTURPOD_DETECTION_CLASSES="0,2,3,5,7".
_raw_detection_classes = os.getenv("NOCTURPOD_DETECTION_CLASSES", "").strip()
try:
    DETECTION_CLASSES: list[int] | None = (
        [int(value.strip()) for value in _raw_detection_classes.split(",") if value.strip()]
        if _raw_detection_classes else None
    )
except ValueError:
    DETECTION_CLASSES = None



def _transcode_browser_mp4(source_path: Path, output_path: Path) -> None:
    """Encode an MP4 using H.264/yuv420p + faststart for browser playback and seeking."""
    try:
        import imageio_ffmpeg
    except Exception as exc:
        raise RuntimeError(
            "imageio-ffmpeg is required to create browser-compatible H.264 video. "
            f"{type(exc).__name__}: {exc}"
        ) from exc

    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
    command = [
        ffmpeg_exe,
        "-hide_banner", "-loglevel", "error", "-y",
        "-i", str(source_path),
        "-map", "0:v:0",
        "-an",
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "22",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        str(output_path),
    ]
    result = subprocess.run(command, capture_output=True, text=True, check=False)
    if result.returncode != 0 or not output_path.is_file() or output_path.stat().st_size == 0:
        detail = (result.stderr or result.stdout or "no ffmpeg diagnostic").strip()[-1200:]
        output_path.unlink(missing_ok=True)
        raise RuntimeError(f"H.264 encoding failed (exit {result.returncode}): {detail}")


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

    # OpenCV's mp4v output is not reliably playable in web browsers. Write an
    # intermediate file, then re-encode it to H.264/yuv420p with faststart metadata.
    raw_output_p = output_p.with_name(f"{output_p.stem}_opencv_raw.mp4")
    raw_output_p.unlink(missing_ok=True)
    output_p.unlink(missing_ok=True)
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    out = cv2.VideoWriter(str(raw_output_p), fourcc, fps, (output_width, output_height))
    if not out.isOpened():
        cap.release()
        return {"status": "FAILED", "error": "Could not initialize the intermediate 4K video writer."}

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
            raw_output_p.unlink(missing_ok=True)
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

    if processed_frames == 0 or not raw_output_p.exists() or raw_output_p.stat().st_size == 0:
        raw_output_p.unlink(missing_ok=True)
        return {"status": "FAILED", "error": "Video contained no decodable frames."}

    try:
        _transcode_browser_mp4(raw_output_p, output_p)
    except Exception as exc:
        return {
            "status": "FAILED",
            "error": f"Browser-compatible H.264 video encoding failed; original preserved: {type(exc).__name__}: {exc}",
        }
    finally:
        raw_output_p.unlink(missing_ok=True)

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
        "video_codec": "H.264 / AVC (yuv420p, faststart)",
        "browser_playback_compatible": True,
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
    """Loads YOLO lazily and reports real model/inference readiness."""

    def __init__(self, model_path: str = MODEL_PATH):
        self.model_path = model_path
        self._model = None
        self.is_ready = False
        self.last_error: str | None = None
        self.last_inference_status = "CHECKING"
        self.last_inference_count = 0
        self.last_inference_ms: float | None = None
        self.last_inference_source: str | None = None
        if _YOLO_AVAILABLE:
            self._load_model()
        else:
            self.last_error = "Ultralytics is not installed in the backend runtime."

    def _load_model(self) -> None:
        try:
            self._model = YOLO(self.model_path)
            self.is_ready = True
            self.last_error = None
        except Exception as exc:
            self._model = None
            self.is_ready = False
            self.last_error = f"{type(exc).__name__}: {exc}"
            print(f"[AI Engine] YOLO model ({self.model_path}) is unavailable: {self.last_error}")

    def status_payload(self) -> dict[str, Any]:
        """Return truthful detector status for the dashboard and health checks."""
        return {
            "available": bool(self.is_ready and self._model is not None),
            "model": Path(self.model_path).name,
            "class_scope": "all COCO classes" if DETECTION_CLASSES is None else DETECTION_CLASSES,
            "last_inference_status": self.last_inference_status,
            "last_inference_count": self.last_inference_count,
            "last_inference_ms": self.last_inference_ms,
            "last_inference_source": self.last_inference_source,
            "error": self.last_error,
            "note": (
                "Detection confidence is a model score, not verified recognition accuracy. "
                "Low-light, blur, occlusion, and distance can cause missed detections."
            ),
        }

    def infer(
        self,
        image_bgr: np.ndarray,
        conf: float = 0.22,
        already_enhanced: bool = False,
        source: str = "unknown",
    ) -> dict[str, Any]:
        """Detect COCO objects and return both pixel and normalized bounding boxes."""
        if image_bgr is None or image_bgr.size == 0:
            self.last_inference_status = "FAILED"
            self.last_error = "Empty image was supplied to object detection."
            self.last_inference_count = 0
            return {
                "status": "FAILED",
                "error": self.last_error,
                "detections": [],
                "count": 0,
            }

        # The ingestion path passes the already-restored image first. If it contains
        # no candidates, the caller can cheaply retry on the untouched original image.
        enhanced = image_bgr if already_enhanced else enhance_frame(image_bgr)

        if not self.is_ready and _YOLO_AVAILABLE:
            self._load_model()

        if not self.is_ready or self._model is None:
            message = self.last_error or "YOLO model is not ready."
            self.last_inference_status = "UNAVAILABLE"
            self.last_inference_count = 0
            self.last_inference_source = source
            return {
                "status": "UNAVAILABLE",
                "error": message,
                "model": Path(self.model_path).name,
                "detections": [],
                "count": 0,
                "image_dimensions": {"width": int(enhanced.shape[1]), "height": int(enhanced.shape[0])},
                "enhanced_bgr": enhanced,
            }

        try:
            height, width = enhanced.shape[:2]
            gray_for_detection = cv2.cvtColor(enhanced, cv2.COLOR_BGR2GRAY)
            input_mean_luminance = float(np.mean(gray_for_detection))
            if input_mean_luminance < 70.0:
                effective_conf = min(float(conf), 0.12)
                inference_size = 1024
            elif input_mean_luminance < 115.0:
                effective_conf = min(float(conf), 0.15)
                inference_size = 960
            else:
                effective_conf = min(float(conf), 0.20)
                inference_size = 768

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
                names = results.names
                name = names.get(cls_id, f"class_{cls_id}") if isinstance(names, dict) else names[cls_id]
                conf_val = round(float(box.conf[0]), 4)
                xyxy = [float(v) for v in box.xyxy[0].tolist()]
                x1, y1, x2, y2 = xyxy
                # A normalized box is stable across original/enhanced resolutions.
                # The raw box remains available for diagnostics and annotated previews.
                normalized_box = [
                    round(float(np.clip(x1 / max(width, 1), 0.0, 1.0)), 6),
                    round(float(np.clip(y1 / max(height, 1), 0.0, 1.0)), 6),
                    round(float(np.clip(x2 / max(width, 1), 0.0, 1.0)), 6),
                    round(float(np.clip(y2 / max(height, 1), 0.0, 1.0)), 6),
                ]
                detections.append({
                    "label": str(name),
                    "confidence": conf_val,
                    "box": [round(v, 1) for v in xyxy],
                    "normalized_box": normalized_box,
                    "x1": round(x1, 1),
                    "y1": round(y1, 1),
                    "x2": round(x2, 1),
                    "y2": round(y2, 1),
                    "coordinates_normalized": True,
                })

            self.last_inference_status = "COMPLETE"
            self.last_inference_count = len(detections)
            self.last_inference_ms = elapsed_ms
            self.last_inference_source = source
            self.last_error = None
            return {
                "status": "COMPLETE",
                "detections": detections,
                "count": len(detections),
                "model": Path(self.model_path).name,
                "processing_time_ms": elapsed_ms,
                "confidence_threshold_used": effective_conf,
                "inference_size": inference_size,
                "input_mean_luminance": round(input_mean_luminance, 1),
                "image_dimensions": {"width": int(width), "height": int(height)},
                "source": source,
                "annotated_bgr": results.plot(),
                "enhanced_bgr": enhanced,
            }
        except Exception as exc:
            self.last_inference_status = "FAILED"
            self.last_inference_count = 0
            self.last_inference_ms = None
            self.last_inference_source = source
            self.last_error = f"{type(exc).__name__}: {exc}"
            return {
                "status": "FAILED",
                "error": self.last_error,
                "model": Path(self.model_path).name,
                "detections": [],
                "count": 0,
                "image_dimensions": {"width": int(enhanced.shape[1]), "height": int(enhanced.shape[0])},
                "enhanced_bgr": enhanced,
            }



# Singleton engine instance
ENGINE = NocturPodAIEngine()
