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
- `GET /api/v1/analyses/overview`
- `GET /api/v1/analyses/export.csv`
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

### Saved analysis comparison

Open a saved detail and choose **Select for comparison**. Return to History,
use the existing search, filters, or pagination, open a different saved detail,
and choose **Compare with selected**. Selection alone does not send a comparison
request. The selected snapshot cannot be compared with itself through this UI.
Selection, draft/applied filters, and the current page remain in React component
memory while History stays mounted; they are cleared when it unmounts. No
localStorage, sessionStorage, IndexedDB, cookies, or URL persistence is used.

`GET /api/v1/analyses/compare?left_analysis_id=<uuid>&right_analysis_id=<uuid>`
retrieves two existing saved snapshots and runs a pure application comparison.
It never recomputes matching, explanation, interview preparation, or learning
recommendations and never calls AI. The response contains left/right IDs, saved
timestamps, role/company names, stored scores, structured skill keyword coverage,
and AI-presence booleans. It compares stored score components, matched skills,
missing required/preferred skills, and independent experience/education gaps.
It does not return complete Candidate Profiles or Job Descriptions or compare AI
text. Open either normal detail to inspect evidence or use existing downloads.

Numerical deltas mean **right minus left** only. Scores and keyword percentages
must both be known; otherwise the delta is unavailable. Unknown scores are never
zero. Missing score components say **Not present**. Components follow the existing
enum order. Skills use exact existing deterministic normalized Skill identity,
deduplicated in snapshot order: shared/left-only names follow the left snapshot,
right-only names follow the right snapshot. No fuzzy, semantic, alias, embedding,
or AI matching occurs. Experience and education gaps remain independent stored
side values. AI is shown only as stored enrichment present/absent.

**Interpretation boundary:** A higher or lower score or changed skill/gap set does
not by itself establish candidate improvement or regression. Saved snapshots may
use different candidate data, different job requirements, or both. Comparison is
descriptive, not career advice, causal inference, a ranking, or hiring likelihood.

The static comparison route precedes UUID detail routes. The backend also permits
same-ID comparison, returning zero deltas where values are known. Missing/deleted
IDs return the same safe 404 without disclosing which side exists; invalid UUIDs
return 422 and persistence-disabled servers return 503. The Web clears stale
selection on comparison 404 and preserves usable detail/history. Deleting a
locally selected snapshot clears selection. Back to History preserves filters and
pagination; **Clear comparison** also removes selection.

Comparison is request-scope computation only: no comparison history, output,
selected IDs, logs of snapshot contents, telemetry, analytics, or external data
transfer is added. SQLite schema, persisted SavedAnalysis structure, and payload
version 2 remain unchanged. No dependencies are added. Existing individual
deletion, history filters, and snapshot export contracts remain intact; comparison
export is outside this scope. Normal detail/export privacy caveats still apply
when opening or downloading a snapshot.

### Saved analysis export and portability

Open a saved analysis in History, inspect its detail, and explicitly choose
**Download JSON** or **Download Markdown**. No download starts automatically.
Downloads leave the detail visible and retain applied history filters. The existing
confirmation-gated Delete action remains separate.

`GET /api/v1/analyses/{analysis_id}/export?format=json` downloads the public
saved-detail information as pretty-printed UTF-8 JSON. It includes the structured
candidate/job data, stored score/explanation, interview preparation, learning
recommendations, and any saved AI enrichment. The JSON data matches the normal
saved-detail endpoint; it is not the internal persistence payload.

Use `format=markdown` for a human-readable deterministic report. JSON is the
default format. Markdown contains saved metadata, target role, match summary,
available evidence/gaps and keyword coverage, stored interview guidance, available
learning recommendations, and optional stored AI enrichment. Unknown scores say
"Not scored" rather than zero. Stored text is escaped to keep Markdown syntax and
HTML-like content inert. The report is application guidance, not a résumé, cover
letter, ATS result, hiring probability, employer decision, or employment guarantee.

Exports are available only from saved snapshots. They do not recompute analysis,
invoke AI or import/drafting workflows, alter persistence, or create another
snapshot. Repeated exports of the same snapshot produce the same content. Stored
AI enrichment may appear, clearly labelled with its stored provider name; export
never contacts that provider.

