import { useRef, useState } from 'react';
import { ApiError, importResumeFileSkills } from '../../api/pathfinder';
import { Skill } from '../../types/api';
import { commaSeparatedSkills } from './utils';

const MAX_RESUME_FILE_BYTES = 10 * 1024 * 1024;
const fileErrors: Record<string, string> = {
  resume_file_too_large: 'Résumé files must be 10 MiB or smaller.',
  unsupported_resume_file: 'Only PDF and DOCX résumé files are supported.',
  resume_file_unreadable: 'Pathfinder could not read this résumé file. Check that it is valid and not password-protected.',
  resume_file_no_text: 'No extractable text was found. Scanned or image-only PDFs are not supported.',
  resume_file_content_too_large: 'This résumé file exceeds document extraction limits. Try a smaller or simpler document.',
};

interface Props {
  requiredSkills: string;
  preferredSkills: string;
  onImported: (skills: Skill[]) => void;
}

export function ResumeFileImport({ requiredSkills, preferredSkills, onImported }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const pending = useRef(false);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const importFile = async () => {
    if (pending.current) return;
    setError(null);
    setMessage(null);
    if (!file) {
      setError('Select a PDF or DOCX résumé file first.');
      return;
    }
    if (!/\.(pdf|docx)$/i.test(file.name)) {
      setError(fileErrors.unsupported_resume_file);
      return;
    }
    if (file.size > MAX_RESUME_FILE_BYTES) {
      setError(fileErrors.resume_file_too_large);
      return;
    }
    const required = commaSeparatedSkills(requiredSkills).map((skill) => skill.name);
    const preferred = commaSeparatedSkills(preferredSkills).map((skill) => skill.name);
    if (required.length === 0 && preferred.length === 0) {
      setError('Add at least one required or preferred target-job skill before importing résumé skills.');
      return;
    }
    pending.current = true;
    setLoading(true);
    try {
      const result = await importResumeFileSkills(file, required, preferred);
      const matches = [...result.matched_required_skills, ...result.matched_preferred_skills];
      onImported(matches);
      setMessage(matches.length === 0
        ? 'No exact target-job skill matches were found in the uploaded résumé.'
        : `Found ${matches.length} role-relevant ${matches.length === 1 ? 'skill' : 'skills'} in the uploaded résumé.`);
    } catch (caught) {
      setError(caught instanceof ApiError
        ? (fileErrors[caught.code ?? ''] ?? caught.message)
        : 'Pathfinder could not import résumé skills from this file. Try again.');
    } finally {
      pending.current = false;
      setLoading(false);
    }
  };

  return (
    <div className="resume-file-import">
      <p id="resume-file-help">
        Upload a PDF or DOCX résumé to find exact target-job skills in the required or
        preferred skill lists. Maximum file size: 10 MiB. Scanned or image-only PDFs are not supported.
      </p>
      <label htmlFor="resume-file">Résumé File</label>
      <input id="resume-file" ref={input} type="file" accept=".pdf,.docx"
        aria-describedby="resume-file-help resume-file-privacy" disabled={loading}
        onChange={(event) => {
          setFile(event.target.files?.[0] ?? null);
          setMessage(null);
          setError(null);
        }} />
      <p id="resume-file-privacy" className="privacy-copy">
        The file is sent to the configured Pathfinder backend for transient text extraction
        and exact skill matching. Pathfinder does not add the file or its raw text to saved analysis history.
      </p>
      <div className="resume-import-actions">
        <button type="button" className="add-btn" disabled={loading} onClick={() => void importFile()}>
          Find Skills from File
        </button>
        <button type="button" className="clear-resume-btn" disabled={loading} onClick={() => {
          if (input.current) input.current.value = '';
          setFile(null);
          setMessage(null);
          setError(null);
        }}>Clear résumé file</button>
      </div>
      {(loading || message) && <p className="import-message" role="status">
        {loading ? 'Finding role-relevant skills from file…' : message}
      </p>}
      {error && <p className="error-message" role="alert">{error}</p>}
    </div>
  );
}
