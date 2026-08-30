import { Skill, Responsibility } from '../../types/api'

export function commaSeparatedSkills(input: string): Skill[] {
  if (!input || !input.trim()) return [];
  return input
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => ({ name: s }));
}

export function newlineResponsibilities(input: string): Responsibility[] {
  if (!input || !input.trim()) return [];
  return input
    .split('\n')
    .map((r) => r.trim())
    .filter((r) => r.length > 0)
    .map((r) => ({ description: r }));
}
