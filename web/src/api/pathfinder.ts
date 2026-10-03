import {
  AnalysisRequest,
  AnalysisHistoryResponse,
  AnalysisResponse,
  ApiErrorDetail,
  ApiErrorResponse,
  SavedAnalysisDetail,
  SavedAnalysisComparison,
  ResumeSkillImportRequest,
  ResumeSkillImportResponse,
  PathfinderCapabilities,
  JobDescriptionDraftRequest,
  JobDescriptionDraftResponse,
  CandidateProfileDraftResponse,
  CandidateProfileDraftRequest,
  ApplicationStatus,
  AnalysisTracking,
  AnalysisNote,
  AnalysisFollowUp,
  ApplicationStatusHistoryResponse,
} from '../types/api'

export class ApiError extends Error {
  public readonly status?: number;
  public readonly code?: string;
  public readonly details: ApiErrorDetail[] | null;

  constructor(
    message: string,
    status?: number,
    code?: string,
    details: ApiErrorDetail[] | null = null,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function isErrorDetail(value: unknown): value is ApiErrorDetail {
  if (typeof value !== 'object' || value === null) return false;
  const detail = value as { loc?: unknown; msg?: unknown; type?: unknown };
  return Array.isArray(detail.loc)
    && detail.loc.every((part) => typeof part === 'string' || typeof part === 'number')
    && typeof detail.msg === 'string'
    && typeof detail.type === 'string';
}

function isApiErrorResponse(value: unknown): value is ApiErrorResponse {
  if (typeof value !== 'object' || value === null || !('error' in value)) return false;
  const envelope = value as { error?: unknown };
  if (typeof envelope.error !== 'object' || envelope.error === null) return false;
  const error = envelope.error as { code?: unknown; message?: unknown; details?: unknown };
  return typeof error.code === 'string'
    && typeof error.message === 'string'
    && (error.details === null
      || (Array.isArray(error.details) && error.details.every(isErrorDetail)));
}

async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  try {
    const response = await fetch(input, init);

    if (!response.ok) {
      let errorData: unknown;
      try {
        errorData = await response.json();
      } catch {
        throw new ApiError('Pathfinder returned an unreadable error response.', response.status);
      }

      if (!isApiErrorResponse(errorData)) {
        throw new ApiError('Pathfinder returned an invalid error response.', response.status);
      }

      const { code, message, details } = errorData.error;
      throw new ApiError(message, response.status, code, details);
    }

    return await response.json() as T;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError('Unable to reach Pathfinder. Check your connection and try again.');
  }
}

export function analyzeCandidateJob(request: AnalysisRequest): Promise<AnalysisResponse> {
  return requestJson('/api/v1/analysis', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });
}

export async function getCapabilities(): Promise<PathfinderCapabilities> {
  const value = await requestJson<unknown>('/api/v1/capabilities');
  if (typeof value !== 'object' || value === null
    || !('ai_enrichment_available' in value) || typeof value.ai_enrichment_available !== 'boolean'
    || !('job_description_import_available' in value) || typeof value.job_description_import_available !== 'boolean'
    || !('candidate_profile_import_available' in value) || typeof value.candidate_profile_import_available !== 'boolean'
    || !('persistence_available' in value) || typeof value.persistence_available !== 'boolean') {
    throw new ApiError('Pathfinder returned an invalid capabilities response.');
  }
  return {
    ai_enrichment_available: value.ai_enrichment_available,
    job_description_import_available: value.job_description_import_available,
    candidate_profile_import_available: value.candidate_profile_import_available,
    persistence_available: value.persistence_available,
  };
}

const educationLevels = ['high_school', 'associate', 'bachelor', 'master', 'doctorate', 'other'];

function exactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => key in value);
}

function nullableString(value: unknown): boolean {
  return value === null || typeof value === 'string';
}

function stringList(value: unknown, limit: number): value is string[] {
  return Array.isArray(value) && value.length <= limit
    && value.every((item) => typeof item === 'string');
}

