# MailBuds API

FastAPI backend for the PRD. Supabase Auth provides identity, Supabase provides Postgres/storage, Gemini handles transcription and newspaper JSON, and Resend sends edition emails.

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

### Audio validation on Windows

If `ffprobe` is not on PATH, install a local binary from the `backend` directory:

```powershell
npm.cmd install --prefix .tools/ffprobe --no-audit --no-fund --ignore-scripts @ffprobe-installer/ffprobe
node -p "require('./.tools/ffprobe/node_modules/@ffprobe-installer/ffprobe').path"
```

Copy the printed absolute path into `FFPROBE_PATH="..."` in `backend/.env` and restart
Uvicorn. The tools directory and `.env` are ignored by Git. Production Docker already installs
FFmpeg. Audio inspection runs the probe in a worker thread with a 15-second process timeout,
so Windows `--reload` works without asyncio subprocess support.

Set `SUPABASE_URL`, public `SUPABASE_ANON_KEY` and server-only
`SUPABASE_SERVICE_ROLE_KEY`. Sessions are verified using `/auth/v1/user`, including current
email confirmation. No external identity settings or JWT signing secret are needed.
Invalid sessions return 401, unconfirmed emails 403, service failures 503. Tokens are not logged.
Configuration loads from `backend/.env`; restart after changes.

Apply `0005_supabase_auth.sql` after 0004. It preserves internal profile UUIDs and memberships,
links legacy profiles only via the same confirmed/previously verified email, and restricts
provisioning to the service role. Gemini, Resend and worker settings remain separate.

`../supabase/migrations/0001_init.sql`, `0002_backend_jobs.sql`, and `0003_auth0_accounts.sql` are applied to project `ivjlummkprxwybqqfgor`. Migration `0003` was verified on November 7, 2026. Do not rerun these migrations on that project.

## Standalone email function (optional PDF attachment)

`app.services.email.send_email` sends one email through Resend and returns its
provider email ID. It is available for later integration; it is not called by a
route or publishing worker. Configure `RESEND_API_KEY` and `EMAIL_FROM` (or
`RESEND_FROM_EMAIL`) in `backend/.env`, using a sender verified in Resend.

From backend Python code:

```python
from pathlib import Path
from app.services.email import send_email

async def email_paper():
    return await send_email(
        to="reader@example.com",
        subject="Your weekly newspaper",
        text="Your newspaper is attached.",
        pdf_bytes=Path("weekly-paper.pdf").read_bytes(),
        pdf_filename="weekly-paper.pdf",
        idempotency_key="weekly-paper/issue-123/recipient-456",
    )
```

You can pass PDF bytes directly from a future PDF generator. Omit `pdf_bytes` for
an ordinary email, and supply `text`, `html`, or both for the body. Keep the same
idempotency key and content when retrying one logical email; the function does not
automatically retry. The caller is responsible for email preferences and selecting
authorized recipients. A returned ID confirms provider acceptance, not inbox delivery.
Tests use mocked HTTP requests and do not send real emails.

