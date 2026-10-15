# Pathfinder AI — Agent Engineering Rules

These rules apply to every coding agent working in this repository.

## Git Workflow

1. `main` is the protected integration/release branch.
2. Never work directly on `main`.
3. Create one fresh feature branch per roadmap task.
4. Branch names use the semantic form `feature/<short-kebab-description>`.
5. The human maintainer opens one pull request per feature back into `main`.
6. Never merge a pull request. The human maintainer performs merges after review.
7. Never force-push or rewrite shared history.
8. Keep each roadmap task atomic and scoped to its stated objective.
9. Prepare one complete implementation commit per feature; no artificial checkpoint commits.
10. Codex edits, tests, validates, reviews, and stages locally. The human maintainer creates commits, pushes, creates PRs, and merges. Agents must not perform these Git publication actions.

## Repository State Preflight

Before planning or implementing any roadmap task, read:

- `AGENTS.md`
- `PROJECT_STATE.md`
- `MVP1_ROADMAP.md`
- `PROJECT_BRIEF.md`
- the current implementation and tests relevant to the task

`PROJECT_STATE.md` is the authoritative record of the repository's current roadmap position.

Do not infer the active milestone from:

- an earlier Jules task
- cached or remembered context
- an old pull request
- a previous branch name
- a task title from another session

If the checked-out repository state conflicts with `PROJECT_STATE.md`, stop before implementation and report the inconsistency.

Never replay or recreate a roadmap milestone already marked complete.

Examples:

- if Repository Foundation is complete, do not recreate package scaffolding, CI, or `pyproject.toml`
- if Candidate Profile is complete, do not rebuild that domain
- if Deterministic Matching is complete, extend it rather than replacing it

## GitHub Naming

- MVP roadmap commit numbers are internal planning references only.
- Do not include roadmap commit numbers in GitHub branch names or pull request titles.
- Use the task-specified semantic branch stem, for example:
  - `feature/deterministic-matching-engine`
  - `feature/match-explanation-gap-analysis`
- Pull request titles must use concise professional engineering language, for example:
  - `Add deterministic candidate-job matching`
  - `Add match explanations and gap analysis`
  - `Add AI provider abstraction`
- Do not prefix PR titles with:
  - `Commit N:`
  - `MVP-N:`
  - `Jules:`
  - `Agent:`
- Roadmap references may appear inside the PR description for traceability.
- Do not manually add timestamps, UUIDs, random identifiers, task IDs, or agent names to a branch.
- If the Jules platform automatically appends its own task/session identifier to the correct semantic branch stem, that platform-generated suffix is tolerated.
- A platform-generated suffix must not change the semantic meaning of the branch.
- Never merge a pull request. Human review and merge remain mandatory.

## Agent Responsibility

Codex is the local implementation agent for authorized tasks.

Codex owns inspection of the current repository and verified base, scoped
implementation, tests, full validation, diff review, documentation, and staging.
Report the branch, base SHA, staged changes, validation, and unresolved issues.
Stop with a cohesive change set ready for one human-created implementation commit.

The human maintainer retains scope approval, architectural and code review,
commit creation, pushes, PR creation, approval/rejection, and merge authority.
Do not create or amend commits, push, submit reviews, create PRs, or merge.
Never rewrite shared history.

## Pull Request Lifecycle

One meaningful feature uses one branch, one complete implementation commit,
and one pull request. No artificial checkpoint commits are permitted.
The lifecycle is local implementation, validation, staging, human commit
and publication, human PR creation, review, requested local corrections
and re-validation, human publication of corrections, human approval and merge.

Do not add a documentation-only commit solely to record the PR number.
Record the actual PR number in GitHub PR metadata and description. Reconcile
merged milestone history in the next authorized implementation commit when needed.

## Review Feedback

Read the complete requested correction, preserve approved behavior, change only
the requested scope, rerun the complete validation suite, and stage corrections
for the human maintainer to publish to the existing PR. Do not open a replacement
PR unless explicitly requested. Report only actual verified Git state; never
invent a commit SHA or PR number. Never merge.

## Scope Discipline

Every roadmap task has one primary product objective.

Do not:

- restart earlier milestones
- rebuild repository tooling
- replace working architecture without a task requirement
- implement future-roadmap functionality early
- perform unrelated cleanup or refactoring
- modify dependencies unless required
- modify unrelated documentation or configuration
- silently expand scope because another defect was noticed

If an unrelated issue is discovered, report it separately.

## Engineering Standards

- Use Python 3.13+.
- Use a `src/` package layout.
- Add type hints to production Python code.
- Prefer immutable/value-object domain models where appropriate.
- Keep domain logic independent from FastAPI, databases, LLM SDKs, and UI frameworks.
- Infrastructure must depend on domain/application abstractions, not the reverse.
- Do not introduce a dependency unless the task requires it and the PR explains why.
- Never hard-code secrets, tokens, API keys, personal data, or credentials.
- Include `.env.example` only when configuration variables actually exist.
- Do not commit virtual environments, caches, build artifacts, generated coverage files, or IDE-specific state.

## Testing

- Every behavior change requires tests.
- New domain/application behavior should maintain 100% line coverage unless a clearly documented exception is justified.
- Tests must be deterministic and must not require paid/external APIs.
- External providers must be mocked/faked at boundaries.
- Run the complete relevant test suite before reporting completion.
- Never claim a command passed unless it was actually executed successfully.

## Code Quality

Before completion, run the repository's canonical:

- tests
- Ruff lint
- Ruff format check
- mypy

Do not suppress type/lint errors merely to obtain a green build unless the suppression is genuinely necessary and documented.

## Product Safety / Integrity

- Do not implement scraping or automation that violates third-party platform terms.
- Do not fabricate employer, job, salary, or candidate data.
- Match scores must be explainable; avoid presenting heuristic scores as objective hiring probabilities.
- Keep LLM-generated content clearly separated from deterministic scoring.
- Treat resumes and candidate data as sensitive user data.

## Task Discipline

For every task:

1. inspect the current repository and latest `main`
2. verify `PROJECT_STATE.md`
3. restate the scoped implementation plan
4. implement only the requested scope
5. add/update tests
6. run validation
7. review the final diff against `main`
8. summarize changed files, decisions, and validation results
9. stage the complete intended change set for the human maintainer to commit and publish
10. never merge