Responses are attachments named `pathfinder-analysis-<uuid>.json` or
`pathfinder-analysis-<uuid>.md`, derived only from the validated analysis UUID.
JSON uses `application/json; charset=utf-8`; Markdown uses
`text/markdown; charset=utf-8`. Successful responses use `Cache-Control: no-store`
and `X-Content-Type-Options: nosniff`. Unknown/deleted IDs return safe 404 errors,
invalid UUIDs/formats return 422, and persistence-disabled servers return 503.

**Export privacy:** Files may contain sensitive structured candidate/job data.
Pathfinder does not export raw résumé source, uploaded file bytes, original
filenames, raw job-posting source, prompts, provider request IDs, API keys, database
paths, or runtime configuration. No generated export file is stored on the server,
and no analysis data is placed in localStorage, sessionStorage, IndexedDB, or
cookies. The browser uses a Blob and temporary object URL for the explicit
download, then removes the anchor and revokes the URL.

Downloaded files become your responsibility once saved outside Pathfinder.
Protect them when storing or sharing them. `no-store` reduces HTTP caching; it
does not remove an explicitly downloaded file. Deleting the saved snapshot does
not delete previously downloaded copies.

No schema migration, version-2 persistence change, or additional dependency is
required. Existing deterministic analysis, AI behavior, history search/filter
semantics, and individual deletion remain unchanged.

### Application pipeline Kanban board

Each card also offers **Edit note**, opening a **Quick application note** panel
with the selected job and company above the seven lanes. Notes and follow-up
editing share one selected editor: switching modes or cards, closing, or leaving
Board view discards unsaved drafts without automatically saving. The panel reuses
`ApplicationNoteEditor` and the existing GET, PUT, and DELETE
`/api/v1/analyses/{analysis_id}/note` endpoints. Only the selected note is fetched
on opening; ordinary Board loading never fetches notes for individual cards.

Read the persisted note or explicit empty state, then explicitly **Save note** to
create or edit it. Text is preserved exactly; blank, whitespace-only, unchanged,
and over-10,000-character drafts cannot be submitted. **Clear note** opens a
confirmation; only confirming removes the saved note. Cancel leaves it intact.
Loading, last-updated information, acknowledged save/clear messages, safe errors,
and **Retry note** remain in the panel. Failed writes preserve persisted content
and the draft for intentional retry. No success is reported before the server
acknowledges persistence.

Opening focuses the quick-editor heading; **Close editing** restores focus to the
initiating card action, or **Refresh board** if that card disappeared. Buttons,
labelled text areas, accessible status/error messages, and the responsive panel
support keyboard and narrow-screen use. Pending writes block editor switching,
closing, dragging/dropping, status confirmation, Detail/Overview navigation, List
view, and manual refresh. Late responses cannot populate a different record or
emit callbacks after unmount.

Note saves and clears preserve loaded lane pages, offsets, History filters and
pagination, comparison selection, and Overview without refreshing metadata that
does not depend on notes. Reopening fetches authoritative server content.
**Refresh board** also reloads a pristine selected note; unsaved drafts survive
refresh, so close and reopen after discarding a draft to see external changes.
There is no background polling or conflict-resolution workflow for simultaneous
edits from different sessions.

Notes use existing server-side storage only. They are private user-authored
context, separate from immutable analysis snapshots, matching, and AI. Notes are
excluded from History summaries and CSV/JSON/Markdown exports; they are never
sent to an LLM, browser storage, analytics, telemetry, or logs. This feature adds
no authentication, encryption, multi-user isolation, reminders, notifications,
backend/schema/API contract changes, or dependencies. Real-browser E2E testing
has not been performed; interaction and lifecycle coverage uses deterministic
component and integration tests.

Each card offers **Edit follow-up**, opening one **Quick follow-up** panel above
the lanes without opening Detail. It reuses `ApplicationFollowUpEditor` and the
existing follow-up GET/PUT/DELETE API. Opening fetches the authoritative persisted
date, independently of lane loading. Choose a native date and explicitly **Save
follow-up** to set or reschedule it; unchanged or empty dates cannot be saved.
Dates remain `YYYY-MM-DD` calendar days without timezone conversion. **Clear
follow-up** requires confirmation; Cancel leaves persistence unchanged. **Close
editing** discards drafts and restores focus to the card action, falling back to
Refresh board if the card disappeared. Switching cards discards the old draft;
late responses cannot populate the new editor.

