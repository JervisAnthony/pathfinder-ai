import React from 'react';
import { AnalysisResponse } from '../../types/api';
import './AnalysisResults.css';

interface Props {
  results: AnalysisResponse;
}

export function AnalysisResults({ results }: Props) {
  const { score, explanation, interview_preparation, ai_enrichment } = results;

  return (
    <div className="analysis-results">
      <section className="results-header">
        <h2>Analysis Results</h2>
        <div className="score-container">
          <div className="score-value">
            {score.value !== null ? (
              <span className="score-number">{score.value}%</span>
            ) : (
              <span className="score-null">Not enough comparable evidence to calculate a score.</span>
            )}
          </div>
          <p className="score-disclaimer">
            Pathfinder's score is an explainable profile-to-role match score, not a hiring probability.
          </p>
        </div>
      </section>

      {score.value !== null && (
          <section className="score-breakdown">
            <h3>Score Breakdown</h3>
            <ul className="breakdown-list">
              {explanation.components.map((comp, idx) => (
                <li key={idx} className="breakdown-item">
                  <span className="breakdown-kind">{comp.kind}</span>
                  <span className="breakdown-points">{comp.earned_points} / {comp.possible_points} pts</span>
                </li>
              ))}
            </ul>
          </section>
      )}

      <div className="results-grid">
        <div className="results-column">
          <section className="matched-strengths">
            <h3>Matched Strengths</h3>
            {explanation.matched_skills.length > 0 ? (
              <ul className="strength-list">
                {explanation.matched_skills.map((skill, idx) => (
                  <li key={idx} className="strength-item">
                    <div className="strength-header">
                      <strong>{skill.skill.name}</strong>
                      <span className={`badge ${skill.is_required ? 'required' : 'preferred'}`}>
                        {skill.is_required ? 'Required' : 'Preferred'}
                      </span>
                    </div>
                    {skill.evidence_sources.length > 0 && (
                      <div className="evidence-sources">
                        <span className="evidence-label">Found in:</span>
                        {skill.evidence_sources.map((src, sIdx) => (
                          <span key={sIdx} className="source-tag">
                            {src.kind}{src.label ? `: ${src.label}` : ''}
                          </span>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="neutral-state">No matching skills found.</p>
            )}
          </section>

          <section className="keyword-coverage">
            <h3>Keyword Coverage</h3>
             <div className="coverage-stats">
              {explanation.keyword_coverage.percentage !== null ? (
                <span className="coverage-percentage">{explanation.keyword_coverage.percentage}%</span>
              ) : (
                 <span className="coverage-null">Not enough comparable skill keywords</span>
              )}
            </div>
             {explanation.keyword_coverage.matched_keywords.length > 0 && (
                 <div className="keyword-group">
                     <h4>Matched</h4>
                     <div className="tags">
                         {explanation.keyword_coverage.matched_keywords.map((k, i) => (
                             <span key={i} className="tag matched">{k.name}</span>
                         ))}
                     </div>
                 </div>
             )}
              {explanation.keyword_coverage.missing_keywords.length > 0 && (
                 <div className="keyword-group">
                     <h4>Missing</h4>
                     <div className="tags">
                         {explanation.keyword_coverage.missing_keywords.map((k, i) => (
                             <span key={i} className="tag missing">{k.name}</span>
                         ))}
                     </div>
                 </div>
             )}
          </section>
        </div>

        <div className="results-column">
          <section className="gap-analysis">
            <h3>Areas to Strengthen</h3>

            <div className="gap-section">
                <h4>Missing Required Skills</h4>
                {explanation.gaps.missing_required_skills.length > 0 ? (
                  <ul className="missing-skills">
                    {explanation.gaps.missing_required_skills.map((skill, idx) => (
                      <li key={idx}>{skill.name}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="neutral-state">No missing required skills.</p>
                )}
            </div>

            <div className="gap-section">
                <h4>Missing Preferred Skills</h4>
                {explanation.gaps.missing_preferred_skills.length > 0 ? (
                  <ul className="missing-skills">
                    {explanation.gaps.missing_preferred_skills.map((skill, idx) => (
                      <li key={idx}>{skill.name}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="neutral-state">No missing preferred skills.</p>
                )}
            </div>

            {explanation.gaps.experience_gap && explanation.gaps.experience_gap.missing_months > 0 && (
                <div className="gap-section experience-gap">
                  <h4>Experience Gap</h4>
                  <p>
                    Requires {explanation.gaps.experience_gap.required_months} months,
                    found {explanation.gaps.experience_gap.known_candidate_months} months.
                    <br />
                    <strong>Missing: {explanation.gaps.experience_gap.missing_months} months.</strong>
                  </p>
                </div>
            )}
            {explanation.gaps.education_gap && (
                 <div className="gap-section education-gap">
                  <h4>Education Gap</h4>
                  <p>
                    Missing required education level: <strong>{explanation.gaps.education_gap.level}</strong>
                    {explanation.gaps.education_gap.field_of_study ? ` in ${explanation.gaps.education_gap.field_of_study}` : ''}
                  </p>
                </div>
            )}
          </section>
        </div>
      </div>

      <section className="interview-preparation">
        <h3>Interview Preparation</h3>

        <div className="prep-grid">
            <div className="prep-column">
                <h4>Likely Discussion Areas</h4>
                {interview_preparation.themes.length > 0 ? (
                    <ul className="prep-list">
                        {interview_preparation.themes.map((theme, idx) => (
                            <li key={idx}>
                                <strong>{theme.kind}:</strong> {theme.description}
                            </li>
                        ))}
                    </ul>
                ) : (
                     <p className="neutral-state">No discussion areas generated.</p>
                )}

                <h4>Question Categories to Prepare For</h4>
                {interview_preparation.question_categories.length > 0 ? (
                     <ul className="prep-list">
                        {interview_preparation.question_categories.map((cat, idx) => (
                            <li key={idx}>{cat}</li>
                        ))}
                    </ul>
                ) : (
                     <p className="neutral-state">No categories generated.</p>
                )}
            </div>

            <div className="prep-column">
                <h4>Talking Points</h4>
                {interview_preparation.talking_points.length > 0 ? (
                    <ul className="prep-list">
                        {interview_preparation.talking_points.map((pt, idx) => (
                            <li key={idx}>{pt.description}</li>
                        ))}
                    </ul>
                ) : (
                     <p className="neutral-state">No talking points generated.</p>
                )}

                 <h4>Questions to Ask the Interviewer</h4>
                {interview_preparation.candidate_questions.length > 0 ? (
                    <ul className="prep-list">
                        {interview_preparation.candidate_questions.map((q, idx) => (
                            <li key={idx}>{q.description}</li>
                        ))}
                    </ul>
                ) : (
                     <p className="neutral-state">No questions generated.</p>
                )}
            </div>
        </div>
      </section>

      {ai_enrichment && (
        <section className="ai-enrichment">
          <h3>Optional AI-Generated Enrichment</h3>
          <p className="provider-name">Provider: {ai_enrichment.provider_name}</p>
          <div className="ai-content">
            {ai_enrichment.content.split('\n').map((line, i) => (
              <React.Fragment key={i}>
                {line}
                <br />
              </React.Fragment>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
