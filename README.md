# hackcamp2026 — Community Newspaper

Friends and family who live apart send short voice or text notes during the week. Every Sunday at
6 p.m., Gemini turns everyone's notes into one shared newspaper, shown on a 3D globe of where
everyone is and emailed to anyone who wants it.

- **How the app works, current decisions, API plan, open questions:** [AGENTS.md](AGENTS.md)
  (read this first; it overrides the PRD where they differ)
- Original spec: [Community_Newspaper_PRD.md](Community_Newspaper_PRD.md)

## One-time Supabase setup

1. Create a Supabase project. In **SQL Editor**, run [supabase/migrations/0001_init.sql](supabase/migrations/0001_init.sql).
2. **Authentication → Sign In / Providers → Email**: keep Email enabled and turn **off** "Confirm email"
   for the hackathon, so people can sign in right after signing up without waiting for an email.
3. Optional, needed only if you turn email confirmation back on or add password reset:
   **Authentication → SMTP Settings** → custom SMTP through Resend (host `smtp.resend.com`, port 465,
   user `resend`, password = Resend API key). Supabase's built-in sender allows only a few emails per hour.
4. Verify a sender domain in Resend early. Until then it only delivers to your own address, and the
   edition emails need it.

## Run locally

Backend (http://localhost:8000):

```bash
cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
```

```bash
cp backend/.env.example backend/.env   # then fill it in
```

```bash
cd backend && .venv/bin/fastapi dev app/main.py
```

Frontend (http://localhost:5173):

```bash
cp frontend/.env.example frontend/.env.local   # then fill it in
```

```bash
cd frontend && npm install && npm run dev
```

Signing in should show "backend sees you as …" on the home page; that confirms auth works across both apps.
(The login page still uses email codes; switching it to email + password is on the to-do list in AGENTS.md.)

## How the pieces fit

- The browser uses Supabase **only for sign-in**. All data goes through FastAPI, which receives the
  user's token as `Authorization: Bearer …`.
- The backend uses the service-role key (bypasses RLS), so **every route must check group
  membership**. Use `UserDep` / `SupabaseDep` from `backend/app/deps.py`.
- n8n calls the `/internal/*` endpoints with the `X-N8N-Secret` header (`require_n8n`).
- Weekly deadline: Sunday 6 p.m. in the group's time zone (`backend/app/periods.py`).
- Location: approximate only (rounded to ~10 km on the device), refreshed while the app is open; there's no background tracking.
