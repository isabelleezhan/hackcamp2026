# Community Newspaper API

FastAPI backend for the PRD. Supabase remains the account/database/storage service; Gemini handles transcription and newspaper JSON; Resend sends edition emails. No frontend or external account is created by this backend.

## Run locally

Use Python 3.11+ and FFmpeg (`ffprobe` on PATH). The included Dockerfile installs FFmpeg for deployment.

From this `backend` directory:

```sh
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.lock
pip install --no-deps -e .
cp .env.example .env
# Populate .env with your existing service credentials.
uvicorn app.main:app --reload --port 8000
```

API explorer: http://localhost:8000/docs. OpenAPI contract: http://localhost:8000/openapi.json. `/health` reports process health; `/ready` verifies Supabase connectivity, worker columns and required service configuration. It does not test provider credentials by generating content or sending email.

The project URL is already filled in. Set `SUPABASE_ANON_KEY` to the project publishable/anon key, and `SUPABASE_SERVICE_ROLE_KEY` to its server-side secret/service-role key. Set `GEMINI_API_KEY`, `RESEND_API_KEY`, a verified `EMAIL_FROM`, and an independent random `WORKER_SECRET`. Set `FRONTEND_URL` to the real frontend origin and `CORS_ORIGINS` to a JSON array of allowed origins. The scaffold names `RESEND_FROM_EMAIL`, `N8N_WEBHOOK_SECRET` and `APP_URL` remain supported aliases for `EMAIL_FROM`, `WORKER_SECRET` and `FRONTEND_URL`; comma-separated CORS origins also remain supported. Never put server secrets in Vite environment variables or client code. Configuration loads from the working directory's `.env`.

`../supabase/migrations/0001_init.sql` and `../supabase/migrations/0002_backend_jobs.sql` have already been applied to project `ivjlummkprxwybqqfgor`. For a new Supabase project, apply both scripts in order. Do not rerun them on this project. They were applied in the dashboard, outside CLI migration history.

## Authentication and routes

The frontend signs in with Supabase Auth and sends `Authorization: Bearer <access_token>` to every user endpoint. The API verifies that token with Supabase Auth for each request and requires a confirmed, nonanonymous email account. Interactive database and storage calls use the user's JWT, preserving RLS; the service-role key is limited to worker operations after authorization.

The existing SMTP/template blocker still applies to email-code sign-in. Backend implementation does not change Auth email templates. See `../supabase/README.md`.

| Method and path | Purpose |
| --- | --- |
| GET /me; PATCH /me | Read profile including verified account email; partial update of display_name, location_mode, city, lat, lng (rounded to 1 decimal), timezone |
| GET /groups; POST /groups | List private memberships; create named group with timezone |
| POST /groups/join | Join using `{ "code": "K7M9P2QR" }` (8 characters for new groups, case and dashes ignored; older 32-hex codes still work) |
| GET /groups/{group_id} | Group details, membership and frontend invitation URL |
| GET /groups/{group_id}/members | Members' display names, roles, city, rounded lat/lng, timezone, location_updated_at |
| PUT /groups/{group_id}/email-preference | Set `{ "enabled": true }` (off by default) |
| GET /groups/{group_id}/periods/current | Open submission period and deadline |
| GET /groups/{group_id}/periods/{period_id}/reflections | The caller's own notes for that week (others' notes are only visible in the published edition) |
| GET /groups/{group_id}/periods/{period_id}/note-counts | Submitted note count and audio seconds per member (no content), for the globe |
| POST /groups/{group_id}/periods/{period_id}/reflections | Add a note; many per week (limit 30 notes / 30 minutes of audio per person) |
| PUT /groups/{group_id}/reflections/{reflection_id} | Replace one of the caller's notes while its week is open |
| DELETE /groups/{group_id}/reflections/{reflection_id} | Delete one of the caller's notes while its week is open |
| POST /groups/{group_id}/audio | Validate/upload/transcribe multipart audio, returning reviewable text |
| GET /groups/{group_id}/audio-url?path=... | Link to the caller's own voice clip, expiring in 60 seconds |
| POST /groups/{group_id}/publish | Organizer closes explicit period and queues publishing |
| POST /groups/{group_id}/editions/{edition_id}/retry | Organizer requests processing; respects leases/backoff |
| GET /groups/{group_id}/editions | Paginated archive plus generation states (limit, offset) |
| GET /groups/{group_id}/editions/latest | Latest published edition |
| GET /groups/{group_id}/editions/{edition_id} | Edition content/status |
| GET /groups/{group_id}/editions/{edition_id}/delivery | Caller's own email-delivery state |
| POST /internal/tick?batch_size=5 | Secret-protected scheduled closure and durable retry processing |

Example final reflection body:

