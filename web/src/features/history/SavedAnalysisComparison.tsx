import type { ComparisonSide, ComparisonSkills, EducationRequirement, ExperienceGap, SavedAnalysisComparison as Comparison } from '../../types/api';
import { formatSavedTimestamp } from './formatting';

interface Props {
  comparison: Comparison;
  onBack: () => void;
  onClear: () => void;
  onOpen: (id: string) => void;
  opening: boolean;
  error: string | null;
}

function SkillSets({ title, skills }: { title: string; skills: ComparisonSkills }) {
  return <section aria-label={title}><h3>{title}</h3>{([
    ['In both snapshots', skills.in_both],
    ['Left snapshot only', skills.left_only],
    ['Right snapshot only', skills.right_only],
  ] as const).map(([label, values]) => <div key={label}><h4>{label}</h4>{values.length
    ? <ul>{values.map((value) => <li key={value}>{value}</li>)}</ul> : <p>None</p>}</div>)}</section>;
}

function Side({ side, label }: { side: ComparisonSide; label: string }) {
  return <section aria-label={label}><h3>{label}</h3><h4>{side.job_title}</h4>
    <p>{side.company_name ?? 'Company not supplied'}</p>
    <p>Saved {formatSavedTimestamp(side.created_at)}</p><p>Analysis ID: {side.analysis_id}</p>
    <p>Stored score: {side.score === null ? 'Not scored' : `${side.score}%`}</p>
    <p>Stored AI enrichment: {side.ai_enriched ? 'Yes' : 'No'}</p>
  </section>;
}

function Experience({ gap }: { gap: ExperienceGap | null }) {
  return gap ? <dl><dt>Required months</dt><dd>{gap.required_months}</dd><dt>Known candidate months</dt><dd>{gap.known_candidate_months}</dd><dt>Missing months against this snapshot's requirement</dt><dd>{gap.missing_months}</dd></dl> : <p>No stored experience gap</p>;
}

function Education({ gap }: { gap: EducationRequirement | null }) {
  return gap ? <dl><dt>Level</dt><dd>{gap.level ?? 'Not supplied'}</dd><dt>Field of study</dt><dd>{gap.field_of_study ?? 'Not supplied'}</dd><dt>Description</dt><dd>{gap.description ?? 'Not supplied'}</dd></dl> : <p>No stored education gap</p>;
}

export function SavedAnalysisComparison({ comparison: result, onBack, onClear, onOpen, opening, error }: Props) {
  const score = (value: number | null) => value === null ? 'Not scored' : `${value}%`;
  const coverage = (value: number | null) => value === null ? 'Not available' : `${value}%`;
  const component = (earned: number | null, possible: number | null) => earned === null || possible === null ? 'Not present' : `${earned} / ${possible}`;
  return <article className="saved-comparison" aria-labelledby="comparison-title">
    <div className="comparison-actions"><button type="button" disabled={opening} onClick={onBack}>Back to History</button><button type="button" disabled={opening} onClick={onClear}>Clear comparison</button>
      <button type="button" disabled={opening} onClick={() => onOpen(result.left.analysis_id)}>Open left snapshot</button>
      <button type="button" disabled={opening} onClick={() => onOpen(result.right.analysis_id)}>Open right snapshot</button></div>
    {opening && <p role="status">Loading saved analysis…</p>}{error && <p role="alert">{error}</p>}
    <h2 id="comparison-title">Saved Analysis Comparison</h2>
    <p>This view compares two stored snapshots. Differences may reflect changes in the candidate profile, target role, or both. They do not by themselves indicate improvement or regression.</p>
    <div className="snapshot-grid"><Side label="Left snapshot" side={result.left} /><Side label="Right snapshot" side={result.right} /></div>
    <section><h3>Stored scores</h3><dl><dt>Left score</dt><dd>{score(result.left.score)}</dd><dt>Right score</dt><dd>{score(result.right.score)}</dd><dt>Score difference (right − left)</dt><dd>{result.score_delta ?? 'Not comparable'}</dd></dl></section>
    <section><h3>Score components</h3><div className="comparison-table"><table><thead><tr><th scope="col">Component</th><th scope="col">Left earned / possible</th><th scope="col">Right earned / possible</th><th scope="col">Difference in earned points (right − left)</th></tr></thead><tbody>{result.score_components.map((item) => <tr key={item.kind}><th scope="row">{item.kind.replace(/_/g, ' ')}</th><td>{component(item.left_earned_points, item.left_possible_points)}</td><td>{component(item.right_earned_points, item.right_possible_points)}</td><td>{item.earned_points_delta ?? 'Not comparable'}</td></tr>)}</tbody></table></div>{!result.score_components.length && <p>No stored score components</p>}</section>
    <section><h3>Structured skill keyword coverage</h3><dl><dt>Left stored keyword coverage</dt><dd>{coverage(result.left.keyword_coverage_percentage)}</dd><dt>Right stored keyword coverage</dt><dd>{coverage(result.right.keyword_coverage_percentage)}</dd><dt>Difference (right − left)</dt><dd>{result.keyword_coverage_delta === null ? 'Not comparable' : `${result.keyword_coverage_delta} percentage points`}</dd></dl></section>
    <SkillSets title="Matched skills" skills={result.matched_skills} /><SkillSets title="Missing required skills" skills={result.missing_required_skills} /><SkillSets title="Missing preferred skills" skills={result.missing_preferred_skills} />
    <section><h3>Stored experience gaps</h3><div className="snapshot-grid"><div><h4>Left snapshot</h4><Experience gap={result.experience_gaps.left} /></div><div><h4>Right snapshot</h4><Experience gap={result.experience_gaps.right} /></div></div></section>
    <section><h3>Stored education gaps</h3><div className="snapshot-grid"><div><h4>Left snapshot</h4><Education gap={result.education_gaps.left} /></div><div><h4>Right snapshot</h4><Education gap={result.education_gaps.right} /></div></div></section>
  </article>;
}
