"""NocturPod Offline Spool & Persistent Retry Manager
Guarantees zero media loss during network interruptions:
- Bounded local disk spool directory on Raspberry Pi (~/nocturpod/media/)
- Tracks pending files and uploads them in chronological order once network resumes
"""
from __future__ import annotations

import json
import threading
import time
from pathlib import Path
from typing import Any

from agent.api_client import NocturPodApiClient
from agent.config import MEDIA_BASE_DIR

SPOOL_MANIFEST = MEDIA_BASE_DIR / "spool_manifest.json"


class SpoolUploader:
    def __init__(self, api_client: NocturPodApiClient):
        self.api_client = api_client
        self._lock = threading.RLock()
        self._load_manifest()

    def _load_manifest(self) -> None:
        if SPOOL_MANIFEST.exists():
            try:
                self.queue: list[dict[str, Any]] = json.loads(SPOOL_MANIFEST.read_text(encoding="utf-8"))
                return
            except Exception:
                pass
        self.queue = []

    def _save_manifest(self) -> None:
        with self._lock:
            try:
                SPOOL_MANIFEST.write_text(json.dumps(self.queue, indent=2), encoding="utf-8")
            except Exception as e:
                print(f"[Spool] Failed to write spool manifest: {e}")

    def enqueue(self, file_path: Path, event_id: str, media_type: str, duration: str = "0s") -> None:
        item = {
            "file_path": str(file_path.resolve()),
            "event_id": event_id,
            "media_type": media_type,
            "duration": duration,
            "queued_at": time.time()
        }
        with self._lock:
            self.queue.append(item)
            self._save_manifest()
            pending_count = len(self.queue)
        print(f"[Spool] Queued {file_path.name} for offline retry ({pending_count} items pending)")

    def process_pending_uploads(self) -> int:
        """Retries queued items without blocking new enqueues during network I/O."""
        with self._lock:
            if not self.queue:
                return 0
            # Keep the persisted queue intact during network I/O. If the process
            # restarts mid-upload, pending items must remain eligible for retry.
            pending = list(self.queue)
            pending_ids = {id(item) for item in pending}

        remaining: list[dict[str, Any]] = []
        uploaded_count = 0

        for item in pending:
            path = Path(item["file_path"])
            if not path.exists():
                print(f"[Spool] Dropping missing queued file: {path}")
                continue

            success = self.api_client.upload_media(
                file_path=path,
                event_id=item["event_id"],
                media_type=item["media_type"],
                duration=item.get("duration", "0s")
            )
            if success:
                uploaded_count += 1
                print(f"[Spool] Successfully uploaded pending file: {path.name}")
            else:
                remaining.append(item)

        # Remove only the items from this snapshot; keep any items enqueued while
        # uploads were running. Older failed entries remain ahead of new enqueues.
        with self._lock:
            newly_enqueued = [item for item in self.queue if id(item) not in pending_ids]
            self.queue = remaining + newly_enqueued
            self._save_manifest()
        return uploaded_count
