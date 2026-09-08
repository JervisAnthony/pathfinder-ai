import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AnalysisForm } from '../AnalysisForm';
import { ApiError, createJobDescriptionDraft } from '../../../api/pathfinder';
import { jobDraft, partialDraft } from './jobDraftFixture';
import { JobDescriptionDraftResponse } from '../../../types/api';

vi.mock('../../../api/pathfinder', async (original) => ({
  ...await original<typeof import('../../../api/pathfinder')>(), createJobDescriptionDraft: vi.fn(),
}));
const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const create = () => fireEvent.click(screen.getByRole('button', { name: 'Create Structured Draft' }));
const apply = () => fireEvent.click(screen.getByRole('button', { name: 'Apply Draft to Target Job' }));
const preview = () => screen.getByRole('region', { name: 'Job description draft preview' });
const start = async () => {
  change('Job Posting Text', 'RAW PRIVATE JOB SENTINEL'); create();
  await screen.findByRole('heading', { name: 'Review Structured Draft' });
};
const form = (available = true) => {
  const submit = vi.fn();
  const rendered = render(<AnalysisForm onSubmit={submit} isLoading={false} error={null} jobDescriptionImportAvailable={available} aiEnrichmentAvailable />);
  return { submit, ...rendered };
};

describe('job draft review and explicit apply', () => {
  beforeEach(() => vi.mocked(createJobDescriptionDraft).mockReset().mockResolvedValue(jobDraft));

  it('starts blank, unavailable preserves manual entry, and buttons do not submit', () => {
    const { submit } = form(false);
    expect(screen.getByLabelText('Job Posting Text')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Create Structured Draft' })).toHaveAttribute('type', 'button');
    change('Job Posting Text', 'Posting'); create();
    expect(screen.getByRole('button', { name: 'Create Structured Draft' })).toBeDisabled();
    expect(screen.getByText(/AI-assisted job description import is not configured/)).toBeInTheDocument();
    change('Job Title', 'Manual'); change('Skills (comma-separated)', 'Python');
    fireEvent.click(screen.getByRole('button', { name: 'Analyze Match' }));
    expect(submit).toHaveBeenCalledOnce(); expect(createJobDescriptionDraft).not.toHaveBeenCalled();
  });

  it('requires text, bounds input, prevents duplicate in-flight requests, and never auto-applies', async () => {
    let resolve!: (value: JobDescriptionDraftResponse) => void;
    vi.mocked(createJobDescriptionDraft).mockReturnValue(new Promise((done) => { resolve = done; }));
    const { submit } = form();
    change('Job Posting Text', ' \n '); create(); expect(createJobDescriptionDraft).not.toHaveBeenCalled();
    change('Job Posting Text', 'x'.repeat(50001)); create();
    expect(screen.getByRole('alert')).toHaveTextContent('50,000'); expect(createJobDescriptionDraft).not.toHaveBeenCalled();
    change('Job Posting Text', 'Posting'); create(); create();
    expect(createJobDescriptionDraft).toHaveBeenCalledOnce();
    expect(screen.getByRole('status')).toHaveTextContent('Creating structured job draft');
    resolve(jobDraft); await screen.findByRole('heading', { name: 'Review Structured Draft' });
    expect(screen.getByLabelText('Job Title')).toHaveValue(''); expect(submit).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Include optional AI-generated enrichment')).not.toBeChecked();
  });

  it('merges only on Apply, preserves scalars, gives required precedence, and submits only edited structure', async () => {
    const { submit } = form();
    change('Job Title', 'Manual Title'); change('Company Name (Optional)', 'Manual Company');
    change('Company Industry (Optional)', 'Manual Industry'); change('Company Location (Optional)', 'Manual Location');
    change('Required Skills (comma-separated)', 'SQL, python'); change('Preferred Skills (comma-separated)', 'FastAPI, Rust');
    change('Responsibilities (newline-separated)', 'Existing duty\nbuild APIs');
    change('Minimum Years', '6'); change('Required Education Level', 'master');
    change('Required Field of Study', 'Manual Field'); change('Education Requirement Description', 'Manual Degree');
    change('Skills (comma-separated)', 'Python'); change('Résumé Text', 'RESUME SENTINEL');
    fireEvent.click(screen.getByLabelText('Save this analysis to local history'));
    await start();
    expect(screen.getByLabelText('Required Skills (comma-separated)')).toHaveValue('SQL, python');
    expect(within(preview()).getByText('Kubernetes')).toBeInTheDocument();
    apply();
    expect(screen.getByRole('status')).toHaveTextContent('Draft applied');
    expect(screen.getByLabelText('Job Title')).toHaveValue('Manual Title');
    expect(screen.getByLabelText('Company Name (Optional)')).toHaveValue('Manual Company');
    expect(screen.getByLabelText('Company Industry (Optional)')).toHaveValue('Manual Industry');
    expect(screen.getByLabelText('Company Location (Optional)')).toHaveValue('Manual Location');
    expect(screen.getByLabelText('Required Skills (comma-separated)')).toHaveValue('SQL, python, FastAPI');
    expect(screen.getByLabelText('Preferred Skills (comma-separated)')).toHaveValue('Rust, Docker');
    expect(screen.getByLabelText('Responsibilities (newline-separated)')).toHaveValue('Existing duty\nbuild APIs\nOwn reliability');
    expect(screen.getByLabelText('Minimum Years')).toHaveValue(6); expect(screen.getByLabelText('Maximum Years')).toHaveValue(7);
    expect(screen.getByLabelText('Required Education Level')).toHaveValue('master');
    expect(screen.getByLabelText('Required Field of Study')).toHaveValue('Manual Field');
    expect(screen.getByLabelText('Education Requirement Description')).toHaveValue('Manual Degree');
    expect(submit).not.toHaveBeenCalled();
    change('Job Title', 'Reviewed Title');
    fireEvent.click(screen.getByRole('button', { name: 'Analyze Match' }));
    const request = submit.mock.calls[0][0];
    expect(request.job_description.title.title).toBe('Reviewed Title');
    expect(request.include_ai_enrichment).toBe(false); expect(request.save_analysis).toBe(true);
    expect(JSON.stringify(request)).not.toMatch(/RAW PRIVATE|RESUME SENTINEL|unclassified|Kubernetes|provider|draft/);
  });

  it('fills blank scalars, repeated apply is idempotent, and clear/discard preserve applied fields', async () => {
    const { submit } = form(); await start(); apply(); apply();
    expect(screen.getByLabelText('Job Title')).toHaveValue(jobDraft.title);
    expect(screen.getByLabelText('Company Name (Optional)')).toHaveValue(jobDraft.company_name);
    expect(screen.getByLabelText('Company Industry (Optional)')).toHaveValue(jobDraft.company_industry);
    expect(screen.getByLabelText('Company Location (Optional)')).toHaveValue(jobDraft.company_location);
    expect(screen.getByLabelText('Minimum Years')).toHaveValue(5);
    expect(screen.getByLabelText('Required Education Level')).toHaveValue('bachelor');
    expect(screen.getByLabelText('Required Field of Study')).toHaveValue('CS');
    expect(screen.getByLabelText('Required Skills (comma-separated)')).toHaveValue('Python, FastAPI');
    fireEvent.click(screen.getByRole('button', { name: 'Clear job posting text' }));
    expect(screen.getByLabelText('Job Posting Text')).toHaveValue(''); expect(preview()).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Discard Draft' }));
    expect(screen.queryByRole('heading', { name: 'Review Structured Draft' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Job Title')).toHaveValue(jobDraft.title); expect(submit).not.toHaveBeenCalled();
  });

  it('accepts a title-less partial draft without inventing values or clearing education', async () => {
    vi.mocked(createJobDescriptionDraft).mockResolvedValue(partialDraft);
    form(); change('Required Education Level', 'master'); await start(); apply();
    expect(screen.getByLabelText('Job Title')).toHaveValue('');
    expect(screen.getByLabelText('Required Education Level')).toHaveValue('master');
    expect(screen.getByLabelText('Required Skills (comma-separated)')).toHaveValue('');
    expect(screen.getByLabelText('Preferred Skills (comma-separated)')).toHaveValue('');
    expect(within(preview()).getByText('K8s')).toBeInTheDocument();
  });

  it.each([new ApiError('PRIVATE', 502, 'job_description_import_error'), new ApiError('PRIVATE', 503, 'job_description_import_unavailable'), new ApiError('PRIVATE', 422), new Error('PRIVATE network')])('preserves all work and prior draft after refresh failure', async (error) => {
    form(); await start();
    change('Job Title', 'Manual'); change('Skills (comma-separated)', 'Rust'); change('Résumé Text', 'Résumé remains');
    fireEvent.click(screen.getByLabelText('Include optional AI-generated enrichment'));
    fireEvent.click(screen.getByLabelText('Save this analysis to local history'));
    vi.mocked(createJobDescriptionDraft).mockRejectedValueOnce(error);
    change('Job Posting Text', 'New raw text'); create();
    await waitFor(() => expect(screen.getByRole('alert')).not.toHaveTextContent('PRIVATE'));
    expect(within(preview()).getByText(jobDraft.title!)).toBeInTheDocument();
    expect(screen.getByLabelText('Job Posting Text')).toHaveValue('New raw text');
    expect(screen.getByLabelText('Job Title')).toHaveValue('Manual');
    expect(screen.getByLabelText('Skills (comma-separated)')).toHaveValue('Rust');
    expect(screen.getByLabelText('Résumé Text')).toHaveValue('Résumé remains');
    expect(screen.getByLabelText('Include optional AI-generated enrichment')).toBeChecked();
    expect(screen.getByLabelText('Save this analysis to local history')).toBeChecked();
    create(); await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('replaces only the preview after success and renders script-like text inertly', async () => {
    const { container } = form(); await start();
    vi.mocked(createJobDescriptionDraft).mockResolvedValue({ ...partialDraft, title: '<script>alert("job")</script>' });
    create(); await screen.findByText('<script>alert("job")</script>');
    expect(within(preview()).queryByText(jobDraft.title!)).not.toBeInTheDocument();
    expect(container.querySelector('script')).toBeNull(); expect(screen.getByLabelText('Job Title')).toHaveValue('');
  });
});
