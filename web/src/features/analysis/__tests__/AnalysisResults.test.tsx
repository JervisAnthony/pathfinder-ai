import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AnalysisResults } from '../AnalysisResults';
import { AnalysisResponse } from '../../../types/api';

const results: AnalysisResponse = {
  score: { value: 85 },
  explanation: {
    score: { value: 85 },
    components: [
      { kind: 'required_skills', earned_points: 35, possible_points: 40 },
      { kind: 'preferred_skills', earned_points: 15, possible_points: 20 },
      { kind: 'experience', earned_points: 20, possible_points: 25 },
      { kind: 'education', earned_points: 15, possible_points: 15 },
    ],
    matched_skills: [{
      skill: { name: 'Python' },
      is_required: true,
      evidence_sources: [
        { kind: 'experience', label: 'Developer at Fictional Labs' },
        { kind: 'project', label: 'Path Explorer' },
      ],
    }],
    experience: { required_months: 24, known_candidate_months: 12, earned_points: 12.5, possible_points: 25 },
    education: {
      requirement: { level: 'master', field_of_study: 'Computer Science', description: null },
      matched_record: null,
      satisfied: false,
    },
    gaps: {
      missing_required_skills: [{ name: 'Docker' }],
      missing_preferred_skills: [{ name: 'Kubernetes' }],
      experience_gap: { required_months: 24, known_candidate_months: 12, missing_months: 12 },
      education_gap: { level: 'master', field_of_study: 'Computer Science', description: null },
    },
    keyword_coverage: {
      matched_keywords: [{ name: 'Python' }],
      missing_keywords: [{ name: 'Docker' }, { name: 'Kubernetes' }],
      percentage: 33.33,
    },
  },
  interview_preparation: {
    themes: [{ kind: 'technical', description: 'Deep dive into Python' }],
    talking_points: [{ description: 'Discuss the Path Explorer project' }],
    question_categories: ['System Design'],
    candidate_questions: [{ description: 'What is the team structure?' }],
  },
  learning_recommendations: {
    items: [
      {
        kind: 'required_skill',
        priority: 'high',
        topic: 'Docker',
        title: 'Strengthen Docker',
        rationale: 'Docker is required, but matching evidence was not found.',
        suggested_course_topic: 'Docker fundamentals',
      },
      {
        kind: 'experience',
        priority: 'high',
        topic: 'Role-relevant experience',
        title: 'Build demonstrable experience',
        rationale: 'The deterministic analysis found a 12 month experience gap.',
        suggested_course_topic: null,
      },
      {
        kind: 'education',
        priority: 'high',
        topic: 'Education requirement',
        title: 'Review the education requirement',
        rationale: 'The role specifies a master level education requirement.',
        suggested_course_topic: null,
      },
      {
        kind: 'preferred_skill',
        priority: 'medium',
        topic: 'Kubernetes',
        title: 'Strengthen Kubernetes',
        rationale: "Preferred evidence remains inert: <script>alert('unsafe')</script>",
        suggested_course_topic: 'Kubernetes fundamentals',
      },
    ],
  },
  ai_enrichment: {
    provider_name: 'safe-test-provider',
    content: "First line\n<script>alert('x')</script>",
  },
  saved_analysis: {
    analysis_id: '11111111-1111-4111-8111-111111111111',
    created_at: '2026-08-30T10:00:00Z',
  },
};

