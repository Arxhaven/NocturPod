"""Small HTTP API for a separate frontend to send images to the detector."""
from __future__ import annotations

import os
import tempfile
from pathlib import Path

import cv2
from flask import Flask, jsonify, request, send_file
from ultralytics import YOLO

from inference import apply_adaptive_clahe

app = Flask(__name__)
MODEL = YOLO(os.getenv("MODEL_PATH", "yolov8n.pt"))
CLASSES = [0, 1, 2, 3, 5, 7]  # person, bicycle, car, motorcycle, bus, truck


@app.get("/health")
def health():
    return jsonify(status="ok", model="yolov8n.pt")


@app.post("/detect")
def detect():
    """Upload an image in form field `image`; return detected objects as JSON."""
    uploaded = request.files.get("image")
    if uploaded is None or not uploaded.filename:
        return jsonify(error="Send an image using form field named 'image'."), 400
    raw = uploaded.read()
    image = cv2.imdecode(__import__("numpy").frombuffer(raw, __import__("numpy").uint8), cv2.IMREAD_COLOR)
    if image is None:
        return jsonify(error="The uploaded file is not a readable image."), 400
    result = MODEL(apply_adaptive_clahe(image), conf=0.30, classes=CLASSES, verbose=False)[0]
    objects = []
    for box in result.boxes:
        class_id = int(box.cls[0])
        objects.append({
            "label": result.names[class_id],
            "confidence": round(float(box.conf[0]), 4),
            "box": [round(float(value), 1) for value in box.xyxy[0].tolist()],
        })
    return jsonify(objects=objects, count=len(objects))


@app.post("/detect-image")
def detect_image():
    """Upload an image and receive a JPG with bounding boxes drawn on it."""
    uploaded = request.files.get("image")
    if uploaded is None or not uploaded.filename:
        return jsonify(error="Send an image using form field named 'image'."), 400
    image = cv2.imdecode(__import__("numpy").frombuffer(uploaded.read(), __import__("numpy").uint8), cv2.IMREAD_COLOR)
    if image is None:
        return jsonify(error="The uploaded file is not a readable image."), 400
    result = MODEL(apply_adaptive_clahe(image), conf=0.30, classes=CLASSES, verbose=False)[0]
    output = Path(tempfile.mkstemp(suffix=".jpg")[1])
    cv2.imwrite(str(output), result.plot())
    return send_file(output, mimetype="image/jpeg", download_name="detected.jpg")


if __name__ == "__main__":
    # Use localhost while developing; a production deployment needs authentication and HTTPS.
    app.run(host="127.0.0.1", port=5000, debug=False)
