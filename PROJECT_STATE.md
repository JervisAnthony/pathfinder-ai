# Pathfinder AI — Project State

Last updated: 2026-08-30

This file records the current repository state and roadmap position.
Agents must read it before beginning any roadmap task.

## Current Main

Starting main:

`ad161785f1de6377a8bdd26b537bc42750754c06`

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

Status: **Implementation / PR under review**

Active roadmap pull request:

**PR #14 — Add Pathfinder Web MVP**

Commit 10 is the final MVP-1 implementation milestone. It is not complete until
the pull request is reviewed and merged.

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
- a React/TypeScript/Vite Web MVP under review

Future work must build on these capabilities rather than recreate them.

## Architectural Boundary

Core matching and explanation remain deterministic and independent of:

- LLMs
- FastAPI
- databases
- external providers
- UI frameworks

AI enrichment must remain separate from deterministic scoring.

## Next Roadmap Milestone

None. Commit 10 is the final MVP-1 implementation milestone.

## State Update Rule

After every merged roadmap PR:

1. update the `main` SHA above
2. mark the merged milestone complete
3. remove it from Active Work
4. set the next roadmap milestone as Active Work
5. preserve completed milestone history

If repository contents and this file disagree, stop and ask the human maintainer
which state is authoritative before implementing further work.