Successful changes keep the panel and acknowledged result visible, reload initial
lane pages, and refresh History and Overview without resetting List filters,
drafts, pagination, or the selected Board view. Safe errors support intentional
retry without optimistic card changes. If History refresh fails after persistence,
the editor reports the saved/cleared result separately; use History **Refresh**
to retry synchronization. Lane and Overview failures have independent Retry
controls. External changes still require a manual refresh or reopening the editor.

Opening the panel invalidates any drag session. Pending follow-up requests block
status mutations, closing, switching editors, Detail navigation, and switching to
List; status confirmation blocks follow-up mutations and competing quick-edit
actions. After completion, normal dragging and status selection remain available.
Native keyboard and touch controls, a focused heading, labeled date input, visible
focus, accessible messages, and a wrapping mobile panel support accessible use.
The existing Detail editor remains available. Follow-up metadata stays in existing
persistence; no snapshots, status, or notes are rewritten. No automatic reminders,
notifications, external calendar integration, browser storage, telemetry, or new
dependency is introduced. Saved job/company metadata remains sensitive user data.

Analysis History defaults to **List view**. Choose **Board view** for the
**Application Pipeline Board**, with seven lanes in order: **Not applied**,
**Applied**, **Interviewing**, **Offer**, **Accepted**, **Rejected**, and
**Withdrawn**. Empty lanes stay visible. Each saved snapshot is a separate card;
snapshots of the same role are not deduplicated. Missing tracking metadata means
Not applied. Cards show stored job/company information, deterministic match score
or Not scored, saved time, and any scheduled follow-up calendar date.

The board has its own title/company search, independently of List filters.
Switching views preserves applied filters, unapplied drafts, List pagination,
comparison selection, Overview data, and CSV export state. Pipeline Overview and
CSV controls remain above either view. **Open details** uses existing Saved
Analysis Detail, including notes, follow-ups, activity, comparison, exports, and
deletion. Returning restores Board view and reloads persisted metadata.

Each lane independently requests `GET /api/v1/analyses` through
`getAnalysisHistory(11, offset, { application_status })`, displays up to ten cards,
and uses the eleventh only to detect another page. **Load more** advances the
offset by ten and appends in existing `created_at DESC, analysis_id DESC` order,
excluding duplicate IDs. This uses existing offset pagination, not snapshot-stable
cursors: concurrent changes in other sessions may require **Refresh board**.
Loading, empty, error, Retry, and Load more states are independent per lane.
Refresh resets lane pages; older requests cannot overwrite newer results.

Use **Search board by job title or company**, then **Apply search** or Enter.
Typing changes only the draft; the **Applied board search** indication identifies
the query actually displayed. Submission trims and collapses whitespace, with a
200-character maximum. Blank submission or **Clear search** removes the search;
Clear also removes the draft. Unchanged normalized queries and clearing draft-only
text do not reload lanes. Invalid input shows an accessible error and preserves
the applied query and cards.

Search reuses `getAnalysisHistory(11, offset, { application_status, query })` and
the existing `GET /api/v1/analyses` metadata filtering. Every lane loads its first
matching page on a changed query, retaining independent Load more and Retry with
the applied query. Server ordering and the ten-card limit with lookahead remain.
No complete snapshots are downloaded or searched in the browser. Empty matching
lanes say **No matching saved analyses**; this does not mean records were deleted.
Lane failures stay isolated, and failed additional pages retain earlier cards.
Older successes and failures cannot overwrite or append to a newer search.

**Refresh board**, History **Refresh**, confirmed status changes, and follow-up
saves/reschedules/clears retain the applied Board query while resetting lane pages.
Note-only writes do not reload lane summaries. Close any quick note/follow-up
editor before applying or clearing search to protect unsaved drafts. Search is
also blocked during status confirmation and mutations. Changing the search
invalidates active drags without changing saved workflow data.

Board search does not filter Overview totals, CSV exports, List results,
comparison, or scoring. List drafts/applied filters survive view switches;
Board search lives only in the mounted Board and resets when it unmounts or the
page reloads. No browser storage, cookies, URL persistence, or telemetry is added.
Search covers saved title/company metadata only, using the existing literal
substring semantics (SQL-like characters remain literal). It excludes candidate
profiles, résumés, notes, job-description bodies, and AI text. There is no fuzzy,
semantic, embedding, or AI search, no result total supplied by the API, and no
new endpoint, schema, dependency, or authentication change. Search text travels
to the configured backend in request query parameters; existing installation and
network privacy limitations apply.

