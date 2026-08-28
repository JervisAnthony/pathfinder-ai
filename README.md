# Pathfinder AI

AI-powered job matching, application intelligence, and interview preparation with explainable candidate–role analysis.

## Development Status

Pathfinder AI is currently establishing its foundation. The current MVP-1 milestone aims to implement deterministic matching, application guidance, and optional AI enrichment. The structured Job Description and Candidate Profile domain models have been introduced, along with a deterministic structured candidate-job matching baseline.

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

**Explicit Limits of the Current Matching Baseline:**
- keyword coverage uses structured job skills only
- it is not ATS keyword analysis
- no resume text is parsed
- no fuzzy/semantic matching is performed
- no hiring probability is produced
- explanation results are deterministic
- no LLM required for interview generation
- no AI-generated interview predictions
- no employer-specific inference
- interview prep is deterministic, structured, and grounded only in supplied candidate/job evidence
- AI enrichment uses a replaceable provider contract but currently has no concrete external provider implemented
- deterministic scoring and interview preparation remain independent of AI
- the API is stateless; persistence is not yet implemented

**Note:** The following features are intentionally out of scope for the current foundation and belong to future commits:
- Persistence and databases (SQLite)
- Concrete LLM SDKs (e.g. OpenAI, Gemini) and semantic matching
- Resume parsing and document ingestion
- Web application (React, TypeScript)

## API Surface

Pathfinder exposes a minimal FastAPI surface.

Endpoints:
- `GET /api/v1/health`
- `POST /api/v1/analysis`

The API receives typed candidate and job information and returns deterministic explanations and interview prep. It accepts an `include_ai_enrichment: bool` flag to optionally trigger generative analysis when the host explicitly injects a provider through `create_app(...)`. No concrete provider, API keys, or environment-based provider configuration are introduced in this milestone.

## MVP-1 Direction

The goal for MVP-1 is to allow users to provide their candidate profile and a target job description. The system will then deterministically compare these to provide explainable match scores, identify missing skills, and generate tailored application guidance without requiring an LLM for its core matching path. AI enrichment is strictly an optional layer.

## Requirements

- Python >= 3.13, < 3.14

## Local Setup

We recommend creating a virtual environment using Python 3.13 before installing dependencies.

```bash
python -m venv .venv
source .venv/bin/activate  # On Linux/macOS
# or .venv\Scripts\activate on Windows
```

## Development Installation

Install the project along with its development dependencies (`pytest`, `pytest-cov`, `ruff`, `mypy`):

```bash
pip install -e ".[dev]"
```

## Validation Commands

To validate your changes, ensure you run the complete test suite with coverage, format checks, linting, and type checking:

```bash
# Run tests with 100% coverage requirement
python -m pytest --cov=pathfinder_ai --cov-report=term-missing --cov-fail-under=100

# Check code formatting
python -m ruff format --check .

# Lint code
python -m ruff check .

# Type checking
python -m mypy src
```

## Repository Structure

```
.
├── src/
│   └── pathfinder_ai/      # Main application package
├── tests/                  # Unit and integration tests
├── .github/workflows/      # CI/CD workflows
├── pyproject.toml          # Project and tool configuration
└── README.md               # Project documentation
```
