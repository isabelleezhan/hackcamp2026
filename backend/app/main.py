import hmac
import re
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from typing import Annotated
from urllib.parse import quote
from uuid import UUID, uuid4

import httpx
from fastapi import (
    BackgroundTasks,
    Depends,
    FastAPI,
    File,
    Form,
    Header,
    HTTPException,
    Query,
    Request,
    Response,
    UploadFile,
)
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from app.auth import SupabaseAuthenticator
from app.config import Settings, get_settings
from app.deps import Identity, current_user, get_store
from app.jobs import Jobs
from app.media import MAX_AUDIO_BYTES, MIME_TYPES, inspect_audio
from app.models import (
    AudioResult,
    EmailPreference,
    GroupCreate,
    GroupJoin,
    ProfileUpdate,
    PublishRequest,
    ReflectionWrite,
)
from app.providers import Gemini, Resend, email_payload
from app.routers.audio import router as audio_router
from app.routers.email import router as email_router
from app.routers.geocode import router as geocode_router
from app.services.geocode import ReverseGeocoder
from app.store import Store

EDITION_FIELDS = "id,group_id,period_id,issue_number,status,content,generation_error,generation_attempts,published_at,created_at"


class BodyTooLarge(Exception):
    pass


class BodyLimitMiddleware:
    def __init__(self, app, limit=MAX_AUDIO_BYTES + 1024 * 1024):
        self.app, self.limit = app, limit

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        received = 0
        started = False

        async def limited_receive():
            nonlocal received
            message = await receive()
            received += len(message.get("body", b""))
            if received > self.limit:
                raise BodyTooLarge
            return message

        async def tracked_send(message):
            nonlocal started
            if message["type"] == "http.response.start":
                started = True
            await send(message)

        try:
            length = dict(scope.get("headers", [])).get(b"content-length")
            if length and int(length) > self.limit:
                raise BodyTooLarge
            await self.app(scope, limited_receive, tracked_send)
        except BodyTooLarge:
            if not started:
                await JSONResponse({"detail": "Request exceeds the upload size limit"}, 413)(
                    scope, receive, send
                )


def get_jobs(request: Request) -> Jobs:
    return request.app.state.jobs


User = Annotated[Identity, Depends(current_user)]
Database = Annotated[Store, Depends(get_store)]


async def membership(store: Store, user: Identity, group_id: UUID, organizer=False) -> dict:
    rows = await store.rows(
        "memberships",
        admin=True,
        group_id=f"eq.{group_id}",
        user_id=f"eq.{user.id}",
    )
    if not rows:
        raise HTTPException(404, "Group not found")
    if organizer and rows[0]["role"] != "organizer":
        raise HTTPException(403, "Only organizers can publish or retry an edition")
    return rows[0]


def audio_object_path(group_id: UUID, path: str, owner_id: UUID | None = None) -> str:
    match = re.fullmatch(
        r"([0-9a-f-]{36})/([0-9a-f-]{36})/([0-9a-f-]{36})\.(webm|ogg|mp3|m4a|wav|aac)", path
    )
    if not match or match[1] != str(group_id) or (owner_id and match[2] != str(owner_id)):
        raise HTTPException(422, "Invalid audio reference")
    for part in match.group(1, 2, 3):
        try:
            UUID(part)
        except ValueError as exc:
            raise HTTPException(422, "Invalid audio reference") from exc
    return quote(path, safe="/")


