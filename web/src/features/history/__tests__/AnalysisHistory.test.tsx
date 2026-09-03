import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, getAnalysisHistory, getSavedAnalysis } from '../../../api/pathfinder';
import { SavedAnalysisDetail, SavedAnalysisSummary } from '../../../types/api';
import { AnalysisHistory } from '../AnalysisHistory';
import { formatSavedTimestamp } from '../formatting';
import { savedAnalysisDetailToAnalysisResponse } from '../mapping';

vi.mock('../../../api/pathfinder', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../../api/pathfinder')>(),
  getAnalysisHistory: vi.fn(),
  getSavedAnalysis: vi.fn(),
}));

const summary: SavedAnalysisSummary = {
  analysis_id: '65a88a10-4749-4a23-8079-890220dd5997',
  created_at: '2026-09-03T10:00:00Z',
  job_title: 'Platform Engineer',
  company_name: null,
  score: null,
  ai_enriched: true,
};

const detail: SavedAnalysisDetail = {
  analysis_id: summary.analysis_id,
  created_at: summary.created_at,
  candidate_profile: {
    skills: [{ name: 'python' }],
    experience: [{
      role_title: { title: 'Developer' },
      company_name: 'Fictional Labs',
      duration_months: 18,
      description: '<script>alert("no")</script>',
      skills: [{ name: 'python' }],
    }],
    education: [{ level: 'bachelor', field_of_study: 'Computing', institution: 'Example University' }],
    projects: [{ name: 'Portfolio', skills: [] }],
    certifications: [{ name: 'Cloud Basics' }],
    preferences: {
      target_titles: [{ title: 'Platform Engineer' }],
      preferred_locations: ['Remote'],
      acceptable_work_modes: ['remote'],
    },
  },
  job_description: {
    title: { title: 'Platform Engineer' },
    company_info: { name: 'Example Systems', industry: 'Technology', location: 'Remote' },
    responsibilities: [{ description: 'Build platforms' }],
    required_skills: [{ name: 'python' }],
    preferred_skills: [{ name: 'docker' }],
    experience_requirement: { minimum_years: 2, maximum_years: 4 },
    education_requirement: { level: 'bachelor', field_of_study: 'Computing' },
  },
  score: { value: 75 },
  explanation: {
    score: { value: 75 },
    components: [{ kind: 'required_skills', earned_points: 1, possible_points: 1 }],
    matched_skills: [],
    experience: null,
    education: null,
    gaps: { missing_required_skills: [], missing_preferred_skills: [{ name: 'docker' }], experience_gap: null, education_gap: null },
    keyword_coverage: { matched_keywords: [{ name: 'python' }], missing_keywords: [{ name: 'docker' }], percentage: 50 },
  },
  interview_preparation: {
    themes: [{ kind: 'strength', description: 'Discuss Python' }],
    talking_points: [{ description: 'Python delivery' }],
    question_categories: ['technical'],
    candidate_questions: [{ description: 'How are platforms operated?' }],
  },
  learning_recommendations: {
    items: [{
      kind: 'preferred_skill',
      priority: 'medium',
      topic: 'docker',
      title: 'Build Docker capability',
      rationale: 'Docker is preferred.',
      suggested_course_topic: 'docker fundamentals',
    }],
  },
  ai_enrichment: { provider_name: 'FakeProvider', content: 'Historical insight' },
};

