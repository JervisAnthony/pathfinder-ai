import { AnalysisResults } from '../analysis/AnalysisResults';
import { useEffect, useRef, useState } from 'react';
import { ApiError, downloadSavedAnalysis, getAnalysisTracking, updateAnalysisTracking } from '../../api/pathfinder';
import type { SavedAnalysisExportFormat } from '../../api/pathfinder';
import { AnalysisTracking, ApplicationStatus, SavedAnalysisDetail as SavedDetail } from '../../types/api';
import { formatSavedTimestamp } from './formatting';
import { savedAnalysisDetailToAnalysisResponse } from './mapping';
import { applicationStatuses, statusLabel } from './status';
import { ApplicationStatusActivity } from './ApplicationStatusActivity';
import { ApplicationNoteEditor } from './ApplicationNoteEditor';

interface Props {
  detail: SavedDetail;
  onBack: () => void;
  backLabel?: string;
  onDelete: (analysisId: string) => Promise<void>;
  onStatusUpdated?: () => Promise<void>;
  comparisonSelectionId?: string;
  onSelectComparison?: () => void;
  onClearComparison?: () => void;
  onCompare?: () => void;
  comparing?: boolean;
  comparisonError?: string | null;
}

function TextList({ values, empty }: { values: string[]; empty: string }) {
  return values.length > 0
    ? <ul>{values.map((value, index) => <li key={`${value}-${index}`}>{value}</li>)}</ul>
    : <p className="neutral-state">{empty}</p>;
}

function deletionErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.code === 'analysis_not_found') {
    return 'This saved analysis no longer exists.';
  }
  if (error instanceof ApiError && error.code === 'persistence_unavailable') {
    return 'Analysis history is unavailable because persistence is not configured on this Pathfinder server.';
  }
  return 'Pathfinder could not delete this saved analysis. Please try again.';
}

function exportErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.code === 'analysis_not_found') {
    return 'This saved analysis no longer exists.';
  }
  if (error instanceof ApiError && error.code === 'persistence_unavailable') {
    return 'Analysis history is unavailable because persistence is not configured on this Pathfinder server.';
  }
  return 'Pathfinder could not export this saved analysis. Please try again.';
}

