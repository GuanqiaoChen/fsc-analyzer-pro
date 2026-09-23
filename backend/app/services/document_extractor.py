"""Text PDFs only: OCR is deliberately outside this time-boxed MVP."""
import pymupdf

MAX_FILE_BYTES = 10 * 1024 * 1024
MAX_PAGES = 50


def extract_pdf(content: bytes) -> str:
    if not content or len(content) > MAX_FILE_BYTES:
        raise ValueError("PDF must be nonempty and at most 10 MB.")
    try:
        with pymupdf.open(stream=content, filetype="pdf") as document:
            if document.needs_pass:
                raise ValueError("Password-protected PDFs are not supported.")
            if len(document) > MAX_PAGES:
                raise ValueError("PDF must have at most 50 pages.")
            text = "\n".join(page.get_text() for page in document).strip()
    except (pymupdf.FileDataError, RuntimeError) as error:
        raise ValueError("Could not read this PDF.") from error
    if not text:
        raise ValueError("PDF has no extractable text; scanned documents need OCR.")
    return text
