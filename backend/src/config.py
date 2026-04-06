import os
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from pydantic import BaseModel, Field


BACKEND_DIR = Path(__file__).resolve().parent.parent
ROOT_DIR = BACKEND_DIR.parent

load_dotenv(ROOT_DIR / ".env")
load_dotenv(BACKEND_DIR / ".env", override=False)


class Settings(BaseModel):
    app_name: str = Field(default=os.getenv("APP_NAME", "level-up-journey-backend"))
    app_host: str = Field(default=os.getenv("APP_HOST", "0.0.0.0"))
    app_port: int = Field(default=int(os.getenv("APP_PORT", "8000")))
    gemini_model: str = Field(default=os.getenv("GEMINI_MODEL", "gemini-2.5-flash"))
    google_api_key: str | None = Field(default=os.getenv("GOOGLE_API_KEY"))
    database_url: str = Field(
        default=os.getenv(
            "DATABASE_URL",
            "postgresql+psycopg2://levelup:levelup@localhost:5432/level_up_journey",
        )
    )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()

