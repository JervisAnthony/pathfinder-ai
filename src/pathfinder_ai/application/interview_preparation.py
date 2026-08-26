"""
Interview Preparation Application Service and Models.
"""

from dataclasses import dataclass
from enum import StrEnum

from pathfinder_ai.domain import (
    CandidateProfile,
    JobDescription,
    MatchExplanation,
)


class InterviewThemeKind(StrEnum):
    REQUIRED_SKILL_STRENGTH = "required_skill_strength"
    PREFERRED_SKILL_STRENGTH = "preferred_skill_strength"
    REQUIRED_SKILL_GAP = "required_skill_gap"
    PREFERRED_SKILL_GAP = "preferred_skill_gap"
    EXPERIENCE_STRENGTH = "experience_strength"
    EXPERIENCE_GAP = "experience_gap"
    EDUCATION_ALIGNMENT = "education_alignment"
    EDUCATION_GAP = "education_gap"
    RESPONSIBILITY_DISCUSSION = "responsibility_discussion"


@dataclass(frozen=True, slots=True)
class InterviewTheme:
    kind: InterviewThemeKind
    description: str


@dataclass(frozen=True, slots=True)
class TalkingPoint:
    description: str


class InterviewQuestionCategory(StrEnum):
    REQUIRED_SKILL_VALIDATION = "required_skill_validation"
    PREFERRED_SKILL_DEPTH = "preferred_skill_depth"
    MISSING_REQUIRED_SKILL_CLARIFICATION = "missing_required_skill_clarification"
    PREFERRED_SKILL_GAP_DISCUSSION = "preferred_skill_gap_discussion"
    EXPERIENCE_DISCUSSION = "experience_discussion"
    EXPERIENCE_GAP_DISCUSSION = "experience_gap_discussion"
    EDUCATION_DISCUSSION = "education_discussion"
    RESPONSIBILITY_DISCUSSION = "responsibility_discussion"


@dataclass(frozen=True, slots=True)
class InterviewerQuestion:
    description: str


@dataclass(frozen=True, slots=True)
class InterviewPreparation:
    themes: tuple[InterviewTheme, ...]
    talking_points: tuple[TalkingPoint, ...]
    question_categories: tuple[InterviewQuestionCategory, ...]
    candidate_questions: tuple[InterviewerQuestion, ...]

    def __post_init__(self) -> None:
        object.__setattr__(self, "themes", tuple(self.themes))
        object.__setattr__(self, "talking_points", tuple(self.talking_points))
        object.__setattr__(self, "question_categories", tuple(self.question_categories))
        object.__setattr__(self, "candidate_questions", tuple(self.candidate_questions))


