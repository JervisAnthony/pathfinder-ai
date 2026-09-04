import { Skill, Responsibility } from '../../types/api'

export function commaSeparatedSkills(input: string): Skill[] {
  if (!input || !input.trim()) return [];
  return input
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => ({ name: s }));
}

export function mergeSkillText(input: string, importedSkills: Skill[]): string {
  const merged = [...commaSeparatedSkills(input), ...importedSkills];
  const seen = new Set<string>();
  return merged
    .filter((skill) => {
      const canonical = skill.name.trim().replace(/\s+/g, ' ').toLowerCase();
      if (!canonical || seen.has(canonical)) return false;
      seen.add(canonical);
      return true;
    })
    .map((skill) => skill.name.trim().replace(/\s+/g, ' '))
    .join(', ');
}

export function newlineResponsibilities(input: string): Responsibility[] {
  if (!input || !input.trim()) return [];
  return input
    .split('\n')
    .map((r) => r.trim())
    .filter((r) => r.length > 0)
    .map((r) => ({ description: r }));
}
