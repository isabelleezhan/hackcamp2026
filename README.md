# hackcamp2026 — Community Newspaper

See [Community_Newspaper_PRD.md](Community_Newspaper_PRD.md) for the product spec.

## One-time Supabase setup

1. Create a Supabase project. In **SQL Editor**, run [supabase/migrations/0001_init.sql](supabase/migrations/0001_init.sql).
2. **Auth → Email Templates → Magic Link**: put `{{ .Token }}` in the body. Without it, users get a link instead of the 6-digit code the login page asks for.
3. **Auth → SMTP Settings**: turn on custom SMTP using Resend (host `smtp.resend.com`, port 465, user `resend`, password = Resend API key). Supabase's built-in sender only allows a few emails per hour, which will break the demo.
4. Verify a sender domain in Resend early (until then Resend only delivers to your own address).

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

Signing in should show "backend sees you as …" on the home page — that confirms auth works across both apps.

## How the pieces fit

- The browser uses Supabase **only for sign-in**. All data goes through FastAPI, which sends the user's token as `Authorization: Bearer …`.
- The backend uses the service-role key (bypasses RLS), so **every route must check group membership** — use `UserDep` / `SupabaseDep` from `backend/app/deps.py`.
- Endpoints that n8n calls are guarded by `require_n8n` (header `X-N8N-Secret`).
- Weekly deadline: Sunday 6 p.m. in the group's timezone — see `backend/app/periods.py`.
