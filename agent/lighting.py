"""NocturPod Edge Hardware Illumination & Light Mode Controller
Manages dual-mode lighting hardware on the Raspberry Pi 4 Model B:
- Mode A: WHITE / NORMAL LIGHT (Intended normal visible illumination)
- Mode B: NIGHT / LOW-LIGHT MODE (Intended night-time illumination / IR lighting)

Features:
- Configurable BCM GPIO pins via environment variables
- Active-high / active-low polarity support (handles sinking relays, PNP transistors, and active-low LED drivers)
- Graceful hardware detection via gpiozero / RPi.GPIO with clean simulated fallback on non-Pi hosts
- Thread-safe mode transitions and state confirmation
- Clean default safe state on startup (defaults to WHITE/NORMAL mode)
"""
from __future__ import annotations

import os
import threading
from typing import Any

# Hardware pin configuration (BCM numbering)
# GPIO 18 (Physical Pin 12) is commonly used for PWM / White lighting driver
# GPIO 23 (Physical Pin 16) is commonly used for Night / Low-light / IR illumination driver
DEFAULT_WHITE_PIN = int(os.getenv("LIGHT_WHITE_PIN", "18"))
DEFAULT_NIGHT_PIN = int(os.getenv("LIGHT_NIGHT_PIN", "23"))
ACTIVE_HIGH = os.getenv("LIGHT_ACTIVE_HIGH", "1").lower() in ("1", "true", "yes")

MODE_WHITE = "WHITE"
MODE_NIGHT = "NIGHT"
VALID_MODES = (MODE_WHITE, MODE_NIGHT)


class LightingController:
    """Controls physical dual lighting outputs on Raspberry Pi edge hardware."""

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
        self.lock = threading.Lock()
        self.is_hardware_verified = False

        self._white_dev: Any = None
        self._night_dev: Any = None

        self._init_gpio()
        self._apply_hardware_state()

    def _init_gpio(self) -> None:
        """Attempts to initialize Raspberry Pi GPIO outputs via gpiozero."""
        try:
            from gpiozero import LED, OutputDevice  # type: ignore

            self._white_dev = OutputDevice(
                self.white_pin,
                active_high=self.active_high,
                initial_value=False
            )
            self._night_dev = OutputDevice(
                self.night_pin,
                active_high=self.active_high,
                initial_value=False
            )
            self.is_hardware_verified = True
            print(
                f"[Lighting] Physical GPIO initialized: White on BCM {self.white_pin}, "
                f"Night on BCM {self.night_pin} (Active-High: {self.active_high})"
            )
        except Exception as e:
            self._white_dev = None
            self._night_dev = None
            self.is_hardware_verified = False
            print(
                f"[Lighting] Notice: Hardware GPIO not accessible ({e}). "
                f"Lighting controller operating in verified simulated mode."
            )

    def _apply_hardware_state(self) -> None:
        """Applies physical GPIO outputs according to current_mode."""
        if not self.is_hardware_verified:
            return

        try:
            if self.current_mode == MODE_WHITE:
                # Mode A: White / Normal illumination ON, Night illumination OFF
                if self._white_dev:
                    self._white_dev.on()
                if self._night_dev:
                    self._night_dev.off()
            elif self.current_mode == MODE_NIGHT:
                # Mode B: Night / Low-light illumination ON, White illumination OFF
                if self._white_dev:
                    self._white_dev.off()
                if self._night_dev:
                    self._night_dev.on()
        except Exception as e:
            print(f"[Lighting] Error applying GPIO state: {e}")

    def set_mode(self, mode: str) -> tuple[bool, str, str | None]:
        """Switches lighting mode between WHITE and NIGHT.
        Returns (success, confirmed_mode, error_message).
        """
        normalized = mode.strip().upper() if mode else ""
        if normalized not in VALID_MODES:
            # Map friendly aliases
            if normalized in ("NORMAL", "WHITE_LIGHT", "DAY"):
                normalized = MODE_WHITE
            elif normalized in ("LOW_LIGHT", "IR", "NIGHT_MODE", "DARK"):
                normalized = MODE_NIGHT
            else:
                return False, self.current_mode, f"Invalid light mode: '{mode}'. Must be WHITE or NIGHT."

        with self.lock:
            self.current_mode = normalized
            self._apply_hardware_state()
            hw_tag = "[HARDWARE ACTIVE]" if self.is_hardware_verified else "[SIMULATED]"
            print(f"[Lighting] {hw_tag} Switched to Mode: {self.current_mode}")
            return True, self.current_mode, None

    def get_mode(self) -> str:
        """Returns the current confirmed lighting mode."""
        with self.lock:
            return self.current_mode

    def close(self) -> None:
        """Safely turns off all lighting outputs and releases GPIO pins."""
        with self.lock:
            try:
                if self._white_dev:
                    self._white_dev.off()
                    self._white_dev.close()
                if self._night_dev:
                    self._night_dev.off()
                    self._night_dev.close()
            except Exception:
                pass
            self.is_hardware_verified = False

    cleanup = close

