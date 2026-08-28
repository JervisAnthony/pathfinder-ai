"""
Pydantic v2 schemas for the FastAPI analysis API and domain mapping functions.
"""

from pydantic import BaseModel, ConfigDict, Field

from pathfinder_ai.application.ai_enrichment import AIEnrichmentResult
from pathfinder_ai.application.interview_preparation import (
    InterviewPreparation,
)
from pathfinder_ai.domain.candidate_profile import (
    CandidatePreferences,
    CandidateProfile,
    Certification,
    EducationRecord,
    Project,
    WorkExperience,
    WorkMode,
)
from pathfinder_ai.domain.education import EducationLevel
from pathfinder_ai.domain.explanation import (
    MatchExplanation,
)
from pathfinder_ai.domain.job_description import (
    CompanyInfo,
    EducationRequirement,
    ExperienceRequirement,
    JobDescription,
    Responsibility,
)
from pathfinder_ai.domain.job_title import JobTitle
from pathfinder_ai.domain.matching import MatchScore
from pathfinder_ai.domain.skill import Skill


class BaseStrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


# ---------------------------------------------------------------------------
# Domain Request Schemas (Candidate Profile)
# ---------------------------------------------------------------------------


class SkillSchema(BaseStrictModel):
    name: str


class JobTitleSchema(BaseStrictModel):
    title: str


class WorkExperienceSchema(BaseStrictModel):
    role_title: JobTitleSchema
    company_name: str | None = None
    duration_months: int | None = None
    description: str | None = None
    skills: list[SkillSchema] = Field(default_factory=list)


class EducationRecordSchema(BaseStrictModel):
    level: str  # maps to EducationLevel Enum
    field_of_study: str | None = None
    institution: str | None = None
    description: str | None = None


class ProjectSchema(BaseStrictModel):
    name: str
    description: str | None = None
    skills: list[SkillSchema] = Field(default_factory=list)


class CertificationSchema(BaseStrictModel):
    name: str
    issuer: str | None = None
    description: str | None = None


class CandidatePreferencesSchema(BaseStrictModel):
    target_titles: list[JobTitleSchema] = Field(default_factory=list)
    preferred_locations: list[str] = Field(default_factory=list)
    acceptable_work_modes: list[str] = Field(default_factory=list)


class CandidateProfileSchema(BaseStrictModel):
    skills: list[SkillSchema] = Field(default_factory=list)
    experience: list[WorkExperienceSchema] = Field(default_factory=list)
    education: list[EducationRecordSchema] = Field(default_factory=list)
    projects: list[ProjectSchema] = Field(default_factory=list)
    certifications: list[CertificationSchema] = Field(default_factory=list)
    preferences: CandidatePreferencesSchema | None = None


# ---------------------------------------------------------------------------
# Domain Request Schemas (Job Description)
# ---------------------------------------------------------------------------


class CompanyInfoSchema(BaseStrictModel):
    name: str
    industry: str | None = None
    location: str | None = None


class ResponsibilitySchema(BaseStrictModel):
    description: str


class ExperienceRequirementSchema(BaseStrictModel):
    minimum_years: int | None = None
    maximum_years: int | None = None


class EducationRequirementSchema(BaseStrictModel):
    level: str | None = None
    field_of_study: str | None = None
    description: str | None = None


class JobDescriptionSchema(BaseStrictModel):
    title: JobTitleSchema
    responsibilities: list[ResponsibilitySchema] = Field(default_factory=list)
    required_skills: list[SkillSchema] = Field(default_factory=list)
    preferred_skills: list[SkillSchema] = Field(default_factory=list)
    company_info: CompanyInfoSchema | None = None
    experience_requirement: ExperienceRequirementSchema | None = None
    education_requirement: EducationRequirementSchema | None = None


# ---------------------------------------------------------------------------
# Top-Level Request Schema
# ---------------------------------------------------------------------------


class AnalysisRequestSchema(BaseStrictModel):
    candidate_profile: CandidateProfileSchema
    job_description: JobDescriptionSchema
    include_ai_enrichment: bool = False


# ---------------------------------------------------------------------------
# Domain Response Schemas
# ---------------------------------------------------------------------------


class MatchScoreSchema(BaseStrictModel):
    value: float | None


class ScoreComponentSchema(BaseStrictModel):
    kind: str
    earned_points: float
    possible_points: float


class EvidenceSourceSchema(BaseStrictModel):
    kind: str
    label: str | None


class MatchedSkillEvidenceSchema(BaseStrictModel):
    skill: SkillSchema
    is_required: bool
    evidence_sources: list[EvidenceSourceSchema]


class ExperienceEvidenceSchema(BaseStrictModel):
    required_months: int
    known_candidate_months: int
    earned_points: float
    possible_points: float


