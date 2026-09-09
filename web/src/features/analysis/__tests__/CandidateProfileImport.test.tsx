import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  createCandidateProfileDraft,
  createCandidateProfileFileDraft,
} from '../../../api/pathfinder';
import { CandidateProfileDraftResponse } from '../../../types/api';
import { AnalysisForm } from '../AnalysisForm';
import { candidateDraft } from './candidateDraftFixture';

vi.mock('../../../api/pathfinder', async (original) => ({
  ...await original<typeof import('../../../api/pathfinder')>(),
  createCandidateProfileDraft: vi.fn(),
  createCandidateProfileFileDraft: vi.fn(),
}));

const renderForm = (available = true) => {
  const submit = vi.fn();
  render(<AnalysisForm onSubmit={submit} isLoading={false} error={null}
    candidateProfileImportAvailable={available} jobDescriptionImportAvailable={false}
    aiEnrichmentAvailable />);
  return submit;
};
const text = () => screen.getByLabelText('Résumé Text for AI Draft');
const createText = () => fireEvent.click(screen.getByRole('button', { name: 'Create Profile Draft from Text' }));
const apply = () => fireEvent.click(screen.getByRole('button', { name: 'Apply Draft to Candidate Profile' }));
const preview = () => screen.getByRole('region', { name: 'Candidate Profile draft preview' });

