import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { analyzeCandidateJob, ApiError } from '../pathfinder';

const mockRequest = {
  candidate_profile: { skills: [], experience: [], education: [], projects: [], certifications: [] },
  job_description: { title: { title: 'Dev' }, responsibilities: [], required_skills: [], preferred_skills: [] },
  include_ai_enrichment: false,
  save_analysis: false
};

describe('pathfinder api client', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it('parses successful response', async () => {
    const mockResponse = { score: { value: 80 } };
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as unknown as Response);

    const result = await analyzeCandidateJob(mockRequest);
    expect(result).toEqual(mockResponse);
  });

  it('handles standard FastAPI 422 error format', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: async () => ({
        detail: [{ loc: ['body', 'job_description'], msg: 'field required' }]
      }),
    } as unknown as Response);

    await expect(analyzeCandidateJob(mockRequest)).rejects.toThrow(/Validation Error: job_description: field required/);
  });

  it('handles Pathfinder structured error envelope', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: async () => ({
        error: {
          code: 'domain_validation_error',
          message: 'Domain validation failed',
          details: [{ loc: ['body', 'candidate_profile'], msg: 'missing evidence' }]
        }
      }),
    } as unknown as Response);

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: async () => ({
        error: {
          code: 'domain_validation_error',
          message: 'Domain validation failed',
          details: [{ loc: ['body', 'candidate_profile'], msg: 'missing evidence' }]
        }
      }),
    } as unknown as Response);

    await expect(analyzeCandidateJob(mockRequest)).rejects.toThrow(/Domain validation failed \(candidate_profile: missing evidence\)/);

    try {
        await analyzeCandidateJob(mockRequest);
    } catch(err) {
        expect((err as ApiError).code).toBe('domain_validation_error');
    }
  });

  it('handles 502/503 structured error', async () => {
     vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({
        error: {
          code: 'provider_unavailable',
          message: 'AI provider is unavailable',
          details: null
        }
      }),
    } as unknown as Response);

    await expect(analyzeCandidateJob(mockRequest)).rejects.toThrow('AI provider is unavailable');
  });

  it('handles non-JSON server failure', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => { throw new Error('invalid json'); },
    } as unknown as Response);

    await expect(analyzeCandidateJob(mockRequest)).rejects.toThrow('Server error: 500 Internal Server Error');
  });

  it('handles network rejection', async () => {
    vi.mocked(global.fetch).mockRejectedValueOnce(new Error('Network offline'));
    await expect(analyzeCandidateJob(mockRequest)).rejects.toThrow('Network error or unable to parse response');
  });
});
