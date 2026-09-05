# Pathfinder AI — Project State

Last updated: 2026-09-05

This file records the current repository state and roadmap position.
Agents must read it before beginning any roadmap task.

## Current Main

Starting main:

`2a27f4fb1e5338670595ebad7ae6cc5f01f158fe`

Current completed roadmap milestone on `main`:

**Commit 13 — Deterministic Resume Skill Import**

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
- Commit 12 — Saved Analysis History Web Experience — complete
- Commit 13 — Deterministic Resume Skill Import — complete (PR #17 merged)

## Post-MVP Active Work

**Commit 14 — Deterministic Resume File Skill Import**

Status: **PR under review**

Active pull request:

**PR #18 — Add PDF and DOCX resume skill import**

https://github.com/JervisAnthony/pathfinder-ai/pull/18

This authorized post-MVP milestone extends deterministic role-relevant skill
import to PDF/DOCX files. It extracts supported document text and delegates exact
target-skill matching to the existing importer. It does not perform general-purpose
résumé parsing or OCR, alter scoring, use AI, or persist raw résumé content.

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
- deterministic role-relevant skill import from pasted résumé text
- deterministic PDF/DOCX résumé file skill import on the active branch

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
Résumé skill import is also deterministic and independent of LLMs, persistence,
and external services.

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
