"""Tests for SQLiteAnalysisRepository and _analysis_codec."""

import json
import sqlite3
import uuid
from contextlib import closing
from dataclasses import replace
from datetime import UTC, datetime, timedelta, timezone
from pathlib import Path

import pytest

from pathfinder_ai.application.ai_enrichment import AIEnrichmentResult
from pathfinder_ai.application.analysis_history import (
    AnalysisHistoryFilter,
    AnalysisHistoryService,
    AnalysisTracking,
    ApplicationStatus,
    ApplicationStatusEvent,
    SavedAnalysis,
)
from pathfinder_ai.application.analysis_notes import AnalysisNote, AnalysisNoteService
from pathfinder_ai.application.interview_preparation import (
    InterviewerQuestion,
    InterviewPreparation,
    InterviewQuestionCategory,
    InterviewTheme,
    InterviewThemeKind,
    TalkingPoint,
)
from pathfinder_ai.application.learning_recommendations import (
    DeterministicLearningRecommender,
    LearningRecommendation,
    LearningRecommendationKind,
    LearningRecommendationPriority,
    LearningRecommendations,
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
from pathfinder_ai.infrastructure._analysis_codec import (
    CURRENT_PAYLOAD_VERSION,
    decode_analysis,
    encode_analysis,
)
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

    recommendations = LearningRecommendations(
        items=(
            LearningRecommendation(
                kind=LearningRecommendationKind.REQUIRED_SKILL,
                priority=LearningRecommendationPriority.HIGH,
                topic="sql",
                title="Strengthen sql",
                rationale="sql is required and matching evidence was not found.",
                suggested_course_topic="sql fundamentals",
            ),
            LearningRecommendation(
                kind=LearningRecommendationKind.EXPERIENCE,
                priority=LearningRecommendationPriority.HIGH,
                topic="Role-relevant experience",
                title="Build demonstrable role-relevant experience",
                rationale="The structured analysis found a 24 month experience gap.",
                suggested_course_topic=None,
            ),
        )
    )

    return SavedAnalysis(
        analysis_id=uuid.uuid4(),
        created_at=datetime.now(UTC),
        candidate_profile=profile,
        job_description=job,
        match_explanation=explanation,
        interview_preparation=prep,
        ai_enrichment=ai,
        learning_recommendations=recommendations,
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
    assert isinstance(retrieved.analysis_id, uuid.UUID)
    assert retrieved.created_at.tzinfo is UTC
    assert isinstance(retrieved.candidate_profile.education[0].level, EducationLevel)
    assert retrieved.candidate_profile.preferences is not None
    assert all(
        isinstance(mode, WorkMode)
        for mode in retrieved.candidate_profile.preferences.acceptable_work_modes
    )
    assert retrieved.job_description.education_requirement is not None
    assert isinstance(
        retrieved.job_description.education_requirement.level, EducationLevel
    )
    assert retrieved.match_explanation.education is not None
    assert isinstance(
        retrieved.match_explanation.education.requirement.level, EducationLevel
    )
    assert retrieved.match_explanation.education.matched_record is not None
    assert isinstance(
        retrieved.match_explanation.education.matched_record.level, EducationLevel
    )
    assert retrieved.match_explanation.gaps.education_gap is not None
    assert isinstance(
        retrieved.match_explanation.gaps.education_gap.level, EducationLevel
    )
    assert retrieved.ai_enrichment is not None
    assert retrieved.ai_enrichment.content == "Candidate looks great.\nConsider them."
    assert retrieved.ai_enrichment.provider_name == "test-provider"
    assert retrieved.job_description.experience_requirement is not None
    assert retrieved.job_description.experience_requirement.maximum_years is None
    assert retrieved.candidate_profile.experience[0].company_name == "Tech Corp"
    assert (
        retrieved.learning_recommendations == sample_analysis.learning_recommendations
    )
    assert retrieved.learning_recommendations is not None
    assert isinstance(
        retrieved.learning_recommendations.items[0].kind,
        LearningRecommendationKind,
    )
    assert isinstance(
        retrieved.learning_recommendations.items[0].priority,
        LearningRecommendationPriority,
    )
    assert retrieved.learning_recommendations.items[0].topic == "sql"
    assert retrieved.learning_recommendations.items[0].title == "Strengthen sql"
    assert "matching evidence" in retrieved.learning_recommendations.items[0].rationale
    assert (
        retrieved.learning_recommendations.items[0].suggested_course_topic
        == "sql fundamentals"
    )

    with closing(sqlite3.connect(db_path)) as connection:
        version = connection.execute(
            "SELECT payload_version FROM saved_analyses WHERE analysis_id = ?",
            (str(sample_analysis.analysis_id),),
        ).fetchone()[0]
    assert version == CURRENT_PAYLOAD_VERSION == 2


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


def _history_variant(
    source: SavedAnalysis,
    *,
    title: str,
    company: str | None,
    score: float | None = 50.0,
    ai_enriched: bool = False,
    created_at: datetime,
) -> SavedAnalysis:
    company_info = CompanyInfo(name=company) if company is not None else None
    return replace(
        source,
        analysis_id=uuid.uuid4(),
        created_at=created_at,
        job_description=replace(
            source.job_description,
            title=JobTitle(title=title),
            company_info=company_info,
        ),
        match_explanation=replace(
            source.match_explanation,
            score=MatchScore(value=score),
        ),
        ai_enrichment=source.ai_enrichment if ai_enriched else None,
    )


def test_sqlite_history_text_search_is_normalized_case_insensitive_and_literal(
    tmp_path: Path, sample_analysis: SavedAnalysis
) -> None:
    repository = SQLiteAnalysisRepository(tmp_path / "search.db")
    timestamp = datetime(2025, 1, 1, tzinfo=UTC)
    platform = _history_variant(
        sample_analysis,
        title="Senior Platform Engineer",
        company="Acme Systems",
        created_at=timestamp,
    )
    special = _history_variant(
        sample_analysis,
        title="100% Data_Engineer",
        company="O'Connor 株式会社",
        created_at=timestamp + timedelta(seconds=1),
    )
    unrelated = _history_variant(
        sample_analysis,
        title="Product Designer",
        company=None,
        created_at=timestamp + timedelta(seconds=2),
    )
    for analysis in (platform, special, unrelated):
        repository.save(analysis)

    def matching_ids(query: str) -> list[uuid.UUID]:
        return [
            item.analysis_id
            for item in repository.list_recent(
                limit=10,
                offset=0,
                history_filter=AnalysisHistoryFilter(query=query),
            )
        ]

    assert matching_ids("  PLATFORM\n engineer ") == [platform.analysis_id]
    assert matching_ids("aCmE") == [platform.analysis_id]
    assert matching_ids("%") == [special.analysis_id]
    assert matching_ids("_") == [special.analysis_id]
    assert matching_ids("O'Connor") == [special.analysis_id]
    assert matching_ids("株式会社") == [special.analysis_id]
    assert matching_ids(" ") == [
        unrelated.analysis_id,
        special.analysis_id,
        platform.analysis_id,
    ]


def test_sqlite_history_ai_and_score_filters_are_inclusive_and_composable(
    tmp_path: Path, sample_analysis: SavedAnalysis
) -> None:
    repository = SQLiteAnalysisRepository(tmp_path / "filters.db")
    timestamp = datetime(2025, 1, 1, tzinfo=UTC)
    records = (
        _history_variant(
            sample_analysis,
            title="Platform Zero",
            company="Acme",
            score=0.0,
            created_at=timestamp,
        ),
        _history_variant(
            sample_analysis,
            title="Platform Lower",
            company="Acme",
            score=60.0,
            ai_enriched=True,
            created_at=timestamp + timedelta(seconds=1),
        ),
        _history_variant(
            sample_analysis,
            title="Platform Upper",
            company="Acme",
            score=80.0,
            ai_enriched=True,
            created_at=timestamp + timedelta(seconds=2),
        ),
        _history_variant(
            sample_analysis,
            title="Platform Unscored",
            company="Acme",
            score=None,
            ai_enriched=True,
            created_at=timestamp + timedelta(seconds=3),
        ),
        _history_variant(
            sample_analysis,
            title="Other High",
            company="Elsewhere",
            score=90.0,
            created_at=timestamp + timedelta(seconds=4),
        ),
    )
    for analysis in records:
        repository.save(analysis)

    def filtered(history_filter: AnalysisHistoryFilter) -> list[uuid.UUID]:
        return [
            item.analysis_id
            for item in repository.list_recent(
                limit=10, offset=0, history_filter=history_filter
            )
        ]

    assert filtered(AnalysisHistoryFilter(ai_enriched=True)) == [
        records[3].analysis_id,
        records[2].analysis_id,
        records[1].analysis_id,
    ]
    assert filtered(AnalysisHistoryFilter(ai_enriched=False)) == [
        records[4].analysis_id,
        records[0].analysis_id,
    ]
    assert filtered(AnalysisHistoryFilter(min_score=80.0)) == [
        records[4].analysis_id,
        records[2].analysis_id,
    ]
    assert filtered(AnalysisHistoryFilter(max_score=0.0)) == [records[0].analysis_id]
    assert filtered(AnalysisHistoryFilter(min_score=60.0, max_score=80.0)) == [
        records[2].analysis_id,
        records[1].analysis_id,
    ]
    assert filtered(
        AnalysisHistoryFilter(
            query="platform", ai_enriched=True, min_score=60.0, max_score=80.0
        )
    ) == [records[2].analysis_id, records[1].analysis_id]

    unfiltered = filtered(AnalysisHistoryFilter())
    assert records[3].analysis_id in unfiltered
    assert records[0].analysis_id in unfiltered


def test_sqlite_history_filters_before_pagination_and_preserves_order(
    tmp_path: Path, sample_analysis: SavedAnalysis
) -> None:
    repository = SQLiteAnalysisRepository(tmp_path / "pagination.db")
    timestamp = datetime(2025, 1, 1, tzinfo=UTC)
    matches = [
        _history_variant(
            sample_analysis,
            title=f"Platform Engineer {index}",
            company="Acme",
            created_at=timestamp + timedelta(seconds=index * 2),
        )
        for index in range(3)
    ]
    unrelated = [
        _history_variant(
            sample_analysis,
            title=f"Designer {index}",
            company="Elsewhere",
            created_at=timestamp + timedelta(seconds=index * 2 + 1),
        )
        for index in range(3)
    ]
    for analysis in (*matches, *unrelated):
        repository.save(analysis)

    page = repository.list_recent(
        limit=2,
        offset=1,
        history_filter=AnalysisHistoryFilter(query="platform"),
    )

    assert [item.analysis_id for item in page] == [
        matches[1].analysis_id,
        matches[0].analysis_id,
    ]


def test_sqlite_history_filter_reads_only_summary_metadata(
    tmp_path: Path,
    sample_analysis: SavedAnalysis,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    repository = SQLiteAnalysisRepository(tmp_path / "summary-only.db")
    repository.save(sample_analysis)

    def forbidden_decode(*args: object, **kwargs: object) -> None:
        raise AssertionError("History filtering must not decode or recompute payloads")

    monkeypatch.setattr(
        "pathfinder_ai.infrastructure.sqlite_analysis_repository.decode_analysis",
        forbidden_decode,
    )

    summaries = repository.list_recent(
        limit=10,
        offset=0,
        history_filter=AnalysisHistoryFilter(query="backend", ai_enriched=True),
    )

    assert [item.analysis_id for item in summaries] == [sample_analysis.analysis_id]


def test_sqlite_preserves_none_and_zero_scores(
    tmp_path: Path, sample_analysis: SavedAnalysis
) -> None:
    db_path = tmp_path / "scores.db"
    repository = SQLiteAnalysisRepository(db_path)
    none_analysis = replace(
        sample_analysis,
        analysis_id=uuid.uuid4(),
        match_explanation=replace(
            sample_analysis.match_explanation, score=MatchScore(value=None)
        ),
    )
    zero_analysis = replace(
        sample_analysis,
        analysis_id=uuid.uuid4(),
        match_explanation=replace(
            sample_analysis.match_explanation, score=MatchScore(value=0.0)
        ),
    )
    repository.save(none_analysis)
    repository.save(zero_analysis)

    reopened = SQLiteAnalysisRepository(db_path)
    loaded_none = reopened.get(none_analysis.analysis_id)
    loaded_zero = reopened.get(zero_analysis.analysis_id)
    summaries = {
        summary.analysis_id: summary
        for summary in reopened.list_recent(limit=10, offset=0)
    }

    assert loaded_none is not None
    assert loaded_none.match_explanation.score.value is None
    assert summaries[none_analysis.analysis_id].score is None
    assert loaded_zero is not None
    assert loaded_zero.match_explanation.score.value == 0.0
    assert summaries[zero_analysis.analysis_id].score == 0.0


def test_sqlite_repository_get_not_found(tmp_path: Path) -> None:
    repo = SQLiteAnalysisRepository(tmp_path / "test.db")
    assert repo.get(uuid.uuid4()) is None


def test_sqlite_repository_deletes_one_record_and_persists_absence(
    tmp_path: Path, sample_analysis: SavedAnalysis
) -> None:
    db_path = tmp_path / "delete.db"
    repository = SQLiteAnalysisRepository(db_path)
    survivor = replace(sample_analysis, analysis_id=uuid.uuid4())
    repository.save(sample_analysis)
    repository.save(survivor)

    with closing(sqlite3.connect(db_path)) as connection:
        schema_before = connection.execute(
            "SELECT type, name, sql FROM sqlite_master "
            "WHERE name IN ('saved_analyses', 'idx_saved_analyses_created_at') "
            "ORDER BY type, name"
        ).fetchall()

    assert repository.delete(sample_analysis.analysis_id) is True
    assert repository.get(sample_analysis.analysis_id) is None
    assert repository.get(survivor.analysis_id) == survivor
    assert [
        summary.analysis_id for summary in repository.list_recent(limit=10, offset=0)
    ] == [survivor.analysis_id]
    assert repository.delete(uuid.uuid4()) is False

    reopened = SQLiteAnalysisRepository(db_path)
    assert reopened.get(sample_analysis.analysis_id) is None
    assert reopened.get(survivor.analysis_id) == survivor

    with closing(sqlite3.connect(db_path)) as connection:
        surviving_version = connection.execute(
            "SELECT payload_version FROM saved_analyses WHERE analysis_id = ?",
            (str(survivor.analysis_id),),
        ).fetchone()[0]
        schema_after = connection.execute(
            "SELECT type, name, sql FROM sqlite_master "
            "WHERE name IN ('saved_analyses', 'idx_saved_analyses_created_at') "
            "ORDER BY type, name"
        ).fetchall()

    assert surviving_version == CURRENT_PAYLOAD_VERSION == 2
    assert schema_after == schema_before


def test_unsupported_payload_version() -> None:
    with pytest.raises(ValueError, match="Unsupported payload version: 99"):
        decode_analysis("{}", 99)


def test_version_one_payload_decodes_without_historical_recomputation(
    sample_analysis: SavedAnalysis, monkeypatch: pytest.MonkeyPatch
) -> None:
    payload = json.loads(encode_analysis(sample_analysis))
    payload.pop("learning_recommendations")

    def forbidden_recommend(*args: object, **kwargs: object) -> None:
        raise AssertionError("Legacy history must not be recomputed")

    monkeypatch.setattr(
        DeterministicLearningRecommender, "recommend", forbidden_recommend
    )
    decoded = decode_analysis(json.dumps(payload), 1)

    assert decoded.learning_recommendations is None
    assert decoded.match_explanation == sample_analysis.match_explanation
    assert decoded.interview_preparation == sample_analysis.interview_preparation
    assert decoded.ai_enrichment == sample_analysis.ai_enrichment


def test_version_two_preserves_empty_and_absent_recommendation_snapshots(
    sample_analysis: SavedAnalysis,
) -> None:
    empty = replace(
        sample_analysis, learning_recommendations=LearningRecommendations(items=())
    )
    absent = replace(sample_analysis, learning_recommendations=None)

    decoded_empty = decode_analysis(encode_analysis(empty), 2)
    decoded_absent = decode_analysis(encode_analysis(absent), 2)

    assert decoded_empty.learning_recommendations == LearningRecommendations(items=())
    assert decoded_absent.learning_recommendations is None


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


def test_tracking_lifecycle_and_filters(
    tmp_path: Path, sample_analysis: SavedAnalysis
) -> None:
    path = tmp_path / "tracking.db"
    repo = SQLiteAnalysisRepository(path)
    repo.save(sample_analysis)
    identifier = sample_analysis.analysis_id
    original = repo.get(identifier)
    with closing(sqlite3.connect(path)) as connection:
        before = connection.execute(
            "SELECT payload_version, payload_json FROM saved_analyses "
            "WHERE analysis_id = ?",
            (str(identifier),),
        ).fetchone()
    assert repo.get_tracking(uuid.uuid4()) is None
    assert repo.get_tracking(identifier) == AnalysisTracking(
        identifier, ApplicationStatus.NOT_APPLIED, None
    )
    clock = datetime(2026, 1, 1, tzinfo=UTC)
    service = AnalysisHistoryService(repo, clock=lambda: clock)
    assert service.update_application_status(
        identifier, ApplicationStatus.NOT_APPLIED
    ) == repo.get_tracking(identifier)
    with closing(sqlite3.connect(path)) as connection:
        assert (
            connection.execute("SELECT COUNT(*) FROM analysis_tracking").fetchone()[0]
            == 0
        )
    for status in ApplicationStatus:
        if status is ApplicationStatus.NOT_APPLIED:
            continue
        updated = service.update_application_status(identifier, status)
        assert updated == AnalysisTracking(identifier, status, clock)
        assert service.update_application_status(identifier, status) == updated
        assert (
            repo.list_recent(
                limit=20,
                offset=0,
                history_filter=AnalysisHistoryFilter(application_status=status),
            )[0].application_status
            == status
        )
    assert service.update_application_status(
        identifier, ApplicationStatus.NOT_APPLIED
    ) == AnalysisTracking(identifier, ApplicationStatus.NOT_APPLIED, clock)
    assert (
        repo.list_recent(
            limit=20,
            offset=0,
            history_filter=AnalysisHistoryFilter(
                application_status=ApplicationStatus.NOT_APPLIED
            ),
        )[0].status_updated_at
        == clock
    )
    assert repo.get(identifier) == original
    with closing(sqlite3.connect(path)) as connection:
        after = connection.execute(
            "SELECT payload_version, payload_json FROM saved_analyses "
            "WHERE analysis_id = ?",
            (str(identifier),),
        ).fetchone()
    assert after == before
    assert (
        repo.upsert_tracking(
            AnalysisTracking(uuid.uuid4(), ApplicationStatus.APPLIED, clock)
        )
        is None
    )
    assert repo.delete(identifier)
    with closing(sqlite3.connect(path)) as connection:
        assert (
            connection.execute("SELECT COUNT(*) FROM analysis_tracking").fetchone()[0]
            == 0
        )


def test_tracking_value_validation() -> None:
    identifier = uuid.uuid4()
    with pytest.raises(ValueError, match="required"):
        AnalysisTracking(identifier, ApplicationStatus.APPLIED, None)
    with pytest.raises(ValueError, match="timezone-aware"):
        AnalysisTracking(identifier, ApplicationStatus.APPLIED, datetime(2026, 1, 1))
    assert AnalysisTracking(
        identifier,
        ApplicationStatus.APPLIED,
        datetime(2026, 1, 1, 5, 30, tzinfo=timezone(timedelta(hours=5, minutes=30))),
    ).updated_at == datetime(2026, 1, 1, tzinfo=UTC)


def test_tracking_write_requires_change(tmp_path: Path) -> None:
    repo = SQLiteAnalysisRepository(tmp_path / "empty.db")
    with pytest.raises(ValueError, match="changed"):
        repo.upsert_tracking(
            AnalysisTracking(uuid.uuid4(), ApplicationStatus.NOT_APPLIED, None)
        )


def test_legacy_database_adds_tracking_without_touching_snapshot(
    tmp_path: Path, sample_analysis: SavedAnalysis
) -> None:
    path = tmp_path / "legacy.db"
    old_repo = SQLiteAnalysisRepository(path)
    old_repo.save(sample_analysis)
    with closing(sqlite3.connect(path)) as connection:
        before = connection.execute("SELECT * FROM saved_analyses").fetchall()
        columns = connection.execute("PRAGMA table_info(saved_analyses)").fetchall()
        connection.execute("DROP TABLE analysis_tracking")
        connection.commit()
    current = SQLiteAnalysisRepository(path)
    with closing(sqlite3.connect(path)) as connection:
        assert connection.execute("SELECT * FROM saved_analyses").fetchall() == before
        assert (
            connection.execute("PRAGMA table_info(saved_analyses)").fetchall()
            == columns
        )
        assert (
            connection.execute(
                "SELECT name FROM sqlite_master WHERE name = 'analysis_tracking'"
            ).fetchone()
            is not None
        )
    assert current.get_tracking(sample_analysis.analysis_id) == AnalysisTracking(
        sample_analysis.analysis_id, ApplicationStatus.NOT_APPLIED, None
    )


def test_activity_records_only_future_transitions_and_preserves_legacy_tracking(
    tmp_path: Path, sample_analysis: SavedAnalysis
) -> None:
    path = tmp_path / "activity.db"
    old = SQLiteAnalysisRepository(path)
    old.save(sample_analysis)
    identifier = sample_analysis.analysis_id
    old_time = datetime(2026, 1, 1, tzinfo=UTC)
    with closing(sqlite3.connect(path)) as connection:
        connection.execute(
            "INSERT INTO analysis_tracking VALUES (?, ?, ?)",
            (str(identifier), "interviewing", old_time.isoformat()),
        )
        connection.execute("DROP INDEX idx_analysis_tracking_events_analysis_changed")
        connection.execute("DROP TABLE analysis_tracking_events")
        connection.commit()
    repo = SQLiteAnalysisRepository(path)
    assert repo.get_tracking(identifier) == AnalysisTracking(
        identifier, ApplicationStatus.INTERVIEWING, old_time
    )
    assert repo.list_tracking_events(identifier, limit=20, offset=0) == ()
    assert repo.list_tracking_events(uuid.uuid4(), limit=20, offset=0) is None
    new_time = datetime(2026, 2, 1, tzinfo=UTC)
    changed = repo.upsert_tracking(
        AnalysisTracking(identifier, ApplicationStatus.OFFER, new_time)
    )
    assert changed == AnalysisTracking(identifier, ApplicationStatus.OFFER, new_time)
    assert (
        repo.upsert_tracking(
            AnalysisTracking(
                identifier, ApplicationStatus.OFFER, datetime(2026, 3, 1, tzinfo=UTC)
            )
        )
        == changed
    )
    assert repo.list_tracking_events(identifier, limit=20, offset=0) == (
        ApplicationStatusEvent(
            identifier,
            ApplicationStatus.INTERVIEWING,
            ApplicationStatus.OFFER,
            new_time,
        ),
    )
    assert repo.get_tracking(identifier) == changed
    assert repo.delete(identifier)
    with closing(sqlite3.connect(path)) as connection:
        assert (
            connection.execute(
                "SELECT COUNT(*) FROM analysis_tracking_events"
            ).fetchone()[0]
            == 0
        )


def test_activity_order_pagination_and_atomic_rollback(
    tmp_path: Path, sample_analysis: SavedAnalysis
) -> None:
    path = tmp_path / "activity-order.db"
    repo = SQLiteAnalysisRepository(path)
    repo.save(sample_analysis)
    identifier = sample_analysis.analysis_id
    instant = datetime(2026, 2, 1, tzinfo=UTC)
    repo.upsert_tracking(
        AnalysisTracking(identifier, ApplicationStatus.APPLIED, instant)
    )
    repo.upsert_tracking(AnalysisTracking(identifier, ApplicationStatus.OFFER, instant))
    newest = repo.list_tracking_events(identifier, limit=1, offset=0)
    older = repo.list_tracking_events(identifier, limit=1, offset=1)
    assert (
        newest is not None and newest[0].application_status is ApplicationStatus.OFFER
    )
    assert (
        older is not None and older[0].application_status is ApplicationStatus.APPLIED
    )
    with closing(sqlite3.connect(path)) as connection:
        connection.execute(
            """CREATE TRIGGER reject_activity
            BEFORE INSERT ON analysis_tracking_events
            BEGIN SELECT RAISE(ABORT, 'activity rejected'); END"""
        )
        connection.commit()
    with pytest.raises(sqlite3.IntegrityError, match="activity rejected"):
        repo.upsert_tracking(
            AnalysisTracking(identifier, ApplicationStatus.ACCEPTED, instant)
        )
    assert repo.get_tracking(identifier) == AnalysisTracking(
        identifier, ApplicationStatus.OFFER, instant
    )
    assert repo.list_tracking_events(identifier, limit=20, offset=0) == newest + older


def test_note_lifecycle_preserves_snapshots_tracking_and_activity(
    tmp_path: Path, sample_analysis: SavedAnalysis
) -> None:
    path = tmp_path / "notes.db"
    repo = SQLiteAnalysisRepository(path)
    repo.save(sample_analysis)
    identifier = sample_analysis.analysis_id
    assert repo.get_note(uuid.uuid4()) is None
    assert repo.get_note(identifier) == AnalysisNote(identifier, None, None)
    with closing(sqlite3.connect(path)) as connection:
        before = connection.execute(
            "SELECT * FROM saved_analyses WHERE analysis_id = ?", (str(identifier),)
        ).fetchone()
    timestamp = datetime(2026, 1, 1, tzinfo=UTC)
    repo.upsert_tracking(
        AnalysisTracking(identifier, ApplicationStatus.APPLIED, timestamp)
    )
    tracking = repo.get_tracking(identifier)
    activity = repo.list_tracking_events(identifier, limit=20, offset=0)
    content = "  Recruiter called\n🐍 <script>alert(1)</script> ' OR 1=1 --  "
    note = AnalysisNote(identifier, content, timestamp)
    assert repo.upsert_note(note) == note
    assert repo.get_note(identifier) == note
    assert (
        repo.upsert_note(
            AnalysisNote(identifier, content, datetime(2026, 1, 2, tzinfo=UTC))
        )
        == note
    )
    assert repo.get_note(identifier) == note
    service = AnalysisNoteService(repo, clock=lambda: datetime(2026, 1, 3, tzinfo=UTC))
    assert service.update_note(identifier, "Changed") == AnalysisNote(
        identifier, "Changed", datetime(2026, 1, 3, tzinfo=UTC)
    )
    assert repo.get_tracking(identifier) == tracking
    assert repo.list_tracking_events(identifier, limit=20, offset=0) == activity
    with closing(sqlite3.connect(path)) as connection:
        assert (
            connection.execute(
                "SELECT * FROM saved_analyses WHERE analysis_id = ?", (str(identifier),)
            ).fetchone()
            == before
        )
        assert (
            connection.execute("SELECT COUNT(*) FROM analysis_notes").fetchone()[0] == 1
        )
    assert repo.clear_note(identifier) == AnalysisNote(identifier, None, None)
    assert repo.clear_note(identifier) == AnalysisNote(identifier, None, None)
    assert repo.get_note(identifier) == AnalysisNote(identifier, None, None)
    with closing(sqlite3.connect(path)) as connection:
        assert (
            connection.execute("SELECT COUNT(*) FROM analysis_notes").fetchone()[0] == 0
        )
    assert repo.upsert_note(AnalysisNote(uuid.uuid4(), "text", timestamp)) is None
    assert repo.clear_note(uuid.uuid4()) is None
    assert repo.get_tracking(identifier) == tracking
    assert repo.list_tracking_events(identifier, limit=20, offset=0) == activity


def test_note_upgrade_and_parent_cascade(
    tmp_path: Path, sample_analysis: SavedAnalysis, monkeypatch: pytest.MonkeyPatch
) -> None:
    path = tmp_path / "legacy-note.db"
    old = SQLiteAnalysisRepository(path)
    old.save(sample_analysis)
    identifier = sample_analysis.analysis_id
    timestamp = datetime(2026, 1, 1, tzinfo=UTC)
    old.upsert_tracking(
        AnalysisTracking(identifier, ApplicationStatus.INTERVIEWING, timestamp)
    )
    with closing(sqlite3.connect(path)) as connection:
        snapshots = connection.execute("SELECT * FROM saved_analyses").fetchall()
        tracking = connection.execute("SELECT * FROM analysis_tracking").fetchall()
        events = connection.execute("SELECT * FROM analysis_tracking_events").fetchall()
        connection.execute("DROP TABLE analysis_notes")
        connection.commit()
    repo = SQLiteAnalysisRepository(path)
    with closing(sqlite3.connect(path)) as connection:
        assert (
            connection.execute("SELECT * FROM saved_analyses").fetchall() == snapshots
        )
        assert (
            connection.execute("SELECT * FROM analysis_tracking").fetchall() == tracking
        )
        assert (
            connection.execute("SELECT * FROM analysis_tracking_events").fetchall()
            == events
        )
        assert (
            connection.execute("SELECT COUNT(*) FROM analysis_notes").fetchone()[0] == 0
        )
        assert connection.execute("PRAGMA table_info(analysis_notes)").fetchall()
        assert connection.execute("PRAGMA foreign_key_list(analysis_notes)").fetchall()
    import pathfinder_ai.infrastructure.sqlite_analysis_repository as sqlite_module

    monkeypatch.setattr(
        sqlite_module, "decode_analysis", lambda *_: pytest.fail("snapshot decoded")
    )
    assert repo.get_note(identifier) == AnalysisNote(identifier, None, None)
    repo.upsert_note(AnalysisNote(identifier, "private", timestamp))
    assert repo.delete(identifier)
    with closing(sqlite3.connect(path)) as connection:
        assert (
            connection.execute("SELECT COUNT(*) FROM analysis_notes").fetchone()[0] == 0
        )
    assert repo.get_note(identifier) is None


def test_note_repository_rejects_empty_write(tmp_path: Path) -> None:
    repo = SQLiteAnalysisRepository(tmp_path / "empty-note.db")
    with pytest.raises(ValueError, match="non-empty"):
        repo.upsert_note(AnalysisNote(uuid.uuid4(), None, None))
