import asyncio
import io
import subprocess
import sys
import wave

import pytest
from fastapi import HTTPException

from app.media import MAX_AUDIO_BYTES, inspect_audio


def wav(seconds=1):
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(8000)
        audio.writeframes(b"\0\0" * (8000 * seconds))
    return buffer.getvalue()


async def test_actual_audio_duration_is_validated():
    assert await inspect_audio(wav(), "audio/wav", "ffprobe") == pytest.approx(1)


async def test_long_audio_rejected_before_processing():
    with pytest.raises(HTTPException) as error:
        await inspect_audio(wav(181), "audio/wav", "ffprobe")
    assert error.value.status_code == 422


@pytest.mark.parametrize(
    "audio,mime,status",
    [
        (b"", "audio/wav", 413),
        (b"x" * (MAX_AUDIO_BYTES + 1), "audio/wav", 413),
        (b"not an audio file", "audio/wav", 422),
        (wav(), "audio/mpeg", 422),
        (wav(), "application/octet-stream", 415),
    ],
)
async def test_invalid_uploads(audio, mime, status):
    with pytest.raises(HTTPException) as error:
        await inspect_audio(audio, mime, "ffprobe")
    assert error.value.status_code == status


@pytest.mark.skipif(sys.platform != "win32", reason="Windows reload event-loop regression")
def test_audio_probe_works_with_windows_selector_loop():
    loop = asyncio.SelectorEventLoop()
    try:
        assert loop.run_until_complete(
            inspect_audio(wav(), "audio/wav", "ffprobe")
        ) == pytest.approx(1)
    finally:
        loop.close()


async def test_missing_probe_returns_actionable_service_error():
    with pytest.raises(HTTPException) as error:
        await inspect_audio(wav(), "audio/wav", "missing-ffprobe-executable")
    assert error.value.status_code == 503


async def test_probe_timeout_is_exposed_to_route(monkeypatch):
    def timeout(*args, **kwargs):
        raise subprocess.TimeoutExpired("ffprobe", 15)

    monkeypatch.setattr(subprocess, "run", timeout)
    with pytest.raises(TimeoutError):
        await inspect_audio(wav(), "audio/wav", "ffprobe")
