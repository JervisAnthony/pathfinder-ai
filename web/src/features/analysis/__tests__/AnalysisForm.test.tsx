import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AnalysisForm } from '../AnalysisForm';

function renderForm(onSubmit = vi.fn(), isLoading = false) {
  render(<AnalysisForm onSubmit={onSubmit} isLoading={isLoading} error={null} />);
  return onSubmit;
}

function setJobTitle(value = 'Software Engineer') {
  fireEvent.change(screen.getByLabelText('Job Title'), { target: { value } });
}

function submit() {
  fireEvent.click(screen.getByRole('button', { name: /Analyze Match|Analyzing/ }));
}

describe('AnalysisForm', () => {
  it('renders the complete candidate and job sections', () => {
    renderForm();
    expect(screen.getByLabelText('Skills (comma-separated)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Experience' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Education' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Project' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Certification' })).toBeInTheDocument();
    expect(screen.getByLabelText('Target Titles (comma or newline-separated)')).toBeInTheDocument();
    expect(screen.getByLabelText('Company Industry (Optional)')).toBeInTheDocument();
    expect(screen.getByLabelText('Education Requirement Description')).toBeInTheDocument();
    expect(screen.getByLabelText('Save this analysis to local history')).not.toBeChecked();
    expect(screen.getByText(/shared or untrusted installation/)).toBeInTheDocument();
  });

  it.each([
    ['Experience', 'Role Title'],
    ['Education', 'Education Level'],
    ['Project', 'Project Name'],
    ['Certification', 'Certification Name'],
  ])('adds and removes %s entries', (kind, label) => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: `Add ${kind}` }));
    expect(screen.getByLabelText(label)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: `Remove ${kind}` }));
    expect(screen.queryByLabelText(label)).not.toBeInTheDocument();
  });

  it('rejects an empty candidate', () => {
    const onSubmit = renderForm();
    setJobTitle();
    submit();
    expect(screen.getByText(/Candidate must contain some meaningful evidence/)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it.each([
    ['Project', 'Project Name', 'Synthetic Portfolio'],
    ['Certification', 'Certification Name', 'Cloud Fundamentals'],
  ])('accepts %s-only candidate evidence', (kind, label, value) => {
    const onSubmit = renderForm();
    fireEvent.click(screen.getByRole('button', { name: `Add ${kind}` }));
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
    setJobTitle();
    submit();
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it('keeps duration optional and never manufactures zero', () => {
    const onSubmit = renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Add Experience' }));
    fireEvent.change(screen.getByLabelText('Role Title'), { target: { value: 'Developer' } });
    setJobTitle();
    submit();
    const request = onSubmit.mock.calls[0][0];
    expect(request.candidate_profile.experience[0].duration_months).toBeUndefined();
    expect(request.candidate_profile.experience[0].company_name).toBeUndefined();
    expect(JSON.stringify(request)).not.toContain('duration_months');
  });

  it('rejects a supplied duration below one month', () => {
    const onSubmit = renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Add Experience' }));
    fireEvent.change(screen.getByLabelText('Role Title'), { target: { value: 'Developer' } });
    fireEvent.change(screen.getByLabelText('Duration (months)'), { target: { value: '0' } });
    setJobTitle();
    fireEvent.submit(screen.getByRole('button', { name: 'Analyze Match' }).closest('form')!);
    expect(screen.getByText(/at least 1 month/)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('preserves a maximum experience value without a minimum', () => {
    const onSubmit = renderForm();
    fireEvent.change(screen.getByLabelText('Skills (comma-separated)'), { target: { value: 'Python' } });
    setJobTitle();
    fireEvent.change(screen.getByLabelText('Maximum Years'), { target: { value: '5' } });
    submit();
    expect(onSubmit.mock.calls[0][0].job_description.experience_requirement).toEqual({
      minimum_years: undefined,
      maximum_years: 5,
    });
  });

  it('rejects maximum experience below minimum experience', () => {
    const onSubmit = renderForm();
    fireEvent.change(screen.getByLabelText('Skills (comma-separated)'), { target: { value: 'Python' } });
    setJobTitle();
    fireEvent.change(screen.getByLabelText('Minimum Years'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('Maximum Years'), { target: { value: '2' } });
    submit();
    expect(screen.getByText('Maximum years cannot be less than minimum years')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits the complete representative API request with exact enum wire values', () => {
    const onSubmit = renderForm();
    fireEvent.change(screen.getByLabelText('Skills (comma-separated)'), { target: { value: 'Python, TypeScript' } });

    fireEvent.click(screen.getByRole('button', { name: 'Add Experience' }));
    fireEvent.change(screen.getByLabelText('Role Title'), { target: { value: 'Developer' } });
    fireEvent.change(screen.getByLabelText('Company'), { target: { value: 'Fictional Labs' } });
    fireEvent.change(screen.getByLabelText('Duration (months)'), { target: { value: '18' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Built accessible tools' } });
    fireEvent.change(screen.getByLabelText('Experience Skills (comma-separated)'), { target: { value: 'React' } });

    fireEvent.click(screen.getByRole('button', { name: 'Add Education' }));
    fireEvent.change(screen.getByLabelText('Education Level'), { target: { value: 'bachelor' } });
    fireEvent.change(screen.getByLabelText('Field of Study'), { target: { value: 'Computer Science' } });
    fireEvent.change(screen.getByLabelText('Institution'), { target: { value: 'Example University' } });
    fireEvent.change(screen.getByLabelText('Education Description'), { target: { value: 'Software systems' } });

    fireEvent.click(screen.getByRole('button', { name: 'Add Project' }));
    fireEvent.change(screen.getByLabelText('Project Name'), { target: { value: 'Path Explorer' } });
    fireEvent.change(screen.getByLabelText('Project Description'), { target: { value: 'A fictional planning app' } });
    fireEvent.change(screen.getByLabelText('Project Skills (comma-separated)'), { target: { value: 'FastAPI' } });

    fireEvent.click(screen.getByRole('button', { name: 'Add Certification' }));
    fireEvent.change(screen.getByLabelText('Certification Name'), { target: { value: 'Cloud Basics' } });
    fireEvent.change(screen.getByLabelText('Certification Issuer'), { target: { value: 'Example Institute' } });
    fireEvent.change(screen.getByLabelText('Certification Description'), { target: { value: 'Cloud foundations' } });

    fireEvent.change(screen.getByLabelText('Target Titles (comma or newline-separated)'), { target: { value: 'Platform Engineer\nBackend Engineer' } });
    fireEvent.change(screen.getByLabelText('Preferred Locations (comma or newline-separated)'), { target: { value: 'Remote, Bengaluru' } });
    fireEvent.click(screen.getByLabelText('Remote'));
    fireEvent.click(screen.getByLabelText('Hybrid'));

    setJobTitle('Senior Platform Engineer');
    fireEvent.change(screen.getByLabelText('Company Name (Optional)'), { target: { value: 'Example Systems' } });
    fireEvent.change(screen.getByLabelText('Company Industry (Optional)'), { target: { value: 'Technology' } });
    fireEvent.change(screen.getByLabelText('Company Location (Optional)'), { target: { value: 'Bengaluru' } });
    fireEvent.change(screen.getByLabelText('Required Skills (comma-separated)'), { target: { value: 'Python, FastAPI' } });
    fireEvent.change(screen.getByLabelText('Preferred Skills (comma-separated)'), { target: { value: 'Docker' } });
    fireEvent.change(screen.getByLabelText('Responsibilities (newline-separated)'), { target: { value: 'Build services\nMentor engineers' } });
    fireEvent.change(screen.getByLabelText('Minimum Years'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Maximum Years'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('Required Education Level'), { target: { value: 'master' } });
    fireEvent.change(screen.getByLabelText('Required Field of Study'), { target: { value: 'Computer Science' } });
    fireEvent.change(screen.getByLabelText('Education Requirement Description'), { target: { value: 'Equivalent experience accepted' } });
    submit();

    expect(onSubmit).toHaveBeenCalledWith({
      include_ai_enrichment: false,
      save_analysis: false,
      candidate_profile: {
        skills: [{ name: 'Python' }, { name: 'TypeScript' }],
        experience: [{ role_title: { title: 'Developer' }, company_name: 'Fictional Labs', duration_months: 18, description: 'Built accessible tools', skills: [{ name: 'React' }] }],
        education: [{ level: 'bachelor', field_of_study: 'Computer Science', institution: 'Example University', description: 'Software systems' }],
        projects: [{ name: 'Path Explorer', description: 'A fictional planning app', skills: [{ name: 'FastAPI' }] }],
        certifications: [{ name: 'Cloud Basics', issuer: 'Example Institute', description: 'Cloud foundations' }],
        preferences: {
          target_titles: [{ title: 'Platform Engineer' }, { title: 'Backend Engineer' }],
          preferred_locations: ['Remote', 'Bengaluru'],
          acceptable_work_modes: ['remote', 'hybrid'],
        },
      },
      job_description: {
        title: { title: 'Senior Platform Engineer' },
        company_info: { name: 'Example Systems', industry: 'Technology', location: 'Bengaluru' },
        responsibilities: [{ description: 'Build services' }, { description: 'Mentor engineers' }],
        required_skills: [{ name: 'Python' }, { name: 'FastAPI' }],
        preferred_skills: [{ name: 'Docker' }],
        experience_requirement: { minimum_years: 2, maximum_years: 5 },
        education_requirement: { level: 'master', field_of_study: 'Computer Science', description: 'Equivalent experience accepted' },
      },
    });
  });

  it('does not construct company information from industry or location alone', () => {
    const onSubmit = renderForm();
    fireEvent.change(screen.getByLabelText('Skills (comma-separated)'), { target: { value: 'Python' } });
    setJobTitle();
    fireEvent.change(screen.getByLabelText('Company Industry (Optional)'), { target: { value: 'Technology' } });
    submit();
    expect(onSubmit.mock.calls[0][0].job_description.company_info).toBeUndefined();
  });

  it('prevents submission while loading', () => {
    const onSubmit = renderForm(vi.fn(), true);
    expect(screen.getByRole('button', { name: 'Analyzing...' })).toBeDisabled();
    submit();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('sends explicit save opt-in while keeping AI enrichment disabled', () => {
    const onSubmit = renderForm();
    fireEvent.change(screen.getByLabelText('Skills (comma-separated)'), { target: { value: 'Python' } });
    setJobTitle();
    fireEvent.click(screen.getByLabelText('Save this analysis to local history'));
    submit();

    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      save_analysis: true,
      include_ai_enrichment: false,
    });
  });
});
