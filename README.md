# Pathfinder AI

AI-powered job matching, application intelligence, and interview preparation with explainable candidate–role analysis.

## Development Status

Pathfinder AI MVP-1 is complete. The React/TypeScript/Vite application submits structured candidate and job profiles to the FastAPI API and presents deterministic, explainable analysis results. Core scoring, interview preparation, and targeted learning recommendations remain independent of LLMs; no AI provider is required for the default flow.

Pathfinder AI now supports:
- deterministic structured compatibility scoring
- transparent score components
- matched structured skill evidence
- structured gap analysis
- structured skill keyword coverage
- deterministic interview preparation
- deterministic targeted learning recommendations grounded in existing gap analysis
- required- and preferred-skill learning guidance
- experience- and education-gap guidance
- evidence-grounded interview themes
- candidate talking points
- likely interview question categories
- candidate-to-interviewer questions
- provider-neutral optional AI enrichment abstraction
- an explicitly configured OpenAI enrichment adapter with Web opt-in
- optional AI-assisted job-description drafting with explicit preview and Apply
- optional AI-assisted Candidate Profile drafting from text or PDF/DOCX with explicit preview and Apply
- explicit opt-in SQLite persistence for complete analysis snapshots
- a React/TypeScript/Vite frontend for submitting analyses, browsing saved history, and deleting individual snapshots
- deterministic role-relevant skill import from pasted résumé text
- deterministic role-relevant skill import from PDF and DOCX résumé files

**Explicit Limits of the Current Matching Baseline:**
- keyword coverage uses structured job skills only
- it is not ATS keyword analysis
- pasted résumé text can be compared only with supplied target required and preferred skills
- résumé skill import uses deterministic exact phrase matching and does not infer synonyms
- users review and edit imported skills before analysis
- PDF/DOCX text extraction supports exact target-skill import and optional AI-assisted Candidate Profile drafting; no general-purpose or authoritative résumé parser, OCR, or ATS simulation is provided
- no fuzzy/semantic matching is performed
- no hiring probability is produced
- explanation results are deterministic
- no LLM required for interview generation
- no AI-generated interview predictions
- no employer-specific inference
- interview prep is deterministic, structured, and grounded only in supplied candidate/job evidence
- optional OpenAI enrichment uses the replaceable provider contract and never changes deterministic results
- deterministic scoring and interview preparation remain independent of AI
- targeted learning recommendations are deterministic and remain independent of AI
- suggested course topics are generic learning or search topics, not verified courses
- no external course catalog is queried and no provider or course listing is fabricated
- optional SQLite-backed history for saved analyses
- no LLM or external service is required for résumé skill import

**Notes on the Web MVP:**
- The frontend operates as a single-page application (SPA).
- No authentication or multi-user accounts are implemented.
- The browser does not persist candidate data in local storage, session storage, or IndexedDB.
- Saving and AI enrichment are independent explicit choices; both default to off. AI opt-in is available only when the server reports it configured.
- The History view reads server-backed SQLite snapshots and never recomputes historical results.
- Saved history snapshots cannot be edited. An individual snapshot can be deleted from its detail view after explicit confirmation.
- Learning recommendations are derived only from the supplied role comparison and its deterministic gap analysis.
- The UI does not link to course marketplaces or claim that suggested topics are verified third-party listings.
- Résumé text remains editable, and only exact target-skill matches are merged into the editable Candidate Skills field.
- Résumé text is not written to localStorage, sessionStorage, or IndexedDB.

> **Privacy:** Saved analysis history may contain candidate profile information and should be treated as sensitive local application data. Pathfinder does not currently provide authentication, authorization, encryption at rest, account isolation, or multi-user isolation.

> **Résumé privacy:** Pasted résumé text may contain sensitive personal information. For deterministic skill import, the web client sends it only to the configured Pathfinder backend for that request. Pathfinder does not include the raw text in `SavedAnalysis`, analysis-history payloads, or browser storage. Administrators of the configured server or network may still be able to observe request traffic.

