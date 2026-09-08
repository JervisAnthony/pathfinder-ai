import { afterEach, describe, expect, it, vi } from 'vitest';
import { createJobDescriptionDraft } from './pathfinder';
import { jobDraft, partialDraft } from '../features/analysis/__tests__/jobDraftFixture';

afterEach(() => vi.restoreAllMocks());
const request = { raw_job_description: 'Synthetic posting only' };

describe('job draft transport', () => {
  it.each([jobDraft, partialDraft])('posts only raw job text and returns typed draft', async (draft) => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(draft));
    expect(await createJobDescriptionDraft(request)).toEqual(draft);
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith('/api/v1/job-description/draft', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request),
    });
  });
  it.each([502, 503, 422])('retains typed HTTP %s', async (status) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ error: { code: 'safe_error', message: 'Safe message', details: null } }, { status }));
    await expect(createJobDescriptionDraft(request)).rejects.toMatchObject({ status, code: 'safe_error' });
  });
  it.each([
    null, {}, { ...jobDraft, title: 4 }, { ...jobDraft, provider_model: 'private' },
    { ...jobDraft, minimum_years: -1 }, { ...jobDraft, maximum_years: 2 },
    { ...jobDraft, education_level: 'invented' }, { ...jobDraft, required_skills: [4] },
    { ...jobDraft, responsibilities: Array(31).fill('x') },
  ])('rejects malformed success', async (value) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(value));
    await expect(createJobDescriptionDraft(request)).rejects.toThrow('invalid job draft');
  });
  it.each([Response.json({ private: 'details' }, { status: 500 }), new Response('PRIVATE', { status: 500 }), new Response('PRIVATE')])('rejects unreadable responses safely', async (response) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response);
    await expect(createJobDescriptionDraft(request)).rejects.not.toThrow('PRIVATE');
  });
  it('replaces network errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('PRIVATE'));
    await expect(createJobDescriptionDraft(request)).rejects.toThrow('Unable to reach Pathfinder');
  });
});