function isCandidateProfileDraft(value: unknown): value is CandidateProfileDraftResponse {
  if (typeof value !== 'object' || value === null) return false;
  const draft = value as Record<string, unknown>;
  if (!exactKeys(draft, ['skills', 'experience', 'education', 'projects', 'certifications'])
    || !stringList(draft.skills, 100)
    || !Array.isArray(draft.experience) || draft.experience.length > 20
    || !Array.isArray(draft.education) || draft.education.length > 10
    || !Array.isArray(draft.projects) || draft.projects.length > 20
    || !Array.isArray(draft.certifications) || draft.certifications.length > 20
    || !(draft.skills.length || draft.experience.length || draft.education.length
      || draft.projects.length || draft.certifications.length)) return false;
  return draft.experience.every((item: unknown) => {
    if (typeof item !== 'object' || item === null) return false;
    const entry = item as Record<string, unknown>;
    return exactKeys(entry, ['role_title', 'company_name', 'duration_months', 'description', 'skills'])
      && typeof entry.role_title === 'string' && Boolean(entry.role_title.trim())
      && nullableString(entry.company_name)
      && nullableString(entry.description) && stringList(entry.skills, 30)
      && (entry.duration_months === null || (typeof entry.duration_months === 'number'
        && Number.isInteger(entry.duration_months) && entry.duration_months > 0));
  }) && draft.education.every((item: unknown) => {
    if (typeof item !== 'object' || item === null) return false;
    const entry = item as Record<string, unknown>;
    return exactKeys(entry, ['level', 'field_of_study', 'institution', 'description'])
      && (entry.level === null || educationLevels.includes(entry.level as string))
      && nullableString(entry.field_of_study) && nullableString(entry.institution)
      && nullableString(entry.description);
  }) && draft.projects.every((item: unknown) => {
    if (typeof item !== 'object' || item === null) return false;
    const entry = item as Record<string, unknown>;
    return exactKeys(entry, ['name', 'description', 'skills'])
      && typeof entry.name === 'string' && Boolean(entry.name.trim())
      && nullableString(entry.description)
      && stringList(entry.skills, 30);
  }) && draft.certifications.every((item: unknown) => {
    if (typeof item !== 'object' || item === null) return false;
    const entry = item as Record<string, unknown>;
    return exactKeys(entry, ['name', 'issuer', 'description'])
      && typeof entry.name === 'string' && Boolean(entry.name.trim())
      && nullableString(entry.issuer)
      && nullableString(entry.description);
  });
}

async function candidateDraftRequest(input: RequestInfo | URL, init: RequestInit): Promise<CandidateProfileDraftResponse> {
  const value = await requestJson<unknown>(input, init);
  if (!isCandidateProfileDraft(value)) {
    throw new ApiError('Pathfinder returned an invalid Candidate Profile draft.');
  }
  return value;
}

export function createCandidateProfileDraft(request: CandidateProfileDraftRequest): Promise<CandidateProfileDraftResponse> {
  return candidateDraftRequest('/api/v1/candidate-profile/draft', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
}

export function createCandidateProfileFileDraft(file: File): Promise<CandidateProfileDraftResponse> {
  const body = new FormData();
  body.append('file', file);
  return candidateDraftRequest('/api/v1/candidate-profile/file-draft', { method: 'POST', body });
}

export async function createJobDescriptionDraft(request: JobDescriptionDraftRequest): Promise<JobDescriptionDraftResponse> {
  const value = await requestJson<unknown>('/api/v1/job-description/draft', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request),
  });
  if (!isJobDescriptionDraft(value)) throw new ApiError('Pathfinder returned an invalid job draft.');
  return value;
}

