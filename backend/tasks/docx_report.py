"""Generate real Weekly / Monthly Status Report .docx files.

This fills in the bookmarks of the original PMS-406 sUSV Word report
templates (the same templates the legacy VBA macros -- CreateWeeklyReport /
CreateMonthlyReport -- wrote into), using the exact data produced by
reports.build_weekly_report / build_monthly_report. All static boilerplate
in the templates (the running header title block, the contract/TPOC/job
fields, the standing-meetings reference table, and the "Overall Program
Status" section) is left untouched, since it isn't part of the automated
data and lives in the template as-is.

Bookmark map (identical in both templates except the *_Task1 name):
    date_Submission, report_Period, start_Date, completion_Date
    weekly_Task1 / monthly_Task1   (single insertion point, multi-line)
    meetings_Attended, meetings_Summary                 (multi-line)
    current_Travel1                                     (multi-line)
    deliverables_Previous, deliverables_Current, deliverables_Total
    deliverables_Date{1-5}, deliverables_Description{1-5}, deliverables_To{1-5}
    problem_Areas, mitigating_Action                    (multi-line)
    work_Planned, future_Travel1                        (multi-line)
"""
import copy
from io import BytesIO
from pathlib import Path

import docx
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

TEMPLATE_DIR = Path(__file__).resolve().parent / "report_templates"
TEMPLATES = {
    "weekly": TEMPLATE_DIR / "weekly_ref.docx",
    "monthly": TEMPLATE_DIR / "monthly_ref.docx",
}
TASK_BOOKMARK = {"weekly": "weekly_Task1", "monthly": "monthly_Task1"}

DEFAULT_RPR_XML = (
    '<w:rPr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
    '<w:color w:val="0000FF"/><w:sz w:val="20"/></w:rPr>'
)


def _iter_bookmark_starts(doc):
    return doc.element.body.findall(".//" + qn("w:bookmarkStart"))


def _find_bookmark_start(doc, name):
    for bm in _iter_bookmark_starts(doc):
        if bm.get(qn("w:name")) == name:
            return bm
    return None


def _enclosing_paragraph(el):
    node = el
    while node is not None and node.tag != qn("w:p"):
        node = node.getparent()
    return node


def _strip_list_formatting(pPr):
    """Remove native numbered/bulleted-list formatting so a paragraph looks
    like the "flattened" plain paragraphs used in the real filled-in
    reports (which use a literal typed bullet character instead)."""
    if pPr is None:
        return
    numPr = pPr.find(qn("w:numPr"))
    if numPr is not None:
        pPr.remove(numPr)
    pStyle = pPr.find(qn("w:pStyle"))
    if pStyle is not None and pStyle.get(qn("w:val")) == "ListParagraph":
        pPr.remove(pStyle)


def _bookmark_range(paragraph_el, name):
    """Return (start_idx, end_idx, children) where children[start_idx] is
    the bookmarkStart element and end_idx is either the index of the
    matching bookmarkEnd or len(children) if it isn't in this paragraph."""
    children = list(paragraph_el)
    start_idx = None
    bm_id = None
    for i, el in enumerate(children):
        if start_idx is None:
            if el.tag == qn("w:bookmarkStart") and el.get(qn("w:name")) == name:
                start_idx = i
                bm_id = el.get(qn("w:id"))
        else:
            if el.tag == qn("w:bookmarkEnd") and el.get(qn("w:id")) == bm_id:
                return start_idx, i, children
    if start_idx is None:
        return None
    return start_idx, len(children), children


def _make_run(text, rpr_el):
    r = OxmlElement("w:r")
    if rpr_el is not None:
        r.append(copy.deepcopy(rpr_el))
    t = OxmlElement("w:t")
    t.set(qn("xml:space"), "preserve")
    t.text = text
    r.append(t)
    return r


def _default_rpr():
    from lxml import etree

    return etree.fromstring(DEFAULT_RPR_XML)


