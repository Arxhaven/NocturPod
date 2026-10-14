"""Export a trained model to NCNN for ARM/NEON Raspberry Pi inference."""
import argparse
from ultralytics import YOLO


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--weights", default="runs/aerial/yolov8n_lowlight/weights/best.pt")
    parser.add_argument("--imgsz", type=int, default=640)
    args = parser.parse_args()
    model = YOLO(args.weights)
    destination = model.export(format="ncnn", imgsz=args.imgsz, half=False)
    print(f"NCNN model exported to: {destination}")


if __name__ == "__main__":
    main()
