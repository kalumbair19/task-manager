from django.urls import path, include
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("tasks", views.TaskViewSet, basename="task")

urlpatterns = [
    path("auth/login/", views.login_view, name="login"),
    path("kpi/summary/", views.kpi_summary, name="kpi-summary"),
    path("reports/weekly/", views.weekly_report, name="weekly-report"),
    path("reports/monthly/", views.monthly_report, name="monthly-report"),
    path("reports/deliverable-tally/<str:report_type>/", views.deliverable_tally, name="deliverable-tally"),
    path("important-dates/", views.important_dates, name="important-dates"),
    path("", include(router.urls)),
]