class ExperienceGapSchema(BaseStrictModel):
    required_months: int
    known_candidate_months: int
    missing_months: int


class EducationEvidenceSchema(BaseStrictModel):
    requirement: EducationRequirementSchema
    matched_record: EducationRecordSchema | None
    satisfied: bool


class GapAnalysisSchema(BaseStrictModel):
    missing_required_skills: list[SkillSchema]
    missing_preferred_skills: list[SkillSchema]
    experience_gap: ExperienceGapSchema | None
    education_gap: EducationRequirementSchema | None


class SkillKeywordCoverageSchema(BaseStrictModel):
    matched_keywords: list[SkillSchema]
    missing_keywords: list[SkillSchema]
    percentage: float | None


class MatchExplanationSchema(BaseStrictModel):
    score: MatchScoreSchema
    components: list[ScoreComponentSchema]
    matched_skills: list[MatchedSkillEvidenceSchema]
    experience: ExperienceEvidenceSchema | None
    education: EducationEvidenceSchema | None
    gaps: GapAnalysisSchema
    keyword_coverage: SkillKeywordCoverageSchema


class InterviewThemeSchema(BaseStrictModel):
    kind: str
    description: str


class TalkingPointSchema(BaseStrictModel):
    description: str


class InterviewerQuestionSchema(BaseStrictModel):
    description: str


class InterviewPreparationSchema(BaseStrictModel):
    themes: list[InterviewThemeSchema]
    talking_points: list[TalkingPointSchema]
    question_categories: list[str]
    candidate_questions: list[InterviewerQuestionSchema]


class AIEnrichmentResultSchema(BaseStrictModel):
    content: str
    provider_name: str


class AnalysisResponseSchema(BaseStrictModel):
    score: MatchScoreSchema
    explanation: MatchExplanationSchema
    interview_preparation: InterviewPreparationSchema
    ai_enrichment: AIEnrichmentResultSchema | None


# ---------------------------------------------------------------------------
# Mappers: Schema -> Domain
# ---------------------------------------------------------------------------


def map_candidate_profile(schema: CandidateProfileSchema) -> CandidateProfile:
    return CandidateProfile(
        skills=tuple(Skill(name=s.name) for s in schema.skills),
        experience=tuple(
            WorkExperience(
                role_title=JobTitle(title=e.role_title.title),
                company_name=e.company_name,
                duration_months=e.duration_months,
                description=e.description,
                skills=tuple(Skill(name=s.name) for s in e.skills),
            )
            for e in schema.experience
        ),
        education=tuple(
            EducationRecord(
                level=EducationLevel(e.level),
                field_of_study=e.field_of_study,
                institution=e.institution,
                description=e.description,
            )
            for e in schema.education
        ),
        projects=tuple(
            Project(
                name=p.name,
                description=p.description,
                skills=tuple(Skill(name=s.name) for s in p.skills),
            )
            for p in schema.projects
        ),
        certifications=tuple(
            Certification(
                name=c.name,
                issuer=c.issuer,
                description=c.description,
            )
            for c in schema.certifications
        ),
        preferences=(
            CandidatePreferences(
                target_titles=tuple(
                    JobTitle(title=t.title) for t in schema.preferences.target_titles
                ),
                preferred_locations=tuple(schema.preferences.preferred_locations),
                acceptable_work_modes=tuple(
                    WorkMode(m) for m in schema.preferences.acceptable_work_modes
                ),
            )
            if schema.preferences
            else None
        ),
    )


def map_job_description(schema: JobDescriptionSchema) -> JobDescription:
    return JobDescription(
        title=JobTitle(title=schema.title.title),
        responsibilities=tuple(
            Responsibility(description=r.description) for r in schema.responsibilities
        ),
        required_skills=tuple(Skill(name=s.name) for s in schema.required_skills),
        preferred_skills=tuple(Skill(name=s.name) for s in schema.preferred_skills),
        company_info=(
            CompanyInfo(
                name=schema.company_info.name,
                industry=schema.company_info.industry,
                location=schema.company_info.location,
            )
            if schema.company_info
            else None
        ),
        experience_requirement=(
            ExperienceRequirement(
                minimum_years=schema.experience_requirement.minimum_years,
                maximum_years=schema.experience_requirement.maximum_years,
            )
            if schema.experience_requirement
            else None
        ),
        education_requirement=(
            EducationRequirement(
                level=(
                    EducationLevel(schema.education_requirement.level)
                    if schema.education_requirement.level
                    else None
                ),
                field_of_study=schema.education_requirement.field_of_study,
                description=schema.education_requirement.description,
            )
            if schema.education_requirement
            else None
        ),
    )


