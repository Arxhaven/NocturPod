import os
from backend.server import app, run_server

if __name__ == "__main__":
    port = int(os.getenv("PORT", "5000"))
    host = os.getenv("HOST", "0.0.0.0")
    run_server(host=host, port=port, debug=False)
