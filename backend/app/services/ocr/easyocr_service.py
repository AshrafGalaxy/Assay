import threading
from typing import List, Dict, Any, Tuple
import logging
import numpy as np

logger = logging.getLogger(__name__)

# Global singleton reader and lock
_easyocr_reader = None
_easyocr_lock = threading.Lock()


def get_easyocr_reader():
    """
    Thread-safe lazy singleton for EasyOCR Reader.
    Initializes the model once into memory.
    """
    global _easyocr_reader
    if _easyocr_reader is None:
        with _easyocr_lock:
            if _easyocr_reader is None:
                import easyocr
                logger.info("Initializing EasyOCR Reader (English)...")
                # gpu=False ensures portable stability across CPU / Apple Silicon environments
                _easyocr_reader = easyocr.Reader(['en'], gpu=False, verbose=False)
                logger.info("EasyOCR Reader initialized successfully.")
    return _easyocr_reader


def sort_ocr_elements_reading_order(
    elements: List[Dict[str, Any]],
    line_y_tolerance_ratio: float = 0.5,
) -> List[Dict[str, Any]]:
    """
    Sorts OCR detected bounding boxes into natural reading order:
    1. Clusters boxes into horizontal lines based on vertical overlap/proximity.
    2. Sorts each line left-to-right.
    3. Sorts lines top-to-bottom.
    """
    if not elements:
        return []

    # Calculate bounding box metrics: y_min, y_max, y_center, x_min, height
    augmented = []
    for el in elements:
        bbox = el.get("bounding_box", [])
        if bbox and len(bbox) >= 4:
            xs = [pt[0] for pt in bbox]
            ys = [pt[1] for pt in bbox]
            x_min, x_max = min(xs), max(xs)
            y_min, y_max = min(ys), max(ys)
            height = max(1.0, y_max - y_min)
            y_center = (y_min + y_max) / 2.0
        else:
            x_min, y_min, height, y_center = 0.0, 0.0, 10.0, 0.0

        augmented.append({
            "data": el,
            "x_min": x_min,
            "y_min": y_min,
            "y_max": y_min + height,
            "height": height,
            "y_center": y_center,
        })

    # Sort primarily by y_min to group into lines
    augmented.sort(key=lambda item: item["y_min"])

    # Group into lines
    lines: List[List[Dict[str, Any]]] = []
    for item in augmented:
        placed = False
        for line in lines:
            # Average height and y_center of current line
            avg_height = sum(member["height"] for member in line) / len(line)
            avg_y_center = sum(member["y_center"] for member in line) / len(line)
            tolerance = max(8.0, avg_height * line_y_tolerance_ratio)

            if abs(item["y_center"] - avg_y_center) <= tolerance:
                line.append(item)
                placed = True
                break

        if not placed:
            lines.append([item])

    # Sort each line left to right, then sort lines by average y
    sorted_elements: List[Dict[str, Any]] = []
    lines.sort(key=lambda line: sum(m["y_center"] for m in line) / len(line))

    for line in lines:
        line.sort(key=lambda m: m["x_min"])
        for member in line:
            sorted_elements.append(member["data"])

    return sorted_elements


class EasyOCRService:
    """Production wrapper for EasyOCR engine."""

    def __init__(self):
        # We don't eagerly block at import time; reader is retrieved on demand or startup
        pass

    def extract_text_and_boxes(
        self,
        image_np: np.ndarray,
    ) -> List[Dict[str, Any]]:
        """
        Executes EasyOCR on numpy image array.
        Returns structured list:
        [
            {
                "text": "Blue Tokai Coffee",
                "confidence": 0.96,
                "bounding_box": [[x1, y1], [x2, y2], [x3, y3], [x4, y4]]
            }
        ]
        """
        reader = get_easyocr_reader()
        
        # EasyOCR readtext returns list of tuples: (bbox, text, prob)
        raw_results = reader.readtext(image_np)

        elements: List[Dict[str, Any]] = []
        for bbox, text, prob in raw_results:
            cleaned_text = str(text).strip()
            if not cleaned_text:
                continue

            # Convert bbox coordinates to standard Python float lists
            box_coords = [[float(pt[0]), float(pt[1])] for pt in bbox]
            confidence = float(prob) if prob is not None else 0.0

            elements.append({
                "text": cleaned_text,
                "confidence": round(confidence, 4),
                "bounding_box": box_coords,
            })

        # Sort into logical receipt reading order
        return sort_ocr_elements_reading_order(elements)
