"""Normalize evidence once, bounding the text sent to the model."""
import ipaddress
import re
from urllib.parse import urlsplit, urlunsplit

from app.schemas import SourceEvidence

MAX_SOURCE_CHARS = 12000
MAX_TOTAL_CHARS = 60000


def normalize_url(value: str) -> str:
    value = value.strip()
    if "://" not in value:
        value = "https://" + value
    try:
        url = urlsplit(value)
        host = url.hostname or ""
        port = url.port
        if url.scheme not in {"http", "https"} or not host or url.username or url.password:
            raise ValueError
        if host.lower() == "localhost" or host.endswith((".localhost", ".local", ".internal")):
            raise ValueError
        try:
            address = ipaddress.ip_address(host)
        except ValueError:
            if not re.fullmatch(r"[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?", host) or "." not in host:
                raise ValueError
        else:
            if not address.is_global:
                raise ValueError
        if port not in {None, 80, 443}:
            raise ValueError
        return urlunsplit((url.scheme, url.netloc, url.path, url.query, ""))
    except ValueError:
        raise ValueError("Enter a public HTTP(S) website URL or email domain.") from None


def normalize_sources(sources: list[SourceEvidence]) -> list[SourceEvidence]:
    result, seen = [], set()
    remaining = MAX_TOTAL_CHARS
    for source in sources:
        lines = [re.sub(r"\s+", " ", line).strip() for line in source.text.splitlines()]
        # Deduplicate repeated lines within a page, and whole repeated pages/files.
        text = "\n".join(dict.fromkeys(line for line in lines if line))[:MAX_SOURCE_CHARS]
        key = re.sub(r"\s+", " ", text).casefold()
        if not key or key in seen or remaining <= 0:
            continue
        seen.add(key)
        text = text[:remaining]
        result.append(source.model_copy(update={"text": text}))
        remaining -= len(text)
    return result
