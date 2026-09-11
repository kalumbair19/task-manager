# Task Manager

A full web app version of the `task_MANAGER` / `TaskARCHIVES` Excel workbook:
a Django REST API backend and a bold, KPI-driven vanilla JS frontend, built
to deploy as Render (backend) + Netlify (frontend).

See **DEPLOYMENT.md** for the full step-by-step guide to putting this live
on your Render and Netlify accounts. This file covers what's in the project
and how to run it on your own machine first.

## Project structure

```
backend/            Django REST API
  config/            Django project settings/urls
  tasks/             The Task model, API views, admin, seed command
  manage.py
  requirements.txt
  build.sh           Render build script (installs deps, migrates, collects static)
  Procfile           Fallback start command definition
frontend/            Static site (no build step) -- deployed to Netlify
  index.html
  css/styles.css
  js/                ES modules: api client, router, views
render.yaml          Render Blueprint (one-click backend + Postgres setup)
netlify.toml         Netlify site config
```

## Running locally

### 1. Backend (Django)

```bash
cd backend
python3 -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt

python manage.py migrate
python manage.py seed_tasks       # loads your original workbook data
python manage.py createsuperuser  # create your login (username + password)

python manage.py runserver 127.0.0.1:8000
```

The API is now at `http://127.0.0.1:8000/api/`. The Django admin (handy for
bulk edits) is at `http://127.0.0.1:8000/admin/`.

### 2. Frontend (static site)

No install or build step -- it's plain HTML/CSS/JS. From the `frontend`
folder, serve it with any static file server, e.g.:

```bash
cd frontend
python3 -m http.server 8080
```

Then open `http://127.0.0.1:8080` in your browser and log in with the
superuser you just created. `js/config.js` automatically points at
`http://127.0.0.1:8000/api` whenever the site is served from `localhost` or
`127.0.0.1`.

## What's included

- **Dashboard** -- KPI cards (Not Started / In Progress / On Hold / Complete
  / Cancelled / Overdue) plus a "due in the next 7 days" list and a status
  breakdown chart.
- **Tasks** -- searchable, filterable table of active tasks with add / edit
  / inline status change / archive / delete.
- **Important Dates** -- every task's start and due date, grouped by month.
- **Monthly Status Report** -- pick a month, get a formatted report
  (completed / started / in-progress / due / still-overdue), with a
  Print / Save as PDF button (uses your browser's built-in PDF printing --
  no extra software needed).
- **Archive** -- historical/completed tasks, restorable or permanently
  deletable.

All of your original task data (66 active tasks, 48 archived) is loaded by
the `seed_tasks` management command directly from the workbook you shared.
