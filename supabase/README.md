# Supabase setup

Applied to project `ivjlummkprxwybqqfgor` on November 7, 2026.

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

## Auth0 migration pending

`migrations/0003_auth0_accounts.sql` moves application identity from Supabase Auth to Auth0. It preserves internal UUIDs, adds the Auth0 subject, verified email, location and timezone account fields, and changes worker email enrollment to use profiles. Review and apply it once before deploying the Auth0 backend. The API then uses the Supabase service role only after its own ownership/membership checks; Auth0 access tokens are never sent to Supabase.

## Client contract

Call Supabase RPCs using the signed-in user's session:

| RPC | Arguments | Result |
| --- | --- | --- |
| create_group | group_name, optional group_timezone | group UUID |
| join_group | invitation_code | group UUID |
| set_email_preference | gid, enabled | void |
| close_issue | gid, expected_period_id | edition UUID, or null for empty period |

Build invitation links in the frontend using the group's join_code. Links carry the code to the authenticated join screen; they never grant anonymous reading. Fetch the current period using `closed_at IS NULL`. Include its ID in publishing requests so retries cannot accidentally close the next period.

Members can directly create/update/delete their own reflections while their period is open. The trigger supplies submitted_at and updated_at. Only display_name is client-editable on profiles. Group membership, roles, period metadata, edition content, snapshots, and delivery records cannot be directly modified by clients.

The FastAPI backend must keep the service-role secret server-side. It validates Gemini's structured JSON before saving content; the database checks that content is a JSON object, not the full newspaper schema. Generation workers should atomically claim pending/failed editions, manage stalled-work recovery, and update generation attempts/status. Delivery workers must recheck current membership and explicit email opt-in, claim deliveries atomically, skip sent rows, and use a stable provider idempotency key per edition/user. Database uniqueness alone does not guarantee exactly-once external sending.

Audio duration metadata is constrained to 60 seconds when supplied. The backend must inspect actual file format and duration before sending audio to Gemini. Transcriptions remain drafts until the contributor reviews and submits the text. Use short-lived signed URLs or authenticated downloads. Backend service access handles any needed media cleanup.

## Authentication

Auth0 now owns signup, login, password handling, sessions and email verification. Supabase Auth is no longer used by the application after `0003_auth0_accounts.sql`; its SMTP and OTP templates do not need configuration. Resend configuration is still required separately for newspaper delivery.

## Verification and boundaries

`tests/verify_schema.sql` passed against the live project, with test users and data rolled back. It checks membership isolation, organizer permissions, opt-in persistence, duplicate reflections, source snapshots, duplicate closure, edit locking, all-table RLS, private storage configuration, and the Vancouver local deadline.

`migrations/0001_init.sql` records the applied initial schema and declares its pgcrypto prerequisite for a fresh project only. Do not rerun it against the configured project. It was applied through the dashboard, not registered through Supabase CLI migration history.

The FastAPI backend now implements Gemini generation/transcription, Resend edition sending, frontend invitation URL construction, and an n8n worker endpoint. See `../backend/README.md`. The `migrations/0002_backend_jobs.sql` worker migration is also applied, and `tests/verify_backend_jobs.sql` passed against the live project with all test data rolled back. Provider credentials, deployment, n8n activation, frontend screens, and Auth SMTP setup remain required for a live end-to-end demonstration.


## Repository reconciliation

The original Git scaffold's `migrations/0001_init.sql` described a different, unused schema. It has been replaced with the complete initial SQL actually applied to this project, followed by the worker migration in `migrations/0002_backend_jobs.sql`. Both schema changes had full local SQL sources; there were no changes from this work that existed only in the dashboard, so no CLI schema pull was necessary. Verification scripts live in `tests/` and must not be treated as migrations.

The live database was previously configured through the dashboard and does not have corresponding CLI migration-history entries. Do not blindly run `supabase db push` against it. Before adopting CLI migrations, link the correct project and reconcile its remote migration history against these files after review; for a new empty project, apply the two migrations in order. If another database has already applied the old scaffold migration, it requires a separately reviewed forward migration, not rerunning this replacement initial migration. No live schema changes or history repairs were made during this repository transfer.