The deterministic résumé skill-import workflow is AI-free. The separate
AI-assisted Candidate Profile workflow sends raw pasted résumé text, or extracted
PDF/DOCX text, from the Pathfinder backend to the configured OpenAI provider only
after the user explicitly requests a draft. The raw source can include identity,
contact, employment, education, and other personal information even though those
identity and contact fields are excluded from the structured draft.

## API Surface & Persistence

Pathfinder exposes a FastAPI surface with opt-in, repository-backed persistence.

Endpoints:
- `GET /api/v1/health`
- `GET /api/v1/capabilities`
- `POST /api/v1/analysis`
- `POST /api/v1/job-description/draft`
- `POST /api/v1/candidate-profile/draft`
- `POST /api/v1/candidate-profile/file-draft`
- `POST /api/v1/resume/skill-import`
- `POST /api/v1/resume/file-skill-import`
- `GET /api/v1/analyses`
- `GET /api/v1/analyses/{analysis_id}`
- `DELETE /api/v1/analyses/{analysis_id}`

The `POST /api/v1/analysis` endpoint receives typed candidate and job information and returns deterministic explanations, interview preparation, and targeted learning recommendations. It accepts an `include_ai_enrichment: bool` flag to optionally trigger generative analysis if a provider is injected.

The `POST /api/v1/resume/skill-import` preprocessing endpoint accepts ephemeral
résumé text plus target required/preferred skills. It returns boundary-aware,
case-insensitive exact matches and unmatched skills in source order. It does not
perform fuzzy or semantic matching, invoke an LLM, emulate an ATS, estimate a
hiring probability, persist the raw text, or change deterministic scoring.

### PDF and DOCX résumé skill import

`POST /api/v1/resume/file-skill-import` accepts `multipart/form-data` with one
`file`, repeated `required_skills` strings, and repeated `preferred_skills`
strings. At least one target skill is required. It returns the same four ordered
matched/unmatched required/preferred skill lists as pasted-text import, without
raw extracted text, filenames, excerpts, or document metadata.

The web form supports both upload and pasted-text import in its résumé section.
Both merge exact matches into editable Candidate Skills, preserving manual skills
and removing canonical duplicates. Zero matches is a successful result. Clearing
the file resets selection without removing imported skills or pasted text.
Only reviewed structured candidate data enters normal analysis and saved history.

Supported files are PDFs with extractable text and DOCX documents, including
uppercase extensions. The backend checks the PDF signature or DOCX ZIP/XML
structure; filename and MIME type alone are insufficient. Image-only/scanned
PDFs, encrypted/password-protected PDFs, legacy DOC, images, and other office
formats are unsupported. Corrupt, blank, encrypted, and over-limit documents
produce safe errors without parser details. There is no OCR fallback.

Extraction limits (documents are rejected, never silently truncated):

- 10 MiB uploaded file
- 100 PDF pages
- 200,000 extracted characters
- 2,000 DOCX ZIP entries and 50 MiB total declared uncompressed content

Infrastructure uses `pypdf>=6.17.0` for page-text extraction and
`python-multipart>=0.0.32` for FastAPI uploads. DOCX uses standard-library
`zipfile` and `xml.etree.ElementTree`, with no separate DOCX dependency. Paragraph
text is reconstructed across runs, including tables, headers, footers, footnotes,
and endnotes. Encrypted ZIP entries and XML DTD/entity declarations are rejected.
Archives are never unpacked to filesystem paths; embedded objects, images,
external relationships, and PDF attachments are not processed. Extraction then
delegates to the existing deterministic skill importer, without changing scoring,
using AI, or accessing persistence. These limits do not guarantee complete text
recovery or provide a general-purpose document-parser sandbox.

Uploaded files may contain sensitive personal information. Pathfinder processes
them transiently for the import request, does not return extracted raw text to the
browser, and does not add file bytes, filenames, metadata, or extracted raw text to
`SavedAnalysis` or browser storage. Saved analysis payloads remain version 2.
The route reads at most 10 MiB + 1 byte and explicitly closes the upload resource
after handling, including failure paths. FastAPI/Starlette multipart handling may
temporarily spool uploads before route entry according to framework/runtime
behavior. This is not a guarantee of memory-only handling or secure deletion.
The existing installation privacy limitations continue to apply.

