"""Fine-tune YOLOv8n for drone-view, low-light object detection."""
from ultralytics import YOLO

DATASET = "data/custom_aerial_drone.yaml"


def main() -> None:
    model = YOLO("yolov8n.pt")
    model.train(
        data=DATASET,
        epochs=100,
        imgsz=640,
        batch=16,
        device=0,  # Change to "cpu" or a CUDA device id as appropriate.
        pretrained=True,
        augment=True,
        mosaic=1.0,
        mixup=0.10,
        hsv_v=0.40,
        degrees=5.0,
        translate=0.08,
        scale=0.45,
        fliplr=0.5,
        workers=8,
        project="runs/aerial",
        name="yolov8n_lowlight",
    )


if __name__ == "__main__":
    main()
