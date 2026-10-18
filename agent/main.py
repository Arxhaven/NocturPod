"""NocturPod Edge Device Agent Main Daemon
Runs as a systemd service (nocturpod-agent.service) on Raspberry Pi 4 Model B.
Coordinates camera acquisition, telemetry heartbeat, live streaming, command polling,
local bounded spooling, and media uploads.
"""
from __future__ import annotations

import argparse
import sys
import threading
import time
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from agent.api_client import NocturPodApiClient
from agent.camera import OV5647Camera
from agent.capture import CaptureController, RecordController
from agent.config import (
    BACKEND_URL,
    COMMAND_POLL_INTERVAL,
    DEVICE_ID,
    DEVICE_TOKEN,
    HEARTBEAT_INTERVAL,
    STREAM_FRAME_INTERVAL,
)
from agent.heartbeat import collect_device_telemetry
from agent.pir_sensor import PIRSensor
from agent.runtime_settings import load_runtime_settings, save_runtime_settings
from agent.lighting import LightingController
from agent.stream import StreamManager
from agent.uploader import SpoolUploader


class NocturPodAgent:
    def __init__(self, backend_url: str = BACKEND_URL, token: str = DEVICE_TOKEN) -> None:
        self.backend_url = backend_url
        self.token = token
        self.is_running = True

        print(f"[NocturPod Agent] Starting edge node '{DEVICE_ID}' targeting backend: {self.backend_url}")

        self.runtime_settings = load_runtime_settings()
        self._motion_lock = threading.Lock()
        self._last_motion_capture = 0.0
        self.pir_enabled = bool(self.runtime_settings["pir"]["enabled"])
        self.pir_cooldown_seconds = int(self.runtime_settings["pir"]["cooldown_seconds"])

        self.camera = OV5647Camera()
        if self.camera.is_opened:
            camera_result = self.camera.apply_settings(self.runtime_settings["camera"])
            print(
                "[Camera] Startup controls: "
                + ", ".join(camera_result.get("applied", []))
                + (f"; unsupported: {', '.join(camera_result.get('unsupported', []))}" if camera_result.get("unsupported") else "")
            )
        self.lighting = LightingController(initial_mode=self.runtime_settings["lighting"]["mode"])
        self.api_client = NocturPodApiClient(self.backend_url, self.token)
        self.spool = SpoolUploader(self.api_client)
        self.capture_ctrl = CaptureController(self.camera, self.api_client, self.spool)
        self.record_ctrl = RecordController(self.camera, self.api_client, self.spool)
        self.streamer = StreamManager(self.camera, self.api_client)
        self.pir_sensor = PIRSensor(
            gpio_pin=int(self.runtime_settings["pir"]["gpio_pin"]),
            on_motion=self._on_pir_motion,
            enabled=self.pir_enabled,
        )
        if self.pir_enabled and not self.pir_sensor.is_hardware_available:
            print(
                "[PIR] CRITICAL: motion capture is enabled in settings but GPIO hardware "
                "did not initialize. Check gpiozero/lgpio installation, permissions, and "
                "HC-SR501 OUT -> BCM GPIO 17 (physical pin 11) / common GND."
            )
        print(f"[PIR] Runtime diagnostic: {self.pir_sensor.get_status()}")
        if self.lighting.pwm_enabled:
            for mode in ("WHITE", "NIGHT"):
                intensity = self.runtime_settings["lighting"].get(f"{mode.lower()}_intensity", 100)
                ok, error = self.lighting.set_intensity(mode, intensity)
                if not ok:
                    print(f"[Lighting] Could not restore {mode} intensity: {error}")

    def heartbeat_worker(self) -> None:
        """Send telemetry on its own schedule; never wait for media uploads."""
        while self.is_running:
            try:
                telemetry = collect_device_telemetry(
                    camera_online=self.camera.is_opened,
                    is_recording=self.record_ctrl.is_recording,
                    light_mode=self.lighting.get_mode()
                )
                self.api_client.send_heartbeat(telemetry)
            except Exception as e:
                print(f"[Heartbeat] Worker error: {e}")
            time.sleep(HEARTBEAT_INTERVAL)

    def upload_worker(self) -> None:
        """Retry queued media independently so large uploads cannot starve heartbeats."""
        while self.is_running:
            try:
                uploaded = self.spool.process_pending_uploads()
                if uploaded:
                    print(f"[Spool] Background worker uploaded {uploaded} pending file(s)")
            except Exception as e:
                print(f"[Spool] Background worker error: {e}")
            time.sleep(2.0)

    def command_poll_worker(self) -> None:
        while self.is_running:
            try:
                commands = self.api_client.poll_commands()
                for cmd in commands:
                    self.execute_command(cmd)
            except Exception as e:
                print(f"[Commands] Worker error: {e}")
            time.sleep(COMMAND_POLL_INTERVAL)

    def execute_command(self, cmd: dict) -> None:
        cmd_id = cmd.get("command_id")
        action = cmd.get("action")
        print(f"[Command] Dispatched: {action} (ID: {cmd_id})")

        if action == "CAPTURE_IMAGE":
            ok, event_id, error = self.capture_ctrl.capture_image()
            if ok:
                self.api_client.ack_command(cmd_id, "EXECUTED")
            else:
                self.api_client.ack_command(cmd_id, "FAILED", error_message=error)

        elif action == "START_RECORDING":
            ok, event_id, error = self.record_ctrl.start_recording()
            if ok:
                self.api_client.ack_command(cmd_id, "EXECUTED")
            else:
                self.api_client.ack_command(cmd_id, "FAILED", error_message=error)

        elif action == "STOP_RECORDING":
            ok, event_id, error = self.record_ctrl.stop_recording()
            if ok:
                self.api_client.ack_command(cmd_id, "EXECUTED")
            else:
                self.api_client.ack_command(cmd_id, "FAILED", error_message=error)

        elif action == "SET_LIGHT_MODE":
            payload = cmd.get("payload") or {}
            mode = str(payload.get("mode", "WHITE")).upper()
            ok, confirmed_mode, error = self.lighting.set_mode(mode)
            if ok:
                self.runtime_settings["lighting"]["mode"] = confirmed_mode
                self.runtime_settings = save_runtime_settings(self.runtime_settings)
                self.api_client.ack_command(cmd_id, "EXECUTED")
                print(f"[Lighting] Successfully applied mode: {confirmed_mode}")
            else:
                self.api_client.ack_command(cmd_id, "FAILED", error_message=error)

        elif action == "SET_LIGHT_INTENSITY":
            payload = cmd.get("payload") or {}
            mode = str(payload.get("mode", "NIGHT")).upper()
            intensity = payload.get("intensity_pct", 100)
            try:
                ok, error = self.lighting.set_intensity(mode, int(intensity))
            except (TypeError, ValueError):
                ok, error = False, "Intensity must be an integer from 0 to 100."
            if ok:
                key = "white_intensity" if mode == "WHITE" else "night_intensity"
                self.runtime_settings["lighting"][key] = max(0, min(100, int(intensity)))
                self.runtime_settings = save_runtime_settings(self.runtime_settings)
                self.api_client.ack_command(cmd_id, "EXECUTED")
            else:
                self.api_client.ack_command(cmd_id, "FAILED", error_message=error)

        elif action == "SET_CAMERA_SETTINGS":
            payload = cmd.get("payload") or {}
            result = self.camera.apply_settings(payload)
            if result.get("success"):
                self.runtime_settings["camera"].update(result.get("settings", {}))
                self.runtime_settings = save_runtime_settings(self.runtime_settings)
                if result.get("unsupported"):
                    print("[Camera] Some controls unsupported by active driver: " + ", ".join(result["unsupported"]))
                self.api_client.ack_command(cmd_id, "EXECUTED")
                print("[Camera] Updated controls: " + ", ".join(result.get("applied", [])))
            else:
                reason = result.get("error") or result.get("message") or "Camera did not accept the settings."
                self.api_client.ack_command(cmd_id, "FAILED", error_message=reason)

        elif action == "SET_PIR_SETTINGS":
            payload = cmd.get("payload") or {}
            enabled = bool(payload.get("enabled", True))
            try:
                cooldown = max(5, min(300, int(payload.get("cooldown_seconds", self.pir_cooldown_seconds))))
            except (TypeError, ValueError):
                cooldown = self.pir_cooldown_seconds
            if self.pir_sensor.set_enabled(enabled):
                self.pir_enabled = enabled
                self.pir_cooldown_seconds = cooldown
                self.runtime_settings["pir"]["enabled"] = enabled
                self.runtime_settings["pir"]["cooldown_seconds"] = cooldown
                self.runtime_settings = save_runtime_settings(self.runtime_settings)
                self.api_client.ack_command(cmd_id, "EXECUTED")
                print(f"[PIR] enabled={enabled}, cooldown={cooldown}s, GPIO BCM {self.pir_sensor.gpio_pin}")
            else:
                message = (
                    "PIR GPIO is not initialized; cannot enable motion capture. "
                    "Install gpiozero/lgpio, verify permissions and wiring, then restart the agent."
                )
                self.api_client.ack_command(cmd_id, "FAILED", error_message=message)
                print(f"[PIR] {message}")

        else:
            self.api_client.ack_command(cmd_id, "UNKNOWN_ACTION", error_message=f"Action {action} unrecognized")

    def _on_pir_motion(self) -> None:
        """Debounce PIR pulses and capture asynchronously so its callback stays responsive."""
        if not self.pir_enabled:
            return
        now = time.monotonic()
        with self._motion_lock:
            if now - self._last_motion_capture < self.pir_cooldown_seconds:
                print("[PIR] Motion pulse ignored during capture cooldown.")
                return
            self._last_motion_capture = now
        threading.Thread(
            target=self._capture_motion_event,
            name="pir-motion-capture",
            daemon=True,
        ).start()

    def _capture_motion_event(self) -> None:
        ok, event_id, error = self.capture_ctrl.capture_image(capture_source="MOTION")
        if ok:
            print(f"[PIR] Motion capture saved and queued: {event_id}")
        else:
            print(f"[PIR] Motion capture failed: {error}")

    def pir_watchdog_worker(self) -> None:
        """Poll the sensor state as a fallback if gpiozero misses a callback edge."""
        while self.is_running:
            try:
                if self.pir_enabled and self.pir_sensor.poll_motion_edge():
                    print("[PIR] Motion edge detected by watchdog poll; dispatching capture.")
                    self._on_pir_motion()
            except Exception as exc:
                print(f"[PIR] Watchdog poll error: {exc}")
            time.sleep(0.20)

    def run(self) -> None:
        # Start background threads
        t_hb = threading.Thread(target=self.heartbeat_worker, name="heartbeat", daemon=True)
        t_cmd = threading.Thread(target=self.command_poll_worker, name="commands", daemon=True)
        t_upload = threading.Thread(target=self.upload_worker, name="media-uploader", daemon=True)
        t_hb.start()
        t_cmd.start()
        t_upload.start()
        t_pir = threading.Thread(target=self.pir_watchdog_worker, name="pir-watchdog", daemon=True)
        t_pir.start()

        print("[NocturPod Agent] Edge daemon running. Streaming real camera frames...")
        try:
            while self.is_running:
                # Active video recording step
                if self.record_ctrl.is_recording:
                    self.record_ctrl.record_step()

                # Live streaming step
                self.streamer.stream_step()
                self.lighting.update_auto_lighting(self.streamer.last_luminance)
                time.sleep(STREAM_FRAME_INTERVAL)
        except KeyboardInterrupt:
            print("\n[NocturPod Agent] Interrupted. Shutting down gracefully...")
        finally:
            self.is_running = False
            self.pir_sensor.close()
            self.lighting.close()
            self.camera.release()



def main() -> None:
    parser = argparse.ArgumentParser(description="NocturPod Raspberry Pi Edge Daemon")
    parser.add_argument("--backend", default=BACKEND_URL, help="Backend URL (e.g. https://nocturpod.onrender.com)")
    parser.add_argument("--token", default=DEVICE_TOKEN, help="Device authentication token")
    args = parser.parse_args()

    agent = NocturPodAgent(backend_url=args.backend, token=args.token)
    agent.run()


if __name__ == "__main__":
    main()
