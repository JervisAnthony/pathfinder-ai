import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { analyzeCandidateJob, ApiError, getCapabilities } from './api/pathfinder';
import { AnalysisResponse } from './types/api';

vi.mock('./api/pathfinder', async (importOriginal) => ({
  ...await importOriginal<typeof import('./api/pathfinder')>(),
  analyzeCandidateJob: vi.fn(), getCapabilities: vi.fn(),
}));

const result: AnalysisResponse = {
  score: { value: 80 },
  explanation: { score: { value: 80 }, components: [], matched_skills: [], experience: null, education: null,
    gaps: { missing_required_skills: [], missing_preferred_skills: [], experience_gap: null, education_gap: null },
    keyword_coverage: { matched_keywords: [], missing_keywords: [], percentage: 80 } },
  interview_preparation: { themes: [], talking_points: [], question_categories: [], candidate_questions: [] },
  learning_recommendations: { items: [] }, ai_enrichment: null, saved_analysis: null,
};
const aiControl = () => screen.getByRole('checkbox', { name: 'Include optional AI-generated enrichment' });
const fillForm = () => {
  fireEvent.change(screen.getByLabelText('Job Title'), { target: { value: 'Synthetic Engineer' } });
  fireEvent.change(screen.getByLabelText('Skills (comma-separated)'), { target: { value: 'Python' } });
};
const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Analyze Match' }));

describe('optional AI enrichment', () => {
  beforeEach(() => {
    vi.mocked(getCapabilities).mockReset().mockResolvedValue({ ai_enrichment_available: true, job_description_import_available: true, persistence_available: true });
    vi.mocked(analyzeCandidateJob).mockReset().mockResolvedValue(result);
  });

  it('starts unchecked and disabled while loading, then enables without opting in', async () => {
    render(<App />);
    expect(aiControl()).toBeDisabled(); expect(aiControl()).not.toBeChecked();
    await waitFor(() => expect(aiControl()).toBeEnabled());
    expect(aiControl()).not.toBeChecked();
    expect(screen.getByText(/structured role-analysis information to OpenAI/)).toHaveTextContent('candidate-derived evidence');
    expect(screen.getByText(/Raw résumé upload bytes/)).toHaveTextContent('may be inaccurate');
    fillForm(); submit();
    await screen.findByRole('heading', { name: 'Analysis Results' });
    expect(analyzeCandidateJob).toHaveBeenCalledWith(expect.objectContaining({ include_ai_enrichment: false, save_analysis: false }));
    expect(screen.queryByRole('heading', { name: 'Optional AI-Generated Enrichment' })).not.toBeInTheDocument();
    expect(getCapabilities).toHaveBeenCalledOnce();
  });

  it('keeps AI unavailable when not configured', async () => {
    vi.mocked(getCapabilities).mockResolvedValue({ ai_enrichment_available: false, job_description_import_available: false, persistence_available: true });
    render(<App />);
    expect(await screen.findByText('AI enrichment is not configured on this Pathfinder server.')).toBeInTheDocument();
    expect(aiControl()).toBeDisabled(); expect(aiControl()).not.toBeChecked();
    fillForm(); submit();
    await screen.findByRole('heading', { name: 'Analysis Results' });
    expect(analyzeCandidateJob).toHaveBeenCalledWith(expect.objectContaining({ include_ai_enrichment: false }));
  });

  it('allows deterministic analysis after a capability network or validation failure', async () => {
    vi.mocked(getCapabilities).mockRejectedValue(new ApiError('private capability detail'));
    render(<App />);
    expect(await screen.findByText(/AI availability could not be checked/)).not.toHaveTextContent('private');
    expect(aiControl()).toBeDisabled();
    fillForm(); submit();
    await screen.findByRole('heading', { name: 'Analysis Results' });
    expect(analyzeCandidateJob).toHaveBeenCalledWith(expect.objectContaining({ include_ai_enrichment: false }));
  });

  it.each([false, true])('sends explicitly requested AI independently of saving %s', async (save) => {
    vi.mocked(analyzeCandidateJob).mockResolvedValue({ ...result, ai_enrichment: { provider_name: 'OpenAI', content: 'Application Framing\n<script>alert("AI")</script>' } });
    const { container } = render(<App />);
    await waitFor(() => expect(aiControl()).toBeEnabled());
    fireEvent.click(aiControl());
    if (save) fireEvent.click(screen.getByLabelText('Save this analysis to local history'));
    fillForm(); submit();
    expect(await screen.findByRole('heading', { name: 'Optional AI-Generated Enrichment' })).toBeInTheDocument();
    expect(analyzeCandidateJob).toHaveBeenCalledWith(expect.objectContaining({ include_ai_enrichment: true, save_analysis: save }));
    expect(screen.getByText('Provider: OpenAI')).toBeInTheDocument();
    expect(screen.getByText(/AI-generated enrichment may be inaccurate/)).toHaveTextContent("does not affect Pathfinder's deterministic match score");
    expect(screen.getByText(/<script>alert\("AI"\)<\/script>/)).toBeInTheDocument();
    expect(container.querySelector('.ai-content br')).toBeInTheDocument();
    expect(container.querySelector('script')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '← New Analysis' }));
    expect(aiControl()).not.toBeChecked();
    expect(getCapabilities).toHaveBeenCalledOnce();
  });

  it.each([['ai_provider_unavailable', 503], ['ai_provider_error', 502]] as const)('preserves work after %s and supports explicit deterministic retry', async (code, status) => {
    vi.mocked(analyzeCandidateJob).mockRejectedValueOnce(new ApiError('SYNTHETIC-NOT-A-CREDENTIAL synthetic-private-model', status, code));
    render(<App />);
    await waitFor(() => expect(aiControl()).toBeEnabled());
    fillForm(); fireEvent.click(aiControl());
    fireEvent.change(screen.getByLabelText('Résumé Text'), { target: { value: 'Private pasted text' } });
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent('Uncheck optional AI enrichment');
    expect(screen.getByRole('alert')).not.toHaveTextContent(/SYNTHETIC|synthetic-private-model/);
    expect(screen.getByLabelText('Job Title')).toHaveValue('Synthetic Engineer');
    expect(screen.getByLabelText('Skills (comma-separated)')).toHaveValue('Python');
    expect(screen.getByLabelText('Résumé Text')).toHaveValue('Private pasted text');
    expect(aiControl()).toBeChecked();
    fireEvent.click(aiControl()); submit();
    await screen.findByRole('heading', { name: 'Analysis Results' });
    expect(analyzeCandidateJob).toHaveBeenNthCalledWith(1, expect.objectContaining({ include_ai_enrichment: true }));
    expect(analyzeCandidateJob).toHaveBeenNthCalledWith(2, expect.objectContaining({ include_ai_enrichment: false }));
    expect(screen.queryByRole('heading', { name: 'Optional AI-Generated Enrichment' })).not.toBeInTheDocument();
  });
});