def _fill_bookmark(doc, name, lines):
    """Fill a bookmark with one or more lines of text, replacing whatever
    runs currently sit inside its start/end range and preserving any other
    content (labels, tabs) in the same paragraph. Extra lines become new
    sibling paragraphs cloned from the same paragraph formatting, with
    native list numbering stripped (matches how the real reports render
    multi-item sections as plain typed-bullet paragraphs)."""
    if not lines:
        lines = [""]
    bm = _find_bookmark_start(doc, name)
    if bm is None:
        return False
    p = _enclosing_paragraph(bm)
    rng = _bookmark_range(p, name)
    if rng is None:
        return False
    start_idx, end_idx, children = rng

    # Formatting to reuse: prefer the rPr of the first run being replaced,
    # else the paragraph mark's rPr, else a sane default.
    rpr_el = None
    for el in children[start_idx + 1 : end_idx]:
        if el.tag == qn("w:r"):
            rpr_el = el.find(qn("w:rPr"))
            break
    pPr = p.find(qn("w:pPr"))
    if rpr_el is None and pPr is not None:
        rpr_el = pPr.find(qn("w:rPr"))
    if rpr_el is None:
        rpr_el = _default_rpr()

    _strip_list_formatting(pPr)
    base_pPr_copy = copy.deepcopy(pPr) if pPr is not None else None

    # Remove the old runs inside the bookmark range, insert the first line
    # right after the bookmarkStart element.
    for el in children[start_idx + 1 : end_idx]:
        if el.tag == qn("w:r"):
            p.remove(el)
    bm.addnext(_make_run(lines[0], rpr_el))

    anchor = p
    for line in lines[1:]:
        new_p = OxmlElement("w:p")
        if base_pPr_copy is not None:
            new_p.append(copy.deepcopy(base_pPr_copy))
        new_p.append(_make_run(line, rpr_el))
        anchor.addnext(new_p)
        anchor = new_p
    return True


def _fill_table_cell_bookmark(doc, name, text):
    """Deliverable table cells only ever hold a single value."""
    return _fill_bookmark(doc, name, [text or ""])


def render_report_docx(data, report_type):
    """Build a filled-in .docx for the given report data (as returned by
    reports.build_weekly_report / build_monthly_report) and return it as
    a BytesIO ready to stream to the client."""
    template_path = TEMPLATES[report_type]
    doc = docx.Document(str(template_path))

    _fill_bookmark(doc, "date_Submission", [data["date_submission"]])
    _fill_bookmark(doc, "report_Period", [data["report_period"]])
    _fill_bookmark(doc, "start_Date", [data["start_date"]])
    _fill_bookmark(doc, "completion_Date", [data["completion_date"]])

    _fill_bookmark(doc, TASK_BOOKMARK[report_type], data["tasks"])
    _fill_bookmark(doc, "meetings_Attended", data["meetings_attended"])
    _fill_bookmark(doc, "meetings_Summary", data["meetings_summary"])
    _fill_bookmark(doc, "current_Travel1", data["current_travel"])

    _fill_bookmark(doc, "deliverables_Previous", [str(data["deliverables_previous"])])
    _fill_bookmark(doc, "deliverables_Current", [str(data["deliverables_current"])])
    _fill_bookmark(doc, "deliverables_Total", [str(data["deliverables_cumulative"])])

    rows = data["deliverables"]
    for i in range(5):
        row = rows[i] if i < len(rows) else None
        n = i + 1
        _fill_table_cell_bookmark(doc, f"deliverables_Date{n}", row["date"] if row else "")
        _fill_table_cell_bookmark(
            doc, f"deliverables_Description{n}", row["description"] if row else ""
        )
        _fill_table_cell_bookmark(doc, f"deliverables_To{n}", row["recipient"] if row else "")

    _fill_bookmark(doc, "problem_Areas", data["problem_areas"])
    mitigating = data.get("mitigating_action") or data.get("mitigating_action_default")
    _fill_bookmark(doc, "mitigating_Action", [mitigating])
    _fill_bookmark(doc, "work_Planned", data["work_planned"])
    _fill_bookmark(doc, "future_Travel1", data["future_travel"])

    buffer = BytesIO()
    doc.save(buffer)
    buffer.seek(0)
    return buffer
