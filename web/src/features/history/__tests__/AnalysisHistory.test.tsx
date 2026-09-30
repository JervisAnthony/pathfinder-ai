import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  analyzeCandidateJob,
  ApiError,
  compareSavedAnalyses,
  deleteSavedAnalysis,
  downloadSavedAnalysis,
  getAnalysisHistory,
  getAnalysisTracking,
  getSavedAnalysis,
  updateAnalysisTracking,
} from '../../../api/pathfinder';
import { SavedAnalysisDetail, SavedAnalysisSummary, SavedAnalysisComparison } from '../../../types/api';
import { AnalysisHistory } from '../AnalysisHistory';
import { formatSavedTimestamp } from '../formatting';
import { savedAnalysisDetailToAnalysisResponse } from '../mapping';

vi.mock('../../../api/pathfinder', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../../api/pathfinder')>(),
  getAnalysisHistory: vi.fn(),
  compareSavedAnalyses: vi.fn(),
  getSavedAnalysis: vi.fn(),
  getAnalysisTracking: vi.fn(),
  updateAnalysisTracking: vi.fn(),
  deleteSavedAnalysis: vi.fn(),
  downloadSavedAnalysis: vi.fn(),
  analyzeCandidateJob: vi.fn(),
}));

const summary: SavedAnalysisSummary = {
  analysis_id: '65a88a10-4749-4a23-8079-890220dd5997',
  created_at: '2026-09-03T10:00:00Z',
  job_title: 'Platform Engineer',
  company_name: null,
  score: null,
  ai_enriched: true,
  application_status: 'not_applied',
  status_updated_at: null,
};

beforeEach(() => {
  vi.mocked(getAnalysisTracking).mockResolvedValue({ analysis_id: summary.analysis_id, application_status: 'not_applied', updated_at: null });
});

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
  ai_enrichment: { provider_name: 'OpenAI', content: 'Historical insight' },
};

