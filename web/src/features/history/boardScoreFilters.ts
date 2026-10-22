export interface BoardScoreFilters {
  min: string;
  max: string;
}

export interface BoardScoreBounds {
  min?: number;
  max?: number;
}

export const emptyBoardScoreFilters = (): BoardScoreFilters => ({ min: '', max: '' });

export function parseBoardScoreFilters(draft: BoardScoreFilters): { bounds: BoardScoreBounds; error?: never } | { error: string; bounds?: never } {
  const bounds: BoardScoreBounds = {};
  for (const field of ['min', 'max'] as const) {
    const value = draft[field].trim();
    if (!value) continue;
    const score = Number(value);
    // Match native decimal/exponent input, excluding JS-only forms such as hex.
    if (!/^-?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)
      || !Number.isFinite(score) || score < 0 || score > 100) {
      return { error: `${field === 'min' ? 'Minimum' : 'Maximum'} match score must be a finite number from 0 to 100.` };
    }
    bounds[field] = score;
  }
  if (bounds.min !== undefined && bounds.max !== undefined && bounds.min > bounds.max) {
    return { error: 'Minimum match score must be no greater than maximum match score.' };
  }
  return { bounds };
}
