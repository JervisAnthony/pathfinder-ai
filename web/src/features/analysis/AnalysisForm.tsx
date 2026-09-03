import React, { useState } from 'react';
import { AnalysisRequest, EducationLevel, WorkMode } from '../../types/api';
import { commaSeparatedSkills, newlineResponsibilities } from './utils';
import './AnalysisForm.css';

interface Props {
  onSubmit: (request: AnalysisRequest) => void;
  isLoading: boolean;
  error: string | null;
}

interface ExperienceForm { role_title: string; company_name: string; duration_months: string; description: string; skills: string }
interface EducationForm { level: EducationLevel; field_of_study: string; institution: string; description: string }
interface ProjectForm { name: string; description: string; skills: string }
interface CertificationForm { name: string; issuer: string; description: string }

const educationLevels: Array<{ value: EducationLevel; label: string }> = [
  { value: 'high_school', label: 'High School' },
  { value: 'associate', label: 'Associate' },
  { value: 'bachelor', label: 'Bachelor' },
  { value: 'master', label: 'Master' },
  { value: 'doctorate', label: 'Doctorate' },
  { value: 'other', label: 'Other' },
];

const workModes: Array<{ value: WorkMode; label: string }> = [
  { value: 'remote', label: 'Remote' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'onsite', label: 'On-site' },
];

function optionalText(value: string): string | undefined {
  return value.trim() || undefined;
}

function separatedText(value: string): string[] {
  return value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean);
}

