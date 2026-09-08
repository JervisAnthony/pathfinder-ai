import { JobDescriptionDraftResponse } from '../../../types/api';

export const jobDraft: JobDescriptionDraftResponse = {
  title: 'Senior Backend Engineer', company_name: 'Example Company', company_industry: 'Software', company_location: 'Bengaluru',
  responsibilities: ['Build APIs', 'Own reliability'], required_skills: ['Python', 'FastAPI'], preferred_skills: ['Docker', 'Python'],
  unclassified_skills: ['Kubernetes'], minimum_years: 5, maximum_years: 7, education_level: 'bachelor',
  education_field_of_study: 'CS', education_description: 'Explicit degree',
};

export const partialDraft: JobDescriptionDraftResponse = {
  title: null, company_name: null, company_industry: null, company_location: null,
  responsibilities: [], required_skills: [], preferred_skills: [], unclassified_skills: ['K8s'],
  minimum_years: null, maximum_years: null, education_level: null, education_field_of_study: null, education_description: null,
};
