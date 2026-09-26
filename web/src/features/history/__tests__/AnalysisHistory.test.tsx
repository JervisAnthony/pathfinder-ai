import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  analyzeCandidateJob,
  ApiError,
  deleteSavedAnalysis,
  downloadSavedAnalysis,
  getAnalysisHistory,
  getSavedAnalysis,
} from '../../../api/pathfinder';
import { SavedAnalysisDetail, SavedAnalysisSummary } from '../../../types/api';
import { AnalysisHistory } from '../AnalysisHistory';
import { formatSavedTimestamp } from '../formatting';
import { savedAnalysisDetailToAnalysisResponse } from '../mapping';

vi.mock('../../../api/pathfinder', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../../api/pathfinder')>(),
  getAnalysisHistory: vi.fn(),
  getSavedAnalysis: vi.fn(),
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
  ai_enrichment: { provider_name: 'OpenAI', content: 'Historical insight' },
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
    expect(getAnalysisHistory).toHaveBeenLastCalledWith(20, 0);
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
