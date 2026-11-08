# Frontend

Group Settings includes organizer-only publication controls: every 1–365 days or a weekly weekday.
Members see the schedule and next publication date. Cutoffs are always 23:59 the previous day in the
fixed America/Vancouver (Pacific) publication time zone, with no time controls. Everyone sees the
same publication date regardless of their device time zone. n8n must use America/Vancouver too.
The backend requires migration 0008 for saving schedules.
The group header countdown ticks without rerendering the globe. At the cutoff it shows
"Notes closed · awaiting publication", bypasses the API cache to check for the next period every
five seconds, and resets when the backend opens it. Focusing the page also checks for a changed
period or deadline. The client never invents a next period or publishes an issue itself.

Production is hosted at https://whydidmyfriendsleaveme.vercel.app with the backend at
https://whydidmyfriendsleavemee.onrender.com. Set the Vercel project's **Root Directory** to
`frontend`, framework to Vite, build command to `npm run build`, and output directory to `dist`.
The tracked `.env.production` sets `VITE_API_URL=/api`; `vercel.json` forwards `/api/*` to
Render and serves React routes through `index.html`. The browser uses its own origin, so API
requests do not depend on Render's CORS allowlist. API proxy responses are never CDN-cached.

In Vercel, remove any Production/Preview `VITE_API_URL` override, or set it to `/api`.
Dashboard environment variables override `.env.production`. Keep `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` configured, then redeploy for build-time values and routing to take effect.
Verify `https://whydidmyfriendsleaveme.vercel.app/api/health` returns backend JSON after deployment.
Configure Supabase Auth's Site URL as `https://whydidmyfriendsleaveme.vercel.app` and allow
`https://whydidmyfriendsleaveme.vercel.app/login` for confirmation and recovery redirects.
On Render, set `FRONTEND_URL=https://whydidmyfriendsleaveme.vercel.app` for issue email links.
For direct browser calls to Render instead of the proxy, its `CORS_ORIGINS` must include
`https://whydidmyfriendsleaveme.vercel.app`.

API GET responses are cached in memory for 30 seconds (up to 128 entries), with concurrent
requests deduplicated. Cache keys include the access token and request headers; nothing is saved
to browser storage. Writes and account changes clear the cache. Group refresh actions bypass it,
as do signed audio requests and abortable requests. Unfinished editions are never cached, so
generation polling stays live. Use `api(path, { cache: 'reload' })` to refresh a cached response,
or `cache: 'no-store'` to bypass caching entirely. Run cache checks with `npm test` (Node 24+).

React 19 + Vite + TypeScript + Tailwind v4. Sign-in with Supabase Auth; all data through the FastAPI backend.
Product decisions: [../AGENTS.md](../AGENTS.md). Look and feel: the prototype at
https://claude.ai/artifact/FaK1NSxn8AZmb5bbzddcWB (light clay globe, white frosted sheet, marigold accent).

```bash
cp .env.example .env.local   # Supabase URL/key + VITE_API_URL
npm install
npm run dev                  # http://localhost:5173
```

Opening a protected page while signed out redirects to `/login`. Configure
`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env.local`, then restart Vite.
Use only the public anon/publishable key here, never the service-role key.
In Supabase Authentication, enable Email, set Site URL to `http://localhost:5173`,
and allow `http://localhost:5173/login` as a redirect (plus production equivalents).
Keep email confirmation enabled and configure SMTP for reliable confirmation/reset delivery.
Login supports email/password, signup, confirmation resend, password reset and local sign-out.
Existing users create a Supabase account; the same confirmed email restores their existing
profile and memberships after migration 0005. Passwords do not transfer.
Group pages need the backend running at `VITE_API_URL`; `/preview/edition` and `/dev`
remain available without sign-in. If the backend rejects a profile request with 401,
the app prompts the user to sign in again instead of showing a server-connectivity error.

**No backend yet? Use the mock API** (in a second terminal):

```bash
npm run mock-api             # http://localhost:8000, the default VITE_API_URL
```

