# hackcamp2026 — Community Newspaper

Friends and family who live apart send short voice or text notes during the week. Every Sunday at
6 p.m., Gemini turns everyone's notes into one shared newspaper, shown on a 3D globe of where
everyone is and emailed to anyone who wants it.

- **How the app works, current decisions, API plan, open questions:** [AGENTS.md](AGENTS.md)
  (read this first; it overrides the PRD where they differ)
- Original spec: [Community_Newspaper_PRD.md](Community_Newspaper_PRD.md)

## Backend

The FastAPI implementation is in [backend/](backend/README.md). It includes verified Supabase authentication, group membership checks, reflections, reviewed audio transcription, newspaper generation, archives, and retry-safe email delivery.

```sh
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env
# Fill in credentials locally. Never add .env files to Git.
.venv/bin/uvicorn app.main:app --reload --port 8000
```

Use Python 3.11+ and FFmpeg (`ffprobe` on PATH). API docs: http://localhost:8000/docs.

Run backend checks from `backend/`:

```sh
.venv/bin/pip install -e '.[dev]'
.venv/bin/pytest -q
.venv/bin/ruff check .
.venv/bin/ruff format --check .
```

## Supabase

The full, reviewed-source schema is in [supabase/migrations/](supabase/migrations/): `0001_init.sql` and `0002_backend_jobs.sql`. These changes are already present in project `ivjlummkprxwybqqfgor`; do not rerun them against that database. The initial migration replaces the Git scaffold's unused draft schema. See [Supabase notes](supabase/README.md) for migration history reconciliation, verification SQL, and the remaining Auth SMTP setup.

Email-code sign-in requires a verified custom SMTP sender before Supabase allows the code email templates to be edited. The placeholder template is in `supabase/otp-email.html`. Configure a verified Resend sender separately for edition emails.

## Frontend

```sh
cp frontend/.env.example frontend/.env.local
cd frontend
npm install
npm run dev
```

The existing frontend uses Supabase for sign-in and sends its access token to FastAPI. `/me` retains the email field expected by the login smoke test.

## Authorization and workers

Interactive database/storage requests use the verified caller's JWT and remain subject to Supabase RLS. Routes also check group membership; only organizers can publish or retry. Service-role access is explicit and limited to server-side publishing/delivery workers.

Signing in should show "backend sees you as …" on the home page; that confirms auth works across both apps.
(The login page still uses email codes; switching it to email + password is on the to-do list in AGENTS.md.)

`POST /internal/tick` closes due periods and resumes queued or interrupted generation/delivery. Call it frequently from n8n with `X-Worker-Secret`; the scaffold `X-N8N-Secret` header is also supported. Weekly deadlines remain Sunday at 6 p.m. in each group's timezone. See [backend setup](backend/README.md) for configuration, deployment and retry details.

No credentials are checked in. Live provider calls, backend hosting and n8n activation still require local/server configuration.
