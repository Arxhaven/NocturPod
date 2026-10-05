"""NocturPod Edge Hardware & Scenario Simulator
Allows automated testing and development without requiring physical Raspberry Pi hardware.
Simulates device states: online, offline, camera failure, network interruption, local spooling,
and runs the acceptance test matrix.
"""
from __future__ import annotations

import argparse
import datetime
import io
import json
import sys
import time
from pathlib import Path
from typing import Any

# Ensure project root is in sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import cv2
import numpy as np
import requests

DEFAULT_BACKEND = "http://127.0.0.1:5000"
TOKEN = "nocturpod-sec-key-2026"
HEADERS = {"X-Device-Token": TOKEN}
SPOOL_DIR = Path("storage") / "edge_spool"
SPOOL_DIR.mkdir(parents=True, exist_ok=True)


def simulate_heartbeat(backend: str = DEFAULT_BACKEND, status: str = "ONLINE", camera_status: str = "ONLINE") -> dict[str, Any]:
    payload = {
        "device_id": "nocturpod-edge-01",
        "device_name": "NocturPod α-1",
        "hardware_model": "Raspberry Pi 4 Model B (8GB)",
        "camera_model": "OmniVision OV5647 Night-Vision IR-Cut",
        "status": status,
        "camera_status": camera_status,
        "wifi_status": "CONNECTED",
        "wifi_ssid": "NocturNet-Secure-5G",
        "wifi_rssi": -48,
        "ip_address": "192.168.1.142",
        "storage_used_gb": 8.4,
        "storage_total_gb": 64.0,
        "cpu_temp_c": 47.8,
        "cpu_usage_percent": 18.5,
        "ram_usage_percent": 34.0,
        "uptime_seconds": 7200,
        "software_version": "1.2.0"
    }
    res = requests.post(f"{backend}/api/device/heartbeat", json=payload, headers=HEADERS, timeout=4.0)
    return res.json()


def simulate_capture(backend: str = DEFAULT_BACKEND) -> dict[str, Any]:
    # Generate synthetic night vision frame
    img = np.zeros((720, 1280, 3), dtype=np.uint8)
    img[:] = (25, 32, 25)
    cv2.putText(img, "SIMULATED CAPTURE // OV5647 IR", (60, 80), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 255, 120), 2)
    # Add a person silhouette
    cv2.rectangle(img, (500, 200), (680, 580), (70, 90, 70), -1)
    cv2.circle(img, (590, 160), 45, (80, 100, 80), -1)

    _, buf = cv2.imencode(".jpg", img)
    event_id = f"NP_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}_{int(time.time()*1000)%1000:03d}"

    files = {"file": (f"{event_id}.jpg", buf.tobytes(), "image/jpeg")}
    data = {"event_id": event_id, "media_type": "IMAGE", "duration": "0s"}
    res = requests.post(f"{backend}/api/media/upload", files=files, data=data, headers=HEADERS, timeout=10.0)
    return res.json()


