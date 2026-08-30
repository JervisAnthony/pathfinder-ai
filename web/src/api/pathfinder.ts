import { AnalysisRequest, AnalysisResponse, ApiErrorDetail } from '../types/api'

export class ApiError extends Error {
  public details?: unknown;
  public status?: number;

  constructor(message: string, status?: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
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

      if (errorDataObj?.detail) {
        if (typeof errorDataObj.detail === 'string') {
           errorMessage = errorDataObj.detail;
        } else if (Array.isArray(errorDataObj.detail)) {
            // It's a FastAPI validation error
            const errors = errorDataObj.detail as ApiErrorDetail[];
            const msgs = errors.map(err => {
                 const path = err.loc.filter(l => l !== 'body').join('.');
                 return path ? `${path}: ${err.msg}` : err.msg;
            });
            errorMessage = `Validation Error: ${msgs.join(', ')}`;
        }
      }

      throw new ApiError(errorMessage, response.status, errorDataObj?.detail);
    }

    return await response.json();
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError('Network error or unable to parse response');
  }
}
