import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCandidateProfileDraft, createCandidateProfileFileDraft } from './pathfinder';
import { candidateDraft } from '../features/analysis/__tests__/candidateDraftFixture';

afterEach(() => vi.restoreAllMocks());

describe('Candidate Profile draft transport', () => {
  const partialDraft = { skills: ['Python'], experience: [], education: [], projects: [], certifications: [] };

  it.each([candidateDraft, partialDraft])('posts only raw text and accepts full or partial drafts', async (draft) => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(draft));
    expect(await createCandidateProfileDraft({ raw_resume_text: 'PRIVATE SOURCE' })).toEqual(draft);
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith('/api/v1/candidate-profile/draft', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw_resume_text: 'PRIVATE SOURCE' }),
    });
  });

  it.each(['resume.pdf', 'resume.docx'])('posts only selected %s as multipart', async (name) => {
    const file = new File(['synthetic'], name, { type: 'application/octet-stream' });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(candidateDraft));
    expect(await createCandidateProfileFileDraft(file)).toEqual(candidateDraft);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/candidate-profile/file-draft');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toBeUndefined();
    expect(init?.body).toBeInstanceOf(FormData);
    expect((init?.body as FormData).getAll('file')).toEqual([file]);
  });

  it.each([422, 502, 503])('retains safe typed HTTP %s', async (status) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({
      error: { code: 'safe_error', message: 'Safe message', details: null },
    }, { status }));
    await expect(createCandidateProfileDraft({ raw_resume_text: 'source' })).rejects.toMatchObject({ status, code: 'safe_error' });
  });

  it.each([413, 415, 422, 502, 503])('retains safe file HTTP %s', async (status) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({
      error: { code: 'safe_file_error', message: 'Safe message', details: null },
    }, { status }));
    await expect(createCandidateProfileFileDraft(new File(['x'], 'resume.pdf')))
      .rejects.toMatchObject({ status, code: 'safe_file_error' });
  });

  it.each([
    null, {}, { skills: [], experience: [], education: [], projects: [], certifications: [] },
    { ...candidateDraft, preferences: {} }, { ...candidateDraft, name: 'Private' },
    { ...candidateDraft, skills: Array(101).fill('x') },
    { ...candidateDraft, experience: [{ ...candidateDraft.experience[0], duration_months: 0 }] },
    { ...candidateDraft, experience: [{ ...candidateDraft.experience[0], skills: Array(31).fill('x') }] },
    { ...candidateDraft, education: [{ ...candidateDraft.education[0], level: 'invented' }] },
    { ...candidateDraft, experience: [{ ...candidateDraft.experience[0], role_title: ' ' }] },
    { ...candidateDraft, projects: [{ ...candidateDraft.projects[0], name: 7 }] },
    { ...candidateDraft, projects: [{ ...candidateDraft.projects[0], name: ' ' }] },
    { ...candidateDraft, certifications: [{ ...candidateDraft.certifications[0], issuer: 7 }] },
    { ...candidateDraft, certifications: [{ ...candidateDraft.certifications[0], name: ' ' }] },
  ])('rejects malformed or expanded success contracts', async (value) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(value));
    await expect(createCandidateProfileDraft({ raw_resume_text: 'source' })).rejects.toThrow('invalid Candidate Profile draft');
  });

  it.each([
    ['text', () => createCandidateProfileDraft({ raw_resume_text: 'source' })],
    ['file', () => createCandidateProfileFileDraft(new File(['x'], 'resume.pdf'))],
  ] as const)('replaces %s network failures safely', async (_mode, request) => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('PRIVATE'));
    await expect(request()).rejects.toThrow('Unable to reach Pathfinder');
  });
});
