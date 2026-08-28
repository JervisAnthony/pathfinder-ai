"""
Private codec for serializing and deserializing analysis history payloads.
"""

import json
from datetime import datetime
from typing import Any

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

CURRENT_PAYLOAD_VERSION = 1


def encode_analysis(analysis: SavedAnalysis) -> str:
    """Encode a SavedAnalysis into a JSON string payload."""
    payload = _encode_analysis_dict(analysis)
    return json.dumps(payload, ensure_ascii=False)


def decode_analysis(payload_json: str, version: int) -> SavedAnalysis:
    """Decode a JSON string payload into a SavedAnalysis."""
    if version != CURRENT_PAYLOAD_VERSION:
        raise ValueError(f"Unsupported payload version: {version}")

    data = json.loads(payload_json)
    return _decode_analysis_dict(data)


def _encode_analysis_dict(analysis: SavedAnalysis) -> dict[str, Any]:
    return {
        "analysis_id": str(analysis.analysis_id),
        "created_at": analysis.created_at.isoformat(),
        "candidate_profile": _encode_candidate_profile(analysis.candidate_profile),
        "job_description": _encode_job_description(analysis.job_description),
        "match_explanation": _encode_match_explanation(analysis.match_explanation),
        "interview_preparation": _encode_interview_preparation(
            analysis.interview_preparation
        ),
        "ai_enrichment": _encode_ai_enrichment(analysis.ai_enrichment),
    }


def _decode_analysis_dict(data: dict[str, Any]) -> SavedAnalysis:
    import uuid

    return SavedAnalysis(
        analysis_id=uuid.UUID(data["analysis_id"]),
        created_at=datetime.fromisoformat(data["created_at"]),
        candidate_profile=_decode_candidate_profile(data["candidate_profile"]),
        job_description=_decode_job_description(data["job_description"]),
        match_explanation=_decode_match_explanation(data["match_explanation"]),
        interview_preparation=_decode_interview_preparation(
            data["interview_preparation"]
        ),
        ai_enrichment=_decode_ai_enrichment(data["ai_enrichment"]),
    )


# --- Candidate Profile ---


def _encode_candidate_profile(profile: CandidateProfile) -> dict[str, Any]:
    return {
        "skills": [s.name for s in profile.skills],
        "experience": [
            {
                "role_title": e.role_title.title,
                "company_name": e.company_name,
                "duration_months": e.duration_months,
                "description": e.description,
                "skills": [s.name for s in e.skills],
            }
            for e in profile.experience
        ],
        "education": [
            {
                "level": e.level,
                "field_of_study": e.field_of_study,
                "institution": e.institution,
                "description": e.description,
            }
            for e in profile.education
        ],
        "projects": [
            {
                "name": p.name,
                "description": p.description,
                "skills": [s.name for s in p.skills],
            }
            for p in profile.projects
        ],
        "certifications": [
            {
                "name": c.name,
                "issuer": c.issuer,
                "description": c.description,
            }
            for c in profile.certifications
        ],
        "preferences": (
            {
                "target_titles": [t.title for t in profile.preferences.target_titles],
                "preferred_locations": list(profile.preferences.preferred_locations),
                "acceptable_work_modes": [
                    m.value for m in profile.preferences.acceptable_work_modes
                ],
            }
            if profile.preferences
            else None
        ),
    }


def _decode_candidate_profile(data: dict[str, Any]) -> CandidateProfile:
    prefs_data = data.get("preferences")
    preferences = None
    if prefs_data:
        preferences = CandidatePreferences(
            target_titles=tuple(JobTitle(title=t) for t in prefs_data["target_titles"]),
            preferred_locations=tuple(prefs_data["preferred_locations"]),
            acceptable_work_modes=tuple(
                WorkMode(m) for m in prefs_data["acceptable_work_modes"]
            ),
        )

    return CandidateProfile(
        skills=tuple(Skill(name=s) for s in data["skills"]),
        experience=tuple(
            WorkExperience(
                role_title=JobTitle(title=e["role_title"]),
                company_name=e["company_name"],
                duration_months=e["duration_months"],
                description=e["description"],
                skills=tuple(Skill(name=s) for s in e["skills"]),
            )
            for e in data["experience"]
        ),
        education=tuple(
            EducationRecord(
                level=EducationLevel(e["level"]),
                field_of_study=e["field_of_study"],
                institution=e["institution"],
                description=e.get("description"),
            )
            for e in data["education"]
        ),
        projects=tuple(
            Project(
                name=p["name"],
                description=p["description"],
                skills=tuple(Skill(name=s) for s in p["skills"]),
            )
            for p in data["projects"]
        ),
        certifications=tuple(
            Certification(
                name=c["name"],
                issuer=c["issuer"],
                description=c.get("description"),
            )
            for c in data["certifications"]
        ),
        preferences=preferences,
    )


# --- Job Description ---


