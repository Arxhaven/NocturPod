"""Tests for the 4K target geometry and tiled super-resolution glue.

The ONNX inference path is replaced by a deterministic 4x test session here, so
these tests can verify tiling and output shape without downloading model weights.
"""
from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import patch

import numpy as np

import backend.super_resolution as sr


class FakeX4Session:
    def get_inputs(self):
        return [SimpleNamespace(name="input")]

    def get_outputs(self):
        return [SimpleNamespace(name="output")]

    def run(self, output_names, input_feed):
        tensor = input_feed["input"]
        return [np.repeat(np.repeat(tensor, 4, axis=2), 4, axis=3)]


class TestNocturPodSuperResolution(unittest.TestCase):
    def test_pinned_real_esrgan_model_checksum_matches_published_artifact(self):
        # Guard the production model-integrity check against an accidental typo.
        self.assertEqual(
            sr.MODEL_SHA256,
            "1940a93ee08283a0a7286183186357b1688fe9fa8ede74604b424586aaddf112",
        )

    def test_16_by_9_capture_targets_4k_uhd(self):
        self.assertEqual(sr.target_4k_dimensions(1280, 720), (3840, 2160))
        self.assertEqual(sr.target_4k_dimensions(1920, 1080), (3840, 2160))

    def test_portrait_source_preserves_aspect_ratio(self):
        self.assertEqual(sr.target_4k_dimensions(720, 1280), (2160, 3840))

    def test_native_4k_is_not_resized_down(self):
        self.assertEqual(sr.target_4k_dimensions(3840, 2160), (3840, 2160))
        self.assertEqual(sr.target_4k_dimensions(4096, 2160), (4096, 2160))

    def test_tiled_inference_assembles_correct_target_shape(self):
        source = np.zeros((32, 48, 3), dtype=np.uint8)
        # Use a small target and tile size for a fast deterministic unit test.
        with (
            patch.object(sr, "TARGET_LONG_EDGE", 96),
            patch.object(sr, "TILE_SIZE", 24),
            patch.object(sr, "_get_session", return_value=(FakeX4Session(), "test-model")),
        ):
            result, details = sr.upscale_to_4k(source)

        self.assertEqual(result.shape, (64, 96, 3))
        self.assertTrue(details["super_resolution_used"])
        self.assertEqual(details["resolution_before"], "48x32")
        self.assertEqual(details["output_target"], "96x64")


if __name__ == "__main__":
    unittest.main()
