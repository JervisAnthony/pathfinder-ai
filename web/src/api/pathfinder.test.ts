import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  analyzeCandidateJob,
  ApiError,
  compareSavedAnalyses,
  deleteSavedAnalysis,
  downloadSavedAnalysis,
  getAnalysisHistory,
  getAnalysisTracking,
  getAnalysisTrackingHistory,
  getAnalysisNote,
  updateAnalysisNote,
  clearAnalysisNote,
  getSavedAnalysis,
  updateAnalysisTracking,
  importResumeSkills,
} from './pathfinder';
import {
  AnalysisRequest,
  AnalysisResponse,
  ApiErrorDetail,
  SavedAnalysisDetail,
  ResumeSkillImportRequest,
  ResumeSkillImportResponse,
} from '../types/api';

const request: AnalysisRequest = {
  candidate_profile: { skills: [{ name: 'Python' }], experience: [], education: [], projects: [], certifications: [] },
  job_description: { title: { title: 'Engineer' }, responsibilities: [], required_skills: [], preferred_skills: [] },
  include_ai_enrichment: false,
  save_analysis: false,
};

const success: AnalysisResponse = {
  score: { value: 50 },
  explanation: {
    score: { value: 50 }, components: [], matched_skills: [], experience: null, education: null,
    gaps: { missing_required_skills: [], missing_preferred_skills: [], experience_gap: null, education_gap: null },
    keyword_coverage: { matched_keywords: [], missing_keywords: [], percentage: null },
  },
  interview_preparation: { themes: [], talking_points: [], question_categories: [], candidate_questions: [] },
  learning_recommendations: { items: [] },
  ai_enrichment: null,
  saved_analysis: null,
};

function errorResponse(status: number, code: string, message: string, details: ApiErrorDetail[] | null = null): Response {
  return new Response(JSON.stringify({ error: { code, message, details } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function expectApiError(response: Response, status: number, code: string | undefined, message: string, details: ApiErrorDetail[] | null = null) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response);
  const error = await analyzeCandidateJob(request).catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(ApiError);
  expect(error).toMatchObject({ status, code, message, details });
}

describe('analyzeCandidateJob', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns a successful analysis response', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json(success));
    await expect(analyzeCandidateJob(request)).resolves.toEqual(success);
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/analysis', expect.objectContaining({ method: 'POST', body: JSON.stringify(request) }));
  });

  it('retains structured validation details', async () => {
    const details = [{ loc: ['body', 'candidate_profile', 'skills'], msg: 'Invalid skills', type: 'value_error' }];
    await expectApiError(errorResponse(422, 'validation_error', 'Request validation failed.', details), 422, 'validation_error', 'Request validation failed.', details);
  });

  it('retains a domain validation error', async () => {
    await expectApiError(errorResponse(422, 'domain_validation_error', 'Candidate profile is invalid.'), 422, 'domain_validation_error', 'Candidate profile is invalid.');
  });

  it('retains a provider execution error', async () => {
    await expectApiError(errorResponse(502, 'ai_provider_error', 'AI enrichment failed.'), 502, 'ai_provider_error', 'AI enrichment failed.');
  });

  it('retains provider and persistence unavailable errors', async () => {
    await expectApiError(errorResponse(503, 'ai_provider_unavailable', 'AI provider unavailable.'), 503, 'ai_provider_unavailable', 'AI provider unavailable.');
    await expectApiError(errorResponse(503, 'persistence_unavailable', 'Persistence unavailable.'), 503, 'persistence_unavailable', 'Persistence unavailable.');
  });

  it('handles malformed and non-JSON error bodies safely', async () => {
    await expectApiError(errorResponse(500, 'internal_server_error', 'Pathfinder could not complete the request.'), 500, 'internal_server_error', 'Pathfinder could not complete the request.');
    await expectApiError(new Response('<html>bad gateway</html>', { status: 500 }), 500, undefined, 'Pathfinder returned an unreadable error response.');
    await expectApiError(new Response(JSON.stringify({ detail: 'legacy shape' }), { status: 500 }), 500, undefined, 'Pathfinder returned an invalid error response.');
  });

  it('wraps network failures without exposing their contents', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('secret network detail'));
    await expect(analyzeCandidateJob(request)).rejects.toMatchObject({
      message: 'Unable to reach Pathfinder. Check your connection and try again.',
      status: undefined,
      code: undefined,
      details: null,
    });
  });
});