describe('AnalysisResults', () => {
  it('renders the score, disclaimer, and every score component', () => {
    render(<AnalysisResults results={results} />);
    expect(screen.getByText('85%')).toBeInTheDocument();
    expect(screen.getByText(/not a hiring probability/i)).toBeInTheDocument();
    for (const kind of ['required_skills', 'preferred_skills', 'experience', 'education']) {
      expect(screen.getByText(kind)).toBeInTheDocument();
    }
    expect(screen.getByText('35 / 40 pts')).toBeInTheDocument();
  });

  it('renders matched evidence, labels, all gaps, and numeric keyword coverage', () => {
    render(<AnalysisResults results={results} />);
    expect(screen.getAllByText('Python').length).toBeGreaterThan(0);
    expect(screen.getByText('Required')).toBeInTheDocument();
    expect(screen.getByText('experience: Developer at Fictional Labs')).toBeInTheDocument();
    expect(screen.getByText('project: Path Explorer')).toBeInTheDocument();
    expect(screen.getAllByText('Docker').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Kubernetes').length).toBeGreaterThan(0);
    expect(screen.getByText(/Requires 24 months/)).toBeInTheDocument();
    expect(screen.getByText(/Missing: 12 months/)).toBeInTheDocument();
    expect(screen.getByText('master')).toBeInTheDocument();
    expect(screen.getByText('33.33%')).toBeInTheDocument();
  });

  it('renders complete interview preparation and saved metadata', () => {
    render(<AnalysisResults results={results} />);
    expect(screen.getByText(/Deep dive into Python/)).toBeInTheDocument();
    expect(screen.getByText(/Discuss the Path Explorer project/)).toBeInTheDocument();
    expect(screen.getByText('System Design')).toBeInTheDocument();
    expect(screen.getByText(/What is the team structure/)).toBeInTheDocument();
    expect(screen.getByText(/11111111-1111-4111-8111-111111111111/)).toBeInTheDocument();
  });

  it('renders every deterministic learning recommendation and disclaimer', () => {
    const { container } = render(<AnalysisResults results={results} />);
    expect(screen.getByRole('heading', { name: 'Learning Recommendations' })).toBeInTheDocument();
    expect(screen.getByText('Strengthen Docker')).toBeInTheDocument();
    expect(screen.getByText('Build demonstrable experience')).toBeInTheDocument();
    expect(screen.getByText('Review the education requirement')).toBeInTheDocument();
    expect(screen.getByText('Strengthen Kubernetes')).toBeInTheDocument();
    expect(screen.getAllByText('High priority')).toHaveLength(3);
    expect(screen.getByText('Medium priority')).toBeInTheDocument();
    for (const category of ['Required skill', 'Preferred skill', 'Experience', 'Education']) {
      expect(screen.getByText(category)).toBeInTheDocument();
    }
    expect(screen.getByText('Docker fundamentals')).toBeInTheDocument();
    expect(screen.getByText(/not verified third-party course listings/i)).toBeInTheDocument();
    expect(container.querySelector('.learning-recommendations a')).toBeNull();
  });

  it('renders recommendation HTML-like text as inert plain text', () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    const { container } = render(<AnalysisResults results={results} />);
    expect(container.querySelector('.learning-recommendations')).toHaveTextContent(
      "Preferred evidence remains inert: <script>alert('unsafe')</script>",
    );
    expect(container.querySelector('.learning-recommendations script')).toBeNull();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('keeps the learning section visible for an empty recommendation result', () => {
    render(
      <AnalysisResults
        results={{ ...results, learning_recommendations: { items: [] } }}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Learning Recommendations' })).toBeInTheDocument();
    expect(
      screen.getByText('No immediate learning gaps were identified from this role comparison.'),
    ).toBeInTheDocument();
  });

  it('renders multiline AI content as inert plain text', () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    const { container } = render(<AnalysisResults results={results} />);
    expect(container.querySelector('.ai-content')).toHaveTextContent("First line<script>alert('x')</script>");
    expect(container.querySelector('script')).toBeNull();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('renders null score and null keyword coverage states', () => {
    const nullResults: AnalysisResponse = {
      ...results,
      score: { value: null },
      explanation: {
        ...results.explanation,
        score: { value: null },
        keyword_coverage: { matched_keywords: [], missing_keywords: [], percentage: null },
      },
    };
    render(<AnalysisResults results={nullResults} />);
    expect(screen.getByText(/Not enough comparable evidence to calculate a score/)).toBeInTheDocument();
    expect(screen.getByText(/Not enough comparable skill keywords/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Score Breakdown' })).not.toBeInTheDocument();
  });
});
