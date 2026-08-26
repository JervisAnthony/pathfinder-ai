# Pathfinder AI — Project State

Last updated: 2026-08-25

This file records the current repository state and roadmap position.
Agents must read it before beginning any roadmap task.

## Current Main

Current `main` baseline:

`b0d48b953088cc206eba657bfaa20dd157c788c6`

Current completed roadmap milestone on `main`:

**Commit 5 — Match Explanation & Gap Analysis**

## Completed MVP-1 Roadmap

- Commit 1 — Repository Foundation — complete
- Commit 2 — Job Description Domain — complete
- Commit 3 — Candidate Profile Domain — complete
- Commit 4 — Deterministic Matching Engine — complete
- Commit 5 — Match Explanation & Gap Analysis — complete

These milestones must not be replayed or rebuilt.

## Active Work

**Commit 6 — Interview Preparation Engine**

Active pull request:

None yet.

Current reviewed PR head:

None yet.

## Commit 6 Scope

Commit 6 adds deterministic structured interview preparation capabilities on top of the existing matcher and explanation:

- interview themes
- candidate talking points
- likely interview question categories
- candidate-to-interviewer questions

The existing deterministic score and match explanation remains the source of truth.

This milestone does not introduce:

- LLM integration
- AI provider abstraction
- semantic matching
- FastAPI
- persistence
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
- structured match explanation and gap analysis
- `MatchExplanation`

Future work must build on these capabilities rather than recreate them.

## Next Roadmap Milestone

After Commit 6 is merged:

**Commit 7 — AI Provider Abstraction**

## Later MVP-1 Milestones

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