def _encode_job_description(job: JobDescription) -> dict[str, Any]:
    return {
        "title": job.title.title,
        "responsibilities": [r.description for r in job.responsibilities],
        "required_skills": [s.name for s in job.required_skills],
        "preferred_skills": [s.name for s in job.preferred_skills],
        "company_info": (
            {
                "name": job.company_info.name,
                "industry": job.company_info.industry,
                "location": job.company_info.location,
            }
            if job.company_info
            else None
        ),
        "experience_requirement": (
            {
                "minimum_years": job.experience_requirement.minimum_years,
                "maximum_years": job.experience_requirement.maximum_years,
            }
            if job.experience_requirement
            else None
        ),
        "education_requirement": (
            {
                "level": job.education_requirement.level,
                "field_of_study": job.education_requirement.field_of_study,
                "description": job.education_requirement.description,
            }
            if job.education_requirement
            else None
        ),
    }


def _decode_job_description(data: dict[str, Any]) -> JobDescription:
    company_data = data.get("company_info")
    company_info = None
    if company_data:
        company_info = CompanyInfo(
            name=company_data["name"],
            industry=company_data.get("industry"),
            location=company_data.get("location"),
        )

    exp_data = data.get("experience_requirement")
    experience_requirement = None
    if exp_data:
        experience_requirement = ExperienceRequirement(
            minimum_years=exp_data["minimum_years"],
            maximum_years=exp_data.get("maximum_years"),
        )

    edu_data = data.get("education_requirement")
    education_requirement = None
    if edu_data:
        education_requirement = EducationRequirement(
            level=(
                EducationLevel(edu_data["level"])
                if edu_data["level"] is not None
                else None
            ),
            field_of_study=edu_data.get("field_of_study"),
            description=edu_data.get("description"),
        )

    return JobDescription(
        title=JobTitle(title=data["title"]),
        responsibilities=tuple(
            Responsibility(description=r) for r in data["responsibilities"]
        ),
        required_skills=tuple(Skill(name=s) for s in data["required_skills"]),
        preferred_skills=tuple(Skill(name=s) for s in data["preferred_skills"]),
        company_info=company_info,
        experience_requirement=experience_requirement,
        education_requirement=education_requirement,
    )


# --- Match Explanation ---


def _encode_match_explanation(expl: MatchExplanation) -> dict[str, Any]:
    return {
        "score": {"value": expl.score.value},
        "components": [
            {
                "kind": c.kind.value,
                "earned_points": c.earned_points,
                "possible_points": c.possible_points,
            }
            for c in expl.components
        ],
        "matched_skills": [
            {
                "skill": m.skill.name,
                "is_required": m.is_required,
                "evidence_sources": [
                    {"kind": es.kind.value, "label": es.label}
                    for es in m.evidence_sources
                ],
            }
            for m in expl.matched_skills
        ],
        "experience": (
            {
                "required_months": expl.experience.required_months,
                "known_candidate_months": expl.experience.known_candidate_months,
                "earned_points": expl.experience.earned_points,
                "possible_points": expl.experience.possible_points,
            }
            if expl.experience
            else None
        ),
        "education": (
            {
                "requirement": {
                    "level": expl.education.requirement.level,
                    "field_of_study": expl.education.requirement.field_of_study,
                    "description": expl.education.requirement.description,
                },
                "matched_record": (
                    {
                        "level": expl.education.matched_record.level,
                        "field_of_study": expl.education.matched_record.field_of_study,
                        "institution": expl.education.matched_record.institution,
                        "description": expl.education.matched_record.description,
                    }
                    if expl.education.matched_record
                    else None
                ),
                "satisfied": expl.education.satisfied,
            }
            if expl.education
            else None
        ),
        "gaps": {
            "missing_required_skills": [
                s.name for s in expl.gaps.missing_required_skills
            ],
            "missing_preferred_skills": [
                s.name for s in expl.gaps.missing_preferred_skills
            ],
            "experience_gap": (
                {
                    "required_months": expl.gaps.experience_gap.required_months,
                    "known_candidate_months": (
                        expl.gaps.experience_gap.known_candidate_months
                    ),
                    "missing_months": expl.gaps.experience_gap.missing_months,
                }
                if expl.gaps.experience_gap
                else None
            ),
            "education_gap": (
                {
                    "level": expl.gaps.education_gap.level,
                    "field_of_study": expl.gaps.education_gap.field_of_study,
                    "description": expl.gaps.education_gap.description,
                }
                if expl.gaps.education_gap
                else None
            ),
        },
        "keyword_coverage": {
            "matched_keywords": [
                s.name for s in expl.keyword_coverage.matched_keywords
            ],
            "missing_keywords": [
                s.name for s in expl.keyword_coverage.missing_keywords
            ],
            "percentage": expl.keyword_coverage.percentage,
        },
    }


