# Pathfinder AI — Project State

Last updated: 2026-09-02

This file records the current repository state and roadmap position.
Agents must read it before beginning any roadmap task.

## Current Main

Starting main:

`2b79cfa99a76192b55fcd48aa30a5696e4deef9a`

Current completed roadmap milestone on `main`:

**Commit 10 — Web MVP**

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
- Commit 10 — Web MVP — complete

**MVP-1 is complete.**

These milestones must not be replayed or rebuilt.

## Post-MVP Active Work

**Commit 11 — Targeted Learning Recommendations**

Status: **PR under review**

Active pull request:

**PR #15 — Add targeted learning recommendations**

This post-MVP milestone adds deterministic, explainable learning recommendations
grounded in the existing candidate-to-role gap analysis. It does not use an LLM
or query an external course catalog.

## Existing Capabilities

The repository already contains:

- Python 3.13 project foundation and tooling
- typed job-description and candidate-profile domains
- deterministic candidate-job matching
- structured match explanations and gap analysis
- deterministic interview preparation
- provider-neutral optional AI enrichment
- typed FastAPI analysis endpoints and error contracts
- repository-backed SQLite analysis persistence and history
- a React/TypeScript/Vite Web MVP

The active feature branch additionally contains deterministic targeted learning
recommendations and versioned persistence for recommendation snapshots.

## Architectural Boundary

Core matching, explanation, interview preparation, and learning recommendations
remain deterministic and independent of:

- LLMs
- external course catalogs
- FastAPI
- databases
- external providers
- UI frameworks

AI enrichment remains separate from deterministic scoring and recommendations.

## Next Post-MVP Milestone

None currently authorized.

## State Update Rule

After every merged roadmap or authorized post-MVP pull request:

1. update the `main` SHA above
2. mark the merged milestone complete
3. remove it from active work
4. set the next authorized milestone as active work, if one exists
5. preserve completed milestone history

If repository contents and this file disagree without an explicit maintainer
exception, stop and ask the human maintainer which state is authoritative before
implementing further work.
