# Pathfinder AI — Project State

Last updated: 2026-08-28

This file records the current repository state and roadmap position.
Agents must read it before beginning any roadmap task.

## Current Main

Current `main` baseline:

`d89f50ba5cf8be893bdb9dd5b5bcecaa09a4d268`

Current completed roadmap milestone on `main`:

**Commit 7 — AI Provider Abstraction**

## Completed MVP-1 Roadmap

- Commit 1 — Repository Foundation — complete
- Commit 2 — Job Description Domain — complete
- Commit 3 — Candidate Profile Domain — complete
- Commit 4 — Deterministic Matching Engine — complete
- Commit 5 — Match Explanation & Gap Analysis — complete
- Commit 6 — Interview Preparation Engine — complete
- Commit 7 — AI Provider Abstraction — complete

These milestones must not be replayed or rebuilt.

## Active Work

**Commit 8 — FastAPI Analysis API**

Active pull request:

(Will be updated when PR is open)

## Commit 8 Scope

Commit 8 introduces the MVP-1 FastAPI Analysis API:
- FastAPI interface
- API request/response schemas
- Validation error mapping
- Health endpoint
- Analysis endpoint

This milestone does not introduce:
- Persistence or databases
- Web frontend
- Real external AI providers

## Existing Capabilities

The repository already contains:

- Python 3.13 project foundation
- package/tooling configuration
- GitHub Actions CI
- Job Description domain
- Candidate Profile domain
- shared `Skill`, `JobTitle`, and `EducationLevel` primitives
- deterministic candidate-job matching
- `DeterministicMatcher`
- bounded `MatchScore`
- exact structured skill matching
- deterministic experience scoring
- deterministic education scoring
- structured match explanation and gap analysis
- `MatchExplanation`
- deterministic interview preparation engine

Future work must build on these capabilities rather than recreate them.

## Next Roadmap Milestone

After Commit 8 is merged:

**Commit 9 — Persistence & Analysis History**

## Later MVP-1 Milestones

- Commit 10 — Web MVP

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
