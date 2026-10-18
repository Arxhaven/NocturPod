"""Tiled Real-ESRGAN x4 super-resolution for NocturPod captures.

The ONNX export is based on the official Real-ESRGAN general x4v3 weights and
is fetched lazily, verified by SHA-256, and cached outside the repository. This
keeps model binaries out of Git and avoids a PyTorch dependency in Railway.

Input/output arrays use OpenCV BGR uint8. Output upscales to a 3840-pixel long edge
by default, preserving the source aspect ratio. This is learned super-resolution,
not proof that newly reconstructed fine detail is factually present in the scene.
"""
from __future__ import annotations

import hashlib
import os
import tempfile
import threading
import time
import urllib.request
from pathlib import Path
from typing import Any

import cv2
import numpy as np

MODEL_URL = os.getenv(
    "NOCTURPOD_SR_MODEL_URL",
    "https://huggingface.co/CoderViking/realesr-general-x4v3-onnx/resolve/main/realesr-general-x4v3.onnx",
)
MODEL_SHA256 = "1940a93ee08283a0a7286183186357b1688fe9fa8edead95b731f05bece96292"
MODEL_NAME = "Real-ESRGAN general x4v3 (ONNX)"
MODEL_SCALE = 4
TARGET_LONG_EDGE = max(720, int(os.getenv("NOCTURPOD_OUTPUT_LONG_EDGE", "3840")))
TILE_SIZE = max(96, min(512, int(os.getenv("NOCTURPOD_SR_TILE_SIZE", "256"))))
TILE_CONTEXT = 16

_SESSION_LOCK = threading.Lock()
_INFERENCE_LOCK = threading.Lock()
_SESSION: Any = None
_SESSION_ERROR: str | None = None
_SESSION_MODEL_PATH: str | None = None


class SuperResolutionUnavailable(RuntimeError):
    """Raised instead of silently labeling a non-AI resize as a model result."""


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _model_path() -> tuple[Path, bool]:
    custom_path = os.getenv("NOCTURPOD_SR_MODEL_PATH")
    cache_dir = Path(
        os.getenv("NOCTURPOD_MODEL_CACHE_DIR", "/tmp/nocturpod-models")
    )
    path = Path(custom_path).expanduser() if custom_path else cache_dir / "realesr-general-x4v3.onnx"
    return path, bool(custom_path)


