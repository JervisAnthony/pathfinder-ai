import React, { useState } from 'react';
import { AnalysisRequest } from '../../types/api';
import { commaSeparatedSkills, newlineResponsibilities } from './utils';
import './AnalysisForm.css';

interface Props {
  onSubmit: (request: AnalysisRequest) => void;
  isLoading: boolean;
  error: string | null;
}

export function AnalysisForm({ onSubmit, isLoading, error }: Props) {
  // Candidate Form State
  const [candidateSkills, setCandidateSkills] = useState('');
  const [experiences, setExperiences] = useState<Array<{ role_title: string; company_name: string; duration_months: string; description: string; skills: string }>>([]);
  const [educations, setEducations] = useState<Array<{ level: string; field_of_study: string; institution: string; description: string }>>([]);

  // Job Form State
  const [jobTitle, setJobTitle] = useState('');
  const [jobCompanyName, setJobCompanyName] = useState('');
  const [jobResponsibilities, setJobResponsibilities] = useState('');
  const [jobRequiredSkills, setJobRequiredSkills] = useState('');
  const [jobPreferredSkills, setJobPreferredSkills] = useState('');
  const [jobMinYears, setJobMinYears] = useState('');
  const [jobMaxYears, setJobMaxYears] = useState('');
  const [jobEducationLevel, setJobEducationLevel] = useState('');

  const [formError, setFormError] = useState<string | null>(null);

  const handleAddExperience = () => {
    setExperiences([...experiences, { role_title: '', company_name: '', duration_months: '', description: '', skills: '' }]);
  };

  const handleRemoveExperience = (index: number) => {
    setExperiences(experiences.filter((_, i) => i !== index));
  };

  const handleExperienceChange = (index: number, field: string, value: string) => {
    const newExperiences = [...experiences];
    newExperiences[index] = { ...newExperiences[index], [field]: value };
    setExperiences(newExperiences);
  };

  const handleAddEducation = () => {
    setEducations([...educations, { level: 'Bachelor', field_of_study: '', institution: '', description: '' }]);
  };

  const handleRemoveEducation = (index: number) => {
    setEducations(educations.filter((_, i) => i !== index));
  };

  const handleEducationChange = (index: number, field: string, value: string) => {
    const newEducations = [...educations];
    newEducations[index] = { ...newEducations[index], [field]: value };
    setEducations(newEducations);
  };


  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!jobTitle.trim()) {
      setFormError('Job title is required');
      return;
    }

    // Basic validation
    if (jobMinYears && jobMaxYears && parseInt(jobMaxYears) < parseInt(jobMinYears)) {
      setFormError('Maximum years cannot be less than minimum years');
      return;
    }

    if (experiences.some(exp => exp.duration_months && parseInt(exp.duration_months) < 0)) {
        setFormError('Experience duration cannot be negative');
        return;
    }

    const request: AnalysisRequest = {
      include_ai_enrichment: false,
      save_analysis: false,
      candidate_profile: {
        skills: commaSeparatedSkills(candidateSkills),
        experience: experiences.map(exp => ({
          role_title: { title: exp.role_title },
          company_name: exp.company_name,
          duration_months: parseInt(exp.duration_months) || 0,
          description: exp.description,
          skills: commaSeparatedSkills(exp.skills)
        })),
        education: educations.map(edu => ({
          level: edu.level,
          field_of_study: edu.field_of_study,
          institution: edu.institution,
          description: edu.description || undefined
        })),
        projects: [],
        certifications: []
      },
      job_description: {
        title: { title: jobTitle },
        company_info: jobCompanyName ? { name: jobCompanyName } : undefined,
        responsibilities: newlineResponsibilities(jobResponsibilities),
        required_skills: commaSeparatedSkills(jobRequiredSkills),
        preferred_skills: commaSeparatedSkills(jobPreferredSkills),
        experience_requirement: jobMinYears ? {
            minimum_years: parseInt(jobMinYears),
            maximum_years: jobMaxYears ? parseInt(jobMaxYears) : undefined
        } : undefined,
        education_requirement: jobEducationLevel ? {
            level: jobEducationLevel
        } : undefined
      }
    };

    // Ensure we have some evidence
    if (request.candidate_profile.skills.length === 0 && request.candidate_profile.experience.length === 0 && request.candidate_profile.education.length === 0) {
         setFormError('Candidate must contain some meaningful evidence (skills, experience, or education).');
         return;
    }

    onSubmit(request);
  };

  return (
    <form className="analysis-form" onSubmit={handleSubmit}>
      <div className="form-columns">
        <div className="form-column">
          <h2>Candidate Profile</h2>

          <div className="form-group">
            <label htmlFor="candidate-skills">Skills (comma-separated)</label>
            <textarea
              id="candidate-skills"
              value={candidateSkills}
              onChange={(e) => setCandidateSkills(e.target.value)}
              placeholder="Python, React, TypeScript..."
              rows={3}
            />
          </div>

          <fieldset>
            <legend>Work Experience</legend>
            {experiences.map((exp, index) => (
              <div key={index} className="experience-item">
                <div className="form-group">
                  <label htmlFor={`exp-role-${index}`}>Role Title</label>
                  <input
                    id={`exp-role-${index}`}
                    type="text"
                    value={exp.role_title}
                    onChange={(e) => handleExperienceChange(index, 'role_title', e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor={`exp-company-${index}`}>Company</label>
                  <input
                    id={`exp-company-${index}`}
                    type="text"
                    value={exp.company_name}
                    onChange={(e) => handleExperienceChange(index, 'company_name', e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor={`exp-duration-${index}`}>Duration (months)</label>
                  <input
                    id={`exp-duration-${index}`}
                    type="number"
                    min="0"
                    value={exp.duration_months}
                    onChange={(e) => handleExperienceChange(index, 'duration_months', e.target.value)}
                    required
                  />
                </div>
                 <div className="form-group">
                  <label htmlFor={`exp-desc-${index}`}>Description</label>
                  <textarea
                    id={`exp-desc-${index}`}
                    value={exp.description}
                    onChange={(e) => handleExperienceChange(index, 'description', e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor={`exp-skills-${index}`}>Skills (comma-separated)</label>
                  <input
                    id={`exp-skills-${index}`}
                    type="text"
                    value={exp.skills}
                    onChange={(e) => handleExperienceChange(index, 'skills', e.target.value)}
                  />
                </div>
                <button type="button" onClick={() => handleRemoveExperience(index)} className="remove-btn">
                  Remove Experience
                </button>
              </div>
            ))}
            <button type="button" onClick={handleAddExperience} className="add-btn">Add Experience</button>
          </fieldset>

           <fieldset>
            <legend>Education</legend>
            {educations.map((edu, index) => (
              <div key={index} className="education-item">
                <div className="form-group">
                  <label htmlFor={`edu-level-${index}`}>Level</label>
                  <select
                    id={`edu-level-${index}`}
                    value={edu.level}
                    onChange={(e) => handleEducationChange(index, 'level', e.target.value)}
                  >
                     <option value="High School">High School</option>
                     <option value="Associate">Associate</option>
                     <option value="Bachelor">Bachelor</option>
                     <option value="Master">Master</option>
                     <option value="Doctorate">Doctorate</option>
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor={`edu-field-${index}`}>Field of Study</label>
                  <input
                    id={`edu-field-${index}`}
                    type="text"
                    value={edu.field_of_study}
                    onChange={(e) => handleEducationChange(index, 'field_of_study', e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor={`edu-inst-${index}`}>Institution</label>
                  <input
                    id={`edu-inst-${index}`}
                    type="text"
                    value={edu.institution}
                    onChange={(e) => handleEducationChange(index, 'institution', e.target.value)}
                    required
                  />
                </div>
                <button type="button" onClick={() => handleRemoveEducation(index)} className="remove-btn">
                  Remove Education
                </button>
              </div>
            ))}
            <button type="button" onClick={handleAddEducation} className="add-btn">Add Education</button>
          </fieldset>
        </div>

        <div className="form-column">
          <h2>Target Job</h2>

          <div className="form-group">
            <label htmlFor="job-title">Job Title</label>
            <input
              id="job-title"
              type="text"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="job-company">Company (Optional)</label>
            <input
              id="job-company"
              type="text"
              value={jobCompanyName}
              onChange={(e) => setJobCompanyName(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="job-req-skills">Required Skills (comma-separated)</label>
            <textarea
              id="job-req-skills"
              value={jobRequiredSkills}
              onChange={(e) => setJobRequiredSkills(e.target.value)}
              rows={3}
            />
          </div>

          <div className="form-group">
            <label htmlFor="job-pref-skills">Preferred Skills (comma-separated)</label>
            <textarea
              id="job-pref-skills"
              value={jobPreferredSkills}
              onChange={(e) => setJobPreferredSkills(e.target.value)}
              rows={2}
            />
          </div>

          <div className="form-group">
            <label htmlFor="job-responsibilities">Responsibilities (newline-separated)</label>
            <textarea
              id="job-responsibilities"
              value={jobResponsibilities}
              onChange={(e) => setJobResponsibilities(e.target.value)}
              rows={4}
            />
          </div>

          <fieldset>
             <legend>Experience Requirement (Optional)</legend>
             <div className="form-group-inline">
                 <div className="form-group">
                    <label htmlFor="job-min-years">Minimum Years</label>
                    <input
                      id="job-min-years"
                      type="number"
                      min="0"
                      value={jobMinYears}
                      onChange={(e) => setJobMinYears(e.target.value)}
                    />
                 </div>
                  <div className="form-group">
                    <label htmlFor="job-max-years">Maximum Years</label>
                    <input
                      id="job-max-years"
                      type="number"
                      min="0"
                      value={jobMaxYears}
                      onChange={(e) => setJobMaxYears(e.target.value)}
                    />
                 </div>
             </div>
          </fieldset>

           <div className="form-group">
             <label htmlFor="job-edu-level">Education Requirement (Optional)</label>
             <select
               id="job-edu-level"
               value={jobEducationLevel}
               onChange={(e) => setJobEducationLevel(e.target.value)}
             >
                <option value="">None</option>
                <option value="High School">High School</option>
                <option value="Associate">Associate</option>
                <option value="Bachelor">Bachelor</option>
                <option value="Master">Master</option>
                <option value="Doctorate">Doctorate</option>
             </select>
           </div>
        </div>
      </div>

      <div className="form-actions" aria-live="polite">
        {(error || formError) && (
          <div className="error-message">
            {formError || error}
          </div>
        )}
        <button
          type="submit"
          disabled={isLoading}
          className="submit-btn"
        >
          {isLoading ? 'Analyzing...' : 'Analyze Match'}
        </button>
      </div>
    </form>
  );
}
