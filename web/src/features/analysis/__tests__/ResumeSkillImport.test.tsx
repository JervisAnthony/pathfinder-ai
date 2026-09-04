import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, importResumeSkills } from '../../../api/pathfinder';
import { AnalysisForm } from '../AnalysisForm';

vi.mock('../../../api/pathfinder', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../api/pathfinder')>();
  return { ...actual, importResumeSkills: vi.fn() };
});

const importMock = vi.mocked(importResumeSkills);

function renderForm(onSubmit = vi.fn()) {
  const view = render(<AnalysisForm onSubmit={onSubmit} isLoading={false} error={null} />);
  return { onSubmit, ...view };
}

function setImportInputs(resume = 'Python and Docker') {
  fireEvent.change(screen.getByLabelText('Résumé Text'), { target: { value: resume } });
  fireEvent.change(screen.getByLabelText('Required Skills (comma-separated)'), { target: { value: 'Python' } });
  fireEvent.change(screen.getByLabelText('Preferred Skills (comma-separated)'), { target: { value: 'Docker' } });
}

function resolveImport(required: string[] = [], preferred: string[] = []) {
  importMock.mockResolvedValueOnce({
    matched_required_skills: required.map((name) => ({ name })),
    matched_preferred_skills: preferred.map((name) => ({ name })),
    unmatched_required_skills: [],
    unmatched_preferred_skills: [],
  });
}

describe('resume skill import', () => {
  beforeEach(() => importMock.mockReset());

  it('renders an empty, accessible helper with accurate limits', () => {
    renderForm();

    expect(screen.getByRole('heading', { name: 'Import Skills from Résumé' })).toBeInTheDocument();
    expect(screen.getByLabelText('Résumé Text')).toHaveValue('');
    expect(screen.getByText(/find exact skills/)).toBeInTheDocument();
    expect(screen.getByText(/does not perform full résumé parsing/)).toBeInTheDocument();
    expect(screen.getByText(/not included in saved analysis history/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Find Role-Relevant Skills' })).toHaveAttribute('type', 'button');
  });

  it('validates resume and target skills locally without calling the API', () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Find Role-Relevant Skills' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/Paste résumé text/);

    fireEvent.change(screen.getByLabelText('Résumé Text'), { target: { value: 'Python' } });
    fireEvent.click(screen.getByRole('button', { name: 'Find Role-Relevant Skills' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/Add at least one required or preferred/);
    expect(importMock).not.toHaveBeenCalled();
  });

  it('uses current target skills and merges required and preferred matches', async () => {
    renderForm();
    fireEvent.change(screen.getByLabelText('Skills (comma-separated)'), { target: { value: 'Manual, PYTHON' } });
    setImportInputs();
    resolveImport(['python'], ['docker']);

    fireEvent.click(screen.getByRole('button', { name: 'Find Role-Relevant Skills' }));

    await waitFor(() => expect(importMock).toHaveBeenCalledWith({
      resume_text: 'Python and Docker',
      required_skills: [{ name: 'Python' }],
      preferred_skills: [{ name: 'Docker' }],
    }));
    expect(screen.getByLabelText('Skills (comma-separated)')).toHaveValue('Manual, PYTHON, docker');
    expect(screen.getByRole('status')).toHaveTextContent('Found 2 role-relevant skills');
  });

  it('shows neutral zero-match feedback', async () => {
    renderForm();
    setImportInputs();
    resolveImport();

    fireEvent.click(screen.getByRole('button', { name: 'Find Role-Relevant Skills' }));

    expect(await screen.findByRole('status')).toHaveTextContent(/No exact target-job skill matches/);
    expect(screen.getByLabelText('Skills (comma-separated)')).toHaveValue('');
  });

  it('preserves resume text and manual skills after a safe import error', async () => {
    renderForm();
    fireEvent.change(screen.getByLabelText('Skills (comma-separated)'), { target: { value: 'Manual' } });
    setImportInputs('private resume');
    importMock.mockRejectedValueOnce(new Error('private backend detail'));

    fireEvent.click(screen.getByRole('button', { name: 'Find Role-Relevant Skills' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Pathfinder could not import résumé skills. Try again.');
    expect(screen.getByRole('alert')).not.toHaveTextContent('private backend detail');
    expect(screen.getByLabelText('Résumé Text')).toHaveValue('private resume');
    expect(screen.getByLabelText('Skills (comma-separated)')).toHaveValue('Manual');
  });

  it('disables duplicate imports while loading', async () => {
    let finish!: () => void;
    importMock.mockImplementationOnce(() => new Promise((resolve) => {
      finish = () => resolve({
        matched_required_skills: [], matched_preferred_skills: [],
        unmatched_required_skills: [], unmatched_preferred_skills: [],
      });
    }));
    renderForm();
    setImportInputs();

    const button = screen.getByRole('button', { name: 'Find Role-Relevant Skills' });
    fireEvent.click(button);
    expect(button).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Finding role-relevant skills…');
    fireEvent.click(button);
    expect(importMock).toHaveBeenCalledOnce();
    finish();
    await screen.findByRole('status');
  });

  it('shows safe structured API errors', async () => {
    renderForm();
    setImportInputs();
    importMock.mockRejectedValueOnce(new ApiError(
      'Request validation failed.', 422, 'validation_error',
    ));

    fireEvent.click(screen.getByRole('button', { name: 'Find Role-Relevant Skills' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Request validation failed.');
  });

  it('clears sensitive text without removing imported skills', async () => {
    renderForm();
    setImportInputs();
    resolveImport(['python']);
    fireEvent.click(screen.getByRole('button', { name: 'Find Role-Relevant Skills' }));
    await screen.findByRole('status');

    fireEvent.click(screen.getByRole('button', { name: 'Clear résumé text' }));

    expect(screen.getByLabelText('Résumé Text')).toHaveValue('');
    expect(screen.getByLabelText('Skills (comma-separated)')).toHaveValue('python');
  });

  it('keeps resume HTML inert and excludes resume text from analysis', async () => {
    const { onSubmit, container } = renderForm();
    const resume = '<script>alert("resume")</script> Python';
    setImportInputs(resume);
    resolveImport(['python']);
    fireEvent.click(screen.getByRole('button', { name: 'Find Role-Relevant Skills' }));
    await screen.findByRole('status');

    expect(screen.getByLabelText('Résumé Text')).toHaveValue(resume);
    expect(container.querySelector('script')).toBeNull();
    fireEvent.change(screen.getByLabelText('Job Title'), { target: { value: 'Engineer' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Save this analysis to local history' }));
    fireEvent.click(screen.getByRole('button', { name: 'Analyze Match' }));

    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ save_analysis: true, include_ai_enrichment: false });
    expect(JSON.stringify(onSubmit.mock.calls[0][0])).not.toContain(resume);
  });
});
