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

## Try audio transcription locally (PowerShell)

Install the updated backend dependencies, then start the backend from `backend/`
so it loads `backend/.env`:

```powershell
cd backend
& .\.venv\Scripts\python.exe -m pip install -r requirements.txt
& .\.venv\Scripts\python.exe -m uvicorn app.main:app --reload
```

Set `GEMINI_API_KEY` and optionally `GEMINI_TRANSCRIPTION_MODEL` in `backend/.env`. The key stays
on the backend. Start the frontend in another terminal with `cd frontend` and
`npm.cmd run dev`. With no Supabase settings, the home page opens directly and
the standalone `/audio/transcribe` endpoint accepts uploads without sign-in when
`SUPABASE_ANON_KEY` is empty. Group routes always require authentication and membership.
When Supabase is configured on both sides, sign-in is required for the prototype too.
Choose **Choose audio file**, then **Transcribe with
Gemini**. Use a spoken MP3, WAV, M4A, OGG, or FLAC clip up to 3 minutes and 10 MB.
The returned transcript is editable; this preview does not save a reflection.
Audio is validated server-side and sent inline to Gemini, without creating a
stored Gemini file or persisting audio/transcripts in the app.

The standalone transcription prototype starts with `gemini-3.5-transcribe`. On HTTP 429, 404, or temporary
server errors (500/502/503/504), it tries `gemini-3.8-flash`, then
`gemini-3.5-flash-lite`, using the same key. Each model is attempted once per upload;
the SDK's automatic retries are disabled to avoid repeatedly calling a limited model.
The general-purpose backups receive a faithful-transcription instruction. Invalid
requests or credentials (400/401/403), empty transcripts, and invalid uploads do
not trigger more model calls. No transcript is saved until you choose to use it.

Override the backup order in `backend/.env` and restart the backend:

```dotenv
GEMINI_MODEL=gemini-3.8-flash
GEMINI_TRANSCRIPTION_MODEL=gemini-3.5-transcribe
GEMINI_FALLBACK_MODELS=gemini-3.8-flash,gemini-3.5-flash-lite
```

Set `GEMINI_FALLBACK_MODELS=` to disable backups. Model-specific limits may differ,
but project-wide quota/spend limits can affect every backup; changing models does
not guarantee recovery. See Google's [audio guide](https://ai.google.dev/gemini-api/docs/audio)
and [rate-limit guide](https://ai.google.dev/gemini-api/docs/rate-limits).

Run backend upload/auth checks without making paid Gemini calls:

```powershell
cd backend
& .\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

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