The **Board follow-up filters** form has independent draft and applied values.
Choose **All**, **Scheduled**, or **Not scheduled**, optional **Board follow-up
from** and **Board follow-up to** dates, then **Apply filters** or Enter. Changing
controls alone makes no requests. The applied summary describes what the lanes
currently display. An unchanged submission avoids a reload. **Clear follow-up
filters** resets only the follow-up controls and applied values, preserving Board
search; **Clear search** preserves the applied follow-up filters. Applying either
form uses the other form's applied criteria and leaves its unsent draft alone.

Every lane combines its `application_status` and applied `query` with existing
`has_follow_up`, `follow_up_from`, and `follow_up_to` API parameters. All omits
presence filtering, Scheduled sends `true`, and Not scheduled sends `false`.
Date bounds are inclusive and select scheduled records even with All; missing
dates do not count as empty calendar dates. Historic dates and valid leap days
are allowed. Bounds remain canonical `YYYY-MM-DD` calendar days without timezone
conversion. Invalid calendar dates, reversed ranges, and Not scheduled with any
date bound show accessible validation feedback, retain applied cards/filters,
and send no requests. Invalid ranges are never silently adjusted.

Changed follow-up filters reload first pages in all seven lanes, invalidate old
requests/drags, and preserve independent ten-card pagination, lookahead, server
newest-first ordering, deduplication, and Retry with the combined applied context.
No follow-up-date sorting or result total is added. Empty filtered lanes say
**No matching saved analyses**. Failed additional pages keep earlier cards.
Board/History refresh, successful status changes, and follow-up saves/reschedules/
clears preserve applied filters. A card can leave matching results after a date
change; successful feedback remains in the quick editor, and closing falls back
to Refresh board for focus if the card is gone. This does not delete the record.
Note-only writes still avoid summary reloads. Close quick editing before applying
or clearing filters; status confirmation and pending mutations also block changes.

Follow-up filtering does not affect History List criteria/drafts/pages, Overview,
comparison, or CSV exports. Like Board search, filters live only in the mounted
Board and reset on unmount or page reload. No new backend behavior, schema, API
contract, dependency, AI, overdue classification, notification, calendar service,
browser storage, cookie, URL persistence, or telemetry is introduced. The feature
reads existing user-managed follow-up metadata and never searches private notes
or candidate/résumé content. Existing installation/privacy and offset-pagination
concurrency limitations apply. Real-browser E2E testing has not been performed;
deterministic component and integration tests cover the interactions.

To move one card, choose a new status, select **Review change**, then explicitly
**Confirm status change** or **Cancel**. The confirmation identifies the snapshot
and both statuses. Selecting a value, cancelling, or retaining the current status
never changes persistence. Immediately before the existing tracking PUT, the
board uses `getAnalysisTracking()` to verify the displayed status. A changed
server status blocks the update, explains the conflict, and reloads the board for
a new intentional action. This is a best-effort check, not atomic compare-and-swap.
`updateAnalysisTracking()` reuses existing status activity recording and preserves
notes, follow-ups, scores, and immutable snapshots. Only one board mutation may
run at once. Failures retain cards and allow retry or cancellation; success is
shown only after the server responds.

Desktop users can also drag the **Drag to change status** handle to another lane.
The handle alone is draggable, leaving card text, selects, and Open details
available for their normal interactions. The source card gains an outline and a
Dragging this card label; destination lanes show **Drop to review status change**
and highlight on hover. A valid cross-lane drop opens the same confirmation as
the selector. Dropping never reads tracking or writes status on its own, and the
card stays in its original lane until confirmed persistence succeeds. Same-lane
drops do nothing and do not reorder cards. External files/text, unknown markers,
and canceled or refreshed drag sessions are ignored.

Drag metadata stays in component memory; native DataTransfer contains only an
opaque marker under a custom MIME type, never record IDs, titles, company names,
notes, or analysis payloads. Drag end, Escape where delivered by the browser,
refresh, detail loading, and unmount invalidate the session and clear feedback.
Cancel restores focus to the initiating handle when available, falling back to
Refresh board if the original card disappeared. Errors retain cards and allow
retry or cancellation through the existing confirmation. The tracking GET/PUT,
stale-status check, duplicate guard, activity history, and success refresh remain
shared with the selector; concurrency verification remains best-effort.

