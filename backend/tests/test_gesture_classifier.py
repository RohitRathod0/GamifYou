"""
GestureHub Backend — Unit Tests: Gesture Classifier

Tests known landmark configurations against expected GestureLabel outputs.
Landmarks are expressed as normalised [0,1] (x,y,z) dicts, as MediaPipe returns.
"""
import pytest
from app.cv.gesture_vocabulary import GestureLabel, GestureVocabulary


# ── Fixtures ──────────────────────────────────────────────────────────────────

def _make_landmarks(overrides: dict | None = None) -> list[dict]:
    """Build a 21-landmark flat-hand (all extended) template.

    All TIP y-values are above (smaller than) PIP y-values so every
    finger starts as 'extended'. Pass `overrides` to curl specific fingers.

    Args:
        overrides: Dict of {index: {'x': ..., 'y': ...}} to override.

    Returns:
        List of 21 landmark dicts.
    """
    # Default: open palm — all fingers extended (tip y < pip y)
    lm = [{"x": 0.5, "y": 0.5, "z": 0.0} for _ in range(21)]

    # Wrist at bottom
    lm[0] = {"x": 0.5, "y": 0.9, "z": 0.0}

    # Thumb: TIP(4) x < IP(3) x → extended
    lm[2] = {"x": 0.35, "y": 0.7, "z": 0.0}  # MCP
    lm[3] = {"x": 0.30, "y": 0.65, "z": 0.0}  # IP
    lm[4] = {"x": 0.20, "y": 0.60, "z": 0.0}  # TIP (x < IP.x → extended)

    # Index: TIP(8) y < PIP(6) y → extended
    lm[5] = {"x": 0.45, "y": 0.75, "z": 0.0}  # MCP
    lm[6] = {"x": 0.45, "y": 0.60, "z": 0.0}  # PIP
    lm[7] = {"x": 0.45, "y": 0.45, "z": 0.0}  # DIP
    lm[8] = {"x": 0.45, "y": 0.30, "z": 0.0}  # TIP

    # Middle: TIP(12) y < PIP(10) y → extended
    lm[9]  = {"x": 0.50, "y": 0.75, "z": 0.0}
    lm[10] = {"x": 0.50, "y": 0.58, "z": 0.0}
    lm[11] = {"x": 0.50, "y": 0.42, "z": 0.0}
    lm[12] = {"x": 0.50, "y": 0.26, "z": 0.0}

    # Ring: TIP(16) y < PIP(14) y → extended
    lm[13] = {"x": 0.55, "y": 0.75, "z": 0.0}
    lm[14] = {"x": 0.55, "y": 0.60, "z": 0.0}
    lm[15] = {"x": 0.55, "y": 0.45, "z": 0.0}
    lm[16] = {"x": 0.55, "y": 0.30, "z": 0.0}

    # Pinky: TIP(20) y < PIP(18) y → extended
    lm[17] = {"x": 0.60, "y": 0.75, "z": 0.0}
    lm[18] = {"x": 0.60, "y": 0.62, "z": 0.0}
    lm[19] = {"x": 0.60, "y": 0.50, "z": 0.0}
    lm[20] = {"x": 0.60, "y": 0.38, "z": 0.0}

    if overrides:
        for idx, vals in overrides.items():
            lm[idx].update(vals)
    return lm


def _curl_finger(lm: list[dict], tip_idx: int, pip_idx: int) -> None:
    """Curl a finger by setting TIP y BELOW PIP y (i.e., tip further down).

    Args:
        lm: Landmark list to mutate.
        tip_idx: TIP landmark index.
        pip_idx: PIP landmark index.
    """
    lm[tip_idx]["y"] = lm[pip_idx]["y"] + 0.1  # tip below pip = curled


@pytest.fixture()
def vocab() -> GestureVocabulary:
    """Return a fresh GestureVocabulary instance."""
    return GestureVocabulary(confidence_threshold=0.85)


@pytest.fixture()
def open_palm_landmarks() -> list[dict]:
    """21 landmarks representing an open palm."""
    return _make_landmarks()


@pytest.fixture()
def closed_fist_landmarks() -> list[dict]:
    """21 landmarks with all fingers curled (closed fist)."""
    lm = _make_landmarks()
    _curl_finger(lm, 8, 6)    # index
    _curl_finger(lm, 12, 10)  # middle
    _curl_finger(lm, 16, 14)  # ring
    _curl_finger(lm, 20, 18)  # pinky
    # Curl thumb: TIP x > IP x
    lm[4]["x"] = lm[3]["x"] + 0.1
    return lm


@pytest.fixture()
def pointing_landmarks() -> list[dict]:
    """21 landmarks — index extended, all others curled."""
    lm = _make_landmarks()
    _curl_finger(lm, 12, 10)  # middle
    _curl_finger(lm, 16, 14)  # ring
    _curl_finger(lm, 20, 18)  # pinky
    lm[4]["x"] = lm[3]["x"] + 0.1  # curl thumb
    return lm


@pytest.fixture()
def peace_sign_landmarks() -> list[dict]:
    """21 landmarks — index + middle extended, ring + pinky curled."""
    lm = _make_landmarks()
    _curl_finger(lm, 16, 14)  # ring
    _curl_finger(lm, 20, 18)  # pinky
    lm[4]["x"] = lm[3]["x"] + 0.1  # curl thumb
    return lm


@pytest.fixture()
def pinch_landmarks() -> list[dict]:
    """21 landmarks — thumb tip and index tip very close together."""
    lm = _make_landmarks()
    # Pull thumb tip to within 0.03 of index tip
    lm[4]["x"] = lm[8]["x"] + 0.02
    lm[4]["y"] = lm[8]["y"] + 0.02
    return lm


