"""
GestureHub Backend — Temporal Smoothing for Gesture Recognition

Two complementary smoothing strategies:

1. LandmarkSmoother — Exponential Moving Average (EMA) on raw x,y,z coordinates.
   Reduces high-frequency jitter in the landmark stream before classification.

2. GestureBuffer — Sliding window consensus vote on classified gesture labels.
   Only emits a confirmed gesture when the same label appears across N consecutive
   high-confidence frames, eliminating single-frame misclassifications.
"""
from __future__ import annotations

from collections import Counter, deque
from typing import Dict, List, Optional

from app.cv.gesture_vocabulary import GestureLabel, GestureResult


class LandmarkSmoother:
    """Exponential Moving Average smoothing over raw landmark coordinates.

    Formula: smoothed[t] = α * raw[t] + (1-α) * smoothed[t-1]

    Higher alpha (closer to 1.0) = more responsive but jitterier.
    Lower alpha (closer to 0.0)  = smoother but adds lag.
    Recommended range: 0.5 – 0.8.
    """

    def __init__(self, alpha: float = 0.7) -> None:
        """Initialise smoother.

        Args:
            alpha: EMA weight for the current frame. Default 0.7.
        """
        self.alpha: float = alpha
        self._smoothed: Optional[List[Dict[str, float]]] = None

    def smooth(self, landmarks: List[Dict[str, float]]) -> List[Dict[str, float]]:
        """Apply EMA smoothing to a 21-landmark frame.

        Args:
            landmarks: List of 21 dicts with keys 'x', 'y', 'z'.

        Returns:
            Smoothed landmark list with same structure.
        """
        if self._smoothed is None:
            # First frame: no history yet, pass through unchanged
            self._smoothed = landmarks
            return landmarks

        result: List[Dict[str, float]] = []
        for i, lm in enumerate(landmarks):
            result.append(
                {
                    "x": self.alpha * lm["x"] + (1 - self.alpha) * self._smoothed[i]["x"],
                    "y": self.alpha * lm["y"] + (1 - self.alpha) * self._smoothed[i]["y"],
                    "z": self.alpha * lm["z"] + (1 - self.alpha) * self._smoothed[i]["z"],
                }
            )
        self._smoothed = result
        return result

    def reset(self) -> None:
        """Clear smoothing history (e.g. on new game session or hand loss)."""
        self._smoothed = None


class GestureBuffer:
    """Sliding window consensus filter for gesture label stability.

    Prevents gesture flickering by only emitting an event when the
    same gesture label appears in ALL frames of the window.

    A new stable gesture is emitted only when it differs from the
    previously emitted gesture, avoiding duplicate fire events.
    """

    def __init__(self, window_size: int = 3, min_confidence: float = 0.85) -> None:
        """Initialise the buffer.

        Args:
            window_size: Number of consecutive frames required for consensus.
            min_confidence: Frames below this confidence are excluded from
                            the buffer and don't count toward the window.
        """
        self.window_size: int = window_size
        self.min_confidence: float = min_confidence
        self._buffer: deque[GestureLabel] = deque(maxlen=window_size)
        self.last_stable_gesture: Optional[GestureLabel] = None

    def push(self, result: GestureResult) -> Optional[GestureLabel]:
        """Add a classified frame and check for consensus.

        Low-confidence frames are silently ignored — they reset the
        window implicitly by not filling it.

        Args:
            result: Output from GestureVocabulary.classify().

        Returns:
            A stable GestureLabel if unanimous consensus is reached,
            or None if more frames are needed.
        """
        if result.confidence >= self.min_confidence:
            self._buffer.append(result.label)

        if len(self._buffer) == self.window_size:
            return self._get_consensus()
        return None

    def _get_consensus(self) -> Optional[GestureLabel]:
        """Check whether all buffered frames agree on a single gesture.

        Returns:
            The unanimous label if all window_size frames match,
            otherwise None.
        """
        counts = Counter(self._buffer)
        most_common_label, count = counts.most_common(1)[0]

        # Require unanimity (all window_size frames must agree)
        if count == self.window_size and most_common_label != self.last_stable_gesture:
            self.last_stable_gesture = most_common_label
            return most_common_label
        return None

    def reset(self) -> None:
        """Clear buffer and stable gesture state."""
        self._buffer.clear()
        self.last_stable_gesture = None
