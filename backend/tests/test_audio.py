import io
import unittest
import wave
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException
from fastapi.testclient import TestClient
from google.genai import errors, types
from pydantic import SecretStr

from app.config import Settings
from app.deps import CurrentUser, audio_user
from app.main import app, create_app
from app.services.transcription import MAX_AUDIO_BYTES, transcribe_audio, validate_audio


def wav_clip(seconds=1):
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(8000)
        audio.writeframes(b"\0\0" * (8000 * seconds))
    return buffer.getvalue()


class AudioTests(unittest.TestCase):
    def test_valid_wav(self):
        self.assertEqual(validate_audio(wav_clip(), "reflection.wav"), "audio/wav")

    def test_upload_validation(self):
        for data, name, status in [
            (b"", "empty.wav", 400),
            (b"not audio", "fake.wav", 422),
            (b"text", "notes.txt", 415),
            (b"x" * (MAX_AUDIO_BYTES + 1), "large.wav", 413),
            (wav_clip(181), "long.wav", 422),
        ]:
            with self.subTest(name=name):
                with self.assertRaises(HTTPException) as raised:
                    validate_audio(data, name)
                self.assertEqual(raised.exception.status_code, status)

    def test_auth_required(self):
        with TestClient(create_app(Settings(_env_file=None, supabase_anon_key="test"))) as client:
            response = client.post(
                "/audio/transcribe", files={"file": ("test.wav", wav_clip(), "audio/wav")}
            )
        self.assertEqual(response.status_code, 401)

    def test_authenticated_upload_returns_transcript(self):
        app.dependency_overrides[audio_user] = lambda: CurrentUser(
            id="00000000-0000-4000-8000-000000000001",
            subject="00000000-0000-4000-8000-000000000001",
            token="test-token",
            email="test@example.com",
        )
        try:
            with patch("app.routers.audio.transcribe_audio", new_callable=AsyncMock) as transcribe:
                transcribe.return_value = "This week I visited my family."
                with TestClient(app) as client:
                    data = wav_clip()
                    response = client.post(
                        "/audio/transcribe", files={"file": ("test.wav", data, "audio/wav")}
                    )
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json(), {"text": "This week I visited my family."})
                transcribe.assert_awaited_once_with(data, "audio/wav")
        finally:
            app.dependency_overrides.clear()

    def test_upload_requires_supabase_even_without_supabase_anon_key(self):
        with TestClient(create_app(Settings(_env_file=None, supabase_anon_key=""))) as client:
            response = client.post(
                "/audio/transcribe", files={"file": ("test.wav", wav_clip(), "audio/wav")}
            )
        self.assertEqual(response.status_code, 401)


class GeminiErrorTests(unittest.IsolatedAsyncioTestCase):
    async def test_reads_audio_transcription_parts(self):
        settings = SimpleNamespace(
            gemini_api_key=SecretStr("test-secret-key"),
            gemini_transcription_model="gemini-3.5-transcribe",
        )
        response = types.GenerateContentResponse(
            candidates=[
                types.Candidate(
                    content=types.Content(
                        parts=[
                            types.Part(
                                audio_transcription=types.Transcription(
                                    text="How old is the Brooklyn Bridge?"
                                )
                            )
                        ]
                    )
                )
            ]
        )
        client = MagicMock()
        client.models.generate_content = AsyncMock(return_value=response)
        context = AsyncMock()
        context.__aenter__.return_value = client
        with (
            patch("app.services.transcription.get_settings", return_value=settings),
            patch("app.services.transcription.genai.Client") as create_client,
        ):
            create_client.return_value.aio = context
            text = await transcribe_audio(b"audio", "audio/wav")
        self.assertEqual(text, "How old is the Brooklyn Bridge?")

    async def test_uses_v1beta_and_returns_transcript(self):
        settings = SimpleNamespace(
            gemini_api_key=SecretStr("test-secret-key"),
            gemini_transcription_model="gemini-3.5-transcribe",
        )
        client = MagicMock()
        client.models.generate_content = AsyncMock(
            return_value=SimpleNamespace(text="A week with family.")
        )
        context = AsyncMock()
        context.__aenter__.return_value = client
        with (
            patch("app.services.transcription.get_settings", return_value=settings),
            patch("app.services.transcription.genai.Client") as create_client,
        ):
            create_client.return_value.aio = context
            text = await transcribe_audio(b"audio", "audio/wav")
        self.assertEqual(text, "A week with family.")
        self.assertEqual(create_client.call_args.kwargs["http_options"].api_version, "v1beta")
        self.assertEqual(
            client.models.generate_content.call_args.kwargs["model"], "gemini-3.5-transcribe"
        )
        self.assertNotIn("config", client.models.generate_content.call_args.kwargs)

    async def test_provider_errors_are_actionable_and_do_not_expose_keys(self):
        settings = SimpleNamespace(
            gemini_api_key=SecretStr("test-secret-key"),
            gemini_transcription_model="gemini-3.5-transcribe",
        )
        for code, expected_status, message in [
            (404, 502, "model"),
            (403, 502, "access"),
            (400, 502, "rejected"),
            (429, 429, "quota"),
            (503, 503, "high demand"),
        ]:
            with self.subTest(code=code):
                provider_error = errors.APIError(code, {"error": {"message": "test-secret-key"}})
                with (
                    patch("app.services.transcription.get_settings", return_value=settings),
                    patch("app.services.transcription.genai.Client", side_effect=provider_error),
                ):
                    with self.assertRaises(HTTPException) as raised:
                        await transcribe_audio(b"audio", "audio/wav")
                self.assertEqual(raised.exception.status_code, expected_status)
                self.assertIn(message, raised.exception.detail)
                self.assertNotIn(
                    settings.gemini_api_key.get_secret_value(), raised.exception.detail
                )


class FallbackTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.settings = SimpleNamespace(
            gemini_api_key=SecretStr("test-secret-key"),
            gemini_transcription_model="gemini-3.5-transcribe",
            gemini_fallback_models="gemini-3.8-flash,gemini-3.5-flash-lite",
        )
        self.generate = AsyncMock()
        self.client = MagicMock()
        self.client.models.generate_content = self.generate
        self.context = AsyncMock()
        self.context.__aenter__.return_value = self.client

    async def call_transcription(self, results):
        self.generate.side_effect = results
        with (
            patch("app.services.transcription.get_settings", return_value=self.settings),
            patch("app.services.transcription.genai.Client") as create_client,
        ):
            create_client.return_value.aio = self.context
            return await transcribe_audio(b"audio", "audio/wav")

    def model_order(self):
        return [call.kwargs["model"] for call in self.generate.await_args_list]

    async def test_primary_success_does_not_call_backups(self):
        text = await self.call_transcription([SimpleNamespace(text="My week.")])
        self.assertEqual(text, "My week.")
        self.assertEqual(self.model_order(), ["gemini-3.5-transcribe"])
        self.assertNotIn("config", self.generate.call_args.kwargs)

    async def test_rate_limit_switches_to_flash_with_transcription_prompt(self):
        text = await self.call_transcription(
            [
                errors.APIError(429, {"error": {"message": "rate limit"}}),
                SimpleNamespace(text="A weekend with family."),
            ]
        )
        self.assertEqual(text, "A weekend with family.")
        self.assertEqual(self.model_order(), ["gemini-3.5-transcribe", "gemini-3.8-flash"])
        self.assertIn("Transcribe", self.generate.call_args.kwargs["config"].system_instruction)

    async def test_rate_limit_then_server_error_uses_last_backup(self):
        text = await self.call_transcription(
            [
                errors.APIError(429, {}),
                errors.APIError(503, {}),
                SimpleNamespace(text="My plans for next week."),
            ]
        )
        self.assertEqual(text, "My plans for next week.")
        self.assertEqual(
            self.model_order(),
            ["gemini-3.5-transcribe", "gemini-3.8-flash", "gemini-3.5-flash-lite"],
        )

    async def test_unavailable_model_uses_backup(self):
        await self.call_transcription([errors.APIError(404, {}), SimpleNamespace(text="Hello.")])
        self.assertEqual(len(self.model_order()), 2)

    async def test_all_rate_limited_returns_429_after_one_call_per_model(self):
        with self.assertRaises(HTTPException) as raised:
            await self.call_transcription([errors.APIError(429, {}) for _ in range(3)])
        self.assertEqual(raised.exception.status_code, 429)
        self.assertEqual(len(self.model_order()), 3)

    async def test_all_unavailable_returns_503(self):
        with self.assertRaises(HTTPException) as raised:
            await self.call_transcription([errors.APIError(code, {}) for code in (503, 500, 404)])
        self.assertEqual(raised.exception.status_code, 503)

    async def test_invalid_request_or_credentials_do_not_try_backups(self):
        for code in (400, 401, 403):
            with self.subTest(code=code):
                self.generate.reset_mock()
                with self.assertRaises(HTTPException):
                    await self.call_transcription([errors.APIError(code, {})])
                self.assertEqual(self.model_order(), ["gemini-3.5-transcribe"])

    async def test_empty_transcript_does_not_try_backups(self):
        with self.assertRaises(HTTPException) as raised:
            await self.call_transcription([SimpleNamespace(text="")])
        self.assertEqual(raised.exception.status_code, 422)
        self.assertEqual(len(self.model_order()), 1)

    async def test_duplicate_models_are_only_tried_once(self):
        self.settings.gemini_fallback_models = (
            " gemini-3.5-transcribe, ,gemini-3.8-flash,gemini-3.8-flash "
        )
        await self.call_transcription([errors.APIError(429, {}), SimpleNamespace(text="Hello.")])
        self.assertEqual(self.model_order(), ["gemini-3.5-transcribe", "gemini-3.8-flash"])

    async def test_empty_backup_list_disables_fallbacks(self):
        self.settings.gemini_fallback_models = ""
        with self.assertRaises(HTTPException) as raised:
            await self.call_transcription([errors.APIError(429, {})])
        self.assertEqual(raised.exception.status_code, 429)
        self.assertEqual(len(self.model_order()), 1)


if __name__ == "__main__":
    unittest.main()
