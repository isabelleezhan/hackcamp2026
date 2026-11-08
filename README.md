# hackcamp2026 — MailBuds

Friends and family who live apart send short voice or text notes during the week. Every Sunday at
6 p.m., Gemini turns everyone's notes into one shared newspaper, shown on a 3D globe of where
everyone is and emailed to anyone who wants it.

- **How the app works, current decisions, API plan, open questions:** [AGENTS.md](AGENTS.md)
  (read this first; it overrides the PRD where they differ)
- Original spec: [MailBuds_PRD.md](MailBuds_PRD.md)

## Backend

The FastAPI implementation is in [backend/](backend/README.md). It includes verified Supabase Auth authentication, group membership checks, reflections, reviewed audio transcription, newspaper generation, archives, and retry-safe email delivery.

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

The reviewed schema is in [supabase/migrations/](supabase/migrations/). Migrations `0001` through `0003` are already present in project `ivjlummkprxwybqqfgor`; do not rerun them. Migration `0004_notes_location.sql` is also present in the live schema (verified November 8, 2026). Apply the pending `0005_supabase_auth.sql` before running the migrated backend. See [Supabase notes](supabase/README.md) for details.

Supabase Auth owns application sign-in and email verification. Configure a verified Resend sender separately for edition emails.

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
`npm.cmd run dev`. The standalone `/audio/transcribe` endpoint requires a verified Supabase Auth access token.
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

The frontend signs in using Supabase Auth email/password. Configure `VITE_SUPABASE_URL`
and `VITE_SUPABASE_ANON_KEY` in `frontend/.env.local`. Backend configuration uses the
same `SUPABASE_URL`, `SUPABASE_ANON_KEY` and server-only `SUPABASE_SERVICE_ROLE_KEY`.

### Supabase authentication setup

1. Apply pending `0004_notes_location.sql`, then `0005_supabase_auth.sql`. Never rerun an already-applied migration.
2. In Supabase Authentication, enable Email sign-in and keep email confirmation enabled.
3. Set Site URL to `http://localhost:5173` and add `http://localhost:5173/login` to allowed redirects (plus production equivalents).
4. Configure custom SMTP for confirmation and password-reset emails; backend Resend delivery settings are separate.
5. Restart frontend/backend. Create a Supabase account and confirm its email. Passwords do not transfer; using the same confirmed email restores a legacy verified profile and memberships.

## Authorization and workers

FastAPI verifies sessions with Supabase Auth, then uses the service role after explicit route-level membership/ownership checks. Only organizers can publish or retry.


`POST /internal/tick` closes due periods and resumes queued or interrupted generation/delivery. Call it frequently from n8n with `X-Worker-Secret`; the scaffold `X-N8N-Secret` header is also supported. Weekly deadlines remain Sunday at 6 p.m. in each group's timezone. See [backend setup](backend/README.md) for configuration, deployment and retry details.

No credentials are checked in. Live provider calls, backend hosting and n8n activation still require local/server configuration.
