"""Tests for SQLiteAnalysisRepository and _analysis_codec."""

import sqlite3
import uuid
from datetime import UTC, datetime
from pathlib import Path

import pytest

from pathfinder_ai.application.ai_enrichment import AIEnrichmentResult
from pathfinder_ai.application.analysis_history import SavedAnalysis
from pathfinder_ai.application.interview_preparation import (
    InterviewerQuestion,
    InterviewPreparation,
    InterviewQuestionCategory,
    InterviewTheme,
    InterviewThemeKind,
    TalkingPoint,
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
from pathfinder_ai.infrastructure._analysis_codec import decode_analysis
from pathfinder_ai.infrastructure.sqlite_analysis_repository import (
    SQLiteAnalysisRepository,
)


@pytest.fixture
def sample_analysis() -> SavedAnalysis:
    profile = CandidateProfile(
        skills=(Skill(name="Python"), Skill(name="FastAPI")),
        experience=(
            WorkExperience(
                role_title=JobTitle(title="Backend Engineer"),
                company_name="Tech Corp",
                duration_months=24,
                description="Built APIs.",
                skills=(Skill(name="Python"),),
            ),
        ),
        education=(
            EducationRecord(
                level=EducationLevel.BACHELOR,
                field_of_study="Computer Science",
                institution="State University",
                description="Graduated with honors.",
            ),
        ),
        projects=(
            Project(
                name="Open Source Matcher",
                description="A deterministic matching engine.",
                skills=(Skill(name="Python"),),
            ),
        ),
        certifications=(
            Certification(
                name="AWS Certified Developer",
                issuer="AWS",
                description="Associate level.",
            ),
        ),
        preferences=CandidatePreferences(
            target_titles=(JobTitle(title="Senior Engineer"),),
            preferred_locations=("New York", "Remote"),
            acceptable_work_modes=(WorkMode.REMOTE, WorkMode.HYBRID),
        ),
    )

    job = JobDescription(
        title=JobTitle(title="Senior Backend Engineer"),
        responsibilities=(Responsibility(description="Design and build APIs."),),
        required_skills=(Skill(name="Python"), Skill(name="SQL")),
        preferred_skills=(Skill(name="FastAPI"),),
        company_info=CompanyInfo(
            name="Startup Inc.", industry="Tech", location="Remote"
        ),
        experience_requirement=ExperienceRequirement(
            minimum_years=2, maximum_years=None
        ),
        education_requirement=EducationRequirement(
            level=EducationLevel.BACHELOR,
            field_of_study="Computer Science",
            description="Required degree.",
        ),
    )

    explanation = MatchExplanation(
        score=MatchScore(value=85.5),
        components=(
            ScoreComponent(
                kind=ScoreComponentKind.REQUIRED_SKILLS,
                earned_points=50,
                possible_points=50,
            ),
        ),
        matched_skills=(
            MatchedSkillEvidence(
                skill=Skill(name="Python"),
                is_required=True,
                evidence_sources=(
                    EvidenceSource(kind=EvidenceSourceKind.PROFILE, label="Python"),
                ),
            ),
        ),
        experience=ExperienceEvidence(
            required_months=24,
            known_candidate_months=24,
            earned_points=20,
            possible_points=20,
        ),
        education=EducationEvidence(
            requirement=EducationRequirement(
                level=EducationLevel.BACHELOR, field_of_study="Computer Science"
            ),
            matched_record=EducationRecord(
                level=EducationLevel.BACHELOR,
                field_of_study="Computer Science",
                institution="State University",
            ),
            satisfied=True,
        ),
        gaps=GapAnalysis(
            missing_required_skills=(Skill(name="SQL"),),
            missing_preferred_skills=(),
            experience_gap=ExperienceGap(
                required_months=48, known_candidate_months=24, missing_months=24
            ),
            education_gap=EducationRequirement(
                level=EducationLevel.MASTER, field_of_study="Computer Science"
            ),
        ),
        keyword_coverage=SkillKeywordCoverage(
            matched_keywords=(Skill(name="Python"),),
            missing_keywords=(Skill(name="SQL"),),
            percentage=50.0,
        ),
    )

    prep = InterviewPreparation(
        themes=(
            InterviewTheme(
                kind=InterviewThemeKind.REQUIRED_SKILL_STRENGTH,
                description="Strong Python experience.",
            ),
        ),
        talking_points=(TalkingPoint(description="Discuss API building."),),
        question_categories=(InterviewQuestionCategory.REQUIRED_SKILL_VALIDATION,),
        candidate_questions=(
            InterviewerQuestion(description="How is the team structured?"),
        ),
    )

    ai = AIEnrichmentResult(
        content="Candidate looks great.\nConsider them.",
        provider_name="test-provider",
    )

    return SavedAnalysis(
        analysis_id=uuid.uuid4(),
        created_at=datetime.now(UTC),
        candidate_profile=profile,
        job_description=job,
        match_explanation=explanation,
        interview_preparation=prep,
        ai_enrichment=ai,
    )


def test_sqlite_repository_round_trip(
    tmp_path: Path, sample_analysis: SavedAnalysis
) -> None:
    db_path = tmp_path / "test.db"
    repo = SQLiteAnalysisRepository(db_path)

    repo.save(sample_analysis)

    # Recreate repo to ensure persistence across instances
    repo2 = SQLiteAnalysisRepository(db_path)
    retrieved = repo2.get(sample_analysis.analysis_id)

    assert retrieved is not None
    assert retrieved == sample_analysis


def test_sqlite_repository_list_recent(
    tmp_path: Path, sample_analysis: SavedAnalysis
) -> None:
    db_path = tmp_path / "test.db"
    repo = SQLiteAnalysisRepository(db_path)

    # Save multiple copies (would usually have different IDs, but this works for count)
    repo.save(sample_analysis)

    # Create another with no AI enrichment and a different ID to test sorting
    no_ai = SavedAnalysis(
        analysis_id=uuid.uuid4(),
        created_at=datetime.now(UTC),
        candidate_profile=sample_analysis.candidate_profile,
        job_description=sample_analysis.job_description,
        match_explanation=sample_analysis.match_explanation,
        interview_preparation=sample_analysis.interview_preparation,
        ai_enrichment=None,
    )
    repo.save(no_ai)

    summaries = repo.list_recent(limit=10, offset=0)
    assert len(summaries) == 2

    # Should be sorted by created_at DESC (newest first)
    assert summaries[0].analysis_id == no_ai.analysis_id
    assert summaries[0].ai_enriched is False
    assert summaries[1].analysis_id == sample_analysis.analysis_id
    assert summaries[1].ai_enriched is True

    # Test offset
    summaries_offset = repo.list_recent(limit=10, offset=1)
    assert len(summaries_offset) == 1
    assert summaries_offset[0].analysis_id == sample_analysis.analysis_id


def test_sqlite_repository_get_not_found(tmp_path: Path) -> None:
    repo = SQLiteAnalysisRepository(tmp_path / "test.db")
    assert repo.get(uuid.uuid4()) is None


def test_unsupported_payload_version() -> None:
    with pytest.raises(ValueError, match="Unsupported payload version: 99"):
        decode_analysis("{}", 99)


def test_sqlite_repository_duplicate_save(
    tmp_path: Path, sample_analysis: SavedAnalysis
) -> None:
    repo = SQLiteAnalysisRepository(tmp_path / "test.db")
    repo.save(sample_analysis)

    with pytest.raises(sqlite3.IntegrityError):
        repo.save(sample_analysis)


def test_sqlite_repository_handles_special_characters(
    tmp_path: Path, sample_analysis: SavedAnalysis
) -> None:
    repo = SQLiteAnalysisRepository(tmp_path / "test.db")

    # Inject special characters to test parameterized queries
    job_with_quotes = JobDescription(
        title=JobTitle(title='Developer O\'Connor "The Best"'),
        responsibilities=sample_analysis.job_description.responsibilities,
        required_skills=sample_analysis.job_description.required_skills,
        preferred_skills=sample_analysis.job_description.preferred_skills,
        company_info=CompanyInfo(
            name="Robert'); DROP TABLE saved_analyses;--", industry=None, location=None
        ),
        experience_requirement=None,
        education_requirement=None,
    )

    special = SavedAnalysis(
        analysis_id=uuid.uuid4(),
        created_at=sample_analysis.created_at,
        candidate_profile=sample_analysis.candidate_profile,
        job_description=job_with_quotes,
        match_explanation=sample_analysis.match_explanation,
        interview_preparation=sample_analysis.interview_preparation,
        ai_enrichment=None,
    )

    repo.save(special)
    retrieved = repo.get(special.analysis_id)

    assert retrieved is not None
    assert retrieved.job_description.title.title == 'Developer O\'Connor "The Best"'
    assert retrieved.job_description.company_info
    assert (
        retrieved.job_description.company_info.name
        == "Robert'); DROP TABLE saved_analyses;--"
    )

    # Make sure table still exists
    assert repo.list_recent(limit=10, offset=0)
