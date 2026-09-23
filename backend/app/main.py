"""REST orchestration only: no persistence, queues, or company-specific rules."""
from pathlib import Path
from typing import Annotated

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from app.schemas import ClassificationResult, CompanyAnalysis, CompanyProfile, FSCRecord, SourceEvidence
from app.services.document_extractor import MAX_FILE_BYTES, extract_pdf
from app.services.fsc_ranker import classify_profile
from app.services.fsc_retriever import get_retriever
from app.services.llm import LLMError
from app.services.profile_extractor import extract_profile
from app.services.sources import normalize_sources, normalize_url
from app.services.website_extractor import extract_website

load_dotenv(Path(__file__).resolve().parents[2] / ".env")
app = FastAPI(title="FSC Code Classifier", version="1.0.0")
app.add_middleware(CORSMiddleware,
                   allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
                   allow_methods=["GET", "POST"], allow_headers=["Content-Type"])


def analysis_error(status: int, message: str, sources: list[SourceEvidence], warnings: list[str],
                   profile: CompanyProfile | None = None):
    # Retain successfully extracted evidence even if an external LLM call fails.
    return HTTPException(status_code=status, detail={
        "message": message, "sources": [source.model_dump() for source in sources],
        "warnings": warnings, "profile": profile.model_dump() if profile else None,
    })


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/api/analyze", response_model=CompanyAnalysis)
def analyze(companyName: Annotated[str, Form(max_length=300)],
            websiteUrl: Annotated[str, Form(max_length=2000)] = "",
            emailDomain: Annotated[str, Form(max_length=300)] = "",
            additionalText: Annotated[str, Form(max_length=30000)] = "",
            files: Annotated[list[UploadFile] | None, File()] = None):
    name = companyName.strip()
    sources: list[SourceEvidence] = []
    warnings: list[str] = []
    if not name:
        raise analysis_error(422, "Enter a company name.", sources, warnings)
    if files and len(files) > 5:
        raise analysis_error(422, "Upload at most five PDFs.", sources, warnings)
    if additionalText.strip():
        sources.append(SourceEvidence(sourceType="manual", sourceName="Additional company information", text=additionalText))
    raw_url = websiteUrl.strip() or emailDomain.strip().rsplit("@", 1)[-1]
    if raw_url:
        try:
            url = normalize_url(raw_url)
        except ValueError as error:
            raise analysis_error(422, str(error), sources, warnings) from None
        website_sources, website_warnings = extract_website(url)
        sources.extend(website_sources)
        warnings.extend(website_warnings)
    for file in files or []:
        filename = (file.filename or "document.pdf").replace("\\", "/").rsplit("/", 1)[-1]
        try:
            if not filename.lower().endswith(".pdf"):
                raise ValueError("Only PDF uploads are supported.")
            content = file.file.read(MAX_FILE_BYTES + 1)
            sources.append(SourceEvidence(sourceType="document", sourceName=filename, text=extract_pdf(content)))
        except ValueError as error:
            warnings.append(f"Document extraction failed for {filename}: {error}")
        finally:
            file.file.close()
    sources = normalize_sources(sources)
    if not sources:
        raise analysis_error(422, "No usable source content. Add a website, text PDF, or company information and retry.", sources, warnings)
    if sum(len(source.text) for source in sources) < 200:
        warnings.append("Limited company information was extracted. Add specific products or capabilities to improve the result.")
    profile = None
    try:
        profile = extract_profile(name, sources).model_copy(update={"companyName": name})
        recommendations = classify_profile(profile)
    except LLMError as error:
        raise analysis_error(502, str(error), sources, warnings, profile) from None
    return CompanyAnalysis(profile=profile, recommendations=recommendations, sources=sources, warnings=warnings)


@app.post("/api/classify", response_model=ClassificationResult)
def classify(profile: CompanyProfile):
    try:
        return ClassificationResult(recommendations=classify_profile(profile))
    except LLMError as error:
        raise analysis_error(502, str(error), [], [], profile) from None


@app.get("/api/fsc/{code}", response_model=FSCRecord)
def fsc_record(code: str):
    record = get_retriever().catalog.get(code)
    if record is None:
        raise HTTPException(status_code=404, detail="FSC code not found.")
    return record
