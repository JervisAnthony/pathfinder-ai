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

    def __post_init__(self) -> None:
        if not self.description or not self.description.strip():
            raise ValueError("InterviewTheme description cannot be blank.")
        from pathfinder_ai.domain._normalization import _normalize_whitespace

        object.__setattr__(self, "description", _normalize_whitespace(self.description))


@dataclass(frozen=True, slots=True)
class TalkingPoint:
    description: str

    def __post_init__(self) -> None:
        if not self.description or not self.description.strip():
            raise ValueError("TalkingPoint description cannot be blank.")
        from pathfinder_ai.domain._normalization import _normalize_whitespace

        object.__setattr__(self, "description", _normalize_whitespace(self.description))


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
        if not self.description or not self.description.strip():
            raise ValueError("InterviewerQuestion description cannot be blank.")
        from pathfinder_ai.domain._normalization import _normalize_whitespace

        object.__setattr__(self, "description", _normalize_whitespace(self.description))


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

        # Profile validation dictionaries
        cand_skills = set(candidate_profile.skills)
        cand_exp_skills = {}
        for exp in candidate_profile.experience:
            cand_exp_skills[exp.role_title.title] = set(exp.skills)
        cand_proj_skills = {}
        for proj in candidate_profile.projects:
            cand_proj_skills[proj.name] = set(proj.skills)

        # Track seen matched skills
        seen_matched_skills = set()

        for matched_evidence in match_explanation.matched_skills:
            if matched_evidence.skill in seen_matched_skills:
                raise ValueError("Duplicate matched evidence for skill.")
            seen_matched_skills.add(matched_evidence.skill)

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

            # Verify candidate profile evidence
            for source in matched_evidence.evidence_sources:
                if source.kind == "profile":
                    if matched_evidence.skill not in cand_skills:
                        raise ValueError(
                            "Profile evidence for skill not in CandidateProfile."
                        )
                elif source.kind == "work_experience":
                    if source.label not in cand_exp_skills:
                        raise ValueError(
                            f"Work experience '{source.label}' not in CandidateProfile."
                        )
                    if matched_evidence.skill not in cand_exp_skills[source.label]:
                        raise ValueError(
                            "Skill evidence missing in candidate experience."
                        )
                elif source.kind == "project":
                    if source.label not in cand_proj_skills:
                        raise ValueError(
                            f"Project '{source.label}' not in CandidateProfile."
                        )
                    if matched_evidence.skill not in cand_proj_skills[source.label]:
                        raise ValueError("Skill evidence missing in candidate project.")

        # Complete Partition validation
        for skill in req_skills_set:
            if (
                skill not in seen_matched_skills
                and skill not in match_explanation.gaps.missing_required_skills
            ):
                raise ValueError(
                    f"Required skill '{skill}' missing from explanation partition."
                )
        for skill in pref_skills_set:
            if (
                skill not in seen_matched_skills
                and skill not in match_explanation.gaps.missing_preferred_skills
            ):
                raise ValueError(
                    f"Preferred skill '{skill}' missing from explanation partition."
                )

        for skill in match_explanation.gaps.missing_required_skills:
            if skill not in req_skills_set:
                raise ValueError("Missing required skill not in job requirements.")
        for skill in match_explanation.gaps.missing_preferred_skills:
            if skill not in pref_skills_set:
                raise ValueError("Missing preferred skill not in job requirements.")

        # Validate Keyword Coverage consistency with Job Skills EXACTLY
        kw_matched = set(match_explanation.keyword_coverage.matched_keywords)
        kw_missing = set(match_explanation.keyword_coverage.missing_keywords)

        if kw_matched != seen_matched_skills:
            raise ValueError(
                "Keyword coverage matched skills do not match exact job matched skills."
            )
        if kw_missing != set(match_explanation.gaps.missing_required_skills) | set(
            match_explanation.gaps.missing_preferred_skills
        ):
            raise ValueError(
                "Keyword coverage missing skills do not match exact job missing skills."
            )

        # Validate Experience Gap consistency
        if match_explanation.experience is not None:
            # Match required
            req_months = 0
            if (
                job_description.experience_requirement
                and job_description.experience_requirement.minimum_years
            ):
                req_months = job_description.experience_requirement.minimum_years * 12
            if req_months == 0:
                raise ValueError(
                    "Scoreable evidence supplied for 0-min job requirement."
                )

            if match_explanation.experience.required_months != req_months:
                raise ValueError(
                    "Experience evidence required months do not match job description."
                )

            # Match known
            cand_months = sum(
                e.duration_months
                for e in candidate_profile.experience
                if e.duration_months
            )
            if match_explanation.experience.known_candidate_months != cand_months:
                raise ValueError(
                    "Experience evidence known months do not match CandidateProfile."
                )

            # Match gap state exactly
            expected_missing = max(0, req_months - cand_months)
            has_gap = expected_missing > 0

            if has_gap:
                if match_explanation.gaps.experience_gap is None:
                    raise ValueError("Experience gap missing when one is required.")
                if match_explanation.gaps.experience_gap.required_months != req_months:
                    raise ValueError(
                        "Experience gap required months do not match job description."
                    )
                if (
                    match_explanation.gaps.experience_gap.known_candidate_months
                    != cand_months
                ):
                    raise ValueError(
                        "Experience gap known months do not match CandidateProfile."
                    )

            else:
                if match_explanation.gaps.experience_gap is not None:
                    raise ValueError("Experience gap exists when none is expected.")

        elif match_explanation.gaps.experience_gap is not None:
            raise ValueError(
                "Experience gap exists without corresponding experience evidence."
            )

        # Validate Education State Consistency
        if match_explanation.education is not None:
            if not job_description.education_requirement or (
                job_description.education_requirement.level is None
                and job_description.education_requirement.field_of_study is None
            ):
                raise ValueError(
                    "Education evidence supplied for non-scoreable job requirement."
                )

            if (
                match_explanation.education.requirement
                != job_description.education_requirement
            ):
                raise ValueError(
                    "Education evidence requirement does not match JobDescription."
                )

            if match_explanation.education.satisfied:
                if (
                    match_explanation.education.matched_record
                    not in candidate_profile.education
                ):
                    raise ValueError(
                        "Matched education record not found in CandidateProfile."
                    )
                if match_explanation.gaps.education_gap is not None:
                    raise ValueError(
                        "Education is satisfied but an education gap exists."
                    )
            else:
                if match_explanation.gaps.education_gap is None:
                    raise ValueError(
                        "Education is not satisfied but no education gap exists."
                    )
                if (
                    match_explanation.gaps.education_gap
                    != job_description.education_requirement
                ):
                    raise ValueError(
                        "Education gap does not match JobDescription requirement."
                    )
        elif match_explanation.gaps.education_gap is not None:
            raise ValueError(
                "Education gap exists without corresponding education evidence."
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
                points.append(TalkingPoint(description=f"Minimum not met. Missing months: {ms}"))
            else:
                points.append(TalkingPoint(description="Minimum experience requirement is met."))

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