def _download_model(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path: Path | None = None
    digest = hashlib.sha256()
    written = 0
    max_bytes = 20 * 1024 * 1024

    try:
        with urllib.request.urlopen(MODEL_URL, timeout=90) as response:
            with tempfile.NamedTemporaryFile(
                prefix="nocturpod-sr-", suffix=".onnx.tmp",
                dir=str(path.parent), delete=False
            ) as temp:
                temp_path = Path(temp.name)
                while True:
                    chunk = response.read(1024 * 1024)
                    if not chunk:
                        break
                    written += len(chunk)
                    if written > max_bytes:
                        raise SuperResolutionUnavailable(
                            f"Super-resolution model exceeded the {max_bytes // (1024 * 1024)} MB safety limit."
                        )
                    digest.update(chunk)
                    temp.write(chunk)

        actual_sha = digest.hexdigest()
        if actual_sha.lower() != MODEL_SHA256.lower():
            raise SuperResolutionUnavailable(
                "Downloaded super-resolution model failed its SHA-256 integrity check."
            )
        if written < 1024 * 1024:
            raise SuperResolutionUnavailable("Downloaded super-resolution model is unexpectedly small.")

        temp_path.replace(path)
        temp_path = None
    except SuperResolutionUnavailable:
        raise
    except Exception as exc:
        raise SuperResolutionUnavailable(
            f"Could not download the Real-ESRGAN model: {type(exc).__name__}: {exc}"
        ) from exc
    finally:
        if temp_path is not None:
            try:
                temp_path.unlink(missing_ok=True)
            except Exception:
                pass


def _get_session() -> tuple[Any, str]:
    global _SESSION, _SESSION_ERROR, _SESSION_MODEL_PATH
    path, custom_path = _model_path()

    with _SESSION_LOCK:
        if _SESSION is not None and _SESSION_MODEL_PATH == str(path):
            return _SESSION, str(path)

        if _SESSION_ERROR and _SESSION_MODEL_PATH == str(path):
            raise SuperResolutionUnavailable(_SESSION_ERROR)

        try:
            import onnxruntime as ort
        except Exception as exc:
            _SESSION_ERROR = (
                "onnxruntime is not installed. Install the backend requirements to enable "
                f"Real-ESRGAN super-resolution ({type(exc).__name__}: {exc})."
            )
            _SESSION_MODEL_PATH = str(path)
            raise SuperResolutionUnavailable(_SESSION_ERROR) from exc

        try:
            if not path.is_file():
                if custom_path:
                    raise SuperResolutionUnavailable(
                        f"NOCTURPOD_SR_MODEL_PATH points to a missing file: {path}"
                    )
                _download_model(path)

            actual_sha = _sha256_file(path)
            if not custom_path and actual_sha.lower() != MODEL_SHA256.lower():
                path.unlink(missing_ok=True)
                _download_model(path)
                actual_sha = _sha256_file(path)
            if custom_path and path.stat().st_size < 1024 * 1024:
                raise SuperResolutionUnavailable("Custom super-resolution ONNX file is unexpectedly small.")

            options = ort.SessionOptions()
            options.intra_op_num_threads = max(
                1, min(4, int(os.getenv("NOCTURPOD_SR_THREADS", "2")))
            )
            options.inter_op_num_threads = 1
            options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL

            session = ort.InferenceSession(
                str(path),
                sess_options=options,
                providers=["CPUExecutionProvider"],
            )
            inputs = session.get_inputs()
            outputs = session.get_outputs()
            if not inputs or not outputs:
                raise SuperResolutionUnavailable("ONNX model has no usable inputs or outputs.")
            _SESSION = session
            _SESSION_MODEL_PATH = str(path)
            _SESSION_ERROR = None
            print(
                f"[SuperResolution] Loaded {MODEL_NAME}; "
                f"model_sha256={actual_sha}; providers={session.get_providers()}"
            )
            return session, actual_sha
        except SuperResolutionUnavailable as exc:
            _SESSION = None
            _SESSION_ERROR = str(exc)
            _SESSION_MODEL_PATH = str(path)
            raise
        except Exception as exc:
            _SESSION = None
            _SESSION_ERROR = f"Could not initialize Real-ESRGAN ONNX session: {type(exc).__name__}: {exc}"
            _SESSION_MODEL_PATH = str(path)
            raise SuperResolutionUnavailable(_SESSION_ERROR) from exc


def target_4k_dimensions(width: int, height: int) -> tuple[int, int]:
    """Preserve aspect ratio and upscale smaller captures to a 3840-pixel long edge."""
    width = max(1, int(width))
    height = max(1, int(height))
    long_edge = max(width, height)
    if long_edge >= TARGET_LONG_EDGE:
        scale = 1.0
    else:
        scale = TARGET_LONG_EDGE / float(long_edge)
    out_width = max(2, int(round(width * scale)))
    out_height = max(2, int(round(height * scale)))
    # H.264/MP4 and some OpenCV writers require even dimensions.
    return out_width - out_width % 2, out_height - out_height % 2


def _run_tile(session: Any, input_name: str, output_name: str, tile_bgr: np.ndarray) -> np.ndarray:
    rgb = cv2.cvtColor(tile_bgr, cv2.COLOR_BGR2RGB)
    tensor = np.transpose(rgb.astype(np.float32) / 255.0, (2, 0, 1))[None, ...]
    prediction = session.run([output_name], {input_name: tensor})[0]
    if prediction.ndim != 4 or prediction.shape[0] != 1 or prediction.shape[1] != 3:
        raise SuperResolutionUnavailable(
            f"Unexpected Real-ESRGAN output tensor shape: {getattr(prediction, 'shape', None)}"
        )
    rgb_out = np.transpose(prediction[0], (1, 2, 0))
    rgb_out = np.clip(rgb_out * 255.0, 0.0, 255.0).astype(np.uint8)
    return cv2.cvtColor(rgb_out, cv2.COLOR_RGB2BGR)


def upscale_to_4k(frame: np.ndarray) -> tuple[np.ndarray, dict[str, Any]]:
    """Run verified learned x4 super-resolution in overlapping tiles, then size to 4K."""
    if frame is None or frame.size == 0:
        raise ValueError("Cannot upscale an empty frame.")
    if frame.ndim != 3 or frame.shape[2] != 3:
        raise ValueError("Real-ESRGAN expects a three-channel BGR image.")

    height, width = frame.shape[:2]
    target_width, target_height = target_4k_dimensions(width, height)
    if max(width, height) >= TARGET_LONG_EDGE:
        return frame.copy(), {
            "upscaler": "Not required — input already meets 4K long-edge target",
            "model_sha256": None,
            "resolution_before": f"{width}x{height}",
            "resolution_after": f"{width}x{height}",
            "output_target": f"{target_width}x{target_height}",
            "upscale_factor_effective": round(max(target_width / width, target_height / height), 2),
            "super_resolution_used": False,
        }

    session, model_hash = _get_session()
    inputs = session.get_inputs()
    outputs = session.get_outputs()
    input_name = inputs[0].name
    output_name = outputs[0].name

    out_x4 = np.empty((height * MODEL_SCALE, width * MODEL_SCALE, 3), dtype=np.uint8)
    tile_size = TILE_SIZE
    context = TILE_CONTEXT
    started = time.perf_counter()

    # Serialize SR runs so three simultaneous capture jobs cannot oversubscribe CPU
    # or allocate several 4K/8K output tensors at the same time.
    with _INFERENCE_LOCK:
        for y in range(0, height, tile_size):
            core_height = min(tile_size, height - y)
            y0 = max(0, y - context)
            y1 = min(height, y + core_height + context)
            for x in range(0, width, tile_size):
                core_width = min(tile_size, width - x)
                x0 = max(0, x - context)
                x1 = min(width, x + core_width + context)
                tile = frame[y0:y1, x0:x1]
                tile_out = _run_tile(session, input_name, output_name, tile)

                crop_y0 = (y - y0) * MODEL_SCALE
                crop_x0 = (x - x0) * MODEL_SCALE
                crop_y1 = crop_y0 + core_height * MODEL_SCALE
                crop_x1 = crop_x0 + core_width * MODEL_SCALE
                core = tile_out[crop_y0:crop_y1, crop_x0:crop_x1]
                expected = (core_height * MODEL_SCALE, core_width * MODEL_SCALE)
                if core.shape[:2] != expected:
                    raise SuperResolutionUnavailable(
                        f"Model tile returned {core.shape[1]}x{core.shape[0]}, expected "
                        f"{expected[1]}x{expected[0]}."
                    )
                out_y = y * MODEL_SCALE
                out_x = x * MODEL_SCALE
                out_x4[out_y:out_y + expected[0], out_x:out_x + expected[1]] = core

    x4_height, x4_width = out_x4.shape[:2]
    if (x4_width, x4_height) != (target_width, target_height):
        interpolation = cv2.INTER_AREA if target_width < x4_width else cv2.INTER_LANCZOS4
        result = cv2.resize(out_x4, (target_width, target_height), interpolation=interpolation)
    else:
        result = out_x4

    return result, {
        "upscaler": MODEL_NAME,
        "model_sha256": model_hash,
        "resolution_before": f"{width}x{height}",
        "resolution_after_model": f"{x4_width}x{x4_height}",
        "output_target": f"{target_width}x{target_height}",
        "upscale_factor_effective": round(max(target_width / width, target_height / height), 2),
        "super_resolution_used": True,
        "inference_time_ms": round((time.perf_counter() - started) * 1000, 1),
        "tile_size": tile_size,
        "tile_context": context,
    }


def clear_cached_session_error() -> None:
    """Allow an operator to retry a previous transient download/initialization failure."""
    global _SESSION_ERROR, _SESSION_MODEL_PATH
    with _SESSION_LOCK:
        _SESSION_ERROR = None
        _SESSION_MODEL_PATH = None


def get_super_resolution_status() -> dict[str, Any]:
    """Report model state without forcing a network download during a health check."""
    path, custom_path = _model_path()
    with _SESSION_LOCK:
        loaded = _SESSION is not None and _SESSION_MODEL_PATH == str(path)
        error = _SESSION_ERROR if _SESSION_MODEL_PATH == str(path) else None
    file_sha = None
    if path.is_file():
        try:
            file_sha = _sha256_file(path)
        except Exception:
            file_sha = None
    return {
        "model": MODEL_NAME,
        "runtime": "ONNX Runtime CPU",
        "state": "READY" if loaded else ("FAILED" if error else "NOT_LOADED"),
        "loaded": loaded,
        "model_file_present": path.is_file(),
        "custom_model_path_configured": custom_path,
        "model_sha256": file_sha,
        "target_long_edge": TARGET_LONG_EDGE,
        "tile_size": TILE_SIZE,
        "error": error,
    }
