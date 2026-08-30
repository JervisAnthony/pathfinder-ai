import { AnalysisRequest, AnalysisResponse, ApiErrorResponse } from '../types/api'

export class ApiError extends Error {
  public details?: unknown;
  public status?: number;
  public code?: string;

  constructor(message: string, status?: number, details?: unknown, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
    this.code = code;
  }
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
      let errorData: unknown = null;
      try {
        errorData = await response.json();
      } catch {
        throw new ApiError(`Server error: ${response.status} ${response.statusText}`, response.status);
      }

      const errorDataObj = errorData as Record<string, unknown>;
      let errorMessage = `Request failed with status ${response.status}`;
      let details: unknown = null;
      let code: string | undefined;

      // Handle standard FastAPI 422 errors (fallback)
      if (errorDataObj?.detail && Array.isArray(errorDataObj.detail)) {
            const errors = errorDataObj.detail as { loc: string[], msg: string }[];
            const msgs = errors.map(err => {
                 const path = err.loc.filter(l => l !== 'body').join('.');
                 return path ? `${path}: ${err.msg}` : err.msg;
            });
            errorMessage = `Validation Error: ${msgs.join(', ')}`;
            details = errorDataObj.detail;
      }
      // Handle custom Pathfinder ApiErrorResponse format
      else if (errorDataObj?.error && typeof errorDataObj.error === 'object') {
          const apiError = errorDataObj as unknown as ApiErrorResponse;
          errorMessage = apiError.error.message;
          details = apiError.error.details;
          code = apiError.error.code;

          if (apiError.error.details && apiError.error.details.length > 0) {
              const msgs = apiError.error.details.map(err => {
                 const path = err.loc.filter(l => l !== 'body').join('.');
                 return path ? `${path}: ${err.msg}` : err.msg;
              });
              errorMessage += ` (${msgs.join(', ')})`;
          }
      } else if (errorDataObj?.detail && typeof errorDataObj.detail === 'string') {
          errorMessage = errorDataObj.detail;
      }

      throw new ApiError(errorMessage, response.status, details, code);
    }

    return await response.json();
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError('Network error or unable to parse response');
  }
}
