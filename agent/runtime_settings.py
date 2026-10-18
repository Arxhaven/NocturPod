"""Persistent, validated runtime settings for the NocturPod Raspberry Pi agent."""
from __future__ import annotations

import json
import threading
from pathlib import Path
from typing import Any

from agent.config import MEDIA_BASE_DIR

SETTINGS_PATH = MEDIA_BASE_DIR / "device_settings.json"
_LOCK = threading.RLock()

DEFAULT_SETTINGS: dict[str, Any] = {
    "camera": {
        "auto_exposure": True,
        "exposure_time_us": 20000,
        "analogue_gain": 3.0,
        "auto_white_balance": True,
        "brightness": 0.0,
        "contrast": 1.0,
        "saturation": 0.65,
        "sharpness": 1.0,
    },
    "pir": {
        "enabled": True,
        "cooldown_seconds": 15,
        "gpio_pin": 17,
    },
    "lighting": {
        "mode": "WHITE",
        "white_intensity": 100,
        "night_intensity": 100,
    },
}


def _merge_defaults(value: dict[str, Any] | None) -> dict[str, Any]:
    merged = {key: dict(default) for key, default in DEFAULT_SETTINGS.items()}
    if not isinstance(value, dict):
        return merged
    for section, defaults in DEFAULT_SETTINGS.items():
        incoming = value.get(section)
        if isinstance(incoming, dict):
            for key in defaults:
                if key in incoming:
                    merged[section][key] = incoming[key]
    # Constrain persisted values too; a hand-edited file must not bypass API validation.
    camera = merged["camera"]
    camera["auto_exposure"] = bool(camera["auto_exposure"])
    camera["auto_white_balance"] = bool(camera["auto_white_balance"])
    camera["exposure_time_us"] = max(1000, min(60000, int(camera["exposure_time_us"])))
    camera["analogue_gain"] = max(1.0, min(8.0, float(camera["analogue_gain"])))
    camera["brightness"] = max(-1.0, min(1.0, float(camera["brightness"])))
    camera["contrast"] = max(0.5, min(2.0, float(camera["contrast"])))
    camera["saturation"] = max(0.0, min(2.0, float(camera["saturation"])))
    camera["sharpness"] = max(0.0, min(2.0, float(camera["sharpness"])))
    pir = merged["pir"]
    pir["enabled"] = bool(pir["enabled"])
    pir["cooldown_seconds"] = max(5, min(300, int(pir["cooldown_seconds"])))
    pir["gpio_pin"] = max(0, min(27, int(pir["gpio_pin"])))
    lighting = merged["lighting"]
    mode = str(lighting["mode"]).upper()
    lighting["mode"] = mode if mode in ("WHITE", "NIGHT", "AUTO") else "WHITE"
    lighting["white_intensity"] = max(0, min(100, int(lighting["white_intensity"])))
    lighting["night_intensity"] = max(0, min(100, int(lighting["night_intensity"])))
    return merged


def load_runtime_settings() -> dict[str, Any]:
    with _LOCK:
        try:
            if SETTINGS_PATH.is_file():
                return _merge_defaults(json.loads(SETTINGS_PATH.read_text(encoding="utf-8")))
        except Exception as exc:
            print(f"[Settings] Could not read {SETTINGS_PATH}: {exc}")
        return _merge_defaults(None)


def save_runtime_settings(settings: dict[str, Any]) -> dict[str, Any]:
    clean = _merge_defaults(settings)
    with _LOCK:
        SETTINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
        temp_path = SETTINGS_PATH.with_suffix(".json.tmp")
        temp_path.write_text(json.dumps(clean, indent=2), encoding="utf-8")
        temp_path.replace(SETTINGS_PATH)
    return clean
