# Frontend

React 19 + Vite + TypeScript + Tailwind v4. Sign-in with Auth0; all data through the FastAPI backend.
Product decisions: [../AGENTS.md](../AGENTS.md). Look and feel: the prototype at
https://claude.ai/artifact/FaK1NSxn8AZmb5bbzddcWB (light clay globe, white frosted sheet, marigold accent).

```bash
cp .env.example .env.local   # Auth0 values + VITE_API_URL
npm install
npm run dev                  # http://localhost:5173
```

Without the `VITE_AUTH0_*` values the app runs signed-out. Group pages still need the backend
running at `VITE_API_URL`; `/preview/edition` and `/dev` work without it.

## Route map

| Route | Page | File | Status |
|---|---|---|---|
| `/login` | Sign in / create account (Auth0) | `pages/Login.tsx` | Built |
| `/welcome` | First run: name + approximate location or typed city | `features/account/Welcome.tsx` | Built |
| `/` | Your groups, start a group, join with a code | `features/groups/GroupsHome.tsx` | Built |
| `/join?code=…` | Invite link: joins and opens the group | `features/groups/JoinPage.tsx` | Built |
| `/groups/:groupId` | **Group layout**: globe + frosted sheet + tab bar, loads group data once | `features/group/GroupLayout.tsx` | Built |
| ↳ (index) | **People** tab: who wrote this week, local times | `features/group/PeopleTab.tsx` | Built |
| ↳ `people/:userId` | A person: city, local time, their story from the latest paper | `features/group/PeopleTab.tsx` (`PersonView`) | Built |
| ↳ `week` | **This week** tab: write/record notes, your notes, organizer publish | `features/group/WeekTab.tsx` | **Placeholder (FE-2, FE-6)** |
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
- `api<T>(path, init)` (`lib/api.ts`): calls the backend with the Auth0 token; throws `ApiError` with `status`.
- `useRecorder()` (`features/group/useRecorder.ts`): 3-minute voice recording with auto-stop.
- `approximateLocation()` (`lib/location.ts`): browser location → city via `/geocode/reverse`.
- Time helpers (`lib/time.ts`): `localTime`, `timeUntil`, `deadlineLabel`, `shortStamp`.
- Styles: `components/ui.ts` (card, input, primary, secondary, record…), `Avatar`, `GlassPage`,
  colour tokens in `index.css` (`glass-*`, `card-*`, `accent`, `accent-text`, `record`, `ok`, `alert`).
