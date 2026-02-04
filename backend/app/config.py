from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    # App settings
    APP_NAME: str = "GestureHub API"
    DEBUG: bool = True
    
    # CORS settings - THIS PREVENTS CORS ERRORS
    FRONTEND_URL: str = "http://localhost:5173"  # Vite default
    ALLOWED_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
    ]
    
    # Redis settings
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379
    REDIS_DB: int = 0
    REDIS_PASSWORD: str | None = None
    
    # WebSocket settings
    WS_HEARTBEAT_INTERVAL: int = 30  # seconds
    
    # Room settings
    MAX_PLAYERS_PER_ROOM: int = 6
    ROOM_CODE_LENGTH: int = 6
    
    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()