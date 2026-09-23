import pytest

from app.services.llm import LLMError


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}


@pytest.mark.parametrize("data", [{}, {"companyName": "  "}, {"companyName": "Name only"}])
def test_empty_or_no_evidence(client, data):
    assert client.post("/api/analyze", data=data).status_code == 422


@pytest.mark.parametrize("fields", [
    {"websiteUrl": "https://example.com"}, {"emailDomain": "example.com"},
    {"websiteUrl": "https://example.com", "emailDomain": "example.org"},
    {"additionalText": "We manufacture wire rope."},
])
def test_analyze_generic_company(client, external, fields):
    response = client.post("/api/analyze", data={"companyName": "Fourth unseen company", **fields})
    assert response.status_code == 200
    body = response.json()
    assert body["profile"]["companyName"] == "Fourth unseen company"
    assert body["profile"]["products"] == ["wire rope", "chain"]
    assert body["sources"]
    assert body["recommendations"][0]["code"] == "4010"
    assert body["recommendations"][0]["description"] == "Chain and Wire Rope"
    assert body["recommendations"][0]["evidence"]


def test_email_domain_becomes_website(client, external):
    client.post("/api/analyze", data={"companyName": "Example", "emailDomain": "sales@example.com"})
    assert external[0].call_args.args[0] == "https://example.com"


def test_pdf_upload(client, pdf_bytes):
    response = client.post("/api/analyze", data={"companyName": "PDF company"},
                           files=[("files", ("capability.pdf", pdf_bytes, "application/pdf"))])
    assert response.status_code == 200
    assert response.json()["sources"][0]["sourceType"] == "document"
    assert "wire rope" in response.json()["sources"][0]["text"]


def test_bad_document_uses_remaining_evidence(client, pdf_bytes):
    response = client.post("/api/analyze", data={"companyName": "Example"}, files=[
        ("files", ("broken.pdf", b"broken", "application/pdf")),
        ("files", ("valid.pdf", pdf_bytes, "application/pdf")),
    ])
    assert response.status_code == 200
    assert any("broken.pdf" in warning for warning in response.json()["warnings"])


def test_document_failure_without_other_sources(client):
    response = client.post("/api/analyze", data={"companyName": "Example"},
                           files={"files": ("file.docx", b"bad", "application/octet-stream")})
    assert response.status_code == 422
    assert response.json()["detail"]["warnings"]


def test_website_failure_uses_manual_source(client, external):
    external[0].return_value = ([], ["Website extraction failed."])
    response = client.post("/api/analyze", data={"companyName": "Example", "websiteUrl": "https://example.com",
                                               "additionalText": "We manufacture wire rope."})
    assert response.status_code == 200
    assert "Website extraction failed." in response.json()["warnings"]


def test_low_information_warning(client):
    response = client.post("/api/analyze", data={"companyName": "Example", "additionalText": "Wire rope."})
    assert any("limited" in warning.lower() for warning in response.json()["warnings"])


def test_llm_failure_retains_sources(client, external):
    external[1].side_effect = LLMError("OpenAI is unavailable. Please retry.")
    response = client.post("/api/analyze", data={"companyName": "Example", "additionalText": "Wire rope."})
    assert response.status_code == 502
    assert response.json()["detail"]["sources"][0]["text"] == "Wire rope."


def test_rank_failure_retains_profile(client, external):
    external[2].side_effect = LLMError("OpenAI is unavailable. Please retry.")
    response = client.post("/api/analyze", data={"companyName": "Example", "additionalText": "Wire rope."})
    assert response.status_code == 502
    assert response.json()["detail"]["profile"]["companyName"] == "Example"


def test_reclassify_edited_profile(client, profile, external):
    profile.products = ["chain"]
    response = client.post("/api/classify", json=profile.model_dump())
    assert response.status_code == 200
    assert response.json()["recommendations"]
    assert external[1].call_count == 0  # Must not extract again or lose edits.
    assert '"chain"' in external[2].call_args.args[1]


def test_invalid_profile_is_rejected(client, profile):
    payload = profile.model_dump()
    payload["products"] = "not a list"
    assert client.post("/api/classify", json=payload).status_code == 422


def test_catalog_lookup(client):
    assert client.get("/api/fsc/4010").json()["description"] == "Chain and Wire Rope"
    assert client.get("/api/fsc/0000").status_code == 404