def create_app(settings: Settings | None = None, transport=None, authenticator=None) -> FastAPI:
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        async with httpx.AsyncClient(timeout=30, transport=transport) as client:
            app.state.settings = settings
            app.state.store = Store(settings, client)
            app.state.authenticator = authenticator or SupabaseAuthenticator(settings, client)
            app.state.geocoder = ReverseGeocoder(settings, client)
            app.state.jobs = Jobs(
                settings, app.state.store, Gemini(settings, client), Resend(settings, client)
            )
            yield

    app = FastAPI(title="Community Newspaper API", version="0.1.0", lifespan=lifespan)
    app.include_router(audio_router)
    app.include_router(geocode_router)
    app.include_router(email_router)
    app.add_middleware(BodyLimitMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
    )

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, error: RequestValidationError):
        # Pydantic's default detail includes input text; do not echo private reflections/tokens.
        details = [{"loc": e["loc"], "msg": e["msg"], "type": e["type"]} for e in error.errors()]
        return JSONResponse({"detail": details}, status_code=422)

    @app.get("/health", tags=["Operations"])
    async def health():
        return {"status": "ok"}

    @app.get("/ready", tags=["Operations"])
    async def ready(store: Database):
        # Checks connectivity and the backend migration without exposing configuration values.
        await store.rows("editions", admin=True, select="id,lease_token,next_attempt_at", limit="0")
        configured = {
            "user_auth": bool(settings.supabase_url and settings.supabase_anon_key.get_secret_value()),
            "generation": bool(settings.gemini_api_key.get_secret_value()),
            "email": bool(settings.resend_api_key.get_secret_value() and settings.email_from),
            "worker": bool(settings.worker_secret.get_secret_value()),
        }
        return JSONResponse(
            {"ready": all(configured.values()), "services": configured},
            status_code=200 if all(configured.values()) else 503,
        )

    @app.get("/me", tags=["Accounts"])
    async def me(user: User, store: Database):
        rows = await store.rows("profiles", admin=True, id=f"eq.{user.id}")
        if not rows:
            raise HTTPException(404, "Profile not found")
        profile = {key: value for key, value in rows[0].items() if key != "supabase_user_id"}
        return {**profile, "email": user.email}

    @app.patch("/me", tags=["Accounts"])
    async def update_me(data: ProfileUpdate, user: User, store: Database):
        payload = data.model_dump(exclude_unset=True, exclude_none=True)
        if {"city", "lat", "lng", "location_mode"} & payload.keys():
            payload["location_updated_at"] = datetime.now(UTC).isoformat()
        rows = await store.write("PATCH", "profiles", payload, admin=True, id=f"eq.{user.id}")
        if not rows:
            raise HTTPException(404, "Profile not found")
        return {key: value for key, value in rows[0].items() if key != "supabase_user_id"}

    @app.get("/me/stats", tags=["Accounts"])
    async def account_stats(user: User, store: Database):
        memberships = await store.rows(
            "memberships", admin=True, user_id=f"eq.{user.id}", select="role,email_enabled"
        )
        reflections = await store.rows(
            "reflections", admin=True, user_id=f"eq.{user.id}", select="status"
        )
        sources = await store.rows(
            "edition_sources", admin=True, user_id=f"eq.{user.id}", select="edition_id"
        )
        return {
            "groups_joined": len(memberships),
            "groups_organized": sum(row.get("role") == "organizer" for row in memberships),
            "email_subscriptions": sum(bool(row.get("email_enabled")) for row in memberships),
            "reflections_total": len(reflections),
            "reflections_submitted": sum(row.get("status") == "submitted" for row in reflections),
            "editions_contributed_to": len({row["edition_id"] for row in sources}),
        }

    @app.get("/groups", tags=["Groups"])
    async def groups(user: User, store: Database):
        memberships = await store.rows("memberships", admin=True, user_id=f"eq.{user.id}")
        if not memberships:
            return []
        by_id = {m["group_id"]: m for m in memberships}
        rows = await store.rows(
            "groups",
            admin=True,
            id=f"in.({','.join(by_id)})",
            order="created_at.desc",
        )
        return [{**row, "membership": by_id.get(row["id"])} for row in rows]

    @app.post("/groups", status_code=201, tags=["Groups"])
    async def create_group(data: GroupCreate, user: User, store: Database):
        group_id = await store.rpc(
            "create_group_for",
            {"actor_id": str(user.id), "group_name": data.name, "group_timezone": data.timezone},
            admin=True,
        )
        return {"id": group_id}

    @app.post("/groups/join", tags=["Groups"])
    async def join_group(data: GroupJoin, user: User, store: Database):
        return {
            "id": await store.rpc(
                "join_group_for",
                {"actor_id": str(user.id), "invitation_code": data.code},
                admin=True,
            )
        }

    @app.get("/groups/{group_id}", tags=["Groups"])
    async def group(group_id: UUID, user: User, store: Database):
        member = await membership(store, user, group_id)
        rows = await store.rows("groups", admin=True, id=f"eq.{group_id}")
        return {
            **rows[0],
            "membership": member,
            "invitation_url": f"{settings.frontend_url}/join?code={rows[0]['join_code']}",
        }

    @app.put("/groups/{group_id}/email-preference", tags=["Groups"])
    async def preference(group_id: UUID, data: EmailPreference, user: User, store: Database):
        await membership(store, user, group_id)
        await store.rpc(
            "set_email_preference_for",
            {"actor_id": str(user.id), "gid": str(group_id), "enabled": data.enabled},
            admin=True,
        )
        return {"email_enabled": data.enabled}

    @app.get("/groups/{group_id}/members", tags=["Groups"])
    async def members(group_id: UUID, user: User, store: Database):
        await membership(store, user, group_id)
        return await store.rows(
            "memberships",
            admin=True,
            group_id=f"eq.{group_id}",
            select="user_id,role,profiles(display_name,city,lat,lng,timezone,location_updated_at)",
        )

    @app.get("/groups/{group_id}/periods/current", tags=["Reflections"])
    async def current_period(group_id: UUID, user: User, store: Database):
        await membership(store, user, group_id)
        rows = await store.rows(
            "issue_periods", admin=True, group_id=f"eq.{group_id}", closed_at="is.null"
        )
        if not rows:
            raise HTTPException(404, "No open issue period")
        return rows[0]

    @app.get("/groups/{group_id}/periods/{period_id}/reflections", tags=["Reflections"])
    async def reflections(group_id: UUID, period_id: UUID, user: User, store: Database):
        await membership(store, user, group_id)
        return await store.rows(
            "reflections",
            admin=True,
            group_id=f"eq.{group_id}",
            period_id=f"eq.{period_id}",
            user_id=f"eq.{user.id}",
            order="updated_at.asc",
        )

    @app.get("/groups/{group_id}/periods/{period_id}/note-counts", tags=["Reflections"])
    async def note_counts(group_id: UUID, period_id: UUID, user: User, store: Database):
        """How many submitted notes each member has this week (for the globe). No content."""
        await membership(store, user, group_id)
        return await store.rpc(
            "period_note_counts_for",
            {"actor_id": str(user.id), "gid": str(group_id), "pid": str(period_id)},
            admin=True,
        )

    async def note_payload(
        store: Store, group_id: UUID, data: ReflectionWrite, user: Identity
    ) -> dict:
        payload = data.model_dump(exclude={"ai_consent"})
        if data.audio_path:
            path = audio_object_path(group_id, data.audio_path, user.id)
            audio = await store.request(
                "GET", f"/storage/v1/object/reflection-audio/{path}", admin=True
            )
            suffix = data.audio_path.rsplit(".", 1)[1]
            mime = next(k for k, v in MIME_TYPES.items() if v[1] == suffix)
            try:
                payload["audio_duration_seconds"] = await inspect_audio(
                    audio, mime, settings.ffprobe_path
                )
            except TimeoutError as exc:
                raise HTTPException(422, "Audio validation timed out; use text input") from exc
        return payload

    @app.post(
        "/groups/{group_id}/periods/{period_id}/reflections",
        status_code=201,
        tags=["Reflections"],
    )
    async def add_reflection(
        group_id: UUID, period_id: UUID, data: ReflectionWrite, user: User, store: Database
    ):
        """Add a note. People can add many per week (limits: 30 notes / 30 minutes of audio)."""
        await membership(store, user, group_id)
        payload = await note_payload(store, group_id, data, user)
        rows = await store.write(
            "POST",
            "reflections",
            {
                **payload,
                "group_id": str(group_id),
                "period_id": str(period_id),
                "user_id": str(user.id),
            },
            admin=True,
        )
        if not rows:
            raise HTTPException(409, "Note could not be saved; refresh and try again")
        return rows[0]

    @app.put("/groups/{group_id}/reflections/{reflection_id}", tags=["Reflections"])
    async def replace_reflection(
        group_id: UUID, reflection_id: UUID, data: ReflectionWrite, user: User, store: Database
    ):
        """Replace one of your notes (text, status, audio, location) while its week is open."""
        await membership(store, user, group_id)
        payload = await note_payload(store, group_id, data, user)
        rows = await store.write(
            "PATCH",
            "reflections",
            payload,
            admin=True,
            id=f"eq.{reflection_id}",
            group_id=f"eq.{group_id}",
            user_id=f"eq.{user.id}",
        )
        if not rows:
            raise HTTPException(404, "Note not found")
        return rows[0]

    @app.delete(
        "/groups/{group_id}/reflections/{reflection_id}", status_code=204, tags=["Reflections"]
    )
    async def delete_reflection(group_id: UUID, reflection_id: UUID, user: User, store: Database):
        await membership(store, user, group_id)
        await store.write(
            "DELETE",
            "reflections",
            admin=True,
            id=f"eq.{reflection_id}",
            group_id=f"eq.{group_id}",
            user_id=f"eq.{user.id}",
        )
        return Response(status_code=204)

    @app.post("/groups/{group_id}/audio", response_model=AudioResult, tags=["Audio"])
    async def upload_audio(
        group_id: UUID,
        user: User,
        store: Database,
        file: Annotated[UploadFile, File()],
        ai_consent: Annotated[bool, Form()] = False,
    ):
        await membership(store, user, group_id)
        if not ai_consent:
            raise HTTPException(422, "Consent to group sharing and AI processing is required")
        try:
            audio = await file.read(MAX_AUDIO_BYTES + 1)
        finally:
            await file.close()
        mime = (file.content_type or "").split(";", 1)[0].strip().lower()
        try:
            duration = await inspect_audio(audio, mime, settings.ffprobe_path)
        except TimeoutError as exc:
            raise HTTPException(422, "Audio validation timed out; use text input") from exc
        path = f"{group_id}/{user.id}/{uuid4()}.{MIME_TYPES[mime][1]}"
        await store.request(
            "POST",
            f"/storage/v1/object/reflection-audio/{path}",
            admin=True,
            content=audio,
            headers={"Content-Type": mime, "x-upsert": "false"},
        )
        try:
            transcript = await Gemini(settings, store.client).transcribe(audio, mime)
        except (HTTPException, ValidationError):
            return AudioResult(
                audio_path=path,
                audio_duration_seconds=duration,
                status="transcription_failed",
                detail="Transcription failed. Enter text manually; your audio is saved.",
            )
        return AudioResult(
            audio_path=path,
            audio_duration_seconds=duration,
            transcript=transcript,
            status="review_required",
            detail="Review and edit the transcript before submitting your reflection.",
        )

    @app.get("/groups/{group_id}/audio-url", tags=["Audio"])
    async def audio_url(group_id: UUID, path: str, user: User, store: Database):
        await membership(store, user, group_id)
        safe_path = audio_object_path(group_id, path)
        result = await store.request(
            "POST",
            f"/storage/v1/object/sign/reflection-audio/{safe_path}",
            admin=True,
            json={"expiresIn": 60},
        )
        return {"url": f"{settings.supabase_url}/storage/v1{result['signedURL']}", "expires_in": 60}

    @app.post("/groups/{group_id}/publish", status_code=202, tags=["Publishing"])
    async def publish(
        group_id: UUID,
        data: PublishRequest,
        background: BackgroundTasks,
        user: User,
        store: Database,
        jobs: Annotated[Jobs, Depends(get_jobs)],
    ):
        await membership(store, user, group_id, organizer=True)
        edition_id = await store.rpc(
            "close_issue",
            {"gid": str(group_id), "expected_period_id": str(data.period_id)},
            admin=True,
        )
        if edition_id:
            background.add_task(jobs.process_edition, edition_id)
        return {"edition_id": edition_id, "status": "queued" if edition_id else "empty"}

    @app.post(
        "/groups/{group_id}/editions/{edition_id}/retry", status_code=202, tags=["Publishing"]
    )
    async def retry(
        group_id: UUID,
        edition_id: UUID,
        background: BackgroundTasks,
        user: User,
        store: Database,
        jobs: Annotated[Jobs, Depends(get_jobs)],
    ):
        await membership(store, user, group_id, organizer=True)
        rows = await store.rows(
            "editions", admin=True, id=f"eq.{edition_id}", group_id=f"eq.{group_id}"
        )
        if not rows:
            raise HTTPException(404, "Edition not found")
        # Worker leases and next_attempt_at backoff still apply. Never reset a sent delivery.
        background.add_task(jobs.process_edition, str(edition_id))
        return {
            "edition_id": str(edition_id),
            "status": "queued",
            "detail": "Retry respects worker leases and backoff",
        }

    @app.get("/groups/{group_id}/editions", tags=["Editions"])
    async def editions(
        group_id: UUID,
        user: User,
        store: Database,
        limit: Annotated[int, Query(ge=1, le=100)] = 20,
        offset: Annotated[int, Query(ge=0)] = 0,
    ):
        await membership(store, user, group_id)
        return await store.rows(
            "editions",
            admin=True,
            group_id=f"eq.{group_id}",
            order="created_at.desc,id.desc",
            limit=str(limit),
            offset=str(offset),
            select=EDITION_FIELDS,
        )

    @app.get("/groups/{group_id}/editions/latest", tags=["Editions"])
    async def latest(group_id: UUID, user: User, store: Database):
        await membership(store, user, group_id)
        rows = await store.rows(
            "editions",
            admin=True,
            group_id=f"eq.{group_id}",
            status="eq.published",
            order="published_at.desc,id.desc",
            limit="1",
            select=EDITION_FIELDS,
        )
        if not rows:
            raise HTTPException(404, "No published edition yet")
        return rows[0]

    @app.get("/groups/{group_id}/editions/{edition_id}", tags=["Editions"])
    async def edition(group_id: UUID, edition_id: UUID, user: User, store: Database):
        await membership(store, user, group_id)
        rows = await store.rows(
            "editions",
            admin=True,
            group_id=f"eq.{group_id}",
            id=f"eq.{edition_id}",
            select=EDITION_FIELDS,
        )
        if not rows:
            raise HTTPException(404, "Edition not found")
        return rows[0]

    @app.get("/groups/{group_id}/editions/{edition_id}/email-preview", tags=["Editions"])
    async def email_preview(group_id: UUID, edition_id: UUID, user: User, store: Database):
        """The exact edition email this member would receive (subject, HTML and plain text)."""
        await membership(store, user, group_id)
        rows = await store.rows(
            "editions",
            admin=True,
            group_id=f"eq.{group_id}",
            id=f"eq.{edition_id}",
            status="eq.published",
            select="id,group_id,issue_number,content",
        )
        if not rows:
            raise HTTPException(404, "No published edition to preview")
        groups = await store.rows("groups", admin=True, id=f"eq.{group_id}", select="name")
        payload = email_payload(
            settings,
            {"recipient_email": user.email},
            rows[0],
            groups[0].get("name") if groups else None,
        )
        return {k: payload[k] for k in ("from", "to", "subject", "html", "text")}

    @app.get("/groups/{group_id}/editions/{edition_id}/delivery", tags=["Editions"])
    async def delivery_status(group_id: UUID, edition_id: UUID, user: User, store: Database):
        await membership(store, user, group_id)
        editions = await store.rows(
            "editions", admin=True, group_id=f"eq.{group_id}", id=f"eq.{edition_id}"
        )
        if not editions:
            raise HTTPException(404, "Edition not found")
        rows = await store.rows(
            "email_deliveries",
            admin=True,
            edition_id=f"eq.{edition_id}",
            user_id=f"eq.{user.id}",
            select="id,status,attempts,last_error,sent_at",
        )
        return rows[0] if rows else {"status": "not_enrolled"}

    @app.post("/internal/tick", tags=["Operations"])
    async def tick(
        jobs: Annotated[Jobs, Depends(get_jobs)],
        x_worker_secret: Annotated[str | None, Header()] = None,
        x_n8n_secret: Annotated[str | None, Header()] = None,
        batch_size: Annotated[int, Query(ge=1, le=10)] = 5,
    ):
        secret = settings.worker_secret.get_secret_value()
        x_worker_secret = x_worker_secret or x_n8n_secret
        if (
            not secret
            or not x_worker_secret
            or not hmac.compare_digest(secret.encode(), x_worker_secret.encode())
        ):
            raise HTTPException(401, "Invalid worker credentials")
        return await jobs.tick(batch_size)

    return app


app = create_app()
