"""
GestureHub Backend — Integration Tests: CV Router

Tests the /api/cv/* endpoints with realistic landmark payloads using
FastAPI's async test client.
"""
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport

from app.main import app


# ── Fixtures ──────────────────────────────────────────────────────────────────

def _open_palm_payload() -> dict:
    """Build a valid /api/cv/analyze request with open-palm landmarks.

    Returns:
        Dict matching AnalyzeRequest schema with 21 landmark points.
    """
    # All landmarks at y=0.3 (tip) vs y=0.6 (PIP) → all extended
    landmarks = []
    for i in range(21):
        landmarks.append({"x": 0.5, "y": 0.3 + (i % 3) * 0.01, "z": 0.0})
    return {
        "player_id": "test-player-001",
        "room_code": "TEST01",
        "landmarks": landmarks,
        "handedness": "Right",
        "frame_timestamp_ms": 1700000000000,
    }


@pytest.fixture(scope="module")
def anyio_backend() -> str:
    """Use asyncio for anyio backend."""
    return "asyncio"


@pytest_asyncio.fixture(scope="module")
async def client() -> AsyncClient:
    """Create an async test client for the FastAPI app.

    Yields:
        AsyncClient connected to the app.
    """
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac


# ── /api/cv/analyze Tests ────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_analyze_returns_valid_response_schema(client: AsyncClient) -> None:
    """POST /api/cv/analyze should return a valid AnalyzeResponse."""
    response = await client.post("/api/cv/analyze", json=_open_palm_payload())
    assert response.status_code == 200
    body = response.json()
    assert "player_id" in body
    assert "raw_gesture" in body
    assert "confidence" in body
    assert "finger_states" in body
    assert "processing_time_ms" in body


@pytest.mark.asyncio
async def test_analyze_with_21_landmarks_succeeds(client: AsyncClient) -> None:
    """Valid 21-landmark payload should return HTTP 200."""
    response = await client.post("/api/cv/analyze", json=_open_palm_payload())
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_analyze_with_wrong_landmark_count_returns_422(
    client: AsyncClient,
) -> None:
    """Payload with != 21 landmarks should return HTTP 422 Unprocessable Entity."""
    payload = _open_palm_payload()
    payload["landmarks"] = payload["landmarks"][:10]  # only 10 landmarks
    response = await client.post("/api/cv/analyze", json=payload)
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_analyze_missing_player_id_returns_422(client: AsyncClient) -> None:
    """Payload without player_id should return HTTP 422."""
    payload = _open_palm_payload()
    del payload["player_id"]
    response = await client.post("/api/cv/analyze", json=payload)
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_analyze_invalid_handedness_returns_422(client: AsyncClient) -> None:
    """Invalid handedness value should return HTTP 422."""
    payload = _open_palm_payload()
    payload["handedness"] = "Both"
    response = await client.post("/api/cv/analyze", json=payload)
    assert response.status_code == 422


# ── /api/cv/metrics Tests ────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_metrics_endpoint_returns_session_data(client: AsyncClient) -> None:
    """GET /api/cv/metrics after analyze should return session stats."""
    payload = _open_palm_payload()
    # Send a landmark frame to create the pipeline
    await client.post("/api/cv/analyze", json=payload)

    response = await client.get(
        "/api/cv/metrics/test-player-001",
        params={"room_code": "TEST01"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["total_frames"] >= 1
    assert "avg_processing_time_ms" in body
    assert "gesture_distribution" in body


@pytest.mark.asyncio
async def test_metrics_for_unknown_player_returns_404(
    client: AsyncClient,
) -> None:
    """GET /api/cv/metrics for a player with no session should return 404."""
    response = await client.get(
        "/api/cv/metrics/nonexistent-player",
        params={"room_code": "NONE01"},
    )
    assert response.status_code == 404


# ── /api/cv/vocabulary Tests ─────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_vocabulary_endpoint_returns_all_gestures(
    client: AsyncClient,
) -> None:
    """GET /api/cv/vocabulary should list all 7 supported gesture labels."""
    response = await client.get("/api/cv/vocabulary")
    assert response.status_code == 200
    body = response.json()
    assert "gestures" in body
    labels = {g["label"] for g in body["gestures"]}
    expected = {
        "OPEN_PALM", "CLOSED_FIST", "POINTING",
        "PEACE_SIGN", "THUMBS_UP", "PINCH", "UNKNOWN",
    }
    assert labels == expected


@pytest.mark.asyncio
async def test_vocabulary_contains_pipeline_config(client: AsyncClient) -> None:
    """Vocabulary response should include confidence_threshold and pipeline stages."""
    response = await client.get("/api/cv/vocabulary")
    body = response.json()
    assert "confidence_threshold" in body
    assert "smoothing_window_frames" in body
    assert "pipeline_stages" in body
