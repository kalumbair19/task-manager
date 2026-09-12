"""Weekly / Monthly Status Report generation.

This reproduces the logic from the original Excel workbook's
`CreateWeeklyReport` / `CreateMonthlyReport` VBA macros (which wrote into
Word bookmarks) as plain Python + JSON, so the same report can be rendered
on screen and printed/saved as a PDF straight from the browser.

Faithfully carried over from the macros, quirks and all (documented inline
where a decision diverges intentionally -- see DEPLOYMENT.md / the chat
history for why):
  * "Mitigating action(s) taken" was never actually computed from task data
    in the macro (no status category feeds it) -- it's an editable field
    here, defaulting to the same text the macro always fell back to.
  * The Deliverables "Previously Reported" / "Cumulative" counts were never
    computed by the macro either (stale manual numbers in the template).
    Here, "This Reporting Period" is auto-counted, "Previously Reported" is
    a small persisted, editable number (see DeliverableTally), and
    "Cumulative" = previous + current.
  * Weekly vs Monthly use different bullet characters for a few sections
    ("o" for populated Current Travel / Problem Areas / Work Planned rows
    in the *weekly* report, "-" [originally "•"] in the *monthly*
    report) -- kept exactly as the macros had it.
"""
import calendar
from datetime import date, timedelta

from .models import Task

# ---------------------------------------------------------------------------
# US federal holidays (used only to compute the "Start Date" / "Completion
# Date" business-day bounds shown in the report header -- the macros
# referenced an `IsHoliday` helper that wasn't in the files shared, so this
# uses the standard federal holiday list with weekend-observance shifting).
# ---------------------------------------------------------------------------


def _nth_weekday(year, month, weekday, n):
    """The date of the nth `weekday` (0=Monday) in `month`/`year`."""
    d = date(year, month, 1)
    offset = (weekday - d.weekday()) % 7
    d += timedelta(days=offset + 7 * (n - 1))
    return d


def _last_weekday(year, month, weekday):
    last_day = date(year, month, calendar.monthrange(year, month)[1])
    offset = (last_day.weekday() - weekday) % 7
    return last_day - timedelta(days=offset)


def _observed(d):
    """Shift a fixed-date holiday off weekends per federal observance rules."""
    if d.weekday() == 5:  # Saturday -> observed Friday
        return d - timedelta(days=1)
    if d.weekday() == 6:  # Sunday -> observed Monday
        return d + timedelta(days=1)
    return d


def us_federal_holidays(year):
    return {
        _observed(date(year, 1, 1)),  # New Year's Day
        _nth_weekday(year, 1, 0, 3),  # MLK Day
        _nth_weekday(year, 2, 0, 3),  # Washington's Birthday
        _last_weekday(year, 5, 0),  # Memorial Day
        _observed(date(year, 6, 19)),  # Juneteenth
        _observed(date(year, 7, 4)),  # Independence Day
        _nth_weekday(year, 9, 0, 1),  # Labor Day
        _nth_weekday(year, 10, 0, 2),  # Columbus Day
        _observed(date(year, 11, 11)),  # Veterans Day
        _nth_weekday(year, 11, 3, 4),  # Thanksgiving
        _observed(date(year, 12, 25)),  # Christmas
    }


def is_holiday(d):
    return d in us_federal_holidays(d.year)


def is_business_day(d):
    return d.weekday() < 5 and not is_holiday(d)


def first_business_day_on_or_after(d, ceiling=None):
    while not is_business_day(d):
        d += timedelta(days=1)
        if ceiling and d > ceiling:
            return ceiling
    return d


def last_business_day_on_or_before(d, floor=None):
    while not is_business_day(d):
        d -= timedelta(days=1)
        if floor and d < floor:
            return floor
    return d


def fmt(d):
    return d.strftime("%m/%d/%y") if d else ""


# ---------------------------------------------------------------------------
# Shared row helpers
# ---------------------------------------------------------------------------

ACTIVE_STATUSES = (Task.Status.NOT_STARTED, Task.Status.IN_PROGRESS)


def _in_range(d, start, end):
    return bool(d) and start <= d <= end


