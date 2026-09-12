from django.db import models
from django.utils import timezone


class Task(models.Model):
    """A single task/action item, mirroring the columns of the original
    task_MANAGER / TaskARCHIVES worksheet."""

    class Priority(models.TextChoices):
        LOW = "Low", "Low"
        NORMAL = "Normal", "Normal"
        HIGH = "High", "High"
        URGENT = "Urgent", "Urgent"

    class Status(models.TextChoices):
        NOT_STARTED = "Not Started", "Not Started"
        IN_PROGRESS = "In Progress", "In Progress"
        ON_HOLD = "On Hold", "On Hold"
        COMPLETE = "Complete", "Complete"
        CANCELLED = "Cancelled", "Cancelled"
        WEEKLY_REPORTS = "Weekly Reports", "Weekly Reports"
        UPCOMING_TRAVEL = "Upcoming Travel", "Upcoming Travel"
        MEETINGS_ATTENDED = "Meetings Attended", "Meetings Attended"

    # Statuses that represent an open, actionable task -- as opposed to the
    # informational log categories (Weekly Reports / Upcoming Travel /
    # Meetings Attended) the original workbook also stored in this column.
    # Only actionable tasks are eligible to be flagged "overdue".
    ACTIONABLE_STATUSES = (Status.NOT_STARTED, Status.IN_PROGRESS, Status.ON_HOLD)

    task_no = models.PositiveIntegerField(
        null=True, blank=True, help_text="Original task number from the spreadsheet."
    )
    description = models.CharField(max_length=500)
    priority = models.CharField(
        max_length=20, choices=Priority.choices, default=Priority.NORMAL
    )
    assigned_to = models.CharField(max_length=200, blank=True, default="")
    start_date = models.DateField(null=True, blank=True)
    due_date = models.DateField(null=True, blank=True)
    status = models.CharField(
        max_length=30, choices=Status.choices, default=Status.NOT_STARTED
    )
    last_update = models.DateField(
        null=True, blank=True, help_text="Date this task's status/notes were last touched."
    )
    notes = models.TextField(blank=True, default="")
    date_completed = models.DateField(null=True, blank=True)
    is_archived = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-is_archived", "due_date", "task_no"]

    def __str__(self):
        return f"{self.task_no or '-'}: {self.description}"

    @property
    def is_overdue(self):
        if self.status not in self.ACTIONABLE_STATUSES:
            return False
        if not self.due_date:
            return False
        return self.due_date < timezone.localdate()

    def save(self, *args, **kwargs):
        # Auto-populate date_completed the way the original workbook's
        # macros did, so the API behaves the same as the sheet.
        if self.status == self.Status.COMPLETE and not self.date_completed:
            self.date_completed = timezone.localdate()
        super().save(*args, **kwargs)


class DeliverableTally(models.Model):
    """Tracks the 'Previously Reported' deliverable count for the Weekly and
    Monthly status reports. The original macro never computed this (it was
    a stale, manually-typed number in the Word template) -- here it's a
    small persisted value the user can update, and the report's 'Cumulative'
    figure is simply previous + this period's auto-counted deliverables."""

    class ReportType(models.TextChoices):
        WEEKLY = "weekly", "Weekly"
        MONTHLY = "monthly", "Monthly"

    report_type = models.CharField(max_length=10, choices=ReportType.choices, unique=True)
    previous_count = models.PositiveIntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.report_type}: {self.previous_count}"
