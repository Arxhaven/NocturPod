"""Regression tests for reliable Supabase Storage uploads of enhanced media."""
from __future__ import annotations

import base64
import json
import tempfile
import unittest
import urllib.error
from pathlib import Path
from unittest.mock import patch

import backend.database as db


class FakeResponse:
    def __init__(self, status: int, headers: dict[str, str] | None = None, body: bytes = b""):
        self.status = status
        self.headers = headers or {}
        self._body = body

    def read(self, amount: int = -1) -> bytes:
        return self._body if amount < 0 else self._body[:amount]

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


def request_header(request, name: str):
    direct = request.get_header(name)
    if direct is not None:
        return direct
    for key, value in request.headers.items():
        if key.lower() == name.lower():
            return value
    return None


class TestSupabaseStorageUploads(unittest.TestCase):
    def test_large_asset_uses_tus_chunks_and_encoded_metadata(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            source = Path(temp_dir) / "large-enhanced.mp4"
            source.write_bytes(b"abcdefghijkl")
            methods = []
            patch_sizes = []
            created = {}

            def fake_urlopen(request, timeout=0):
                method = request.get_method()
                methods.append(method)
                if method == "POST":
                    created["endpoint"] = request.full_url
                    created["length"] = request_header(request, "Upload-Length")
                    raw_metadata = request_header(request, "Upload-Metadata")
                    metadata = {}
                    for item in raw_metadata.split(","):
                        key, value = item.split(" ", 1)
                        metadata[key] = base64.b64decode(value).decode("utf-8")
                    created["metadata"] = metadata
                    created["timeout"] = timeout
                    return FakeResponse(
                        201,
                        {"Location": "/storage/v1/upload/resumable/session-123", "Upload-Offset": "0"},
                    )

                if method == "PATCH":
                    offset = int(request_header(request, "Upload-Offset"))
                    chunk_size = len(request.data or b"")
                    patch_sizes.append(chunk_size)
                    self.assertEqual(request_header(request, "Content-Type"), "application/offset+octet-stream")
                    created["last_patch_timeout"] = timeout
                    return FakeResponse(204, {"Upload-Offset": str(offset + chunk_size)})

                raise AssertionError(f"Unexpected HTTP method: {method}")

            with (
                patch.object(db, "SUPABASE_URL", "https://projectref.supabase.co"),
                patch.object(db, "SUPABASE_SERVICE_ROLE_KEY", "test-service-key"),
                patch.object(db, "SUPABASE_STORAGE_BUCKET", "nocturpod-media"),
                patch.object(db, "_STORAGE_TUS_THRESHOLD_BYTES", 5),
                patch.object(db, "_STORAGE_TUS_CHUNK_BYTES", 4),
                patch("urllib.request.urlopen", side_effect=fake_urlopen),
            ):
                self.assertTrue(
                    db.upload_to_supabase_storage(
                        source, "enhanced/videos/pi/date/file video.mp4", "video/mp4"
                    )
                )

            self.assertEqual(methods, ["POST", "PATCH", "PATCH", "PATCH"])
            self.assertEqual(patch_sizes, [4, 4, 4])
            self.assertEqual(created["length"], "12")
            self.assertEqual(created["endpoint"], "https://projectref.storage.supabase.co/storage/v1/upload/resumable")
            self.assertEqual(created["metadata"]["bucketName"], "nocturpod-media")
            self.assertEqual(created["metadata"]["objectName"], "enhanced/videos/pi/date/file video.mp4")
            self.assertEqual(created["metadata"]["contentType"], "video/mp4")
            self.assertTrue(request_header_value(created.get("metadata", {}), "contentType") == "video/mp4")
            self.assertIsNone(db.get_last_storage_upload_error())

    def test_storage_failure_is_saved_for_event_diagnostics(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            source = Path(temp_dir) / "large-enhanced.mp4"
            source.write_bytes(b"abcdef")
            error_body = b'{"statusCode":"413","error":"Payload too large"}'

            with (
                patch.object(db, "SUPABASE_URL", "https://projectref.supabase.co"),
                patch.object(db, "SUPABASE_SERVICE_ROLE_KEY", "test-service-key"),
                patch.object(db, "SUPABASE_STORAGE_BUCKET", "nocturpod-media"),
                patch.object(db, "_STORAGE_TUS_THRESHOLD_BYTES", 1),
                patch(
                    "urllib.request.urlopen",
                    side_effect=urllib.error.HTTPError(
                        "https://projectref.storage.supabase.co/storage/v1/upload/resumable",
                        413,
                        "Payload Too Large",
                        {},
                        __import__("io").BytesIO(error_body),
                    ),
                ),
            ):
                self.assertFalse(
                    db.upload_to_supabase_storage(source, "enhanced/videos/pi/date/file.mp4", "video/mp4")
                )

            error = db.get_last_storage_upload_error()
            self.assertIsNotNone(error)
            self.assertIn("HTTP 413", error)
            self.assertIn("Payload too large", error)


def request_header_value(values: dict[str, str], key: str) -> str | None:
    return next((value for name, value in values.items() if name.lower() == key.lower()), None)


if __name__ == "__main__":
    unittest.main()
