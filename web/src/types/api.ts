export interface Skill {
  name: string;
}

export interface JobTitle {
  title: string;
}

export interface WorkExperience {
  role_title: JobTitle;
  company_name: string;
  duration_months: number;
  description: string;
  skills: Skill[];
}

export interface EducationRecord {
  level: string;
  field_of_study: string;
  institution: string;
  description?: string | null;
}

export interface Project {
  name: string;
  description: string;
  skills: Skill[];
}

export interface Certification {
  name: string;
  issuer: string;
  description?: string | null;
}

export interface CandidatePreferences {
  target_titles: JobTitle[];
  preferred_locations: string[];
  acceptable_work_modes: string[];
}

export interface CandidateProfile {
  skills: Skill[];
  experience: WorkExperience[];
  education: EducationRecord[];
  projects: Project[];
  certifications: Certification[];
  preferences?: CandidatePreferences | null;
}

export interface Responsibility {
  description: string;
}

export interface CompanyInfo {
  name: string;
  industry?: string | null;
  location?: string | null;
}

export interface ExperienceRequirement {
  minimum_years: number;
  maximum_years?: number | null;
}

export interface EducationRequirement {
  level: string;
  field_of_study?: string | null;
  description?: string | null;
}

export interface JobDescription {
  title: JobTitle;
  responsibilities: Responsibility[];
  required_skills: Skill[];
  preferred_skills: Skill[];
  company_info?: CompanyInfo | null;
  experience_requirement?: ExperienceRequirement | null;
  education_requirement?: EducationRequirement | null;
}

export interface AnalysisRequest {
  candidate_profile: CandidateProfile;
  job_description: JobDescription;
  include_ai_enrichment: boolean;
  save_analysis: boolean;
}

export interface MatchScore {
  value: number | null;
}

export interface ScoreComponent {
  kind: string;
  earned_points: number;
  possible_points: number;
}

export interface EvidenceSource {
  kind: string;
  label?: string | null;
}

export interface MatchedSkillEvidence {
  skill: Skill;
  is_required: boolean;
  evidence_sources: EvidenceSource[];
}

export interface ExperienceEvidence {
  required_months: number;
  known_candidate_months: number;
  earned_points: number;
  possible_points: number;
}

export interface EducationEvidence {
  requirement: EducationRequirement;
  matched_record?: EducationRecord | null;
  satisfied: boolean;
}

export interface ExperienceGap {
  required_months: number;
  known_candidate_months: number;
  missing_months: number;
}

export interface GapAnalysis {
  missing_required_skills: Skill[];
  missing_preferred_skills: Skill[];
  experience_gap?: ExperienceGap | null;
  education_gap?: EducationRequirement | null;
}

export interface SkillKeywordCoverage {
  matched_keywords: Skill[];
  missing_keywords: Skill[];
  percentage: number | null;
}

export interface MatchExplanation {
  score: MatchScore;
  components: ScoreComponent[];
  matched_skills: MatchedSkillEvidence[];
  experience?: ExperienceEvidence | null;
  education?: EducationEvidence | null;
  gaps: GapAnalysis;
  keyword_coverage: SkillKeywordCoverage;
}

export interface InterviewTheme {
  kind: string;
  description: string;
}

export interface TalkingPoint {
  description: string;
}

export interface InterviewerQuestion {
  description: string;
}

export interface InterviewPreparation {
  themes: InterviewTheme[];
  talking_points: TalkingPoint[];
  question_categories: string[];
  candidate_questions: InterviewerQuestion[];
}

export interface AIEnrichmentResult {
  content: string;
  provider_name: string;
}

export interface SavedAnalysisMetadata {
  analysis_id: string;
  created_at: string;
}

export interface AnalysisResponse {
  score: MatchScore;
  explanation: MatchExplanation;
  interview_preparation: InterviewPreparation;
  ai_enrichment?: AIEnrichmentResult | null;
  saved_analysis?: SavedAnalysisMetadata | null;
}

export interface ApiErrorDetail {
  loc: (string | number)[];
  msg: string;
  type: string;
}

export interface ApiErrorResponse {
  detail: string | ApiErrorDetail[];
}
