"""
GestureHub Backend — FastAPI Application Entry Point

Wires together:
  - CORS middleware (reads origins from Settings)
  - Redis connection lifecycle (startup / shutdown)
  - Routers: rooms, cv, websocket
"""
from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.database import db
from app.routers import cv, rooms, websocket


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Manage startup and shutdown lifecycle for the FastAPI application.

    Startup: connect to Redis.
    Shutdown: disconnect from Redis.
    """
    print("🚀 Starting GestureHub API...")
    await db.connect()
    yield
    print("🛑 Shutting down GestureHub API...")
    await db.disconnect()


# ── Application ───────────────────────────────────────────────────────────────

app = FastAPI(
    title=settings.app_name,
    description=(
        "Real-time multiplayer gesture-controlled gaming platform. "
        "Runs a 5-stage CV pipeline (smooth → classify → buffer → action) "
        "on MediaPipe hand landmarks streamed via WebSocket."
    ),
    version="1.0.0",
    debug=settings.debug,
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

# ── CORS ──────────────────────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────

app.include_router(rooms.router)
app.include_router(cv.router)
app.include_router(websocket.router)


# ── Health Endpoints ──────────────────────────────────────────────────────────


@app.get("/", tags=["Health"], summary="Root endpoint")
async def root() -> dict:
    """Return API welcome message and link to documentation.

    Returns:
        Dict with message, version, and docs URL.
    """
    return {
        "message": f"Welcome to {settings.app_name} API",
        "version": "1.0.0",
        "docs": "/docs",
        "status": "healthy",
    }


@app.get("/health", tags=["Health"], summary="Health check")
async def health_check() -> dict:
    """Liveness probe used by Render.com and Docker health checks.

    Returns:
        Dict with status 'healthy'.
    """
    return {"status": "healthy", "service": settings.app_name}


# ── Dev entrypoint ────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
    )