class DeterministicInterviewPreparer:
    """Deterministic generator for interview preparation material."""

    def prepare(
        self,
        candidate_profile: CandidateProfile,
        job_description: JobDescription,
        match_explanation: MatchExplanation,
    ) -> InterviewPreparation:
        """
        Generate deterministic interview preparation from candidate and job analysis.
        """
        self._validate_consistency(
            candidate_profile, job_description, match_explanation
        )

        themes = self._generate_themes(job_description, match_explanation)

        talking_points = self._generate_talking_points(match_explanation)
        question_categories = self._generate_question_categories(
            job_description, match_explanation
        )
        candidate_questions = self._generate_candidate_questions(job_description)

        return InterviewPreparation(
            themes=themes,
            talking_points=talking_points,
            question_categories=question_categories,
            candidate_questions=candidate_questions,
        )

    def _validate_consistency(
        self,
        candidate_profile: CandidateProfile,
        job_description: JobDescription,
        match_explanation: MatchExplanation,
    ) -> None:
        """Ensure explanation does not contradict job description."""
        req_skills_set = set(job_description.required_skills)
        pref_skills_set = set(job_description.preferred_skills)

        for matched_evidence in match_explanation.matched_skills:
            if matched_evidence.is_required:
                if matched_evidence.skill not in req_skills_set:
                    raise ValueError(
                        f"Matched required skill '{matched_evidence.skill}' "
                        "is not required by the job."
                    )
            else:
                if matched_evidence.skill not in pref_skills_set:
                    raise ValueError(
                        f"Matched preferred skill '{matched_evidence.skill}' "
                        "is not preferred by the job."
                    )

            if matched_evidence.skill in match_explanation.gaps.missing_required_skills:
                raise ValueError(
                    f"Skill '{matched_evidence.skill}' matched and missing (required)."
                )
            if (
                matched_evidence.skill
                in match_explanation.gaps.missing_preferred_skills
            ):
                raise ValueError(
                    f"Skill '{matched_evidence.skill}' matched and missing (preferred)."
                )

        # Validate Keyword Coverage consistency with Job Skills
        kw_matched = set(match_explanation.keyword_coverage.matched_keywords)
        kw_missing = set(match_explanation.keyword_coverage.missing_keywords)

        all_job_skills = req_skills_set | pref_skills_set

        for kw in kw_matched:
            if kw not in all_job_skills:
                raise ValueError(f"Matched keyword '{kw}' is not in job skills.")
        for kw in kw_missing:
            if kw not in all_job_skills:
                raise ValueError(f"Missing keyword '{kw}' is not in job skills.")

        # Validate Experience Gap consistency
        if (
            match_explanation.experience is not None
            and match_explanation.gaps.experience_gap is not None
        ):
            if (
                match_explanation.experience.known_candidate_months
                != match_explanation.gaps.experience_gap.known_candidate_months
            ):
                raise ValueError(
                    "Experience evidence and gap known months are inconsistent."
                )
            if (
                match_explanation.experience.required_months
                != match_explanation.gaps.experience_gap.required_months
            ):
                raise ValueError(
                    "Experience evidence and gap required months are inconsistent."
                )

        # Validate Education State Consistency
        if match_explanation.education is not None:
            if (
                match_explanation.education.satisfied
                and match_explanation.gaps.education_gap is not None
            ):
                raise ValueError("Education is satisfied but an education gap exists.")
            if (
                not match_explanation.education.satisfied
                and match_explanation.gaps.education_gap is None
            ):
                raise ValueError(
                    "Education is not satisfied but no education gap exists."
                )

    def _generate_themes(
        self, job_description: JobDescription, match_explanation: MatchExplanation
    ) -> tuple[InterviewTheme, ...]:
        themes: list[InterviewTheme] = []

        # 1. Required Skill Strengths
        for matched in match_explanation.matched_skills:
            if matched.is_required:
                themes.append(
                    InterviewTheme(
                        kind=InterviewThemeKind.REQUIRED_SKILL_STRENGTH,
                        description=f"Required skill: {matched.skill.name}",
                    )
                )

        # 2. Preferred Skill Strengths
        for matched in match_explanation.matched_skills:
            if not matched.is_required:
                themes.append(
                    InterviewTheme(
                        kind=InterviewThemeKind.PREFERRED_SKILL_STRENGTH,
                        description=f"Preferred skill: {matched.skill.name}",
                    )
                )

        # 3. Required Skill Gaps
        for missing_req in match_explanation.gaps.missing_required_skills:
            themes.append(
                InterviewTheme(
                    kind=InterviewThemeKind.REQUIRED_SKILL_GAP,
                    description=f"Missing required skill: {missing_req.name}",
                )
            )

        # 4. Preferred Skill Gaps
        for missing_pref in match_explanation.gaps.missing_preferred_skills:
            themes.append(
                InterviewTheme(
                    kind=InterviewThemeKind.PREFERRED_SKILL_GAP,
                    description=f"Missing preferred skill: {missing_pref.name}",
                )
            )

        # 5. Experience
        if match_explanation.experience is not None:
            # Strength
            if (
                match_explanation.experience.known_candidate_months
                >= match_explanation.experience.required_months
            ):
                themes.append(
                    InterviewTheme(
                        kind=InterviewThemeKind.EXPERIENCE_STRENGTH,
                        description="Meets experience requirement",
                    )
                )

        if match_explanation.gaps.experience_gap is not None:
            themes.append(
                InterviewTheme(
                    kind=InterviewThemeKind.EXPERIENCE_GAP,
                    description="Experience shortfall",
                )
            )

        # 6. Education
        if match_explanation.education is not None:
            if match_explanation.education.satisfied:
                level_str = (
                    match_explanation.education.requirement.level.value
                    if match_explanation.education.requirement.level
                    else "requirement"
                )
                themes.append(
                    InterviewTheme(
                        kind=InterviewThemeKind.EDUCATION_ALIGNMENT,
                        description=f"Education alignment: {level_str}",
                    )
                )

        if match_explanation.gaps.education_gap is not None:
            level_str = (
                match_explanation.gaps.education_gap.level.value
                if match_explanation.gaps.education_gap.level
                else "requirement"
            )
            themes.append(
                InterviewTheme(
                    kind=InterviewThemeKind.EDUCATION_GAP,
                    description=f"Education gap: {level_str}",
                )
            )

        # 7. Responsibilities
        for resp in job_description.responsibilities:
            themes.append(
                InterviewTheme(
                    kind=InterviewThemeKind.RESPONSIBILITY_DISCUSSION,
                    description=f"Role responsibility discussion: {resp.description}",
                )
            )

        return tuple(themes)

    def _generate_talking_points(
        self, match_explanation: MatchExplanation
    ) -> tuple[TalkingPoint, ...]:
        points: list[TalkingPoint] = []

        for matched in match_explanation.matched_skills:
            for source in matched.evidence_sources:
                if source.kind == "profile":
                    points.append(
                        TalkingPoint(
                            description=f"Evidence in profile: {matched.skill.name}"
                        )
                    )
                elif source.kind == "work_experience":
                    points.append(TalkingPoint(description=f"Exp: {source.label}"))
                elif source.kind == "project":
                    points.append(TalkingPoint(description=f"Proj: {source.label}"))

        if match_explanation.experience is not None:
            points.append(TalkingPoint(description="Candidate known experience"))
            if match_explanation.gaps.experience_gap is not None:
                points.append(TalkingPoint(description="Experience gap identified"))
            else:
                points.append(
                    TalkingPoint(
                        description="Candidate meets minimum experience requirement"
                    )
                )

        if match_explanation.education is not None:
            level_str = (
                match_explanation.education.requirement.level.value
                if match_explanation.education.requirement.level
                else "requirement"
            )
            if match_explanation.education.satisfied:
                points.append(
                    TalkingPoint(
                        description=f"Candidate satisfies education {level_str}"
                    )
                )
            else:
                points.append(
                    TalkingPoint(
                        description=f"Candidate does not satisfy education {level_str}"
                    )
                )

        return tuple(points)

    def _generate_question_categories(
        self, job_description: JobDescription, match_explanation: MatchExplanation
    ) -> tuple[InterviewQuestionCategory, ...]:
        categories: set[InterviewQuestionCategory] = set()

        for matched in match_explanation.matched_skills:
            if matched.is_required:
                categories.add(InterviewQuestionCategory.REQUIRED_SKILL_VALIDATION)
            else:
                categories.add(InterviewQuestionCategory.PREFERRED_SKILL_DEPTH)

        if match_explanation.gaps.missing_required_skills:
            categories.add(
                InterviewQuestionCategory.MISSING_REQUIRED_SKILL_CLARIFICATION
            )

        if match_explanation.gaps.missing_preferred_skills:
            categories.add(InterviewQuestionCategory.PREFERRED_SKILL_GAP_DISCUSSION)

        if match_explanation.experience is not None:
            categories.add(InterviewQuestionCategory.EXPERIENCE_DISCUSSION)

        if match_explanation.gaps.experience_gap is not None:
            categories.add(InterviewQuestionCategory.EXPERIENCE_GAP_DISCUSSION)

        if match_explanation.education is not None:
            categories.add(InterviewQuestionCategory.EDUCATION_DISCUSSION)

        if job_description.responsibilities:
            categories.add(InterviewQuestionCategory.RESPONSIBILITY_DISCUSSION)

        # Deterministic sorting based on Enum values for stability
        return tuple(sorted(list(categories), key=lambda c: c.value))

    def _generate_candidate_questions(
        self, job_description: JobDescription
    ) -> tuple[InterviewerQuestion, ...]:
        questions: list[InterviewerQuestion] = []

        # Responsibilities
        for i, resp in enumerate(job_description.responsibilities):
            if i == 0:
                questions.append(
                    InterviewerQuestion(
                        description=f"Day-to-day: {resp.description[:30]}?"
                    )
                )
            elif i == 1:
                questions.append(
                    InterviewerQuestion(
                        description=f"Success for: {resp.description[:30]}?"
                    )
                )

        # Required Skills
        if job_description.required_skills:
            questions.append(
                InterviewerQuestion(
                    description="How is this required skill used day to day?"
                )
            )

        # Preferred Skills
        if job_description.preferred_skills:
            questions.append(
                InterviewerQuestion(
                    description="How does this preferred skill fit workflow?"
                )
            )

        return tuple(questions)
