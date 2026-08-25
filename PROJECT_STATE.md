# Pathfinder AI — Project State

Last updated: 2026-08-25

This file records the current repository state and roadmap position.
Agents must read it before beginning any roadmap task.

## Current Main

Current `main` baseline:

`266ccc84cac1b485afafcef87487afed01934c85`

Current completed roadmap milestone on `main`:

**Commit 4 — Deterministic Matching Engine**

## Completed MVP-1 Roadmap

- Commit 1 — Repository Foundation — complete
- Commit 2 — Job Description Domain — complete
- Commit 3 — Candidate Profile Domain — complete
- Commit 4 — Deterministic Matching Engine — complete

These milestones must not be replayed or rebuilt.

## Active Work

**Commit 5 — Match Explanation & Gap Analysis**

Active pull request:

**PR #7 — Add match explanations and gap analysis**

Current reviewed PR head:

`32d0b699f42937a6b728fd341eeb92ccba08cc12`

Commit 5 is **not complete until PR #7 is merged into `main`**.

Do not begin Commit 6 from `main` until Commit 5 has been merged and this file has been updated.

## Commit 5 Scope

Commit 5 adds deterministic structured explanation capabilities on top of the existing matcher:

- score components
- matched skill evidence
- evidence sources
- missing required skills
- missing preferred skills
- structured experience evidence and gaps
- structured education evidence and gaps
- deterministic structured skill keyword coverage
- `MatchExplanation`

The existing deterministic score remains the source of truth.

This milestone does not introduce:

- resume parsing
- ATS analysis
- fuzzy or semantic matching
- LLM-generated explanations
- FastAPI
- persistence
- AI providers
- frontend behavior

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

Future work must build on these capabilities rather than recreate them.

## Next Roadmap Milestone

After Commit 5 is merged:

**Commit 6 — Interview Preparation Engine**

Roadmap objective:

Generate deterministic:

- interview themes
- candidate talking points
- likely question categories
- candidate-to-interviewer questions

from existing structured candidate/job analysis data.

Do not introduce AI provider integration in Commit 6.

## Later MVP-1 Milestones

- Commit 7 — AI Provider Abstraction
- Commit 8 — FastAPI Analysis API
- Commit 9 — Persistence & Analysis History
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
