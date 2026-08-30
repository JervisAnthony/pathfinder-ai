import { afterEach, describe, expect, it, vi } from 'vitest';
import { analyzeCandidateJob, ApiError } from './pathfinder';
import { AnalysisRequest, AnalysisResponse, ApiErrorDetail } from '../types/api';

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
