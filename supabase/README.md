# Supabase setup

Applied to project `ivjlummkprxwybqqfgor` on November 7, 2026: `0001_init.sql`,
`0002_backend_jobs.sql`, and `0003_auth0_accounts.sql`.

## Applied: `0004_notes_location.sql` (verified November 8, 2026)

Aligns the schema with [AGENTS.md](../AGENTS.md). The live schema now includes its audio/location, note-count and issue-number changes. Do not rerun it after a successful commit.

## Pending: `0005_supabase_auth.sql`

Apply the complete file once in the Supabase SQL Editor before restarting the migrated app.
It preserves profiles and memberships while switching identity providers. See Authentication below.

Live REST schema inspection also confirmed that the pre-0004 `reflections` table lacks both
`audio_path` and `audio_duration_seconds`; 0004 adds these when absent before applying audio limits.
The migration discovers the old single-column audio-duration and body checks by column dependency,
so dashboard-assigned constraint names work too. If an earlier attempt failed because a constraint
name was missing, run `ROLLBACK;` to clear any aborted editor transaction, then paste and run the
entire updated migration. Its `BEGIN`/`COMMIT` keeps a failed full-file attempt from partially applying.
Do not rerun it after a successful commit.

- Many notes per person per week (the `unique(period_id, user_id)` rule is dropped).
- Voice notes up to 180 s; transcripts of voice notes up to 4,000 characters (typed: 2,000).
- `profiles`: `location_mode`, `city`, `lat`, `lng`, `location_updated_at`, `timezone`.
  `reflections`: `recorded_at` (set by the database), `city`, `lat`, `lng`. Coordinates must be
  rounded to 1 decimal (~10 km); finer values are rejected.
- `edition_sources` gets `city` and `recorded_at`, filled by trigger, for datelines; `close_issue()` is unchanged.
- Weekly limit per person: 30 notes and 1,800 s of audio (trigger errors `Weekly note limit reached` / `Weekly audio limit reached`).
- Notes are readable only by their author until the week closes; everyone reads the snapshot
  afterwards. `period_note_counts_for(actor_id, gid, pid)` returns counts only after checking
  membership, for the globe.
- Voice clips (storage) are readable only by their author.
- New groups get 8-character join codes without 0/O/1/I/L; existing 32-hex codes keep working.
- `editions.issue_number` (backfilled, then assigned on insert).

Verified on a local Postgres 16 with stubs for Supabase's `auth`/`storage` schemas (0001 → 0002 →
0003 → 0004): `tests/verify_schema.sql` (its duplicate-reflection check is now removed),
`tests/verify_backend_jobs.sql` and the new `tests/verify_notes.sql` all pass. After applying it to
the live project, run all three there too (they roll back their test data).

Project URL: https://ivjlummkprxwybqqfgor.supabase.co

## Applied

- Eight tables: profiles, groups, memberships, issue_periods, reflections, editions, edition_sources, email_deliveries.
- Row-level security on all tables; anonymous access denied. Membership gates group content. Draft reflections are visible only to their contributor.
- Profiles created automatically after Auth signup. Members can update their display name.
- Group creation and invitation-code joining; creator becomes organizer; email preference defaults to off.
- One reflection per person per period, 2,000-character limit, draft/submitted state, and deadline/closure edit protection.
- Atomic organizer-only period closure with immutable contribution/name snapshots and one edition per period. Repeated calls with the same period return the same edition. Empty periods create no edition. Service-role automation can call the same function.
- Sunday 6 p.m. deadlines in the group timezone, default America/Vancouver. Manual closure retains the upcoming deadline.
- Separate generation/delivery status and attempt/error fields. Unique delivery per edition/recipient.
- Private `reflection-audio` bucket, 10 MB maximum, audio MIME allowlist. Upload paths: `<group_id>/<user_id>/<unique_filename>`. Only group members can read; only the named contributor can upload. Use new filenames rather than overwriting source audio.

## Historical migration 0003 applied

`migrations/0003_auth0_accounts.sql` was applied on November 7, 2026. Do not edit or rerun
this historical migration. Its external-provider identity integration is superseded by 0005.
The backend continues to enforce membership/ownership before using its service-role key.

## Backend database contract

The frontend sends Supabase sessions to FastAPI, which verifies them with Supabase Auth. After explicit route authorization, database calls use the service role.

