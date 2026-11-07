import asyncio
import json
import math
import tempfile
from pathlib import Path

from fastapi import HTTPException

MAX_AUDIO_BYTES = 10 * 1024 * 1024
MAX_AUDIO_SECONDS = 180  # keep in sync with 0003_notes_location.sql and AGENTS.md
MIME_TYPES = {
    "audio/webm": ("webm", "webm"),
    "audio/ogg": ("ogg", "ogg"),
    "audio/mpeg": ("mp3", "mp3"),
    "audio/mp4": ("mp4", "m4a"),
    "audio/wav": ("wav", "wav"),
    "audio/x-wav": ("wav", "wav"),
    "audio/aac": ("aac", "aac"),
}


async def inspect_audio(data: bytes, mime: str, ffprobe_path: str) -> float:
    if not data or len(data) > MAX_AUDIO_BYTES:
        raise HTTPException(413, "Audio must be nonempty and no larger than 10 MB")
    if mime not in MIME_TYPES:
        raise HTTPException(415, "Accepted formats: WebM, Ogg, MP3, M4A, WAV and AAC audio")
    with tempfile.TemporaryDirectory(prefix="newspaper-audio-") as directory:
        path = Path(directory) / "upload"
        path.write_bytes(data)
        try:
            process = await asyncio.create_subprocess_exec(
                ffprobe_path,
                "-v",
                "error",
                "-protocol_whitelist",
                "file,pipe",
                "-format_whitelist",
                "matroska,webm,ogg,mp3,mov,wav,aac",
                "-show_entries",
                "stream=codec_type,codec_name:format=format_name,duration:packet=pts_time,duration_time",
                "-show_packets",
                "-of",
                "json",
                str(path),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
        except FileNotFoundError as exc:
            raise HTTPException(503, "Audio validation is unavailable; use text input") from exc
        try:
            stdout, _ = await asyncio.wait_for(process.communicate(), timeout=15)
        except (TimeoutError, asyncio.CancelledError):
            process.kill()
            await process.communicate()
            raise
        if process.returncode:
            raise HTTPException(422, "Audio could not be decoded")
        try:
            info = json.loads(stdout)
            streams = info.get("streams", [])
            if not streams or any(s.get("codec_type") != "audio" for s in streams):
                raise ValueError("Only audio streams are accepted")
            formats = set(info["format"]["format_name"].split(","))
            if MIME_TYPES[mime][0] not in formats:
                raise ValueError("Declared audio type does not match file")
            durations = [float(info["format"].get("duration", 0))]
            packets = info.get("packets", [])
            points = [float(p["pts_time"]) for p in packets if "pts_time" in p]
            ends = [
                float(p["pts_time"]) + float(p.get("duration_time", 0))
                for p in packets
                if "pts_time" in p
            ]
            if points:
                durations.append(max(ends) - min(points))
            duration = max(durations)
            if not math.isfinite(duration) or duration <= 0 or duration > MAX_AUDIO_SECONDS:
                raise ValueError(f"Audio must be at most {MAX_AUDIO_SECONDS} seconds long")
            return duration
        except (ValueError, KeyError, TypeError) as exc:
            raise HTTPException(
                422, f"Invalid audio format or duration; maximum {MAX_AUDIO_SECONDS // 60} minutes"
            ) from exc
