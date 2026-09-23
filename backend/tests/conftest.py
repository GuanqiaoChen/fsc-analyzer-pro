"""All automated tests are offline; external service seams are mocked."""
from unittest.mock import Mock

import pymupdf
import pytest
from fastapi.testclient import TestClient

from app import main
from app.schemas import CompanyProfile, RankedCandidates, SourceEvidence


@pytest.fixture
def profile():
    return CompanyProfile(
        companyName="Unseen Cable Works", summary="Manufactures stainless steel wire rope.",
        products=["wire rope", "chain"], services=[], capabilities=["wire rope manufacturing"],
        materials=["stainless steel"], industries=["aerospace"], keywords=["wire rope"],
    )


@pytest.fixture
def external(monkeypatch, profile):
    website = Mock(return_value=([
        SourceEvidence(sourceType="website", sourceName="https://example.com/", text="We manufacture wire rope.")
    ], []))
    extract = Mock(return_value=profile)
    rank = Mock(return_value=RankedCandidates(recommendations=[{
        "code": "4010", "score": 0.92, "rationale": "Supplies wire rope.", "evidence": ["wire rope"]
    }]))
    monkeypatch.setattr(main, "extract_website", website)
    monkeypatch.setattr(main, "extract_profile", extract)
    monkeypatch.setattr("app.services.fsc_ranker.structured_output", rank)
    return website, extract, rank


@pytest.fixture
def client(external):
    with TestClient(main.app) as client:
        yield client


@pytest.fixture
def pdf_bytes():
    with pymupdf.open() as document:
        page = document.new_page()
        page.insert_text((72, 72), "Unseen Cable Works manufactures stainless steel wire rope and chain.")
        return document.tobytes()
