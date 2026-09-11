# Deploying: Render (backend) + Netlify (frontend)

You said both your Render and Netlify accounts are already open, so this
walks through the exact clicks. Total time: ~15-20 minutes.

## 0. Put the code on GitHub

Both Render and Netlify deploy straight from a git repo, so that's the
easiest path (and means future changes are just `git push`).

1. Go to https://github.com/new, create a new **private** repo (e.g.
   `task-manager`). Don't initialize it with a README -- this project
   already has one.
2. Unzip the project you downloaded from this chat. It already has a git
   history (`.git` folder) with everything committed. From that folder:

   ```bash
   git remote add origin https://github.com/<your-username>/task-manager.git
   git push -u origin main
   ```

   (If your repo's default branch is `master` instead of `main`, use that
   instead.)

## 1. Backend on Render

### Fastest path: Blueprint

1. In Render, click **New +** -> **Blueprint**.
2. Connect your GitHub account if you haven't, then select the
   `task-manager` repo. Render will detect `render.yaml` at the repo root
   and show you a plan: one **Web Service** (`task-manager-api`) and one
   **PostgreSQL** database (`task-manager-db`), both on the free tier.
3. Click **Apply**. Render will build and deploy automatically -- this
   takes a few minutes the first time.
4. Once it's live, open the web service and copy its URL from the top of
   the page (something like `https://task-manager-api-xxxx.onrender.com`).
   You'll need it in step 3 below.

### If you'd rather set it up by hand (no Blueprint)

1. **New +** -> **PostgreSQL**. Name it `task-manager-db`, free plan,
   **Create Database**. Once it's ready, copy the **Internal Database URL**.
2. **New +** -> **Web Service**, connect the `task-manager` repo.
   - **Root Directory**: `backend`
   - **Runtime**: Python 3
   - **Build Command**: `./build.sh`
   - **Start Command**: `gunicorn config.wsgi:application --log-file -`
   - **Plan**: Free
3. Under **Environment**, add these variables:
   - `DJANGO_SECRET_KEY` -- any long random string
   - `DJANGO_DEBUG` = `False`
   - `DJANGO_ALLOWED_HOSTS` = `.onrender.com`
   - `DATABASE_URL` = the Internal Database URL you copied
   - `PYTHON_VERSION` = `3.12.4`
4. Click **Create Web Service** and wait for the first deploy to finish.

### Create your login and load your task data

Once the service is live, open its **Shell** tab in Render and run:

```bash
python manage.py createsuperuser
python manage.py seed_tasks
```

`createsuperuser` is the username/password you'll log into the app with.
`seed_tasks` loads your 66 active + 48 archived tasks from the original
workbook (safe to run only once -- running it again would duplicate them;
use `python manage.py seed_tasks --wipe` if you ever want to reset and
reload from scratch).

## 2. Frontend on Netlify

1. In Netlify, click **Add new site** -> **Import an existing project** ->
   **Deploy with GitHub**, and pick the `task-manager` repo.
2. Netlify should auto-read `netlify.toml` and fill in:
   - **Publish directory**: `frontend`
   - **Build command**: (the no-op echo -- fine to leave as-is)
3. Click **Deploy**. Since there's no real build step, this finishes in
   seconds. Netlify gives you a URL like
   `https://random-name-12345.netlify.app` -- you can rename it under
   **Site settings -> Change site name**.

## 3. Connect the two

Now that both are live, wire them together:

1. **Edit `frontend/js/config.js`** in your repo: replace
   `REPLACE-WITH-YOUR-RENDER-URL` with your actual Render URL from step 1,
   keeping the trailing `/api`. Commit and push -- Netlify redeploys
   automatically within a minute.
2. **Back in Render**, open your web service's **Environment** tab and set:
   - `CORS_ALLOWED_ORIGINS` = your Netlify URL (e.g.
     `https://your-site-name.netlify.app`)
   - `CSRF_TRUSTED_ORIGINS` = the same URL
   Save -- Render redeploys automatically.

## 4. Test it

Open your Netlify URL, log in with the superuser you created, and confirm
the dashboard shows your real KPI counts. If login fails with a network
error, double check `config.js` has the right Render URL and that
`CORS_ALLOWED_ORIGINS` on Render matches your Netlify URL exactly
(including `https://`, no trailing slash).

## Ongoing use

- **Free-tier note**: Render's free web services spin down after 15
  minutes of inactivity and take ~30-50 seconds to wake back up on the
  next request -- so the first load after a while idle will feel slow.
  That's normal on the free plan.
- **Custom domain**: both Render and Netlify let you attach your own
  domain for free under their respective Settings pages, if you want one
  later.
- **Updating the app**: any `git push` to your repo redeploys both sides
  automatically.
