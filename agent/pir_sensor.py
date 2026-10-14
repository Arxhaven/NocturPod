"""HC-SR501 PIR Motion Sensor Interface for Raspberry Pi 4.

BCM GPIO 17 (Physical Pin 11) is configured as active-high motion input.
Note: Hardware functionality remains UNVERIFIED until tested on the physical device.
"""
import logging
import time
from typing import Callable, Optional

logger = logging.getLogger("NocturPod.PIR")

class PIRSensor:
    def __init__(self, gpio_pin: int = 17, on_motion: Optional[Callable[[], None]] = None):
        self.gpio_pin = gpio_pin
        self.on_motion = on_motion
        self.is_hardware_available = False
        self._sensor = None

        try:
            from gpiozero import MotionSensor
            self._sensor = MotionSensor(self.gpio_pin)
            if self.on_motion:
                self._sensor.when_motion = self._handle_motion
            self.is_hardware_available = True
            logger.info(f"[UNVERIFIED] HC-SR501 initialized on GPIO {gpio_pin} via gpiozero.")
        except (ImportError, Exception) as e:
            logger.warning(f"Hardware GPIO not accessible ({e}). Running in simulated/dry-run mode.")
            self.is_hardware_available = False

    def _handle_motion(self):
        logger.info("[EVENT] HC-SR501 PIR sensor triggered (Motion Detected)!")
        if self.on_motion:
            self.on_motion()

    def is_motion_detected(self) -> bool:
        if self.is_hardware_available and self._sensor:
            try:
                return bool(self._sensor.motion_detected)
            except Exception:
                return False
        return False

    def close(self):
        if self._sensor:
            try:
                self._sensor.close()
            except Exception:
                pass