PDFs are Base64 encoded with an `application/pdf` content type. The helper rejects
non-PDF headers and payloads over 40 MB after encoding. See the
[Resend send-email reference](https://resend.com/docs/api-reference/emails/send-email).

### Frontend email test form

The home page includes recipient, subject, message, and optional PDF fields with a
**Send test email** button. The button calls `POST /email/test`; a success message
shows Resend's accepted email ID. This sends only when you click the button.

For local testing, set `ENABLE_EMAIL_TESTING=true`, `RESEND_API_KEY`, and
`EMAIL_FROM` in `backend/.env`, then restart the backend. This endpoint accepts
only localhost requests from configured frontend origins and is disabled by
default. Keep it disabled in deployed environments. PDF uploads are limited to
10 MB. Failed requests retain the same idempotency key for retries; editing the
form or sending again after a success starts a new logical email.

For testing without a verified domain, set
`EMAIL_FROM=MailBuds <onboarding@resend.dev>` and send to the email
address associated with your Resend account. A Gmail address cannot be used as
the sender through Resend. For other recipients, verify a domain you own and use
a sender on that domain. See [Resend's test sender restrictions](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain).

## Authentication and account routes

The frontend sends `Authorization: Bearer <Supabase access token>`. FastAPI validates it
with Supabase Auth, requires a confirmed email and looks up `profiles.supabase_user_id`.
Missing profiles use the service-only `ensure_supabase_profile` RPC, which reads the email
from `auth.users` rather than trusting a client-supplied identity. Existing internal UUIDs
and memberships are retained. Database/storage operations still use the service role only
after explicit membership/ownership checks.

Supabase owns passwords, confirmation, recovery and sessions. Configure Email, redirect URLs
and SMTP in its dashboard. `GET /me`, `PATCH /me` and `GET /me/stats` keep their contracts.

| Method and path | Purpose |
| --- | --- |
| GET /me; PATCH /me | Read profile including verified account email; partial update of display_name, location_mode, city, lat, lng (rounded to 1 decimal), timezone |
| GET /geocode/reverse?lat=…&lng=… | City name for a location (`{city, lat, lng}`; city null when unknown). Send ≤2 decimals; returned lat/lng are rounded to 1 decimal for storage. OpenStreetMap Nominatim, cached, ≤1 request/s |
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
| POST /groups/{group_id}/reflections/{reflection_id}/images | Upload 1–6 multipart `files` to the caller's open note (6 total per note) |
| GET /groups/{group_id}/reflections/{reflection_id}/images/{image_id}/url | Get a private image URL that expires in 60 seconds |
| DELETE /groups/{group_id}/reflections/{reflection_id}/images/{image_id} | Remove an image from the caller's open note |
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

Reflection list responses include a `reflection_images` array with attachment metadata. Upload
images after creating the note by sending repeated multipart fields named `files`; JPEG, PNG, WebP
and GIF are accepted, each up to 10 MB, with at most six images total per note. Use the image URL
endpoint when rendering an attachment because the `reflection-images` bucket is private. Uploads
and deletes require the note to belong to the caller and its issue period to remain open.

Publishing body: `{ "period_id": "the-current-period-UUID" }`. Keep that same ID when retrying a request. The response is `202` with an edition ID and `queued`, or null and `empty`. Poll the edition endpoint for pending/generating/published/failed. Database closure atomically freezes submitted text and contributor names, opens the next period, and prevents duplicate editions. A background task starts processing immediately, while the scheduled endpoint provides recovery after server restarts.

Newspaper generation defaults to `GEMINI_MODEL=gemini-3.5-flash-lite` for lower latency. It uses `GEMINI_GENERATION_TIMEOUT_SECONDS` (default 180, maximum 240) per Gemini request and LOW thinking for Gemini 3 models. This leaves room for one corrective validation attempt within the ten-minute generation lease. A timeout preserves the source snapshot and records an actionable failure. Retry the existing edition rather than closing another week. The retry endpoint returns `429` with `Retry-After` while backoff is active, or `409` if the edition is already published. Keep `/internal/tick` scheduled for recovery after development-server restarts.

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

No real customer reflections were sent to Gemini, and no edition emails were sent. Full live Supabase Auth → text → Gemini → Resend acceptance still requires configured secrets, a verified email sender, Supabase Auth setup, and two test accounts.

Provider contracts: [Gemini structured output](https://ai.google.dev/gemini-api/docs/structured-output), [Supabase server-verified users](https://supabase.com/docs/reference/javascript/auth-getuser), [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys).

Group audio uploads and the standalone transcription endpoint share
`app/services/transcription.py`. Both use `GEMINI_TRANSCRIPTION_MODEL` followed by
`GEMINI_FALLBACK_MODELS`; `GEMINI_MODEL` is reserved for newspaper generation. Dedicated
transcription responses are read from `audio_transcription.text`. If transcription fails,
the group response retains its saved audio reference and includes a safe provider error
for the frontend to display alongside manual text entry.