describe('downloadSavedAnalysis', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each(['json', 'markdown'] as const)('fetches the %s attachment as a Blob with GET only', async (format) => {
    const response = new Response('Stored snapshot 株式会社');
    const blobRead = vi.spyOn(response, 'blob');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response);
    const blob = await downloadSavedAnalysis('id/with ? separators', format);
    const content = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsText(blob);
    });
    expect(content).toBe('Stored snapshot 株式会社');
    expect(blobRead).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/v1/analyses/id%2Fwith%20%3F%20separators/export?format=${format}`,
      { method: 'GET', cache: 'no-store' },
    );
  });

  it.each([
    [404, 'analysis_not_found'], [503, 'persistence_unavailable'], [422, 'validation_error'],
  ])('preserves the safe error envelope for HTTP %i without reading a Blob', async (status, code) => {
    const response = errorResponse(status as number, code as string, 'Safe failure');
    const blobRead = vi.spyOn(response, 'blob');
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response);
    await expect(downloadSavedAnalysis('saved-id', 'json')).rejects.toMatchObject({ status, code });
    expect(blobRead).not.toHaveBeenCalled();
  });

  it.each([
    [new Response('<html>private</html>', { status: 500 }), 'unreadable'],
    [new Response(JSON.stringify({ private: 'wrong shape' }), { status: 500 }), 'invalid'],
  ])('rejects malformed failures safely', async (response, description) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response as Response);
    await expect(downloadSavedAnalysis('saved-id', 'markdown')).rejects.toMatchObject({
      status: 500, message: `Pathfinder returned an ${description} error response.`,
    });
  });

  it('wraps network failures safely', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('private network details'));
    await expect(downloadSavedAnalysis('saved-id', 'json')).rejects.toMatchObject({
      message: 'Unable to reach Pathfinder. Check your connection and try again.',
    });
  });
});

describe('importResumeSkills', () => {
  afterEach(() => vi.restoreAllMocks());

  const importRequest: ResumeSkillImportRequest = {
    resume_text: 'Python',
    required_skills: [{ name: 'Python' }],
    preferred_skills: [],
  };
  const importResponse: ResumeSkillImportResponse = {
    matched_required_skills: [{ name: 'python' }],
    matched_preferred_skills: [],
    unmatched_required_skills: [],
    unmatched_preferred_skills: [],
  };

  it('posts the exact request and returns the response', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json(importResponse));

    await expect(importResumeSkills(importRequest)).resolves.toEqual(importResponse);
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/resume/skill-import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(importRequest),
    });
  });

  it.each([
    [errorResponse(422, 'validation_error', 'Request validation failed.'), 'Request validation failed.', 'validation_error'],
    [new Response(JSON.stringify({ detail: 'wrong' }), { status: 500 }), 'Pathfinder returned an invalid error response.', undefined],
    [new Response('not json', { status: 500 }), 'Pathfinder returned an unreadable error response.', undefined],
  ])('handles safe API failures', async (response, message, code) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response);

    await expect(importResumeSkills(importRequest)).rejects.toMatchObject({ message, code });
  });

  it('wraps network failures safely', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('private resume detail'));

    await expect(importResumeSkills(importRequest)).rejects.toMatchObject({
      message: 'Unable to reach Pathfinder. Check your connection and try again.',
    });
  });
});

const savedDetail: SavedAnalysisDetail = {
  analysis_id: '65a88a10-4749-4a23-8079-890220dd5997',
  created_at: '2026-09-03T10:00:00Z',
  candidate_profile: request.candidate_profile,
  job_description: request.job_description,
  score: success.score,
  explanation: success.explanation,
  interview_preparation: success.interview_preparation,
  learning_recommendations: success.learning_recommendations,
  ai_enrichment: null,
};

describe('saved analysis API', () => {
  afterEach(() => vi.restoreAllMocks());

  it('gets a paginated analysis history response', async () => {
    const history = {
      items: [{
        analysis_id: savedDetail.analysis_id,
        created_at: savedDetail.created_at,
        job_title: 'Engineer',
        company_name: null,
        score: 50,
        ai_enriched: false,
      }],
    };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json(history));

    await expect(getAnalysisHistory(10, 30)).resolves.toEqual(history);
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/analyses?limit=10&offset=30', undefined);
  });

  it('supports an empty history with default pagination', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({ items: [] }));

    await expect(getAnalysisHistory()).resolves.toEqual({ items: [] });
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/analyses?limit=20&offset=0', undefined);
  });

  it('gets saved detail and encodes its identifier', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json(savedDetail));

    await expect(getSavedAnalysis('id/with spaces')).resolves.toEqual(savedDetail);
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/analyses/id%2Fwith%20spaces', undefined);
  });

  it('deletes an encoded saved analysis without decoding the 204 response', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(null, { status: 204 }),
    );

    await expect(deleteSavedAnalysis('id/with spaces')).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/analyses/id%2Fwith%20spaces', {
      method: 'DELETE',
    });
  });

  it.each([
    [404, 'analysis_not_found'],
    [503, 'persistence_unavailable'],
    [500, 'internal_server_error'],
  ])('retains delete API errors for HTTP %i', async (status, code) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      errorResponse(status, code, 'Private backend message'),
    );

    await expect(deleteSavedAnalysis(savedDetail.analysis_id)).rejects.toMatchObject({
      status,
      code,
    });
  });

  it('wraps delete network failures safely', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('private network detail'));

    await expect(deleteSavedAnalysis(savedDetail.analysis_id)).rejects.toMatchObject({
      message: 'Unable to reach Pathfinder. Check your connection and try again.',
      status: undefined,
    });
  });

  it('retains not-found and persistence errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      errorResponse(404, 'analysis_not_found', 'Saved analysis was not found.'),
    );
    await expect(getSavedAnalysis(savedDetail.analysis_id)).rejects.toMatchObject({
      status: 404,
      code: 'analysis_not_found',
    });

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      errorResponse(503, 'persistence_unavailable', 'Analysis persistence is unavailable.'),
    );
    await expect(getAnalysisHistory()).rejects.toMatchObject({
      status: 503,
      code: 'persistence_unavailable',
    });
  });

  it('handles malformed and non-JSON history failures safely', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'wrong shape' }), { status: 500 }),
    );
    await expect(getAnalysisHistory()).rejects.toMatchObject({
      status: 500,
      message: 'Pathfinder returned an invalid error response.',
    });

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('<html>failure</html>', { status: 500 }),
    );
    await expect(getSavedAnalysis(savedDetail.analysis_id)).rejects.toMatchObject({
      status: 500,
      message: 'Pathfinder returned an unreadable error response.',
    });
  });

  it('wraps history network failures safely', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('private detail'));

    await expect(getAnalysisHistory()).rejects.toMatchObject({
      message: 'Unable to reach Pathfinder. Check your connection and try again.',
      status: undefined,
    });
  });

  it('encodes literal search and includes false and zero filter values', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ items: [] })),
    );
    const search = "100% Data_Engineer \\ O'Connor 株式会社 ' OR 1=1 --";
    await getAnalysisHistory(20, 40, { query: search, ai_enriched: false, min_score: 0, max_score: 100 });
    const url = new URL(String(fetchMock.mock.calls[0][0]), 'http://localhost');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      limit: '20', offset: '40', query: search, ai_enriched: 'false', min_score: '0', max_score: '100',
    });
  });
});

describe('compareSavedAnalyses', () => {
  afterEach(() => vi.restoreAllMocks());
  it('encodes both IDs and uses a read-only uncached GET', async () => {
    const result = { score_delta: -8 };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(result)));
    expect(await compareSavedAnalyses('left/&?', 'right + Unicodeé')).toEqual(result);
    const [url, init] = fetchMock.mock.calls[0];
    const parsed = new URL(String(url), 'http://localhost');
    expect(parsed.pathname).toBe('/api/v1/analyses/compare');
    expect(parsed.searchParams.get('left_analysis_id')).toBe('left/&?');
    expect(parsed.searchParams.get('right_analysis_id')).toBe('right + Unicodeé');
    expect(init).toEqual({ method: 'GET', cache: 'no-store' });
  });
  it.each([[404, 'analysis_not_found'], [503, 'persistence_unavailable']])('preserves safe errors %s', async (status, code) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(errorResponse(Number(status), String(code), 'Safe message'));
    await expect(compareSavedAnalyses('left', 'right')).rejects.toMatchObject({ status, code, message: 'Safe message' });
  });
  it('masks network failures', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('PRIVATE'));
    await expect(compareSavedAnalyses('left', 'right')).rejects.toMatchObject({ message: 'Unable to reach Pathfinder. Check your connection and try again.' });
  });
});

describe('analysis tracking client', () => {
  afterEach(() => vi.restoreAllMocks());
  it('reads and writes the separate tracking resource', async () => {
    const tracking = { analysis_id: 'id', application_status: 'applied', updated_at: '2026-01-01T00:00:00Z' };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify(tracking), { status: 200 }));
    expect(await getAnalysisTracking('id +')).toEqual(tracking);
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/analyses/id%20%2B/tracking', { cache: 'no-store' });
    expect(await updateAnalysisTracking('id +', 'applied')).toEqual(tracking);
    expect(fetchMock).toHaveBeenLastCalledWith('/api/v1/analyses/id%20%2B/tracking', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ application_status: 'applied' }), cache: 'no-store',
    });
  });
  it('loads paginated activity without browser caching', async () => {
    const payload = { items: [{ previous_status: 'applied', application_status: 'offer', changed_at: '2026-01-01T00:00:00Z' }] };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 }));
    expect(await getAnalysisTrackingHistory('id +', 20, 40)).toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/analyses/id%20%2B/tracking/history?limit=20&offset=40', { cache: 'no-store' });
  });
  it.each([[404, 'analysis_not_found'], [503, 'persistence_unavailable']])('preserves safe errors %s', async (status, code) => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => errorResponse(Number(status), String(code), 'Safe message'));
    await expect(getAnalysisTracking('id')).rejects.toMatchObject({ status, code });
    await expect(updateAnalysisTracking('id', 'applied')).rejects.toMatchObject({ status, code });
    await expect(getAnalysisTrackingHistory('id')).rejects.toMatchObject({ status, code });
  });
});

describe('application note client', () => {
  afterEach(() => vi.restoreAllMocks());

  it('reads an empty or saved note using the encoded URL and no-store', async () => {
    const empty = { analysis_id: 'id', content: null, updated_at: null };
    const saved = { analysis_id: 'id', content: '  🐍\nline two  ', updated_at: '2026-01-01T00:00:00Z' };
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(empty), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(saved), { status: 200 }));
    expect(await getAnalysisNote('id +')).toEqual(empty);
    expect(await getAnalysisNote('id +')).toEqual(saved);
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/analyses/id%20%2B/note', { method: 'GET', cache: 'no-store' });
  });

  it('sends exact user content only when explicitly asked to save', async () => {
    const saved = { analysis_id: 'id', content: '  🐍\nline two  ', updated_at: '2026-01-01T00:00:00Z' };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(saved), { status: 200 }));
    expect(await updateAnalysisNote('id +', saved.content)).toEqual(saved);
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith('/api/v1/analyses/id%20%2B/note', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: saved.content }), cache: 'no-store',
    });
  });

  it('clears a note using DELETE and accepts a bodyless 204', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
    await expect(clearAnalysisNote('id +')).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/analyses/id%20%2B/note', { method: 'DELETE', cache: 'no-store' });
  });

  it.each([[404, 'analysis_not_found'], [503, 'persistence_unavailable']])('preserves safe %s note errors', async (status, code) => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => errorResponse(Number(status), String(code), 'Safe message'));
    await expect(getAnalysisNote('id')).rejects.toMatchObject({ status, code });
    await expect(updateAnalysisNote('id', 'text')).rejects.toMatchObject({ status, code });
    await expect(clearAnalysisNote('id')).rejects.toMatchObject({ status, code });
  });

  it('preserves note validation and masks network failures', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(errorResponse(422, 'validation_error', 'Safe message'))
      .mockRejectedValue(new Error('PRIVATE'));
    await expect(updateAnalysisNote('id', 'text')).rejects.toMatchObject({ status: 422, code: 'validation_error' });
    await expect(getAnalysisNote('id')).rejects.toMatchObject({ message: 'Unable to reach Pathfinder. Check your connection and try again.' });
    await expect(updateAnalysisNote('id', 'text')).rejects.toMatchObject({ message: 'Unable to reach Pathfinder. Check your connection and try again.' });
    await expect(clearAnalysisNote('id')).rejects.toMatchObject({ message: 'Unable to reach Pathfinder. Check your connection and try again.' });
  });
});
