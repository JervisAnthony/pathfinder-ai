import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import App from './App';
import * as api from './api/pathfinder';
import { AnalysisResponse } from './types/api';

vi.mock('./api/pathfinder', () => ({
  analyzeCandidateJob: vi.fn(),
  ApiError: class ApiError extends Error {
    constructor(message: string) {
      super(message);
    }
  }
}));

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('handles successful submission flow', async () => {
    const mockResponse = {
      score: { value: 80 },
      explanation: {
        score: { value: 80 },
        components: [],
        matched_skills: [],
        gaps: { missing_required_skills: [], missing_preferred_skills: [] },
        keyword_coverage: { matched_keywords: [], missing_keywords: [], percentage: 0 }
      },
      interview_preparation: {
        themes: [], talking_points: [], question_categories: [], candidate_questions: []
      }
    };

    vi.mocked(api.analyzeCandidateJob).mockResolvedValueOnce(mockResponse as unknown as AnalysisResponse);

    render(<App />);

    // Fill form using exact match for Candidate Profile skills
    fireEvent.change(screen.getByLabelText('Skills (comma-separated)'), { target: { value: 'Python' } });
    fireEvent.change(screen.getByLabelText(/Job Title/i), { target: { value: 'Dev' } });

    // Submit
    fireEvent.click(screen.getByRole('button', { name: /Analyze Match/i }));

    // Verify loading state
    expect(screen.getByRole('button', { name: /Analyzing/i })).toBeDisabled();

    // Wait for results
    await waitFor(() => {
      expect(screen.getByText('80%')).toBeInTheDocument();
    });

    // Can go back
    fireEvent.click(screen.getByText(/New Analysis/i));
    expect(screen.getByLabelText(/Job Title/i)).toBeInTheDocument();
  });

  it('handles API errors safely', async () => {
    vi.mocked(api.analyzeCandidateJob).mockRejectedValueOnce(new api.ApiError('Domain validation failed'));

    render(<App />);

    fireEvent.change(screen.getByLabelText('Skills (comma-separated)'), { target: { value: 'Python' } });
    fireEvent.change(screen.getByLabelText(/Job Title/i), { target: { value: 'Dev' } });

    fireEvent.click(screen.getByRole('button', { name: /Analyze Match/i }));

    await waitFor(() => {
      expect(screen.getByText('Domain validation failed')).toBeInTheDocument();
    });

    // Form is preserved
    expect(screen.getByLabelText(/Job Title/i)).toHaveValue('Dev');
  });
});
