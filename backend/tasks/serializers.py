from rest_framework import serializers

from .models import Task


class TaskSerializer(serializers.ModelSerializer):
    is_overdue = serializers.BooleanField(read_only=True)

    class Meta:
        model = Task
        fields = [
            "id",
            "task_no",
            "description",
            "priority",
            "assigned_to",
            "start_date",
            "due_date",
            "status",
            "last_update",
            "notes",
            "date_completed",
            "is_archived",
            "is_overdue",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at", "last_update"]