function isJobDescriptionDraft(value: unknown): value is JobDescriptionDraftResponse {
  if (typeof value !== 'object' || value === null) return false;
  const draft = value as Record<string, unknown>;
  const strings = ['title', 'company_name', 'company_industry', 'company_location', 'education_field_of_study', 'education_description'];
  const lists = ['responsibilities', 'required_skills', 'preferred_skills', 'unclassified_skills'];
  const numbers = ['minimum_years', 'maximum_years'];
  const keys = [...strings, ...lists, ...numbers, 'education_level'];
  return Object.keys(draft).length === keys.length && keys.every((key) => key in draft)
    && strings.every((key) => draft[key] === null || typeof draft[key] === 'string')
    && lists.every((key) => Array.isArray(draft[key]) && draft[key].length <= (key === 'responsibilities' ? 30 : 50)
      && draft[key].every((item: unknown) => typeof item === 'string'))
    && numbers.every((key) => draft[key] === null || (typeof draft[key] === 'number' && Number.isInteger(draft[key]) && draft[key] >= 0))
    && (draft.minimum_years === null || draft.maximum_years === null || (draft.maximum_years as number) >= (draft.minimum_years as number))
    && (draft.education_level === null || ['high_school', 'associate', 'bachelor', 'master', 'doctorate', 'other'].includes(draft.education_level as string));
}

export function importResumeSkills(
  request: ResumeSkillImportRequest,
): Promise<ResumeSkillImportResponse> {
  return requestJson('/api/v1/resume/skill-import', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });
}

export function importResumeFileSkills(
  file: File,
  requiredSkills: string[],
  preferredSkills: string[],
): Promise<ResumeSkillImportResponse> {
  const body = new FormData();
  body.append('file', file);
  requiredSkills.forEach((skill) => body.append('required_skills', skill));
  preferredSkills.forEach((skill) => body.append('preferred_skills', skill));
  return requestJson('/api/v1/resume/file-skill-import', { method: 'POST', body });
}

export interface AnalysisHistoryFilters {
  query?: string;
  ai_enriched?: boolean;
  min_score?: number;
  max_score?: number;
  application_status?: ApplicationStatus;
}

export function getAnalysisHistory(
  limit = 20,
  offset = 0,
  filters: AnalysisHistoryFilters = {},
): Promise<AnalysisHistoryResponse> {
  const query = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  if (filters.query) query.set('query', filters.query);
  if (filters.ai_enriched !== undefined) query.set('ai_enriched', String(filters.ai_enriched));
  if (filters.min_score !== undefined) query.set('min_score', String(filters.min_score));
  if (filters.max_score !== undefined) query.set('max_score', String(filters.max_score));
  if (filters.application_status !== undefined) query.set('application_status', filters.application_status);
  return requestJson(`/api/v1/analyses?${query.toString()}`);
}

export function getSavedAnalysis(analysisId: string): Promise<SavedAnalysisDetail> {
  return requestJson(`/api/v1/analyses/${encodeURIComponent(analysisId)}`);
}

export function getAnalysisTracking(analysisId: string): Promise<AnalysisTracking> {
  return requestJson(`/api/v1/analyses/${encodeURIComponent(analysisId)}/tracking`, { cache: 'no-store' });
}

export function getAnalysisNote(analysisId: string): Promise<AnalysisNote> {
  return requestJson(`/api/v1/analyses/${encodeURIComponent(analysisId)}/note`, { method: 'GET', cache: 'no-store' });
}

export function updateAnalysisNote(analysisId: string, content: string): Promise<AnalysisNote> {
  return requestJson(`/api/v1/analyses/${encodeURIComponent(analysisId)}/note`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
    cache: 'no-store',
  });
}

export async function clearAnalysisNote(analysisId: string): Promise<void> {
  try {
    const response = await fetch(`/api/v1/analyses/${encodeURIComponent(analysisId)}/note`, {
      method: 'DELETE', cache: 'no-store',
    });
    if (!response.ok) {
      let errorData: unknown;
      try {
        errorData = await response.json();
      } catch {
        throw new ApiError('Pathfinder returned an unreadable error response.', response.status);
      }
      if (!isApiErrorResponse(errorData)) {
        throw new ApiError('Pathfinder returned an invalid error response.', response.status);
      }
      const { code, message, details } = errorData.error;
      throw new ApiError(message, response.status, code, details);
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError('Unable to reach Pathfinder. Check your connection and try again.');
  }
}

export function getAnalysisFollowUp(analysisId: string): Promise<AnalysisFollowUp> {
  return requestJson(`/api/v1/analyses/${encodeURIComponent(analysisId)}/follow-up`, { method: 'GET', cache: 'no-store' });
}

export function updateAnalysisFollowUp(analysisId: string, followUpOn: string): Promise<AnalysisFollowUp> {
  return requestJson(`/api/v1/analyses/${encodeURIComponent(analysisId)}/follow-up`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ follow_up_on: followUpOn }),
    cache: 'no-store',
  });
}

