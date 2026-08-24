"""
Skill domain primitive.
"""

from dataclasses import dataclass

from ._normalization import _normalize_whitespace


@dataclass(frozen=True, slots=True)
class Skill:
    name: str

    def __post_init__(self) -> None:
        if not self.name or not self.name.strip():
            raise ValueError("Skill cannot be blank.")
        object.__setattr__(self, "name", _normalize_whitespace(self.name).lower())
