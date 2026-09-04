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

**Explicit Limits of the Current Matching Baseline:**
- keyword coverage uses structured job skills only
- it is not ATS keyword analysis
- pasted résumé text can be compared only with supplied target required and preferred skills
- résumé skill import uses deterministic exact phrase matching and does not infer synonyms
- users review and edit imported skills before analysis
- no general-purpose résumé parsing or PDF/DOCX import is supported
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
- `GET /api/v1/analyses`
- `GET /api/v1/analyses/{analysis_id}`

The `POST /api/v1/analysis` endpoint receives typed candidate and job information and returns deterministic explanations, interview preparation, and targeted learning recommendations. It accepts an `include_ai_enrichment: bool` flag to optionally trigger generative analysis if a provider is injected.

The `POST /api/v1/resume/skill-import` preprocessing endpoint accepts ephemeral
résumé text plus target required/preferred skills. It returns boundary-aware,
case-insensitive exact matches and unmatched skills in source order. It does not
perform fuzzy or semantic matching, invoke an LLM, emulate an ATS, estimate a
hiring probability, persist the raw text, or change deterministic scoring.

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
