import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCapabilities } from './pathfinder';

afterEach(() => vi.restoreAllMocks());

describe('capabilities client', () => {
  it.each([[false, false, false], [false, false, true], [false, true, false], [false, true, true], [true, false, false], [true, false, true], [true, true, false], [true, true, true]])('reads independent configuration flags: AI %s import %s persistence %s', async (ai, jobImport, persistence) => {
    const capabilities = { ai_enrichment_available: ai, job_description_import_available: jobImport, persistence_available: persistence };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(capabilities));
    expect(await getCapabilities()).toEqual(capabilities);
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith('/api/v1/capabilities', undefined);
  });

  it('rejects missing or non-boolean job-import availability', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    for (const jobImport of [undefined, 'true']) {
      fetchMock.mockResolvedValue(Response.json({ ai_enrichment_available: true, persistence_available: true, job_description_import_available: jobImport }));
      await expect(getCapabilities()).rejects.toThrow('invalid capabilities');
    }
  });

  it.each([null, {}, [], { ai_enrichment_available: 'true', persistence_available: false }, { ai_enrichment_available: true }, { ai_enrichment_available: true, persistence_available: 'false' }])('rejects malformed success %j', async (value) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(value));
    await expect(getCapabilities()).rejects.toThrow('Pathfinder returned an invalid capabilities response.');
  });

  it('retains safe typed failures', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ error: { code: 'unavailable', message: 'Unavailable.', details: null } }, { status: 503 }));
    await expect(getCapabilities()).rejects.toMatchObject({ code: 'unavailable', status: 503 });
  });

  it('replaces malformed errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ private: 'detail' }, { status: 500 }));
    await expect(getCapabilities()).rejects.toThrow('Pathfinder returned an invalid error response.');
  });

  it('replaces non-JSON errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('private', { status: 500 }));
    await expect(getCapabilities()).rejects.toThrow('Pathfinder returned an unreadable error response.');
  });

  it('replaces network failures', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('private'));
    await expect(getCapabilities()).rejects.toThrow('Unable to reach Pathfinder.');
  });
});