## Requirements

- Python >= 3.13, < 3.14
- Node.js (v24 recommended) / npm

## Backend Local Setup

We recommend creating a virtual environment using Python 3.13 before installing dependencies.

```
python -m venv .venv
source .venv/bin/activate
```

Install the project along with its development dependencies:

```bash
pip install -e ".[dev]"
```

Start the FastAPI development server using uvicorn:

```bash
python -m uvicorn pathfinder_ai.api.app:create_app --factory --host 127.0.0.1 --port 8000
```

`create_app()` remains stateless by default. Saving and history endpoints return
`persistence_unavailable` unless a repository is explicitly configured. To enable
local SQLite persistence, set `PATHFINDER_SQLITE_PATH` and use the runtime factory.
Its parent directory is created from the configured path when needed.

On macOS or Linux:

```bash
PATHFINDER_SQLITE_PATH=.pathfinder/pathfinder.db python -m uvicorn pathfinder_ai.api.runtime:create_runtime_app --factory --host 127.0.0.1 --port 8000
```

On Windows PowerShell:

```powershell
$env:PATHFINDER_SQLITE_PATH = ".pathfinder\pathfinder.db"
python -m uvicorn pathfinder_ai.api.runtime:create_runtime_app --factory --host 127.0.0.1 --port 8000
```

The configured database contains sensitive candidate and job snapshots. Use it
only on a trusted local installation and protect the database file appropriately.

### Saved analysis deletion and privacy

Pathfinder lets a user delete one saved-analysis snapshot at a time from its
History detail view. The Web flow requires explicit confirmation before calling
`DELETE /api/v1/analyses/{analysis_id}`. A successful deletion returns HTTP 204
with no response body. The deleted UUID then disappears from the history list
and detail APIs. An unknown or already-deleted UUID returns 404; a server without
configured persistence returns 503.

Deletion removes only the selected `SavedAnalysis` row from Pathfinder's
configured persistence. It does not affect unrelated saved analyses, an original
résumé file, pasted résumé source text, a raw job posting, browser downloads,
source files outside Pathfinder, or records held by OpenAI or another external
provider. Pathfinder already avoids deliberately persisting most raw import
source material.

This is logical deletion from normal Pathfinder application access, not a
cryptographic or forensic secure erase. SQLite free pages, filesystem snapshots,
backups, storage replicas, or external backup systems may retain historical bytes
outside Pathfinder's normal access. This feature does not run `VACUUM`, enable
SQLite secure-delete behavior, or manage storage-layer backups.

Deletion is permanent within Pathfinder and has no undo, trash, or restore flow.
There is no bulk delete, automated retention, or automatic expiration. The
SQLite schema and version-2 saved-analysis payload remain unchanged.

## Optional OpenAI AI Enrichment

**AI enrichment defaults off.** It runs after deterministic analysis and does not
affect the match score, explanation, gap analysis, interview preparation, or
learning recommendations. Its generated text may be inaccurate and should be
reviewed before use. It is not a hiring probability, ATS score, employer
prediction, or automated hiring recommendation. It does not parse résumés or job
descriptions.

Only `create_runtime_app()` reads server configuration. Set both
`PATHFINDER_OPENAI_API_KEY` and `PATHFINDER_OPENAI_MODEL` to nonblank values to
enable OpenAI. Neither set (or both blank) leaves AI disabled. Partial
configuration fails at startup with a message that does not echo values. There is
no default model: the operator must select a model that supports the Responses
API and the request parameters below. No key or model is supplied by the browser.

On macOS/Linux, using placeholders:

```bash
export PATHFINDER_OPENAI_API_KEY='<your-key>'
export PATHFINDER_OPENAI_MODEL='<chosen-model>'
python -m uvicorn pathfinder_ai.api.runtime:create_runtime_app --factory --host 127.0.0.1 --port 8000
```

On Windows PowerShell:

