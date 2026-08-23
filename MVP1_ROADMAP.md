# Pathfinder AI — MVP-1 Commit Roadmap

## Commit 1 — Repository Foundation
Establish the Python package, tooling, test harness, project metadata, architecture boundaries, and a minimal importable application package. No product behavior yet.

## Commit 2 — Job Description Domain
Introduce typed job-description value objects and normalization rules for title, company metadata, responsibilities, required skills, preferred skills, experience, and education.

## Commit 3 — Candidate Profile Domain
Introduce typed candidate-profile models for skills, experience, education, projects, certifications, and preferences. Keep resume parsing out of scope.

## Commit 4 — Deterministic Matching Engine
Build an explainable baseline matcher that compares normalized candidate evidence with job requirements without an LLM.

## Commit 5 — Match Explanation & Gap Analysis
Add score components, matched evidence, missing requirements, keyword coverage, and transparent explanation objects.

## Commit 6 — Interview Preparation Engine
Generate deterministic interview themes, candidate talking points, likely question categories, and candidate-to-interviewer questions from analysis data.

## Commit 7 — AI Provider Abstraction
Add provider-neutral interfaces for optional generative enrichment. Include a fake provider for tests; no mandatory external API calls.

## Commit 8 — FastAPI Analysis API
Expose candidate/job analysis through typed API endpoints with validation and error contracts.

## Commit 9 — Persistence & Analysis History
Add repository interfaces and SQLite-backed persistence for saved analyses.

## Commit 10 — Web MVP
Create the React/TypeScript web flow for entering candidate/job information and viewing explainable analysis results.

## MVP-1 Exit Criteria
- end-to-end candidate/job analysis works locally
- core score works without an LLM
- optional AI enrichment is replaceable
- tests/lint/types pass in CI
- no third-party job-site scraping
- analysis results are transparent and reproducible
