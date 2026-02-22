"""
GestureHub Backend — Unit Tests: Temporal Smoothing

Tests GestureBuffer consensus logic and LandmarkSmoother EMA behaviour.
"""
import pytest
from app.cv.gesture_vocabulary import GestureLabel, GestureResult
from app.cv.smoothing import GestureBuffer, LandmarkSmoother


# ── Helpers ───────────────────────────────────────────────────────────────────

def _make_result(
    label: GestureLabel, confidence: float = 0.95
) -> GestureResult:
    """Build a minimal GestureResult for testing.

    Args:
        label: The gesture label.
        confidence: Classifier confidence (default 0.95).

    Returns:
        GestureResult with dummy finger_states and zero processing time.
    """
    return GestureResult(
        label=label,
        confidence=confidence,
        finger_states={"thumb": True, "index": True, "middle": True, "ring": True, "pinky": True},
        landmarks_used=21,
        processing_time_ms=0.0,
    )


# ── GestureBuffer Tests ───────────────────────────────────────────────────────


class TestGestureBuffer:
    """Tests for the sliding-window consensus filter."""

    @pytest.fixture()
    def buf(self) -> GestureBuffer:
        """Return a fresh GestureBuffer with window_size=3."""
        return GestureBuffer(window_size=3, min_confidence=0.85)

    def test_no_output_until_window_full(self, buf: GestureBuffer) -> None:
        """Buffer should return None for the first N-1 pushes."""
        result1 = buf.push(_make_result(GestureLabel.OPEN_PALM))
        result2 = buf.push(_make_result(GestureLabel.OPEN_PALM))
        assert result1 is None, "Should not emit after 1 frame"
        assert result2 is None, "Should not emit after 2 frames"

    def test_stable_gesture_emitted_on_consensus(self, buf: GestureBuffer) -> None:
        """Same gesture repeated N times should emit the label on the Nth push."""
        buf.push(_make_result(GestureLabel.OPEN_PALM))
        buf.push(_make_result(GestureLabel.OPEN_PALM))
        result = buf.push(_make_result(GestureLabel.OPEN_PALM))
        assert result == GestureLabel.OPEN_PALM

    def test_no_emission_on_mixed_gestures(self, buf: GestureBuffer) -> None:
        """Alternating gestures within the window should produce no output."""
        buf.push(_make_result(GestureLabel.OPEN_PALM))
        buf.push(_make_result(GestureLabel.CLOSED_FIST))
        result = buf.push(_make_result(GestureLabel.OPEN_PALM))
        assert result is None

    def test_low_confidence_frames_ignored(self, buf: GestureBuffer) -> None:
        """Frames below min_confidence should not fill the window."""
        buf.push(_make_result(GestureLabel.OPEN_PALM, confidence=0.50))  # too low
        buf.push(_make_result(GestureLabel.OPEN_PALM, confidence=0.50))
        result = buf.push(_make_result(GestureLabel.OPEN_PALM, confidence=0.50))
        # Window is never full because low-conf frames are skipped
        assert result is None

    def test_reset_clears_buffer(self, buf: GestureBuffer) -> None:
        """After reset, buffer should require N new frames before emitting."""
        buf.push(_make_result(GestureLabel.OPEN_PALM))
        buf.push(_make_result(GestureLabel.OPEN_PALM))
        buf.reset()
        buf.push(_make_result(GestureLabel.OPEN_PALM))
        buf.push(_make_result(GestureLabel.OPEN_PALM))
        result = buf.push(_make_result(GestureLabel.OPEN_PALM))
        # Should emit again because reset cleared last_stable_gesture
        assert result == GestureLabel.OPEN_PALM

    def test_same_gesture_not_emitted_twice(self, buf: GestureBuffer) -> None:
        """The same stable gesture should not fire twice in a row."""
        for _ in range(3):
            buf.push(_make_result(GestureLabel.CLOSED_FIST))
        # First consensus
        first = buf.last_stable_gesture
        assert first == GestureLabel.CLOSED_FIST
        # Push three more of the same gesture
        results = [buf.push(_make_result(GestureLabel.CLOSED_FIST)) for _ in range(3)]
        # None because last_stable_gesture already equals CLOSED_FIST
        assert all(r is None for r in results)

    def test_new_gesture_emitted_after_change(self, buf: GestureBuffer) -> None:
        """A new consensus gesture should emit even immediately after another."""
        for _ in range(3):
            buf.push(_make_result(GestureLabel.OPEN_PALM))
        # Switch to POINTING
        buf.push(_make_result(GestureLabel.POINTING))
        buf.push(_make_result(GestureLabel.POINTING))
        result = buf.push(_make_result(GestureLabel.POINTING))
        assert result == GestureLabel.POINTING


# ── LandmarkSmoother Tests ────────────────────────────────────────────────────


class TestLandmarkSmoother:
    """Tests for Exponential Moving Average landmark smoothing."""

    def _flat_landmarks(self, val: float = 0.5) -> list[dict]:
        """Build 21 identical landmarks at a given coordinate value.

        Args:
            val: x, y, z value for all landmarks.

        Returns:
            List of 21 identical landmark dicts.
        """
        return [{"x": val, "y": val, "z": val} for _ in range(21)]

    def test_first_frame_passes_through_unchanged(self) -> None:
        """The very first frame should be returned as-is (no history)."""
        smoother = LandmarkSmoother(alpha=0.7)
        lm = self._flat_landmarks(0.8)
        result = smoother.smooth(lm)
        assert result[0]["x"] == pytest.approx(0.8)

    def test_ema_moves_toward_new_value(self) -> None:
        """After two frames, smoothed value should be between old and new."""
        smoother = LandmarkSmoother(alpha=0.7)
        smoother.smooth(self._flat_landmarks(0.0))  # seed
        result = smoother.smooth(self._flat_landmarks(1.0))
        # With α=0.7: 0.7*1.0 + 0.3*0.0 = 0.7
        assert result[0]["x"] == pytest.approx(0.7)

    def test_reset_clears_smoothing_history(self) -> None:
        """After reset, the next frame should pass through without smoothing."""
        smoother = LandmarkSmoother(alpha=0.7)
        smoother.smooth(self._flat_landmarks(0.0))  # seed at 0
        smoother.reset()
        result = smoother.smooth(self._flat_landmarks(1.0))
        # No history → passes through unchanged
        assert result[0]["x"] == pytest.approx(1.0)

    def test_smooth_preserves_landmark_count(self) -> None:
        """Output should always contain exactly 21 landmarks."""
        smoother = LandmarkSmoother()
        result = smoother.smooth(self._flat_landmarks())
        assert len(result) == 21

    def test_smooth_preserves_all_keys(self) -> None:
        """Each smoothed landmark should still have x, y, z keys."""
        smoother = LandmarkSmoother()
        result = smoother.smooth(self._flat_landmarks())
        for lm in result:
            assert set(lm.keys()) == {"x", "y", "z"}