def _touches_range(task, start, end):
    return _in_range(task.start_date, start, end) or _in_range(task.due_date, start, end)


def _after(d, cutoff):
    return bool(d) and d > cutoff


def _touches_after(task, cutoff):
    return _after(task.start_date, cutoff) or _after(task.due_date, cutoff)


def _on_or_after(d, cutoff):
    return bool(d) and d >= cutoff


def _touches_on_or_after(task, cutoff):
    return _on_or_after(task.start_date, cutoff) or _on_or_after(task.due_date, cutoff)


def build_meetings(tasks, window_start, window_end):
    """Returns (attended_lines, summary_lines) -- numbered together, exactly
    like the macro's shared `meetingCount` counter."""
    attended, summary = [], []
    count = 0
    for t in tasks:
        if t.status != Task.Status.MEETINGS_ATTENDED:
            continue
        if not _touches_range(t, window_start, window_end):
            continue
        description = (t.description or "").strip()
        notes = (t.notes or "").strip()
        if description:
            count += 1
            attended.append(f"{count}. {description}")
        if notes:
            summary.append(f"{count}. {notes}")
    return attended, summary


def build_deliverables(tasks, window_start, window_end, in_month=False, month_start=None, month_end=None):
    rows = []
    for t in tasks:
        if t.status != Task.Status.WEEKLY_REPORTS:
            continue
        matched = (
            _touches_range(t, month_start, month_end)
            if in_month
            else _touches_range(t, window_start, window_end)
        )
        if not matched:
            continue
        if len(rows) >= 5:
            break
        rows.append({
            "date": f"{fmt(t.start_date)} - {fmt(t.due_date)}",
            "description": t.description or "",
            "recipient": t.notes or "",
        })
    return rows


def week_bounds_for(anchor):
    """Monday-Friday of the week containing `anchor`."""
    week_start = anchor - timedelta(days=anchor.weekday())
    week_end = week_start + timedelta(days=4)
    return week_start, week_end


def _default(lines, text):
    return lines if lines else [text]


def build_weekly_report(anchor, deliverable_previous=0):
    month_start = date(anchor.year, anchor.month, 1)
    month_end = date(anchor.year, anchor.month, calendar.monthrange(anchor.year, anchor.month)[1])

    week_start, week_end = week_bounds_for(anchor)
    if week_start < month_start:
        week_start = month_start
    if week_end > month_end:
        week_end = month_end
    next_week_start = week_end + timedelta(days=1)

    tasks = list(Task.objects.all())

    task_lines = [
        f"• {t.notes.strip()}"
        for t in tasks
        if t.status in ACTIVE_STATUSES and (t.notes or "").strip() and _touches_range(t, week_start, week_end)
    ]

    meetings_attended, meetings_summary = build_meetings(tasks, week_start, week_end)

    current_travel = [
        f"o {t.notes.strip()}"
        for t in tasks
        if t.status == Task.Status.UPCOMING_TRAVEL and (t.notes or "").strip() and _touches_range(t, week_start, week_end)
    ]

    future_travel = [
        f"• {t.notes.strip()}"
        for t in tasks
        if t.status == Task.Status.UPCOMING_TRAVEL and (t.notes or "").strip() and _touches_after(t, week_end)
    ]

    problem_areas = [
        f"o {t.notes.strip()}"
        for t in tasks
        if t.status in (Task.Status.ON_HOLD, Task.Status.CANCELLED) and (t.notes or "").strip() and _touches_range(t, week_start, week_end)
    ]

    work_planned = [
        f"o {t.notes.strip()}"
        for t in tasks
        if t.status == Task.Status.NOT_STARTED and (t.notes or "").strip() and _touches_on_or_after(t, next_week_start)
    ]

    deliverables = build_deliverables(tasks, week_start, week_end)

    start_biz = first_business_day_on_or_after(week_start, ceiling=week_end)
    end_biz = last_business_day_on_or_before(week_end, floor=week_start)

    current_count = len(deliverables)

    return {
        "report_type": "weekly",
        "date_submission": fmt(date.today()),
        "report_period": f"{fmt(week_start)} - {fmt(week_end)}",
        "start_date": fmt(start_biz),
        "completion_date": fmt(end_biz),
        "tasks": _default(task_lines, "• No tasks for this period."),
        "meetings_attended": _default(meetings_attended, "• No meetings attended during this period."),
        "meetings_summary": _default(meetings_summary, "o No meetings recorded"),
        "current_travel": _default(current_travel, "• No travel for this period."),
        "future_travel": _default(future_travel, "• No future travel scheduled."),
        "problem_areas": _default(problem_areas, "• No problem areas to report."),
        "mitigating_action_default": "• No mitigating actions required.",
        "work_planned": _default(work_planned, "• No planned work beyond normal work week activities."),
        "deliverables": deliverables,
        "deliverables_previous": deliverable_previous,
        "deliverables_current": current_count,
        "deliverables_cumulative": deliverable_previous + current_count,
        "anchor_date": anchor.isoformat(),
        "week_start": week_start.isoformat(),
        "week_end": week_end.isoformat(),
    }


