"""
Job Title domain primitive.
"""

from dataclasses import dataclass

from ._normalization import _normalize_whitespace


@dataclass(frozen=True, slots=True)
class JobTitle:
    title: str

    def __post_init__(self) -> None:
        if not self.title or not self.title.strip():
            raise ValueError("JobTitle cannot be blank.")
        normalized = _normalize_whitespace(self.title)
        # Bypass frozen dataclass to set the normalized value
        object.__setattr__(self, "title", normalized)
