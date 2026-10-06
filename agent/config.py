"""NocturPod Edge Device Agent Configuration."""
from __future__ import annotations

import os
from pathlib import Path

# Backend connection settings
BACKEND_URL = os.getenv("NOCTURPOD_BACKEND_URL", "http://127.0.0.1:5000").rstrip("/")
DEVICE_ID = os.getenv("NOCTURPOD_DEVICE_ID", "nocturpod-edge-01")
DEVICE_NAME = os.getenv("NOCTURPOD_DEVICE_NAME", "NocturPod Alpha-1")
DEVICE_TOKEN = os.getenv("NOCTURPOD_DEVICE_TOKEN", "nocturpod-sec-key-replace-with-secure-token")

# Local media storage paths (on Raspberry Pi)
MEDIA_BASE_DIR = Path(os.getenv("NOCTURPOD_MEDIA_DIR", Path.home() / "nocturpod" / "media"))
ORIGINAL_IMAGES_DIR = MEDIA_BASE_DIR / "original" / "images"
ORIGINAL_VIDEOS_DIR = MEDIA_BASE_DIR / "original" / "videos"
ENHANCED_IMAGES_DIR = MEDIA_BASE_DIR / "enhanced" / "images"
ENHANCED_VIDEOS_DIR = MEDIA_BASE_DIR / "enhanced" / "videos"
PROCESSING_DIR = MEDIA_BASE_DIR / "processing"

# Ensure all local directories exist
for p in [ORIGINAL_IMAGES_DIR, ORIGINAL_VIDEOS_DIR, ENHANCED_IMAGES_DIR, ENHANCED_VIDEOS_DIR, PROCESSING_DIR]:
    p.mkdir(parents=True, exist_ok=True)

# Hardware camera settings
CAMERA_INDEX = int(os.getenv("NOCTURPOD_CAMERA_INDEX", "0"))
STREAM_WIDTH = int(os.getenv("STREAM_WIDTH", "1280"))
STREAM_HEIGHT = int(os.getenv("STREAM_HEIGHT", "720"))
STREAM_FPS = int(os.getenv("STREAM_FPS", "15"))

# Intervals (seconds)
HEARTBEAT_INTERVAL = 3.0
COMMAND_POLL_INTERVAL = 1.2
STREAM_FRAME_INTERVAL = 1.0 / STREAM_FPS