export async function clearAnalysisFollowUp(analysisId: string): Promise<void> {
  try {
    const response = await fetch(`/api/v1/analyses/${encodeURIComponent(analysisId)}/follow-up`, {
      method: 'DELETE', cache: 'no-store',
    });
    if (!response.ok) {
      let errorData: unknown;
      try {
        errorData = await response.json();
      } catch {
        throw new ApiError('Pathfinder returned an unreadable error response.', response.status);
      }
      if (!isApiErrorResponse(errorData)) {
        throw new ApiError('Pathfinder returned an invalid error response.', response.status);
      }
      const { code, message, details } = errorData.error;
      throw new ApiError(message, response.status, code, details);
    }
    if (response.status !== 204) {
      throw new ApiError('Pathfinder returned an unexpected clear response.', response.status);
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError('Unable to reach Pathfinder. Check your connection and try again.');
  }
}

export function getAnalysisTrackingHistory(analysisId: string, limit = 20, offset = 0): Promise<ApplicationStatusHistoryResponse> {
  const query = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  return requestJson(`/api/v1/analyses/${encodeURIComponent(analysisId)}/tracking/history?${query.toString()}`, { cache: 'no-store' });
}

export function updateAnalysisTracking(analysisId: string, applicationStatus: ApplicationStatus): Promise<AnalysisTracking> {
  return requestJson(`/api/v1/analyses/${encodeURIComponent(analysisId)}/tracking`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ application_status: applicationStatus }),
    cache: 'no-store',
  });
}

export function compareSavedAnalyses(leftAnalysisId: string, rightAnalysisId: string): Promise<SavedAnalysisComparison> {
  const query = new URLSearchParams({ left_analysis_id: leftAnalysisId, right_analysis_id: rightAnalysisId });
  return requestJson(`/api/v1/analyses/compare?${query.toString()}`, { method: 'GET', cache: 'no-store' });
}

export type SavedAnalysisExportFormat = 'json' | 'markdown';

export async function downloadSavedAnalysis(
  analysisId: string,
  format: SavedAnalysisExportFormat,
): Promise<Blob> {
  try {
    const response = await fetch(
      `/api/v1/analyses/${encodeURIComponent(analysisId)}/export?format=${format}`,
      { method: 'GET', cache: 'no-store' },
    );
    if (!response.ok) {
      let errorData: unknown;
      try {
        errorData = await response.json();
      } catch {
        throw new ApiError('Pathfinder returned an unreadable error response.', response.status);
      }
      if (!isApiErrorResponse(errorData)) {
        throw new ApiError('Pathfinder returned an invalid error response.', response.status);
      }
      const { code, message, details } = errorData.error;
      throw new ApiError(message, response.status, code, details);
    }
    return await response.blob();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError('Unable to reach Pathfinder. Check your connection and try again.');
  }
}

export async function deleteSavedAnalysis(analysisId: string): Promise<void> {
  try {
    const response = await fetch(`/api/v1/analyses/${encodeURIComponent(analysisId)}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      let errorData: unknown;
      try {
        errorData = await response.json();
      } catch {
        throw new ApiError('Pathfinder returned an unreadable error response.', response.status);
      }

      if (!isApiErrorResponse(errorData)) {
        throw new ApiError('Pathfinder returned an invalid error response.', response.status);
      }

      const { code, message, details } = errorData.error;
      throw new ApiError(message, response.status, code, details);
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError('Unable to reach Pathfinder. Check your connection and try again.');
  }
}
