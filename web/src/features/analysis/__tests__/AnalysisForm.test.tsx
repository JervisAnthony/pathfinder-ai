import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AnalysisForm } from '../AnalysisForm';

describe('AnalysisForm', () => {
  it('renders essential fields', () => {
    render(<AnalysisForm onSubmit={() => {}} isLoading={false} error={null} />);

    expect(screen.getByLabelText("Skills (comma-separated)")).toBeInTheDocument();
    expect(screen.getByLabelText(/Job Title/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Analyze Match/i })).toBeInTheDocument();
  });

  it('allows adding and removing experience', () => {
    render(<AnalysisForm onSubmit={() => {}} isLoading={false} error={null} />);

    const addExpBtn = screen.getByRole('button', { name: /Add Experience/i });
    fireEvent.click(addExpBtn);

    expect(screen.getByLabelText(/Role Title/i)).toBeInTheDocument();

    const removeExpBtn = screen.getByRole('button', { name: /Remove Experience/i });
    fireEvent.click(removeExpBtn);

    expect(screen.queryByLabelText(/Role Title/i)).not.toBeInTheDocument();
  });

  it('shows error if no meaningful evidence is provided', () => {
    const handleSubmit = vi.fn();
    render(<AnalysisForm onSubmit={handleSubmit} isLoading={false} error={null} />);

    // Fill required job title but leave candidate empty
    fireEvent.change(screen.getByLabelText(/Job Title/i), { target: { value: 'Software Engineer' } });

    fireEvent.click(screen.getByRole('button', { name: /Analyze Match/i }));

    expect(screen.getByText(/Candidate must contain some meaningful evidence/i)).toBeInTheDocument();
    expect(handleSubmit).not.toHaveBeenCalled();
  });

  it('submits expected request on valid input', () => {
    const handleSubmit = vi.fn();
    render(<AnalysisForm onSubmit={handleSubmit} isLoading={false} error={null} />);

    // Fill candidate skills
    fireEvent.change(screen.getByLabelText("Skills (comma-separated)"), { target: { value: 'Python' } });

    // Fill job title
    fireEvent.change(screen.getByLabelText(/Job Title/i), { target: { value: 'Software Engineer' } });

    fireEvent.click(screen.getByRole('button', { name: /Analyze Match/i }));

    expect(handleSubmit).toHaveBeenCalledWith(expect.objectContaining({
      candidate_profile: expect.objectContaining({
        skills: [{ name: 'Python' }]
      }),
      job_description: expect.objectContaining({
        title: { title: 'Software Engineer' }
      }),
      include_ai_enrichment: false,
      save_analysis: false
    }));
  });
});
