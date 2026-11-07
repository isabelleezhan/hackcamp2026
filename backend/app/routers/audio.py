from typing import Annotated

from fastapi import APIRouter, Depends, UploadFile
from pydantic import BaseModel

from ..deps import CurrentUser, audio_user
from ..services.transcription import MAX_AUDIO_BYTES, transcribe_audio, validate_audio

router = APIRouter(prefix="/audio", tags=["audio"])


class TranscriptionResponse(BaseModel):
    text: str


@router.post("/transcribe", response_model=TranscriptionResponse)
async def transcribe(file: UploadFile, user: Annotated[CurrentUser | None, Depends(audio_user)]):
    try:
        data = await file.read(MAX_AUDIO_BYTES + 1)
        mime_type = validate_audio(data, file.filename or "")
        return TranscriptionResponse(text=await transcribe_audio(data, mime_type))
    finally:
        await file.close()
