from types import SimpleNamespace
from unittest.mock import Mock

import httpx
import pytest

from app.schemas import CompanyProfile, RankedCandidates, SourceEvidence
from app.services.document_extractor import extract_pdf
from app.services.fsc_ranker import validate_recommendations
from app.services.fsc_retriever import get_retriever
from app.services.llm import LLMError, structured_output
from app.services.sources import normalize_sources, normalize_url
from app.services.website_extractor import extract_website


def test_pdf_extraction(pdf_bytes):
    assert "stainless steel wire rope" in extract_pdf(pdf_bytes)


def test_broken_pdf():
    with pytest.raises(ValueError):
        extract_pdf(b"not a PDF")


def test_normalize_and_deduplicate():
    sources = [SourceEvidence(sourceType="manual", sourceName=str(index), text=text)
               for index, text in enumerate([" Wire   rope\n\nWire rope ", "Wire rope", "  "])]
    result = normalize_sources(sources)
    assert len(result) == 1
    assert result[0].text == "Wire rope"


@pytest.mark.parametrize("url", ["file:///etc/passwd", "http://localhost", "http://127.0.0.1", "invalid", "https://user:password@example.com"])
def test_reject_invalid_urls(url):
    with pytest.raises(ValueError):
        normalize_url(url)


def test_retrieve_catalog(profile):
    retriever = get_retriever()
    records = retriever.retrieve(profile)
    assert 0 < len(records) <= 20
    assert "4010" in {record.code for record in records}
    assert len(retriever.catalog) > 500
    assert all(len(code) == 4 and code.isascii() and code.isdigit() for code in retriever.catalog)


def test_no_overlap_means_no_candidates(profile):
    for field in ("products", "services", "capabilities", "materials", "industries", "keywords"):
        setattr(profile, field, [])
    assert get_retriever().retrieve(profile) == []


def test_invalid_duplicate_outside_candidate_and_ungrounded_codes(profile):
    retriever = get_retriever()
    raw = [{"code": code, "score": 0.8, "rationale": "Supported product.", "evidence": ["wire rope"]}
           for code in ["99999", "0000", "ABCD", "４０１０", "4010", "4010", "1560"]]
    raw.append({"code": "4020", "score": 0.9, "rationale": "Invented.", "evidence": ["not in profile"]})
    result = validate_recommendations(RankedCandidates(recommendations=raw), profile,
                                     [retriever.catalog["4010"], retriever.catalog["4020"]], retriever.catalog)
    assert [item.code for item in result] == ["4010"]
    assert result[0].description == "Chain and Wire Rope"


def test_structured_output_retries_once(monkeypatch, profile):
    parse = Mock(side_effect=[SimpleNamespace(output_parsed=None), SimpleNamespace(output_parsed=profile)])
    client = SimpleNamespace(responses=SimpleNamespace(parse=parse))
    monkeypatch.setattr("app.services.llm.get_client", lambda: client)
    assert structured_output("Extract", "Evidence", CompanyProfile) == profile
    assert parse.call_count == 2


def test_malformed_output_never_escapes(monkeypatch):
    parse = Mock(return_value=SimpleNamespace(output_parsed={"summary": 123}))
    monkeypatch.setattr("app.services.llm.get_client", lambda: SimpleNamespace(responses=SimpleNamespace(parse=parse)))
    with pytest.raises(LLMError):
        structured_output("Extract", "Evidence", CompanyProfile)
    assert parse.call_count == 2


def test_website_is_shallow_and_returns_markdown(monkeypatch):
    calls = []

    def post(self, url, **kwargs):
        calls.append(kwargs["json"])
        data = {"markdown": "We manufacture wire rope.", "links": [f"https://example.com/products/{i}" for i in range(10)]}
        return httpx.Response(200, json={"success": True, "data": data}, request=httpx.Request("POST", url))

    monkeypatch.setenv("FIRECRAWL_API_KEY", "test-only")
    monkeypatch.setattr(httpx.Client, "post", post)
    sources, warnings = extract_website("https://example.com")
    assert sources and sources[0].text == "We manufacture wire rope."
    assert len(calls) <= 5
    assert all(call["onlyMainContent"] for call in calls)


def test_website_timeout_is_warning(monkeypatch):
    monkeypatch.setenv("FIRECRAWL_API_KEY", "test-only")
    monkeypatch.setattr(httpx.Client, "post", Mock(side_effect=httpx.ReadTimeout("timeout")))
    sources, warnings = extract_website("https://example.com")
    assert sources == []
    assert warnings