# ---------------------------------------------------------------------------
# Mappers: Domain -> Schema
# ---------------------------------------------------------------------------


def map_score_to_schema(domain: MatchScore) -> MatchScoreSchema:
    return MatchScoreSchema(value=domain.value)


def map_explanation_to_schema(domain: MatchExplanation) -> MatchExplanationSchema:
    return MatchExplanationSchema(
        score=map_score_to_schema(domain.score),
        components=[
            ScoreComponentSchema(
                kind=c.kind.value,
                earned_points=c.earned_points,
                possible_points=c.possible_points,
            )
            for c in domain.components
        ],
        matched_skills=[
            MatchedSkillEvidenceSchema(
                skill=SkillSchema(name=ms.skill.name),
                is_required=ms.is_required,
                evidence_sources=[
                    EvidenceSourceSchema(kind=es.kind.value, label=es.label)
                    for es in ms.evidence_sources
                ],
            )
            for ms in domain.matched_skills
        ],
        experience=(
            ExperienceEvidenceSchema(
                required_months=domain.experience.required_months,
                known_candidate_months=domain.experience.known_candidate_months,
                earned_points=domain.experience.earned_points,
                possible_points=domain.experience.possible_points,
            )
            if domain.experience
            else None
        ),
        education=(
            EducationEvidenceSchema(
                requirement=EducationRequirementSchema(
                    level=domain.education.requirement.level.value
                    if domain.education.requirement.level
                    else None,
                    field_of_study=domain.education.requirement.field_of_study,
                    description=domain.education.requirement.description,
                ),
                matched_record=(
                    EducationRecordSchema(
                        level=domain.education.matched_record.level.value,
                        field_of_study=domain.education.matched_record.field_of_study,
                        institution=domain.education.matched_record.institution,
                        description=domain.education.matched_record.description,
                    )
                    if domain.education.matched_record
                    else None
                ),
                satisfied=domain.education.satisfied,
            )
            if domain.education
            else None
        ),
        gaps=GapAnalysisSchema(
            missing_required_skills=[
                SkillSchema(name=s.name) for s in domain.gaps.missing_required_skills
            ],
            missing_preferred_skills=[
                SkillSchema(name=s.name) for s in domain.gaps.missing_preferred_skills
            ],
            experience_gap=(
                ExperienceGapSchema(
                    required_months=domain.gaps.experience_gap.required_months,
                    known_candidate_months=domain.gaps.experience_gap.known_candidate_months,
                    missing_months=domain.gaps.experience_gap.missing_months,
                )
                if domain.gaps.experience_gap
                else None
            ),
            education_gap=(
                EducationRequirementSchema(
                    level=domain.gaps.education_gap.level.value
                    if domain.gaps.education_gap.level
                    else None,
                    field_of_study=domain.gaps.education_gap.field_of_study,
                    description=domain.gaps.education_gap.description,
                )
                if domain.gaps.education_gap
                else None
            ),
        ),
        keyword_coverage=SkillKeywordCoverageSchema(
            matched_keywords=[
                SkillSchema(name=s.name)
                for s in domain.keyword_coverage.matched_keywords
            ],
            missing_keywords=[
                SkillSchema(name=s.name)
                for s in domain.keyword_coverage.missing_keywords
            ],
            percentage=domain.keyword_coverage.percentage,
        ),
    )


def map_interview_prep_to_schema(
    domain: InterviewPreparation,
) -> InterviewPreparationSchema:
    return InterviewPreparationSchema(
        themes=[
            InterviewThemeSchema(kind=t.kind.value, description=t.description)
            for t in domain.themes
        ],
        talking_points=[
            TalkingPointSchema(description=t.description) for t in domain.talking_points
        ],
        question_categories=[c.value for c in domain.question_categories],
        candidate_questions=[
            InterviewerQuestionSchema(description=q.description)
            for q in domain.candidate_questions
        ],
    )


def map_ai_enrichment_to_schema(
    domain: AIEnrichmentResult | None,
) -> AIEnrichmentResultSchema | None:
    if domain is None:
        return None
    return AIEnrichmentResultSchema(
        content=domain.content,
        provider_name=domain.provider_name,
    )


def map_analysis_response(
    score: MatchScore,
    explanation: MatchExplanation,
    interview_preparation: InterviewPreparation,
    ai_enrichment: AIEnrichmentResult | None,
) -> AnalysisResponseSchema:
    return AnalysisResponseSchema(
        score=map_score_to_schema(score),
        explanation=map_explanation_to_schema(explanation),
        interview_preparation=map_interview_prep_to_schema(interview_preparation),
        ai_enrichment=map_ai_enrichment_to_schema(ai_enrichment),
    )
