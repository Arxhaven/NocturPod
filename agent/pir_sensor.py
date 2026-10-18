"""HC-SR501 PIR motion sensor interface for Raspberry Pi GPIO.

Default wiring: sensor OUT -> BCM GPIO 17 / physical pin 11.
Power the HC-SR501 from its supported supply, connect GND to Pi GND, and
never feed a 5V signal into a Pi GPIO. Hardware detection is reported honestly;
there is no simulated-motion fallback.
"""
from __future__ import annotations

import logging
import threading
from typing import Callable

logger = logging.getLogger("NocturPod.PIR")


class PIRSensor:
    def __init__(
        self,
        gpio_pin: int = 17,
        on_motion: Callable[[], None] | None = None,
        enabled: bool = True,
        calibration_time: float = 30.0,
    ) -> None:
        self.gpio_pin = int(gpio_pin)
        self.on_motion = on_motion
        self.enabled = bool(enabled)
        self.is_hardware_available = False
        self._sensor = None
        self._lock = threading.RLock()

        try:
            from gpiozero import MotionSensor

            self._sensor = MotionSensor(
                self.gpio_pin,
                queue_len=1,
                sample_rate=10,
                threshold=0.5,
                partial_period=0.3,
                calibration_time=calibration_time,
            )
            self._sensor.when_motion = self._handle_motion if self.enabled else None
            self.is_hardware_available = True
            logger.info(
                "HC-SR501 initialized on BCM GPIO %s (physical pin %s); "
                "calibration may take up to %.0f seconds.",
                self.gpio_pin,
                self.gpio_pin_to_physical(self.gpio_pin),
                calibration_time,
            )
        except Exception as exc:
            logger.error(
                "PIR INITIALIZATION FAILED on BCM GPIO %s: %s. "
                "Motion-triggered capture is unavailable until GPIO dependencies, "
                "permissions, and wiring are corrected.",
                self.gpio_pin,
                exc,
            )
            self._sensor = None
            self.is_hardware_available = False

    @staticmethod
    def gpio_pin_to_physical(pin: int) -> str:
        return {17: "11"}.get(pin, "check Raspberry Pi BCM pin map")

    def _handle_motion(self) -> None:
        with self._lock:
            if not self.enabled:
                return
            callback = self.on_motion
        logger.info("PIR motion edge detected on BCM GPIO %s.", self.gpio_pin)
        if callback:
            try:
                callback()
            except Exception:
                logger.exception("PIR motion callback failed")

    def set_enabled(self, enabled: bool) -> bool:
        with self._lock:
            if enabled and not self.is_hardware_available:
                return False
            self.enabled = bool(enabled)
            if self._sensor:
                self._sensor.when_motion = self._handle_motion if self.enabled else None
            logger.info("PIR motion capture %s.", "enabled" if self.enabled else "disabled")
            return True

    def is_motion_detected(self) -> bool:
        if not self.is_hardware_available or not self._sensor or not self.enabled:
            return False
        try:
            return bool(self._sensor.motion_detected)
        except Exception:
            logger.exception("Could not read PIR sensor state")
            return False

    def close(self) -> None:
        with self._lock:
            if self._sensor:
                try:
                    self._sensor.when_motion = None
                    self._sensor.close()
                except Exception:
                    logger.exception("Error while closing PIR sensor")
                finally:
                    self._sensor = None
                    self.is_hardware_available = False
