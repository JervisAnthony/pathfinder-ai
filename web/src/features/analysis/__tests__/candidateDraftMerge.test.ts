import { describe, expect, it } from 'vitest';
import {
  mergeCandidateCertifications,
  mergeCandidateEducations,
  mergeCandidateExperiences,
  mergeCandidateProjects,
} from '../candidateDraftMerge';
import { candidateDraft } from './candidateDraftFixture';

describe('Candidate Profile draft merge', () => {
  it('keeps existing records first, skips exact duplicates, and retains distinct evidence', () => {
    const experience = { role_title: 'Engineer', company_name: 'Example Systems', duration_months: '60', description: 'Built APIs', skills: 'Python, FastAPI' };
    const distinct = { ...candidateDraft.experience[0], duration_months: 24 };
    expect(mergeCandidateExperiences([experience], [...candidateDraft.experience, distinct])).toEqual([
      experience, { ...experience, duration_months: '24' },
    ]);
    const project = { name: 'Forecasting Platform', description: 'Forecast demand', skills: 'Python' };
    expect(mergeCandidateProjects([project], candidateDraft.projects)).toEqual([project]);
    const certification = { name: 'Cloud Practitioner', issuer: 'Example Institute', description: '' };
    expect(mergeCandidateCertifications([certification], candidateDraft.certifications)).toEqual([certification]);
  });

  it('applies mapped education and leaves null-level rows out', () => {
    expect(mergeCandidateEducations([], candidateDraft.education)).toEqual([{
      level: 'master', field_of_study: 'Data Science', institution: 'Example University', description: '',
    }]);
  });
});
