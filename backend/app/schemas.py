"""The camelCase fields intentionally match the existing browser API contract."""
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

Text = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=4000)]
Tags = Annotated[list[Text], Field(max_length=80)]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, str_strip_whitespace=True)


class CompanyProfile(StrictModel):
    companyName: Annotated[str, StringConstraints(min_length=1, max_length=300)]
    summary: Annotated[str, StringConstraints(max_length=6000)]
    products: Tags
    services: Tags
    capabilities: Tags
    materials: Tags
    industries: Tags
    keywords: Tags


class SourceEvidence(StrictModel):
    sourceType: Literal["website", "document", "manual"]
    sourceName: str
    text: str


class FSCRecord(StrictModel):
    code: Annotated[str, StringConstraints(pattern=r"^[0-9]{4}$")]
    description: str


class RankedRecommendation(StrictModel):
    # Keep the model's code a string here so one invented code can be filtered
    # without throwing away the other valid recommendations in the response.
    code: str
    score: float = Field(ge=0, le=1, allow_inf_nan=False)
    rationale: Text
    evidence: Tags


class RankedCandidates(StrictModel):
    recommendations: list[RankedRecommendation] = Field(max_length=20)


class FSCRecommendation(RankedRecommendation):
    code: Annotated[str, StringConstraints(pattern=r"^[0-9]{4}$")]
    description: str


class ClassificationResult(StrictModel):
    recommendations: list[FSCRecommendation]


class CompanyAnalysis(ClassificationResult):
    profile: CompanyProfile
    sources: list[SourceEvidence]
    warnings: list[str]
