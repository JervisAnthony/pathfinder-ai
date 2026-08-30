# Pathfinder AI — Project State

Last updated: 2026-08-30

This file records the current repository state and roadmap position.
Agents must read it before beginning any roadmap task.

## Current Main

Current `main` baseline:

`d805896b6c3650f36979cf09d9740b535eb32a21`

Current completed roadmap milestone on `main`:

**Commit 9 — Persistence & Analysis History**

## Completed MVP-1 Roadmap

- Commit 1 — Repository Foundation — complete
- Commit 2 — Job Description Domain — complete
- Commit 3 — Candidate Profile Domain — complete
- Commit 4 — Deterministic Matching Engine — complete
- Commit 5 — Match Explanation & Gap Analysis — complete
- Commit 6 — Interview Preparation Engine — complete
- Commit 7 — AI Provider Abstraction — complete
- Commit 8 — FastAPI Analysis API — complete
- Commit 9 — Persistence & Analysis History — complete

These milestones must not be replayed or rebuilt.

## Active Work

**Commit 10 — Web MVP**

Status:

**Authorized next milestone — implementation not yet started**

Active roadmap pull request:

**None**

## Existing Capabilities

The repository already contains:

- Python 3.13 project foundation
- package/tooling configuration
- GitHub Actions CI
- Job Description domain
- Candidate Profile domain
- shared domain primitives
- deterministic candidate-job matching
- `DeterministicMatcher`
- bounded `MatchScore`
- structured `MatchExplanation` and gap analysis
- deterministic `InterviewPreparation`
- provider-neutral optional AI enrichment abstraction
- FastAPI application/API layer
- `POST /api/v1/analysis`
- `GET /api/v1/health`
- `AnalysisRepository` persistence contract
- `SQLiteAnalysisRepository`
- explicit opt-in saved-analysis persistence
- immutable/versioned historical snapshots
- `GET /api/v1/analyses`
- `GET /api/v1/analyses/{analysis_id}`

Future work must build on these capabilities rather than recreate them.

## Architectural Boundary

Core matching and explanation remain deterministic and independent of:

- LLMs
- FastAPI
- databases
- external providers
- UI frameworks

AI enrichment must remain separate from deterministic scoring.

## State Update Rule

After every merged roadmap PR:

1. update the `main` SHA above
2. mark the merged milestone complete
3. remove it from Active Work
4. set the next roadmap milestone as Active Work
5. preserve completed milestone history

If repository contents and this file disagree, stop and ask the human maintainer which state is authoritative before implementing further work.
