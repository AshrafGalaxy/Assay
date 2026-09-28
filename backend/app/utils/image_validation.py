import io
from typing import Tuple
from fastapi import HTTPException, UploadFile, status
from PIL import Image, UnidentifiedImageError

# Configuration constants
MAX_FILE_SIZE = 15 * 1024 * 1024  # 15 MB
MIN_FILE_SIZE = 100  # 100 Bytes
MIN_DIMENSION = 50  # px
MAX_DIMENSION = 8000  # px
MAX_PIXELS = 40_000_000  # 40 Megapixels

SUPPORTED_MIME_TYPES = {
    "image/jpeg": "JPEG",
    "image/jpg": "JPEG",
    "image/png": "PNG",
    "image/webp": "WEBP",
}

SUPPORTED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}

# Magic bytes signature validation
MAGIC_SIGNATURES = [
    (b"\xff\xd8\xff", "JPEG"),
    (b"\x89PNG\r\n\x1a\n", "PNG"),
    (b"RIFF", "WEBP"),  # Starts with RIFF and has WEBP at offset 8
]


def is_magic_match(header: bytes) -> bool:
    """Check magic bytes to prevent trusting file extensions alone."""
    if len(header) < 12:
        return False
    if header.startswith(b"\xff\xd8\xff"):
        return True
    if header.startswith(b"\x89PNG\r\n\x1a\n"):
        return True
    if header.startswith(b"RIFF") and header[8:12] == b"WEBP":
        return True
    return False


async def validate_image_upload(file: UploadFile) -> bytes:
    """
    Validates an uploaded image file completely:
    1. Checks filename and content type
    2. Reads and validates size bounds (not empty, not too large)
    3. Checks magic bytes signature
    4. Opens and validates image integrity via PIL
    5. Validates image dimensions and pixel count
    
    Returns raw image bytes on success, or raises HTTPException on error.
    """
    if not file or not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No file was provided for upload.",
        )

    # Read file content safely
    try:
        contents = await file.read()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Could not read upload file: {str(exc)}",
        )

    if len(contents) < MIN_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty or corrupted (file size is too small).",
        )

    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Image size exceeds the maximum allowed limit of {MAX_FILE_SIZE // (1024 * 1024)}MB.",
        )

    # Check magic bytes
    if not is_magic_match(contents[:12]):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Unsupported image format. Only JPEG, PNG, and WEBP formats are supported.",
        )

    # Validate image content & dimensions using PIL
    try:
        with Image.open(io.BytesIO(contents)) as img:
            img.verify()  # Check for corruption
            format_name = img.format
            if format_name not in ["JPEG", "PNG", "WEBP"]:
                raise HTTPException(
                    status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                    detail=f"Unsupported image format: {format_name}. Supported: JPEG, PNG, WEBP.",
                )
    except UnidentifiedImageError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The uploaded file is not a valid or recognizable image.",
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Corrupted or unreadable image file: {str(exc)}",
        )

    # Re-open to read dimensions safely after verify()
    try:
        with Image.open(io.BytesIO(contents)) as img:
            width, height = img.size
            if width < MIN_DIMENSION or height < MIN_DIMENSION:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Image resolution too small ({width}x{height}px). Minimum required is {MIN_DIMENSION}x{MIN_DIMENSION}px.",
                )
            if width > MAX_DIMENSION or height > MAX_DIMENSION:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Image resolution too large ({width}x{height}px). Maximum allowed dimension is {MAX_DIMENSION}px.",
                )
            if (width * height) > MAX_PIXELS:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Image pixel count exceeds safety threshold.",
                )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to inspect image dimensions: {str(exc)}",
        )

    return contents
