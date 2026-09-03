"""Explicit runtime wiring for optional local SQLite persistence."""

import os
from pathlib import Path

from fastapi import FastAPI

from pathfinder_ai.api.app import create_app
from pathfinder_ai.infrastructure.sqlite_analysis_repository import (
    SQLiteAnalysisRepository,
)

SQLITE_PATH_ENVIRONMENT_VARIABLE = "PATHFINDER_SQLITE_PATH"


def create_runtime_app() -> FastAPI:
    """Create an app with SQLite persistence only when explicitly configured."""
    configured_path = os.environ.get(SQLITE_PATH_ENVIRONMENT_VARIABLE)
    if configured_path is None:
        return create_app()

    database_path = Path(configured_path)
    database_path.parent.mkdir(parents=True, exist_ok=True)
    repository = SQLiteAnalysisRepository(database_path)
    return create_app(analysis_repository=repository)
