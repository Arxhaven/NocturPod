"""NocturPod Backend Entrypoint
Maintains backwards compatibility with `python api_server.py` while running the full
production server with streaming, media storage, device management, and AI inference.
"""
from __future__ import annotations

from backend.server import app, run_server

if __name__ == "__main__":
    run_server(host="127.0.0.1", port=5000, debug=False)
