"""Build an in-memory TF-IDF index over the checked-in official catalog."""
from functools import lru_cache
import json
from pathlib import Path

from sklearn.feature_extraction.text import TfidfVectorizer

from app.schemas import CompanyProfile, FSCRecord

FEATURE_FIELDS = ("products", "services", "capabilities", "materials", "industries", "keywords")
CATALOG_PATH = Path(__file__).resolve().parents[1] / "data" / "fsc_codes.json"


class FSCRetriever:
    def __init__(self, path: Path = CATALOG_PATH):
        records = [FSCRecord.model_validate(item) for item in json.loads(path.read_text(encoding="utf-8"))]
        self.catalog = {record.code: record for record in records}
        if not records or len(records) != len(self.catalog):
            raise ValueError("FSC catalog must be nonempty and contain unique codes.")
        self.records = records
        self.vectorizer = TfidfVectorizer(stop_words="english", ngram_range=(1, 2), sublinear_tf=True)
        self.matrix = self.vectorizer.fit_transform(record.description for record in records)

    def retrieve(self, profile: CompanyProfile, limit: int = 20) -> list[FSCRecord]:
        query = " ".join(value for field in FEATURE_FIELDS for value in getattr(profile, field))
        if not query.strip():
            return []
        scores = (self.matrix @ self.vectorizer.transform([query]).T).toarray().ravel()
        # A zero-overlap query must not manufacture candidates out of catalog order.
        indices = sorted(range(len(scores)), key=lambda index: (-scores[index], self.records[index].code))
        return [self.records[index] for index in indices[:limit] if scores[index] > 0]


@lru_cache(maxsize=1)
def get_retriever() -> FSCRetriever:
    return FSCRetriever()
