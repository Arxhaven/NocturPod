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
from agent.stream import StreamManager
from agent.uploader import SpoolUploader


class NocturPodAgent:
    def __init__(self, backend_url: str = BACKEND_URL, token: str = DEVICE_TOKEN) -> None:
        self.backend_url = backend_url
        self.token = token
        self.is_running = True

        print(f"[NocturPod Agent] Starting edge node '{DEVICE_ID}' targeting backend: {self.backend_url}")

        self.camera = OV5647Camera()
        self.api_client = NocturPodApiClient(self.backend_url, self.token)
        self.spool = SpoolUploader(self.api_client)
        self.capture_ctrl = CaptureController(self.camera, self.api_client, self.spool)
        self.record_ctrl = RecordController(self.camera, self.api_client, self.spool)
        self.streamer = StreamManager(self.camera, self.api_client)

    def heartbeat_worker(self) -> None:
        while self.is_running:
            try:
                telemetry = collect_device_telemetry(
                    camera_online=self.camera.is_opened,
                    is_recording=self.record_ctrl.is_recording
                )
                self.api_client.send_heartbeat(telemetry)
                # Also process any pending offline spooled uploads
                self.spool.process_pending_uploads()
            except Exception as e:
                pass
            time.sleep(HEARTBEAT_INTERVAL)

    def command_poll_worker(self) -> None:
        while self.is_running:
            try:
                commands = self.api_client.poll_commands()
                for cmd in commands:
                    self.execute_command(cmd)
            except Exception as e:
                pass
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

        else:
            self.api_client.ack_command(cmd_id, "UNKNOWN_ACTION", error_message=f"Action {action} unrecognized")

    def run(self) -> None:
        # Start background threads
        t_hb = threading.Thread(target=self.heartbeat_worker, name="heartbeat", daemon=True)
        t_cmd = threading.Thread(target=self.command_poll_worker, name="commands", daemon=True)
        t_hb.start()
        t_cmd.start()

        print("[NocturPod Agent] Edge daemon running. Streaming real camera frames...")
        try:
            while self.is_running:
                # Active video recording step
                if self.record_ctrl.is_recording:
                    self.record_ctrl.record_step()

                # Live streaming step
                self.streamer.stream_step()
                time.sleep(STREAM_FRAME_INTERVAL)
        except KeyboardInterrupt:
            print("\n[NocturPod Agent] Interrupted. Shutting down gracefully...")
        finally:
            self.is_running = False
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
