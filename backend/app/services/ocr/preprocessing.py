import cv2
import numpy as np
from typing import Tuple, Optional
import logging

logger = logging.getLogger(__name__)


def bytes_to_cv2_image(image_bytes: bytes) -> np.ndarray:
    """Decodes raw image bytes into an OpenCV BGR numpy array without touching disk."""
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not decode image bytes into valid OpenCV matrix.")
    return img


def resize_image_for_ocr(
    image: np.ndarray,
    min_width: int = 1000,
    max_width: int = 2500,
) -> np.ndarray:
    """
    Resizes image maintaining aspect ratio:
    - Upscales small receipts to ~1000-1600px width so text is legible for OCR
    - Downscales very large images to <= 2500px width for fast processing
    """
    height, width = image.shape[:2]

    if width < min_width:
        scale = min_width / float(width)
        new_width = int(width * scale)
        new_height = int(height * scale)
        return cv2.resize(image, (new_width, new_height), interpolation=cv2.INTER_CUBIC)
    elif width > max_width:
        scale = max_width / float(width)
        new_width = int(width * scale)
        new_height = int(height * scale)
        return cv2.resize(image, (new_width, new_height), interpolation=cv2.INTER_AREA)

    return image.copy()


def correct_skew_angle(image: np.ndarray) -> np.ndarray:
    """
    Detects slight skew angle using Hough lines or minimum area bounding box
    and rotates the image to straighten text lines.
    """
    try:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image.copy()
        thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)[1]
        
        # Find non-zero points
        coords = np.column_stack(np.where(thresh > 0))
        if len(coords) < 100:
            return image

        angle = cv2.minAreaRect(coords)[-1]
        if angle < -45:
            angle = -(90 + angle)
        elif angle > 45:
            angle = 90 - angle
        else:
            angle = -angle

        # Only correct minor tilt (between 0.5 and 20 degrees)
        if 0.5 < abs(angle) < 20.0:
            (h, w) = image.shape[:2]
            center = (w // 2, h // 2)
            M = cv2.getRotationMatrix2D(center, angle, 1.0)
            rotated = cv2.warpAffine(
                image, M, (w, h),
                flags=cv2.INTER_CUBIC,
                borderMode=cv2.BORDER_REPLICATE
            )
            return rotated
    except Exception as e:
        logger.debug(f"Skew correction skipped: {e}")
    return image


def preprocess_receipt_image(
    image_bytes: bytes,
) -> Tuple[np.ndarray, np.ndarray]:
    """
    Multi-step non-destructive OpenCV receipt preprocessing pipeline:
    1. Read original image (kept pristine)
    2. Resize to optimal OCR resolution
    3. Correct slight skew
    4. Grayscale conversion
    5. Bilateral / Gaussian noise reduction (preserves crisp edges)
    6. Contrast enhancement (CLAHE for uneven shadows & thermal fading)
    7. Unsharp mask sharpening (recovers faint thermal/dot-matrix dots)
    8. Adaptive thresholding for binarized version if needed

    Returns:
        (original_bgr, preprocessed_enhanced)
    """
    original = bytes_to_cv2_image(image_bytes)
    
    # 1. Resize
    resized = resize_image_for_ocr(original)

    # 2. Skew correction
    deskewed = correct_skew_angle(resized)

    # 3. Grayscale
    if len(deskewed.shape) == 3:
        gray = cv2.cvtColor(deskewed, cv2.COLOR_BGR2GRAY)
    else:
        gray = deskewed.copy()

    # 4. Noise reduction while preserving character edges
    denoised = cv2.bilateralFilter(gray, d=9, sigmaColor=75, sigmaSpace=75)

    # 5. Contrast enhancement via CLAHE (essential for faded thermal receipts)
    clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
    enhanced = clahe.apply(denoised)

    # 6. Unsharp masking to sharpen faint text characters
    gaussian = cv2.GaussianBlur(enhanced, (0, 0), sigmaX=3)
    sharpened = cv2.addWeighted(enhanced, 1.5, gaussian, -0.5, 0)

    # Convert back to 3-channel for EasyOCR compatibility or return high contrast grayscale
    preprocessed_bgr = cv2.cvtColor(sharpened, cv2.COLOR_GRAY2BGR)

    return original, preprocessed_bgr
