from datetime import date, timedelta

from django.contrib.auth import authenticate
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import status as http_status
from rest_framework import viewsets, filters
from rest_framework.authtoken.models import Token
from rest_framework.decorators import api_view, permission_classes, action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend

from . import docx_report, reports
from .models import DeliverableTally, Task
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
    """What's actually coming up: tasks due or starting in the next 60 days,
    plus anything overdue (however old) -- not every dated task ever, which
    is what this used to return regardless of how far in the past or future
    it was."""
    today = timezone.localdate()
    horizon = today + timedelta(days=60)
    qs = Task.objects.filter(is_archived=False).exclude(
        due_date__isnull=True, start_date__isnull=True
    )
    events = []
    for t in qs:
        if t.due_date:
            overdue = t.status in Task.ACTIONABLE_STATUSES and t.due_date < today
            if overdue or today <= t.due_date <= horizon:
                events.append({
                    "task_id": t.id,
                    "description": t.description,
                    "date": t.due_date,
                    "type": "due",
                    "overdue": overdue,
                    "status": t.status,
                    "priority": t.priority,
                    "assigned_to": t.assigned_to,
                })
        if t.start_date and today <= t.start_date <= horizon:
            events.append({
                "task_id": t.id,
                "description": t.description,
                "date": t.start_date,
                "type": "start",
                "overdue": False,
                "status": t.status,
                "priority": t.priority,
                "assigned_to": t.assigned_to,
            })
    events.sort(key=lambda e: e["date"])
    return Response(events)


def _get_deliverable_previous(report_type):
    tally, _ = DeliverableTally.objects.get_or_create(report_type=report_type)
    return tally.previous_count


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def weekly_report(request):
    """Weekly Status Report -- the web equivalent of the workbook's
    CreateWeeklyReport macro. Pass ?date=YYYY-MM-DD for any day inside the
    desired week; defaults to today."""
    date_param = request.query_params.get("date")
    try:
        anchor = date.fromisoformat(date_param) if date_param else timezone.localdate()
    except ValueError:
        return Response({"detail": "date must be in YYYY-MM-DD format."}, status=400)

    data = reports.build_weekly_report(anchor, deliverable_previous=_get_deliverable_previous("weekly"))
    return Response(data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def monthly_report(request):
    """Monthly Status Report -- the web equivalent of the workbook's
    CreateMonthlyReport macro."""
    try:
        year = int(request.query_params.get("year", timezone.localdate().year))
        month = int(request.query_params.get("month", timezone.localdate().month))
    except (TypeError, ValueError):
        return Response({"detail": "year and month must be integers."}, status=400)

    if not (1 <= month <= 12):
        return Response({"detail": "month must be between 1 and 12."}, status=400)

    data = reports.build_monthly_report(year, month, deliverable_previous=_get_deliverable_previous("monthly"))
    return Response(data)


def _docx_response(buffer, filename):
    response = HttpResponse(
        buffer.read(),
        content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def weekly_report_docx(request):
    """Same data as weekly_report, rendered into the real Word template
    (the same one the legacy VBA macro wrote into) and returned as a
    downloadable .docx. ?mitigating_action= lets the client pass along
    whatever it currently has in the editable textarea, since that field
    isn't persisted server-side."""
    date_param = request.query_params.get("date")
    try:
        anchor = date.fromisoformat(date_param) if date_param else timezone.localdate()
    except ValueError:
        return Response({"detail": "date must be in YYYY-MM-DD format."}, status=400)

    data = reports.build_weekly_report(anchor, deliverable_previous=_get_deliverable_previous("weekly"))
    mitigating_action = request.query_params.get("mitigating_action")
    if mitigating_action:
        data["mitigating_action"] = mitigating_action

    buffer = docx_report.render_report_docx(data, "weekly")
    filename = f"PMS-406 sUSV Weekly Report {data['week_start']} to {data['week_end']}.docx"
    return _docx_response(buffer, filename)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def monthly_report_docx(request):
    """Same data as monthly_report, rendered into the real Word template
    and returned as a downloadable .docx."""
    try:
        year = int(request.query_params.get("year", timezone.localdate().year))
        month = int(request.query_params.get("month", timezone.localdate().month))
    except (TypeError, ValueError):
        return Response({"detail": "year and month must be integers."}, status=400)
    if not (1 <= month <= 12):
        return Response({"detail": "month must be between 1 and 12."}, status=400)

    data = reports.build_monthly_report(year, month, deliverable_previous=_get_deliverable_previous("monthly"))
    mitigating_action = request.query_params.get("mitigating_action")
    if mitigating_action:
        data["mitigating_action"] = mitigating_action

    buffer = docx_report.render_report_docx(data, "monthly")
    filename = f"PMS-406 sUSV Monthly Report {year}-{month:02d}.docx"
    return _docx_response(buffer, filename)


@api_view(["GET", "PUT"])
@permission_classes([IsAuthenticated])
def deliverable_tally(request, report_type):
    if report_type not in ("weekly", "monthly"):
        return Response({"detail": "report_type must be 'weekly' or 'monthly'."}, status=404)

    tally, _ = DeliverableTally.objects.get_or_create(report_type=report_type)

    if request.method == "PUT":
        try:
            value = int(request.data.get("previous_count"))
        except (TypeError, ValueError):
            return Response({"detail": "previous_count must be an integer."}, status=400)
        if value < 0:
            return Response({"detail": "previous_count cannot be negative."}, status=400)
        tally.previous_count = value
        tally.save(update_fields=["previous_count"])

    return Response({"report_type": tally.report_type, "previous_count": tally.previous_count})
