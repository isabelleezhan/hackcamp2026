from app.config import Settings


def test_scaffold_environment_names_remain_supported(monkeypatch):
    monkeypatch.setenv("RESEND_FROM_EMAIL", "news@example.invalid")
    monkeypatch.setenv("N8N_WEBHOOK_SECRET", "test-legacy-worker")
    monkeypatch.setenv("APP_URL", "https://newspaper.example.invalid")
    monkeypatch.setenv("CORS_ORIGINS", "http://localhost:5173, https://newspaper.example.invalid/")
    settings = Settings(_env_file=None)
    assert settings.email_from == "news@example.invalid"
    assert settings.worker_secret.get_secret_value() == "test-legacy-worker"
    assert settings.frontend_url == "https://newspaper.example.invalid"
    assert settings.cors_origins == ["http://localhost:5173", "https://newspaper.example.invalid"]


def test_json_cors_origins_remain_supported(monkeypatch):
    monkeypatch.setenv("CORS_ORIGINS", '["http://localhost:5173"]')
    assert Settings(_env_file=None).cors_origins == ["http://localhost:5173"]
