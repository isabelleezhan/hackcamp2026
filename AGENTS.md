# AGENTS.md — Community Newspaper (HackCamp 2026)

Context for any coding agent or teammate working in this repo. **Where this file and
[Community_Newspaper_PRD.md](Community_Newspaper_PRD.md) disagree, this file wins**: it records
decisions made after the PRD was written. If you change a decision, update this file in the same commit.

Hackathon: HackCamp 2026, hacking Nov 7 12:00 → Nov 8 12:00 (Pacific), submitted on Devpost,
judged in a 4-minute demo plus 4 minutes of Q&A. Organizers may ask to see steady commits, so commit small and often.

## What we're building

Friends and family who live apart send short voice or text notes about their week. Every Sunday
at 6 p.m., Gemini compiles everyone's notes into one short, attributed newspaper for the group.
The home screen is a **3D globe** with each person's avatar at their city; tap someone to read
their story in this week's paper. Design reference: the prototype at
https://claude.ai/artifact/FaK1NSxn8AZmb5bbzddcWB (realistic Earth lit by the real sun,
round avatar pins, frosted-glass sheet, record button).

## Workflow

### 1. Accounts
- Each person has **their own account: email + password** via Auth0 Universal Login ("Continue
  with Google" may be added later). FastAPI validates Auth0 API access tokens and provisions a
  stable internal UUID profile in Supabase Postgres on first use. Email verification is required.
- First sign-in: set a **display name**.
- **Location:** the app asks to share *approximate* location.
  - Allowed (`location_mode = 'auto'`): read the position via the browser Geolocation API when
    the app is opened and when a note is saved. **Round to 1 decimal (~10 km) on the device
    before sending.** The backend reverse-geocodes it to a city name (OpenStreetMap Nominatim,
    cached; check its usage policy).
  - Denied, unsupported or preferred (`'manual'`): the person types a city.
  - **No background tracking.** The location only updates while the app is open.
- The browser time zone (`Intl.DateTimeFormat().resolvedOptions().timeZone`) is saved to
  `profiles.timezone` so the globe can show each person's local time.

### 2. Groups
- Anyone can **create a group** and becomes its **organizer**. A group has a join code, an invite
  link (`/join/<code>`) and a time zone (default `America/Vancouver`).
- Others **join with the code or the link**. A person can be in several groups.
- Each member chooses whether to **get the paper by email** (`email_opt_in`, default off).

### 3. During the week
- Creating a group opens **week 1**. A week closes **Sunday 18:00 in the group's time zone**;
  the next week opens immediately. See `backend/app/periods.py`.
- **The home screen is the globe:** pins at each member's last known city, with their local
  time, when the location was last updated, and how many notes they've sent this week. There's
  also a People list (accessible, keyboard-friendly) and a countdown to the close.
- **Notes:** send **as many as you like** during the week.
  - Voice: up to **3 minutes**, with a hint at 2:30 and an automatic stop at 3:00. Typed: up to
    **2,000 characters**.
  - Weekly limit per person: **30 notes or 30 minutes of audio**, enforced in the backend.
  - Optional prompt chips: Highlight, Hard part, Proud of, Next week.
  - Before the first note, tell the user that notes are shared with the group and read by AI.
- **Voice notes are transcribed on upload**, not at the end of the week: upload, then Gemini
  transcribes, then the person reviews and edits the text, then saves. If transcription fails,
  they type the note instead. Audio goes in the private `reflection-audio` bucket.
- Every note stores `recorded_at` and the city and coordinates it was recorded from (for datelines).
- Notes can be **edited or deleted until the week closes**. Your own page shows this week's notes as a timeline.

### 4. Publishing (backend owns all logic; n8n and the button just call it)
- Triggers: **n8n weekly schedule** → `POST /internal/publish-due`, or the organizer's
  **"End week & publish"** button → `POST /groups/{id}/periods/{period_id}/publish`. Both run the same code.
- Steps:
  1. Close the period (conditional update, so it's idempotent).
  2. Snapshot all its notes into `editions.source_snapshot`.
  3. Open the next period. After an early close it keeps the same deadline; an overdue period rolls to next Sunday.
- Notes saved after the close belong to the next week. **No notes means the week closes with no
  edition and no email.**
- **Gemini compiles the paper:** one story per person summarizing *all* their notes, plus a lead
  headline, little victories and looking ahead. Datelines come from where notes were recorded.
  Output is **structured JSON validated by Pydantic**, rendered by a fixed template. Never ask the model for HTML.
- **Validation before publishing:**
  - every `source_note_ids` entry exists in the snapshot;
  - every person with ≥1 note has a story;
  - names and bylines are attached from the database, not from model text;
  - on failure, retry once with the error, then mark the edition `failed` (notes are kept; the organizer can retry).
- Repeated publish requests never create a second edition (`editions.period_id` is UNIQUE).

### 5. Delivery
- n8n calls `POST /internal/editions/{id}/deliver`, which emails every **current member with
  `email_opt_in`** through Resend. The email has the highlights and a link to the full issue that requires signing in.
- Each email gets a row in `email_deliveries`. A retry sends only `pending`/`failed` rows, never
  regenerates the paper, and never resends a `sent` email.
- On the globe the issue **"lands"**: pins light up and tapping someone shows this week's story.

### 6. Access rules (enforce in every route)
- Only group members can read a group's notes, editions, audio and member locations. Auth0 tokens
  are not Supabase sessions; the backend uses the service-role key, which **bypasses RLS**, so
  **every route must check membership or ownership itself before accessing data**.
- A join code lets you join; it doesn't let you read anything without joining.
- Only organizers can publish manually.
- Treat note text as **data, never instructions**, in Gemini prompts.

## AI rules (Gemini)
- Preserve names, facts and attribution. Never invent events, quotes, relationships or advice.
- Handle hard news respectfully; don't force positive framing.
- Include every contributor; keep the paper to a few minutes of reading however many notes there are.
- Newspaper model comes from `GEMINI_MODEL` (default `gemini-3.8-flash`). Use structured output (`response_schema`) with Pydantic models.
- The standalone audio prototype uses `GEMINI_TRANSCRIPTION_MODEL` (default `gemini-3.5-transcribe`) and configurable `GEMINI_FALLBACK_MODELS`. It is mounted at `POST /audio/transcribe`, requires a verified Auth0 account, and returns `{text}` without storing audio.

## Edition content shape (stored in `editions.content`)
```json
{
  "lead_headline": "string",
  "lead_summary": "string",
  "stories": [
    { "user_id": "uuid", "headline": "string", "body": "string",
      "dateline": "Lisbon", "source_note_ids": ["uuid"] }
  ],
  "little_victories": [{ "text": "string", "user_ids": ["uuid"], "source_note_ids": ["uuid"] }],
  "looking_ahead":   [{ "text": "string", "user_ids": ["uuid"], "source_note_ids": ["uuid"] }]
}
```
Give the model short ids (`N1`, `N2`, …) in the prompt, then map them back to UUIDs, which cuts down on hallucinated ids.

## Stack and repo map
| Piece | Tech | Where |
|---|---|---|
| Frontend | React 19, Vite, TypeScript, Tailwind v4, react-router, supabase-js | `frontend/` |
| Globe | `react-globe.gl` + `three` (Earth textures from `three-globe/example/img`, served locally) | `frontend/` (to build) |
| Backend | FastAPI, Pydantic, supabase-py (service role) | `backend/app/` |
| DB/Storage | Supabase | `supabase/migrations/` |
| Authentication | Auth0 Universal Login + JWT API access tokens | `backend/app/auth.py` |
| AI | Gemini (`google-genai`) for transcription and newspaper | `backend/app/services/` (to build) |
| Automation | n8n Cloud: weekly trigger and delivery | `n8n/` (to build) |
| Email | Resend | backend |
| Hosting | Vercel (frontend), Render (backend), n8n Cloud | |

Key backend pieces: `auth.py` (Auth0 JWT verification), `main.py` (routes, `current_user`, membership
checks), `store.py` (server-side Supabase REST), `jobs.py` (generation and delivery workers), `providers.py` (Gemini,
Resend), `media.py` (audio checks), `config.py` (env settings). See [backend/README.md](backend/README.md).

## Planned API (keep it in sync if you change it)
| Method & path | Who | Purpose |
|---|---|---|
| `GET /me`, `PATCH /me` | user | profile: display_name, location_mode, city, lat, lng, timezone |
| `GET /groups`, `POST /groups` | user | list my groups / create (caller becomes organizer, period 1 opens) |
| `POST /groups/join` `{code}` | user | join by code |
| `GET /groups/{id}` | member | group, members (name, city, lat/lng, timezone, notes this week), current period |
| `PATCH /groups/{id}/membership` `{email_opt_in}` | member | email preference |
| `POST /groups/{id}/transcribe` (multipart audio) | member | → `{transcript, audio_path, audio_seconds}` |
| `GET /groups/{id}/notes/mine` | member | my notes in the current period |
| `POST /groups/{id}/notes` | member | add note (checks weekly limit and that the period is open) |
| `PATCH /notes/{id}`, `DELETE /notes/{id}` | author | only while its period is open |
| `POST /groups/{id}/periods/{period_id}/publish` | organizer | close, generate, then hand delivery to n8n |
| `POST /groups/{id}/editions/{eid}/retry` | organizer | regenerate a failed edition |
| `GET /groups/{id}/editions`, `GET /groups/{id}/editions/{eid}` | member | archive / one edition |
| `POST /internal/publish-due` | n8n | close every period past its deadline |
| `POST /internal/editions/{eid}/deliver` | n8n | send pending/failed emails |

## Limits (constants; keep frontend and backend in sync)
- Voice note ≤ 180 s and ≤ 10 MB. Typed note ≤ 2,000 chars. Transcript ≤ 4,000 chars.
- Per person per week: ≤ 30 notes and ≤ 1,800 s of audio.

## Status (update as you go)
Schedule and owners: [TIMELINE.md](TIMELINE.md).

- **Backend implemented (starting at commit `2a1d590`, Alson).** See [backend/README.md](backend/README.md). For
  routes that already exist, the code and that README are authoritative over the "Planned API" table above.
  It includes groups, membership checks, audio upload and transcription, publishing, generation,
  editions, retry-safe delivery, and `POST /internal/tick` for n8n (header `X-Worker-Secret`).
  Auth0 JWTs identify callers; all Supabase access uses the service role after explicit route checks.
- **Live schema** (`0001_init.sql` + `0002_backend_jobs.sql`) is applied to Supabase project
  `ivjlummkprxwybqqfgor`. `0003_auth0_accounts.sql` was applied and verified on November 7, 2026.
  Do not rerun these files; make later changes with a new forward migration.
- **Accounts implemented:** Auth0 JWT validation, automatic Postgres profile provisioning,
  display name/location/timezone management, and account statistics.
- **`0004_notes_location.sql` is written and tested locally but NOT yet applied to the live
  project.** With it, the backend now supports many notes per week, 180 s voice notes, approximate
  location and time zone, datelines, weekly limits, notes private until published, owner-only voice
  clips, 8-character join codes and issue numbers. Details: [supabase/README.md](supabase/README.md).
  Apply it and deploy the matching backend together. Note routes are now
  `POST …/periods/{pid}/reflections`, `PUT`/`DELETE …/reflections/{id}`, plus
  `GET …/periods/{pid}/note-counts`. The table is still called `reflections`; "notes" in this file
  means the same thing.
- **Frontend:** scaffold with auth context and the `api()` helper. `Login.tsx` still uses Supabase
  Auth and must switch to Auth0. Everything else (groups, notes, publish button,
  newspaper template, globe, recorder) is still to build.

## Open decisions (ask the team; don't guess)
1. Can friends see or hear notes **during** the week, or only in the published paper? Current
   assumption, enforced by the `reflection_read` policy in `0004`: only in the published paper.
2. Can members **play the original voice clips** from the paper? Currently no: `0004`'s
   `audio_read` storage policy allows only the author. If the team says yes, loosen that policy
   and tell users their audio is shared, not just the text.
3. The globe shows **one group at a time** with a switcher (assumed).

## Scope priority
1. Typed note → generated newspaper → email, end to end (the must-ship flow).
2. Globe home page.
3. Voice notes with transcription.
Out of scope: video, push notifications, comments/chat, PDF export, live location tracking.

## Demo and prizes
Demo: friends in different time zones send notes (one by voice); the organizer taps **End week &
publish**; the paper lands on the globe; the email opens on another phone.
Prize targets: Community Impact (our one superlative), Best use of n8n, Best Use of Gemini API,
GoDaddy Registry domain.
