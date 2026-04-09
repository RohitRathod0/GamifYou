from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List, Optional


class Settings(BaseSettings):
    # App
    app_name: str = "GestureHub API"
    debug: bool = True

    # Frontend
    frontend_url: str

    # CORS
    allowed_origins: List[str] = ["*"]

    # MongoDB
    mongo_url: str

    # JWT
    secret_key: str
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60

    # Redis
    redis_host: str
    redis_port: int
    redis_db: int
    redis_password: Optional[str] = None

    # Room
    max_players_per_room: int = 6
    room_code_length: int = 6

    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=False,
    )


settings = Settings()