# Pathfinder AI — Project State

Last updated: 2026-09-03

This file records the current repository state and roadmap position.
Agents must read it before beginning any roadmap task.

## Current Main

Starting main:

`ef1c05415fe918ab9934200a7c582db802305bdd`

Current completed roadmap milestone on `main`:

**Commit 11 — Targeted Learning Recommendations**

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

## Post-MVP Completed

- Commit 11 — Targeted Learning Recommendations — complete

## Post-MVP Active Work

**Commit 12 — Saved Analysis History Web Experience**

Status: **PR under review**

Active pull request:

**PR #16 — Add saved analysis history experience**

This post-MVP milestone makes the existing saved-analysis API usable from the
browser while keeping persistence explicit, local, and server-backed.

## Existing Capabilities

The repository already contains:

- Python 3.13 project foundation and tooling
- typed job-description and candidate-profile domains
- deterministic candidate-job matching
- structured match explanations and gap analysis
- deterministic interview preparation
- deterministic targeted learning recommendations
- provider-neutral optional AI enrichment
- typed FastAPI analysis endpoints and error contracts
- version-2 SQLite persistence for complete analysis snapshots
- saved-analysis list and detail API endpoints
- an explicit local SQLite persistence runtime
- a React/TypeScript/Vite web experience for new and saved analyses

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
