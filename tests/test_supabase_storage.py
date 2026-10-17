"""Regression tests for Supabase Storage object-key handling."""
from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from backend import database


class _FakeResponse:
    def __init__(self, payload: dict, status: int = 200):
        self._payload = json.dumps(payload).encode("utf-8")
        self.status = status

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def read(self):
        return self._payload


class SupabaseStorageUrlTests(unittest.TestCase):
    def setUp(self):
        self.original_config = (
            database.SUPABASE_URL,
            database.SUPABASE_SERVICE_ROLE_KEY,
            database.SUPABASE_STORAGE_BUCKET,
        )
        database.SUPABASE_URL = "https://example.supabase.co"
        database.SUPABASE_SERVICE_ROLE_KEY = "test-service-key"
        database.SUPABASE_STORAGE_BUCKET = "nocturpod-media"
        database._SIGNED_URL_CACHE.clear()

    def tearDown(self):
        (
            database.SUPABASE_URL,
            database.SUPABASE_SERVICE_ROLE_KEY,
            database.SUPABASE_STORAGE_BUCKET,
        ) = self.original_config
        database._SIGNED_URL_CACHE.clear()

    def test_signed_url_encodes_special_characters_in_object_key(self):
        response_url = (
            "/object/sign/nocturpod-media/"
            "original/images/device/2026-10-17/capture%20%231.jpg?token=unit-test"
        )
        with patch(
            "backend.database.urllib.request.urlopen",
            return_value=_FakeResponse({"signedURL": response_url}),
        ) as mocked_urlopen:
            result = database.get_signed_storage_url(
                "original/images/device/2026-10-17/capture #1.jpg"
            )

        request = mocked_urlopen.call_args.args[0]
        self.assertIn("capture%20%231.jpg", request.full_url)
        self.assertEqual(
            result,
            "https://example.supabase.co/storage/v1" + response_url,
        )

    def test_upload_encodes_special_characters_in_object_key(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            local_file = Path(temp_dir) / "capture.jpg"
            local_file.write_bytes(b"test-image")
            with patch(
                "backend.database.urllib.request.urlopen",
                return_value=_FakeResponse({"Key": "stored"}, status=200),
            ) as mocked_urlopen:
                uploaded = database.upload_to_supabase_storage(
                    local_file,
                    "original/images/device/2026-10-17/capture #1.jpg",
                )

        self.assertTrue(uploaded)
        request = mocked_urlopen.call_args.args[0]
        self.assertIn("capture%20%231.jpg", request.full_url)

    def test_invalid_object_paths_are_rejected_before_network_request(self):
        with patch("backend.database.urllib.request.urlopen") as mocked_urlopen:
            self.assertIsNone(database.get_signed_storage_url("original/../private.jpg"))
            self.assertFalse(
                database.upload_to_supabase_storage(
                    Path("missing.jpg"), "original/../private.jpg"
                )
            )
        mocked_urlopen.assert_not_called()


class HeartbeatSchemaCompatibilityTests(SupabaseStorageUrlTests):
    def test_heartbeat_retries_without_light_mode_for_older_schema(self):
        with patch(
            "backend.database._supabase_request",
            side_effect=[None, [{"device_id": "nocturpod-edge-01"}]],
        ) as mocked_request:
            record = database.upsert_device_heartbeat({"device_id": "nocturpod-edge-01"})

        self.assertEqual(record["device_id"], "nocturpod-edge-01")
        self.assertEqual(mocked_request.call_count, 2)
        first_payload = mocked_request.call_args_list[0].kwargs["data"]
        retry_payload = mocked_request.call_args_list[1].kwargs["data"]
        self.assertIn("light_mode", first_payload)
        self.assertNotIn("light_mode", retry_payload)
        self.assertIn("return=representation", mocked_request.call_args_list[0].kwargs["headers"]["Prefer"])


if __name__ == "__main__":
    unittest.main()
