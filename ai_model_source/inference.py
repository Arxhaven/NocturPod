"""Live/video aerial detection with adaptive CLAHE and async evidence logging."""
from __future__ import annotations

import argparse
import json
import queue
import sqlite3
import threading
import time
import uuid
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import cv2
import numpy as np
from ultralytics import YOLO

CONF_LOW = 0.30
CONF_HIGH = 0.65


@dataclass(frozen=True)
class Telemetry:
    latitude: float | None = None
    longitude: float | None = None
    relative_altitude_m: float | None = None
    yaw_deg: float | None = None
    pitch_deg: float | None = None


class TelemetryReader:
    """Reads a local JSON snapshot written by a MAVLink bridge or GCS process."""
    def __init__(self, snapshot_path: Path | None):
        self.snapshot_path = snapshot_path

    def read(self) -> Telemetry:
        if not self.snapshot_path or not self.snapshot_path.exists():
            return Telemetry()
        try:
            values = json.loads(self.snapshot_path.read_text(encoding="utf-8"))
            allowed = {key: values.get(key) for key in Telemetry.__annotations__}
            return Telemetry(**allowed)
        except (OSError, ValueError, TypeError):
            return Telemetry()


def apply_adaptive_clahe(frame: np.ndarray) -> np.ndarray:
    """Gentle LAB-luminance enhancement; avoids noisy global contrast boosts."""
    lab = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB)
    l_channel, a_channel, b_channel = cv2.split(lab)
    brightness = float(np.mean(l_channel))
    # Darker scenes get slightly more lift, bounded to the recommended 1.8–2.5 range.
    clip_limit = float(np.clip(2.5 - brightness / 255.0 * 0.7, 1.8, 2.5))
    clahe = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=(8, 8))
    enhanced = cv2.merge((clahe.apply(l_channel), a_channel, b_channel))
    return cv2.cvtColor(enhanced, cv2.COLOR_LAB2BGR)


class EvidenceWorker:
    def __init__(self, evidence_dir: Path, database_path: Path) -> None:
        self.evidence_dir, self.database_path = evidence_dir, database_path
        self.queue: queue.Queue[tuple[np.ndarray, dict[str, Any]] | None] = queue.Queue(maxsize=50)
        self.evidence_dir.mkdir(parents=True, exist_ok=True)
        self.thread = threading.Thread(target=self._run, name="evidence-writer", daemon=True)
        self.thread.start()

    def submit(self, crop: np.ndarray, metadata: dict[str, Any]) -> bool:
        try:
            self.queue.put_nowait((crop.copy(), metadata))
            return True
        except queue.Full:
            return False  # Preserve live inference over evidence completeness under load.

    def close(self) -> None:
        self.queue.put(None)
        self.thread.join(timeout=10)

    def _run(self) -> None:
        connection = sqlite3.connect(self.database_path)
        connection.execute("""CREATE TABLE IF NOT EXISTS detections (
            event_id TEXT PRIMARY KEY, captured_at_us INTEGER, status TEXT,
            class_id INTEGER, class_name TEXT, confidence REAL, image_path TEXT,
            x1 INTEGER, y1 INTEGER, x2 INTEGER, y2 INTEGER,
            latitude REAL, longitude REAL, relative_altitude_m REAL, yaw_deg REAL, pitch_deg REAL
        )""")
        while (task := self.queue.get()) is not None:
            crop, metadata = task
            event_id = uuid.uuid4().hex
            image_path = self.evidence_dir / f"{metadata['captured_at_us']}_{event_id}.jpg"
            # Lightweight sharpening is intentionally used instead of full-frame SR.
            sharpened = cv2.detailEnhance(crop, sigma_s=5, sigma_r=0.10)
            cv2.imwrite(str(image_path), sharpened, [cv2.IMWRITE_JPEG_QUALITY, 92])
            row = {**metadata, "event_id": event_id, "image_path": str(image_path)}
            columns = ", ".join(row)
            placeholders = ", ".join("?" for _ in row)
            connection.execute(f"INSERT INTO detections ({columns}) VALUES ({placeholders})", tuple(row.values()))
            connection.commit()
            self.queue.task_done()
        connection.close()


def crop_box(frame: np.ndarray, xyxy: list[float]) -> tuple[np.ndarray, tuple[int, int, int, int]] | None:
    height, width = frame.shape[:2]
    x1, y1, x2, y2 = (int(round(value)) for value in xyxy)
    x1, x2 = max(0, x1), min(width, x2)
    y1, y2 = max(0, y1), min(height, y2)
    if x2 <= x1 or y2 <= y1:
        return None
    return frame[y1:y2, x1:x2], (x1, y1, x2, y2)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", required=True, help="best.pt or exported *_ncnn_model directory")
    parser.add_argument("--source", default="0", help="Camera index or video path")
    parser.add_argument("--telemetry-json", type=Path)
    parser.add_argument("--output", type=Path, default=Path("storage"))
    parser.add_argument(
        "--classes", default="0,1,2,3,5,7",
        help="Comma-separated COCO class ids to detect (default: person and vehicles). Use '' for all classes.",
    )
    parser.add_argument("--show", action="store_true")
    args = parser.parse_args()
    source: str | int = int(args.source) if args.source.isdigit() else args.source
    capture = cv2.VideoCapture(source)
    if not capture.isOpened():
        raise RuntimeError(f"Cannot open source: {args.source}")
    args.output.mkdir(parents=True, exist_ok=True)
    worker = EvidenceWorker(args.output / "captures", args.output / "detections.sqlite")
    telemetry_reader, model = TelemetryReader(args.telemetry_json), YOLO(args.model)
    class_filter = [int(value) for value in args.classes.split(",") if value.strip()] or None
    try:
        while True:
            ok, frame = capture.read()
            if not ok:
                break
            processed = apply_adaptive_clahe(frame)
            result = model(processed, conf=CONF_LOW, imgsz=640, classes=class_filter, verbose=False)[0]
            telemetry, captured_at_us = telemetry_reader.read(), time.time_ns() // 1_000
            for box in result.boxes:
                confidence, class_id = float(box.conf[0]), int(box.cls[0])
                status = "CONFIRMED" if confidence >= CONF_HIGH else "UNIDENTIFIED_TARGET"
                name = result.names[class_id]
                extracted = crop_box(frame, box.xyxy[0].tolist())
                if extracted is None:
                    continue
                crop, (x1, y1, x2, y2) = extracted
                if status == "UNIDENTIFIED_TARGET":
                    worker.submit(crop, {"captured_at_us": captured_at_us, "status": status,
                        "class_id": class_id, "class_name": name, "confidence": confidence,
                        "x1": x1, "y1": y1, "x2": x2, "y2": y2, **asdict(telemetry)})
                color = (0, 200, 0) if status == "CONFIRMED" else (0, 165, 255)
                cv2.rectangle(processed, (x1, y1), (x2, y2), color, 2)
                cv2.putText(processed, f"{name} {confidence:.2f} {status}", (x1, max(20, y1 - 8)), cv2.FONT_HERSHEY_SIMPLEX, 0.45, color, 1)
            if args.show:
                cv2.imshow("Drone AI", processed)
                if cv2.waitKey(1) & 0xFF in (27, ord("q")):
                    break
    finally:
        capture.release()
        worker.close()
        cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
