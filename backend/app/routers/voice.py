"""
Voice Command Router — POST /api/voice/command

Accepts an audio blob from the browser MediaRecorder API,
transcribes it with Whisper (tiny, local), matches intent,
and returns a structured action the frontend can handle.
"""
from __future__ import annotations

from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel
from typing import Any

from app.nlp.whisper_engine import engine
from app.nlp.intent_matcher import match_intent

router = APIRouter(prefix="/api/voice", tags=["Voice"])


class VoiceCommandResponse(BaseModel):
    text: str
    intent: str
    confidence: float
    action: dict[str, Any]


@router.post("/command", response_model=VoiceCommandResponse)
async def voice_command(audio: UploadFile = File(...)) -> VoiceCommandResponse:
    """
    Accept an audio blob, transcribe via Whisper, classify intent.

    Returns structured action for the frontend to dispatch:
      - START_GAME  → { game_type: "chess" | "air_hockey" | ... }
      - CHANGE_BG   → { bgConfig: BackgroundConfig }
      - MUTE_MIC    → {}
      - UNMUTE_MIC  → {}
      - LEAVE_GAME  → {}
      - UNKNOWN     → {}
    """
    audio_bytes = await audio.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Empty audio file received.")

    if len(audio_bytes) > 10 * 1024 * 1024:  # 10MB safety guard
        raise HTTPException(status_code=413, detail="Audio file too large (max 10MB).")

    try:
        text = await engine.transcribe(audio_bytes)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transcription error: {e}")

    result = match_intent(text)

    return VoiceCommandResponse(
        text=text,
        intent=result.intent,
        confidence=result.confidence,
        action=result.action,
    )


@router.get("/status")
async def voice_status() -> dict:
    """Check whether the Whisper model is loaded and ready."""
    return {
        "model_ready": engine.model is not None,
        "model_name": "tiny",
    }
