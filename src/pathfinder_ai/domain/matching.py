"""
Matching Domain Models and Engine.
"""

from dataclasses import dataclass

from .candidate_profile import CandidateProfile
from .job_description import EducationRequirement, JobDescription
from .skill import Skill


@dataclass(frozen=True, slots=True)
class MatchScore:
    value: float | None


class DeterministicMatcher:
    """Deterministic matcher for comparing CandidateProfile to JobDescription."""

    def match(
        self, candidate_profile: CandidateProfile, job_description: JobDescription
    ) -> MatchScore:
        """
        Evaluate structured compatibility between candidate evidence and job
        requirements.
        """
        possible_points: float = 0.0
        earned_points: float = 0.0

        # We need a unified skill set that ignores duplicated evidence
        candidate_skills = self._extract_unique_skills(candidate_profile)

        # 1. Score Skills
        for req_skill in job_description.required_skills:
            possible_points += 1.0
            if req_skill in candidate_skills:
                earned_points += 1.0

        for pref_skill in job_description.preferred_skills:
            possible_points += 0.5
            if pref_skill in candidate_skills:
                earned_points += 0.5

        # 2. Score Experience
        if (
            job_description.experience_requirement
            and job_description.experience_requirement.minimum_years is not None
        ):
            possible_points += 1.0
            min_months = job_description.experience_requirement.minimum_years * 12

            candidate_months = 0
            for exp in candidate_profile.experience:
                if exp.duration_months is not None:
                    candidate_months += exp.duration_months

            if min_months > 0:
                exp_credit = min(1.0, candidate_months / min_months)
                earned_points += exp_credit
            else:
                earned_points += 1.0

        # 3. Score Education
        if job_description.education_requirement and (
            job_description.education_requirement.level is not None
            or job_description.education_requirement.field_of_study is not None
        ):
            possible_points += 1.0
            if self._satisfies_education(
                candidate_profile, job_description.education_requirement
            ):
                earned_points += 1.0

        # 4. Total Calculation
        if possible_points == 0.0:
            return MatchScore(value=None)

        final_score = (earned_points / possible_points) * 100
        return MatchScore(value=round(final_score, 2))

    def _satisfies_education(
        self, candidate_profile: CandidateProfile, req: "EducationRequirement"
    ) -> bool:
        """
        Check if any candidate education record fully satisfies the scoreable
        structured education requirement.
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
                    req.field_of_study.lower() == record.field_of_study.lower()
                )

            if level_satisfied and field_satisfied:
                return True

        return False

    def _extract_unique_skills(self, candidate_profile: CandidateProfile) -> set[Skill]:
        """
        Collect unique canonical skills across CandidateProfile evidence.
        Duplicate evidence does not increase weight.
        """
        unique_skills = set(candidate_profile.skills)

        for experience in candidate_profile.experience:
            unique_skills.update(experience.skills)

        for project in candidate_profile.projects:
            unique_skills.update(project.skills)

        return unique_skills