Dragging is a desktop enhancement, with no custom touch gestures or keyboard
dragging. Keyboard and touch users can choose a new status on the card and select
Review change, then confirm or cancel. Activating a drag handle by click or
keyboard focuses that card's native status selector. Visible instructions explain
the alternative; native touch drag support is not claimed. No drag library or
new dependency is introduced.

A successful move reloads every lane from its first page and refreshes History
and Overview while preserving List drafts, applied filters, and page. **Refresh
board** works independently of List loading; History **Refresh** also updates
Overview and the active board. There is no timer polling. Desktop lanes scroll
horizontally when needed; mobile lanes stack. Semantic headings, labeled native
selects, keyboard controls, visible focus indicators, focused confirmations,
status messages, and error alerts support accessible use without relying on color.

There is no bulk update, automatic status transition, AI invocation,
browser storage, cookie write, third-party request, new endpoint, schema change,
or dependency. All operations use existing Pathfinder APIs. Sensitive saved data
remains subject to the existing persistence/privacy boundaries; deterministic
scoring and AI enrichment remain independent of application management.

### Application pipeline CSV export

History provides two explicit spreadsheet downloads. **Download all CSV** includes
all saved analyses in default newest-first order, regardless of History filters.
**Download filtered CSV** includes every record matching the currently applied
History filters and ordering, across all pages. It becomes available for applied
filters or nondefault ordering, including sort-only criteria. Editing draft controls
does not change export criteria until **Apply filters**. Exporting does not reset
pagination, refresh the dashboard, navigate, or change saved workflow data.

`GET /api/v1/analyses/export.csv` accepts the same `query`, `ai_enriched`,
`min_score`, `max_score`, `application_status`, `has_follow_up`, `follow_up_from`,
`follow_up_to`, and `sort` parameters as History. It shares canonical calendar-date
validation, literal substring matching and wildcard escaping, AND composition,
inclusive bounds, effective status fallback, and deterministic ordering with the
History API. No pagination parameters affect export. Default order is creation
timestamp descending, then analysis ID descending. Earliest-follow-up order places
non-null dates first, ascending, with the same creation/ID tie-breakers; nulls are
last. Each saved snapshot contributes one row, without job/employer deduplication.

The fixed column order is:

```text
analysis_id,created_at,job_title,company_name,match_score,ai_enriched,application_status,status_updated_at,follow_up_on
```

UUIDs are canonical strings. Creation and status timestamps are ISO 8601 UTC
values; follow-up dates remain `YYYY-MM-DD` calendar dates without timezone
conversion. Scores retain their stored numeric precision without recomputation.
AI presence is lowercase `true` or `false`. Missing company, score, status-update
timestamp, and follow-up date cells are blank. Missing tracking metadata means
`not_applied`.

Files use UTF-8 with a BOM, standard CSV quoting, and CRLF record separators for
spreadsheet interoperability. Commas, quotation marks, embedded line breaks, and
Unicode text are preserved as cells. Title/company values that begin with `=`,
`+`, `-`, or `@`, including after leading whitespace or control/format characters,
receive an apostrophe prefix before CSV quoting to keep them inert spreadsheet
text. This transformation affects only exported text, never stored values or
numeric/date fields. Empty results still download the header.

Each export permits at most **10,000 data rows**, excluding the header. SQLite
retrieves at most 10,001 lightweight summaries in one SELECT to detect overflow.
More than 10,000 matches returns HTTP 413 with `export_limit_exceeded` before any
CSV content is sent; there is no silent truncation. Apply narrower filters and
retry. Invalid filters return HTTP 422; unavailable persistence returns the safe
HTTP 503 envelope. Successful responses use `text/csv; charset=utf-8`, an attachment
filename of `pathfinder-application-pipeline.csv`, `Cache-Control: no-store`, and
`X-Content-Type-Options: nosniff`. Export errors also use no-store. The filtered
browser download uses `pathfinder-application-pipeline-filtered.csv`.

Downloads have independent progress/error states and suppress repeated requests
for the same mode. Failed downloads preserve applied filters, unsaved drafts,
pagination, History, and dashboard data and allow retry. Temporary anchors and
object URLs are removed/revoked after download attempts; late responses after
unmount do not start downloads. CSV data is not persisted in browser storage or
cookies, nor is an export file saved on the server.

