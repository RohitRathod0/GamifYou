"""
GestureHub Backend — Computer Vision REST Router

Exposes the gesture pipeline via HTTP endpoints for:
1. Frame analysis (POST /api/cv/analyze)
2. Session metrics  (GET  /api/cv/metrics/{player_id})
3. Gesture vocabulary  (GET  /api/cv/vocabulary)
4. Hand calibration   (POST /api/cv/calibrate)

Design: One GesturePipeline instance per (room_code, player_id) pair,
stored in an in-memory dict. For multi-instance production, replace
_pipelines with a Redis-backed session store.
"""
from __future__ import annotations

from typing import Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.cv.gesture_vocabulary import GestureLabel
from app.services.gesture_pipeline import GesturePipeline

router = APIRouter(prefix="/api/cv", tags=["Computer Vision"])

# In-memory pipeline registry keyed by "room_code:player_id"
_pipelines: Dict[str, GesturePipeline] = {}


# ── Pydantic Schemas ──────────────────────────────────────────────────────────


class LandmarkPoint(BaseModel):
    """Single normalised hand landmark from MediaPipe."""

    x: float = Field(..., ge=0.0, le=1.0, description="Normalised x coordinate [0, 1]")
    y: float = Field(..., ge=0.0, le=1.0, description="Normalised y coordinate [0, 1]")
    z: float = Field(..., description="Depth relative to wrist landmark (can be negative)")


class AnalyzeRequest(BaseModel):
    """Request body for POST /api/cv/analyze."""

    player_id: str = Field(..., min_length=1, description="Unique player identifier")
    room_code: str = Field(..., min_length=4, max_length=10, description="Room code")
    landmarks: List[LandmarkPoint] = Field(
        ...,
        min_length=21,
        max_length=21,
        description="Exactly 21 MediaPipe hand landmarks",
    )
    handedness: str = Field(
        default="Right",
        pattern="^(Left|Right)$",
        description="Detected hand side from MediaPipe",
    )
    frame_timestamp_ms: Optional[float] = Field(
        default=None, description="Client-side timestamp for latency tracking"
    )

    model_config = {
        "json_schema_extra": {
            "example": {
                "player_id": "player-abc123",
                "room_code": "ABCD12",
                "landmarks": [{"x": 0.5, "y": 0.8, "z": 0.0}],
                "handedness": "Right",
                "frame_timestamp_ms": 1700000000000,
            }
        }
    }


class AnalyzeResponse(BaseModel):
    """Response from POST /api/cv/analyze."""

    player_id: str
    raw_gesture: str = Field(description="Gesture detected in this single frame")
    stable_gesture: Optional[str] = Field(
        None, description="Gesture confirmed across smoothing window, or null"
    )
    confidence: float = Field(description="Classifier confidence for raw_gesture")
    finger_states: Dict[str, bool] = Field(description="Per-finger extension state")
    processing_time_ms: float = Field(description="CV pipeline latency for this frame")
    game_action: Optional[str] = Field(
        None, description="Game-agnostic action string mapped from stable_gesture"
    )


class CalibrateRequest(BaseModel):
    """Request body for POST /api/cv/calibrate."""

    player_id: str = Field(..., min_length=1)
    room_code: str = Field(..., min_length=4, max_length=10)
    baseline_landmarks: List[LandmarkPoint] = Field(
        ..., min_length=21, max_length=21,
        description="Open-palm landmarks used to normalise hand size",
    )


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.post(
    "/analyze",
    response_model=AnalyzeResponse,
    summary="Analyse one frame of hand landmarks",
    description=(
        "Run the full 5-stage CV pipeline on a single frame. "
        "Returns the classified gesture, confidence, and game action. "
        "If no stable gesture is confirmed yet, stable_gesture and game_action are null."
    ),
)
async def analyze_landmarks(request: AnalyzeRequest) -> AnalyzeResponse:
    """Run the gesture pipeline for one landmark frame.

    Args:
        request: AnalyzeRequest with player_id, room_code, and 21 landmarks.

    Returns:
        AnalyzeResponse with gesture classification and game action.
    """
    pipeline_key: str = f"{request.room_code}:{request.player_id}"
    if pipeline_key not in _pipelines:
        _pipelines[pipeline_key] = GesturePipeline(request.player_id)

    raw: List[Dict[str, float]] = [
        {"x": lm.x, "y": lm.y, "z": lm.z} for lm in request.landmarks
    ]

    result: Dict[str, object] = _pipelines[pipeline_key].process(raw)
    return AnalyzeResponse(**result)  # type: ignore[arg-type]


