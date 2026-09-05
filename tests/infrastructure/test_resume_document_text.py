"""Synthetic documents exercise parsing without real resumes or disk fixtures."""

from io import BytesIO
from xml.sax.saxutils import escape
from zipfile import ZIP_DEFLATED, ZipFile

import pytest
from pypdf import PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject

from pathfinder_ai.infrastructure import resume_document_text as document


def make_pdf(
    text: str = "Python FastAPI Docker", pages: int = 1, encrypted: bool = False
) -> bytes:
    writer = PdfWriter()
    for _ in range(pages):
        page = writer.add_blank_page(width=612, height=792)
        font = DictionaryObject(
            {
                NameObject("/Type"): NameObject("/Font"),
                NameObject("/Subtype"): NameObject("/Type1"),
                NameObject("/BaseFont"): NameObject("/Helvetica"),
            }
        )
        page[NameObject("/Resources")] = DictionaryObject(
            {NameObject("/Font"): DictionaryObject({NameObject("/F1"): font})}
        )
        stream = DecodedStreamObject()
        stream.set_data(f"BT /F1 12 Tf 50 700 Td ({text}) Tj ET".encode())
        page[NameObject("/Contents")] = writer._add_object(stream)
    if encrypted:
        writer.encrypt("synthetic-password")
    output = BytesIO()
    writer.write(output)
    writer.close()
    return output.getvalue()


def make_docx(
    text: str = "Python FastAPI Docker", extra: dict[str, str] | None = None
) -> bytes:
    output = BytesIO()
    with ZipFile(output, "w", ZIP_DEFLATED) as archive:
        archive.writestr(
            "[Content_Types].xml",
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
        )
        archive.writestr(
            "word/document.xml",
            word_xml(f"<w:p><w:r><w:t>{escape(text)}</w:t></w:r></w:p>"),
        )
        for name, content in (extra or {}).items():
            archive.writestr(name, content)
    return output.getvalue()


def word_xml(body: str) -> str:
    return f'<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>{body}</w:body></w:document>'


@pytest.mark.parametrize("extension,factory", [("PDF", make_pdf), ("DOCX", make_docx)])
def test_valid_deterministic_and_no_files(extension, factory, monkeypatch):
    data = factory("Python <script>alert</script>")

    def forbidden(*args, **kwargs):
        raise AssertionError("filesystem access")

    monkeypatch.setattr("builtins.open", forbidden)
    first = document.extract_resume_document(data, f"../../private.{extension}")
    assert first == document.extract_resume_document(data, f"../../private.{extension}")
    assert first.text == "Python <script>alert</script>"
    assert first.format == extension.lower()


def test_docx_runs_tables_and_text_parts():
    parts = {
        f"word/{name}.xml": word_xml(
            "<w:p><w:r><w:t>Py</w:t></w:r><w:r><w:t>thon</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>C++</w:t></w:r></w:p></w:tc></w:tr></w:tbl>"
        )
        for name in ["header1", "footer1", "footnotes", "endnotes"]
    }
    result = document.extract_resume_document(make_docx("Main", parts), "resume.docx")
    assert result.text == "Main" + "\nPython\nC++" * 4


@pytest.mark.parametrize(
    "data,name,reason",
    [
        (b"", "resume.txt", "unsupported"),
        (b"private", "resume.pdf", "unreadable"),
        (b"%PDF-1.7 private", "resume.pdf", "unreadable"),
        (b"private", "resume.docx", "unreadable"),
        (make_pdf(), "resume.docx", "unreadable"),
        (make_docx(), "resume.pdf", "unreadable"),
        (make_pdf(encrypted=True), "resume.pdf", "encrypted"),
        (make_pdf(""), "resume.pdf", "no_text"),
        (make_docx(""), "resume.docx", "no_text"),
    ],
)
def test_safe_failures(data, name, reason):
    with pytest.raises(document.ResumeDocumentError) as caught:
        document.extract_resume_document(data, name)
    assert caught.value.reason == reason
    assert str(caught.value) == reason


@pytest.mark.parametrize(
    "limit,value,data,name",
    [
        ("MAX_RESUME_FILE_BYTES", 1, make_pdf(), "r.pdf"),
        ("MAX_PDF_PAGES", 1, make_pdf(pages=2), "r.pdf"),
        ("MAX_DOCX_ENTRIES", 1, make_docx(), "r.docx"),
        ("MAX_DOCX_UNCOMPRESSED_BYTES", 1, make_docx(), "r.docx"),
        ("MAX_RESUME_TEXT_LENGTH", 2, make_docx(), "r.docx"),
        ("MAX_RESUME_TEXT_LENGTH", 2, make_pdf(), "r.pdf"),
    ],
)
def test_limits_reject_instead_of_truncating(limit, value, data, name, monkeypatch):
    monkeypatch.setattr(document, limit, value)
    with pytest.raises(document.ResumeDocumentError) as caught:
        document.extract_resume_document(data, name)
    assert caught.value.reason in {"limit", "file_size"}


@pytest.mark.parametrize(
    "entries",
    [
        {"unrelated": "text"},
        {"[Content_Types].xml": "<bad/>", "word/document.xml": word_xml("")},
        {
            "[Content_Types].xml": '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
            "word/document.xml": "<bad/>",
        },
        {"[Content_Types].xml": "<!DOCTYPE x><x/>", "word/document.xml": word_xml("")},
        {"[Content_Types].xml": "<broken", "word/document.xml": word_xml("")},
    ],
)
def test_invalid_ooxml(entries):
    output = BytesIO()
    with ZipFile(output, "w") as archive:
        for name, xml in entries.items():
            archive.writestr(name, xml)
    with pytest.raises(document.ResumeDocumentError, match="unreadable"):
        document.extract_resume_document(output.getvalue(), "r.docx")


def test_encrypted_zip_metadata():
    data = bytearray(make_docx())
    offset = data.index(b"PK\x01\x02")
    data[offset + 8] |= 1
    with pytest.raises(document.ResumeDocumentError, match="encrypted"):
        document.extract_resume_document(bytes(data), "r.docx")


def test_actual_xml_read_is_bounded_even_if_metadata_understates_size(monkeypatch):
    data = make_docx()
    monkeypatch.setattr(document, "MAX_DOCX_UNCOMPRESSED_BYTES", 1024)
    reads = []

    class OversizedSource(BytesIO):
        def read(self, size=-1):
            reads.append(size)
            return super().read(size)

    monkeypatch.setattr(
        ZipFile, "open", lambda *args, **kwargs: OversizedSource(b"x" * 2048)
    )
    with pytest.raises(document.ResumeDocumentError, match="limit"):
        document.extract_resume_document(data, "r.docx")
    assert reads == [1025]
