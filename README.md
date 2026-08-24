# Pathfinder AI

AI-powered job matching, application intelligence, and interview preparation with explainable candidate–role analysis.

## Development Status

Pathfinder AI is currently establishing its foundation. The current MVP-1 milestone aims to implement deterministic matching, application guidance, and optional AI enrichment. The structured Job Description and Candidate Profile domain models have been introduced.

**Note:** The following features are intentionally out of scope for the current foundation and belong to future commits:
- Candidate and job description matching logic
- APIs (FastAPI)
- Persistence and databases (SQLite)
- AI enrichments and LLM SDKs
- Web application (React, TypeScript)

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
