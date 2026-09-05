"""Transient, bounded PDF/OOXML text extraction for exact skill import."""

import re
from dataclasses import dataclass
from io import BytesIO
from typing import Literal
from xml.etree import ElementTree
from zipfile import ZipFile

from pypdf import PdfReader

from pathfinder_ai.application.resume_skill_import import MAX_RESUME_TEXT_LENGTH

MAX_RESUME_FILE_BYTES = 10 * 1024 * 1024
MAX_PDF_PAGES = 100
MAX_DOCX_ENTRIES = 2_000
MAX_DOCX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024
_W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


class ResumeDocumentError(Exception):
    """Safe failure category; never carries document or parser details."""

    def __init__(
        self,
        reason: Literal[
            "unsupported", "unreadable", "encrypted", "limit", "no_text", "file_size"
        ],
    ) -> None:
        self.reason = reason
        super().__init__(reason)


@dataclass(frozen=True, slots=True)
class ExtractedResumeDocument:
    text: str
    format: Literal["pdf", "docx"]


def _join_text(parts: list[str]) -> str:
    text = "\n".join(parts)
    if len(text) > MAX_RESUME_TEXT_LENGTH:
        raise ResumeDocumentError("limit")
    return text


def _pdf_text(data: bytes) -> str:
    if re.search(rb"%PDF-\d\.\d", data[:1024]) is None:
        raise ResumeDocumentError("unreadable")
    reader = PdfReader(BytesIO(data), strict=True)
    if reader.is_encrypted:
        raise ResumeDocumentError("encrypted")
    if len(reader.pages) > MAX_PDF_PAGES:
        raise ResumeDocumentError("limit")
    parts: list[str] = []
    for page in reader.pages:
        parts.append(page.extract_text() or "")
        _join_text(parts)
    return _join_text(parts)


def _docx_text(data: bytes) -> str:
    with ZipFile(BytesIO(data)) as archive:
        entries = archive.infolist()
        if (
            len(entries) > MAX_DOCX_ENTRIES
            or sum(entry.file_size for entry in entries) > MAX_DOCX_UNCOMPRESSED_BYTES
        ):
            raise ResumeDocumentError("limit")
        if any(entry.flag_bits & 1 for entry in entries):
            raise ResumeDocumentError("encrypted")
        names = [entry.filename for entry in entries]
        if len(set(names)) != len(names) or not {
            "[Content_Types].xml",
            "word/document.xml",
        }.issubset(names):
            raise ResumeDocumentError("unreadable")
        selected = [
            "word/document.xml",
            *sorted(
                name
                for name in names
                if re.fullmatch(
                    r"word/(?:header\d*|footer\d*|footnotes|endnotes)\.xml", name
                )
            ),
        ]
        parts: list[str] = []
        for name in ["[Content_Types].xml", *selected]:
            with archive.open(name) as source:
                xml = source.read(MAX_DOCX_UNCOMPRESSED_BYTES + 1)
            if len(xml) > MAX_DOCX_UNCOMPRESSED_BYTES:
                raise ResumeDocumentError("limit")
            # Reject DTDs/entities, including UTF-16 encodings, before XML parsing.
            if (
                b"<!DOCTYPE" in xml.replace(b"\x00", b"").upper()
                or b"<!ENTITY" in xml.replace(b"\x00", b"").upper()
            ):
                raise ResumeDocumentError("unreadable")
            root = ElementTree.fromstring(xml)
            if name == "[Content_Types].xml":
                if (
                    root.tag
                    != "{http://schemas.openxmlformats.org/package/2006/content-types}Types"
                ):
                    raise ResumeDocumentError("unreadable")
                continue
            if not root.tag.startswith(_W):
                raise ResumeDocumentError("unreadable")
            for paragraph in root.iter(f"{_W}p"):
                parts.append(
                    "".join(node.text or "" for node in paragraph.iter(f"{_W}t"))
                )
                _join_text(parts)
        return _join_text(parts)


def extract_resume_document(data: bytes, filename: str) -> ExtractedResumeDocument:
    """Read supported bytes without opening paths or retaining parser objects."""
    if len(data) > MAX_RESUME_FILE_BYTES:
        raise ResumeDocumentError("file_size")
    extension = filename.rsplit(".", 1)[-1].lower()
    if extension not in {"pdf", "docx"}:
        raise ResumeDocumentError("unsupported")
    try:
        text = _pdf_text(data) if extension == "pdf" else _docx_text(data)
    except ResumeDocumentError:
        raise
    except Exception:
        # Parser exceptions vary by malformed input. This boundary deliberately
        # replaces their content; no global exception handler is installed.
        raise ResumeDocumentError("unreadable") from None
    if not text.strip():
        raise ResumeDocumentError("no_text")
    return ExtractedResumeDocument(text, "pdf" if extension == "pdf" else "docx")
