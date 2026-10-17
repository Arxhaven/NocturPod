FROM python:3.11-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8080

WORKDIR /app

# Runtime libraries used by NumPy/OpenCV and the headless inference pipeline.
RUN apt-get update && apt-get install -y --no-install-recommends \
      libglib2.0-0 \
      libgl1 \
      libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
RUN mkdir -p /app/storage/media

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:' + __import__('os').getenv('PORT', '8080') + '/health', timeout=4)" || exit 1

CMD ["sh", "-c", "exec gunicorn --config gunicorn.conf.py --bind 0.0.0.0:${PORT:-8080} --worker-class gthread --workers 1 --threads 8 --timeout 120 backend.server:app"]
