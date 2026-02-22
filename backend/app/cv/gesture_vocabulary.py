"""
GestureHub Backend — Gesture Vocabulary

Converts raw MediaPipe hand landmarks (21 keypoints, normalised 0-1)
into named gesture labels using geometric rules.

Design notes
------------
* The `classify()` method is the single integration point.  Swap the body
  for a trained MLP without touching any other code (see ADR-003).
* Finger extension logic: a finger is extended when its TIP y-coordinate
  is ABOVE (smaller y) its PIP joint.  Thumb uses x-axis comparison to
  account for lateral orientation.
* Pinch is detected via Euclidean distance in normalised space (<0.05).
"""
from __future__ import annotations

import math
import time
from dataclasses import dataclass
from enum import Enum
from typing import Dict, List, Tuple


class GestureLabel(str, Enum):
    """Named gesture labels emitted by the classification pipeline."""

    OPEN_PALM = "OPEN_PALM"
    CLOSED_FIST = "CLOSED_FIST"
    POINTING = "POINTING"
    PEACE_SIGN = "PEACE_SIGN"
    THUMBS_UP = "THUMBS_UP"
    PINCH = "PINCH"
    UNKNOWN = "UNKNOWN"


@dataclass
class Landmark:
    """Single hand landmark with normalised coordinates."""

    x: float
    y: float
    z: float


@dataclass
class GestureResult:
    """Output of the gesture classification stage."""

    label: GestureLabel
    confidence: float
    finger_states: Dict[str, bool]  # which fingers are extended
    landmarks_used: int
    processing_time_ms: float


class GestureVocabulary:
    """Rule-based gesture classifier using 21 MediaPipe hand landmarks.

    MediaPipe landmark indices (right-hand canonical):
        0  = WRIST
        1-4  = Thumb  (CMC, MCP, IP, TIP)
        5-8  = Index  (MCP, PIP, DIP, TIP)
        9-12 = Middle (MCP, PIP, DIP, TIP)
        13-16= Ring   (MCP, PIP, DIP, TIP)
        17-20= Pinky  (MCP, PIP, DIP, TIP)
    """

    # ── Landmark indices ──────────────────────────────────────────────────
    WRIST: int = 0

    THUMB_TIP: int = 4
    THUMB_IP: int = 3
    THUMB_MCP: int = 2

    INDEX_TIP: int = 8
    INDEX_PIP: int = 6

    MIDDLE_TIP: int = 12
    MIDDLE_PIP: int = 10

    RING_TIP: int = 16
    RING_PIP: int = 14

    PINKY_TIP: int = 20
    PINKY_PIP: int = 18

    # Pinch threshold: normalised distance between thumb-tip and index-tip
    PINCH_THRESHOLD: float = 0.05

    def __init__(self, confidence_threshold: float = 0.85) -> None:
        """Initialise the vocabulary with a minimum confidence threshold.

        Args:
            confidence_threshold: Results below this value will be overridden
                to UNKNOWN by the pipeline's confidence stage.
        """
        self.confidence_threshold = confidence_threshold

    def classify(self, landmarks: List[Dict[str, float]]) -> GestureResult:
        """Classify one frame of hand landmarks into a GestureResult.

        Args:
            landmarks: List of 21 dicts, each with keys 'x', 'y', 'z'.
                       Values should be normalised to [0, 1].

        Returns:
            GestureResult with label, confidence, and per-finger states.
        """
        start: float = time.perf_counter()

        lm: List[Landmark] = [Landmark(**point) for point in landmarks]
        finger_states: Dict[str, bool] = self._get_finger_states(lm)
        label, confidence = self._match_gesture(finger_states, lm)

        elapsed_ms: float = (time.perf_counter() - start) * 1000

        return GestureResult(
            label=label,
            confidence=confidence,
            finger_states=finger_states,
            landmarks_used=len(lm),
            processing_time_ms=round(elapsed_ms, 3),
        )

    # ── Private helpers ───────────────────────────────────────────────────

    def _get_finger_states(self, lm: List[Landmark]) -> Dict[str, bool]:
        """Determine whether each finger is extended.

        Uses y-axis comparison (tip above PIP) for fingers 2-5, and
        x-axis comparison for the thumb (tip to the left of IP on a
        right hand when palm faces camera).

        Args:
            lm: 21-element landmark list.

        Returns:
            Dict mapping finger name to True (extended) / False (curled).
        """
        return {
            "thumb": lm[self.THUMB_TIP].x < lm[self.THUMB_IP].x,
            "index": lm[self.INDEX_TIP].y < lm[self.INDEX_PIP].y,
            "middle": lm[self.MIDDLE_TIP].y < lm[self.MIDDLE_PIP].y,
            "ring": lm[self.RING_TIP].y < lm[self.RING_PIP].y,
            "pinky": lm[self.PINKY_TIP].y < lm[self.PINKY_PIP].y,
        }

    def _match_gesture(
        self,
        fs: Dict[str, bool],
        lm: List[Landmark],
    ) -> Tuple[GestureLabel, float]:
        """Map finger states (and pinch distance) to a gesture label.

        Priority order matters: pinch is checked before fist so that
        a near-pinch hand is not misclassified as CLOSED_FIST.

        Args:
            fs: Finger state dict from _get_finger_states.
            lm: Full landmark list for distance calculations.

        Returns:
            Tuple of (GestureLabel, confidence_float).
        """
        # Open palm — all five fingers extended
        if all(fs.values()):
            return GestureLabel.OPEN_PALM, 0.95

        # Pinch — thumb and index tips close together (before fist check)
        if self._is_pinch(lm):
            return GestureLabel.PINCH, 0.88

        # Closed fist — all fingers curled
        if not any(fs.values()):
            return GestureLabel.CLOSED_FIST, 0.95

        # Pointing — index only extended
        if fs["index"] and not fs["middle"] and not fs["ring"] and not fs["pinky"]:
            return GestureLabel.POINTING, 0.92

        # Peace sign — index and middle extended
        if fs["index"] and fs["middle"] and not fs["ring"] and not fs["pinky"]:
            return GestureLabel.PEACE_SIGN, 0.90

        # Thumbs up — thumb extended, all fingers curled
        if fs["thumb"] and not fs["index"] and not fs["middle"] and not fs["ring"] and not fs["pinky"]:
            return GestureLabel.THUMBS_UP, 0.90

        return GestureLabel.UNKNOWN, 0.0

    def _is_pinch(self, lm: List[Landmark]) -> bool:
        """Return True if thumb tip and index tip are within pinch threshold.

        Args:
            lm: Full landmark list.

        Returns:
            True if the normalised distance is below PINCH_THRESHOLD.
        """
        dx: float = lm[self.THUMB_TIP].x - lm[self.INDEX_TIP].x
        dy: float = lm[self.THUMB_TIP].y - lm[self.INDEX_TIP].y
        dist: float = math.sqrt(dx ** 2 + dy ** 2)
        return dist < self.PINCH_THRESHOLD
