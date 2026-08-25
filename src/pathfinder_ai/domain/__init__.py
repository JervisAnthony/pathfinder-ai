"""
Domain models for Pathfinder AI.
"""

from .candidate_profile import (
    CandidatePreferences,
    CandidateProfile,
    Certification,
    EducationRecord,
    Project,
    WorkExperience,
    WorkMode,
)
from .education import EducationLevel
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
from .job_description import (
    CompanyInfo,
    EducationRequirement,
    ExperienceRequirement,
    JobDescription,
    Responsibility,
)
from .job_title import JobTitle
from .matching import DeterministicMatcher, MatchScore
from .skill import Skill

__all__ = [
    "CandidatePreferences",
    "CandidateProfile",
    "Certification",
    # Job Description
    "CompanyInfo",
    "DeterministicMatcher",
    "EducationEvidence",
    "EducationLevel",
    # Candidate Profile
    "EducationRecord",
    "EducationRequirement",
    "EvidenceSource",
    "EvidenceSourceKind",
    "ExperienceEvidence",
    "ExperienceGap",
    "ExperienceRequirement",
    "GapAnalysis",
    "JobDescription",
    "JobTitle",
    "MatchExplanation",
    # Matching Engine
    "MatchScore",
    "MatchedSkillEvidence",
    "Project",
    "Responsibility",
    "ScoreComponent",
    # Explanation Engine
    "ScoreComponentKind",
    # Primitives
    "Skill",
    "SkillKeywordCoverage",
    "WorkExperience",
    "WorkMode",
]
