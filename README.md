# Pathfinder AI

AI-powered job matching, application intelligence, and interview preparation with explainable candidate–role analysis.

## Development Status

Pathfinder AI is at its final MVP-1 implementation milestone, the Web MVP, which is currently under review. The React/TypeScript/Vite application submits structured candidate and job profiles to the FastAPI API and presents deterministic, explainable analysis results. Core scoring remains independent of LLMs; no AI provider is required for the default flow.

Pathfinder AI now supports:
- deterministic structured compatibility scoring
- transparent score components
- matched structured skill evidence
- structured gap analysis
- structured skill keyword coverage
- deterministic interview preparation
- evidence-grounded interview themes
- candidate talking points
- likely interview question categories
- candidate-to-interviewer questions
- provider-neutral optional AI enrichment abstraction
- a React/TypeScript/Vite frontend (Web MVP) for submitting structured candidate/job data and viewing explainable match results

**Explicit Limits of the Current Matching Baseline:**
- keyword coverage uses structured job skills only
- it is not ATS keyword analysis
- no resume text is parsed (the web client expects structured data)
- no fuzzy/semantic matching is performed
- no hiring probability is produced
- explanation results are deterministic
- no LLM required for interview generation
- no AI-generated interview predictions
- no employer-specific inference
- interview prep is deterministic, structured, and grounded only in supplied candidate/job evidence
- AI enrichment uses a replaceable provider contract but currently has no concrete external provider implemented
- deterministic scoring and interview preparation remain independent of AI
- optional SQLite-backed history for saved analyses

**Notes on the Web MVP:**
- The frontend operates as a single-page application (SPA).
- No authentication or multi-user accounts are implemented.
- The UI intentionally does not persist candidate data; refreshing the browser will clear the form.
- The frontend currently submits analysis requests specifying that only deterministic matching is performed (no AI enrichment, no analysis saving).
- There is no frontend persistence, resume parsing, job scraping, authentication, or history UI.
- There are no fabricated course recommendations; the backend does not yet expose a course-recommendation contract.

## API Surface & Persistence

Pathfinder exposes a FastAPI surface with opt-in, repository-backed persistence.

Endpoints:
- `GET /api/v1/health`
- `POST /api/v1/analysis`
- `GET /api/v1/analyses`
- `GET /api/v1/analyses/{analysis_id}`

The `POST /api/v1/analysis` endpoint receives typed candidate and job information and returns deterministic explanations and interview prep. It accepts an `include_ai_enrichment: bool` flag to optionally trigger generative analysis if a provider is injected.

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
