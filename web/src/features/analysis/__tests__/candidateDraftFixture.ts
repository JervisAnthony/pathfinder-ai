import { CandidateProfileDraftResponse } from '../../../types/api';

export const candidateDraft: CandidateProfileDraftResponse = {
  skills: ['Python', 'FastAPI'],
  experience: [{
    role_title: 'Engineer', company_name: 'Example Systems', duration_months: 60,
    description: 'Built APIs', skills: ['Python', 'FastAPI'],
  }],
  education: [
    { level: 'master', field_of_study: 'Data Science', institution: 'Example University', description: null },
    { level: null, field_of_study: null, institution: null, description: 'Unmapped qualification' },
  ],
  projects: [{ name: 'Forecasting Platform', description: 'Forecast demand', skills: ['Python'] }],
  certifications: [{ name: 'Cloud Practitioner', issuer: 'Example Institute', description: null }],
};
