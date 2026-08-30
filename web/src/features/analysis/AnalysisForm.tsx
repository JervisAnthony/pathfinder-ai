import React, { useState } from 'react';
import { AnalysisRequest, EducationLevel, WorkMode, CandidatePreferences } from '../../types/api';
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
  const [educations, setEducations] = useState<Array<{ level: EducationLevel; field_of_study: string; institution: string; description: string }>>([]);
  const [projects, setProjects] = useState<Array<{ name: string; description: string; skills: string }>>([]);
  const [certifications, setCertifications] = useState<Array<{ name: string; issuer: string; description: string }>>([]);
  const [targetTitles, setTargetTitles] = useState('');
  const [preferredLocations, setPreferredLocations] = useState('');
  const [acceptableWorkModes, setAcceptableWorkModes] = useState<WorkMode[]>([]);
  const [showPreferences, setShowPreferences] = useState(false);

  // Job Form State
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
    setEducations([...educations, { level: 'bachelor', field_of_study: '', institution: '', description: '' }]);
  };

  const handleRemoveEducation = (index: number) => {
    setEducations(educations.filter((_, i) => i !== index));
  };

  const handleEducationChange = (index: number, field: string, value: string) => {
    const newEducations = [...educations];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    newEducations[index] = { ...newEducations[index], [field]: value } as any;
    setEducations(newEducations);
  };

  const handleAddProject = () => {
    setProjects([...projects, { name: '', description: '', skills: '' }]);
  };

  const handleRemoveProject = (index: number) => {
    setProjects(projects.filter((_, i) => i !== index));
  };

  const handleProjectChange = (index: number, field: string, value: string) => {
    const newProjects = [...projects];
    newProjects[index] = { ...newProjects[index], [field]: value };
    setProjects(newProjects);
  };

  const handleAddCertification = () => {
    setCertifications([...certifications, { name: '', issuer: '', description: '' }]);
  };

  const handleRemoveCertification = (index: number) => {
    setCertifications(certifications.filter((_, i) => i !== index));
  };

  const handleCertificationChange = (index: number, field: string, value: string) => {
    const newCertifications = [...certifications];
    newCertifications[index] = { ...newCertifications[index], [field]: value };
    setCertifications(newCertifications);
  };

  const toggleWorkMode = (mode: WorkMode) => {
      setAcceptableWorkModes(prev =>
          prev.includes(mode) ? prev.filter(m => m !== mode) : [...prev, mode]
      );
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

    if (experiences.some(exp => exp.duration_months && parseInt(exp.duration_months) <= 0)) {
        setFormError('Experience duration must be positive');
        return;
    }

    // Construct optional company
    const hasCompanyInfo = jobCompanyName.trim() !== '' || jobCompanyIndustry.trim() !== '' || jobCompanyLocation.trim() !== '';
    if (hasCompanyInfo && !jobCompanyName.trim()) {
         setFormError('Company name is required if industry or location are provided.');
         return;
    }

    let preferences: CandidatePreferences | null = null;
    if (showPreferences) {
        preferences = {
            target_titles: targetTitles.split(',').map(t => t.trim()).filter(t => t.length > 0).map(t => ({ title: t })),
            preferred_locations: preferredLocations.split(',').map(l => l.trim()).filter(l => l.length > 0),
            acceptable_work_modes: acceptableWorkModes
        };
        // Don't send empty preferences object if everything is empty
        if (preferences.target_titles.length === 0 && preferences.preferred_locations.length === 0 && preferences.acceptable_work_modes.length === 0) {
            preferences = null;
        }
    }

    const request: AnalysisRequest = {
      include_ai_enrichment: false,
      save_analysis: false,
      candidate_profile: {
        skills: commaSeparatedSkills(candidateSkills),
        experience: experiences.map(exp => ({
          role_title: { title: exp.role_title },
          company_name: exp.company_name,
          duration_months: parseInt(exp.duration_months) || 1, // enforced positive above
          description: exp.description,
          skills: commaSeparatedSkills(exp.skills)
        })),
        education: educations.map(edu => ({
          level: edu.level,
          field_of_study: edu.field_of_study,
          institution: edu.institution,
          description: edu.description || undefined
        })),
        projects: projects.map(proj => ({
          name: proj.name,
          description: proj.description,
          skills: commaSeparatedSkills(proj.skills)
        })),
        certifications: certifications.map(cert => ({
          name: cert.name,
          issuer: cert.issuer,
          description: cert.description || undefined
        })),
        preferences: preferences
      },
      job_description: {
        title: { title: jobTitle },
        company_info: hasCompanyInfo ? {
            name: jobCompanyName.trim(),
            industry: jobCompanyIndustry.trim() || undefined,
            location: jobCompanyLocation.trim() || undefined
        } : undefined,
        responsibilities: newlineResponsibilities(jobResponsibilities),
        required_skills: commaSeparatedSkills(jobRequiredSkills),
        preferred_skills: commaSeparatedSkills(jobPreferredSkills),
        experience_requirement: (jobMinYears || jobMaxYears) ? {
            minimum_years: parseInt(jobMinYears) || 0,
            maximum_years: jobMaxYears ? parseInt(jobMaxYears) : undefined
        } : undefined,
        education_requirement: jobEducationLevel ? {
            level: jobEducationLevel as EducationLevel,
            field_of_study: jobEducationField.trim() || undefined,
            description: jobEducationDescription.trim() || undefined
        } : undefined
      }
    };

    // Ensure we have some evidence
    const hasCandidateEvidence =
        request.candidate_profile.skills.length > 0 ||
        request.candidate_profile.experience.length > 0 ||
        request.candidate_profile.education.length > 0 ||
        request.candidate_profile.projects.length > 0 ||
        request.candidate_profile.certifications.length > 0;

    if (!hasCandidateEvidence) {
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
                    min="1"
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
                     <option value="high_school">High School</option>
                     <option value="associate">Associate</option>
                     <option value="bachelor">Bachelor</option>
                     <option value="master">Master</option>
                     <option value="doctorate">Doctorate</option>
                     <option value="other">Other</option>
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
                <div className="form-group">
                  <label htmlFor={`edu-desc-${index}`}>Description (Optional)</label>
                  <textarea
                    id={`edu-desc-${index}`}
                    value={edu.description}
                    onChange={(e) => handleEducationChange(index, 'description', e.target.value)}
                  />
                </div>
                <button type="button" onClick={() => handleRemoveEducation(index)} className="remove-btn">
                  Remove Education
                </button>
              </div>
            ))}
            <button type="button" onClick={handleAddEducation} className="add-btn">Add Education</button>
          </fieldset>

          <fieldset>
            <legend>Projects</legend>
            {projects.map((proj, index) => (
              <div key={index} className="experience-item">
                <div className="form-group">
                  <label htmlFor={`proj-name-${index}`}>Project Name</label>
                  <input
                    id={`proj-name-${index}`}
                    type="text"
                    value={proj.name}
                    onChange={(e) => handleProjectChange(index, 'name', e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor={`proj-desc-${index}`}>Description</label>
                  <textarea
                    id={`proj-desc-${index}`}
                    value={proj.description}
                    onChange={(e) => handleProjectChange(index, 'description', e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor={`proj-skills-${index}`}>Skills Used (comma-separated)</label>
                  <input
                    id={`proj-skills-${index}`}
                    type="text"
                    value={proj.skills}
                    onChange={(e) => handleProjectChange(index, 'skills', e.target.value)}
                  />
                </div>
                <button type="button" onClick={() => handleRemoveProject(index)} className="remove-btn">
                  Remove Project
                </button>
              </div>
            ))}
            <button type="button" onClick={handleAddProject} className="add-btn">Add Project</button>
          </fieldset>

          <fieldset>
            <legend>Certifications</legend>
            {certifications.map((cert, index) => (
              <div key={index} className="experience-item">
                <div className="form-group">
                  <label htmlFor={`cert-name-${index}`}>Certification Name</label>
                  <input
                    id={`cert-name-${index}`}
                    type="text"
                    value={cert.name}
                    onChange={(e) => handleCertificationChange(index, 'name', e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor={`cert-issuer-${index}`}>Issuer</label>
                  <input
                    id={`cert-issuer-${index}`}
                    type="text"
                    value={cert.issuer}
                    onChange={(e) => handleCertificationChange(index, 'issuer', e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor={`cert-desc-${index}`}>Description (Optional)</label>
                  <textarea
                    id={`cert-desc-${index}`}
                    value={cert.description}
                    onChange={(e) => handleCertificationChange(index, 'description', e.target.value)}
                  />
                </div>
                <button type="button" onClick={() => handleRemoveCertification(index)} className="remove-btn">
                  Remove Certification
                </button>
              </div>
            ))}
            <button type="button" onClick={handleAddCertification} className="add-btn">Add Certification</button>
          </fieldset>

          <fieldset>
              <legend>
                  Preferences
                  <button type="button" onClick={() => setShowPreferences(!showPreferences)} className="toggle-btn" style={{marginLeft: '1rem', padding: '0.25rem 0.5rem', background: 'none', border: '1px solid #ccc', borderRadius: '4px', cursor: 'pointer'}}>
                      {showPreferences ? 'Hide' : 'Show'}
                  </button>
              </legend>
              {showPreferences && (
                  <div className="preferences-section">
                      <div className="form-group">
                        <label htmlFor="pref-titles">Target Titles (comma-separated)</label>
                        <input
                            id="pref-titles"
                            type="text"
                            value={targetTitles}
                            onChange={(e) => setTargetTitles(e.target.value)}
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor="pref-locations">Preferred Locations (comma-separated)</label>
                        <input
                            id="pref-locations"
                            type="text"
                            value={preferredLocations}
                            onChange={(e) => setPreferredLocations(e.target.value)}
                        />
                      </div>
                      <div className="form-group">
                          <label>Acceptable Work Modes</label>
                          <div className="checkbox-group" style={{display: 'flex', gap: '1rem'}}>
                              <label style={{display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 'normal'}}>
                                  <input type="checkbox" checked={acceptableWorkModes.includes('remote')} onChange={() => toggleWorkMode('remote')} />
                                  Remote
                              </label>
                              <label style={{display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 'normal'}}>
                                  <input type="checkbox" checked={acceptableWorkModes.includes('hybrid')} onChange={() => toggleWorkMode('hybrid')} />
                                  Hybrid
                              </label>
                              <label style={{display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 'normal'}}>
                                  <input type="checkbox" checked={acceptableWorkModes.includes('onsite')} onChange={() => toggleWorkMode('onsite')} />
                                  Onsite
                              </label>
                          </div>
                      </div>
                  </div>
              )}
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

          <fieldset>
              <legend>Company Information</legend>
              <div className="form-group">
                <label htmlFor="job-company">Company Name</label>
                <input
                  id="job-company"
                  type="text"
                  value={jobCompanyName}
                  onChange={(e) => setJobCompanyName(e.target.value)}
                />
              </div>
              <div className="form-group-inline">
                  <div className="form-group">
                    <label htmlFor="job-industry">Industry</label>
                    <input
                      id="job-industry"
                      type="text"
                      value={jobCompanyIndustry}
                      onChange={(e) => setJobCompanyIndustry(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="job-location">Location</label>
                    <input
                      id="job-location"
                      type="text"
                      value={jobCompanyLocation}
                      onChange={(e) => setJobCompanyLocation(e.target.value)}
                    />
                  </div>
              </div>
          </fieldset>

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
             <legend>Experience Requirement</legend>
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

           <fieldset>
               <legend>Education Requirement</legend>
               <div className="form-group">
                 <label htmlFor="job-edu-level">Level</label>
                 <select
                   id="job-edu-level"
                   value={jobEducationLevel}
                   onChange={(e) => setJobEducationLevel(e.target.value as EducationLevel | '')}
                 >
                    <option value="">None</option>
                    <option value="high_school">High School</option>
                    <option value="associate">Associate</option>
                    <option value="bachelor">Bachelor</option>
                    <option value="master">Master</option>
                    <option value="doctorate">Doctorate</option>
                    <option value="other">Other</option>
                 </select>
               </div>
               <div className="form-group">
                  <label htmlFor="job-edu-field">Field of Study (Optional)</label>
                  <input
                      id="job-edu-field"
                      type="text"
                      value={jobEducationField}
                      onChange={(e) => setJobEducationField(e.target.value)}
                  />
               </div>
               <div className="form-group">
                  <label htmlFor="job-edu-desc">Description (Optional)</label>
                  <textarea
                      id="job-edu-desc"
                      value={jobEducationDescription}
                      onChange={(e) => setJobEducationDescription(e.target.value)}
                  />
               </div>
           </fieldset>
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
