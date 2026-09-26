"""Snapshot-only Markdown export behavior and injection safety."""

import uuid
from dataclasses import replace
from datetime import UTC, datetime
from string import punctuation

import pytest

from pathfinder_ai.application.ai_enrichment import (
    AIEnrichmentResult,
    AIEnrichmentService,
)
from pathfinder_ai.application.analysis_export import render_saved_analysis_markdown
from pathfinder_ai.application.analysis_history import SavedAnalysis
from pathfinder_ai.application.interview_preparation import (
    DeterministicInterviewPreparer,
    InterviewPreparation,
)
from pathfinder_ai.application.learning_recommendations import (
    DeterministicLearningRecommender,
    LearningRecommendations,
)
from pathfinder_ai.domain.candidate_profile import CandidateProfile, Project
from pathfinder_ai.domain.education import EducationLevel
from pathfinder_ai.domain.explanation import (
    EvidenceSource,
    EvidenceSourceKind,
    GapAnalysis,
    MatchedSkillEvidence,
    SkillKeywordCoverage,
)
from pathfinder_ai.domain.job_description import (
    CompanyInfo,
    EducationRequirement,
    ExperienceRequirement,
    JobDescription,
)
from pathfinder_ai.domain.job_title import JobTitle
from pathfinder_ai.domain.matching import DeterministicMatcher, MatchScore
from pathfinder_ai.domain.skill import Skill


@pytest.fixture
def export_snapshot() -> SavedAnalysis:
    candidate = CandidateProfile(
        skills=(Skill(name="Python"), Skill(name="FastAPI")),
        projects=(Project(name="Synthetic Portfolio", skills=(Skill(name="Python"),)),),
    )
    job = JobDescription(
        title=JobTitle(title="Platform Engineer"),
        company_info=CompanyInfo(
            name="Synthetic Labs", industry="Technology", location="Remote"
        ),
        required_skills=(Skill(name="Python"), Skill(name="SQL")),
        preferred_skills=(Skill(name="FastAPI"), Skill(name="Docker")),
        experience_requirement=ExperienceRequirement(minimum_years=3),
        education_requirement=EducationRequirement(
            level=EducationLevel.MASTER,
            field_of_study="Computing",
            description="Relevant degree",
        ),
    )
    explanation = DeterministicMatcher().explain(candidate, job)
    return SavedAnalysis(
        analysis_id=uuid.UUID("65a88a10-4749-4a23-8079-890220dd5997"),
        created_at=datetime(2026, 9, 26, tzinfo=UTC),
        candidate_profile=candidate,
        job_description=job,
        match_explanation=explanation,
        interview_preparation=DeterministicInterviewPreparer().prepare(
            candidate, job, explanation
        ),
        learning_recommendations=DeterministicLearningRecommender().recommend(
            candidate, job, explanation
        ),
    )


def test_complete_export_is_stable_and_uses_stored_results_only(
    export_snapshot: SavedAnalysis, monkeypatch: pytest.MonkeyPatch
) -> None:
    def forbidden(*args: object, **kwargs: object) -> None:
        raise AssertionError("Export must not recompute or invoke providers")

    monkeypatch.setattr(DeterministicMatcher, "explain", forbidden)
    monkeypatch.setattr(DeterministicInterviewPreparer, "prepare", forbidden)
    monkeypatch.setattr(DeterministicLearningRecommender, "recommend", forbidden)
    monkeypatch.setattr(AIEnrichmentService, "enrich", forbidden)
    markdown = render_saved_analysis_markdown(export_snapshot)
    assert markdown == render_saved_analysis_markdown(export_snapshot)
    for section in (
        "Target Role",
        "Match Summary",
        "Matched Evidence",
        "Gaps",
        "Keyword Coverage",
        "Candidate Talking Points",
        "Interview Preparation",
        "Targeted Learning Recommendations",
        "Caveat",
    ):
        assert f"## {section}\n" in markdown
    assert str(export_snapshot.analysis_id) in markdown
    assert "2026-09-26T00:00:00+00:00" in markdown
    assert "Synthetic Labs" in markdown
    assert "36 months required; 0 known; 36 missing" in markdown
    assert "Education level: master" in markdown
    assert "Education field: Computing" in markdown
    assert "Education description: Relevant degree" in markdown
    assert "Missing required skill: sql" in markdown
    assert "Missing preferred skill: docker" in markdown
    assert "Suggested course topic:" in markdown
    assert "## AI Enrichment" not in markdown
    assert markdown.endswith(
        "an employer decision, an ATS result, "
        "or a guarantee of interview or employment.\n"
    )
    for forbidden_field in (
        "raw_resume",
        "raw_job",
        "payload_json",
        "api_key",
        "request_id",
        "database_path",
        "prompt",
        "tokens",
    ):
        assert forbidden_field not in markdown


