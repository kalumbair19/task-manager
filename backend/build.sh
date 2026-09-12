#!/usr/bin/env bash
# Render build script: installs dependencies, collects static files, and
# applies database migrations. Runs automatically on every deploy.
set -o errexit

pip install -r requirements.txt
python manage.py collectstatic --no-input
python manage.py migrate

# One-time setup, safe to run on every deploy (both are no-ops after the
# first successful run): creates your login from the DJANGO_SUPERUSER_*
# environment variables, and loads your original workbook data.
python manage.py createsuperuser --noinput || true
python manage.py seed_tasks || true
