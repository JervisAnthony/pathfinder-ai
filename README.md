# Pathfinder AI

AI-powered job matching, application intelligence, and interview preparation with explainable candidate–role analysis.

## Development Status

Pathfinder AI MVP-1 is complete. The React/TypeScript/Vite application submits structured candidate and job profiles to the FastAPI API and presents deterministic, explainable analysis results. Core scoring, interview preparation, and targeted learning recommendations remain independent of LLMs; no AI provider is required for the default flow.

Pathfinder AI now supports:
- deterministic structured compatibility scoring
- transparent score components
- matched structured skill evidence
- structured gap analysis
- structured skill keyword coverage
- deterministic interview preparation
- deterministic targeted learning recommendations grounded in existing gap analysis
- required- and preferred-skill learning guidance
- experience- and education-gap guidance
- evidence-grounded interview themes
- candidate talking points
- likely interview question categories
- candidate-to-interviewer questions
- provider-neutral optional AI enrichment abstraction
- explicit opt-in SQLite persistence for complete analysis snapshots
- a React/TypeScript/Vite frontend for submitting analyses and browsing read-only saved history
- deterministic role-relevant skill import from pasted résumé text
- deterministic role-relevant skill import from PDF and DOCX résumé files

**Explicit Limits of the Current Matching Baseline:**
- keyword coverage uses structured job skills only
- it is not ATS keyword analysis
- pasted résumé text can be compared only with supplied target required and preferred skills
- résumé skill import uses deterministic exact phrase matching and does not infer synonyms
- users review and edit imported skills before analysis
- PDF/DOCX text extraction is used only for exact target-skill import; no general-purpose résumé parsing, OCR, or ATS simulation is supported
- no fuzzy/semantic matching is performed
- no hiring probability is produced
- explanation results are deterministic
- no LLM required for interview generation
- no AI-generated interview predictions
- no employer-specific inference
- interview prep is deterministic, structured, and grounded only in supplied candidate/job evidence
- AI enrichment uses a replaceable provider contract but currently has no concrete external provider implemented
- deterministic scoring and interview preparation remain independent of AI
- targeted learning recommendations are deterministic and remain independent of AI
- suggested course topics are generic learning or search topics, not verified courses
- no external course catalog is queried and no provider or course listing is fabricated
- optional SQLite-backed history for saved analyses
- no LLM or external service is required for résumé skill import

**Notes on the Web MVP:**
- The frontend operates as a single-page application (SPA).
- No authentication or multi-user accounts are implemented.
- The browser does not persist candidate data in local storage, session storage, or IndexedDB.
- Saving is explicit and the save checkbox defaults to off. AI enrichment remains off in the normal web flow.
- The History view reads server-backed SQLite snapshots and never recomputes historical results.
- Saved history is read-only; editing and deletion are not available.
- Learning recommendations are derived only from the supplied role comparison and its deterministic gap analysis.
- The UI does not link to course marketplaces or claim that suggested topics are verified third-party listings.
- Résumé text remains editable, and only exact target-skill matches are merged into the editable Candidate Skills field.
- Résumé text is not written to localStorage, sessionStorage, or IndexedDB.

> **Privacy:** Saved analysis history may contain candidate profile information and should be treated as sensitive local application data. Pathfinder does not currently provide authentication, authorization, encryption at rest, account isolation, or multi-user isolation.

> **Résumé privacy:** Pasted résumé text may contain sensitive personal information. The web client sends it to the configured Pathfinder backend only for the skill-import request. Pathfinder does not include the raw text in `SavedAnalysis`, analysis-history payloads, or browser storage. Administrators of the configured server or network may still be able to observe request traffic.

## API Surface & Persistence

Pathfinder exposes a FastAPI surface with opt-in, repository-backed persistence.

Endpoints:
- `GET /api/v1/health`
- `POST /api/v1/analysis`
- `POST /api/v1/resume/skill-import`
- `POST /api/v1/resume/file-skill-import`
- `GET /api/v1/analyses`
- `GET /api/v1/analyses/{analysis_id}`

The `POST /api/v1/analysis` endpoint receives typed candidate and job information and returns deterministic explanations, interview preparation, and targeted learning recommendations. It accepts an `include_ai_enrichment: bool` flag to optionally trigger generative analysis if a provider is injected.

The `POST /api/v1/resume/skill-import` preprocessing endpoint accepts ephemeral
résumé text plus target required/preferred skills. It returns boundary-aware,
case-insensitive exact matches and unmatched skills in source order. It does not
perform fuzzy or semantic matching, invoke an LLM, emulate an ATS, estimate a
hiring probability, persist the raw text, or change deterministic scoring.

### PDF and DOCX résumé skill import

