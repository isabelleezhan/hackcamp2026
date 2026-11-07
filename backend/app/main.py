from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .deps import CurrentUser, current_user

app = FastAPI(title="Community Newspaper API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origin_list,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/me")
def me(user: CurrentUser = Depends(current_user)):
    """Handy for checking frontend auth end to end."""
    return {"id": user.id, "email": user.email}