describe('AnalysisHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAnalysisHistory).mockResolvedValue({ items: [] });
  });

  it('shows loading then an empty state and first-page controls', async () => {
    let resolveHistory!: (value: { items: SavedAnalysisSummary[] }) => void;
    vi.mocked(getAnalysisHistory).mockReturnValue(new Promise((resolve) => { resolveHistory = resolve; }));
    render(<AnalysisHistory />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading saved analyses');
    resolveHistory({ items: [] });
    expect(await screen.findByText('No saved analyses yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('renders lightweight summaries without candidate content', async () => {
    vi.mocked(getAnalysisHistory).mockResolvedValue({ items: [summary] });
    render(<AnalysisHistory />);
    expect(await screen.findByText('Platform Engineer')).toBeInTheDocument();
    expect(screen.getByText('Company not supplied')).toBeInTheDocument();
    expect(screen.getByText('Not scored')).toBeInTheDocument();
    expect(screen.getByText('Includes AI enrichment')).toBeInTheDocument();
    expect(screen.queryByText('python')).not.toBeInTheDocument();
  });

  it('paginates forward and back and refreshes the current page', async () => {
    const fullPage = Array.from({ length: 20 }, (_, index) => ({
      ...summary,
      analysis_id: `${summary.analysis_id}-${index}`,
      job_title: `Role ${index}`,
    }));
    vi.mocked(getAnalysisHistory).mockResolvedValue({ items: fullPage });
    render(<AnalysisHistory />);
    await screen.findByText('Role 0');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(getAnalysisHistory).toHaveBeenCalledWith(20, 20));
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    await waitFor(() => expect(getAnalysisHistory).toHaveBeenCalledWith(20, 0));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(getAnalysisHistory).toHaveBeenCalledTimes(4));
  });

  it('shows dedicated persistence and safe generic failures', async () => {
    vi.mocked(getAnalysisHistory).mockRejectedValueOnce(
      new ApiError('hidden', 503, 'persistence_unavailable'),
    );
    const { unmount } = render(<AnalysisHistory />);
    expect(await screen.findByText(/persistence is not configured/)).toBeInTheDocument();
    unmount();

    vi.mocked(getAnalysisHistory).mockRejectedValueOnce(new ApiError('server detail', 500));
    render(<AnalysisHistory />);
    expect(await screen.findByText(/could not load analysis history/)).toBeInTheDocument();
    expect(screen.queryByText('server detail')).not.toBeInTheDocument();
  });

  it('loads authoritative detail, renders stored sections, and returns to history', async () => {
    vi.mocked(getAnalysisHistory).mockResolvedValue({ items: [{ ...summary, score: 75 }] });
    vi.mocked(getSavedAnalysis).mockResolvedValue(detail);
    render(<AnalysisHistory />);
    fireEvent.click(await screen.findByRole('button', { name: /Platform Engineer/ }));

    expect(await screen.findByRole('heading', { name: 'Candidate Profile' })).toBeInTheDocument();
    expect(screen.getByText('Fictional Labs', { exact: false })).toBeInTheDocument();
    expect(screen.getAllByText('Example Systems')).toHaveLength(2);
    expect(screen.getByText('75%')).toBeInTheDocument();
    expect(screen.getByText('Discuss Python')).toBeInTheDocument();
    expect(screen.getByText('Build Docker capability')).toBeInTheDocument();
    expect(screen.getByText('Historical insight', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('<script>alert("no")</script>')).toBeInTheDocument();
    expect(document.querySelector('script')).toBeNull();
    expect(getSavedAnalysis).toHaveBeenCalledWith(summary.analysis_id);

    fireEvent.click(screen.getByRole('button', { name: '← Back to History' }));
    expect(screen.getByRole('heading', { name: 'Analysis History' })).toBeInTheDocument();
  });

  it('handles legacy recommendations and detail not found', async () => {
    vi.mocked(getAnalysisHistory).mockResolvedValue({ items: [summary] });
    vi.mocked(getSavedAnalysis).mockResolvedValueOnce({ ...detail, learning_recommendations: null });
    const { unmount } = render(<AnalysisHistory />);
    fireEvent.click(await screen.findByRole('button', { name: /Platform Engineer/ }));
    expect(await screen.findByText(/not stored for this legacy analysis/)).toBeInTheDocument();
    unmount();

    vi.mocked(getAnalysisHistory).mockResolvedValue({ items: [summary] });
    vi.mocked(getSavedAnalysis).mockRejectedValueOnce(
      new ApiError('not found', 404, 'analysis_not_found'),
    );
    render(<AnalysisHistory />);
    fireEvent.click(await screen.findByRole('button', { name: /Platform Engineer/ }));
    expect(await screen.findByText('This saved analysis could not be found.')).toBeInTheDocument();
  });
});

describe('history helpers', () => {
  it('formats valid timestamps without depending on an exact timezone and handles invalid input', () => {
    expect(formatSavedTimestamp(summary.created_at)).not.toBe('Unknown date');
    expect(formatSavedTimestamp('not-a-date')).toBe('Unknown date');
  });

  it('maps stored detail without recomputation', () => {
    const mapped = savedAnalysisDetailToAnalysisResponse(detail);
    expect(mapped.score).toBe(detail.score);
    expect(mapped.explanation).toBe(detail.explanation);
    expect(mapped.interview_preparation).toBe(detail.interview_preparation);
    expect(mapped.learning_recommendations).toBe(detail.learning_recommendations);
  });
});
