from ast import Tuple
import logging
import shutil
from typing import List, Dict, Any, Optional
import numpy as np
import pytesseract
from pytesseract import Output
from PIL import Image

from app.services.ocr.easyocr_service import sort_ocr_elements_reading_order

logger = logging.getLogger(__name__)


def is_tesseract_available() -> bool:
    """Checks if Tesseract executable is installed on the host system."""
    cmd = pytesseract.pytesseract.tesseract_cmd
    if shutil.which(cmd) is not None:
        return True
    # Common Mac/Linux paths check
    for fallback_path in [
        "/opt/homebrew/bin/tesseract",
        "/usr/local/bin/tesseract",
        "/usr/bin/tesseract",
    ]:
        if shutil.which(fallback_path) is not None:
            pytesseract.pytesseract.tesseract_cmd = fallback_path
            return True
    return False


class TesseractService:
    """Fallback OCR Engine using PyTesseract."""

    def __init__(self):
        self._available = is_tesseract_available()
        if not self._available:
            logger.warning("Tesseract binary not found in system path. Fallback will not be active.")

    @property
    def is_available(self) -> bool:
        return is_tesseract_available()

    def extract_text_and_boxes(
        self,
        image_np: np.ndarray,
    ) -> List[Dict[str, Any]]:
        """
        Executes PyTesseract on numpy image array.
        Returns elements with text, confidence (0.0 - 1.0), and bounding box.
        """
        if not self.is_available:
            raise RuntimeError("Tesseract OCR binary is not installed or available on this system.")

        # Convert numpy array to PIL Image
        if len(image_np.shape) == 3:
            pil_img = Image.fromarray(image_np)
        else:
            pil_img = Image.fromarray(image_np).convert("RGB")

        # Use image_to_data with PSM 6 or 4 (sparse/uniform receipt text blocks)
        custom_config = r'--oem 3 --psm 6'
        data = pytesseract.image_to_data(pil_img, config=custom_config, output_type=Output.DICT)

        elements: List[Dict[str, Any]] = []
        n_boxes = len(data['text'])

        # Group words by line_num and block_num to reconstruct natural text fragments
        line_map: Dict[Tuple[int, int], List[Dict[str, Any]]] = {}

        for i in range(n_boxes):
            text = data['text'][i].strip()
            conf_str = data['conf'][i]

            try:
                conf = float(conf_str)
            except (ValueError, TypeError):
                conf = -1.0

            if not text or conf < 0:
                continue

            x = float(data['left'][i])
            y = float(data['top'][i])
            w = float(data['width'][i])
            h = float(data['height'][i])

            block_num = data['block_num'][i]
            line_num = data['line_num'][i]
            key = (block_num, line_num)

            if key not in line_map:
                line_map[key] = []

            line_map[key].append({
                "text": text,
                "confidence": max(0.0, min(1.0, conf / 100.0)),
                "x": x,
                "y": y,
                "w": w,
                "h": h,
            })

        for key, words in line_map.items():
            if not words:
                continue

            # Join words on the same line
            combined_text = " ".join(w["text"] for w in words)
            avg_conf = sum(w["confidence"] for w in words) / len(words)

            x1 = min(w["x"] for w in words)
            y1 = min(w["y"] for w in words)
            x2 = max(w["x"] + w["w"] for w in words)
            y2 = max(w["y"] + w["h"] for w in words)

            bbox = [[x1, y1], [x2, y1], [x2, y2], [x1, y2]]

            elements.append({
                "text": combined_text,
                "confidence": round(avg_conf, 4),
                "bounding_box": bbox,
            })

        return sort_ocr_elements_reading_order(elements)
