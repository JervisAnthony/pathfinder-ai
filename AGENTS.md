# Pathfinder AI — Agent Engineering Rules

These rules apply to every coding agent working in this repository.

## Git Workflow

1. `main` is the protected integration/release branch.
2. Never work directly on `main`.
3. Create one fresh feature branch per numbered project commit.
4. Branch names use: `feature/<short-kebab-description>`.
5. Open a pull request back into `main`.
6. Never merge a pull request. The human maintainer performs merges after review.
7. Never force-push or rewrite shared history.
8. Keep each project commit atomic and scoped to its stated objective.

## GitHub Naming

- MVP roadmap commit numbers are internal planning references only.
- Do not include roadmap commit numbers in GitHub branch names or pull request titles.
- Use the exact feature branch name specified by the task.
- Never append agent task IDs, session IDs, timestamps, UUIDs, random numbers, or generated suffixes to branch names.
- Pull request titles should be concise, professional engineering actions such as:
  - Add deterministic candidate-job matching
  - Add match explanations and gap analysis
  - Add AI provider abstraction
- Do not prefix PR titles with:
  - Commit N:
  - MVP-N:
  - Jules:
  - Agent:
- Roadmap references may appear inside the PR description for traceability.
- If an agent platform cannot publish the exact required branch name, the agent must stop before publishing and report the limitation rather than silently creating a differently named branch.
- Never merge a pull request. Human review and merge remain mandatory.

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
2. restate the scoped implementation plan
3. implement only the requested scope
4. add/update tests
5. run validation
6. summarize changed files, decisions, and validation results
7. publish a branch / PR only when explicitly instructed or when the task workflow specifies it
8. never merge