**CSV privacy:** Downloaded files contain job/company information and become the
user's responsibility outside Pathfinder. Store and share them carefully; deleting
a saved record does not remove existing downloaded copies. CSV excludes candidate
profiles, raw resume text, complete job descriptions, interview preparation,
learning recommendations, AI text, notes, activity history, snapshot payloads,
credentials, and internal configuration. The feature reads summary metadata only,
without snapshot decoding, database writes, score changes, AI calls, third-party
data transfer, schema changes, or new dependencies. Individual JSON/Markdown
snapshot exports retain their existing content and behavior. No CSV import,
cloud upload, spreadsheet API integration, or scheduled reporting is introduced.

### Saved analysis search and filters

`GET /api/v1/analyses` accepts optional `query`, `ai_enriched`, `min_score`, and
`max_score` parameters alongside `limit` and `offset`. Search checks job title
and company name as a literal substring, with whitespace trimmed and collapsed.
Blank search is inactive; normalized search is limited to 200 characters.
SQLite performs case-insensitive matching for ASCII; Unicode text is supported,
but full Unicode case folding is not provided. `%`, `_`, backslash, apostrophes,
and SQL-like input are literal text rather than search syntax.

AI filtering checks whether enrichment was stored. Score bounds are inclusive,
finite values from 0 to 100, with minimum no greater than maximum. Unscored rows
remain visible without score bounds and are excluded when either bound is active.
All active filters compose before pagination; newest-first ordering is unchanged.
Invalid filters return the existing safe HTTP 422 validation envelope.

History offers explicit **Apply filters** and **Clear filters** controls. Applying
or clearing resets to page one; refresh, detail viewing, and deletion preserve
applied filters. A filtered empty result is distinct from an empty history.
Filter state stays in component memory and is cleared when History is unmounted;
it is not saved in browser storage. Search only reads summary metadata and does
not search candidate content, decode snapshots, recompute scores, or call AI.
No schema migration, payload-version change, or new dependency is required.

### Saved analysis application status

History shows an explicitly user-managed application status for each saved
analysis: **Not applied**, **Applied**, **Interviewing**, **Offer**, **Accepted**,
**Rejected**, or **Withdrawn**. Open a saved detail, choose a status, and click
**Update status** to save it. Changing the selection alone does not save. A
same-status update leaves the timestamp unchanged. Existing snapshots display
**Not applied** until changed. The History status filter is applied only when
**Apply filters** is clicked; it runs before pagination, and ordering stays
newest first.

Pathfinder never infers status. It does not affect match scores or AI enrichment
and is not a hiring probability. Status is separate mutable metadata; changing
it never edits a saved analysis snapshot. `GET` and `PUT`
`/api/v1/analyses/{analysis_id}/tracking` read and update the tracking resource.
The saved-detail response remains a snapshot resource. JSON and Markdown exports
remain snapshot exports, so changing Applied to Interviewing does not change
their contents. Saved-analysis comparison likewise excludes status.

SQLite adds one separate `analysis_tracking` table with only analysis ID, enum
status, and update timestamp. The `saved_analyses` table and version-2 payload
remain unchanged. Existing databases gain the metadata table through idempotent
table creation; no snapshot backfill or payload migration is needed. No tracking
row means effective **Not applied**. Deleting a saved analysis cascades to its
tracking row. Status is local workflow metadata and is not sent to OpenAI or
stored in the browser. Tracking stores no notes, contacts, interview feedback,
salary, offer details, rejection reasons, or candidate free text.

### Application status activity timeline

Saved Analysis Detail shows **Application activity** below the current status
editor. Each recorded event shows the previous status, new status, and time the
user changed it in Pathfinder. The timeline is newest first and loads 20 events
at a time; **Load older activity** retrieves another page. A repeated update to
the same status creates no event and leaves the current timestamp unchanged.
Events are append-only and the current `analysis_tracking` row remains the
source of the effective status. A status change and its event share one timestamp
and one SQLite transaction.

Existing statuses and timestamps are preserved when activity history becomes
available. Pathfinder does not reconstruct earlier transitions. For example, an
existing **Interviewing** status can initially show **No application status
changes have been recorded yet**. Only future explicit changes in Pathfinder
create events. An **Applied → Interviewing** event means the user changed the
status in Pathfinder at that time; it does not establish when an employer took
any action.

