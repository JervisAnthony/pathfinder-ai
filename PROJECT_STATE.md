# Pathfinder AI — Project State

Last updated: 2026-10-26

This file records the current repository state and roadmap position.
Agents must read it before beginning any roadmap task.

## Current Main

Latest verified completed main (PR #41 merge, 2026-10-23 IST):

`4d64da3edd4e34d61667be58480177e7a160bd64`

Current completed roadmap milestone on `main`:

**Commit 37 — Kanban Follow-Up Sorting**

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
- Commit 14 — Deterministic Resume File Skill Import — complete (PR #18 merged)
- Commit 15 — Optional OpenAI AI Enrichment — complete (PR #19 merged)
- Commit 16 — AI-Assisted Job Description Import — complete (PR #20 merged)
- Commit 17 — AI-Assisted Candidate Profile Import — complete (PR #21 merged)
- Commit 18 — Saved Analysis Deletion & Privacy Controls — complete (PR #22 merged)
- Commit 19 — Saved Analysis Search & Filters — complete (PR #23 merged)
- Commit 20 — Saved Analysis Export & Portability — complete (PR #24 merged)
- Commit 21 — Saved Analysis Comparison & Change View — complete (PR #25 merged)
- Commit 22 — Saved Analysis Application Status Tracking — complete (PR #26 merged)
- Commit 23 — Application Status Activity Timeline — complete (PR #27 merged)
- Commit 24 — Saved Analysis Application Notes — complete (PR #28 merged)
- Commit 25 — Application Follow-Up Date — complete (PR #29 merged on 2026-10-03)
- Commit 26 — Follow-Up History Worklist — complete (PR #30 merged)
- Commit 27 — Application Pipeline Dashboard — complete (PR #31 merged)
- Commit 28 — Application Pipeline CSV Export — complete (PR #32 merged)
- Commit 29 — Application Pipeline Kanban Board — complete (PR #33 merged)
- Commit 30 — Kanban Drag-and-Drop Status Changes — complete (PR #34 merged)
- Commit 31 — Kanban Quick Follow-Up Editing — COMPLETE (PR #35, merged 2026-10-18)
- Commit 32 — Kanban Quick Application Notes — COMPLETE (PR #36, merged 2026-10-20)
- Commit 33 — Kanban Board Search — COMPLETE (PR #37, merged 2026-10-21)
- Commit 34 — Kanban Follow-Up Filters — COMPLETE (PR #38, merged 2026-10-21)
- Commit 35 — Kanban Match Score Filters — COMPLETE (PR #39, merged 2026-10-22)
- Commit 36 — Kanban AI Enrichment Filter — COMPLETE (PR #40, merged 2026-10-23 IST)
- Commit 37 — Kanban Follow-Up Sorting — COMPLETE (PR #41, merged 2026-10-23 IST)

## Post-MVP Active Work

**Commit 38 — Kanban Reset All Criteria**

Status: **Authorized active development.**

Reset all Board criteria beside Refresh board restores search, follow-up
presence/dates, score bounds, AI presence, and newest-first sorting. It discards
all unsent drafts without validation, explicitly clears native date and number
controls, and clears filter validation errors. One complete default context
updates the authoritative ref before the existing shared refresh. Changed applied
criteria cause exactly seven first-page requests containing only each lane's
application_status. Default applied criteria cause no refresh or request even
with dirty/invalid drafts or rapid repeated resets.

Existing interaction guards protect open quick editors, pending writes, status
confirmation/persistence, and detail loading. Changed context invalidates active
drags and stale requests, resets independent offsets, and preserves ten-card
pages, lookahead, deduplication, Load more/Retry, and safe errors. Subsequent
refreshes and successful status/follow-up writes use defaults; note-only writes
avoid summary reloads. Native controls, help text, live applied summaries, and
existing focus styling remain. Individual Apply/Clear/Reset controls remain.

Board reset leaves List drafts/applied criteria/order/pages, comparison,
Overview, and CSV unchanged. It changes view state only: no backend/API/schema,
dependency, data mutation, score recalculation, AI call, private-content decoding,
client sorting, browser/URL persistence, telemetry, polling, or integration.
Board state still resets on unmount/reload. Offset-pagination concurrency and
local-installation privacy limitations remain. Native partial-input recovery is
tested at the DOM boundary; real-browser E2E testing has not been performed.

The maintainer authorized reconciliation of Commit 37 following PR #41's merge
at `4d64da3edd4e34d61667be58480177e7a160bd64` on 2026-10-23 IST
(2026-10-22 UTC).
Codex performs local implementation, tests, validation, review, and staging.
The human maintainer owns the single implementation commit, publication,
pull request, review, and merge. No Commit 38 PR number is assigned.
Local implementation does not mark this milestone merged or complete.

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
- saved-analysis list, detail, and individual delete API endpoints
- an explicit local SQLite persistence runtime
- a React/TypeScript/Vite web experience for new and saved analyses
- deterministic role-relevant skill import from pasted résumé text
- deterministic PDF/DOCX résumé file skill import
- explicit optional OpenAI enrichment with server-side configuration
- capability discovery and default-off Web AI opt-in
- optional AI-assisted job-description drafting
- optional AI-assisted Candidate Profile drafting
- explicit draft review/apply workflows
- confirmation-gated deletion of individual saved-analysis snapshots
- saved-history title/company search, AI presence filters, and inclusive score bounds
- explicit JSON and deterministic Markdown downloads of individual saved snapshots
- descriptive comparison of two saved snapshots with neutral deltas and skill/gap sets
- explicit saved-analysis application status with server-side History filtering
- paginated application-status activity for saved analysis detail
- private, user-authored application notes on saved analysis detail
- one optional user-managed follow-up calendar date per saved analysis
- persisted follow-up presence/date filters and stable earliest-follow-up History ordering
- read-only pipeline dashboard with seven status counts and five earliest follow-ups
- bounded, metadata-only all-record and applied-filter application pipeline CSV export
- application pipeline Board view with seven independently paginated lanes and confirmed status changes
- native desktop Kanban drag handles feeding the existing confirmation workflow
- Kanban quick follow-up panel reusing the existing date editor
- Kanban quick application notes sharing one selected editor with follow-up
- Board-specific server-backed title/company search
- Board-specific server-backed follow-up presence/date filters
- Board-specific server-backed minimum/maximum score filters
- Board-specific server-backed AI enrichment presence filter
- Board-specific server-backed follow-up sorting
- Board-level reset of filtering/sorting drafts and applied values (authorized active development)

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
and external services. AI-assisted Candidate Profile drafting is a distinct,
explicit external-processing workflow and remains outside the domain boundary
until the user applies reviewed fields.

## Next Post-MVP Milestone

None currently authorized.

## State Update Rule

Reconcile merged milestone history in the next authorized implementation commit;
do not create a separate documentation commit solely to record a PR number.
Record the actual PR number in GitHub PR metadata and description.

When reconciling a merged roadmap or authorized post-MVP pull request:

1. update the `main` SHA above
2. mark the merged milestone complete
3. remove it from active work
4. set the next authorized milestone as active work, if one exists
5. preserve completed milestone history

If repository contents and this file disagree without an explicit maintainer
exception, stop and ask the human maintainer which state is authoritative before
implementing further work.
