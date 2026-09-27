"""Deterministic, inert Markdown reports from existing saved snapshots."""

from string import punctuation

from pathfinder_ai.application.analysis_history import SavedAnalysis

_MARKDOWN_ESCAPES = str.maketrans(
    {
        character: "&amp;" if character == "&" else f"\\{character}"
        for character in punctuation
    }
)


def _escape(value: str) -> str:
    """Keep stored values as text, including multiline and HTML-like content."""
    return "\n  ".join(line.translate(_MARKDOWN_ESCAPES) for line in value.splitlines())


def render_saved_analysis_markdown(analysis: SavedAnalysis) -> str:
    """Render stored results without providers, recomputation, or side effects."""
    lines = [
        "# Pathfinder Analysis",
        "",
        f"- Analysis ID: {analysis.analysis_id}",
        f"- Saved timestamp: {analysis.created_at.isoformat()}",
        "",
        "## Target Role",
        "",
        f"- Job title: {_escape(analysis.job_description.title.title)}",
    ]
    company = analysis.job_description.company_info
    if company is not None:
        for label, value in (
            ("Company", company.name),
            ("Industry", company.industry),
            ("Location", company.location),
        ):
            if value is not None:
                lines.append(f"- {label}: {_escape(value)}")

    explanation = analysis.match_explanation
    score = explanation.score.value
    lines.extend(
        [
            "",
            "## Match Summary",
            "",
            f"- Deterministic score: {score:g}%"
            if score is not None
            else "- Not scored",
        ]
    )
    for component in explanation.components:
        label = _escape(component.kind.value.replace("_", " "))
        lines.append(
            f"- {label}: {component.earned_points:g} / "
            f"{component.possible_points:g} points"
        )

    if explanation.matched_skills:
        lines.extend(["", "## Matched Evidence", ""])
        for matched in explanation.matched_skills:
            requirement = "required" if matched.is_required else "preferred"
            lines.append(f"- {_escape(matched.skill.name)} ({requirement})")
            for source in matched.evidence_sources:
                label = f": {_escape(source.label)}" if source.label is not None else ""
                lines.append(f"  - {_escape(source.kind.value)}{label}")

    gaps = explanation.gaps
    if (
        gaps.missing_required_skills
        or gaps.missing_preferred_skills
        or gaps.experience_gap is not None
        or gaps.education_gap is not None
    ):
        lines.extend(["", "## Gaps", ""])
        for label, skills in (
            ("Missing required skill", gaps.missing_required_skills),
            ("Missing preferred skill", gaps.missing_preferred_skills),
        ):
            for skill in skills:
                lines.append(f"- {label}: {_escape(skill.name)}")
        if gaps.experience_gap is not None:
            gap = gaps.experience_gap
            lines.append(
                f"- Experience: {gap.required_months} months required; "
                f"{gap.known_candidate_months} known; {gap.missing_months} missing"
            )
        if gaps.education_gap is not None:
            education = gaps.education_gap
            for label, value in (
                ("level", education.level.value if education.level else None),
                ("field", education.field_of_study),
                ("description", education.description),
            ):
                if value is not None:
                    lines.append(f"- Education {label}: {_escape(value)}")

    keywords = explanation.keyword_coverage
    if keywords.percentage is not None:
        lines.extend(["", "## Keyword Coverage", ""])
        lines.append(f"- Stored skill keyword coverage: {keywords.percentage:g}%")
        for label, skills in (
            ("Matched keyword", keywords.matched_keywords),
            ("Missing keyword", keywords.missing_keywords),
        ):
            for skill in skills:
                lines.append(f"- {label}: {_escape(skill.name)}")

    preparation = analysis.interview_preparation
    if preparation.talking_points:
        lines.extend(["", "## Candidate Talking Points", ""])
        lines.extend(
            f"- {_escape(point.description)}" for point in preparation.talking_points
        )
    if (
        preparation.themes
        or preparation.question_categories
        or preparation.candidate_questions
    ):
        lines.extend(["", "## Interview Preparation", ""])
        for theme in preparation.themes:
            lines.append(
                f"- Theme ({_escape(theme.kind.value)}): {_escape(theme.description)}"
            )
        for category in preparation.question_categories:
            lines.append(f"- Question category: {_escape(category.value)}")
        for question in preparation.candidate_questions:
            lines.append(
                f"- Candidate-to-interviewer question: {_escape(question.description)}"
            )

    recommendations = analysis.learning_recommendations
    if recommendations is not None and recommendations.items:
        lines.extend(["", "## Targeted Learning Recommendations", ""])
        for item in recommendations.items:
            lines.append(f"- {_escape(item.title)} ({_escape(item.priority.value)})")
            lines.append(f"  - Topic: {_escape(item.topic)}")
            lines.append(f"  - Rationale: {_escape(item.rationale)}")
            if item.suggested_course_topic is not None:
                lines.append(
                    "  - Suggested course topic: "
                    f"{_escape(item.suggested_course_topic)}"
                )

    if analysis.ai_enrichment is not None:
        lines.extend(
            [
                "",
                "## AI Enrichment",
                "",
                "Stored AI-generated content may be inaccurate; "
                "it is separate from deterministic scoring.",
                f"- Provider: {_escape(analysis.ai_enrichment.provider_name)}",
                f"- Stored enrichment text: {_escape(analysis.ai_enrichment.content)}",
            ]
        )

    lines.extend(
        [
            "",
            "## Caveat",
            "",
            "Pathfinder's deterministic match result is application guidance, "
            "not a hiring probability, an employer decision, an ATS result, "
            "or a guarantee of interview or employment.",
        ]
    )
    return "\n".join(lines) + "\n"