| RPC | Arguments | Result |
| --- | --- | --- |
| create_group_for | actor_id, group_name, optional group_timezone | group UUID |
| join_group_for | actor_id, invitation_code | group UUID |
| set_email_preference_for | actor_id, gid, enabled | void |
| period_note_counts_for | actor_id, gid, pid | submitted counts by member |
| close_issue | gid, expected_period_id | edition UUID, or null for empty period |

Build invitation links in the frontend using the group's join_code. Links carry the code to the authenticated join screen; they never grant anonymous reading. Fetch the current period using `closed_at IS NULL`. Include its ID in publishing requests so retries cannot accidentally close the next period.

FastAPI creates, updates, and deletes only the caller's reflections while their period is open.
The trigger supplies submitted_at and updated_at. Group membership, roles, period metadata,
edition content, snapshots, and delivery records are not directly modified by clients.

The FastAPI backend must keep the service-role secret server-side. It validates Gemini's structured JSON before saving content; the database checks that content is a JSON object, not the full newspaper schema. Generation workers should atomically claim pending/failed editions, manage stalled-work recovery, and update generation attempts/status. Delivery workers must recheck current membership and explicit email opt-in, claim deliveries atomically, skip sent rows, and use a stable provider idempotency key per edition/user. Database uniqueness alone does not guarantee exactly-once external sending.

After `0004` is applied, audio duration metadata is constrained to 180 seconds. The backend inspects
actual file format and duration before sending audio to Gemini. Transcriptions remain drafts until
the contributor reviews and submits the text. Use short-lived signed URLs or authenticated downloads.

## Authentication

Supabase Auth owns signup, passwords, confirmation, recovery and sessions. Apply
`migrations/0005_supabase_auth.sql` after 0004. It removes the retired identity column,
adds `supabase_user_id`, preserves internal profile IDs/memberships, and updates RLS/RPCs
to resolve the stable profile ID. The service-only `ensure_supabase_profile(uuid)` reads
the confirmed identity from `auth.users`. Users cannot supply an email or claim another identity.
A confirmed email can recover a matching legacy verified profile; passwords do not migrate.
New profiles are provisioned on the first authenticated API call.

Configure Email, Site URL, `/login` redirects and SMTP in Supabase Authentication.
Use link-based Confirm Signup and Reset Password templates containing `{{ .ConfirmationURL }}`;
`confirmation-email.html` is a signup template. The earlier `otp-email.html` code-only template
does not match the new email/password confirmation flow.
Backend Resend settings for newspapers are separate. Run `tests/verify_supabase_auth.sql`
after 0005; it rolls back test data. Earlier verification scripts target their respective
schema versions; `verify_notes.sql` targets 0004 before the legacy identity column is removed.

## Verification and boundaries

`tests/verify_schema.sql` passed against the live project, with test users and data rolled back. It checks membership isolation, organizer permissions, opt-in persistence, duplicate reflections, source snapshots, duplicate closure, edit locking, all-table RLS, private storage configuration, and the Vancouver local deadline.

`migrations/0001_init.sql` records the applied initial schema and declares its pgcrypto prerequisite for a fresh project only. Do not rerun it against the configured project. It was applied through the dashboard, not registered through Supabase CLI migration history.

The FastAPI backend now implements Gemini generation/transcription, Resend edition sending, frontend invitation URL construction, and an n8n worker endpoint. See `../backend/README.md`. The `migrations/0002_backend_jobs.sql` worker migration is also applied, and `tests/verify_backend_jobs.sql` passed against the live project with all test data rolled back. Provider credentials, deployment, n8n activation, frontend screens, and Auth SMTP setup remain required for a live end-to-end demonstration.


## Repository reconciliation

The original Git scaffold's `migrations/0001_init.sql` described a different, unused schema. It has been replaced with the complete initial SQL actually applied to this project, followed by the worker migration in `migrations/0002_backend_jobs.sql`. Both schema changes had full local SQL sources; there were no changes from this work that existed only in the dashboard, so no CLI schema pull was necessary. Verification scripts live in `tests/` and must not be treated as migrations.

The live database was previously configured through the dashboard and does not have corresponding CLI migration-history entries. Do not blindly run `supabase db push` against it. Before adopting CLI migrations, link the correct project and reconcile its remote migration history against these files after review; for a new empty project, apply the two migrations in order. If another database has already applied the old scaffold migration, it requires a separately reviewed forward migration, not rerunning this replacement initial migration. No live schema changes or history repairs were made during this repository transfer.
