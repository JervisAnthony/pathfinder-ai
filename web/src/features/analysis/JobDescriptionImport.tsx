import { useRef, useState } from 'react';
import { ApiError, createJobDescriptionDraft } from '../../api/pathfinder';
import { JobDescriptionDraftResponse } from '../../types/api';

interface Props {
  available: boolean;
  onApply: (draft: JobDescriptionDraftResponse) => void;
}

const labels: Record<keyof JobDescriptionDraftResponse, string> = {
  title: 'Job Title', company_name: 'Company', company_industry: 'Industry', company_location: 'Location',
  responsibilities: 'Responsibilities', required_skills: 'Required Skills', preferred_skills: 'Preferred Skills',
  unclassified_skills: 'Unclassified Skills', minimum_years: 'Minimum Years', maximum_years: 'Maximum Years',
  education_level: 'Education Level', education_field_of_study: 'Education Field of Study', education_description: 'Education Requirement',
};

export function JobDescriptionImport({ available, onApply }: Props) {
  const [rawText, setRawText] = useState('');
  const [draft, setDraft] = useState<JobDescriptionDraftResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);

  const createDraft = async () => {
    if (!available || !rawText.trim() || inFlight.current) return;
    if (rawText.length > 50000) {
      setError('Job posting text must not exceed 50,000 characters.');
      return;
    }
    inFlight.current = true;
    setLoading(true); setError(null);
    try {
      setDraft(await createJobDescriptionDraft({ raw_job_description: rawText }));
      setApplied(false);
    } catch (caught) {
      setError(caught instanceof ApiError && caught.code === 'job_description_import_unavailable'
        ? 'AI-assisted job description import is not configured on this Pathfinder server.'
        : caught instanceof ApiError && caught.status === 422
          ? 'Check that the job posting contains 1 to 50,000 characters of text.'
          : 'Job description import could not be completed. Your text and previous draft are preserved. Try again.');
    } finally {
      inFlight.current = false; setLoading(false);
    }
  };

  return <section className="resume-import" aria-labelledby="job-import-heading">
    <h3 id="job-import-heading">Import Job Description</h3>
    <p id="job-import-help">Paste a job posting to create an AI-assisted structured draft. Review the draft before applying it to Target Job.</p>
    <label htmlFor="job-posting-text">Job Posting Text</label>
    <textarea id="job-posting-text" rows={6} value={rawText} aria-describedby="job-import-help job-import-privacy"
      onChange={(event) => setRawText(event.target.value)} />
    <p id="job-import-privacy" className="privacy-copy">{available
      ? 'Creating a draft sends raw job-posting text to the configured OpenAI provider. Generated fields may be inaccurate. No candidate profile is required and no candidate scoring runs. Review the draft before analysis. Pathfinder does not save the raw posting.'
      : 'AI-assisted job description import is not configured on this Pathfinder server.'}</p>
    <div className="resume-import-actions">
      <button type="button" className="add-btn" disabled={!available || !rawText.trim() || loading} onClick={() => void createDraft()}>Create Structured Draft</button>
      <button type="button" className="clear-resume-btn" onClick={() => setRawText('')}>Clear job posting text</button>
    </div>
    {loading && <p role="status">Creating structured job draft…</p>}
    {error && <p role="alert" className="import-error">{error}</p>}
    {draft && <section aria-label="Job description draft preview">
      <h4>Review Structured Draft</h4>
      <p>AI-generated fields may be inaccurate. Review before applying; Target Job stays editable.</p>
      <dl>{(Object.keys(labels) as Array<keyof JobDescriptionDraftResponse>).map((key) => {
        const value = draft[key];
        if (value === null || value === '' || (Array.isArray(value) && !value.length)) return null;
        return <div key={key}><dt>{labels[key]}</dt><dd>{Array.isArray(value)
          ? <ul>{value.map((item, index) => <li key={index}>{item}</li>)}</ul>
          : value}</dd></div>;
      })}</dl>
      {draft.unclassified_skills.length > 0 && <p>These skills appeared in the job posting but were not clearly marked as required or preferred. Review and assign them manually if appropriate.</p>}
      <div className="resume-import-actions">
        <button type="button" className="add-btn" onClick={() => { onApply(draft); setApplied(true); }}>Apply Draft to Target Job</button>
        <button type="button" className="clear-resume-btn" onClick={() => { setDraft(null); setApplied(false); }}>Discard Draft</button>
      </div>
      {applied && <p role="status">Draft applied. Review the Target Job fields before running analysis.</p>}
    </section>}
  </section>;
}
