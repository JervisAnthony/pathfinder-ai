import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, importResumeFileSkills, importResumeSkills } from '../../../api/pathfinder';
import { AnalysisForm } from '../AnalysisForm';

vi.mock('../../../api/pathfinder', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../../api/pathfinder')>(),
  importResumeFileSkills: vi.fn(), importResumeSkills: vi.fn(),
}));
const fileMock = vi.mocked(importResumeFileSkills);
const pasteMock = vi.mocked(importResumeSkills);
const result = { matched_required_skills: [{ name: 'python' }], matched_preferred_skills: [{ name: 'docker' }], unmatched_required_skills: [], unmatched_preferred_skills: [] };
const fileInput = () => screen.getByLabelText('Résumé File');
const skillsInput = () => screen.getByLabelText('Skills (comma-separated)');
const pasteInput = () => screen.getByLabelText('Résumé Text');
const upload = () => fireEvent.click(screen.getByRole('button', { name: 'Find Skills from File' }));
const change = (element: HTMLElement, value: string) => fireEvent.change(element, { target: { value } });
function selectFile(name = 'resume.pdf', size?: number) {
  const file = new File(['synthetic PRIVATE-CONTENT'], name);
  if (size !== undefined) Object.defineProperty(file, 'size', { value: size });
  fireEvent.change(fileInput(), { target: { files: [file] } });
  return file;
}
function setup(targets = true) {
  const onSubmit = vi.fn();
  const view = render(<AnalysisForm onSubmit={onSubmit} isLoading={false} error={null} />);
  if (targets) {
    change(screen.getByLabelText('Required Skills (comma-separated)'), 'Python, FastAPI');
    change(screen.getByLabelText('Preferred Skills (comma-separated)'), 'Docker');
  }
  return { onSubmit, ...view };
}

