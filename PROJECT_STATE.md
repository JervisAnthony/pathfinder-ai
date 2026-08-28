# Pathfinder AI — Project State

Last updated: 2026-08-28

This file records the current repository state and roadmap position.
Agents must read it before beginning any roadmap task.

## Current Main

Current `main` baseline:

`1178f86db6ca14704e485f1a37769a0fa5a34104`

Current completed roadmap milestone on `main`:

**Commit 6 — Interview Preparation Engine**

## Completed MVP-1 Roadmap

- Commit 1 — Repository Foundation — complete
- Commit 2 — Job Description Domain — complete
- Commit 3 — Candidate Profile Domain — complete
- Commit 4 — Deterministic Matching Engine — complete
- Commit 5 — Match Explanation & Gap Analysis — complete
- Commit 6 — Interview Preparation Engine — complete

These milestones must not be replayed or rebuilt.

## Active Work

**Commit 7 — AI Provider Abstraction**

Active pull request:

PR #10 — Add AI provider abstraction

## Commit 7 Scope

Commit 7 introduces an optional, provider-neutral generative AI abstraction layer:
- `AIEnrichmentRequest` value object
- `AIEnrichmentResult` value object
- `AIEnrichmentProvider` protocol
- Optional enrichment application service
- Deterministic fake provider for tests

This milestone does not introduce:
- real external AI providers (e.g. OpenAI, Anthropic, Gemini)
- API keys or .env logic
- FastAPI
- HTTP clients
- semantic matching / vector databases
- any alterations to the deterministic core matcher logic

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

After Commit 7 is merged:

**Commit 8 — FastAPI Analysis API**

## Later MVP-1 Milestones

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
