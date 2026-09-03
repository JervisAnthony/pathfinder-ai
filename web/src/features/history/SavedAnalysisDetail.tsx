import { AnalysisResults } from '../analysis/AnalysisResults';
import { SavedAnalysisDetail as SavedDetail } from '../../types/api';
import { formatSavedTimestamp } from './formatting';
import { savedAnalysisDetailToAnalysisResponse } from './mapping';

interface Props {
  detail: SavedDetail;
  onBack: () => void;
}

function TextList({ values, empty }: { values: string[]; empty: string }) {
  return values.length > 0
    ? <ul>{values.map((value, index) => <li key={`${value}-${index}`}>{value}</li>)}</ul>
    : <p className="neutral-state">{empty}</p>;
}

export function SavedAnalysisDetail({ detail, onBack }: Props) {
  const candidate = detail.candidate_profile;
  const job = detail.job_description;

  return (
    <article className="saved-detail">
      <button type="button" className="back-btn" onClick={onBack}>← Back to History</button>
      <header className="history-heading">
        <div>
          <p className="eyebrow">Saved analysis</p>
          <h2>{job.title.title}</h2>
          {job.company_info && <p>{job.company_info.name}</p>}
        </div>
        <div className="snapshot-meta">
          <span>Saved {formatSavedTimestamp(detail.created_at)}</span>
          <span>Analysis ID: {detail.analysis_id}</span>
        </div>
      </header>

      <div className="snapshot-grid">
        <section>
          <h3>Candidate Profile</h3>
          <h4>Skills</h4>
          <TextList values={candidate.skills.map((skill) => skill.name)} empty="No skills stored." />
          <h4>Experience</h4>
          {candidate.experience.length > 0 ? (
            <ul>{candidate.experience.map((item, index) => (
              <li key={`${item.role_title.title}-${index}`}>
                <strong>{item.role_title.title}</strong>
                {item.company_name ? ` at ${item.company_name}` : ''}
                {item.duration_months ? ` — ${item.duration_months} months` : ''}
                {item.description ? <p>{item.description}</p> : null}
              </li>
            ))}</ul>
          ) : <p className="neutral-state">No experience stored.</p>}
          <h4>Education</h4>
          <TextList
            values={candidate.education.map((item) => [item.level, item.field_of_study, item.institution].filter(Boolean).join(' — '))}
            empty="No education stored."
          />
          <h4>Projects</h4>
          <TextList values={candidate.projects.map((item) => item.name)} empty="No projects stored." />
          <h4>Certifications</h4>
          <TextList values={candidate.certifications.map((item) => item.name)} empty="No certifications stored." />
          <h4>Preferences</h4>
          {candidate.preferences ? (
            <dl>
              <dt>Target titles</dt>
              <dd>{candidate.preferences.target_titles.map((item) => item.title).join(', ') || 'None'}</dd>
              <dt>Locations</dt>
              <dd>{candidate.preferences.preferred_locations.join(', ') || 'None'}</dd>
              <dt>Work modes</dt>
              <dd>{candidate.preferences.acceptable_work_modes.join(', ') || 'None'}</dd>
            </dl>
          ) : <p className="neutral-state">No preferences stored.</p>}
        </section>

        <section>
          <h3>Target Job</h3>
          {job.company_info && (
            <dl>
              <dt>Company</dt><dd>{job.company_info.name}</dd>
              <dt>Industry</dt><dd>{job.company_info.industry ?? 'Not supplied'}</dd>
              <dt>Location</dt><dd>{job.company_info.location ?? 'Not supplied'}</dd>
            </dl>
          )}
          <h4>Responsibilities</h4>
          <TextList values={job.responsibilities.map((item) => item.description)} empty="No responsibilities stored." />
          <h4>Required skills</h4>
          <TextList values={job.required_skills.map((item) => item.name)} empty="No required skills stored." />
          <h4>Preferred skills</h4>
          <TextList values={job.preferred_skills.map((item) => item.name)} empty="No preferred skills stored." />
          <h4>Experience requirement</h4>
          <p>{job.experience_requirement
            ? `${job.experience_requirement.minimum_years ?? 'No minimum'} to ${job.experience_requirement.maximum_years ?? 'no maximum'} years`
            : 'Not supplied'}</p>
          <h4>Education requirement</h4>
          <p>{job.education_requirement
            ? [job.education_requirement.level, job.education_requirement.field_of_study, job.education_requirement.description].filter(Boolean).join(' — ') || 'Not supplied'
            : 'Not supplied'}</p>
        </section>
      </div>

      <AnalysisResults
        results={savedAnalysisDetailToAnalysisResponse(detail)}
        legacyLearningRecommendations={detail.learning_recommendations === null}
      />
    </article>
  );
}