SQLite adds `analysis_tracking_events` and an index beside the existing
`saved_analyses` and `analysis_tracking` tables. Columns in those existing
tables and the version-2 snapshot payload remain unchanged. Existing databases
gain the event table without payload migration or event backfill. Deleting a
saved analysis cascades to both its current tracking and events.
`GET /api/v1/analyses/{analysis_id}/tracking/history` returns paginated events
with `limit` and `offset`; it does not return snapshot data.

Events store only the saved analysis ID, previous enum status, new enum status,
and transition timestamp. They contain no notes, contacts, email, interview
feedback, salary, rejection reasons, AI text, or candidate free text. Activity
is not sent to AI or stored in the browser. JSON and Markdown downloads remain
immutable snapshot exports and exclude activity. Saved-analysis comparison also
excludes activity and transition counts.

### Saved analysis application notes

Saved Analysis Detail lets the user keep one private, plain-text application
note. The user writes and explicitly saves or clears it; editing the textarea
does not autosave. A note can contain at most 10,000 characters. Saving identical
content preserves its update timestamp. Clearing requires confirmation, and
there is no note history or revision recovery.

Notes are user-authored workflow metadata, separate from immutable
`SavedAnalysis`, deterministic analysis, current application status, and status
activity. Pathfinder does not generate notes or deliberately send their content
to AI. Editing a note does not change status or its timestamp and does not add a
status-transition event. The activity timeline remains a status-transition log.

SQLite stores a note's parent analysis ID, exact content, and update timestamp
in one additive `analysis_notes` table. The other tables—`saved_analyses`,
`analysis_tracking`, and `analysis_tracking_events`—retain their columns. Existing
analyses receive no backfilled note row. The saved-analysis payload remains
version 2 with no migration, and deleting an analysis cascades to its note.
`GET`, `PUT`, and `DELETE /api/v1/analyses/{analysis_id}/note` manage the separate
note resource.

Notes may contain sensitive user-entered information. Users remain responsible
for what they choose to enter. Notes are rendered as ordinary text and are not
interpreted as HTML or Markdown. This feature does not store notes or drafts in
the browser or deliberately log note content. Notes are excluded from History
summaries and search, snapshot JSON and Markdown exports, and saved-analysis
comparison. There is no note export or note comparison.

### Application pipeline overview

Analysis History includes an **Application Pipeline Overview** above its filters.
It summarizes all saved analysis records in the configured database, independently
of the current History filters and pagination. Multiple snapshots of the same job
count separately; these totals do not represent deduplicated job applications or
unique employers.

The overview shows the total saved analyses, scheduled and unscheduled follow-up
counts, and counts for all seven application statuses: Not applied, Applied,
Interviewing, Offer, Accepted, Rejected, and Withdrawn. Missing tracking metadata
counts as Not applied. All status counts sum to the total; scheduled plus
unscheduled follow-ups also sum to the total, including terminal statuses.

**Earliest scheduled follow-ups** lists at most five records, ordered by stored
calendar date ascending, creation timestamp descending, then analysis ID descending.
Past dates remain eligible. There are no overdue, due-today, due-soon, or upcoming
classifications. Each entry opens the existing Saved Analysis Detail. Dates retain
their date-only semantics and are never converted between timezones.

The overview loads independently of History, with explicit loading, safe errors,
and **Retry overview**. History remains usable if overview loading fails, and a
successful overview remains usable if the list fails. **Refresh** reloads both
resources independently. Returning from Detail reloads the overview, including
after status changes, follow-up saves/changes/clears, and deletions. There is no
polling or scheduled refresh. An empty database displays genuine zero counts for
all categories and a clear follow-up empty state; loading does not show false zeros.

`GET /api/v1/analyses/overview` is read-only and accepts no filter parameters.
HTTP 200 returns `total_analyses`, ordered `status_counts` (each with `status` and
`count`), `scheduled_follow_up_count`, `unscheduled_follow_up_count`, and
`earliest_follow_ups`. Each follow-up contains only its analysis ID, job title,
nullable company name, effective application status, and follow-up calendar date.
The endpoint sends `Cache-Control: no-store`. Unavailable persistence returns the
existing safe HTTP 503 error envelope without storage or configuration details.

