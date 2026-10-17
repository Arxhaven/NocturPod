"""Gunicorn defaults for the Railway deployment.

This config is also picked up when a dashboard Start Command invokes gunicorn
without explicitly setting worker class or threading options. The long-lived
MJPEG route needs threaded workers so it does not block heartbeats or APIs.
"""
import os

bind = f"0.0.0.0:{os.environ.get('PORT', '8080')}"
worker_class = "gthread"
workers = 1
threads = 8
timeout = 120
graceful_timeout = 30
keepalive = 5
accesslog = "-"
errorlog = "-"
loglevel = "info"
