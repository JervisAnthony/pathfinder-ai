import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, importResumeFileSkills } from './pathfinder';

const fetchMock = vi.fn();
const file = new File(['synthetic'], 'resume.pdf', { type: 'application/pdf' });
const result = { matched_required_skills: [{ name: 'python' }], matched_preferred_skills: [], unmatched_required_skills: [], unmatched_preferred_skills: [] };

describe('resume file client', () => {
  beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock); });

  it('sends repeated multipart values with a browser-generated boundary and reuses the result type', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => result });
    expect(await importResumeFileSkills(file, ['Python', 'FastAPI'], ['Docker', 'C++'])).toEqual(result);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/resume/file-skill-import');
    expect(init.method).toBe('POST');
    expect(init.headers).toBeUndefined();
    expect(init.body).toBeInstanceOf(FormData);
    expect(init.body.getAll('file')).toEqual([file]);
    expect(init.body.getAll('required_skills')).toEqual(['Python', 'FastAPI']);
    expect(init.body.getAll('preferred_skills')).toEqual(['Docker', 'C++']);
  });

  it.each([413, 415, 422])('retains typed errors for HTTP %s', async (status) => {
    fetchMock.mockResolvedValue({ ok: false, status, json: async () => ({ error: { code: 'safe_code', message: 'Safe error.', details: null } }) });
    await expect(importResumeFileSkills(file, [], ['Python'])).rejects.toMatchObject({ status, code: 'safe_code', message: 'Safe error.' });
  });

  it('replaces malformed structured errors', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 422, json: async () => ({ error: { message: 'private' } }) });
    await expect(importResumeFileSkills(file, ['Python'], [])).rejects.toThrow('Pathfinder returned an invalid error response.');
  });

  it('replaces non-JSON failures', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => { throw new Error('private'); } });
    await expect(importResumeFileSkills(file, ['Python'], [])).rejects.toThrow('Pathfinder returned an unreadable error response.');
  });

  it('replaces network failures', async () => {
    fetchMock.mockRejectedValue(new Error('private'));
    await expect(importResumeFileSkills(file, ['Python'], [])).rejects.toEqual(new ApiError('Unable to reach Pathfinder. Check your connection and try again.'));
  });
});
