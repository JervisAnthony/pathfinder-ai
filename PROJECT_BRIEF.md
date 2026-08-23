# Pathfinder AI — Project Brief

## Purpose

Pathfinder AI is an AI-assisted job-search and interview-preparation platform. It helps a candidate compare their profile against a target role and converts that comparison into clear, actionable application guidance.

## MVP-1 Product Goal

A user can provide:
- a candidate profile / resume-derived profile
- a job description

Pathfinder AI returns:
- an explainable candidate–job match score
- matched strengths
- skill and experience gaps
- keyword coverage
- application talking points
- likely interview questions
- questions the candidate can ask the interviewer
- targeted learning / course recommendations

MVP-1 is web-first. Android and desktop clients are future surfaces and must not distort the initial architecture.

## MVP-1 Boundaries

In scope:
- typed domain models
- deterministic baseline matching
- explainable scoring
- provider-neutral AI abstraction
- FastAPI API
- basic persistence for analysis history
- web UI for entering candidate/job data and viewing analysis
- automated tests and CI

Out of scope for MVP-1:
- scraping LinkedIn, Indeed, Foundit, JobStreet, or other platforms
- bypassing site protections or terms of service
- browser automation for job applications
- automatic application submission
- fabricated job data
- production billing
- mobile/desktop native clients

## Architectural Principle

The product must work without an LLM for its core scoring path. AI enrichment is an optional layer behind interfaces, not a dependency of the core domain.

## Initial Stack

- Python 3.13+
- FastAPI
- Pydantic v2
- pytest
- Ruff
- mypy
- SQLite for MVP persistence, behind repository interfaces
- React + TypeScript for the web client when the frontend phase begins

## Quality Bar

The system should favor explicit domain models, deterministic behavior, explainability, testability, and replaceable infrastructure adapters.
