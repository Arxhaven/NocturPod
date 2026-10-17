#!/usr/bin/env python3
"""Render NocturPod's flowing green animated startup splash in 4K UHD."""
from __future__ import annotations

import base64
import json
import math
import shutil
import subprocess
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
B64_OUTPUT = ROOT / "public" / "nocturpod-intro.mp4.b64"
WIDTH, HEIGHT, FPS, DURATION = 3840, 2160, 30, 3.0
BG_WIDTH, BG_HEIGHT = 640, 360
FONT_CANDIDATES = [
    "/usr/share/fonts/truetype/inter/Inter-Light.ttf",
    "/usr/share/fonts/opentype/inter/InterDisplay-Regular.otf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-ExtraLight.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
]


def require_program(name: str) -> str:
    found = shutil.which(name)
    if not found:
        raise RuntimeError(f"Required executable not found: {name}")
    return found


def find_font() -> str:
    for candidate in FONT_CANDIDATES:
        if Path(candidate).exists():
            return candidate
    raise RuntimeError("No suitable sans-serif font was found on this runner")


def build_wordmark(path: Path) -> None:
    mask = Image.new("L", (WIDTH, HEIGHT), 0)
    draw = ImageDraw.Draw(mask)
    font = ImageFont.truetype(find_font(), 218)
    title = "NocturPod"
    bbox = draw.textbbox((0, 0), title, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    xpos = (WIDTH - tw) // 2 - bbox[0]
    ypos = (HEIGHT - th) // 2 - bbox[1] - 2
    draw.text((xpos, ypos), title, font=font, fill=255)

    glow = mask.filter(ImageFilter.GaussianBlur(18))
    overlay = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    green = Image.new("RGBA", (WIDTH, HEIGHT), (90, 255, 148, 0))
    green.putalpha(glow.point(lambda value: int(value * 0.12)))
    overlay.alpha_composite(green)
    white = Image.new("RGBA", (WIDTH, HEIGHT), (247, 250, 247, 0))
    white.putalpha(mask)
    overlay.alpha_composite(white)
    overlay.save(path, optimize=True)


def background_frame(index: int, xs: np.ndarray, ys: np.ndarray) -> np.ndarray:
    time = index / FPS
    phase = 2 * math.pi * time / DURATION
    cx = 0.29 * math.sin(phase - 0.8)
    cy = -0.12 + 0.15 * math.cos(phase + 0.25)
    xx, yy = xs[None, :], ys[:, None]
    dx, dy = (xx - cx) / 0.78, (yy - cy) / 0.76
    r2 = dx * dx + dy * dy
    bloom = np.exp(-r2 * 1.15).astype(np.float32)
    core = np.exp(-r2 * 4.8).astype(np.float32)
    del dx, dy, r2

    path = (0.19 * np.sin(xx * 2.4 - phase * 1.35)
            + 0.075 * np.sin(xx * 4.4 + phase * 0.92)
            + 0.09 * math.sin(phase - 0.45))
    flow = yy - path
    ribbon = np.exp(-((flow / 0.13) ** 2)).astype(np.float32)
    shoulder = np.exp(-(((flow - 0.24) / 0.32) ** 2)).astype(np.float32)
    del path, flow
    ripple = 0.5 + 0.5 * np.sin(
        xx * 5.1 + yy * 1.65 - phase * 2.4 + 0.6 * np.sin(yy * 2.6 + phase)
    )
    moving = ribbon * (0.30 + 0.70 * ripple)
    del ripple

    teal = 0.5 + 0.5 * math.sin(phase + 0.6)
    lime = 0.5 + 0.5 * math.sin(phase - 1.2)
    pulse = 0.94 + 0.06 * math.sin(phase * 1.3)
    rgb = np.empty((BG_HEIGHT, BG_WIDTH, 3), dtype=np.uint8)
    rgb[:, :, 0] = np.clip(
        1 + bloom * (1 + lime * 2.2) + shoulder * 1.1 + moving * 1.4, 0, 255
    ).astype(np.uint8)
    rgb[:, :, 1] = np.clip(
        3 + bloom * (19 + 4 * pulse) + core * 17
        + ribbon * (16 + 9 * lime) + moving * 15 + shoulder * 3, 0, 255
    ).astype(np.uint8)
    rgb[:, :, 2] = np.clip(
        3 + bloom * (4 + 6 * teal) + core * (1 + 2 * teal)
        + ribbon * (2 + 7 * teal) + moving * 3.5, 0, 255
    ).astype(np.uint8)
    return rgb


def main() -> None:
    ffmpeg, ffprobe = require_program("ffmpeg"), require_program("ffprobe")
    B64_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="nocturpod-animated-4k-") as folder:
        tmp = Path(folder)
        overlay = tmp / "nocturpod-wordmark-4k.png"
        video = tmp / "nocturpod-animated-4k.mp4"
        build_wordmark(overlay)
        xs = np.linspace(-1, 1, BG_WIDTH, dtype=np.float32)
        ys = np.linspace(-1, 1, BG_HEIGHT, dtype=np.float32)
        command = [
            ffmpeg, "-hide_banner", "-loglevel", "error", "-y",
            "-f", "rawvideo", "-pix_fmt", "rgb24",
            "-s:v", f"{BG_WIDTH}x{BG_HEIGHT}", "-r", str(FPS), "-i", "-",
            "-loop", "1", "-framerate", str(FPS), "-i", str(overlay),
            "-filter_complex",
            f"[0:v]scale={WIDTH}:{HEIGHT}:flags=bicubic[bg];"
            "[bg][1:v]overlay=0:0:format=auto,"
            "fade=t=in:st=0:d=0.24,fade=t=out:st=2.72:d=0.28,format=yuv420p[v]",
            "-map", "[v]", "-an", "-t", str(DURATION),
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
            "-profile:v", "high", "-level:v", "5.1",
            "-movflags", "+faststart", "-threads", "4", str(video),
        ]
        process = subprocess.Popen(command, stdin=subprocess.PIPE, stderr=subprocess.PIPE)
        try:
            for index in range(int(FPS * DURATION)):
                frame = background_frame(index, xs, ys)
                process.stdin.write(frame.tobytes())
                del frame
            process.stdin.close()
            error = process.stderr.read().decode("utf-8", "replace")
            code = process.wait()
            if code:
                raise RuntimeError(error or f"ffmpeg failed with exit code {code}")
        except Exception:
            if process.poll() is None:
                process.kill()
            raise

        result = subprocess.run(
            [ffprobe, "-v", "error", "-select_streams", "v:0",
             "-show_entries", "stream=width,height,r_frame_rate,codec_name",
             "-show_entries", "format=duration", "-of", "json", str(video)],
            check=True, capture_output=True, text=True,
        )
        info = json.loads(result.stdout)
        stream, duration = info["streams"][0], float(info["format"]["duration"])
        if (stream["width"], stream["height"]) != (WIDTH, HEIGHT):
            raise RuntimeError(f"Expected 4K UHD, got {stream['width']} x {stream['height']}")
        if stream["codec_name"] != "h264" or stream["r_frame_rate"] != "30/1":
            raise RuntimeError(f"Unexpected video format: {stream}")
        if abs(duration - DURATION) > 0.08:
            raise RuntimeError(f"Expected a 3-second intro, got {duration:.3f}s")
        B64_OUTPUT.write_text(
            base64.b64encode(video.read_bytes()).decode("ascii") + "\n",
            encoding="ascii",
        )
        print(
            f"Verified animated {WIDTH}x{HEIGHT} {FPS} fps H.264 intro, "
            f"{duration:.2f}s, {video.stat().st_size:,} bytes; updated "
            f"{B64_OUTPUT.relative_to(ROOT)}"
        )