export function AnalysisForm({ onSubmit, isLoading, error }: Props) {
  const [candidateSkills, setCandidateSkills] = useState('');
  const [experiences, setExperiences] = useState<ExperienceForm[]>([]);
  const [educations, setEducations] = useState<EducationForm[]>([]);
  const [projects, setProjects] = useState<ProjectForm[]>([]);
  const [certifications, setCertifications] = useState<CertificationForm[]>([]);
  const [targetTitles, setTargetTitles] = useState('');
  const [preferredLocations, setPreferredLocations] = useState('');
  const [acceptableWorkModes, setAcceptableWorkModes] = useState<WorkMode[]>([]);

  const [jobTitle, setJobTitle] = useState('');
  const [jobCompanyName, setJobCompanyName] = useState('');
  const [jobCompanyIndustry, setJobCompanyIndustry] = useState('');
  const [jobCompanyLocation, setJobCompanyLocation] = useState('');
  const [jobResponsibilities, setJobResponsibilities] = useState('');
  const [jobRequiredSkills, setJobRequiredSkills] = useState('');
  const [jobPreferredSkills, setJobPreferredSkills] = useState('');
  const [jobMinYears, setJobMinYears] = useState('');
  const [jobMaxYears, setJobMaxYears] = useState('');
  const [jobEducationLevel, setJobEducationLevel] = useState<EducationLevel | ''>('');
  const [jobEducationField, setJobEducationField] = useState('');
  const [jobEducationDescription, setJobEducationDescription] = useState('');
  const [saveAnalysis, setSaveAnalysis] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const updateItem = <T,>(items: T[], setItems: React.Dispatch<React.SetStateAction<T[]>>, index: number, update: Partial<T>) => {
    setItems(items.map((item, itemIndex) => itemIndex === index ? { ...item, ...update } : item));
  };

  const toggleWorkMode = (mode: WorkMode) => {
    setAcceptableWorkModes((current) => current.includes(mode)
      ? current.filter((value) => value !== mode)
      : [...current, mode]);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (isLoading) return;
    setFormError(null);

    if (!jobTitle.trim()) {
      setFormError('Job title is required');
      return;
    }
    if (jobMinYears && jobMaxYears && Number(jobMaxYears) < Number(jobMinYears)) {
      setFormError('Maximum years cannot be less than minimum years');
      return;
    }
    if (experiences.some((experience) => experience.duration_months !== '' && Number(experience.duration_months) < 1)) {
      setFormError('Experience duration must be at least 1 month when supplied');
      return;
    }

    const targetTitleValues = separatedText(targetTitles);
    const locationValues = separatedText(preferredLocations);
    const hasPreferences = targetTitleValues.length > 0 || locationValues.length > 0 || acceptableWorkModes.length > 0;
    const hasCompany = Boolean(jobCompanyName.trim());
    const hasExperienceRequirement = jobMinYears !== '' || jobMaxYears !== '';
    const hasEducationRequirement = Boolean(jobEducationLevel || jobEducationField.trim() || jobEducationDescription.trim());

    const request: AnalysisRequest = {
      include_ai_enrichment: false,
      save_analysis: saveAnalysis,
      candidate_profile: {
        skills: commaSeparatedSkills(candidateSkills),
        experience: experiences.map((experience) => ({
          role_title: { title: experience.role_title.trim() },
          company_name: optionalText(experience.company_name),
          duration_months: experience.duration_months === '' ? undefined : Number(experience.duration_months),
          description: optionalText(experience.description),
          skills: commaSeparatedSkills(experience.skills),
        })),
        education: educations.map((education) => ({
          level: education.level,
          field_of_study: optionalText(education.field_of_study),
          institution: optionalText(education.institution),
          description: optionalText(education.description),
        })),
        projects: projects.map((project) => ({
          name: project.name.trim(),
          description: optionalText(project.description),
          skills: commaSeparatedSkills(project.skills),
        })),
        certifications: certifications.map((certification) => ({
          name: certification.name.trim(),
          issuer: optionalText(certification.issuer),
          description: optionalText(certification.description),
        })),
        preferences: hasPreferences ? {
          target_titles: targetTitleValues.map((title) => ({ title })),
          preferred_locations: locationValues,
          acceptable_work_modes: acceptableWorkModes,
        } : undefined,
      },
      job_description: {
        title: { title: jobTitle.trim() },
        company_info: hasCompany ? {
          name: jobCompanyName.trim(),
          industry: optionalText(jobCompanyIndustry),
          location: optionalText(jobCompanyLocation),
        } : undefined,
        responsibilities: newlineResponsibilities(jobResponsibilities),
        required_skills: commaSeparatedSkills(jobRequiredSkills),
        preferred_skills: commaSeparatedSkills(jobPreferredSkills),
        experience_requirement: hasExperienceRequirement ? {
          minimum_years: jobMinYears === '' ? undefined : Number(jobMinYears),
          maximum_years: jobMaxYears === '' ? undefined : Number(jobMaxYears),
        } : undefined,
        education_requirement: hasEducationRequirement ? {
          level: jobEducationLevel || undefined,
          field_of_study: optionalText(jobEducationField),
          description: optionalText(jobEducationDescription),
        } : undefined,
      },
    };

    const candidate = request.candidate_profile;
    if (candidate.skills.length === 0 && candidate.experience.length === 0
      && candidate.education.length === 0 && candidate.projects.length === 0
      && candidate.certifications.length === 0) {
      setFormError('Candidate must contain some meaningful evidence (skills, experience, education, projects, or certifications).');
      return;
    }

    onSubmit(request);
  };

  return (
    <form className="analysis-form" onSubmit={handleSubmit}>
      <div className="form-columns">
        <div className="form-column">
          <h2>Candidate Profile</h2>
          <label htmlFor="candidate-skills">Skills (comma-separated)</label>
          <textarea id="candidate-skills" value={candidateSkills} onChange={(event) => setCandidateSkills(event.target.value)} rows={3} />

          <fieldset>
            <legend>Work Experience</legend>
            {experiences.map((experience, index) => (
              <div key={index} className="repeatable-item">
                <label htmlFor={`exp-role-${index}`}>Role Title</label>
                <input id={`exp-role-${index}`} value={experience.role_title} onChange={(event) => updateItem(experiences, setExperiences, index, { role_title: event.target.value })} required />
                <label htmlFor={`exp-company-${index}`}>Company</label>
                <input id={`exp-company-${index}`} value={experience.company_name} onChange={(event) => updateItem(experiences, setExperiences, index, { company_name: event.target.value })} />
                <label htmlFor={`exp-duration-${index}`}>Duration (months)</label>
                <input id={`exp-duration-${index}`} type="number" min="1" value={experience.duration_months} onChange={(event) => updateItem(experiences, setExperiences, index, { duration_months: event.target.value })} />
                <label htmlFor={`exp-description-${index}`}>Description</label>
                <textarea id={`exp-description-${index}`} value={experience.description} onChange={(event) => updateItem(experiences, setExperiences, index, { description: event.target.value })} />
                <label htmlFor={`exp-skills-${index}`}>Experience Skills (comma-separated)</label>
                <input id={`exp-skills-${index}`} value={experience.skills} onChange={(event) => updateItem(experiences, setExperiences, index, { skills: event.target.value })} />
                <button type="button" className="remove-btn" onClick={() => setExperiences(experiences.filter((_, itemIndex) => itemIndex !== index))}>Remove Experience</button>
              </div>
            ))}
            <button type="button" className="add-btn" onClick={() => setExperiences([...experiences, { role_title: '', company_name: '', duration_months: '', description: '', skills: '' }])}>Add Experience</button>
          </fieldset>

          <fieldset>
            <legend>Education</legend>
            {educations.map((education, index) => (
              <div key={index} className="repeatable-item">
                <label htmlFor={`education-level-${index}`}>Education Level</label>
                <select id={`education-level-${index}`} value={education.level} onChange={(event) => updateItem(educations, setEducations, index, { level: event.target.value as EducationLevel })}>
                  {educationLevels.map((level) => <option key={level.value} value={level.value}>{level.label}</option>)}
                </select>
                <label htmlFor={`education-field-${index}`}>Field of Study</label>
                <input id={`education-field-${index}`} value={education.field_of_study} onChange={(event) => updateItem(educations, setEducations, index, { field_of_study: event.target.value })} />
                <label htmlFor={`education-institution-${index}`}>Institution</label>
                <input id={`education-institution-${index}`} value={education.institution} onChange={(event) => updateItem(educations, setEducations, index, { institution: event.target.value })} />
                <label htmlFor={`education-description-${index}`}>Education Description</label>
                <textarea id={`education-description-${index}`} value={education.description} onChange={(event) => updateItem(educations, setEducations, index, { description: event.target.value })} />
                <button type="button" className="remove-btn" onClick={() => setEducations(educations.filter((_, itemIndex) => itemIndex !== index))}>Remove Education</button>
              </div>
            ))}
            <button type="button" className="add-btn" onClick={() => setEducations([...educations, { level: 'bachelor', field_of_study: '', institution: '', description: '' }])}>Add Education</button>
          </fieldset>

          <fieldset>
            <legend>Projects</legend>
            {projects.map((project, index) => (
              <div key={index} className="repeatable-item">
                <label htmlFor={`project-name-${index}`}>Project Name</label>
                <input id={`project-name-${index}`} value={project.name} onChange={(event) => updateItem(projects, setProjects, index, { name: event.target.value })} required />
                <label htmlFor={`project-description-${index}`}>Project Description</label>
                <textarea id={`project-description-${index}`} value={project.description} onChange={(event) => updateItem(projects, setProjects, index, { description: event.target.value })} />
                <label htmlFor={`project-skills-${index}`}>Project Skills (comma-separated)</label>
                <input id={`project-skills-${index}`} value={project.skills} onChange={(event) => updateItem(projects, setProjects, index, { skills: event.target.value })} />
                <button type="button" className="remove-btn" onClick={() => setProjects(projects.filter((_, itemIndex) => itemIndex !== index))}>Remove Project</button>
              </div>
            ))}
            <button type="button" className="add-btn" onClick={() => setProjects([...projects, { name: '', description: '', skills: '' }])}>Add Project</button>
          </fieldset>

          <fieldset>
            <legend>Certifications</legend>
            {certifications.map((certification, index) => (
              <div key={index} className="repeatable-item">
                <label htmlFor={`certification-name-${index}`}>Certification Name</label>
                <input id={`certification-name-${index}`} value={certification.name} onChange={(event) => updateItem(certifications, setCertifications, index, { name: event.target.value })} required />
                <label htmlFor={`certification-issuer-${index}`}>Certification Issuer</label>
                <input id={`certification-issuer-${index}`} value={certification.issuer} onChange={(event) => updateItem(certifications, setCertifications, index, { issuer: event.target.value })} />
                <label htmlFor={`certification-description-${index}`}>Certification Description</label>
                <textarea id={`certification-description-${index}`} value={certification.description} onChange={(event) => updateItem(certifications, setCertifications, index, { description: event.target.value })} />
                <button type="button" className="remove-btn" onClick={() => setCertifications(certifications.filter((_, itemIndex) => itemIndex !== index))}>Remove Certification</button>
              </div>
            ))}
            <button type="button" className="add-btn" onClick={() => setCertifications([...certifications, { name: '', issuer: '', description: '' }])}>Add Certification</button>
          </fieldset>

          <fieldset>
            <legend>Preferences (Optional)</legend>
            <label htmlFor="target-titles">Target Titles (comma or newline-separated)</label>
            <textarea id="target-titles" value={targetTitles} onChange={(event) => setTargetTitles(event.target.value)} />
            <label htmlFor="preferred-locations">Preferred Locations (comma or newline-separated)</label>
            <textarea id="preferred-locations" value={preferredLocations} onChange={(event) => setPreferredLocations(event.target.value)} />
            <div className="checkbox-group" aria-label="Acceptable Work Modes">
              {workModes.map((mode) => (
                <label key={mode.value}><input type="checkbox" checked={acceptableWorkModes.includes(mode.value)} onChange={() => toggleWorkMode(mode.value)} />{mode.label}</label>
              ))}
            </div>
          </fieldset>
        </div>

        <div className="form-column">
          <h2>Target Job</h2>
          <label htmlFor="job-title">Job Title</label>
          <input id="job-title" value={jobTitle} onChange={(event) => setJobTitle(event.target.value)} required />
          <label htmlFor="job-company-name">Company Name (Optional)</label>
          <input id="job-company-name" value={jobCompanyName} onChange={(event) => setJobCompanyName(event.target.value)} />
          <label htmlFor="job-company-industry">Company Industry (Optional)</label>
          <input id="job-company-industry" value={jobCompanyIndustry} onChange={(event) => setJobCompanyIndustry(event.target.value)} />
          <label htmlFor="job-company-location">Company Location (Optional)</label>
          <input id="job-company-location" value={jobCompanyLocation} onChange={(event) => setJobCompanyLocation(event.target.value)} />
          <label htmlFor="job-required-skills">Required Skills (comma-separated)</label>
          <textarea id="job-required-skills" value={jobRequiredSkills} onChange={(event) => setJobRequiredSkills(event.target.value)} rows={3} />
          <label htmlFor="job-preferred-skills">Preferred Skills (comma-separated)</label>
          <textarea id="job-preferred-skills" value={jobPreferredSkills} onChange={(event) => setJobPreferredSkills(event.target.value)} rows={2} />
          <label htmlFor="job-responsibilities">Responsibilities (newline-separated)</label>
          <textarea id="job-responsibilities" value={jobResponsibilities} onChange={(event) => setJobResponsibilities(event.target.value)} rows={4} />

          <fieldset>
            <legend>Experience Requirement (Optional)</legend>
            <label htmlFor="job-min-years">Minimum Years</label>
            <input id="job-min-years" type="number" min="0" value={jobMinYears} onChange={(event) => setJobMinYears(event.target.value)} />
            <label htmlFor="job-max-years">Maximum Years</label>
            <input id="job-max-years" type="number" min="0" value={jobMaxYears} onChange={(event) => setJobMaxYears(event.target.value)} />
          </fieldset>

          <fieldset>
            <legend>Education Requirement (Optional)</legend>
            <label htmlFor="job-education-level">Required Education Level</label>
            <select id="job-education-level" value={jobEducationLevel} onChange={(event) => setJobEducationLevel(event.target.value as EducationLevel | '')}>
              <option value="">None</option>
              {educationLevels.map((level) => <option key={level.value} value={level.value}>{level.label}</option>)}
            </select>
            <label htmlFor="job-education-field">Required Field of Study</label>
            <input id="job-education-field" value={jobEducationField} onChange={(event) => setJobEducationField(event.target.value)} />
            <label htmlFor="job-education-description">Education Requirement Description</label>
            <textarea id="job-education-description" value={jobEducationDescription} onChange={(event) => setJobEducationDescription(event.target.value)} />
          </fieldset>
        </div>
      </div>

      <div className="form-actions" aria-live="polite">
        <div className="save-control">
          <label>
            <input
              type="checkbox"
              checked={saveAnalysis}
              onChange={(event) => setSaveAnalysis(event.target.checked)}
            />
            Save this analysis to local history
          </label>
          <p>
            Saved analyses are stored by the configured Pathfinder backend. Do not
            enable this on a shared or untrusted installation.
          </p>
        </div>
        {(error || formError) && <div className="error-message">{formError || error}</div>}
        <button type="submit" disabled={isLoading} className="submit-btn">{isLoading ? 'Analyzing...' : 'Analyze Match'}</button>
      </div>
    </form>
  );
}