```powershell
$env:PATHFINDER_OPENAI_API_KEY = "<your-key>"
$env:PATHFINDER_OPENAI_MODEL = "<chosen-model>"
python -m uvicorn pathfinder_ai.api.runtime:create_runtime_app --factory --host 127.0.0.1 --port 8000
```

Keep real credentials outside source control and browser configuration. These
settings work independently of `PATHFINDER_SQLITE_PATH`: neither adapter,
persistence only, AI only, and both together are supported. Plain `create_app()`
remains environment-independent and has no provider or persistence unless injected.

`GET /api/v1/capabilities` returns only `ai_enrichment_available`,
`job_description_import_available`, `candidate_profile_import_available`, and
`persistence_available` booleans. It describes configured adapters, without
contacting OpenAI or verifying keys, models, quota, balance, or network health.
The Web client loads it when the app initializes. Failure leaves deterministic
analysis available and AI unavailable; the client does not poll. The checkbox
never opts in automatically. Checked analysis sends `include_ai_enrichment=true`;
unchecked analysis sends false. If AI fails (502 `ai_provider_error`) or becomes
unavailable (503 `ai_provider_unavailable`), the form is preserved so the user can
uncheck AI and retry. There is no silent fallback.

The infrastructure adapter uses the official `openai>=3.8.0` Python SDK, the
verified Python-3.13-compatible implementation floor. It calls
`client.responses.create(...)` and reads `response.output_text`. Calls use
`store=False`, `max_output_tokens=1000`, no tools, no conversation/previous-response
IDs, and no model-specific temperature or reasoning settings. The runtime uses a
30-second SDK timeout, disables automatic retries (`max_retries=0`), and closes
its client on application shutdown. The synchronous provider executes through a
thread pool rather than blocking the API event loop. No frontend dependency is
added. See the [official Responses API documentation](https://developers.openai.com/api/reference/python/resources/responses/methods/create).

The high-level provider instructions are separate from serialized untrusted
input. They preserve the authority of deterministic evidence, prohibit invented
qualifications/employer facts, and request concise Application Framing, Interview
Emphasis, Gaps to Address, and Caveats / Verify Before Use. Embedded instructions
are treated as data. Prompt injection can still influence generated text, but the
model has no tools or external action capability. Output renders as ordinary
React text, including in saved history; blank output is a provider failure.

**External data and cost:** Enabling AI sends structured `JobDescription`,
`MatchExplanation`, and optional `InterviewPreparation` information to OpenAI.
This can contain candidate-derived evidence or labels. The complete candidate
profile and raw uploaded/pasted résumé content are not directly supplied by this
workflow. Processing is therefore not local-only when AI is enabled, and API
usage may incur cost under the operator's account/model configuration.

Pathfinder uses `store=False` and does not intentionally create provider-side
conversation state. This does not override provider/account data policies or
guarantee zero retention or confidentiality. No key, prompt, model configuration,
provider response ID, or SDK metadata is deliberately logged or included in saved
snapshots. When saving is selected, only the existing AI result fields (`content`
and `provider_name`, which is `OpenAI`) accompany the deterministic snapshot.
History displays that stored text without calling the provider again. SQLite
schema and payload version 2 remain unchanged. Browser storage does not retain AI
payloads. Canonical tests use fake clients or in-memory HTTP transports, never
live OpenAI credentials or paid requests.

## AI-Assisted Job Description Import

Paste a job posting into **Import Job Description** inside Target Job, then
choose **Create Structured Draft**. **Generated fields may be inaccurate: review
the preview before explicitly choosing Apply Draft to Target Job.** Generation
does not change the form or run analysis. Applied fields remain editable; only
the final reviewed structured Target Job enters the existing analysis request.

Apply fills blank scalar fields (including experience and education), preserves
existing nonblank values, and merges responsibilities and skill lists in existing
order with case/whitespace-insensitive deduplication. Required skills take
precedence over preferred duplicates. Unclassified skills appear only in the
preview and must be assigned manually if appropriate. Missing titles remain
blank and must be supplied before normal analysis. Clear job posting text clears
only the source; Discard Draft removes only the preview. Failed generation keeps
the raw text, previous successful draft, and existing form work.

The provider-neutral application contract returns an immutable
`JobDescriptionDraft`, not a domain `JobDescription`. Extraction instructions
require source-supported titles, company details, responsibilities, explicit
experience and education, and skills. Missing information stays null/empty;
ambiguous skills remain unclassified. No confidence percentage, candidate score,
hiring recommendation, company lookup, or skill ontology expansion is produced.
Structured constraints cannot guarantee factual accuracy or perfect resistance
to prompt injection. High-level instructions stay separate from untrusted job
text, and output renders as ordinary React text.

`POST /api/v1/job-description/draft` accepts only `raw_job_description` and returns
the typed draft, without raw input or provider metadata. Input must be nonblank
and at most 50,000 characters, checked before trimming. Drafts allow at most 30
responsibilities and 50 skills per category; oversized output is rejected rather
than truncated. Experience must be nonnegative integers in a valid range.
Education uses the existing `EducationLevel` values; unmatched explicit
qualifications can be retained as an education description. Unusable output,
refusal, parse failure, or incompatible models fail safely with 502
`job_description_import_error`; an unconfigured provider returns 503
`job_description_import_unavailable`. Invalid requests return safe 422 errors.

The existing `PATHFINDER_OPENAI_API_KEY` and `PATHFINDER_OPENAI_MODEL` configuration
enables all three AI capabilities. There is no new setting or default model. Runtime
shares one SDK client and shutdown lifecycle across all three adapters, retaining the
30-second timeout and disabled automatic retries. Draft calls run in a thread
pool. Plain `create_app()` remains environment-independent; each provider can be
injected separately. Persistence remains independent of all three AI capabilities.

The adapter uses `client.responses.parse(..., text_format=...)` with an internal
Pydantic schema that forbids extra fields, then maps the parsed result into the
application draft. This exact path was verified with installed OpenAI SDK 3.8.0
through an in-memory HTTP transport. Requests use `store=False`,
`max_output_tokens=1600`, no tools, web/file search, conversation, or previous
response ID. The configured model must support the Structured Outputs operation;
capabilities report configuration only, not model compatibility, key validity,
quota, or connectivity. See [OpenAI Structured Outputs documentation](https://developers.openai.com/api/docs/guides/structured-outputs).

**External processing and privacy:** Explicit draft generation sends raw
job-posting text to the configured OpenAI provider and may incur API cost. No
candidate profile is required, and no scoring, enrichment, or history save runs
during drafting. Pathfinder does not deliberately log or persist raw postings,
unapplied drafts, prompts, model settings, response IDs, or import metadata in
SQLite or browser storage. `store=False` does not override provider/account
retention policies or guarantee universal zero retention.

Job import and downstream analysis enrichment are independent user actions:
using either, both, or neither is supported. Draft creation never checks the
analysis-enrichment checkbox. Deterministic scoring, explanation, interview
preparation, learning recommendations, and résumé import remain unchanged.
Saving stores the reviewed structured job through the existing version-2
snapshot format; history never regenerates drafts or analysis. There is no
persistence migration, new Python dependency, or frontend dependency. Tests use
synthetic data and fake providers; no live or paid API request is required.

## AI-Assisted Candidate Profile Import

Pathfinder supports optional AI-assisted drafting of the structured Candidate
Profile fields used by the application, but does not provide a general-purpose
or authoritative résumé parser. In the Candidate Profile form, the user supplies
either distinct AI résumé text or a separately selected PDF/DOCX file, explicitly
chooses **Create Profile Draft from Text** or **Create Profile Draft from File**,
reviews the resulting preview, and then chooses **Apply Draft to Candidate
Profile**. Generation alone does not change the form, run deterministic analysis,
enable downstream AI enrichment, or save history. Applied fields remain editable.

The provider-neutral application contract returns an immutable,
`CandidateProfileDraft` containing only skills, work experience, education,
projects, and certifications. It excludes Candidate Preferences and personal
identity/contact fields. Target titles, preferred locations, and acceptable work
modes remain manually controlled. Education evidence that cannot safely map to
an existing `EducationLevel` stays visible in the preview with `level=null` and
is not applied automatically. Apply preserves existing form values, appends new
records after them, uses conservative full-record deduplication, and merges skills
in existing order with case/whitespace-insensitive deduplication.

`POST /api/v1/candidate-profile/draft` accepts only `raw_resume_text`, which must
contain 1 to 200,000 characters. `POST /api/v1/candidate-profile/file-draft`
accepts one multipart `file`. Both return a
strict typed Candidate Profile draft without raw source, filename, provider,
model, request ID, token usage, or arbitrary metadata. Provider absence returns
503 `candidate_profile_import_unavailable`; provider/refusal/parse/output failure
returns 502 `candidate_profile_import_error`; invalid text and document failures
use the existing safe validation and résumé-file error contracts.

The file workflow receives a PDF/DOCX through the Pathfinder backend, reads at
most 10 MiB + 1 byte, and reuses the existing bounded document extractor: PDF
signature and encryption checks, 100-page limit, 200,000-character extracted-text
limit, and DOCX ZIP/XML safeguards described above. The resulting transient text
is sent to OpenAI only after the user requests AI drafting. Pathfinder does not
deliberately send raw file bytes to OpenAI. There is no OCR, image résumé support,
or legacy DOC support. Framework multipart spooling may still occur before route
entry under the caveat described in the file-import section.

**External processing and privacy:** AI-assisted Candidate Profile drafting sends
raw pasted résumé text, or extracted PDF/DOCX text, to the configured OpenAI
provider. Source content may include name, contact information, employment,
education, and other personal information even though the strict structured schema
does not contain identity/contact fields. Generated fields may be inaccurate and
require human review. Requests use `store=False`, but provider/account data
policies still apply; Pathfinder does not claim universal zero retention. Raw
source, file bytes, extracted text, unapplied drafts, prompts, model configuration,
and provider response metadata are not deliberately logged, placed in browser
storage, or added to saved analysis. Saving after Apply stores only the final
reviewed Candidate Profile through the unchanged version-2 persistence format.

The OpenAI adapter uses the configured `PATHFINDER_OPENAI_MODEL` and
`client.responses.parse(..., text_format=...)` with an internal Pydantic schema
that forbids extra fields. Each stateless request uses `store=False`,
`max_output_tokens=3500`, no tools, web/file search, functions, conversation, or
previous response ID. High-level extraction rules remain separate from untrusted
résumé input and forbid invented evidence, inferred skill aliases, preferences,
scoring, employability judgments, and hiring/job recommendations. This structure
contains available actions and output fields but cannot guarantee perfect prompt
injection resistance or factual accuracy. Synchronous extraction/provider work
runs in thread pools. The runtime shares one configured SDK client and one close
lifecycle across enrichment, job drafting, and Candidate Profile drafting.

The existing deterministic résumé text/file skill import remains separate and
AI-free: it compares exact target-job skill phrases without sending résumé content
to OpenAI. Candidate drafting and downstream enrichment are independent explicit
actions. Deterministic scoring, explanations, interview preparation, learning
recommendations, persistence schema, and version-2 payload remain unchanged. No
Python or frontend dependency was added for this feature.

## Frontend Local Setup

Navigate to the `web` directory to run the React application:

```bash
cd web
npm ci
```

Start the Vite development server:

```
npm run dev
```

The Vite development server is configured to proxy requests to `/api` directly to the FastAPI backend running on `http://127.0.0.1:8000`.

## Validation Commands

To validate backend changes:

```bash
python -m pytest --cov=pathfinder_ai --cov-report=term-missing --cov-fail-under=100
python -m ruff format --check .
python -m ruff check .
python -m mypy src
```

To validate frontend changes:

```bash
cd web
npm run lint
npm run typecheck
npm run test:run
npm run build
```

## Repository Structure

```
.
├── src/
│   └── pathfinder_ai/      # Main application package
├── tests/                  # Unit and integration tests
├── web/                    # React/TypeScript Web MVP
├── .github/workflows/      # CI/CD workflows
├── pyproject.toml          # Project and tool configuration
└── README.md               # Project documentation
```
