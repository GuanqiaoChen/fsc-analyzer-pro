# FSC Code Classifier

A stateless full-stack interview MVP that turns company websites, email domains, PDF capability statements, and manual information into an editable company profile and evidence-backed Federal Supply Classification recommendations. The existing Lovable React interface is preserved; real Python API calls replace mocked data. Scope and contracts follow [design_doc.md](design_doc.md).

## Install and run

Requirements: **Python 3.11+**, **Node.js 22.12+**, npm, and an OpenAI API key. Firecrawl is needed for website extraction; PDF/manual analysis can work without it. Run commands from the repository root.

```sh
git clone https://github.com/GuanqiaoChen/fsc-analyzer-pro.git
cd fsc-analyzer-pro
python -m venv .venv
```

Activate the Python environment:

```powershell
# Windows PowerShell
.\.venv\Scripts\Activate.ps1
```

```sh
# macOS / Linux
source .venv/bin/activate
```

```sh
python -m pip install -r backend/requirements.txt
npm ci
```

Copy `.env.example` to `.env` **only if `.env` does not already exist**, and enter your keys. Preserve existing keys. The backend reads the root `.env` regardless of working directory; process environment variables take precedence.

| Variable | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | Required for structured extraction and reranking. Backend only. |
| `FIRECRAWL_API_KEY` | Website extraction. Backend only. |
| `OPENAI_MODEL` | Optional; defaults to `gpt-4.1-mini`. Must support structured outputs. |
| `VITE_API_BASE_URL` | Optional public API origin; empty uses the local Vite proxy. |

Never prefix secrets with `VITE_`. `.env`, virtual environments, and local verification artifacts are ignored by Git.

Start the backend in terminal 1:

```sh
python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
```

If PowerShell activation is disabled, use `.\.venv\Scripts\python.exe` instead of `python`.

Start the frontend in terminal 2:

```sh
npm run dev
```

Open **http://localhost:5173**. API documentation: **http://127.0.0.1:8000/docs**. Health: **http://127.0.0.1:8000/health**. Vite forwards `/api` and `/health` to port 8000. Stop foreground servers with Ctrl+C.

If this computer defaults to Node 20, use Node 22 without changing its global installation:

```sh
npx --yes --package=node@22 node node_modules/vite/bin/vite.js
```

## Demo workflow

1. Enter a company name and a website, PDF, or meaningful company information.
2. Click **Analyze Company**. Extraction and ranking may take tens of seconds depending on external services.
3. Review the profile, source excerpts, warnings, and FSC recommendations.
4. Click **Edit Profile**, edit the summary or tags, then **Re-classify**. Enter commits a new tag. Reclassification sends the edited profile without fetching sources again.
5. Match scores are ranking signals, **not calibrated probabilities**. Few or no recommendations can be correct when evidence does not support a supply class.

Assignment inputs:

- H & R PARTS CO INC: `https://www.hrpartsco.com/`
- LOOS & CO INC: `https://loosco.com/`
- Lone Star Downhole Products: upload `LSDP Capabilites Statement.pdf`.

A name alone identifies a company but is insufficient evidence. An email domain or email address supplies the website when an explicit URL is absent. There are no company-specific mappings; unseen companies use the same pipeline.

## Architecture

```text
React / Vite single page
  -> FastAPI multipart /api/analyze
  -> Firecrawl website pages + PyMuPDF text + manual text
  -> Normalize, deduplicate, and bound source evidence
  -> OpenAI structured CompanyProfile
  -> TF-IDF against official local FSC descriptions (top 20)
  -> OpenAI selects/reranks only supplied candidates (up to 5)
  -> Deterministic validation
  -> Profile + recommendations + sources + warnings

Edited CompanyProfile -> /api/classify -> retrieval + ranking + validation
```

Retrieval constrains the model to a controlled taxonomy instead of asking it to invent codes from memory. Every final code must have exactly four ASCII digits, exist in the local catalog, and belong to the retrieved candidate set. The backend removes duplicates, supplies official descriptions from the catalog, and requires evidence quoted from the profile. Prompts distinguish products sold from machinery used internally: providing machining does not imply selling lathes.

| Layer | Technology |
| --- | --- |
| Frontend | React 19, TypeScript, Vite, existing TanStack Start routing, Tailwind |
| Backend | Python, FastAPI, Pydantic |
| Website extraction | Firecrawl v2 scrape API via HTTPX |
| PDF extraction | PyMuPDF |
| Structured extraction/ranking | OpenAI Responses API with Pydantic schemas |
| Retrieval | scikit-learn TF-IDF word unigrams/bigrams |
| Testing | Pytest, Vitest, React Testing Library |

