"""Test the ready-made object detector on one image and save the result."""
import argparse
from pathlib import Path

import cv2
from ultralytics import YOLO

from inference import apply_adaptive_clahe

# COCO: person, bicycle, car, motorcycle, bus, truck
PEOPLE_AND_VEHICLES = [0, 1, 2, 3, 5, 7]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--image", required=True, help="Path to a JPG or PNG image")
    parser.add_argument("--model", default="yolov8n.pt")
    parser.add_argument("--output", default="detected_image.jpg")
    parser.add_argument("--show", action="store_true")
    args = parser.parse_args()

    image = cv2.imread(args.image)
    if image is None:
        raise FileNotFoundError(f"Cannot read image: {args.image}")

    enhanced = apply_adaptive_clahe(image)
    result = YOLO(args.model)(enhanced, conf=0.30, classes=PEOPLE_AND_VEHICLES, verbose=False)[0]
    annotated = result.plot()
    output = Path(args.output)
    cv2.imwrite(str(output), annotated)
    print(f"Saved result to: {output.resolve()}")
    print(f"Objects found: {len(result.boxes)}")

    if args.show:
        cv2.imshow("AI image test", annotated)
        cv2.waitKey(0)
        cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
