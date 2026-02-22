"""
GestureHub Backend — Core Configuration
Reads all settings from environment variables with type safety and defaults.
"""
from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    """Central application configuration via Pydantic BaseSettings.

    All fields can be overridden by environment variables (case-insensitive).
    See backend/.env.example for a full list of supported variables.
    """

    # App
    app_name: str = "GestureHub"
    debug: bool = False

    # Redis
    redis_host: str = "localhost"
    redis_port: int = 6379
    redis_db: int = 0
    redis_password: str | None = None
    redis_ttl_seconds: int = 3600

    # CORS
    frontend_url: str = "http://localhost:5173"
    allowed_origins: List[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
    ]

    # Room
    max_players_per_room: int = 6
    room_code_length: int = 6
    ws_heartbeat_interval: int = 30

    # CV Pipeline — all tunable via .env
    gesture_confidence_threshold: float = 0.85
    gesture_smoothing_window: int = 3
    landmark_buffer_size: int = 10
    landmark_ema_alpha: float = 0.7  # higher = more responsive, lower = smoother

    class Config:  # noqa: D106
        env_file = ".env"
        case_sensitive = False


settings = Settings()
