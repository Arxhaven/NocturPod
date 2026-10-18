"""NocturPod illumination controller.

WHITE and NIGHT are discrete outputs unless LIGHT_PWM_ENABLED=1 is explicitly set.
Enable PWM only when the GPIO pins feed a compatible LED driver (not a mechanical
relay or a bare load). AUTO mode switches between WHITE and NIGHT using measured
camera-frame luminance with hysteresis; it does not assume the camera has a lux sensor.
"""
from __future__ import annotations

import os
import threading
from typing import Any

DEFAULT_WHITE_PIN = int(os.getenv("LIGHT_WHITE_PIN", "18"))
DEFAULT_NIGHT_PIN = int(os.getenv("LIGHT_NIGHT_PIN", "23"))
ACTIVE_HIGH = os.getenv("LIGHT_ACTIVE_HIGH", "1").lower() in ("1", "true", "yes")
PWM_ENABLED = os.getenv("LIGHT_PWM_ENABLED", "0").lower() in ("1", "true", "yes")

MODE_WHITE = "WHITE"
MODE_NIGHT = "NIGHT"
MODE_AUTO = "AUTO"
VALID_MODES = (MODE_WHITE, MODE_NIGHT, MODE_AUTO)


class LightingController:
    """Controls configured physical light-driver outputs on the Raspberry Pi."""

    def __init__(
        self,
        white_pin: int = DEFAULT_WHITE_PIN,
        night_pin: int = DEFAULT_NIGHT_PIN,
        active_high: bool = ACTIVE_HIGH,
        initial_mode: str = MODE_WHITE,
    ) -> None:
        self.white_pin = white_pin
        self.night_pin = night_pin
        self.active_high = active_high
        self.current_mode = initial_mode if initial_mode in VALID_MODES else MODE_WHITE
        self.auto_active_mode = MODE_WHITE
        self.white_intensity = 100
        self.night_intensity = 100
        self.pwm_enabled = PWM_ENABLED
        self.lock = threading.RLock()
        self.is_hardware_verified = False
        self._white_dev: Any = None
        self._night_dev: Any = None
        self._last_auto_switch = 0.0

        self._init_gpio()
        self._apply_hardware_state()

    def _init_gpio(self) -> None:
        try:
            if self.pwm_enabled:
                from gpiozero import PWMLED
                self._white_dev = PWMLED(
                    self.white_pin, active_high=self.active_high,
                    initial_value=0, frequency=500
                )
                self._night_dev = PWMLED(
                    self.night_pin, active_high=self.active_high,
                    initial_value=0, frequency=500
                )
                print(
                    f"[Lighting] PWM LED-driver outputs initialized on BCM "
                    f"{self.white_pin}/{self.night_pin}. Verify these pins drive "
                    "PWM-compatible LED drivers before enabling LIGHT_PWM_ENABLED."
                )
            else:
                from gpiozero import OutputDevice
                self._white_dev = OutputDevice(
                    self.white_pin, active_high=self.active_high, initial_value=False
                )
                self._night_dev = OutputDevice(
                    self.night_pin, active_high=self.active_high, initial_value=False
                )
                print(
                    f"[Lighting] Binary outputs initialized on BCM "
                    f"{self.white_pin}/{self.night_pin}; PWM intensity control is disabled."
                )
            self.is_hardware_verified = True
        except Exception as exc:
            self._white_dev = None
            self._night_dev = None
            self.is_hardware_verified = False
            print(f"[Lighting] GPIO initialization FAILED: {exc}. No hardware changes will be faked.")

    def _write_output(self, device: Any, on: bool, intensity: int) -> None:
        if not device:
            return
        if self.pwm_enabled:
            device.value = max(0, min(100, int(intensity))) / 100.0 if on else 0.0
        elif on and intensity > 0:
            device.on()
        else:
            device.off()

    def _active_mode(self) -> str:
        return self.auto_active_mode if self.current_mode == MODE_AUTO else self.current_mode

    def _apply_hardware_state(self) -> None:
        if not self.is_hardware_verified:
            return
        try:
            active_mode = self._active_mode()
            self._write_output(
                self._white_dev, active_mode == MODE_WHITE, self.white_intensity
            )
            self._write_output(
                self._night_dev, active_mode == MODE_NIGHT, self.night_intensity
            )
        except Exception as exc:
            print(f"[Lighting] Error applying illumination state: {exc}")

    def set_mode(self, mode: str) -> tuple[bool, str, str | None]:
        normalized = mode.strip().upper() if mode else ""
        aliases = {
            "NORMAL": MODE_WHITE, "WHITE_LIGHT": MODE_WHITE, "DAY": MODE_WHITE,
            "LOW_LIGHT": MODE_NIGHT, "IR": MODE_NIGHT, "NIGHT_MODE": MODE_NIGHT,
            "DARK": MODE_NIGHT, "AUTOMATIC": MODE_AUTO,
        }
        normalized = aliases.get(normalized, normalized)
        if normalized not in VALID_MODES:
            return False, self.current_mode, f"Invalid light mode '{mode}'. Must be WHITE, NIGHT, or AUTO."
        with self.lock:
            self.current_mode = normalized
            self._apply_hardware_state()
            hw_tag = "[HARDWARE ACTIVE]" if self.is_hardware_verified else "[UNAVAILABLE]"
            print(f"[Lighting] {hw_tag} Selected mode: {self.current_mode} (active output: {self._active_mode()})")
            return True, self.current_mode, None

    def set_intensity(self, mode: str, intensity_pct: int) -> tuple[bool, str | None]:
        normalized = (mode or "").strip().upper()
        if normalized not in (MODE_WHITE, MODE_NIGHT):
            return False, "Intensity mode must be WHITE or NIGHT."
        value = max(0, min(100, int(intensity_pct)))
        with self.lock:
            if not self.pwm_enabled:
                return False, (
                    "PWM intensity is disabled. Confirm the output is connected to a "
                    "PWM-compatible LED driver, then set LIGHT_PWM_ENABLED=1 on the Pi."
                )
            if not self.is_hardware_verified:
                return False, "Illumination GPIO hardware is unavailable."
            if normalized == MODE_WHITE:
                self.white_intensity = value
            else:
                self.night_intensity = value
            self._apply_hardware_state()
            print(f"[Lighting] {normalized} output intensity set to {value}%.")
            return True, None

    def update_auto_lighting(self, frame_luminance: float | None) -> None:
        """Switch lights in AUTO mode only; avoid rapid flapping around twilight."""
        if frame_luminance is None:
            return
        with self.lock:
            if self.current_mode != MODE_AUTO:
                return
            now = __import__("time").monotonic()
            if now - self._last_auto_switch < 8.0:
                return
            target = self.auto_active_mode
            if frame_luminance < 42:
                target = MODE_NIGHT
            elif frame_luminance > 72:
                target = MODE_WHITE
            if target != self.auto_active_mode:
                self.auto_active_mode = target
                self._last_auto_switch = now
                self._apply_hardware_state()
                print(
                    f"[Lighting] AUTO switched to {target}; "
                    f"measured mean frame luminance={frame_luminance:.1f}/255."
                )

    def get_mode(self) -> str:
        with self.lock:
            return self.current_mode

    def close(self) -> None:
        with self.lock:
            for device in (self._white_dev, self._night_dev):
                if device:
                    try:
                        device.off()
                        device.close()
                    except Exception:
                        pass
            self.is_hardware_verified = False

    cleanup = close