describe('resume file workflow', () => {
  beforeEach(() => { fileMock.mockReset(); pasteMock.mockReset(); fileMock.mockResolvedValue(result); });

  it('has an accessible file control and local missing-file feedback', () => {
    setup();
    expect(fileInput()).toHaveAttribute('accept', '.pdf,.docx');
    expect(screen.getByRole('button', { name: 'Find Skills from File' })).toHaveAttribute('type', 'button');
    upload();
    expect(screen.getByRole('alert')).toHaveTextContent('Select a PDF or DOCX');
    expect(fileMock).not.toHaveBeenCalled();
  });

  it('requires target skills without requiring a complete job form', () => {
    setup(false); selectFile(); upload();
    expect(screen.getByRole('alert')).toHaveTextContent('Add at least one');
    expect(fileMock).not.toHaveBeenCalled();
  });

  it.each([['resume.txt', 1, 'Only PDF and DOCX'], ['resume.pdf', 10 * 1024 * 1024 + 1, '10 MiB or smaller']])('validates %s locally', (name, size, message) => {
    setup(); selectFile(name, size); upload();
    expect(screen.getByRole('alert')).toHaveTextContent(message);
    expect(fileMock).not.toHaveBeenCalled();
  });

  it.each(['resume.pdf', 'resume.docx', 'resume.PDF', 'resume.DOCX'])('merges %s matches with manual skills and current target skills', async (name) => {
    const { onSubmit } = setup();
    change(skillsInput(), 'Manual, PYTHON');
    const file = selectFile(name); upload();
    expect(await screen.findByRole('status')).toHaveTextContent('Found 2 role-relevant skills');
    expect(fileMock).toHaveBeenCalledWith(file, ['Python', 'FastAPI'], ['Docker']);
    expect(skillsInput()).toHaveValue('Manual, PYTHON, docker');
    expect(pasteInput()).toHaveValue('');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('announces loading and prevents duplicate requests or file replacement', async () => {
    let finish!: (value: typeof result) => void;
    fileMock.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    setup(); selectFile(); upload(); upload();
    expect(screen.getByRole('status')).toHaveTextContent('Finding role-relevant skills from file…');
    expect(fileInput()).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Clear résumé file' })).toBeDisabled();
    expect(fileMock).toHaveBeenCalledOnce();
    change(skillsInput(), 'Added while loading');
    finish(result);
    await waitFor(() => expect(skillsInput()).toHaveValue('Added while loading, python, docker'));
  });

  it('treats zero matches as neutral and preserves manual skills', async () => {
    fileMock.mockResolvedValueOnce({ ...result, matched_required_skills: [], matched_preferred_skills: [] });
    setup(); change(skillsInput(), 'Manual'); selectFile(); upload();
    expect(await screen.findByRole('status')).toHaveTextContent('No exact target-job skill matches');
    expect(skillsInput()).toHaveValue('Manual');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each([
    ['resume_file_too_large', 413, '10 MiB or smaller'],
    ['unsupported_resume_file', 415, 'Only PDF and DOCX'],
    ['resume_file_unreadable', 422, 'could not read'],
    ['resume_file_no_text', 422, 'Scanned or image-only PDFs are not supported'],
    ['resume_file_content_too_large', 422, 'exceeds document extraction limits'],
  ])('maps %s safely and preserves user work', async (code, status, message) => {
    fileMock.mockRejectedValueOnce(new ApiError('private parser text', status, code));
    setup(); change(skillsInput(), 'Manual'); change(pasteInput(), 'Pasted text');
    const file = selectFile(); upload();
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.getByRole('alert')).not.toHaveTextContent('private parser text');
    expect((fileInput() as HTMLInputElement).files?.[0]).toBe(file);
    expect(skillsInput()).toHaveValue('Manual'); expect(pasteInput()).toHaveValue('Pasted text');
  });

  it.each([new Error('private'), new ApiError('Unable to reach Pathfinder.')])('shows a safe generic error', async (error) => {
    fileMock.mockRejectedValueOnce(error);
    setup(); selectFile(); upload();
    expect(await screen.findByRole('alert')).not.toHaveTextContent('private');
  });

  it('keeps paste and file workflows independent, clears selection, and submits only reviewed structure', async () => {
    const { onSubmit, container } = setup();
    const filename = '<script>alert("file")</script>.pdf';
    const file = selectFile(filename);
    change(pasteInput(), 'Pasted PRIVATE-CONTENT');
    upload(); await screen.findByRole('status');
    expect(container.querySelector('script')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Clear résumé file' }));
    expect(fileInput()).toHaveValue(''); expect(pasteInput()).toHaveValue('Pasted PRIVATE-CONTENT');
    expect(skillsInput()).toHaveValue('python, docker');
    upload(); expect(screen.getByRole('alert')).toHaveTextContent('Select a PDF');
    fireEvent.change(fileInput(), { target: { files: [file] } });
    pasteMock.mockResolvedValueOnce({ ...result, matched_required_skills: [{ name: 'python' }, { name: 'fastapi' }] });
    fireEvent.click(screen.getByRole('button', { name: 'Find Role-Relevant Skills' }));
    await waitFor(() => expect(skillsInput()).toHaveValue('python, docker, fastapi'));
    expect((fileInput() as HTMLInputElement).files?.[0]).toBe(file);
    fireEvent.click(screen.getByRole('button', { name: 'Clear résumé text' }));
    expect((fileInput() as HTMLInputElement).files?.[0]).toBe(file);
    change(skillsInput(), 'python, docker, fastapi, Reviewed');
    change(screen.getByLabelText('Job Title'), 'Engineer');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Save this analysis to local history' }));
    fireEvent.click(screen.getByRole('button', { name: 'Analyze Match' }));
    expect(onSubmit).toHaveBeenCalledOnce();
    const request = onSubmit.mock.calls[0][0];
    expect(request).toMatchObject({ save_analysis: true, include_ai_enrichment: false, candidate_profile: { skills: [{ name: 'python' }, { name: 'docker' }, { name: 'fastapi' }, { name: 'Reviewed' }] } });
    expect(JSON.stringify(request)).not.toMatch(/PRIVATE-CONTENT|<script|resume|filename/);
  });
});
