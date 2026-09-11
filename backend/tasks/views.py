import calendar
from datetime import date, timedelta

from django.contrib.auth import authenticate
from django.utils import timezone
from rest_framework import status as http_status
from rest_framework import viewsets, filters
from rest_framework.authtoken.models import Token
from rest_framework.decorators import api_view, permission_classes, action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend

from .models import Task
from .serializers import TaskSerializer


class TaskViewSet(viewsets.ModelViewSet):
    queryset = Task.objects.all()
    serializer_class = TaskSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["status", "priority", "assigned_to", "is_archived"]
    search_fields = ["description", "assigned_to", "notes"]
    ordering_fields = ["due_date", "start_date", "task_no", "priority", "status"]

    def get_queryset(self):
        qs = super().get_queryset()
        # Only the list endpoint defaults to "active tasks only" -- detail
        # actions (retrieve/update/delete/archive/unarchive) must still be
        # able to reach an already-archived task by id.
        if self.action == "list" and "is_archived" not in self.request.query_params:
            qs = qs.filter(is_archived=False)
        return qs

    def perform_update(self, serializer):
        serializer.save(last_update=timezone.localdate())

    def perform_create(self, serializer):
        serializer.save(last_update=timezone.localdate())

    @action(detail=True, methods=["post"])
    def archive(self, request, pk=None):
        task = self.get_object()
        task.is_archived = True
        task.save(update_fields=["is_archived"])
        return Response(self.get_serializer(task).data)

    @action(detail=True, methods=["post"])
    def unarchive(self, request, pk=None):
        task = self.get_object()
        task.is_archived = False
        task.save(update_fields=["is_archived"])
        return Response(self.get_serializer(task).data)


@api_view(["POST"])
@permission_classes([AllowAny])
def login_view(request):
    username = request.data.get("username", "")
    password = request.data.get("password", "")
    user = authenticate(request, username=username, password=password)
    if user is None:
        return Response({"detail": "Invalid credentials."}, status=http_status.HTTP_401_UNAUTHORIZED)
    token, _ = Token.objects.get_or_create(user=user)
    return Response({"token": token.key, "username": user.username})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def kpi_summary(request):
    active = Task.objects.filter(is_archived=False)
    today = timezone.localdate()

    counts = {
        "not_started": active.filter(status=Task.Status.NOT_STARTED).count(),
        "in_progress": active.filter(status=Task.Status.IN_PROGRESS).count(),
        "on_hold": active.filter(status=Task.Status.ON_HOLD).count(),
        "complete": active.filter(status=Task.Status.COMPLETE).count(),
        "cancelled": active.filter(status=Task.Status.CANCELLED).count(),
    }
    overdue = [t for t in active.filter(
        status__in=Task.ACTIONABLE_STATUSES
    ).exclude(due_date__isnull=True) if t.due_date < today]

    due_soon_cutoff = today + timedelta(days=7)
    due_soon = active.filter(
        status__in=Task.ACTIONABLE_STATUSES
    ).filter(due_date__gte=today, due_date__lte=due_soon_cutoff).order_by("due_date")

    return Response({
        "counts": counts,
        "total_active": active.count(),
        "overdue_count": len(overdue),
        "due_soon_count": due_soon.count(),
        "due_soon": TaskSerializer(due_soon, many=True).data,
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def important_dates(request):
    """Tasks with a start or due date, for a calendar / upcoming-dates view."""
    today = timezone.localdate()
    horizon = today + timedelta(days=180)
    qs = Task.objects.filter(is_archived=False).exclude(
        due_date__isnull=True, start_date__isnull=True
    )
    events = []
    for t in qs:
        if t.due_date:
            events.append({
                "task_id": t.id,
                "description": t.description,
                "date": t.due_date,
                "type": "due",
                "status": t.status,
                "priority": t.priority,
                "assigned_to": t.assigned_to,
            })
        if t.start_date:
            events.append({
                "task_id": t.id,
                "description": t.description,
                "date": t.start_date,
                "type": "start",
                "status": t.status,
                "priority": t.priority,
                "assigned_to": t.assigned_to,
            })
    events.sort(key=lambda e: e["date"])
    return Response(events)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def monthly_report(request):
    """Monthly Status Report: everything completed / touched / due in a
    given month, plus a KPI snapshot -- the web equivalent of the
    workbook's 'Monthly Report' macro button."""
    try:
        year = int(request.query_params.get("year", timezone.localdate().year))
        month = int(request.query_params.get("month", timezone.localdate().month))
    except (TypeError, ValueError):
        return Response({"detail": "year and month must be integers."}, status=400)

    if not (1 <= month <= 12):
        return Response({"detail": "month must be between 1 and 12."}, status=400)

    first_day = date(year, month, 1)
    last_day = date(year, month, calendar.monthrange(year, month)[1])

    all_tasks = Task.objects.all()

    completed_this_month = all_tasks.filter(
        date_completed__gte=first_day, date_completed__lte=last_day
    ).order_by("date_completed")

    in_progress = all_tasks.filter(
        is_archived=False, status=Task.Status.IN_PROGRESS
    ).order_by("due_date")

    started_this_month = all_tasks.filter(
        start_date__gte=first_day, start_date__lte=last_day
    ).order_by("start_date")

    due_this_month = all_tasks.filter(
        due_date__gte=first_day, due_date__lte=last_day
    ).exclude(status=Task.Status.COMPLETE).order_by("due_date")

    overdue_still_open = [
        t for t in all_tasks.filter(
            is_archived=False, status__in=Task.ACTIONABLE_STATUSES
        ).exclude(due_date__isnull=True)
        if t.due_date < first_day
    ]

    return Response({
        "period": {
            "year": year,
            "month": month,
            "label": first_day.strftime("%B %Y"),
            "start": first_day,
            "end": last_day,
        },
        "summary": {
            "completed_count": completed_this_month.count(),
            "started_count": started_this_month.count(),
            "in_progress_count": in_progress.count(),
            "due_this_month_count": due_this_month.count(),
            "overdue_count": len(overdue_still_open),
        },
        "completed_this_month": TaskSerializer(completed_this_month, many=True).data,
        "started_this_month": TaskSerializer(started_this_month, many=True).data,
        "in_progress": TaskSerializer(in_progress, many=True).data,
        "due_this_month": TaskSerializer(due_this_month, many=True).data,
        "overdue_still_open": TaskSerializer(overdue_still_open, many=True).data,
    })
