import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  analyzeCandidateJob,
  ApiError,
  getAnalysisHistory,
  getSavedAnalysis,
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
});