SQLite performs one grouped metadata aggregation and one query limited to five
records in an explicit, consistent read transaction. Reads neither decode saved
payloads nor modify snapshots, notes, workflow timestamps, schema, or payload
version 2. No candidate profile, resume source, note, or AI content is retrieved
for the overview. Dashboard data stays in ordinary React memory without browser
storage, cookies, telemetry, external services, or new dependencies. Existing
installation privacy limits still apply. This dashboard adds no reminders,
notifications, calendar sync, automated applications, AI calls, hiring predictions,
success rates, or application success probabilities.

### Saved analysis application follow-up date

Saved Analysis Detail provides one optional follow-up calendar date per
`SavedAnalysis`, after Application note. Set a date to revisit an application,
then choose **Save follow-up** explicitly; editing the date input does not
autosave. Same-date saves are idempotent and preserve the server-controlled
update timestamp. **Clear follow-up** requires confirmation. There is no
follow-up history or revision recovery.

The date is explicit user-managed workflow metadata in `YYYY-MM-DD` form, with
no time-of-day or timezone attached. Display preserves the calendar day across
browser timezones. Past dates are allowed and are never automatically cleared.
History rows show **Follow up: <date>** when a date exists. By default, existing
ordering, search, filters, and pagination remain unchanged.

Pathfinder does not send reminder notifications, scheduled notifications, email,
SMS, or WhatsApp reminders. There is no calendar integration, automatic status
change, AI-suggested follow-up date, follow-up automation, or overdue classification.

History also provides a follow-up worklist. Choose **All follow-ups**, **Scheduled**,
or **Not scheduled**, optional **Follow-up from** and **Follow-up to** calendar
bounds, and **Newest saved first** or **Earliest follow-up first**. Draft changes
only take effect with **Apply filters**. **Clear filters** resets all controls;
both actions restart pagination at page one. Date bounds are inclusive, work
independently, and select scheduled records even with All follow-ups. A reversed
range or Not scheduled combined with a date bound produces a validation error.

`GET /api/v1/analyses` accepts optional `has_follow_up=true|false`,
`follow_up_from=YYYY-MM-DD`, `follow_up_to=YYYY-MM-DD`, and
`sort=created_desc|follow_up_asc`. Dates must be canonical calendar dates;
timestamps and timezone offsets are rejected with HTTP 422. Historical dates
and leap days are supported without timezone conversion. These filters combine
with title/company search, AI presence, score bounds, and application status.
SQLite filters and orders persisted metadata before pagination. Earliest-follow-up
order places scheduled dates first, ascending, and null dates last. Ties use
creation timestamp descending, then analysis ID descending, so pagination is
deterministic. Omitting the new parameters preserves the response structure and
existing `created_at DESC, analysis_id DESC` ordering.

Filter state stays in component memory and is not stored in browser storage.
Worklist reads do not change follow-up timestamps or immutable snapshot payloads,
and do not call AI or external services. Dates remain private workflow metadata;
this feature adds no reminders, calendar sync, due-date classifications, automatic
status changes, additional follow-up events, or recruiter contact.

`GET`, `PUT`, and `DELETE /api/v1/analyses/{analysis_id}/follow-up` manage the
separate resource with no-store responses. PUT accepts a strict ISO calendar
date; null, datetime strings, and extra fields are rejected. Clearing uses
DELETE and is idempotent for an existing analysis. Missing analyses return 404,
invalid UUIDs/dates return 422, and absent persistence returns 503. Follow-up
loads independently, so a load error leaves the saved detail usable. Unsaved
drafts stay in component memory, with no localStorage, sessionStorage, IndexedDB,
or cookie persistence.

SQLite now contains `saved_analyses`, `analysis_tracking`,
`analysis_tracking_events`, `analysis_notes`, and the additive
`analysis_follow_ups` table. The existing four schemas remain unchanged.
Follow-up rows store only the parent ID, ISO date, and UTC update timestamp;
there is no backfill. Parent deletion cascades to follow-up metadata.
`CURRENT_PAYLOAD_VERSION` remains 2, with no SavedAnalysis payload migration or
snapshot re-encoding.

Follow-up dates remain outside CandidateProfile, JobDescription, deterministic
matching, scoring, explanations, gaps, interview preparation, learning
recommendations, AI enrichment, status-transition history, and application
notes. Follow-up metadata is not sent to AI. It is intentionally excluded from
deterministic JSON and Markdown SavedAnalysis exports and saved-analysis
comparison. Changing or clearing a date does not alter snapshot export content,
application status or its timestamp, activity, or notes.

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