def simulate_recording(backend: str = DEFAULT_BACKEND, duration_sec: int = 3) -> dict[str, Any]:
    event_id = f"NP_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}_{int(time.time()*1000)%1000:03d}"
    tmp_path = SPOOL_DIR / f"{event_id}.mp4"
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(str(tmp_path), fourcc, 20.0, (640, 480))

    for i in range(duration_sec * 20):
        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        frame[:] = (30, 40, 30)
        cv2.putText(frame, f"REC // {event_id} // F:{i}", (40, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 1)
        writer.write(frame)
    writer.release()

    with open(tmp_path, "rb") as f:
        files = {"file": (tmp_path.name, f, "video/mp4")}
        data = {"event_id": event_id, "media_type": "VIDEO", "duration": f"00:0{duration_sec}"}
        res = requests.post(f"{backend}/api/media/upload", files=files, data=data, headers=HEADERS, timeout=10.0)
    
    tmp_path.unlink(missing_ok=True)
    return res.json()


def simulate_ai_failure(backend: str = DEFAULT_BACKEND) -> dict[str, Any]:
    """Sends invalid image content to verify AI failure isolation."""
    event_id = f"NP_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}_{int(time.time()*1000)%1000:03d}"
    corrupted_data = b"NOT_A_VALID_JPEG_HEADER_CORRUPTED_STREAM"
    files = {"file": (f"{event_id}.jpg", corrupted_data, "image/jpeg")}
    data = {"event_id": event_id, "media_type": "IMAGE"}
    res = requests.post(f"{backend}/api/media/upload", files=files, data=data, headers=HEADERS, timeout=5.0)
    return res.json()


def simulate_offline_spool_and_recovery(backend: str = DEFAULT_BACKEND) -> dict[str, Any]:
    """Queues capture to local spool without network, then flushes once network returns."""
    event_id = f"NP_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}_{int(time.time()*1000)%1000:03d}"
    spool_file = SPOOL_DIR / f"{event_id}.jpg"
    meta_file = SPOOL_DIR / f"{event_id}.jpg.meta"

    img = np.zeros((480, 640, 3), dtype=np.uint8)
    img[:] = (20, 25, 20)
    cv2.putText(img, "OFFLINE BUFFERED SNAPSHOT", (40, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 200, 255), 1)
    cv2.imwrite(str(spool_file), img)

    meta_file.write_text(json.dumps({
        "event_id": event_id,
        "media_type": "IMAGE",
        "duration": "0s",
        "timestamp": datetime.datetime.now().isoformat()
    }), encoding="utf-8")

    print(f"[Simulator] Spooled offline capture {event_id}. Verifying buffer...")
    assert spool_file.exists() and meta_file.exists(), "Spool files failed to write"

    # Now simulate network return and flush
    print("[Simulator] Network returned. Flushing spool to backend...")
    with open(spool_file, "rb") as f:
        files = {"file": (spool_file.name, f, "image/jpeg")}
        data = {"event_id": event_id, "media_type": "IMAGE"}
        res = requests.post(f"{backend}/api/media/upload", files=files, data=data, headers=HEADERS, timeout=10.0)

    spool_file.unlink(missing_ok=True)
    meta_file.unlink(missing_ok=True)
    return res.json()


def run_acceptance_tests(backend: str = DEFAULT_BACKEND) -> None:
    print("=================================================================")
    print("NOCTURPOD SYSTEM ACCEPTANCE VERIFICATION MATRIX")
    print("=================================================================")
    results: list[tuple[str, bool, str]] = []

    # TEST 1: Pi boots -> backend sees device ONLINE
    try:
        hb = simulate_heartbeat(backend, status="ONLINE", camera_status="ONLINE")
        dev = requests.get(f"{backend}/api/device/status").json()
        pass_t1 = dev.get("status") == "ONLINE"
        results.append(("TEST 1: Pi boots -> backend sees device ONLINE", pass_t1, f"Status: {dev.get('status')}"))
    except Exception as e:
        results.append(("TEST 1: Pi boots -> backend sees device ONLINE", False, str(e)))

    # TEST 2: Pi camera is available -> dashboard shows camera ONLINE
    try:
        dev = requests.get(f"{backend}/api/device/status").json()
        pass_t2 = dev.get("cameraStatus") == "ONLINE"
        results.append(("TEST 2: Pi camera is available -> dashboard shows camera ONLINE", pass_t2, f"Cam Status: {dev.get('cameraStatus')}"))
    except Exception as e:
        results.append(("TEST 2: Pi camera is available -> dashboard shows camera ONLINE", False, str(e)))

    # TEST 3: Dashboard opens Live Monitor -> real stream appears
    try:
        res = requests.get(f"{backend}/api/stream/live", stream=True, timeout=5.0)
        chunk = next(res.iter_content(chunk_size=1024))
        pass_t3 = res.status_code == 200 and b"--frame" in chunk
        results.append(("TEST 3: Dashboard opens Live Monitor -> stream responds with MJPEG frames", pass_t3, f"Code: {res.status_code}"))
    except Exception as e:
        results.append(("TEST 3: Dashboard opens Live Monitor -> stream responds with MJPEG frames", False, str(e)))

    # TEST 4: User requests capture -> Pi captures -> backend receives -> image appears
    try:
        cap_res = simulate_capture(backend)
        event_id = cap_res.get("event_id")
        imgs = requests.get(f"{backend}/api/media/images").json()
        found = any(i.get("eventId") == event_id or i.get("id") == f"med_{event_id}" for i in imgs)
        results.append(("TEST 4: Image capture -> backend receives -> image in Images list", found, f"Event: {event_id}"))
    except Exception as e:
        results.append(("TEST 4: Image capture -> backend receives -> image in Images list", False, str(e)))

    # TEST 5: Captured image processed by AI -> detection appears in AI/Event UI
    try:
        ev = requests.get(f"{backend}/api/events/{event_id}").json()
        pass_t5 = ev.get("aiStatus") == "COMPLETE"
        results.append(("TEST 5: Captured image processed by AI -> detection committed to event", pass_t5, f"AI Status: {ev.get('aiStatus')}"))
    except Exception as e:
        results.append(("TEST 5: Captured image processed by AI -> detection committed to event", False, str(e)))

    # TEST 6: User starts recording -> Pi records -> stop -> video in Footage
    try:
        rec_res = simulate_recording(backend, duration_sec=2)
        rec_event_id = rec_res.get("event_id")
        footage = requests.get(f"{backend}/api/media/footage").json()
        found_vid = any(rec_event_id in (v.get("id") or "") or rec_event_id in (v.get("videoUrl") or "") for v in footage)
        results.append(("TEST 6: Video recorded -> video appears in Footage screen", found_vid, f"Clip: {rec_event_id}"))
    except Exception as e:
        results.append(("TEST 6: Video recorded -> video appears in Footage screen", False, str(e)))

    # TEST 7: Pi loses network -> dashboard shows offline after heartbeat timeout
    try:
        # Simulate timeout by updating DB last_heartbeat to 20 seconds ago
        from backend.database import get_connection
        with get_connection() as conn:
            old_time = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(seconds=25)).isoformat()
            conn.execute("UPDATE devices SET last_heartbeat = ? WHERE device_id = 'nocturpod-edge-01'", (old_time,))
            conn.commit()
        dev = requests.get(f"{backend}/api/device/status").json()
        pass_t7 = dev.get("status") == "OFFLINE"
        results.append(("TEST 7: Pi loses heartbeat -> device marked OFFLINE", pass_t7, f"Status: {dev.get('status')}"))
    except Exception as e:
        results.append(("TEST 7: Pi loses heartbeat -> device marked OFFLINE", False, str(e)))

    # Restore heartbeat
    simulate_heartbeat(backend, status="ONLINE", camera_status="ONLINE")

    # TEST 8: Network returns -> Pi reconnects and uploads queued events
    try:
        spool_res = simulate_offline_spool_and_recovery(backend)
        pass_t8 = spool_res.get("status") == "SUCCESS"
        results.append(("TEST 8: Network returns -> Pi flushes offline spool buffer", pass_t8, f"Result: {spool_res.get('status')}"))
    except Exception as e:
        results.append(("TEST 8: Network returns -> Pi flushes offline spool buffer", False, str(e)))

    # TEST 9: AI fails -> event remains available, UI shows failure without crashing
    try:
        fail_res = simulate_ai_failure(backend)
        fail_event_id = fail_res.get("event_id")
        ev_fail = requests.get(f"{backend}/api/events/{fail_event_id}").json()
        pass_t9 = ev_fail is not None and "event_id" in ev_fail
        results.append(("TEST 9: AI fails -> event remains available, no crash", pass_t9, f"Event retained: {fail_event_id}"))
    except Exception as e:
        results.append(("TEST 9: AI fails -> event remains available, no crash", False, str(e)))

    # TEST 10: Systemd service unit exists & configured for auto-restart
    try:
        unit_file = Path("agent") / "nocturpod-agent.service"
        unit_text = unit_file.read_text(encoding="utf-8")
        pass_t10 = "Restart=always" in unit_text and "ExecStart=" in unit_text
        results.append(("TEST 10: Systemd unit configured with auto-restart", pass_t10, f"File: {unit_file.name}"))
    except Exception as e:
        results.append(("TEST 10: Systemd unit configured with auto-restart", False, str(e)))

    print("\nRESULTS SUMMARY:")
    all_passed = True
    for name, passed, detail in results:
        status_str = "[PASS]" if passed else "[FAIL]"
        if not passed:
            all_passed = False
        print(f"{status_str} {name} | {detail}")
    print("-----------------------------------------------------------------")
    print("ALL 10 ACCEPTANCE SCENARIOS PASSED!" if all_passed else "SOME ACCEPTANCE TESTS FAILED!")
    print("=================================================================")


def main():
    parser = argparse.ArgumentParser(description="NocturPod Edge Simulator & Test Suite")
    parser.add_argument("--backend", default=DEFAULT_BACKEND)
    parser.add_argument("--scenario", choices=["device-online", "device-offline", "capture-image", "record-video", "ai-failure", "network-drop", "network-restore"])
    parser.add_argument("--run-all-tests", action="store_true", help="Execute complete 10-test acceptance matrix")
    args = parser.parse_args()

    if args.run_all_tests:
        run_acceptance_tests(args.backend)
    elif args.scenario == "device-online":
        print(simulate_heartbeat(args.backend, "ONLINE", "ONLINE"))
    elif args.scenario == "device-offline":
        print(simulate_heartbeat(args.backend, "OFFLINE", "OFFLINE"))
    elif args.scenario == "capture-image":
        print(simulate_capture(args.backend))
    elif args.scenario == "record-video":
        print(simulate_recording(args.backend))
    elif args.scenario == "ai-failure":
        print(simulate_ai_failure(args.backend))
    elif args.scenario == "network-drop":
        print(simulate_offline_spool_and_recovery(args.backend))
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
