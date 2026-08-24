"""
Shared normalization helpers for Pathfinder AI domain models.
"""

import re


def _normalize_whitespace(text: str) -> str:
    """Strip leading/trailing whitespace and collapse internal whitespace."""
    return re.sub(r"\s+", " ", text).strip()


def _clean_optional_string(text: str | None) -> str | None:
    """Normalize optional text, converting blank strings to None."""
    if text is None:
        return None
    normalized = _normalize_whitespace(text)
    return normalized if normalized else None
