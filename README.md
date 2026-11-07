# hackcamp2026 — Community Newspaper

Friends and family who live apart send short voice or text notes during the week. Every Sunday at
6 p.m., Gemini turns everyone's notes into one shared newspaper, shown on a 3D globe of where
everyone is and emailed to anyone who wants it.

- **How the app works, current decisions, API plan, open questions:** [AGENTS.md](AGENTS.md)
  (read this first; it overrides the PRD where they differ)
- Original spec: [Community_Newspaper_PRD.md](Community_Newspaper_PRD.md)

## Backend

The FastAPI implementation is in [backend/](backend/README.md). It includes verified Auth0 authentication, group membership checks, reflections, reviewed audio transcription, newspaper generation, archives, and retry-safe email delivery.

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

The reviewed schema is in [supabase/migrations/](supabase/migrations/). Migrations `0001` through `0003` are already present in project `ivjlummkprxwybqqfgor`; do not rerun them. Migration `0004_notes_location.sql` is pending and must be deployed with its matching backend. See [Supabase notes](supabase/README.md) for details.

Auth0 owns application sign-in and email verification. Configure a verified Resend sender separately for edition emails.

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
`npm.cmd run dev`. The standalone `/audio/transcribe` endpoint requires a verified Auth0 access token.
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

The frontend signs in with Auth0 Universal Login (`@auth0/auth0-react`) and sends the Auth0 access token to FastAPI. It no longer talks to Supabase. Set `VITE_AUTH0_DOMAIN`, `VITE_AUTH0_CLIENT_ID` and `VITE_AUTH0_AUDIENCE` in `frontend/.env.local` (see `frontend/.env.example`). Without them the app runs signed-out, which is enough for `/preview/edition`.

### One-time Auth0 setup

1. **Applications → APIs → Create API.** Identifier = your audience (e.g. `https://api.community-newspaper.example`), signing algorithm RS256. Turn on **Allow Offline Access**. Put the identifier in `AUTH0_AUDIENCE` (backend) and `VITE_AUTH0_AUDIENCE` (frontend), and the tenant domain in `AUTH0_DOMAIN` / `VITE_AUTH0_DOMAIN`.
2. **Applications → Create Application → Single Page Application.** Copy its Client ID to `VITE_AUTH0_CLIENT_ID`. Add `http://localhost:5173` (and the Vercel URL later) to **Allowed Callback URLs**, **Allowed Logout URLs** and **Allowed Web Origins**. Under Refresh Token Rotation, turn **Rotation** on (keeps people signed in after a reload, including in Safari).
3. **Authentication → Database → Username-Password-Authentication** must be enabled for that application. Auth0 sends the verification email itself; the backend rejects accounts whose email isn't verified, and the app shows a "Check your email" screen until it is.

## Authorization and workers

FastAPI verifies Auth0 access tokens, then uses the Supabase service role after explicit route-level ownership and membership checks. Only organizers can publish or retry; Auth0 tokens are never sent to Supabase.


`POST /internal/tick` closes due periods and resumes queued or interrupted generation/delivery. Call it frequently from n8n with `X-Worker-Secret`; the scaffold `X-N8N-Secret` header is also supported. Weekly deadlines remain Sunday at 6 p.m. in each group's timezone. See [backend setup](backend/README.md) for configuration, deployment and retry details.

No credentials are checked in. Live provider calls, backend hosting and n8n activation still require local/server configuration.
