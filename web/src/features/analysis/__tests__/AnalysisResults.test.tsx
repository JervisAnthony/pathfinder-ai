import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { AnalysisResults } from '../AnalysisResults';
import { AnalysisResponse } from '../../../types/api';

const mockResults = {
  score: { value: 85 },
  explanation: {
    score: { value: 85 },
    components: [
      { kind: 'skills', earned_points: 40, possible_points: 50 }
    ],
    matched_skills: [
      {
        skill: { name: 'Python' },
        is_required: true,
        evidence_sources: [{ kind: 'profile', label: null }]
      }
    ],
    gaps: {
      missing_required_skills: [{ name: 'Docker' }],
      missing_preferred_skills: [],
      experience_gap: { required_months: 24, known_candidate_months: 12, missing_months: 12 },
      education_gap: null
    },
    keyword_coverage: {
      matched_keywords: [{ name: 'Python' }],
      missing_keywords: [{ name: 'Docker' }],
      percentage: 50
    }
  },
  interview_preparation: {
    themes: [{ kind: 'technical', description: 'Deep dive into Python' }],
    talking_points: [{ description: 'Discuss Python experience' }],
    question_categories: ['System Design'],
    candidate_questions: [{ description: 'What is the team structure?' }]
  },
  ai_enrichment: null
};

describe('AnalysisResults', () => {
  it('renders numeric score', () => {
    render(<AnalysisResults results={mockResults as unknown as AnalysisResponse} />);
    expect(screen.getByText('85%')).toBeInTheDocument();
    expect(screen.getByText(/Pathfinder's score is an explainable profile-to-role match score/i)).toBeInTheDocument();
  });

  it('renders score components', () => {
    render(<AnalysisResults results={mockResults as unknown as AnalysisResponse} />);
    expect(screen.getByText('skills')).toBeInTheDocument();
    expect(screen.getByText('40 / 50 pts')).toBeInTheDocument();
  });

  it('renders matched evidence', () => {
    render(<AnalysisResults results={mockResults as unknown as AnalysisResponse} />);
    expect(screen.getAllByText('Python')[0]).toBeInTheDocument(); // Multiple Pythons
    expect(screen.getByText('Required')).toBeInTheDocument();
    expect(screen.getByText('profile')).toBeInTheDocument();
  });

  it('renders gaps', () => {
    render(<AnalysisResults results={mockResults as unknown as AnalysisResponse} />);
    expect(screen.getAllByText('Docker')[0]).toBeInTheDocument(); // Multiple Dockers
    expect(screen.getByText(/Requires 24 months/i)).toBeInTheDocument();
    expect(screen.getByText(/Missing: 12 months/i)).toBeInTheDocument();
  });

  it('renders interview preparation', () => {
    render(<AnalysisResults results={mockResults as unknown as AnalysisResponse} />);
    expect(screen.getByText(/Deep dive into Python/i)).toBeInTheDocument();
    expect(screen.getByText(/Discuss Python experience/i)).toBeInTheDocument();
    expect(screen.getByText('System Design')).toBeInTheDocument();
    expect(screen.getByText(/What is the team structure\?/i)).toBeInTheDocument();
  });

  it('handles null score correctly', () => {
    const nullScoreResults = {
        ...mockResults,
        score: { value: null }
    }
    render(<AnalysisResults results={nullScoreResults as unknown as AnalysisResponse} />);
    expect(screen.getByText(/Not enough comparable evidence to calculate a score/i)).toBeInTheDocument();
  });
});
