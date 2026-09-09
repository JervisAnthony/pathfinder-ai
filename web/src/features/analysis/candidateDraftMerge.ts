import {
  CandidateCertificationDraft,
  CandidateEducationDraft,
  CandidateExperienceDraft,
  CandidateProjectDraft,
  EducationLevel,
} from '../../types/api';
import { mergeSkillText } from './utils';

export interface ExperienceForm {
  role_title: string;
  company_name: string;
  duration_months: string;
  description: string;
  skills: string;
}

export interface EducationForm {
  level: EducationLevel;
  field_of_study: string;
  institution: string;
  description: string;
}

export interface ProjectForm { name: string; description: string; skills: string }
export interface CertificationForm { name: string; issuer: string; description: string }

const clean = (value: string | null) => value?.trim().replace(/\s+/g, ' ') ?? '';
const skillText = (skills: string[]) => mergeSkillText('', skills.map((name) => ({ name })));
const identity = (values: unknown[]) => JSON.stringify(values);

function appendUnique<T>(existing: T[], imported: T[], key: (value: T) => string): T[] {
  const seen = new Set(existing.map(key));
  return [...existing, ...imported.filter((value) => {
    const valueKey = key(value);
    if (seen.has(valueKey)) return false;
    seen.add(valueKey);
    return true;
  })];
}

const experienceKey = (value: ExperienceForm) => identity([
  clean(value.role_title).toLowerCase(), clean(value.company_name).toLowerCase(),
  value.duration_months, clean(value.description).toLowerCase(),
  skillText(value.skills.split(',')).toLowerCase(),
]);

const educationKey = (value: EducationForm) => identity([
  value.level, clean(value.field_of_study).toLowerCase(),
  clean(value.institution).toLowerCase(), clean(value.description).toLowerCase(),
]);

const projectKey = (value: ProjectForm) => identity([
  clean(value.name).toLowerCase(), clean(value.description).toLowerCase(),
  skillText(value.skills.split(',')).toLowerCase(),
]);

const certificationKey = (value: CertificationForm) => identity([
  clean(value.name).toLowerCase(), clean(value.issuer).toLowerCase(),
  clean(value.description).toLowerCase(),
]);

export function mergeCandidateExperiences(
  existing: ExperienceForm[], imported: CandidateExperienceDraft[],
): ExperienceForm[] {
  return appendUnique(existing, imported.map((value) => ({
    role_title: value.role_title,
    company_name: value.company_name ?? '',
    duration_months: value.duration_months === null ? '' : String(value.duration_months),
    description: value.description ?? '',
    skills: skillText(value.skills),
  })), experienceKey);
}

export function mergeCandidateEducations(
  existing: EducationForm[], imported: CandidateEducationDraft[],
): EducationForm[] {
  return appendUnique(existing, imported.filter((value) => value.level !== null).map((value) => ({
    level: value.level as EducationLevel,
    field_of_study: value.field_of_study ?? '',
    institution: value.institution ?? '',
    description: value.description ?? '',
  })), educationKey);
}

export function mergeCandidateProjects(
  existing: ProjectForm[], imported: CandidateProjectDraft[],
): ProjectForm[] {
  return appendUnique(existing, imported.map((value) => ({
    name: value.name, description: value.description ?? '', skills: skillText(value.skills),
  })), projectKey);
}

export function mergeCandidateCertifications(
  existing: CertificationForm[], imported: CandidateCertificationDraft[],
): CertificationForm[] {
  return appendUnique(existing, imported.map((value) => ({
    name: value.name, issuer: value.issuer ?? '', description: value.description ?? '',
  })), certificationKey);
}