# ── Tests ─────────────────────────────────────────────────────────────────────


class TestOpenPalm:
    """Tests for OPEN_PALM detection."""

    def test_open_palm_classified_correctly(
        self, vocab: GestureVocabulary, open_palm_landmarks: list[dict]
    ) -> None:
        """All fingers extended should classify as OPEN_PALM with confidence ≥ 0.9."""
        result = vocab.classify(open_palm_landmarks)
        assert result.label == GestureLabel.OPEN_PALM
        assert result.confidence >= 0.9

    def test_open_palm_all_fingers_extended(
        self, vocab: GestureVocabulary, open_palm_landmarks: list[dict]
    ) -> None:
        """Open palm should have all finger_states True."""
        result = vocab.classify(open_palm_landmarks)
        assert all(result.finger_states.values())


class TestClosedFist:
    """Tests for CLOSED_FIST detection."""

    def test_closed_fist_classified_correctly(
        self, vocab: GestureVocabulary, closed_fist_landmarks: list[dict]
    ) -> None:
        """All fingers curled should classify as CLOSED_FIST with confidence ≥ 0.9."""
        result = vocab.classify(closed_fist_landmarks)
        assert result.label == GestureLabel.CLOSED_FIST
        assert result.confidence >= 0.9

    def test_closed_fist_no_fingers_extended(
        self, vocab: GestureVocabulary, closed_fist_landmarks: list[dict]
    ) -> None:
        """Closed fist should have all finger_states False except thumb may vary."""
        result = vocab.classify(closed_fist_landmarks)
        # All finger-2-through-5 states must be False
        for finger in ("index", "middle", "ring", "pinky"):
            assert result.finger_states[finger] is False


class TestPointing:
    """Tests for POINTING gesture detection."""

    def test_pointing_classified_correctly(
        self, vocab: GestureVocabulary, pointing_landmarks: list[dict]
    ) -> None:
        """Index finger only extended should classify as POINTING."""
        result = vocab.classify(pointing_landmarks)
        assert result.label == GestureLabel.POINTING
        assert result.confidence >= 0.9

    def test_pointing_index_only_extended(
        self, vocab: GestureVocabulary, pointing_landmarks: list[dict]
    ) -> None:
        """Only index finger should be in extended state."""
        result = vocab.classify(pointing_landmarks)
        assert result.finger_states["index"] is True
        assert result.finger_states["middle"] is False
        assert result.finger_states["ring"] is False
        assert result.finger_states["pinky"] is False


class TestPeaceSign:
    """Tests for PEACE_SIGN gesture detection."""

    def test_peace_sign_classified_correctly(
        self, vocab: GestureVocabulary, peace_sign_landmarks: list[dict]
    ) -> None:
        """Index + middle extended should classify as PEACE_SIGN."""
        result = vocab.classify(peace_sign_landmarks)
        assert result.label == GestureLabel.PEACE_SIGN
        assert result.confidence >= 0.88


class TestPinch:
    """Tests for PINCH gesture detection."""

    def test_pinch_classified_correctly(
        self, vocab: GestureVocabulary, pinch_landmarks: list[dict]
    ) -> None:
        """Thumb and index close together should classify as PINCH."""
        result = vocab.classify(pinch_landmarks)
        assert result.label == GestureLabel.PINCH
        assert result.confidence >= 0.85

    def test_pinch_detection_at_threshold_distance(
        self, vocab: GestureVocabulary, open_palm_landmarks: list[dict]
    ) -> None:
        """Fingers far apart should NOT be pinch."""
        result = vocab.classify(open_palm_landmarks)
        assert result.label != GestureLabel.PINCH


class TestUnknown:
    """Tests for UNKNOWN gesture output."""

    def test_unknown_gesture_returns_unknown_label(
        self, vocab: GestureVocabulary
    ) -> None:
        """A gesture that matches no pattern should return UNKNOWN with confidence 0."""
        # Ring and thumb extended but nothing else = no defined gesture
        lm = _make_landmarks()
        _curl_finger(lm, 8, 6)    # curl index
        _curl_finger(lm, 12, 10)  # curl middle
        _curl_finger(lm, 20, 18)  # curl pinky
        result = vocab.classify(lm)
        assert result.label == GestureLabel.UNKNOWN
        assert result.confidence == 0.0

    def test_classifier_handles_noisy_landmarks(
        self, vocab: GestureVocabulary, open_palm_landmarks: list[dict]
    ) -> None:
        """Slightly jittered landmarks should still classify correctly."""
        import random
        noisy = [
            {"x": lm["x"] + random.uniform(-0.01, 0.01),
             "y": lm["y"] + random.uniform(-0.01, 0.01),
             "z": lm["z"]}
            for lm in open_palm_landmarks
        ]
        result = vocab.classify(noisy)
        # With mild noise, open palm should still be detected
        assert result.label == GestureLabel.OPEN_PALM


class TestProcessingTime:
    """Tests for pipeline performance characteristics."""

    def test_classify_returns_processing_time(
        self, vocab: GestureVocabulary, open_palm_landmarks: list[dict]
    ) -> None:
        """GestureResult must include a non-negative processing_time_ms."""
        result = vocab.classify(open_palm_landmarks)
        assert result.processing_time_ms >= 0.0

    def test_classify_uses_all_21_landmarks(
        self, vocab: GestureVocabulary, open_palm_landmarks: list[dict]
    ) -> None:
        """landmarks_used field should equal 21."""
        result = vocab.classify(open_palm_landmarks)
        assert result.landmarks_used == 21
