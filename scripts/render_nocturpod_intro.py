#!/usr/bin/env python3
"""Render the NocturPod startup splash as native 4K UHD H.264 and update the build source."""
from __future__ import annotations

import base64
import json
import math
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
B64_OUTPUT = ROOT / "public" / "nocturpod-intro.mp4.b64"
WIDTH, HEIGHT, FPS, DURATION = 3840, 2160, 30, 3.0


def require_program(name: str) -> str:
    found = shutil.which(name)
    if not found:
        raise RuntimeError(f"Required executable not found: {name}")
    return found


def find_font() -> str:
    candidates = [
        "/usr/share/fonts/truetype/inter/Inter-Light.ttf",
        "/usr/share/fonts/opentype/inter/InterDisplay-Regular.otf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-ExtraLight.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
    for candidate in candidates:
        if Path(candidate).exists():
            return candidate
    raise RuntimeError("No suitable sans-serif font was found on this runner")


def render_frame(path: Path) -> None:
    # Build a true 3840 x 2160 radial field; no upscaling from the old 960 x 540 clip.
    y = ((np.arange(HEIGHT, dtype=np.float32)[:, None] - HEIGHT * 0.49) / (HEIGHT * 0.55)) ** 2
    x = ((np.arange(WIDTH, dtype=np.float32)[None, :] - WIDTH * 0.51) / (WIDTH * 0.56)) ** 2
    r2 = x + y
    del x, y

    broad = np.exp(-r2 / 0.42)
    core = np.exp(-r2 / 0.085)
    ring = np.exp(-((np.sqrt(r2) - 0.7) / 0.34) ** 2)

    rgb = np.empty((HEIGHT, WIDTH, 3), dtype=np.uint8)
    rgb[:, :, 0] = 1
    rgb[:, :, 1] = np.clip(3.0 + 20.0 * broad + 10.0 * core + ring, 0, 255).astype(np.uint8)
    rgb[:, :, 2] = np.clip(2.0 + 5.0 * broad + 1.6 * core, 0, 255).astype(np.uint8)
    del broad, core, ring, r2

    image = Image.fromarray(rgb, "RGB")
    del rgb
    font = ImageFont.truetype(find_font(), 218)
    draw = ImageDraw.Draw(image)
    title = "NocturPod"
    bbox = draw.textbbox((0, 0), title, font=font)
    title_width, title_height = bbox[2] - bbox[0], bbox[3] - bbox[1]
    x_pos = (WIDTH - title_width) // 2 - bbox[0]
    y_pos = (HEIGHT - title_height) // 2 - bbox[1] - 2
    draw.text((x_pos, y_pos), title, font=font, fill=(247, 250, 247), stroke_width=0)
    image.save(path, format="PNG", compress_level=1)


def main() -> None:
    ffmpeg = require_program("ffmpeg")
    ffprobe = require_program("ffprobe")
    B64_OUTPUT.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="nocturpod-4k-") as temp_dir:
        temp = Path(temp_dir)
        frame = temp / "nocturpod-startup-4k.png"
        video = temp / "nocturpod-startup-4k.mp4"
        render_frame(frame)

        command = [
            ffmpeg, "-hide_banner", "-loglevel", "error", "-y",
            "-loop", "1", "-framerate", str(FPS), "-i", str(frame),
            "-t", str(DURATION),
            "-vf", "fade=t=in:st=0:d=0.24,fade=t=out:st=2.72:d=0.28,format=yuv420p",
            "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
            "-profile:v", "high", "-level:v", "5.1",
            "-movflags", "+faststart", "-threads", "2", str(video),
        ]
        subprocess.run(command, check=True)

        probe = subprocess.run(
            [ffprobe, "-v", "error", "-select_streams", "v:0",
             "-show_entries", "stream=width,height,r_frame_rate,codec_name",
             "-show_entries", "format=duration", "-of", "json", str(video)],
            check=True, capture_output=True, text=True,
        )
        info = json.loads(probe.stdout)
        stream = info["streams"][0]
        duration = float(info["format"]["duration"])
        if (stream["width"], stream["height"]) != (WIDTH, HEIGHT):
            raise RuntimeError(f"Expected 4K UHD, got {stream['width']} x {stream['height']}")
        if stream["codec_name"] != "h264" or stream["r_frame_rate"] != "30/1":
            raise RuntimeError(f"Unexpected video format: {stream}")
        if abs(duration - DURATION) > 0.08:
            raise RuntimeError(f"Expected a 3-second intro, got {duration:.3f}s")

        encoded = base64.b64encode(video.read_bytes()).decode("ascii")
        B64_OUTPUT.write_text(encoded + "\n", encoding="ascii")
        print(
            f"Verified {WIDTH}x{HEIGHT} {FPS} fps H.264 intro, "
            f"{duration:.2f}s, {video.stat().st_size:,} bytes; updated {B64_OUTPUT.relative_to(ROOT)}"
        )


if __name__ == "__main__":
    main()