Implementation references: [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs) and [Firecrawl scrape API](https://docs.firecrawl.dev/api-reference/endpoint/scrape).

## Official catalog and reproducibility

`backend/app/data/fsc_codes.json` contains **580 unique FSC records** converted from Table 1 of the supplied `AV_FSCClassAssignment._151007.pdf`. Table 2 repeats the same entries alphabetically. RIC/ACTY columns and source-of-supply footnote markers are excluded from descriptions.

The [original DLA reference](https://www.dla.mil/Portals/104/Documents/Aviation/AviationEngineering/Engineering/AV_FSCClassAssignment._151007.pdf) can return HTTP 403, so the supplied PDF is retained for reproducibility. `fsc_catalog_source.json` records the source URL, SHA-256, and conversion date. This is the exact static assignment reference, covering the listed DLA/GSA assignments, not a live catalog. Runtime classification never downloads the DLA website.

```sh
python scripts/build_fsc_catalog.py --pdf "AV_FSCClassAssignment._151007.pdf"
```

The converter verifies uniqueness, record count, coverage of code rows, and a known title before replacing the JSON. A differently formatted/newer reference requires converter review.

## API endpoints

### GET /health

Returns `{"status":"ok"}`. This checks application availability, not provider credentials or quota.

### POST /api/analyze

Multipart fields: `companyName` (required), `websiteUrl`, `emailDomain`, `additionalText`, and repeated `files` fields (optional PDFs).

```sh
curl -X POST http://127.0.0.1:8000/api/analyze -F 'companyName=Example Cable Manufacturer' -F 'additionalText=We manufacture stainless steel wire rope and chain.'
```

Returns `{profile, recommendations, sources, warnings}`. Profile fields are `companyName`, `summary`, and arrays for `products`, `services`, `capabilities`, `materials`, `industries`, and `keywords`. Recommendations contain `code`, official `description`, `score` (0-1), `rationale`, and `evidence`.

### POST /api/classify

Accepts the edited CompanyProfile directly as JSON and returns `{recommendations}`. It does not re-extract or discard user edits.

```json
{
  "companyName": "Example Cable Manufacturer",
  "summary": "Manufactures wire rope.",
  "products": ["wire rope"],
  "services": [],
  "capabilities": ["wire rope manufacturing"],
  "materials": ["stainless steel"],
  "industries": ["aerospace"],
  "keywords": ["wire rope"]
}
```

### GET /api/fsc/{code}

Returns `{code, description}` from the catalog, or 404 for an unknown code.

## Error handling and limits

- Website extraction uses the supplied page plus at most four relevant same-site pages. It prefers discovered about/products/services/capabilities links, falling back to common paths. Firecrawl timeout is 20 seconds per page; HTTP timeout is 25 seconds.
- Failed websites/PDFs produce warnings; other usable evidence continues. No usable source returns 422. Sparse evidence produces a warning. Missing facts are never filled from the company name.
- PDF limits: 10 MB per file, 50 pages, five files per API request. The existing UI selects one PDF. Corrupt, encrypted, and image-only PDFs receive controlled warnings; OCR is outside scope.
- Normalized evidence is limited to 12,000 characters per source and 60,000 total; long documents can lose relevant detail near the end.
- OpenAI uses a 45-second timeout with SDK retries disabled. Malformed output receives one controlled retry; provider failures return 502. Sources, warnings, and any completed profile remain available to the UI for retry.
- No retrieval overlap yields no recommendations. The model can abstain. Invalid/noncandidate codes, duplicates, and ungrounded evidence are filtered before returning results.
- Requests are synchronous. The UI uses an indeterminate loading state and a four-minute timeout. Reclassification errors preserve the edited profile.

## Tests and validation

```sh
python -m pytest -q
npm test
npm run typecheck
npm run lint
npm run build
```

Backend tests mock OpenAI/Firecrawl and need no keys or paid requests. They cover extraction, schema retries, retrieval, official descriptions, code filtering, deduplication, errors, and edited-profile classification. Frontend tests cover multipart submission, empty input, score conversion, editing/reclassification, retained evidence, and retry. Vitest uses one thread worker for reliable Windows execution.

The existing generated UI components emit six Fast Refresh lint warnings, with no lint errors. The installed FastAPI TestClient dependency emits a deprecation warning; backend tests pass.

The production build retains the project's existing Lovable/TanStack configuration. The Vite API proxy is for local development. A hosted frontend needs a separately hosted Python API, public `VITE_API_BASE_URL`, and an explicit backend CORS origin. Hosting infrastructure is outside this localhost assignment.

## Repository layout

```text
src/routes/index.tsx          Existing UI and editable profile
src/lib/classifier-api.ts     Browser API contract and error handling
backend/app/main.py          API orchestration
backend/app/schemas.py       Pydantic contracts
backend/app/services/        Extraction, normalization, retrieval, ranking
backend/app/data/            Official catalog and provenance
backend/tests/               Offline backend tests
tests/                      Frontend integration tests
scripts/build_fsc_catalog.py One-time reference conversion
```

## Intentional time-boxed tradeoffs

- **No database:** profiles/results live only in the current request/browser session.
- **No authentication:** this is a local interview demo.
- **No vector database:** the reference fits in a small local index.
- **Limited website depth:** bounds latency/API use but may miss company details.
- **TF-IDF instead of larger search infrastructure:** simple and inspectable; lexical mismatch can omit relevant candidates.

Supply classes do not represent every service business. Service-heavy companies can correctly return few or no recommendations. LLM extraction/ranking remains probabilistic: deterministic validation prevents invented codes but does not prove business relevance. Review evidence and edit the profile when needed.

Future improvements could include OCR, richer retrieval, a reviewed evaluation set, classification history and correction feedback, authentication, and production API controls. These can be added around the current extraction/retrieval/ranking boundaries without changing the core classification pipeline. None is implemented in this MVP.

This repository is connected to [Lovable](https://lovable.dev/projects/a6c55899-a6b7-4f71-9f88-28df12eaee54). Use normal commits and pushes; never rewrite published history.