`POST /api/v1/resume/file-skill-import` accepts `multipart/form-data` with one
`file`, repeated `required_skills` strings, and repeated `preferred_skills`
strings. At least one target skill is required. It returns the same four ordered
matched/unmatched required/preferred skill lists as pasted-text import, without
raw extracted text, filenames, excerpts, or document metadata.

The web form supports both upload and pasted-text import in its résumé section.
Both merge exact matches into editable Candidate Skills, preserving manual skills
and removing canonical duplicates. Zero matches is a successful result. Clearing
the file resets selection without removing imported skills or pasted text.
Only reviewed structured candidate data enters normal analysis and saved history.

Supported files are PDFs with extractable text and DOCX documents, including
uppercase extensions. The backend checks the PDF signature or DOCX ZIP/XML
structure; filename and MIME type alone are insufficient. Image-only/scanned
PDFs, encrypted/password-protected PDFs, legacy DOC, images, and other office
formats are unsupported. Corrupt, blank, encrypted, and over-limit documents
produce safe errors without parser details. There is no OCR fallback.

Extraction limits (documents are rejected, never silently truncated):

- 10 MiB uploaded file
- 100 PDF pages
- 200,000 extracted characters
- 2,000 DOCX ZIP entries and 50 MiB total declared uncompressed content

Infrastructure uses `pypdf>=6.17.0` for page-text extraction and
`python-multipart>=0.0.32` for FastAPI uploads. DOCX uses standard-library
`zipfile` and `xml.etree.ElementTree`, with no separate DOCX dependency. Paragraph
text is reconstructed across runs, including tables, headers, footers, footnotes,
and endnotes. Encrypted ZIP entries and XML DTD/entity declarations are rejected.
Archives are never unpacked to filesystem paths; embedded objects, images,
external relationships, and PDF attachments are not processed. Extraction then
delegates to the existing deterministic skill importer, without changing scoring,
using AI, or accessing persistence. These limits do not guarantee complete text
recovery or provide a general-purpose document-parser sandbox.

Uploaded files may contain sensitive personal information. Pathfinder processes
them transiently for the import request, does not return extracted raw text to the
browser, and does not add file bytes, filenames, metadata, or extracted raw text to
`SavedAnalysis` or browser storage. Saved analysis payloads remain version 2.
The route reads at most 10 MiB + 1 byte and explicitly closes the upload resource
after handling, including failure paths. FastAPI/Starlette multipart handling may
temporarily spool uploads before route entry according to framework/runtime
behavior. This is not a guarantee of memory-only handling or secure deletion.
The existing installation privacy limitations continue to apply.

## Requirements

- Python >= 3.13, < 3.14
- Node.js (v24 recommended) / npm

## Backend Local Setup

We recommend creating a virtual environment using Python 3.13 before installing dependencies.

```
python -m venv .venv
source .venv/bin/activate
```

Install the project along with its development dependencies:

```bash
pip install -e ".[dev]"
```

Start the FastAPI development server using uvicorn:

```bash
python -m uvicorn pathfinder_ai.api.app:create_app --factory --host 127.0.0.1 --port 8000
```

`create_app()` remains stateless by default. Saving and history endpoints return
`persistence_unavailable` unless a repository is explicitly configured. To enable
local SQLite persistence, set `PATHFINDER_SQLITE_PATH` and use the runtime factory.
Its parent directory is created from the configured path when needed.

On macOS or Linux:

```bash
PATHFINDER_SQLITE_PATH=.pathfinder/pathfinder.db python -m uvicorn pathfinder_ai.api.runtime:create_runtime_app --factory --host 127.0.0.1 --port 8000
```

On Windows PowerShell:

```powershell
$env:PATHFINDER_SQLITE_PATH = ".pathfinder\pathfinder.db"
python -m uvicorn pathfinder_ai.api.runtime:create_runtime_app --factory --host 127.0.0.1 --port 8000
```

The configured database contains sensitive candidate and job snapshots. Use it
only on a trusted local installation and protect the database file appropriately.

## Frontend Local Setup

Navigate to the `web` directory to run the React application:

```bash
cd web
npm ci
```

Start the Vite development server:

```
npm run dev
```

The Vite development server is configured to proxy requests to `/api` directly to the FastAPI backend running on `http://127.0.0.1:8000`.

## Validation Commands

To validate backend changes:

```bash
python -m pytest --cov=pathfinder_ai --cov-report=term-missing --cov-fail-under=100
python -m ruff format --check .
python -m ruff check .
python -m mypy src
```

To validate frontend changes:

```bash
cd web
npm run lint
npm run typecheck
npm run test:run
npm run build
```

## Repository Structure

```
.
├── src/
│   └── pathfinder_ai/      # Main application package
├── tests/                  # Unit and integration tests
├── web/                    # React/TypeScript Web MVP
├── .github/workflows/      # CI/CD workflows
├── pyproject.toml          # Project and tool configuration
└── README.md               # Project documentation
```