@router.get(
    "/metrics/{player_id}",
    summary="Get CV session metrics for a player",
    description="Returns accumulated performance statistics for an active player session.",
)
async def get_player_metrics(
    player_id: str,
    room_code: str = Query(..., min_length=4, max_length=10, description="Room code"),
) -> Dict[str, object]:
    """Return CV pipeline metrics for a player session.

    Args:
        player_id: The player's unique identifier.
        room_code: Room the player is in.

    Returns:
        A dict with frame counts, FPS, average latency, and gesture distribution.

    Raises:
        HTTPException 404: If no active session exists for this player+room.
    """
    key: str = f"{room_code}:{player_id}"
    if key not in _pipelines:
        raise HTTPException(
            status_code=404, detail="No active CV session for this player in this room."
        )
    return _pipelines[key].get_metrics()


@router.get(
    "/vocabulary",
    summary="List all supported gestures",
    description="Returns the full gesture vocabulary with descriptions and confidence thresholds.",
)
async def get_gesture_vocabulary() -> Dict[str, object]:
    """Return the gesture vocabulary supported by the CV pipeline.

    Returns:
        Dict containing the gesture list and pipeline configuration.
    """
    gesture_descriptions: Dict[GestureLabel, str] = {
        GestureLabel.OPEN_PALM: "All 5 fingers extended — movement / paddle control",
        GestureLabel.CLOSED_FIST: "All fingers curled — stop / grab",
        GestureLabel.POINTING: "Index finger only extended — draw / aim",
        GestureLabel.PEACE_SIGN: "Index + middle extended — special action / power-up",
        GestureLabel.THUMBS_UP: "Thumb extended upward, others curled — confirm / ready",
        GestureLabel.PINCH: "Thumb and index tip < 5% normalised distance — precision control",
        GestureLabel.UNKNOWN: "Ambiguous pose — no action emitted",
    }
    return {
        "gestures": [
            {"label": gesture.value, "description": desc}
            for gesture, desc in gesture_descriptions.items()
        ],
        "confidence_threshold": 0.85,
        "smoothing_window_frames": 3,
        "pipeline_stages": [
            "LandmarkSmoother (EMA α=0.7)",
            "GestureVocabulary.classify() (rule-based)",
            "Confidence gate (≥0.85)",
            "GestureBuffer (3-frame consensus)",
            "Action mapper (gesture → game_action)",
        ],
    }


@router.post(
    "/calibrate",
    summary="Calibrate hand normalization for a player",
    description=(
        "Accept an open-palm landmark frame to set this player's baseline hand size. "
        "Resets the pipeline's smoothing state for a clean session start."
    ),
)
async def calibrate_player(request: CalibrateRequest) -> Dict[str, str]:
    """Calibrate or reset the pipeline for a player.

    Args:
        request: CalibrateRequest with player_id, room_code, and open-palm landmarks.

    Returns:
        A confirmation message.
    """
    pipeline_key: str = f"{request.room_code}:{request.player_id}"
    # Reset or create a fresh pipeline — calibration clears stale smoothing state
    _pipelines[pipeline_key] = GesturePipeline(request.player_id)

    return {
        "status": "calibrated",
        "player_id": request.player_id,
        "room_code": request.room_code,
        "message": "Pipeline reset. Hand size calibration will be applied in a future version.",
    }