describe('AI-assisted Candidate Profile review and apply', () => {
  beforeEach(() => {
    vi.mocked(createCandidateProfileDraft).mockReset().mockResolvedValue(candidateDraft);
    vi.mocked(createCandidateProfileFileDraft).mockReset().mockResolvedValue(candidateDraft);
  });

  it('keeps unavailable controls separate while manual and deterministic controls remain usable', () => {
    const submit = renderForm(false);
    expect(screen.getByText(/Manual entry and the separate AI-free exact-skill import remain available/)).toBeInTheDocument();
    expect(text()).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Create Profile Draft from Text' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Create Profile Draft from File' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Find Role-Relevant Skills' })).toBeEnabled();
    fireEvent.change(screen.getByLabelText('Skills (comma-separated)'), { target: { value: 'Manual' } });
    fireEvent.change(screen.getByLabelText('Job Title'), { target: { value: 'Engineer' } });
    fireEvent.click(screen.getByRole('button', { name: 'Analyze Match' }));
    expect(submit).toHaveBeenCalledOnce();
  });

  it('creates a preview without mutating the profile, submitting, or enabling downstream AI', async () => {
    const submit = renderForm();
    expect(screen.getByText(/separate from Pathfinder’s deterministic résumé skill import/)).toBeInTheDocument();
    expect(screen.getByText(/does not add the raw source to saved analysis history/)).toBeInTheDocument();
    fireEvent.change(text(), { target: { value: 'PRIVATE SOURCE' } });
    createText();
    await screen.findByRole('heading', { name: 'Review Candidate Profile Draft' });
    expect(createCandidateProfileDraft).toHaveBeenCalledWith({ raw_resume_text: 'PRIVATE SOURCE' });
    expect(screen.getByLabelText('Skills (comma-separated)')).toHaveValue('');
    expect(screen.queryByLabelText('Role Title')).not.toBeInTheDocument();
    expect(submit).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Include optional AI-generated enrichment')).not.toBeChecked();
    expect(within(preview()).getByRole('heading', { name: 'Skills' })).toBeInTheDocument();
    expect(within(preview()).getByRole('heading', { name: 'Work Experience' })).toBeInTheDocument();
    expect(within(preview()).getByRole('heading', { name: 'Education' })).toBeInTheDocument();
    expect(within(preview()).getByRole('heading', { name: 'Projects' })).toBeInTheDocument();
    expect(within(preview()).getByRole('heading', { name: 'Certifications' })).toBeInTheDocument();
    expect(within(preview()).getByText(/will not be applied automatically/)).toBeInTheDocument();
    expect(within(preview()).queryByText(/Preferences/)).not.toBeInTheDocument();
  });

  it('applies all supported evidence, preserves preferences, remains editable, and submits only form data', async () => {
    const submit = renderForm();
    fireEvent.change(screen.getByLabelText('Skills (comma-separated)'), { target: { value: 'Rust, python' } });
    fireEvent.change(screen.getByLabelText('Target Titles (comma or newline-separated)'), { target: { value: 'Manual Target' } });
    fireEvent.change(screen.getByLabelText('Preferred Locations (comma or newline-separated)'), { target: { value: 'Bengaluru' } });
    fireEvent.click(screen.getByLabelText('Remote'));
    fireEvent.change(text(), { target: { value: 'PRIVATE SOURCE' } });
    createText();
    await screen.findByRole('heading', { name: 'Review Candidate Profile Draft' });
    apply();
    expect(screen.getByLabelText('Skills (comma-separated)')).toHaveValue('Rust, python, FastAPI');
    expect(screen.getByLabelText('Role Title')).toHaveValue('Engineer');
    expect(screen.getByLabelText('Education Level')).toHaveValue('master');
    expect(screen.getAllByLabelText('Education Level')).toHaveLength(1);
    expect(screen.getByLabelText('Project Name')).toHaveValue('Forecasting Platform');
    expect(screen.getByLabelText('Certification Name')).toHaveValue('Cloud Practitioner');
    expect(screen.getByLabelText('Target Titles (comma or newline-separated)')).toHaveValue('Manual Target');
    expect(screen.getByLabelText('Remote')).toBeChecked();
    fireEvent.change(screen.getByLabelText('Role Title'), { target: { value: 'Reviewed Engineer' } });
    fireEvent.change(screen.getByLabelText('Job Title'), { target: { value: 'Target Job' } });
    fireEvent.click(screen.getByRole('button', { name: 'Analyze Match' }));
    const request = submit.mock.calls[0][0];
    expect(request.candidate_profile.experience[0].role_title.title).toBe('Reviewed Engineer');
    expect(request.candidate_profile.preferences).toEqual({
      target_titles: [{ title: 'Manual Target' }], preferred_locations: ['Bengaluru'],
      acceptable_work_modes: ['remote'],
    });
    expect(request.include_ai_enrichment).toBe(false);
    expect(JSON.stringify(request)).not.toMatch(/PRIVATE SOURCE|raw_resume|draft|provider/);
  });

  it('sends a selected file only after its explicit action and clears sources independently', async () => {
    renderForm();
    fireEvent.change(text(), { target: { value: 'Text remains' } });
    const input = screen.getByLabelText('PDF or DOCX Résumé for AI Draft');
    const file = new File(['synthetic'], 'resume.pdf', { type: 'application/pdf' });
    fireEvent.change(input, { target: { files: [file] } });
    expect(createCandidateProfileFileDraft).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Create Profile Draft from File' }));
    await screen.findByRole('heading', { name: 'Review Candidate Profile Draft' });
    expect(createCandidateProfileFileDraft).toHaveBeenCalledWith(file);
    expect(createCandidateProfileDraft).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Clear AI résumé file' }));
    expect(text()).toHaveValue('Text remains');
    expect(preview()).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear AI résumé text' }));
    expect(text()).toHaveValue('');
    expect(preview()).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Discard Profile Draft' }));
    expect(screen.queryByRole('region', { name: 'Candidate Profile draft preview' })).not.toBeInTheDocument();
  });

  it('prevents duplicate requests and preserves all state and the prior preview after failure', async () => {
    let resolve!: (draft: CandidateProfileDraftResponse) => void;
    vi.mocked(createCandidateProfileDraft).mockReturnValue(new Promise((done) => { resolve = done; }));
    renderForm();
    fireEvent.change(text(), { target: { value: 'First source' } });
    createText(); createText();
    expect(createCandidateProfileDraft).toHaveBeenCalledOnce();
    expect(screen.getByRole('status')).toHaveTextContent('Creating candidate profile draft…');
    resolve(candidateDraft);
    await screen.findByRole('heading', { name: 'Review Candidate Profile Draft' });
    fireEvent.change(screen.getByLabelText('Skills (comma-separated)'), { target: { value: 'Manual remains' } });
    fireEvent.change(screen.getByLabelText('Job Title'), { target: { value: 'Target remains' } });
    fireEvent.change(screen.getByLabelText('Résumé Text'), { target: { value: 'Deterministic source remains' } });
    fireEvent.click(screen.getByLabelText('Save this analysis to local history'));
    fireEvent.click(screen.getByLabelText('Include optional AI-generated enrichment'));
    fireEvent.change(text(), { target: { value: 'Second source remains' } });
    vi.mocked(createCandidateProfileDraft).mockRejectedValueOnce(new ApiError('PRIVATE', 502, 'candidate_profile_import_error'));
    createText();
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('previous draft'));
    expect(screen.getByRole('alert')).not.toHaveTextContent('PRIVATE');
    expect(within(preview()).getByText('Engineer')).toBeInTheDocument();
    expect(screen.getByLabelText('Skills (comma-separated)')).toHaveValue('Manual remains');
    expect(screen.getByLabelText('Job Title')).toHaveValue('Target remains');
    expect(screen.getByLabelText('Résumé Text')).toHaveValue('Deterministic source remains');
    expect(screen.getByLabelText('Save this analysis to local history')).toBeChecked();
    expect(screen.getByLabelText('Include optional AI-generated enrichment')).toBeChecked();
    expect(text()).toHaveValue('Second source remains');
  });

  it('omits empty preview categories and validates files locally without clearing selection', async () => {
    vi.mocked(createCandidateProfileDraft).mockResolvedValue({
      skills: ['Python'], experience: [], education: [], projects: [], certifications: [],
    });
    renderForm();
    fireEvent.change(text(), { target: { value: 'source' } }); createText();
    await screen.findByRole('heading', { name: 'Review Candidate Profile Draft' });
    expect(within(preview()).getByRole('heading', { name: 'Skills' })).toBeInTheDocument();
    for (const heading of ['Work Experience', 'Education', 'Projects', 'Certifications']) {
      expect(within(preview()).queryByRole('heading', { name: heading })).not.toBeInTheDocument();
    }
    const input = screen.getByLabelText('PDF or DOCX Résumé for AI Draft');
    fireEvent.change(input, { target: { files: [new File(['bad'], 'resume.txt')] } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Profile Draft from File' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('PDF or DOCX');
    expect(createCandidateProfileFileDraft).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Create Profile Draft from File' })).toBeEnabled();
    fireEvent.change(input, { target: { files: [new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'resume.pdf')] } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Profile Draft from File' }));
    expect(screen.getByRole('alert')).toHaveTextContent('10 MiB');
    expect(createCandidateProfileFileDraft).not.toHaveBeenCalled();
  });

  it('preserves a selected file, form state, and previous preview after a file failure', async () => {
    renderForm();
    fireEvent.change(text(), { target: { value: 'initial' } }); createText();
    await screen.findByRole('heading', { name: 'Review Candidate Profile Draft' });
    fireEvent.change(screen.getByLabelText('Skills (comma-separated)'), { target: { value: 'Manual' } });
    const file = new File(['synthetic'], 'resume.docx');
    fireEvent.change(screen.getByLabelText('PDF or DOCX Résumé for AI Draft'), { target: { files: [file] } });
    vi.mocked(createCandidateProfileFileDraft).mockRejectedValueOnce(new ApiError('PRIVATE', 502, 'candidate_profile_import_error'));
    fireEvent.click(screen.getByRole('button', { name: 'Create Profile Draft from File' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('previous draft'));
    expect(within(preview()).getByText('Engineer')).toBeInTheDocument();
    expect(screen.getByLabelText('Skills (comma-separated)')).toHaveValue('Manual');
    expect(screen.getByRole('button', { name: 'Create Profile Draft from File' })).toBeEnabled();
    expect(createCandidateProfileFileDraft).toHaveBeenCalledWith(file);
  });

  it('renders provider-controlled text inertly', async () => {
    vi.mocked(createCandidateProfileDraft).mockResolvedValue({
      ...candidateDraft, skills: ['<script>alert("candidate")</script>'],
    });
    const { container } = render(<AnalysisForm onSubmit={vi.fn()} isLoading={false} error={null}
      candidateProfileImportAvailable />);
    fireEvent.change(text(), { target: { value: 'source' } }); createText();
    await screen.findByText('<script>alert("candidate")</script>');
    expect(container.querySelector('script')).toBeNull();
  });
});
