#!/usr/bin/env bash
# Render build script: installs dependencies, collects static files, and
# applies database migrations. Runs automatically on every deploy.
set -o errexit

pip install -r requirements.txt
python manage.py collectstatic --no-input
python manage.py migrate