def _decode_match_explanation(data: dict[str, Any]) -> MatchExplanation:
    exp_data = data.get("experience")
    experience = None
    if exp_data:
        experience = ExperienceEvidence(
            required_months=exp_data["required_months"],
            known_candidate_months=exp_data["known_candidate_months"],
            earned_points=exp_data["earned_points"],
            possible_points=exp_data["possible_points"],
        )

    edu_data = data.get("education")
    education = None
    if edu_data:
        req_data = edu_data["requirement"]
        requirement = EducationRequirement(
            level=(
                EducationLevel(req_data["level"])
                if req_data["level"] is not None
                else None
            ),
            field_of_study=req_data.get("field_of_study"),
            description=req_data.get("description"),
        )
        rec_data = edu_data.get("matched_record")
        matched_record = None
        if rec_data:
            matched_record = EducationRecord(
                level=EducationLevel(rec_data["level"]),
                field_of_study=rec_data.get("field_of_study"),
                institution=rec_data["institution"],
                description=rec_data.get("description"),
            )
        education = EducationEvidence(
            requirement=requirement,
            matched_record=matched_record,
            satisfied=edu_data["satisfied"],
        )

    gaps_data = data["gaps"]
    exp_gap_data = gaps_data.get("experience_gap")
    experience_gap = None
    if exp_gap_data:
        experience_gap = ExperienceGap(
            required_months=exp_gap_data["required_months"],
            known_candidate_months=exp_gap_data["known_candidate_months"],
            missing_months=exp_gap_data["missing_months"],
        )

    edu_gap_data = gaps_data.get("education_gap")
    education_gap = None
    if edu_gap_data:
        education_gap = EducationRequirement(
            level=(
                EducationLevel(edu_gap_data["level"])
                if edu_gap_data["level"] is not None
                else None
            ),
            field_of_study=edu_gap_data.get("field_of_study"),
            description=edu_gap_data.get("description"),
        )

    return MatchExplanation(
        score=MatchScore(value=data["score"]["value"]),
        components=tuple(
            ScoreComponent(
                kind=ScoreComponentKind(c["kind"]),
                earned_points=c["earned_points"],
                possible_points=c["possible_points"],
            )
            for c in data["components"]
        ),
        matched_skills=tuple(
            MatchedSkillEvidence(
                skill=Skill(name=m["skill"]),
                is_required=m["is_required"],
                evidence_sources=tuple(
                    EvidenceSource(
                        kind=EvidenceSourceKind(es["kind"]), label=es["label"]
                    )
                    for es in m["evidence_sources"]
                ),
            )
            for m in data["matched_skills"]
        ),
        experience=experience,
        education=education,
        gaps=GapAnalysis(
            missing_required_skills=tuple(
                Skill(name=s) for s in gaps_data["missing_required_skills"]
            ),
            missing_preferred_skills=tuple(
                Skill(name=s) for s in gaps_data["missing_preferred_skills"]
            ),
            experience_gap=experience_gap,
            education_gap=education_gap,
        ),
        keyword_coverage=SkillKeywordCoverage(
            matched_keywords=tuple(
                Skill(name=s) for s in data["keyword_coverage"]["matched_keywords"]
            ),
            missing_keywords=tuple(
                Skill(name=s) for s in data["keyword_coverage"]["missing_keywords"]
            ),
            percentage=data["keyword_coverage"]["percentage"],
        ),
    )


# --- Interview Preparation ---


def _encode_interview_preparation(prep: InterviewPreparation) -> dict[str, Any]:
    return {
        "themes": [
            {"kind": t.kind.value, "description": t.description} for t in prep.themes
        ],
        "talking_points": [{"description": t.description} for t in prep.talking_points],
        "question_categories": [c.value for c in prep.question_categories],
        "candidate_questions": [
            {"description": q.description} for q in prep.candidate_questions
        ],
    }


def _decode_interview_preparation(data: dict[str, Any]) -> InterviewPreparation:
    return InterviewPreparation(
        themes=tuple(
            InterviewTheme(
                kind=InterviewThemeKind(t["kind"]), description=t["description"]
            )
            for t in data["themes"]
        ),
        talking_points=tuple(
            TalkingPoint(description=t["description"]) for t in data["talking_points"]
        ),
        question_categories=tuple(
            InterviewQuestionCategory(c) for c in data["question_categories"]
        ),
        candidate_questions=tuple(
            InterviewerQuestion(description=q["description"])
            for q in data["candidate_questions"]
        ),
    )


# --- AI Enrichment ---


def _encode_ai_enrichment(ai: AIEnrichmentResult | None) -> dict[str, Any] | None:
    if not ai:
        return None
    return {
        "content": ai.content,
        "provider_name": ai.provider_name,
    }


def _decode_ai_enrichment(data: dict[str, Any] | None) -> AIEnrichmentResult | None:
    if not data:
        return None
    return AIEnrichmentResult(
        content=data["content"],
        provider_name=data["provider_name"],
    )