It answers the same routes as the real backend, in memory: a seeded group ("The Long-Distance
Weekly", you as organizer plus four friends, a published Issue 12), adding and editing notes, a
fake voice transcript, "End week & publish" (builds a simple mock issue after a few seconds) and the
email preview. Sign in with Supabase Auth as usual; the mock accepts any token and treats you as the
seeded "You". Data resets when it restarts. Stop it before running the real backend, which also
uses port 8000. Source: `mock/server.mjs`.

## Route map

| Route | Page | File | Status |
|---|---|---|---|
| `/login` | Sign in / create account (Supabase Auth) | `pages/Login.tsx` | Built |
| `/welcome` | First run: name + approximate location or typed city | `features/account/Welcome.tsx` | Built |
| `/` | Public landing page | `pages/LandingPage.tsx` | Built |
| `/groups` | Your groups, start a group, join with a code | `features/groups/GroupsHome.tsx` | Built |
| `/join?code=…` | Invite link: joins and opens the group | `features/groups/JoinPage.tsx` | Built |
| `/groups/:groupId` | **Group layout**: globe + frosted sheet + tab bar, loads group data once | `features/group/GroupLayout.tsx` | Built |
| ↳ (index) | **People** tab: who wrote this week, local times | `features/group/PeopleTab.tsx` | Built |
| ↳ `people/:userId` | A person: city, local time, their story from the latest paper | `features/group/PeopleTab.tsx` (`PersonView`) | Built |
| ↳ `week` | **This week** tab: write/record notes, your notes, organizer publish | `features/group/WeekTab.tsx` | Built |
| ↳ `paper` | **Paper** tab: latest paper, In the app / Email | `features/group/PaperTab.tsx` | Built |
| ↳ `editions` | **Issues** tab: all issues | `features/edition/EditionArchive.tsx` | Built |
| ↳ `editions/:editionId` | One issue (the edition email links here) | `features/edition/EditionPage.tsx` | Built |
| ↳ `settings` | **Group** tab: invite link/code, members, email toggle | `features/group/GroupSettingsTab.tsx` | **Placeholder (FE-1)**, shows the invite link already |
| `/dev` | Jerry's test panels (audio transcription, email) | `pages/DevTools.tsx` | Dev only |
| `/preview/edition` | Newspaper with sample data; `?view=email`, `?state=generating\|failed\|archive` | `features/edition/PreviewEdition.tsx` | Dev only |

Placeholders render a card listing what belongs on the page, the API calls and the helpers that
already exist. Replace the whole component when you build it.

## Building blocks

- `useGroup()` (`features/group/context.ts`): inside any group tab: `group`, `people` (name, city,
  lat/lng, time zone, notes this week), `meId`, `isOrganizer`, `period` (current week), `latest`
  (latest published edition), `refresh()`.
- `useProfile()` (`features/account/context.ts`): your profile and `update(changes)` (PATCH /me).
- `useAuth()` (`auth/context.ts`): `user`, `signIn`, `signUp`, `signOut`.
- `api<T>(path, init)` (`lib/api.ts`): calls the backend with the Supabase Auth token; throws `ApiError` with `status`.
- `useRecorder()` (`features/group/useRecorder.ts`): 3-minute voice recording with auto-stop.
- `approximateLocation()` (`lib/location.ts`): browser location → city via `/geocode/reverse`.
- Time helpers (`lib/time.ts`): `localTime`, `timeUntil`, `deadlineLabel`, `shortStamp`.
- Styles: `components/ui.ts` (card, input, primary, secondary, record…), `Avatar`, `GlassPage`,
  colour tokens in `index.css` (`glass-*`, `card-*`, `accent`, `accent-text`, `record`, `ok`, `alert`).

## Weekly notes

The This week tab supports typed notes, editing/deletion until close, sharing/AI consent,
voice recording or file upload, transcript review (including manual fallback), and organizer
publishing. Typed notes allow 2,000 characters; voice transcripts allow 4,000. Recording stops
at three minutes with a warning at 2:30. The server validates format/duration and enforces
30 notes or 30 audio minutes per member/week. New notes attach approximate/manual location;
editing preserves the note's original location. Failed saves keep the local draft.

Publishing confirms the exact period ID before closing it and opens the edition's generation
screen. Repeated clicks are blocked while a request is in flight. Empty periods explain that
no edition/email was created. Navigation/reload discards unsaved drafts; save first.