@pytest.mark.parametrize("recommendations", [None, LearningRecommendations(items=())])
def test_minimal_unscored_export_omits_absent_sections(
    export_snapshot: SavedAnalysis, recommendations: LearningRecommendations | None
) -> None:
    analysis = replace(
        export_snapshot,
        job_description=replace(export_snapshot.job_description, company_info=None),
        match_explanation=replace(
            export_snapshot.match_explanation,
            score=MatchScore(value=None),
            components=(),
            matched_skills=(),
            gaps=GapAnalysis((), (), None, None),
            keyword_coverage=SkillKeywordCoverage((), (), None),
        ),
        interview_preparation=InterviewPreparation((), (), (), ()),
        learning_recommendations=recommendations,
    )
    markdown = render_saved_analysis_markdown(analysis)
    assert "Not scored" in markdown
    assert "0%" not in markdown
    for absent in (
        "Company:",
        "## Gaps",
        "## Keyword Coverage",
        "## Matched Evidence",
        "## Candidate Talking Points",
        "## Interview Preparation",
        "## Targeted Learning Recommendations",
        "## AI Enrichment",
    ):
        assert absent not in markdown


def test_optional_company_and_education_fields_and_unlabelled_evidence(
    export_snapshot: SavedAnalysis,
) -> None:
    explanation = replace(
        export_snapshot.match_explanation,
        matched_skills=(
            MatchedSkillEvidence(
                Skill(name="Python"),
                True,
                (EvidenceSource(EvidenceSourceKind.PROFILE, None),),
            ),
        ),
        gaps=GapAnalysis(
            (), (), None, EducationRequirement(description="Stored requirement")
        ),
    )
    markdown = render_saved_analysis_markdown(
        replace(
            export_snapshot,
            job_description=replace(
                export_snapshot.job_description,
                company_info=CompanyInfo(name="Synthetic"),
            ),
            match_explanation=explanation,
        )
    )
    assert "  - profile\n" in markdown
    assert "Industry:" not in markdown and "Location:" not in markdown
    assert "Education description: Stored requirement" in markdown
    assert "Education level:" not in markdown and "Education field:" not in markdown


def test_zero_is_scored(export_snapshot: SavedAnalysis) -> None:
    analysis = replace(
        export_snapshot,
        match_explanation=replace(
            export_snapshot.match_explanation, score=MatchScore(value=0)
        ),
    )
    assert "Deterministic score: 0%" in render_saved_analysis_markdown(analysis)


def test_untrusted_multiline_stored_ai_is_inert_and_unicode_survives(
    export_snapshot: SavedAnalysis,
) -> None:
    content = (
        "# heading\n[link](https://example.invalid)\n![image](x)\n"
        "<script>alert(1)</script>\n> blockquote\n`code`\n``` fenced\n"
        "* emphasis\n_ emphasis\n- list\n\\ { } + . ! 株式会社 café &copy;\n"
        "Setext heading\n===\nhttps://example.invalid"
    )
    analysis = replace(
        export_snapshot,
        ai_enrichment=AIEnrichmentResult(
            content=content, provider_name="Synthetic [provider]"
        ),
    )
    markdown = render_saved_analysis_markdown(analysis)
    assert "## AI Enrichment" in markdown
    assert "Provider: Synthetic \\[provider\\]" in markdown
    assert "\\<script\\>alert\\(1\\)\\<\\/script\\>" in markdown
    assert "\\[link\\]\\(https\\:\\/\\/example\\.invalid\\)" in markdown
    assert "\\!\\[image\\]\\(x\\)" in markdown
    assert "\\`\\`\\` fenced" in markdown
    assert "\n  \\> blockquote" in markdown
    assert "株式会社 café &amp;copy\\;" in markdown
    assert "\n  \\=\\=\\=" in markdown
    assert "https://example.invalid" not in markdown
    assert "<script>" not in markdown
    assert "\n# heading" not in markdown
    assert (
        analysis.ai_enrichment is not None and analysis.ai_enrichment.content == content
    )
    assert markdown == render_saved_analysis_markdown(analysis)


@pytest.mark.parametrize("character", [char for char in punctuation if char != "&"])
def test_each_markdown_control_character_is_escaped_in_stored_role(
    export_snapshot: SavedAnalysis, character: str
) -> None:
    analysis = replace(
        export_snapshot,
        job_description=replace(
            export_snapshot.job_description,
            title=JobTitle(title=f"Role {character} text"),
        ),
    )
    assert f"Job title: Role \\{character} text" in render_saved_analysis_markdown(
        analysis
    )
