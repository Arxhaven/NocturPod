"""Standalone HC-SR501 hardware diagnostic.

Stop nocturpod-agent.service before running this script so the same GPIO line is
not opened by both processes. This reports real GPIO state transitions only.
"""
from __future__ import annotations

import argparse
import datetime
import os
import time


def utc_now() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")


def main() -> int:
    parser = argparse.ArgumentParser(description="Test the HC-SR501 PIR sensor on Raspberry Pi GPIO.")
    parser.add_argument("--pin", type=int, default=17, help="BCM GPIO pin (default: 17 / physical pin 11)")
    parser.add_argument("--calibration", type=float, default=30.0, help="PIR warm-up/calibration seconds")
    parser.add_argument("--duration", type=float, default=90.0, help="Seconds to listen after calibration")
    args = parser.parse_args()

    os.environ.setdefault("GPIOZERO_PIN_FACTORY", "lgpio")
    try:
        from gpiozero import MotionSensor
        from gpiozero.pins.lgpio import LGPIOFactory

        factory = LGPIOFactory()
        sensor = MotionSensor(
            args.pin,
            pin_factory=factory,
            queue_len=1,
            sample_rate=10,
            threshold=0.5,
            partial_period=0.3,
            calibration_time=max(0.0, args.calibration),
        )
    except Exception as exc:
        print(f"[PIR TEST] INITIALIZATION FAILED at {utc_now()}: {type(exc).__name__}: {exc}")
        print("[PIR TEST] Install python3-gpiozero/python3-lgpio, verify permissions, and check GPIO wiring.")
        return 2

    sensor.when_motion = lambda: print(f"[PIR TEST] MOTION edge at {utc_now()} (BCM GPIO {args.pin})", flush=True)
    sensor.when_no_motion = lambda: print(f"[PIR TEST] NO-MOTION edge at {utc_now()} (BCM GPIO {args.pin})", flush=True)
    print(f"[PIR TEST] Sensor opened on BCM GPIO {args.pin}; calibrating for {args.calibration:.0f}s.", flush=True)
    print(f"[PIR TEST] Walk across the sensor's field of view for the next {args.duration:.0f}s.", flush=True)

    deadline = time.monotonic() + max(1.0, args.duration)
    try:
        while time.monotonic() < deadline:
            print(
                f"[PIR TEST] state={'MOTION' if sensor.motion_detected else 'QUIET'} at {utc_now()}",
                flush=True,
            )
            time.sleep(2.0)
    except KeyboardInterrupt:
        print("\n[PIR TEST] Stopped by user.")
    finally:
        sensor.close()
        try:
            factory.close()
        except Exception:
            pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
