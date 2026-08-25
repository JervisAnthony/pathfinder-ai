# Pathfinder AI — Agent Engineering Rules

These rules apply to every coding agent working in this repository.

## Git Workflow

1. `main` is the protected integration/release branch.
2. Never work directly on `main`.
3. Create one fresh feature branch per roadmap task.
4. Branch names use the semantic form `feature/<short-kebab-description>`.
5. Open a pull request back into `main`.
6. Never merge a pull request. The human maintainer performs merges after review.
7. Never force-push or rewrite shared history.
8. Keep each roadmap task atomic and scoped to its stated objective.

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

Jules is the primary implementation agent for Pathfinder AI unless a task explicitly assigns another agent.

For a normal roadmap task, Jules is expected to own the implementation lifecycle:

1. inspect current `main`
2. verify `PROJECT_STATE.md`
3. restate the scoped implementation plan
4. implement only the requested milestone
5. add or update tests
6. run the full validation suite
7. review the final diff
8. publish the feature branch
9. open the pull request
10. respond to maintainer review feedback
11. push corrections to the existing PR
12. report the actual resulting commit SHA

The human maintainer retains:

- scope approval
- architectural review
- code review
- approval/rejection authority
- merge authority

Jules must never merge.

## Pull Request Lifecycle

Unless the task explicitly says otherwise, the expected lifecycle is:

implementation
→ validation
→ branch publication
→ pull request
→ human review
→ Jules correction if requested
→ re-validation
→ human approval
→ human merge

Review corrections should update the existing PR.

Do not open replacement PRs for review feedback unless the human maintainer explicitly requests one.

## Review Feedback

When the maintainer addresses feedback to `@jules`:

- read the complete requested correction
- preserve already-approved behavior
- change only the requested scope
- rerun the complete validation suite
- push to the existing PR
- report the actual new Git commit SHA
- never merge

Do not report a commit SHA until it exists on the remote PR branch.

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
9. publish the branch / PR unless the task explicitly says not to
10. never merge
