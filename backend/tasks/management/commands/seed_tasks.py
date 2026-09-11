import json
from datetime import datetime
from pathlib import Path

from django.core.management.base import BaseCommand
from django.db import transaction

from tasks.models import Task

DATA_FILE = Path(__file__).resolve().parent / "seed_data.json"

VALID_STATUSES = {c[0] for c in Task.Status.choices}
VALID_PRIORITIES = {c[0] for c in Task.Priority.choices}


def parse_date(value):
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value).date()
    except ValueError:
        return None
    # The source workbook has a handful of cells that evaluate to an Excel
    # epoch artifact (e.g. 1900-01-11) instead of a real date -- treat
    # anything before 2000 as "no date" rather than importing garbage.
    if parsed.year < 2000:
        return None
    return parsed


def clean_priority(value):
    if not value:
        return Task.Priority.NORMAL
    value = value.strip()
    return value if value in VALID_PRIORITIES else Task.Priority.NORMAL


def clean_status(value):
    if not value:
        return Task.Status.NOT_STARTED
    value = value.strip()
    return value if value in VALID_STATUSES else Task.Status.NOT_STARTED


class Command(BaseCommand):
    help = "Load the original task_MANAGER / TaskARCHIVES rows exported from the workbook."

    def add_arguments(self, parser):
        parser.add_argument(
            "--wipe", action="store_true",
            help="Delete all existing tasks before seeding.",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        if not DATA_FILE.exists():
            self.stderr.write(self.style.ERROR(f"Seed file not found: {DATA_FILE}"))
            return

        if options["wipe"]:
            deleted, _ = Task.objects.all().delete()
            self.stdout.write(f"Deleted {deleted} existing task(s).")

        data = json.loads(DATA_FILE.read_text())
        created = 0
        for bucket, archived in (("active", False), ("archive", True)):
            for row in data.get(bucket, []):
                Task.objects.create(
                    task_no=row.get("no"),
                    description=(row.get("description") or "").strip()[:500],
                    priority=clean_priority(row.get("priority")),
                    assigned_to=(row.get("assigned_to") or "").strip(),
                    start_date=parse_date(row.get("start_date")),
                    due_date=parse_date(row.get("due_date")),
                    status=clean_status(row.get("status")),
                    last_update=parse_date(row.get("last_update")),
                    notes=(row.get("notes") or "").strip(),
                    date_completed=parse_date(row.get("date_completed")),
                    is_archived=archived,
                )
                created += 1

        self.stdout.write(self.style.SUCCESS(f"Seeded {created} task(s)."))
