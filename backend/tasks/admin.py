from django.contrib import admin

from .models import Task


@admin.register(Task)
class TaskAdmin(admin.ModelAdmin):
    list_display = (
        "task_no", "description", "status", "priority", "assigned_to",
        "due_date", "is_archived",
    )
    list_filter = ("status", "priority", "is_archived", "assigned_to")
    search_fields = ("description", "assigned_to", "notes")
