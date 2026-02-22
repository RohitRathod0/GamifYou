"""
GestureHub Backend — End-to-End Gesture Pipeline

Orchestrates the full 5-stage CV pipeline for a single player session:

  Stage 1: LandmarkSmoother  — EMA on raw x,y,z coordinates
  Stage 2: GestureVocabulary — geometric gesture classification
  Stage 3: Confidence gate   — discard frames below threshold
  Stage 4: GestureBuffer     — require N consecutive matching frames
  Stage 5: Action mapper     — gesture → game_action string

Instantiate one GesturePipeline per player per game room.
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Dict, List, Optional

from app.core.config import settings
from app.cv.gesture_vocabulary import GestureLabel, GestureResult, GestureVocabulary
from app.cv.smoothing import GestureBuffer, LandmarkSmoother


@dataclass
class PipelineMetrics:
    """Accumulated CV performance metrics for one player session."""

    total_frames: int = 0
    classified_frames: int = 0
    stable_gestures_emitted: int = 0
    avg_processing_time_ms: float = 0.0
    gesture_distribution: Dict[str, int] = field(default_factory=dict)
    session_start: float = field(default_factory=time.time)

    def to_dict(self) -> Dict[str, object]:
        """Serialise metrics to a JSON-safe dict.

        Returns:
            Dict suitable for the /api/cv/metrics response.
        """
        uptime: float = time.time() - self.session_start
        return {
            "total_frames": self.total_frames,
            "classified_frames": self.classified_frames,
            "stable_gestures_emitted": self.stable_gestures_emitted,
            "classification_rate": round(
                self.classified_frames / max(self.total_frames, 1), 3
            ),
            "avg_processing_time_ms": round(self.avg_processing_time_ms, 3),
            "frames_per_second": round(self.total_frames / max(uptime, 1), 1),
            "gesture_distribution": self.gesture_distribution,
            "uptime_seconds": round(uptime, 1),
        }


# Maps stable gesture labels to game-agnostic action strings.
# Kept here so game logic only depends on action strings, not gesture internals.
_GESTURE_ACTION_MAP: Dict[GestureLabel, str] = {
    GestureLabel.OPEN_PALM: "CONTROL_ACTIVE",
    GestureLabel.CLOSED_FIST: "CONTROL_STOP",
    GestureLabel.POINTING: "DRAW",
    GestureLabel.PEACE_SIGN: "SPECIAL_ACTION",
    GestureLabel.THUMBS_UP: "CONFIRM",
    GestureLabel.PINCH: "PRECISION_CONTROL",
}


class GesturePipeline:
    """Full CV pipeline for a single player session.

    Thread-safety: not thread-safe by design — one pipeline per coroutine.
    Use a dict keyed by (room_code, player_id) for session isolation.
    """

    def __init__(self, player_id: str) -> None:
        """Initialise the pipeline for a player.

        Args:
            player_id: Unique identifier for this player, used in output dicts.
        """
        self.player_id: str = player_id

        self._vocabulary = GestureVocabulary(
            confidence_threshold=settings.gesture_confidence_threshold
        )
        self._smoother = LandmarkSmoother(alpha=settings.landmark_ema_alpha)
        self._gesture_buffer = GestureBuffer(
            window_size=settings.gesture_smoothing_window,
            min_confidence=settings.gesture_confidence_threshold,
        )
        self._metrics = PipelineMetrics()

    def process(self, raw_landmarks: List[Dict[str, float]]) -> Dict[str, object]:
        """Run the full 5-stage pipeline on one frame of hand landmarks.

        Args:
            raw_landmarks: List of 21 dicts, each with float keys 'x', 'y', 'z'.
                           Values should be normalised to [0, 1].

        Returns:
            Dict containing:
                player_id, raw_gesture, stable_gesture, confidence,
                finger_states, processing_time_ms, game_action
        """
        self._metrics.total_frames += 1

        # ── Stage 1: Smooth raw landmark coordinates ─────────────────────
        smoothed: List[Dict[str, float]] = self._smoother.smooth(raw_landmarks)

        # ── Stage 2: Classify gesture from smoothed landmarks ────────────
        result: GestureResult = self._vocabulary.classify(smoothed)

        # ── Stage 3: Update rolling average of processing time ────────────
        n: int = self._metrics.classified_frames
        self._metrics.avg_processing_time_ms = (
            self._metrics.avg_processing_time_ms * n + result.processing_time_ms
        ) / (n + 1)
        self._metrics.classified_frames += 1

        # ── Stage 4: Temporal buffer — require N-frame consensus ──────────
        stable_gesture: Optional[GestureLabel] = self._gesture_buffer.push(result)

        # ── Stage 5: Map stable gesture to game action ────────────────────
        game_action: Optional[str] = _GESTURE_ACTION_MAP.get(stable_gesture) if stable_gesture else None

        output: Dict[str, object] = {
            "player_id": self.player_id,
            "raw_gesture": result.label.value,
            "stable_gesture": stable_gesture.value if stable_gesture else None,
            "confidence": result.confidence,
            "finger_states": result.finger_states,
            "processing_time_ms": result.processing_time_ms,
            "game_action": game_action,
        }

        # Accumulate gesture distribution for session metrics
        if stable_gesture:
            self._metrics.stable_gestures_emitted += 1
            label_key: str = stable_gesture.value
            self._metrics.gesture_distribution[label_key] = (
                self._metrics.gesture_distribution.get(label_key, 0) + 1
            )

        return output

    def get_metrics(self) -> Dict[str, object]:
        """Return session-level CV performance metrics.

        Returns:
            Serialised PipelineMetrics dict.
        """
        return self._metrics.to_dict()

    def reset(self) -> None:
        """Reset pipeline state for a new game round."""
        self._smoother.reset()
        self._gesture_buffer.reset()
