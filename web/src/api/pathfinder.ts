import {
  AnalysisRequest,
  AnalysisHistoryResponse,
  AnalysisResponse,
  ApiErrorDetail,
  ApiErrorResponse,
  SavedAnalysisDetail,
  ResumeSkillImportRequest,
  ResumeSkillImportResponse,
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

export function getAnalysisHistory(
  limit = 20,
  offset = 0,
): Promise<AnalysisHistoryResponse> {
  const query = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  return requestJson(`/api/v1/analyses?${query.toString()}`);
}

export function getSavedAnalysis(analysisId: string): Promise<SavedAnalysisDetail> {
  return requestJson(`/api/v1/analyses/${encodeURIComponent(analysisId)}`);
}
