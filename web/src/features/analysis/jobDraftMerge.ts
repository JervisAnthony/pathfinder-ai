import { JobDescriptionDraftResponse } from '../../types/api';

export const canonicalDraftText = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();

export function mergeDraftEntries(existing: string[], imported: string[]): string[] {
  const seen = new Set<string>();
  return [...existing, ...imported].filter((value) => {
    const key = canonicalDraftText(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((value) => value.trim());
}

export function mergeDraftSkills(required: string, preferred: string, draft: JobDescriptionDraftResponse) {
  const requiredValues = mergeDraftEntries(required.split(','), draft.required_skills);
  const requiredKeys = new Set(requiredValues.map(canonicalDraftText));
  const preferredValues = mergeDraftEntries(preferred.split(','), draft.preferred_skills)
    .filter((value) => !requiredKeys.has(canonicalDraftText(value)));
  return { required: requiredValues.join(', '), preferred: preferredValues.join(', ') };
}