```json
{"body":"We finished planting the garden.","status":"submitted","ai_consent":true,"city":"Lisbon","lat":38.7,"lng":-9.1}
```

Use `status: "draft"` while editing. Explain group sharing and AI processing before requesting consent. Audio uploads require multipart fields `file` and `ai_consent=true`. The API checks actual file format, audio-only streams, 10 MB maximum and 180-second duration before uploading or contacting Gemini. It returns an audio reference and `review_required` transcript; it never auto-submits speech. If transcription fails it returns `transcription_failed` with the saved audio reference so the person can enter text manually. Include that reference and duration when saving reviewed text; the API rechecks the stored audio rather than trusting client-supplied duration. Text-only submissions work without Gemini or FFmpeg. Typed notes are limited to 2,000 characters; voice transcripts to 4,000. `recorded_at` is set by the database. Going over a weekly limit returns 429.

Publishing body: `{ "period_id": "the-current-period-UUID" }`. Keep that same ID when retrying a request. The response is `202` with an edition ID and `queued`, or null and `empty`. Poll the edition endpoint for pending/generating/published/failed. Database closure atomically freezes submitted text and contributor names, opens the next period, and prevents duplicate editions. A background task starts processing immediately, while the scheduled endpoint provides recovery after server restarts.

Edition content is validated JSON: headline, introduction, attributed member_updates, little_victories and looking_ahead. Each story includes internal source_reflection_ids. Rendering must use a fixed template and plain escaped text, never arbitrary model HTML. The frontend supplies the group's masthead and the period's issue date. The validator requires every source contributor exactly once and rejects changed names or invented/misattributed source IDs. These checks do not prove the semantic truth of every generated sentence. Generation currently supports up to 100 contributors per edition and fails safely rather than omitting contributors if content cannot fit.

## n8n and retries

Create an n8n Schedule Trigger every minute, followed by an HTTP Request:

- Method: POST
- URL: `https://YOUR-BACKEND/internal/tick?batch_size=1`
- Header: `X-Worker-Secret: <WORKER_SECRET>` (store as an n8n credential; the scaffold header `X-N8N-Secret` is also supported)
- Request timeout: at least 180 seconds for batch_size=1; larger batches need a larger timeout.

The database stores the Sunday 6 p.m. cutoff in each group's timezone, so the n8n trigger need not implement timezone logic. A frequent trigger also recovers pending work and interrupted requests. Manual publication uses the same closure/generation/delivery code. This repository provides the endpoint; no n8n Cloud workflow has been activated.

Generation and delivery use exclusive database leases and separate retry delays (starting at 60 seconds, capped at one hour). Completion checks the lease token so a worker that lost its lease cannot overwrite a newer result. Publication and enrollment of currently opted-in, email-confirmed members commit in one database transaction. Email failures never regenerate an edition. Delivery eligibility is checked again at claim time; opt-outs, departures, and changed email addresses are skipped. An opt-out after the send has already been claimed may arrive too late to cancel the external provider request.

Email content is frozen on its first claim. Retries use the same Resend idempotency key and payload; successful deliveries are never re-claimed. Resend's idempotency window is [24 hours](https://resend.com/docs/dashboard/emails/idempotency-keys). Automatic retries stop after 23 hours from the first claim and require reconciliation in Resend before an operator can safely decide whether to retry. Do not reset first_attempt_at or a sent row to force a resend. `sent` means provider acceptance, not proof of inbox delivery; bounce/webhook processing is not implemented.

## Deployment

For Render, use this directory as the service root, choose Docker, add the `.env.example` environment variables, and use `/health` as the health-check path. The image runs as a nonroot user and honors Render's `PORT`. Set HTTPS frontend/backend URLs and the deployed CORS origin. The Docker image has not been built in this workspace; deployment and credentials are still required.

## Verification

```sh
pip install -e '.[dev]'
pytest -q
ruff check .
ruff format --check .
```

The test suite uses HTTP mocks for Supabase/Gemini/Resend, plus real FFprobe on generated WAV fixtures. `../supabase/tests/verify_backend_jobs.sql` was also run successfully against the live project with all test data rolled back. It checks leases, stale-worker rejection, atomic opt-in enrollment, frozen retry payloads, sent-email protection, opt-out rechecks, the retry-window cutoff and worker function permissions. The baseline `../supabase/tests/verify_schema.sql` covers membership/period/reflection rules.

No real customer reflections were sent to Gemini, and no edition emails were sent. Full live text → Gemini → Resend and two-account OTP acceptance still require configured secrets, a verified email sender and the Auth SMTP setup.

Provider contracts: [Gemini structured output](https://ai.google.dev/gemini-api/docs/structured-output), [Supabase server-verified users](https://supabase.com/docs/reference/javascript/auth-getuser), [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys).
