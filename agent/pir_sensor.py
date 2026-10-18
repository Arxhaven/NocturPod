"""HC-SR501 PIR motion sensor interface for Raspberry Pi GPIO.

Default wiring: sensor OUT -> BCM GPIO 17 / physical pin 11.
PIR VCC must use the supply supported by the sensor board, GND must be common,
and the Pi GPIO input must never receive 5V logic. Prefer the lgpio pin factory
on Raspberry Pi OS Bookworm; fall back to gpiozero's configured default if needed.
"""
from __future__ import annotations

import datetime
import logging
import threading
from typing import Callable, Any

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
        self.pin_factory_name = "unavailable"
        self.last_error: str | None = None
        self.last_motion_at: str | None = None
        self.motion_count = 0
        self._sensor: Any = None
        self._pin_factory: Any = None
        self._lock = threading.RLock()
        self._last_polled_motion = False

        sensor_kwargs = {
            "queue_len": 1,
            "sample_rate": 10,
            "threshold": 0.5,
            "partial_period": 0.3,
            "calibration_time": max(0.0, float(calibration_time)),
        }
        lgpio_error: str | None = None
        try:
            from gpiozero import MotionSensor

            # Prefer an explicit lgpio factory instead of relying on a system-wide
            # default that may differ between an interactive shell and systemd.
            try:
                from gpiozero.pins.lgpio import LGPIOFactory

                self._pin_factory = LGPIOFactory()
                self._sensor = MotionSensor(
                    self.gpio_pin,
                    pin_factory=self._pin_factory,
                    **sensor_kwargs,
                )
                self.pin_factory_name = "lgpio"
            except Exception as exc:
                lgpio_error = f"{type(exc).__name__}: {exc}"
                self._pin_factory = None
                self._sensor = MotionSensor(self.gpio_pin, **sensor_kwargs)
                self.pin_factory_name = type(self._sensor.pin_factory).__name__

            self._sensor.when_motion = self._handle_motion if self.enabled else None
            self._sensor.when_no_motion = self._handle_no_motion
            self.is_hardware_available = True
            self.last_error = None
            if lgpio_error:
                logger.warning(
                    "lgpio factory failed (%s); gpiozero fallback factory '%s' selected.",
                    lgpio_error,
                    self.pin_factory_name,
                )
            logger.info(
                "HC-SR501 initialized on BCM GPIO %s (physical pin %s) with factory '%s'; "
                "allow %.0f seconds for PIR calibration.",
                self.gpio_pin,
                self.gpio_pin_to_physical(self.gpio_pin),
                self.pin_factory_name,
                sensor_kwargs["calibration_time"],
            )
        except Exception as exc:
            self.last_error = f"{type(exc).__name__}: {exc}"
            logger.exception(
                "PIR INITIALIZATION FAILED on BCM GPIO %s. Motion capture is unavailable "
                "until GPIO dependencies, service permissions, pin conflicts, and wiring are fixed.",
                self.gpio_pin,
            )
            self._sensor = None
            self._pin_factory = None
            self.is_hardware_available = False

    @staticmethod
    def gpio_pin_to_physical(pin: int) -> str:
        return {17: "11"}.get(pin, "check Raspberry Pi BCM pin map")

    def _handle_motion(self) -> None:
        with self._lock:
            if not self.enabled:
                return
            callback = self.on_motion
            self.motion_count += 1
            self.last_motion_at = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")
            self._last_polled_motion = True
        logger.info("PIR motion edge detected on BCM GPIO %s.", self.gpio_pin)
        if callback:
            try:
                callback()
            except Exception:
                logger.exception("PIR motion callback failed")

    def _handle_no_motion(self) -> None:
        with self._lock:
            self._last_polled_motion = False

    def poll_motion_edge(self) -> bool:
        """Detect a rising motion state as a watchdog for missed gpiozero callbacks.

        The normal gpiozero callback remains the primary trigger. The agent polls the
        sensor state as a second path; its capture cooldown suppresses duplicate edges.
        """
        with self._lock:
            sensor = self._sensor
            enabled = self.enabled
        if not enabled or not self.is_hardware_available or sensor is None:
            return False
        try:
            current = bool(sensor.motion_detected)
        except Exception as exc:
            self.last_error = f"Could not read PIR state: {type(exc).__name__}: {exc}"
            logger.exception("Could not read PIR state on BCM GPIO %s.", self.gpio_pin)
            return False
        with self._lock:
            rising = current and not self._last_polled_motion
            self._last_polled_motion = current
        return rising

    def get_status(self) -> dict[str, Any]:
        with self._lock:
            sensor = self._sensor
            enabled = self.enabled
            available = self.is_hardware_available
            last_motion_at = self.last_motion_at
            motion_count = self.motion_count
            last_error = self.last_error
            factory = self.pin_factory_name
        detected = False
        if available and enabled and sensor is not None:
            try:
                detected = bool(sensor.motion_detected)
            except Exception:
                detected = False
        return {
            "available": available,
            "enabled": enabled,
            "gpio_pin_bcm": self.gpio_pin,
            "gpio_pin_physical": self.gpio_pin_to_physical(self.gpio_pin),
            "pin_factory": factory,
            "motion_detected": detected,
            "motion_count": motion_count,
            "last_motion_at": last_motion_at,
            "last_error": last_error,
        }

    def set_enabled(self, enabled: bool) -> bool:
        with self._lock:
            if enabled and not self.is_hardware_available:
                return False
            self.enabled = bool(enabled)
            if self._sensor:
                self._sensor.when_motion = self._handle_motion if self.enabled else None
                try:
                    self._last_polled_motion = bool(self._sensor.motion_detected) if self.enabled else False
                except Exception:
                    self._last_polled_motion = False
            logger.info("PIR motion capture %s.", "enabled" if self.enabled else "disabled")
            return True

    def is_motion_detected(self) -> bool:
        status = self.get_status()
        return bool(status["motion_detected"])

    def close(self) -> None:
        with self._lock:
            if self._sensor:
                try:
                    self._sensor.when_motion = None
                    self._sensor.when_no_motion = None
                    self._sensor.close()
                except Exception:
                    logger.exception("Error while closing PIR sensor")
                finally:
                    self._sensor = None
                    self.is_hardware_available = False
            if self._pin_factory:
                try:
                    self._pin_factory.close()
                except Exception:
                    pass
                self._pin_factory = None
