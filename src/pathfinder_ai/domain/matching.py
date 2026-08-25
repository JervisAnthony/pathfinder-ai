"""
Matching Domain Models and Engine.
"""

from dataclasses import dataclass

from .candidate_profile import CandidateProfile, EducationRecord
from .explanation import (
    EducationEvidence,
    EvidenceSource,
    EvidenceSourceKind,
    ExperienceEvidence,
    ExperienceGap,
    GapAnalysis,
    MatchedSkillEvidence,
    MatchExplanation,
    ScoreComponent,
    ScoreComponentKind,
    SkillKeywordCoverage,
)
from .job_description import EducationRequirement, JobDescription
from .skill import Skill


@dataclass(frozen=True, slots=True)
class MatchScore:
    value: float | None

    def __post_init__(self) -> None:
        if self.value is not None:
            if self.value < 0.0 or self.value > 100.0:
                raise ValueError(
                    "MatchScore value must be between 0.0 and 100.0, or None."
                )


class DeterministicMatcher:
    """Deterministic matcher for comparing CandidateProfile to JobDescription."""

    def match(
        self, candidate_profile: CandidateProfile, job_description: JobDescription
    ) -> MatchScore:
        """
        Evaluate structured compatibility between candidate evidence and job
        requirements.
        """
        return self.explain(candidate_profile, job_description).score

    def explain(
        self, candidate_profile: CandidateProfile, job_description: JobDescription
    ) -> MatchExplanation:
        components: list[ScoreComponent] = []
        matched_skills: list[MatchedSkillEvidence] = []
        missing_req_skills: list[Skill] = []
        missing_pref_skills: list[Skill] = []

        # Skill source mapping
        skill_sources: dict[Skill, list[EvidenceSource]] = {}

        def add_source(skill: Skill, source: EvidenceSource) -> None:
            if skill not in skill_sources:
                skill_sources[skill] = []
            skill_sources[skill].append(source)

        for skill in candidate_profile.skills:
            add_source(
                skill, EvidenceSource(kind=EvidenceSourceKind.PROFILE, label=None)
            )

        for exp in candidate_profile.experience:
            for skill in exp.skills:
                add_source(
                    skill,
                    EvidenceSource(
                        kind=EvidenceSourceKind.WORK_EXPERIENCE,
                        label=exp.role_title.title,
                    ),
                )

        for proj in candidate_profile.projects:
            for skill in proj.skills:
                add_source(
                    skill,
                    EvidenceSource(kind=EvidenceSourceKind.PROJECT, label=proj.name),
                )

        # 1. Score Skills
        req_possible = 0.0
        req_earned = 0.0
        for req_skill in job_description.required_skills:
            req_possible += 1.0
            if req_skill in skill_sources:
                req_earned += 1.0
                matched_skills.append(
                    MatchedSkillEvidence(
                        skill=req_skill,
                        is_required=True,
                        evidence_sources=tuple(skill_sources[req_skill]),
                    )
                )
            else:
                missing_req_skills.append(req_skill)

        if req_possible > 0:
            components.append(
                ScoreComponent(
                    kind=ScoreComponentKind.REQUIRED_SKILLS,
                    earned_points=req_earned,
                    possible_points=req_possible,
                )
            )

        pref_possible = 0.0
        pref_earned = 0.0
        for pref_skill in job_description.preferred_skills:
            pref_possible += 0.5
            if pref_skill in skill_sources:
                pref_earned += 0.5
                matched_skills.append(
                    MatchedSkillEvidence(
                        skill=pref_skill,
                        is_required=False,
                        evidence_sources=tuple(skill_sources[pref_skill]),
                    )
                )
            else:
                missing_pref_skills.append(pref_skill)

        if pref_possible > 0:
            components.append(
                ScoreComponent(
                    kind=ScoreComponentKind.PREFERRED_SKILLS,
                    earned_points=pref_earned,
                    possible_points=pref_possible,
                )
            )

        # Keyword Coverage
        total_keywords = len(job_description.required_skills) + len(
            job_description.preferred_skills
        )
        matched_keywords_list = []
        missing_keywords_list = []

        for req_skill in job_description.required_skills:
            if req_skill in skill_sources:
                matched_keywords_list.append(req_skill)
            else:
                missing_keywords_list.append(req_skill)

        for pref_skill in job_description.preferred_skills:
            if pref_skill in skill_sources:
                matched_keywords_list.append(pref_skill)
            else:
                missing_keywords_list.append(pref_skill)

        kw_percentage = None
        if total_keywords > 0:
            kw_percentage = (len(matched_keywords_list) / total_keywords) * 100

        keyword_coverage = SkillKeywordCoverage(
            matched_keywords=tuple(matched_keywords_list),
            missing_keywords=tuple(missing_keywords_list),
            percentage=kw_percentage,
        )

        # 2. Score Experience
        exp_evidence = None
        exp_gap = None

        if (
            job_description.experience_requirement
            and job_description.experience_requirement.minimum_years is not None
            and job_description.experience_requirement.minimum_years > 0
        ):
            min_months = job_description.experience_requirement.minimum_years * 12
            candidate_months = sum(
                exp.duration_months
                for exp in candidate_profile.experience
                if exp.duration_months is not None
            )

            exp_credit = min(1.0, candidate_months / min_months)

            exp_evidence = ExperienceEvidence(
                required_months=min_months,
                known_candidate_months=candidate_months,
                earned_points=exp_credit,
                possible_points=1.0,
            )

            components.append(
                ScoreComponent(
                    kind=ScoreComponentKind.EXPERIENCE,
                    earned_points=exp_credit,
                    possible_points=1.0,
                )
            )

            if candidate_months < min_months:
                exp_gap = ExperienceGap(
                    required_months=min_months,
                    known_candidate_months=candidate_months,
                    missing_months=min_months - candidate_months,
                )

        # 3. Score Education
        edu_evidence = None
        edu_gap = None

        if job_description.education_requirement and (
            job_description.education_requirement.level is not None
            or job_description.education_requirement.field_of_study is not None
        ):
            matched_record = self._satisfies_education_record(
                candidate_profile, job_description.education_requirement
            )

            satisfied = matched_record is not None
            earned = 1.0 if satisfied else 0.0

            edu_evidence = EducationEvidence(
                requirement=job_description.education_requirement,
                matched_record=matched_record,
                satisfied=satisfied,
            )

            components.append(
                ScoreComponent(
                    kind=ScoreComponentKind.EDUCATION,
                    earned_points=earned,
                    possible_points=1.0,
                )
            )

            if not satisfied:
                edu_gap = job_description.education_requirement

        # 4. Total Calculation
        total_possible = sum(c.possible_points for c in components)
        total_earned = sum(c.earned_points for c in components)

        if total_possible == 0.0:
            final_score_obj = MatchScore(value=None)
        else:
            final_score = (total_earned / total_possible) * 100
            final_score_obj = MatchScore(value=round(final_score, 2))

        gap_analysis = GapAnalysis(
            missing_required_skills=tuple(missing_req_skills),
            missing_preferred_skills=tuple(missing_pref_skills),
            experience_gap=exp_gap,
            education_gap=edu_gap,
        )

        return MatchExplanation(
            score=final_score_obj,
            components=tuple(components),
            matched_skills=tuple(matched_skills),
            experience=exp_evidence,
            education=edu_evidence,
            gaps=gap_analysis,
            keyword_coverage=keyword_coverage,
        )

    def _satisfies_education_record(
        self, candidate_profile: CandidateProfile, req: "EducationRequirement"
    ) -> "EducationRecord | None":
        """
        Check if any candidate education record fully satisfies the scoreable
        structured education requirement, and return the first matched record.
        """
        from .education import EducationLevel

        # Define hierarchy
        level_order = {
            EducationLevel.HIGH_SCHOOL: 1,
            EducationLevel.ASSOCIATE: 2,
            EducationLevel.BACHELOR: 3,
            EducationLevel.MASTER: 4,
            EducationLevel.DOCTORATE: 5,
        }

        for record in candidate_profile.education:
            level_satisfied = False
            if req.level is None:
                level_satisfied = True
            elif (
                req.level == EducationLevel.OTHER
                or record.level == EducationLevel.OTHER
            ):
                level_satisfied = req.level == record.level
            else:
                level_satisfied = level_order.get(record.level, 0) >= level_order.get(
                    req.level, 0
                )

            field_satisfied = False
            if req.field_of_study is None:
                field_satisfied = True
            elif record.field_of_study is not None:
                field_satisfied = (
                    req.field_of_study.casefold() == record.field_of_study.casefold()
                )

            if level_satisfied and field_satisfied:
                return record

        return None
