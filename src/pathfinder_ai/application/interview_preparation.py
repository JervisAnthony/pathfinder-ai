"""
Interview Preparation Application Service and Models.
"""

from dataclasses import dataclass
from enum import StrEnum

from pathfinder_ai.domain import (
    CandidateProfile,
    DeterministicMatcher,
    EvidenceSourceKind,
    JobDescription,
    MatchExplanation,
)


def _normalize_text(value: str, type_name: str) -> str:
    normalized = " ".join(value.split())
    if not normalized:
        raise ValueError(f"{type_name} description cannot be blank.")
    return normalized


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

    def __post_init__(self) -> None:
        object.__setattr__(
            self,
            "description",
            _normalize_text(self.description, type(self).__name__),
        )


@dataclass(frozen=True, slots=True)
class TalkingPoint:
    description: str

    def __post_init__(self) -> None:
        object.__setattr__(
            self,
            "description",
            _normalize_text(self.description, type(self).__name__),
        )


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

    def __post_init__(self) -> None:
        object.__setattr__(
            self,
            "description",
            _normalize_text(self.description, type(self).__name__),
        )


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
        required_skills = job_description.required_skills
        preferred_skills = job_description.preferred_skills
        required_skill_set = set(required_skills)
        preferred_skill_set = set(preferred_skills)
        gaps = match_explanation.gaps

        self._reject_duplicates(gaps.missing_required_skills, "missing required skills")
        self._reject_duplicates(
            gaps.missing_preferred_skills, "missing preferred skills"
        )
        self._reject_duplicates(
            match_explanation.keyword_coverage.matched_keywords,
            "matched keywords",
        )
        self._reject_duplicates(
            match_explanation.keyword_coverage.missing_keywords,
            "missing keywords",
        )

        seen_matched_skills = set()

        for matched_evidence in match_explanation.matched_skills:
            if matched_evidence.skill in seen_matched_skills:
                raise ValueError("Duplicate matched evidence for skill.")
            seen_matched_skills.add(matched_evidence.skill)

            if not matched_evidence.evidence_sources:
                raise ValueError("Matched skill must contain evidence.")

            if matched_evidence.is_required:
                if matched_evidence.skill not in required_skill_set:
                    raise ValueError(
                        f"Matched required skill '{matched_evidence.skill}' "
                        "is not required by the job."
                    )
            else:
                if matched_evidence.skill not in preferred_skill_set:
                    raise ValueError(
                        f"Matched preferred skill '{matched_evidence.skill}' "
                        "is not preferred by the job."
                    )

            if matched_evidence.skill in gaps.missing_required_skills:
                raise ValueError(
                    f"Skill '{matched_evidence.skill}' matched and missing (required)."
                )
            if matched_evidence.skill in gaps.missing_preferred_skills:
                raise ValueError(
                    f"Skill '{matched_evidence.skill}' matched and missing (preferred)."
                )

            for source in matched_evidence.evidence_sources:
                if source.kind == EvidenceSourceKind.PROFILE:
                    if matched_evidence.skill not in candidate_profile.skills:
                        raise ValueError(
                            "Profile evidence for skill not in CandidateProfile."
                        )
                elif source.kind == EvidenceSourceKind.WORK_EXPERIENCE:
                    matching_experiences = tuple(
                        experience
                        for experience in candidate_profile.experience
                        if experience.role_title.title == source.label
                    )
                    if not matching_experiences:
                        raise ValueError(
                            f"Work experience '{source.label}' not in CandidateProfile."
                        )
                    if not any(
                        matched_evidence.skill in experience.skills
                        for experience in matching_experiences
                    ):
                        raise ValueError(
                            "Skill evidence missing in candidate experience."
                        )
                elif source.kind == EvidenceSourceKind.PROJECT:
                    matching_projects = tuple(
                        project
                        for project in candidate_profile.projects
                        if project.name == source.label
                    )
                    if not matching_projects:
                        raise ValueError(
                            f"Project '{source.label}' not in CandidateProfile."
                        )
                    if not any(
                        matched_evidence.skill in project.skills
                        for project in matching_projects
                    ):
                        raise ValueError("Skill evidence missing in candidate project.")

        for skill in required_skills:
            if (
                skill not in seen_matched_skills
                and skill not in gaps.missing_required_skills
            ):
                raise ValueError(
                    f"Required skill '{skill}' missing from explanation partition."
                )
        for skill in preferred_skills:
            if (
                skill not in seen_matched_skills
                and skill not in gaps.missing_preferred_skills
            ):
                raise ValueError(
                    f"Preferred skill '{skill}' missing from explanation partition."
                )

        for skill in gaps.missing_required_skills:
            if skill not in required_skill_set:
                raise ValueError("Missing required skill not in job requirements.")
        for skill in gaps.missing_preferred_skills:
            if skill not in preferred_skill_set:
                raise ValueError("Missing preferred skill not in job requirements.")

        expected_matched_keywords = tuple(
            skill
            for skill in (*required_skills, *preferred_skills)
            if skill in seen_matched_skills
        )
        expected_missing_keywords = tuple(
            skill
            for skill in (*required_skills, *preferred_skills)
            if skill not in seen_matched_skills
        )

        if (
            match_explanation.keyword_coverage.matched_keywords
            != expected_matched_keywords
        ):
            raise ValueError(
                "Keyword coverage matched skills do not match exact job matched skills."
            )
        if (
            match_explanation.keyword_coverage.missing_keywords
            != expected_missing_keywords
        ):
            raise ValueError(
                "Keyword coverage missing skills do not match exact job missing skills."
            )

        self._validate_experience(candidate_profile, job_description, match_explanation)
        self._validate_education(candidate_profile, job_description, match_explanation)

    @staticmethod
    def _reject_duplicates(items: tuple[object, ...], label: str) -> None:
        if len(items) != len(set(items)):
            raise ValueError(f"Duplicate {label} are not allowed.")

    def _validate_experience(
        self,
        candidate_profile: CandidateProfile,
        job_description: JobDescription,
        match_explanation: MatchExplanation,
    ) -> None:
        requirement = job_description.experience_requirement
        minimum_years = requirement.minimum_years if requirement is not None else None
        evidence = match_explanation.experience
        gap = match_explanation.gaps.experience_gap

        if minimum_years is None or minimum_years <= 0:
            if evidence is not None or gap is not None:
                raise ValueError(
                    "Experience evidence supplied for non-scoreable job requirement."
                )
            return

        if evidence is None:
            raise ValueError(
                "Experience evidence missing for scoreable job requirement."
            )

        required_months = minimum_years * 12
        candidate_months = sum(
            experience.duration_months
            for experience in candidate_profile.experience
            if experience.duration_months is not None
        )

        if evidence.required_months != required_months:
            raise ValueError(
                "Experience evidence required months do not match job description."
            )
        if evidence.known_candidate_months != candidate_months:
            raise ValueError(
                "Experience evidence known months do not match CandidateProfile."
            )

        missing_months = required_months - candidate_months
        if missing_months > 0:
            if gap is None:
                raise ValueError("Experience gap missing when one is required.")
            if gap.required_months != required_months:
                raise ValueError(
                    "Experience gap required months do not match job description."
                )
            if gap.known_candidate_months != candidate_months:
                raise ValueError(
                    "Experience gap known months do not match CandidateProfile."
                )
            if gap.missing_months != missing_months:
                raise ValueError("Experience gap missing months are inconsistent.")
        elif gap is not None:
            raise ValueError("Experience gap exists when none is expected.")

    def _validate_education(
        self,
        candidate_profile: CandidateProfile,
        job_description: JobDescription,
        match_explanation: MatchExplanation,
    ) -> None:
        requirement = job_description.education_requirement
        is_scoreable = requirement is not None and (
            requirement.level is not None or requirement.field_of_study is not None
        )
        evidence = match_explanation.education
        gap = match_explanation.gaps.education_gap

        if not is_scoreable:
            if evidence is not None or gap is not None:
                raise ValueError(
                    "Education evidence supplied for non-scoreable job requirement."
                )
            return

        if evidence is None:
            raise ValueError(
                "Education evidence missing for scoreable job requirement."
            )
        if evidence.requirement != requirement:
            raise ValueError(
                "Education evidence requirement does not match JobDescription."
            )
        if evidence.matched_record is not None and (
            evidence.matched_record not in candidate_profile.education
        ):
            raise ValueError("Matched education record not found in CandidateProfile.")

        canonical = DeterministicMatcher().explain(candidate_profile, job_description)
        if evidence != canonical.education:
            raise ValueError(
                "Education evidence does not match deterministic matcher result."
            )
        if gap != canonical.gaps.education_gap:
            raise ValueError(
                "Education gap does not match deterministic matcher result."
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
                s_name = matched.skill.name
                if source.kind == "profile":
                    desc = f"{s_name} evidence from profile"
                    points.append(TalkingPoint(description=desc))
                elif source.kind == "work_experience":
                    desc = f"{s_name} evidence from work experience: {source.label}"
                    points.append(TalkingPoint(description=desc))
                elif source.kind == "project":
                    desc = f"{s_name} evidence from project: {source.label}"
                    points.append(TalkingPoint(description=desc))

        if match_explanation.experience is not None:
            kn = match_explanation.experience.known_candidate_months
            rq = match_explanation.experience.required_months
            points.append(TalkingPoint(description=f"Known candidate months: {kn}"))
            points.append(TalkingPoint(description=f"Required months: {rq}"))
            if match_explanation.gaps.experience_gap is not None:
                ms = match_explanation.gaps.experience_gap.missing_months
                points.append(
                    TalkingPoint(description=f"Minimum not met. Missing months: {ms}")
                )
            else:
                points.append(
                    TalkingPoint(description="Minimum experience requirement is met.")
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
                    InterviewerQuestion(description=f"Day-to-day: {resp.description}?")
                )
            elif i == 1:
                questions.append(
                    InterviewerQuestion(
                        description=f"Success definition: {resp.description}?"
                    )
                )

        # Required Skills
        for req_skill in job_description.required_skills:
            desc = f"How is {req_skill.name} used day to day in this role?"
            questions.append(InterviewerQuestion(description=desc))

        # Preferred Skills
        for pref_skill in job_description.preferred_skills:
            desc = f"How does {pref_skill.name} fit into the team's workflow?"
            questions.append(InterviewerQuestion(description=desc))

        return tuple(questions)
