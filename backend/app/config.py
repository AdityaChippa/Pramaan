"""Configuration via pydantic-settings with explicit, named startup errors."""
from __future__ import annotations

from functools import lru_cache

from pydantic import Field, ValidationError
from pydantic_settings import BaseSettings, SettingsConfigDict


class AnalysisSettings(BaseSettings):
    """Parameters of the forensic pipeline. No external services required (used by training too)."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    MAX_UPLOAD_MB: float = 50
    MAX_VIDEO_SECONDS: float = 60
    VIDEO_SAMPLE_FRAMES: int = 32
    TEMPORAL_FPS: float = 15
    UNIVFD_OCCLUSION_GRID: int = 7
    MODEL_CACHE_DIR: str = "/tmp/pramaan-models"


class EngineSettings(AnalysisSettings):
    SUPABASE_URL: str = Field(..., min_length=10)
    SUPABASE_SERVICE_ROLE_KEY: str = Field(..., min_length=20)
    ENGINE_SHARED_SECRET: str = Field(..., min_length=16)
    ALLOWED_ORIGINS: str = ""
    MAX_CONCURRENT_JOBS: int = 1
    LIVE_CHUNK_TTL_HOURS: float = 24

    @property
    def origins(self) -> list[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]


class ConfigError(RuntimeError):
    pass


@lru_cache(maxsize=1)
def get_settings() -> EngineSettings:
    try:
        return EngineSettings()  # type: ignore[call-arg]
    except ValidationError as exc:
        names = ", ".join(str(e["loc"][0]) for e in exc.errors())
        raise ConfigError(
            f"Engine configuration invalid or missing: {names}. "
            "Set them in backend/.env (local) or as Hugging Face Space secrets."
        ) from exc