def build_monthly_report(year, month, deliverable_previous=0):
    month_start = date(year, month, 1)
    month_end = date(year, month, calendar.monthrange(year, month)[1])

    # The macro always ran on "today", so its Meetings/Travel/Problem Areas
    # window was naturally whatever week the report happened to be run in
    # (typically the last week of the month). Since this version lets you
    # pick any month, that window is anchored to the last week *of the
    # selected month* instead of today's real-world date.
    week_start, week_end = week_bounds_for(month_end)
    if week_start < month_start:
        week_start = month_start
    if week_end > month_end:
        week_end = month_end
    next_week_start = week_end + timedelta(days=1)

    tasks = list(Task.objects.all())

    task_lines = [
        f"• {t.notes.strip()}"
        for t in tasks
        if t.status == Task.Status.COMPLETE and (t.notes or "").strip() and _touches_range(t, month_start, month_end)
    ]

    meetings_attended, meetings_summary = build_meetings(tasks, week_start, week_end)

    current_travel = [
        f"• {t.notes.strip()}"
        for t in tasks
        if t.status == Task.Status.UPCOMING_TRAVEL and (t.notes or "").strip() and _touches_range(t, week_start, week_end)
    ]

    future_travel = [
        f"• {t.notes.strip()}"
        for t in tasks
        if t.status == Task.Status.UPCOMING_TRAVEL and (t.notes or "").strip() and _touches_after(t, week_end)
    ]

    problem_areas = [
        f"• {t.notes.strip()}"
        for t in tasks
        if t.status in (Task.Status.ON_HOLD, Task.Status.CANCELLED) and (t.notes or "").strip() and _touches_range(t, week_start, week_end)
    ]

    work_planned = [
        f"• {t.notes.strip()}"
        for t in tasks
        if t.status == Task.Status.NOT_STARTED and (t.notes or "").strip() and _touches_on_or_after(t, next_week_start)
    ]

    deliverables = build_deliverables(tasks, week_start, week_end, in_month=True, month_start=month_start, month_end=month_end)

    start_biz = first_business_day_on_or_after(month_start, ceiling=month_end)
    end_biz = last_business_day_on_or_before(month_end, floor=month_start)

    current_count = len(deliverables)

    return {
        "report_type": "monthly",
        "date_submission": fmt(date.today()),
        "report_period": f"{fmt(month_start)} - {fmt(month_end)}",
        "start_date": fmt(start_biz),
        "completion_date": fmt(end_biz),
        "tasks": _default(task_lines, "• No tasks for this period."),
        "meetings_attended": _default(meetings_attended, "• No meetings attended during this period."),
        "meetings_summary": _default(meetings_summary, "o No meetings recorded"),
        "current_travel": _default(current_travel, "• No travel for this period."),
        "future_travel": _default(future_travel, "• No future travel scheduled."),
        "problem_areas": _default(problem_areas, "• No problem areas to report."),
        "mitigating_action_default": "• No mitigating actions required.",
        "work_planned": _default(work_planned, "• No planned work beyond normal work week activities."),
        "deliverables": deliverables,
        "deliverables_previous": deliverable_previous,
        "deliverables_current": current_count,
        "deliverables_cumulative": deliverable_previous + current_count,
        "year": year,
        "month": month,
    }