export function SavedAnalysisDetail({ detail, onBack, backLabel = '← Back to History', onDelete, onStatusUpdated, comparisonSelectionId, onSelectComparison, onClearComparison, onCompare, comparing, comparisonError }: Props) {
  const candidate = detail.candidate_profile;
  const job = detail.job_description;
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [exporting, setExporting] = useState({ json: false, markdown: false });
  const exportRequests = useRef(new Set<SavedAnalysisExportFormat>());
  const [exportError, setExportError] = useState<string | null>(null);
  const [tracking, setTracking] = useState<AnalysisTracking | null>(null);
  const [statusDraft, setStatusDraft] = useState<ApplicationStatus>('not_applied');
  const [trackingError, setTrackingError] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [activityRefreshKey, setActivityRefreshKey] = useState(0);
  const [noteMutating, setNoteMutating] = useState(false);

  useEffect(() => {
    let active = true;
    void getAnalysisTracking(detail.analysis_id).then((value) => {
      if (!active) return;
      setTracking(value);
      setStatusDraft(value.application_status);
      setTrackingError(null);
    }).catch((error: unknown) => {
      if (!active) return;
      setTrackingError(error instanceof ApiError && error.code === 'persistence_unavailable'
        ? 'Analysis history is unavailable because persistence is not configured on this Pathfinder server.'
        : error instanceof ApiError && error.code === 'analysis_not_found'
          ? 'This saved analysis no longer exists.'
          : 'Pathfinder could not load the application status. Please try again.');
    });
    return () => { active = false; };
  }, [detail.analysis_id]);

  const submitStatus = async () => {
    if (!tracking || updatingStatus || deleting || comparing || noteMutating) return;
    setUpdatingStatus(true);
    setTrackingError(null);
    setStatusMessage(null);
    try {
      const value = await updateAnalysisTracking(detail.analysis_id, statusDraft);
      const changed = value.application_status !== tracking.application_status;
      setTracking(value);
      setStatusMessage('Application status updated.');
      if (changed) setActivityRefreshKey((current) => current + 1);
      try {
        await onStatusUpdated?.();
      } catch {
        setTrackingError('Application status was saved, but History could not refresh. Please try refreshing History.');
      }
    } catch (error) {
      setTrackingError(error instanceof ApiError && error.code === 'analysis_not_found'
        ? 'This saved analysis no longer exists.'
        : error instanceof ApiError && error.code === 'persistence_unavailable'
          ? 'Analysis history is unavailable because persistence is not configured on this Pathfinder server.'
          : 'Pathfinder could not update the application status. Please try again.');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const download = async (format: SavedAnalysisExportFormat) => {
    if (exportRequests.current.has(format)) return;
    exportRequests.current.add(format);
    setExporting((current) => ({ ...current, [format]: true }));
    setExportError(null);
    try {
      const blob = await downloadSavedAnalysis(detail.analysis_id, format);
      const anchor = document.createElement('a');
      const url = URL.createObjectURL(blob);
      try {
        anchor.href = url;
        anchor.download = `pathfinder-analysis-${detail.analysis_id}.${format === 'json' ? 'json' : 'md'}`;
        document.body.appendChild(anchor);
        anchor.click();
      } finally {
        anchor.remove();
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      setExportError(exportErrorMessage(error));
    } finally {
      exportRequests.current.delete(format);
      setExporting((current) => ({ ...current, [format]: false }));
    }
  };

  const confirmDelete = async () => {
    if (deleting || updatingStatus || noteMutating) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await onDelete(detail.analysis_id);
    } catch (error) {
      setDeleteError(deletionErrorMessage(error));
      setDeleting(false);
    }
  };

  return (
    <article className="saved-detail">
      <button type="button" className="back-btn" disabled={comparing || updatingStatus || noteMutating} onClick={onBack}>{backLabel}</button>
      <header className="history-heading">
        <div>
          <p className="eyebrow">Saved analysis</p>
          <h2>{job.title.title}</h2>
          {job.company_info && <p>{job.company_info.name}</p>}
        </div>
        <div className="snapshot-meta">
          <span>Saved {formatSavedTimestamp(detail.created_at)}</span>
          <span>Analysis ID: {detail.analysis_id}</span>
        </div>
      </header>

      {onSelectComparison && <section aria-label="Comparison selection">
        {!comparisonSelectionId ? <button type="button" disabled={updatingStatus || noteMutating} onClick={onSelectComparison}>Select for comparison</button> : <>
          {comparisonSelectionId === detail.analysis_id ? <p role="status">Selected for comparison</p> : <button type="button" disabled={comparing || deleting || updatingStatus || noteMutating} onClick={onCompare}>Compare with selected</button>}
          <button type="button" disabled={comparing || deleting || updatingStatus || noteMutating} onClick={onClearComparison}>Clear comparison selection</button>
        </>}
        {comparing && <p role="status">Loading saved analysis comparison…</p>}
        {comparisonError && <p role="alert">{comparisonError}</p>}
      </section>}
      <section aria-labelledby="application-status-title">
        <h3 id="application-status-title">Application status</h3>
        {tracking && <>
          <p>Current status: {statusLabel(tracking.application_status)}</p>
          <p>{tracking.updated_at ? `Last updated ${formatSavedTimestamp(tracking.updated_at)}` : 'No status change recorded.'}</p>
          <label>Choose application status
            <select value={statusDraft} onChange={(event) => setStatusDraft(event.target.value as ApplicationStatus)} disabled={updatingStatus || deleting || comparing || noteMutating}>
              {applicationStatuses.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <button type="button" disabled={updatingStatus || deleting || comparing || noteMutating} onClick={() => void submitStatus()}>Update status</button>
        </>}
        {updatingStatus && <p role="status">Updating application status…</p>}
        {statusMessage && <p role="status">{statusMessage}</p>}
        {trackingError && <p role="alert" className="error-message">{trackingError}</p>}
      </section>
      <ApplicationStatusActivity analysisId={detail.analysis_id} refreshKey={activityRefreshKey} />
      <ApplicationNoteEditor analysisId={detail.analysis_id} disabled={updatingStatus || deleting || comparing || confirmingDelete} onMutatingChange={setNoteMutating} />
      <section className="saved-export" aria-labelledby="saved-export-title">
        <h3 id="saved-export-title">Download saved analysis</h3>
        <p>Exports contain stored candidate and job information. Protect downloaded files when sharing or saving them.</p>
        <div className="export-actions">
          <button type="button" className="secondary-btn" disabled={exporting.json} onClick={() => void download('json')}>Download JSON</button>
          <button type="button" className="secondary-btn" disabled={exporting.markdown} onClick={() => void download('markdown')}>Download Markdown</button>
        </div>
        {exporting.json && <p role="status">Preparing JSON export…</p>}
        {exporting.markdown && <p role="status">Preparing Markdown export…</p>}
        {exportError && <p role="alert" className="error-message">{exportError}</p>}
      </section>

      <div className="snapshot-grid">
        <section>
          <h3>Candidate Profile</h3>
          <h4>Skills</h4>
          <TextList values={candidate.skills.map((skill) => skill.name)} empty="No skills stored." />
          <h4>Experience</h4>
          {candidate.experience.length > 0 ? (
            <ul>{candidate.experience.map((item, index) => (
              <li key={`${item.role_title.title}-${index}`}>
                <strong>{item.role_title.title}</strong>
                {item.company_name ? ` at ${item.company_name}` : ''}
                {item.duration_months ? ` — ${item.duration_months} months` : ''}
                {item.description ? <p>{item.description}</p> : null}
              </li>
            ))}</ul>
          ) : <p className="neutral-state">No experience stored.</p>}
          <h4>Education</h4>
          <TextList
            values={candidate.education.map((item) => [item.level, item.field_of_study, item.institution].filter(Boolean).join(' — '))}
            empty="No education stored."
          />
          <h4>Projects</h4>
          <TextList values={candidate.projects.map((item) => item.name)} empty="No projects stored." />
          <h4>Certifications</h4>
          <TextList values={candidate.certifications.map((item) => item.name)} empty="No certifications stored." />
          <h4>Preferences</h4>
          {candidate.preferences ? (
            <dl>
              <dt>Target titles</dt>
              <dd>{candidate.preferences.target_titles.map((item) => item.title).join(', ') || 'None'}</dd>
              <dt>Locations</dt>
              <dd>{candidate.preferences.preferred_locations.join(', ') || 'None'}</dd>
              <dt>Work modes</dt>
              <dd>{candidate.preferences.acceptable_work_modes.join(', ') || 'None'}</dd>
            </dl>
          ) : <p className="neutral-state">No preferences stored.</p>}
        </section>

        <section>
          <h3>Target Job</h3>
          {job.company_info && (
            <dl>
              <dt>Company</dt><dd>{job.company_info.name}</dd>
              <dt>Industry</dt><dd>{job.company_info.industry ?? 'Not supplied'}</dd>
              <dt>Location</dt><dd>{job.company_info.location ?? 'Not supplied'}</dd>
            </dl>
          )}
          <h4>Responsibilities</h4>
          <TextList values={job.responsibilities.map((item) => item.description)} empty="No responsibilities stored." />
          <h4>Required skills</h4>
          <TextList values={job.required_skills.map((item) => item.name)} empty="No required skills stored." />
          <h4>Preferred skills</h4>
          <TextList values={job.preferred_skills.map((item) => item.name)} empty="No preferred skills stored." />
          <h4>Experience requirement</h4>
          <p>{job.experience_requirement
            ? `${job.experience_requirement.minimum_years ?? 'No minimum'} to ${job.experience_requirement.maximum_years ?? 'no maximum'} years`
            : 'Not supplied'}</p>
          <h4>Education requirement</h4>
          <p>{job.education_requirement
            ? [job.education_requirement.level, job.education_requirement.field_of_study, job.education_requirement.description].filter(Boolean).join(' — ') || 'Not supplied'
            : 'Not supplied'}</p>
        </section>
      </div>

      <AnalysisResults
        results={savedAnalysisDetailToAnalysisResponse(detail)}
        legacyLearningRecommendations={detail.learning_recommendations === null}
      />

      <section className="delete-saved-analysis" aria-labelledby="delete-saved-analysis-title">
        <h3 id="delete-saved-analysis-title">Delete saved analysis</h3>
        <p>Remove this individual snapshot from Pathfinder's configured history.</p>
        <button
          type="button"
          className="danger-btn"
          disabled={comparing || updatingStatus || noteMutating}
          onClick={() => { setConfirmingDelete(true); setDeleteError(null); }}
        >
          Delete saved analysis
        </button>

        {confirmingDelete && (
          <div
            className="delete-confirmation"
            role="alertdialog"
            aria-labelledby="delete-confirmation-title"
            aria-describedby="delete-confirmation-description delete-confirmation-caveat"
          >
            <h4 id="delete-confirmation-title">Delete this saved analysis?</h4>
            <p id="delete-confirmation-description">
              This removes this snapshot from Pathfinder's configured analysis history. This action
              cannot be undone in Pathfinder.
            </p>
            <p id="delete-confirmation-caveat">
              This is not a guaranteed secure erase of database files, backups, or filesystem snapshots.
            </p>
            {deleting && <p role="status">Deleting saved analysis…</p>}
            {deleteError && <p className="error-message" role="alert">{deleteError}</p>}
            <div className="delete-actions">
              <button
                type="button"
                className="secondary-btn"
                disabled={deleting || comparing || updatingStatus || noteMutating}
                onClick={() => { setConfirmingDelete(false); setDeleteError(null); }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="danger-btn"
                disabled={deleting || comparing || updatingStatus || noteMutating}
                onClick={() => void confirmDelete()}
              >
                Delete permanently
              </button>
            </div>
          </div>
        )}
      </section>
    </article>
  );
}