describe('AnalysisHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAnalysisHistory).mockResolvedValue({ items: [] });
    vi.mocked(getAnalysisTracking).mockResolvedValue({ analysis_id: summary.analysis_id, application_status: 'not_applied', updated_at: null });
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
    expect(screen.getByText('Provider: OpenAI')).toBeInTheDocument();
    expect(screen.getByText(/AI-generated enrichment may be inaccurate/)).toBeInTheDocument();
    expect(analyzeCandidateJob).not.toHaveBeenCalled();
    expect(screen.getByText('<script>alert("no")</script>')).toBeInTheDocument();
    expect(document.querySelector('script')).toBeNull();
    expect(getSavedAnalysis).toHaveBeenCalledWith(summary.analysis_id);

    fireEvent.click(screen.getByRole('button', { name: '← Back to History' }));
    expect(screen.getByRole('heading', { name: 'Analysis History' })).toBeInTheDocument();
  });

  it('confirms, cancels, and deletes exactly once before refreshing history', async () => {
    vi.mocked(getAnalysisHistory)
      .mockResolvedValueOnce({ items: [summary] })
      .mockResolvedValue({ items: [] });
    vi.mocked(getSavedAnalysis).mockResolvedValue(detail);
    let resolveDelete!: () => void;
    vi.mocked(deleteSavedAnalysis).mockReturnValue(
      new Promise<void>((resolve) => { resolveDelete = resolve; }),
    );
    render(<AnalysisHistory />);
    fireEvent.click(await screen.findByRole('button', { name: /Platform Engineer/ }));
    await screen.findByRole('heading', { name: 'Candidate Profile' });

    fireEvent.click(screen.getByRole('button', { name: 'Delete saved analysis' }));
    expect(deleteSavedAnalysis).not.toHaveBeenCalled();
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('Delete this saved analysis?');
    expect(dialog).toHaveTextContent('cannot be undone in Pathfinder');
    expect(dialog).toHaveTextContent('not a guaranteed secure erase');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(deleteSavedAnalysis).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Delete saved analysis' }));
    const permanent = screen.getByRole('button', { name: 'Delete permanently' });
    fireEvent.click(permanent);
    expect(await screen.findByRole('status')).toHaveTextContent('Deleting saved analysis');
    expect(permanent).toBeDisabled();
    fireEvent.click(permanent);
    expect(deleteSavedAnalysis).toHaveBeenCalledTimes(1);
    expect(deleteSavedAnalysis).toHaveBeenCalledWith(summary.analysis_id);
    resolveDelete();

    expect(await screen.findByText('No saved analyses yet.')).toBeInTheDocument();
    expect(getAnalysisHistory).toHaveBeenLastCalledWith(20, 0);
    expect(analyzeCandidateJob).not.toHaveBeenCalled();
  });

  it.each([
    [new ApiError('private', 404, 'analysis_not_found'), 'This saved analysis no longer exists.'],
    [new ApiError('private', 503, 'persistence_unavailable'), 'Analysis history is unavailable because persistence is not configured on this Pathfinder server.'],
    [new Error('private network'), 'Pathfinder could not delete this saved analysis. Please try again.'],
  ])('preserves detail and shows a safe deletion failure', async (failure, message) => {
    vi.mocked(getAnalysisHistory).mockResolvedValue({ items: [summary] });
    vi.mocked(getSavedAnalysis).mockResolvedValue(detail);
    vi.mocked(deleteSavedAnalysis).mockRejectedValueOnce(failure);
    render(<AnalysisHistory />);
    fireEvent.click(await screen.findByRole('button', { name: /Platform Engineer/ }));
    await screen.findByRole('heading', { name: 'Candidate Profile' });
    fireEvent.click(screen.getByRole('button', { name: 'Delete saved analysis' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.getByRole('heading', { name: 'Candidate Profile' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '← Back to History' })).toBeInTheDocument();
    expect(screen.getByText('<script>alert("no")</script>')).toBeInTheDocument();
    expect(document.querySelector('script')).toBeNull();
  });

  it('returns to the previous page after deleting its only item', async () => {
    const firstPage = Array.from({ length: 20 }, (_, index) => ({
      ...summary,
      analysis_id: `${summary.analysis_id}-${index}`,
      job_title: `Role ${index}`,
    }));
    vi.mocked(getAnalysisHistory)
      .mockResolvedValueOnce({ items: firstPage })
      .mockResolvedValueOnce({ items: [summary] })
      .mockResolvedValue({ items: firstPage });
    vi.mocked(getSavedAnalysis).mockResolvedValue(detail);
    vi.mocked(deleteSavedAnalysis).mockResolvedValue();
    render(<AnalysisHistory />);
    await screen.findByText('Role 0');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(await screen.findByRole('button', { name: /Platform Engineer/ }));
    await screen.findByRole('heading', { name: 'Candidate Profile' });
    fireEvent.click(screen.getByRole('button', { name: 'Delete saved analysis' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }));

    expect(await screen.findByText('Page 1')).toBeInTheDocument();
    await waitFor(() => expect(getAnalysisHistory).toHaveBeenLastCalledWith(20, 0));
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

describe('saved analysis downloads', () => {
  const createObjectURL = vi.fn(() => 'blob:stored-snapshot');
  const revokeObjectURL = vi.fn();
  let downloaded: Array<{ filename: string; href: string; connected: boolean }>;

  beforeEach(() => {
    vi.clearAllMocks();
    downloaded = [];
    vi.mocked(getAnalysisHistory).mockResolvedValue({ items: [summary] });
    vi.mocked(getSavedAnalysis).mockResolvedValue(detail);
    vi.mocked(downloadSavedAnalysis).mockResolvedValue(new Blob(['Stored snapshot']));
    vi.stubGlobal('URL', class extends URL {
      static createObjectURL = createObjectURL;
      static revokeObjectURL = revokeObjectURL;
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloaded.push({ filename: this.download, href: this.href, connected: this.isConnected });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function openDetail() {
    render(<AnalysisHistory />);
    fireEvent.click(await screen.findByRole('button', { name: /Platform Engineer/ }));
    await screen.findByRole('heading', { name: 'Candidate Profile' });
  }

  it.each([
    ['json', 'JSON', 'json'], ['markdown', 'Markdown', 'md'],
  ] as const)('downloads %s explicitly with a UUID filename and revokes the object URL', async (format, label, extension) => {
    await openDetail();
    expect(screen.getByRole('button', { name: 'Download JSON' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download Markdown' })).toBeInTheDocument();
    expect(downloadSavedAnalysis).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: `Download ${label}` }));
    await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith('blob:stored-snapshot'));
    expect(downloadSavedAnalysis).toHaveBeenCalledExactlyOnceWith(summary.analysis_id, format);
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(downloaded).toEqual([{ filename: `pathfinder-analysis-${summary.analysis_id}.${extension}`, href: 'blob:stored-snapshot', connected: true }]);
    expect(document.querySelector('a[download]')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Candidate Profile' })).toBeInTheDocument();
    expect(screen.getByText('<script>alert("no")</script>')).toBeInTheDocument();
    expect(document.querySelector('script')).toBeNull();
    expect(screen.getByRole('button', { name: 'Delete saved analysis' })).toBeEnabled();
    expect(analyzeCandidateJob).not.toHaveBeenCalled();
    expect(deleteSavedAnalysis).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Back to History/ }));
    expect(screen.getByRole('heading', { name: 'Analysis History' })).toBeInTheDocument();
  });

  it('shows accessible progress and prevents duplicate same-format requests', async () => {
    let resolveDownload!: (value: Blob) => void;
    vi.mocked(downloadSavedAnalysis).mockReturnValueOnce(new Promise((resolve) => { resolveDownload = resolve; }));
    await openDetail();
    const button = screen.getByRole('button', { name: 'Download JSON' });
    fireEvent.click(button);
    expect(screen.getByRole('status')).toHaveTextContent('Preparing JSON export');
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(downloadSavedAnalysis).toHaveBeenCalledTimes(1);
    resolveDownload(new Blob(['Stored JSON']));
    await waitFor(() => expect(button).toBeEnabled());
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
  });

  it.each([
    [new ApiError('private', 404, 'analysis_not_found'), 'This saved analysis no longer exists.'],
    [new ApiError('private', 503, 'persistence_unavailable'), 'Analysis history is unavailable because persistence is not configured on this Pathfinder server.'],
    [new Error('private'), 'Pathfinder could not export this saved analysis. Please try again.'],
  ])('keeps detail and avoids partial downloads on safe export failures', async (failure, message) => {
    vi.mocked(downloadSavedAnalysis).mockRejectedValueOnce(failure);
    await openDetail();
    fireEvent.click(screen.getByRole('button', { name: 'Download Markdown' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(message as string);
    expect(screen.getByRole('heading', { name: 'Candidate Profile' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download Markdown' })).toBeEnabled();
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(downloaded).toEqual([]);
  });

  it('revokes the object URL and removes the anchor even if triggering download fails', async () => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => { throw new Error('download blocked'); });
    await openDetail();
    fireEvent.click(screen.getByRole('button', { name: 'Download JSON' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Pathfinder could not export');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:stored-snapshot');
    expect(document.querySelector('a[download]')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Candidate Profile' })).toBeInTheDocument();
  });
});

describe('history filters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAnalysisHistory).mockResolvedValue({ items: [] });
  });

  it('applies normalized combined filters explicitly and clears them', async () => {
    render(<AnalysisHistory />);
    await screen.findByText('No saved analyses yet.');
    fireEvent.change(screen.getByLabelText('Search job title or company'), { target: { value: "  100% Data_Engineer \\ O'Connor 株式会社  " } });
    fireEvent.change(screen.getByLabelText('AI enrichment'), { target: { value: 'no' } });
    fireEvent.change(screen.getByLabelText('Minimum score'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('Maximum score'), { target: { value: '80' } });
    expect(getAnalysisHistory).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    await waitFor(() => expect(getAnalysisHistory).toHaveBeenLastCalledWith(20, 0, {
      query: "100% Data_Engineer \\ O'Connor 株式会社", ai_enriched: false, min_score: 0, max_score: 80,
    }));
    expect(await screen.findByText('No saved analyses match these filters.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(getAnalysisHistory).toHaveBeenCalledTimes(3));
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(getAnalysisHistory).toHaveBeenLastCalledWith(20, 0));
    expect(screen.getByLabelText('Search job title or company')).toHaveValue('');
    expect(await screen.findByText('No saved analyses yet.')).toBeInTheDocument();
  });

  it('resets pagination on apply and preserves filters through detail and deletion', async () => {
    const fullPage = Array.from({ length: 20 }, (_, index) => ({ ...summary, analysis_id: String(index), job_title: `Role ${index}` }));
    vi.mocked(getAnalysisHistory).mockResolvedValue({ items: fullPage });
    vi.mocked(getSavedAnalysis).mockResolvedValue(detail);
    vi.mocked(deleteSavedAnalysis).mockResolvedValue();
    render(<AnalysisHistory />);
    await screen.findByText('Role 0');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(getAnalysisHistory).toHaveBeenLastCalledWith(20, 20));
    fireEvent.change(screen.getByLabelText('Search job title or company'), { target: { value: 'Role' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    await waitFor(() => expect(getAnalysisHistory).toHaveBeenLastCalledWith(20, 0, { query: 'Role' }));
    fireEvent.click(await screen.findByRole('button', { name: /Role 0/ }));
    await screen.findByRole('heading', { name: 'Candidate Profile' });
    fireEvent.click(screen.getByRole('button', { name: 'Delete saved analysis' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }));
    await screen.findByText('Role 0');
    expect(getAnalysisHistory).toHaveBeenLastCalledWith(20, 0, { query: 'Role' });
    expect(analyzeCandidateJob).not.toHaveBeenCalled();
  });

  it('rejects invalid score ranges and long searches without a request', async () => {
    render(<AnalysisHistory />);
    await screen.findByText('No saved analyses yet.');
    fireEvent.change(screen.getByLabelText('Minimum score'), { target: { value: '80' } });
    fireEvent.change(screen.getByLabelText('Maximum score'), { target: { value: '20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    expect(screen.getByRole('alert')).toHaveTextContent('minimum no greater than maximum');
    expect(getAnalysisHistory).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(getAnalysisHistory).toHaveBeenCalledTimes(2));
    fireEvent.change(screen.getByLabelText('Search job title or company'), { target: { value: 'x'.repeat(201) } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    expect(screen.getByRole('alert')).toHaveTextContent('at most 200 characters');
    expect(getAnalysisHistory).toHaveBeenCalledTimes(2);
  });

  it('ignores an older response after filters change', async () => {
    let resolveOld!: (value: { items: SavedAnalysisSummary[] }) => void;
    vi.mocked(getAnalysisHistory).mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve; }));
    render(<AnalysisHistory />);
    fireEvent.change(screen.getByLabelText('Search job title or company'), { target: { value: 'new' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    await screen.findByText('No saved analyses match these filters.');
    resolveOld({ items: [summary] });
    await waitFor(() => expect(screen.queryByText('Platform Engineer')).not.toBeInTheDocument());
  });
});

const secondSummary = { ...summary, analysis_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', job_title: 'Second role' };
const comparison: SavedAnalysisComparison = {
  left: { ...summary, score: 82, keyword_coverage_percentage: 50, ai_enriched: false },
  right: { ...secondSummary, score: 74, keyword_coverage_percentage: 100, company_name: 'Northwind' },
  score_delta: -8, keyword_coverage_delta: 50,
  score_components: [{ kind: 'required_skills', left_earned_points: 50, left_possible_points: 60, right_earned_points: 42, right_possible_points: 60, earned_points_delta: -8 }, { kind: 'experience', left_earned_points: null, left_possible_points: null, right_earned_points: 10, right_possible_points: 20, earned_points_delta: null }],
  matched_skills: { in_both: ['python'], left_only: ['fastapi', 'azure'], right_only: ['docker'] },
  missing_required_skills: { in_both: [], left_only: ['kubernetes'], right_only: ['mlflow'] },
  missing_preferred_skills: { in_both: [], left_only: ['docker'], right_only: ['azure'] },
  experience_gaps: { left: { required_months: 36, known_candidate_months: 24, missing_months: 12 }, right: null },
  education_gaps: { left: { level: 'master', field_of_study: 'Computing', description: 'Stored degree' }, right: null },
};

describe('saved comparison workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAnalysisHistory).mockResolvedValue({ items: [summary, secondSummary] });
    vi.mocked(getSavedAnalysis).mockImplementation(async (id) => ({ ...detail, analysis_id: id, job_description: { ...detail.job_description, title: { title: id === summary.analysis_id ? summary.job_title : secondSummary.job_title } } }));
    vi.mocked(compareSavedAnalyses).mockResolvedValue(comparison);
  });
  async function selectFirst() {
    fireEvent.click(await screen.findByRole('button', { name: /Platform Engineer/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Select for comparison' }));
    expect(compareSavedAnalyses).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Compare with selected' })).not.toBeInTheDocument();
    expect(screen.getByText('Selected for comparison')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Back to History/ }));
  }
  async function openSecond() {
    fireEvent.click(screen.getByRole('button', { name: /Second role/ }));
    await screen.findByRole('button', { name: 'Compare with selected' });
  }
  it('compares once and renders neutral stored values, gaps and AI presence without AI text', async () => {
    render(<AnalysisHistory />); await selectFirst(); await openSecond();
    fireEvent.click(screen.getByRole('button', { name: 'Compare with selected' }));
    expect(await screen.findByRole('heading', { name: 'Saved Analysis Comparison' })).toBeInTheDocument();
    expect(compareSavedAnalyses).toHaveBeenCalledExactlyOnceWith(summary.analysis_id, secondSummary.analysis_id);
    expect(screen.getByText(/They do not by themselves indicate improvement or regression/)).toBeInTheDocument();
    for (const text of ['Northwind', '-8', 'Not present', 'python', 'fastapi', 'mlflow', 'kubernetes', 'Stored degree', 'No stored experience gap', 'No stored education gap', 'Stored AI enrichment: Yes', 'Stored AI enrichment: No']) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0);
    }
    expect(screen.queryByText('Historical insight')).not.toBeInTheDocument();
    expect(analyzeCandidateJob).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Open left snapshot' }));
    await screen.findByRole('button', { name: 'Download JSON' });
    expect(screen.getByRole('button', { name: 'Download Markdown' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Delete saved analysis' }));
    expect(deleteSavedAnalysis).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: '← Back to Comparison' }));
    expect(screen.getByRole('heading', { name: 'Saved Analysis Comparison' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open right snapshot' }));
    await screen.findByRole('heading', { name: 'Second role' });
    fireEvent.click(screen.getByRole('button', { name: '← Back to Comparison' }));
    expect(screen.getByRole('heading', { name: 'Saved Analysis Comparison' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear comparison' }));
    expect(screen.queryByText(/Selected for comparison:/)).not.toBeInTheDocument();
    expect(localStorage.length).toBe(0); expect(sessionStorage.length).toBe(0); expect(document.cookie).toBe('');
  });
  it('preserves selection and draft/applied filters across pagination and comparison Back', async () => {
    const page = Array.from({ length: 20 }, (_, i) => ({ ...summary, analysis_id: i ? `id-${i}` : summary.analysis_id, job_title: i ? `Role ${i}` : summary.job_title }));
    vi.mocked(getAnalysisHistory).mockImplementation(async (_limit, offset) => ({ items: offset ? [secondSummary] : page }));
    render(<AnalysisHistory />); await selectFirst();
    fireEvent.change(screen.getByLabelText('Search job title or company'), { target: { value: 'role' } });
    fireEvent.change(screen.getByLabelText('AI enrichment'), { target: { value: 'yes' } });
    fireEvent.change(screen.getByLabelText('Minimum score'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    await waitFor(() => expect(getAnalysisHistory).toHaveBeenCalledWith(20, 0, { query: 'role', ai_enriched: true, min_score: 0 }));
    fireEvent.change(screen.getByLabelText('Search job title or company'), { target: { value: 'draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByRole('button', { name: /Second role/ }); await openSecond();
    fireEvent.click(screen.getByRole('button', { name: 'Compare with selected' }));
    await screen.findByRole('heading', { name: 'Saved Analysis Comparison' });
    fireEvent.click(screen.getByRole('button', { name: 'Back to History' }));
    expect(screen.getByText('Page 2')).toBeInTheDocument();
    expect(screen.getByLabelText('Search job title or company')).toHaveValue('draft');
    expect(screen.getByLabelText('AI enrichment')).toHaveValue('yes');
    expect(screen.getByLabelText('Minimum score')).toHaveValue(0);
    expect(screen.getByText(/Selected for comparison:/)).toBeInTheDocument();
  });
  it.each([
    [new ApiError('PRIVATE', 404, 'analysis_not_found'), 'One or both saved analyses no longer exist.'],
    [new ApiError('PRIVATE', 503, 'persistence_unavailable'), 'Saved analysis comparison is unavailable because persistence is not configured on this Pathfinder server.'],
    [new Error('PRIVATE'), 'Pathfinder could not compare these saved analyses. Please try again.'],
  ])('keeps detail usable after safe comparison failure', async (error, message) => {
    vi.mocked(compareSavedAnalyses).mockRejectedValue(error);
    render(<AnalysisHistory />); await selectFirst(); await openSecond();
    fireEvent.click(screen.getByRole('button', { name: 'Compare with selected' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.queryByText('PRIVATE')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download JSON' })).toBeInTheDocument();
    if (error instanceof ApiError && error.status === 404) expect(screen.getByRole('button', { name: 'Select for comparison' })).toBeInTheDocument();
  });
  it('guards duplicate requests and reports loading', async () => {
    let resolve!: (value: SavedAnalysisComparison) => void;
    vi.mocked(compareSavedAnalyses).mockReturnValue(new Promise((r) => { resolve = r; }));
    render(<AnalysisHistory />); await selectFirst(); await openSecond();
    const button = screen.getByRole('button', { name: 'Compare with selected' });
    fireEvent.click(button); fireEvent.click(button);
    expect(screen.getByRole('status')).toHaveTextContent('Loading saved analysis comparison');
    expect(compareSavedAnalyses).toHaveBeenCalledTimes(1);
    resolve(comparison); await screen.findByRole('heading', { name: 'Saved Analysis Comparison' });
  });
  it('clears selection when the selected snapshot is deleted and when History unmounts', async () => {
    vi.mocked(deleteSavedAnalysis).mockResolvedValue();
    const view = render(<AnalysisHistory />); await selectFirst();
    fireEvent.click(screen.getByRole('button', { name: /Platform Engineer/ }));
    await screen.findByText('Selected for comparison');
    fireEvent.click(screen.getByRole('button', { name: 'Delete saved analysis' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }));
    await screen.findByRole('heading', { name: 'Analysis History' });
    expect(screen.queryByText(/Selected for comparison:/)).not.toBeInTheDocument();
    await selectFirst(); view.unmount(); render(<AnalysisHistory />);
    await screen.findByRole('heading', { name: 'Analysis History' });
    expect(screen.queryByText(/Selected for comparison:/)).not.toBeInTheDocument();
  });
  it('renders unavailable deltas and hostile stored text as inert React text', async () => {
    const hostile = '<script>alert(1)</script> **Café** "quote"; DROP TABLE saved_analyses;--';
    vi.mocked(compareSavedAnalyses).mockResolvedValue({ ...comparison, left: { ...comparison.left, job_title: hostile, score: null, keyword_coverage_percentage: null }, score_delta: null, keyword_coverage_delta: null, matched_skills: { in_both: [hostile], left_only: [], right_only: [] } });
    render(<AnalysisHistory />); await selectFirst(); await openSecond();
    fireEvent.click(screen.getByRole('button', { name: 'Compare with selected' }));
    await screen.findByRole('heading', { name: 'Saved Analysis Comparison' });
    expect(screen.getAllByText('Not comparable').length).toBeGreaterThan(1);
    expect(screen.getAllByText(hostile)).toHaveLength(2);
    expect(document.querySelector('script')).toBeNull();
  });
});

describe('comparison request navigation guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAnalysisHistory).mockResolvedValue({ items: [summary, secondSummary] });
    vi.mocked(getSavedAnalysis).mockImplementation(async (id) => ({ ...detail, analysis_id: id }));
    vi.mocked(compareSavedAnalyses).mockResolvedValue(comparison);
  });
  async function openComparisonPair() {
    fireEvent.click(await screen.findByRole('button', { name: /Platform Engineer/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Select for comparison' }));
    fireEvent.click(screen.getByRole('button', { name: /Back to History/ }));
    fireEvent.click(screen.getByRole('button', { name: /Second role/ }));
    await screen.findByRole('button', { name: 'Compare with selected' });
  }
  it('prevents an existing delete confirmation from submitting during comparison', async () => {
    let resolve!: (value: SavedAnalysisComparison) => void;
    vi.mocked(compareSavedAnalyses).mockReturnValue(new Promise((r) => { resolve = r; }));
    render(<AnalysisHistory />); await openComparisonPair();
    fireEvent.click(screen.getByRole('button', { name: 'Delete saved analysis' }));
    fireEvent.click(screen.getByRole('button', { name: 'Compare with selected' }));
    const deletion = screen.getByRole('button', { name: 'Delete permanently' });
    expect(deletion).toBeDisabled(); fireEvent.click(deletion);
    expect(deleteSavedAnalysis).not.toHaveBeenCalled();
    resolve(comparison); await screen.findByRole('heading', { name: 'Saved Analysis Comparison' });
  });
  it('prevents clearing or leaving comparison during side retrieval', async () => {
    render(<AnalysisHistory />); await openComparisonPair();
    fireEvent.click(screen.getByRole('button', { name: 'Compare with selected' }));
    await screen.findByRole('heading', { name: 'Saved Analysis Comparison' });
    let resolve!: (value: SavedAnalysisDetail) => void;
    vi.mocked(getSavedAnalysis).mockReturnValue(new Promise((r) => { resolve = r; }));
    fireEvent.click(screen.getByRole('button', { name: 'Open left snapshot' }));
    expect(screen.getByRole('button', { name: 'Clear comparison' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Back to History' })).toBeDisabled();
    resolve(detail); await screen.findByRole('button', { name: 'Download JSON' });
  });
});

describe('application status workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAnalysisHistory).mockResolvedValue({ items: [summary] });
    vi.mocked(getSavedAnalysis).mockResolvedValue(detail);
  });

  it('applies the draft filter only after submission', async () => {
    render(<AnalysisHistory />);
    await screen.findByRole('button', { name: /Platform Engineer/ });
    fireEvent.change(screen.getByLabelText('Application status'), { target: { value: 'applied' } });
    expect(getAnalysisHistory).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    await waitFor(() => expect(getAnalysisHistory).toHaveBeenLastCalledWith(20, 0, { application_status: 'applied' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(getAnalysisHistory).toHaveBeenLastCalledWith(20, 0));
  });

  it('loads and explicitly updates status while keeping detail open', async () => {
    vi.mocked(updateAnalysisTracking).mockResolvedValue({ analysis_id: summary.analysis_id, application_status: 'applied', updated_at: '2026-09-03T11:00:00Z' });
    render(<AnalysisHistory />);
    fireEvent.click(await screen.findByRole('button', { name: /Platform Engineer/ }));
    expect(await screen.findByText('Current status: Not applied')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Choose application status'), { target: { value: 'applied' } });
    expect(updateAnalysisTracking).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Update status' }));
    await screen.findByText('Current status: Applied');
    expect(updateAnalysisTracking).toHaveBeenCalledExactlyOnceWith(summary.analysis_id, 'applied');
    expect(screen.getByRole('heading', { name: 'Candidate Profile' })).toBeInTheDocument();
  });
});
