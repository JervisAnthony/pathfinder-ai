import { ChangeEvent, useRef, useState } from 'react';
import {
  ApiError,
  createCandidateProfileDraft,
  createCandidateProfileFileDraft,
} from '../../api/pathfinder';
import { CandidateProfileDraftResponse } from '../../types/api';

interface Props {
  available: boolean;
  onApply: (draft: CandidateProfileDraftResponse) => void;
}

const show = (value: string | number | null) => value === null || value === '' ? 'Not provided' : value;

export function CandidateProfileImport({ available, onApply }: Props) {
  const [rawText, setRawText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [draft, setDraft] = useState<CandidateProfileDraftResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);
  const inFlight = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const run = async (source: 'text' | 'file') => {
    if (!available || inFlight.current) return;
    if (source === 'text' && (!rawText.trim() || rawText.length > 200000)) {
      setError('Résumé text must contain 1 to 200,000 characters.');
      return;
    }
    if (source === 'file' && file === null) {
      setError('Select a PDF or DOCX résumé before creating a file draft.');
      return;
    }
    if (source === 'file' && file !== null
      && (!/\.(pdf|docx)$/i.test(file.name) || file.size > 10 * 1024 * 1024)) {
      setError('Select a PDF or DOCX résumé that is 10 MiB or smaller.');
      return;
    }
    inFlight.current = true;
    setLoading(true);
    setError(null);
    try {
      const next = source === 'text'
        ? await createCandidateProfileDraft({ raw_resume_text: rawText })
        : await createCandidateProfileFileDraft(file as File);
      setDraft(next);
      setApplied(false);
    } catch (caught) {
      setError(caught instanceof ApiError && caught.code === 'candidate_profile_import_unavailable'
        ? 'AI-assisted Candidate Profile import is not configured on this Pathfinder server.'
        : caught instanceof ApiError && caught.status === 422
          ? 'Check the résumé text or select a supported, readable PDF or DOCX within the documented limits.'
          : 'Candidate Profile import could not be completed. Your sources, form, and previous draft are preserved. Try again.');
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  };

  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => {
    setFile(event.target.files?.[0] ?? null);
    setError(null);
  };

  return <section className="resume-import candidate-profile-import" aria-labelledby="candidate-profile-import-heading">
    <h3 id="candidate-profile-import-heading">AI-Assisted Candidate Profile Draft</h3>
    <p id="candidate-profile-import-help">
      Create a reviewable draft from pasted résumé text or one PDF/DOCX file. Generating a draft does not change the Candidate Profile or run analysis.
    </p>
    <p id="candidate-profile-import-privacy" className="privacy-copy">
      {available
        ? 'AI-assisted profile drafting sends the supplied résumé text, or text extracted from an uploaded PDF/DOCX, to the configured OpenAI provider. This is separate from Pathfinder’s deterministic résumé skill import. Résumés may include identity, contact, employment, education, and other personal information in provider input even though Pathfinder excludes identity, contact, and Candidate Preferences from the structured draft. Pathfinder uses store=false, does not deliberately send raw file bytes, and does not add the raw source to saved analysis history. Provider and account data policies still apply. Generated fields may be inaccurate; review before Apply.'
        : 'AI-assisted Candidate Profile import is not configured. Manual entry and the separate AI-free exact-skill import remain available.'}
    </p>
    <label htmlFor="candidate-profile-resume-text">Résumé Text for AI Draft</label>
    <textarea id="candidate-profile-resume-text" rows={7} value={rawText}
      disabled={!available || loading}
      aria-describedby="candidate-profile-import-help candidate-profile-import-privacy"
      onChange={(event) => setRawText(event.target.value)} />
    <div className="resume-import-actions">
      <button type="button" className="add-btn" disabled={!available || loading || !rawText.trim()}
        onClick={() => void run('text')}>Create Profile Draft from Text</button>
      <button type="button" className="clear-resume-btn" onClick={() => setRawText('')}>Clear AI résumé text</button>
    </div>
    <label htmlFor="candidate-profile-resume-file">PDF or DOCX Résumé for AI Draft</label>
    <input ref={fileInput} id="candidate-profile-resume-file" type="file" accept=".pdf,.docx"
      disabled={!available || loading} onChange={chooseFile} />
    <div className="resume-import-actions">
      <button type="button" className="add-btn" disabled={!available || loading || file === null}
        onClick={() => void run('file')}>Create Profile Draft from File</button>
      <button type="button" className="clear-resume-btn" onClick={() => {
        setFile(null);
        if (fileInput.current) fileInput.current.value = '';
      }}>Clear AI résumé file</button>
    </div>
    {loading && <p role="status">Creating candidate profile draft…</p>}
    {error && <p role="alert" className="import-error">{error}</p>}
    {draft && <section className="candidate-draft-preview" aria-label="Candidate Profile draft preview">
      <h4>Review Candidate Profile Draft</h4>
      <p>AI-generated fields may be inaccurate. Review this preview before applying it to the editable form.</p>
      {draft.skills.length > 0 && <><h5>Skills</h5>
        <ul>{draft.skills.map((skill) => <li key={skill}>{skill}</li>)}</ul></>}
      {draft.experience.length > 0 && <><h5>Work Experience</h5>
        {draft.experience.map((entry, index) => <dl key={index}>
        <dt>Role</dt><dd>{entry.role_title}</dd><dt>Company</dt><dd>{show(entry.company_name)}</dd>
        <dt>Duration</dt><dd>{entry.duration_months === null ? 'Not provided' : `${entry.duration_months} months`}</dd>
        <dt>Description</dt><dd>{show(entry.description)}</dd><dt>Skills</dt><dd>{entry.skills.join(', ') || 'None'}</dd>
      </dl>)}</>}
      {draft.education.length > 0 && <><h5>Education</h5>
        {draft.education.map((entry, index) => <div key={index}>
        <dl><dt>Level</dt><dd>{show(entry.level)}</dd><dt>Field</dt><dd>{show(entry.field_of_study)}</dd>
          <dt>Institution</dt><dd>{show(entry.institution)}</dd><dt>Description</dt><dd>{show(entry.description)}</dd></dl>
        {entry.level === null && <p className="import-error">This education entry could not be mapped safely to Pathfinder&apos;s education levels and will not be applied automatically.</p>}
      </div>)}</>}
      {draft.projects.length > 0 && <><h5>Projects</h5>
        {draft.projects.map((entry, index) => <dl key={index}>
        <dt>Name</dt><dd>{entry.name}</dd><dt>Description</dt><dd>{show(entry.description)}</dd>
        <dt>Skills</dt><dd>{entry.skills.join(', ') || 'None'}</dd>
      </dl>)}</>}
      {draft.certifications.length > 0 && <><h5>Certifications</h5>
        {draft.certifications.map((entry, index) => <dl key={index}>
        <dt>Name</dt><dd>{entry.name}</dd><dt>Issuer</dt><dd>{show(entry.issuer)}</dd>
        <dt>Description</dt><dd>{show(entry.description)}</dd>
      </dl>)}</>}
      <div className="resume-import-actions">
        <button type="button" className="add-btn" onClick={() => { onApply(draft); setApplied(true); }}>
          Apply Draft to Candidate Profile
        </button>
        <button type="button" className="clear-resume-btn" onClick={() => { setDraft(null); setApplied(false); }}>
          Discard Profile Draft
        </button>
      </div>
      {applied && <p role="status">Draft applied. Review the Candidate Profile fields before running analysis.</p>}
    </section>}
  </section>;
}
