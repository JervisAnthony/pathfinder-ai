"""Deterministic role-relevant skill import from resume text."""

import re
from dataclasses import dataclass

from pathfinder_ai.domain._normalization import _normalize_whitespace
from pathfinder_ai.domain.skill import Skill

MAX_RESUME_TEXT_LENGTH = 200_000


@dataclass(frozen=True, slots=True)
class ResumeSkillImport:
    """Exact target-skill matches and non-matches for a resume import request."""

    matched_required_skills: tuple[Skill, ...]
    matched_preferred_skills: tuple[Skill, ...]
    unmatched_required_skills: tuple[Skill, ...]
    unmatched_preferred_skills: tuple[Skill, ...]


class DeterministicResumeSkillImporter:
    """Find exact target-job skill phrases in ephemeral resume text."""

    def import_skills(
        self,
        resume_text: str,
        required_skills: tuple[Skill, ...],
        preferred_skills: tuple[Skill, ...],
    ) -> ResumeSkillImport:
        if len(resume_text) > MAX_RESUME_TEXT_LENGTH:
            raise ValueError(
                f"Resume text cannot exceed {MAX_RESUME_TEXT_LENGTH} characters."
            )

        normalized_resume = _normalize_whitespace(resume_text).casefold()
        unique_required = self._deduplicate(required_skills)
        required_set = set(unique_required)
        unique_preferred = tuple(
            skill
            for skill in self._deduplicate(preferred_skills)
            if skill not in required_set
        )

        matched_required, unmatched_required = self._partition_matches(
            normalized_resume, unique_required
        )
        matched_preferred, unmatched_preferred = self._partition_matches(
            normalized_resume, unique_preferred
        )

        return ResumeSkillImport(
            matched_required_skills=matched_required,
            matched_preferred_skills=matched_preferred,
            unmatched_required_skills=unmatched_required,
            unmatched_preferred_skills=unmatched_preferred,
        )

    @staticmethod
    def _deduplicate(skills: tuple[Skill, ...]) -> tuple[Skill, ...]:
        return tuple(dict.fromkeys(skills))

    @staticmethod
    def _partition_matches(
        normalized_resume: str, skills: tuple[Skill, ...]
    ) -> tuple[tuple[Skill, ...], tuple[Skill, ...]]:
        matched: list[Skill] = []
        unmatched: list[Skill] = []

        for skill in skills:
            normalized_skill = _normalize_whitespace(skill.name).casefold()
            pattern = re.compile(rf"(?<![^\W_]){re.escape(normalized_skill)}(?![^\W_])")
            destination = matched if pattern.search(normalized_resume) else unmatched
            destination.append(skill)

        return tuple(matched), tuple(unmatched)
