import {
  AnalysisRequest,
  AnalysisResponse,
  ApiErrorDetail,
  ApiErrorResponse,
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

export async function analyzeCandidateJob(request: AnalysisRequest): Promise<AnalysisResponse> {
  try {
    const response = await fetch('/api/v1/analysis', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
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

    return await response.json();
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError('Unable to reach Pathfinder. Check your connection and try again.');
  }
}
