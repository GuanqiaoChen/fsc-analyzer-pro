"""One homepage plus up to four relevant same-site pages, never a full crawl."""
from concurrent.futures import ThreadPoolExecutor
import os
from urllib.parse import urljoin, urlsplit, urlunsplit

import httpx

from app.schemas import SourceEvidence
from app.services.sources import normalize_url

PREFERRED = ("about", "products", "services", "capabilities")


def extract_website(url: str) -> tuple[list[SourceEvidence], list[str]]:
    key = os.getenv("FIRECRAWL_API_KEY", "").strip()
    if not key:
        return [], ["Website extraction unavailable: FIRECRAWL_API_KEY is not configured."]
    sources, warnings = [], []
    with httpx.Client(timeout=25, headers={"Authorization": f"Bearer {key}"}) as client:
        def scrape(page_url: str):
            try:
                response = client.post("https://api.firecrawl.dev/v2/scrape", json={
                    "url": page_url, "formats": ["markdown", "links"],
                    "onlyMainContent": True, "timeout": 20000,
                })
                response.raise_for_status()
                payload = response.json()
                data = payload.get("data") or {}
                if not payload.get("success") or data.get("metadata", {}).get("statusCode", 200) >= 400:
                    raise ValueError("Unsuccessful scrape")
                text = data.get("markdown", "")
                if not isinstance(text, str) or not text.strip():
                    raise ValueError("Empty scrape")
                return SourceEvidence(sourceType="website", sourceName=page_url, text=text), data.get("links", [])
            except (httpx.HTTPError, ValueError, TypeError, AttributeError):
                return None, []

        homepage, links = scrape(url)
        if homepage is None:
            return [], [f"Website extraction failed for {url}. Using other available sources."]
        sources.append(homepage)
        parsed = urlsplit(url)
        origin = urlunsplit((parsed.scheme, parsed.netloc, "/", "", ""))
        pages = []
        for link in links if isinstance(links, list) else []:
            if not isinstance(link, str):
                continue
            try:
                candidate = normalize_url(urljoin(origin, link))
            except ValueError:
                continue
            candidate_parts = urlsplit(candidate)
            same_site = (candidate_parts.hostname or "").removeprefix("www.") == (parsed.hostname or "").removeprefix("www.")
            if same_site and any(part in candidate_parts.path.lower() for part in PREFERRED):
                if candidate.rstrip("/") != url.rstrip("/") and candidate not in pages:
                    pages.append(candidate)
        # Use actual discovered links when possible; fall back to a few common paths.
        if not pages:
            pages = [urljoin(origin, path) for path in PREFERRED if urljoin(origin, path).rstrip("/") != url.rstrip("/")]
        pages = pages[:4]
        with ThreadPoolExecutor(max_workers=4) as pool:
            for page_url, (source, _) in zip(pages, pool.map(scrape, pages)):
                if source:
                    sources.append(source)
                else:
                    warnings.append(f"Website page could not be extracted: {page_url}. Results use available pages.")
    return sources, warnings
