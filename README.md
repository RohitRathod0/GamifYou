# 🎮 GestureHub — Computer Vision Gaming Platform

> A real-time multiplayer gaming platform where players use hand gestures to control games entirely through their webcam — no controllers required.

[![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688?logo=fastapi)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)](https://react.dev/)
[![MediaPipe](https://img.shields.io/badge/MediaPipe-Hands-FF6F00?logo=google)](https://google.github.io/mediapipe/)
[![Redis](https://img.shields.io/badge/Redis-7-DC382D?logo=redis)](https://redis.io/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)](https://www.typescriptlang.org/)

---

## 🌟 Project Overview

GestureHub is a real-time multiplayer gesture-controlled gaming platform. Players stream their hand landmarks (21 keypoints per hand via MediaPipe) over WebSocket to a FastAPI backend, which runs a **5-stage Computer Vision pipeline** to classify gestures, smooth jitter, and emit authoritative game actions — all in under 5ms per frame.

**Key Design Choice:** Raw video never leaves the client. MediaPipe runs in-browser via WebAssembly, extracting 21 keypoints (252 bytes/frame) instead of sending raw video frames (~3MB/frame). The server handles gesture classification and game state — keeping it testable, scalable, and privacy-preserving.

---

## 🏗️ Architecture

```
┌─────────────────── Browser (Client) ──────────────────────────┐
│  📷 Webcam → MediaPipe Hands (WASM, 60fps)                    │
│  → 21 Landmarks (x,y,z) → WebSocket → Backend                │
│  ← GESTURE_RESULT / GAME_STATE ← WebSocket                   │
│  CV Debug Overlay (gesture, confidence, FPS, finger states)   │
└───────────────────────────────────────────────────────────────┘
                              │ WebSocket / REST
┌─────────────────── FastAPI Backend ───────────────────────────┐
│                                                               │
│  WebSocket Handler                                            │
│    └─▶ GesturePipeline.process(landmarks)                    │
│          ├─ Stage 1: LandmarkSmoother (EMA, α=0.7)           │
│          ├─ Stage 2: GestureVocabulary.classify()            │
│          ├─ Stage 3: Confidence thresholding (≥0.85)         │
│          ├─ Stage 4: GestureBuffer (3-frame consensus)       │
│          └─ Stage 5: gesture → game_action mapping           │
│                                                               │
│  REST Routers: /api/rooms, /api/cv, /health                  │
│  Redis: Room state, player sessions                          │
└───────────────────────────────────────────────────────────────┘
                              │
┌─────────────── Redis ────────────────────────────────────────┐
│  Room state • Player sessions • Pub/Sub for multi-instance   │
└──────────────────────────────────────────────────────────────┘
```

---

## 🧠 CV Pipeline Deep Dive

The gesture pipeline has **5 stages**, each solving a specific production problem:

| Stage | Component | What it solves |
|-------|-----------|---------------|
| 1 | `LandmarkSmoother` | Raw MediaPipe output jitters frame-to-frame — EMA smooths x,y,z with α=0.7 |
| 2 | `GestureVocabulary.classify()` | Converts 21 normalized keypoints into a named gesture using geometric rules |
| 3 | Confidence thresholding | Ignores ambiguous frames below 0.85 confidence to prevent false triggers |
| 4 | `GestureBuffer` | Requires 3 consecutive frames of same gesture before emitting — eliminates flicker |
| 5 | Action mapper | Maps stable gesture labels to game-agnostic action strings (e.g. `CONTROL_ACTIVE`) |

**Why rule-based and not ML?**  
The classifier is intentionally designed as a drop-in replaceable component. The `classify()` method can be swapped for a trained MLP on 63 features (21 landmarks × xyz) without touching any other code. Rule-based gives 100% explainability and zero training data requirements while the platform is pre-production.

---

## 🖐️ Supported Gestures

| Gesture | Hand Shape | In-game Action | Confidence |
|---------|-----------|----------------|-----------|
| `OPEN_PALM` | All 5 fingers extended | `CONTROL_ACTIVE` — move paddle/avatar | 0.95 |
| `CLOSED_FIST` | All fingers curled | `CONTROL_STOP` — stop/grab | 0.95 |
| `POINTING` | Index only extended | `DRAW` — Pictionary drawing | 0.92 |
| `PEACE_SIGN` | Index + middle extended | `SPECIAL_ACTION` — power-up | 0.90 |
| `THUMBS_UP` | Thumb extended upward | `CONFIRM` — ready/vote | 0.90 |
| `PINCH` | Thumb + index < 5% apart | `PRECISION_CONTROL` — fine aim | 0.88 |
| `UNKNOWN` | Any ambiguous shape | _(no action emitted)_ | 0.0 |

---

## 🎮 Games

| Game | Primary Gesture | Description |
|------|----------------|-------------|
| 🏒 Air Hockey | `OPEN_PALM` | Two-player paddle control via hand position |
| 🎨 Gesture Pictionary | `POINTING` | Draw in-air with index finger |
| ⚡ Laser Dodger | `OPEN_PALM` | Dodge lasers with body/hand movement |
| 🎈 Balloon Pop | `OPEN_PALM` | Move hands over balloons to pop them |

---

## 🔧 Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **CV / ML** | MediaPipe Hands (WASM) | 60fps in-browser landmark extraction, no GPU cost |
| **Backend** | FastAPI + Python 3.11 | Async WebSocket support, automatic OpenAPI docs |
| **Game State** | Redis 7 | Sub-ms reads for room state, pub/sub for scaling |
| **Frontend** | React 18 + TypeScript | Component model fits game screen architecture |
| **Bundler** | Vite 5 | Asset handling for MediaPipe WASM files |
| **WebSocket** | FastAPI native / websockets | Full-duplex landmark + game state streaming |
| **Deployment** | Render (backend) + Vercel (frontend) + Redis Cloud | Free tier, WebSocket-compatible |

---

## 📡 API Reference

### Room Endpoints

```
POST /api/rooms/create         Create a new room, returns room_code
POST /api/rooms/join           Join by room_code
GET  /api/rooms/{room_code}    Get room details and player list
GET  /api/rooms/               List all active rooms
```

### Computer Vision Endpoints

```
POST /api/cv/analyze
  Body: { player_id, room_code, landmarks: [21x {x,y,z}], handedness }
  Returns: { raw_gesture, stable_gesture, confidence, finger_states,
             processing_time_ms, game_action }

GET  /api/cv/metrics/{player_id}?room_code=XYZ
  Returns: { total_frames, classified_frames, avg_processing_time_ms,
             gesture_distribution, frames_per_second, uptime_seconds }

GET  /api/cv/vocabulary
  Returns: list of supported gestures with descriptions

POST /api/cv/calibrate
  Body: { player_id, baseline_landmarks }
  Calibrates hand-size normalization for this player
```

### WebSocket

```
ws://localhost:8000/ws/{room_code}/{player_id}

Client → Server:
  { type: "LANDMARK_FRAME", player_id, landmarks: [...21], timestamp_ms }
  { type: "GAME_ACTION",    player_id, action, payload }
  { type: "PLAYER_READY",   player_id }

Server → Client:
  { type: "GESTURE_RESULT", player_id, gesture, confidence, game_action }
  { type: "GAME_STATE",     state, scores, round, timestamp }
  { type: "PLAYER_JOINED",  player_id, username, player_count }
  { type: "ERROR",          code, message }
```

---

## ⚙️ Performance Characteristics

| Metric | Target | Notes |
|--------|--------|-------|
| Landmark extraction | 60 fps | MediaPipe WASM in browser |
| CV pipeline latency | < 5 ms/frame | Pure Python, rule-based, no I/O |
| WebSocket round-trip | < 50 ms | LAN; Render adds ~100ms |
| Gesture confidence threshold | 0.85 | Tunable in `.env` |
| Smoothing window | 3 frames | ~50ms at 60fps |
| Landmark payload size | ~252 bytes | vs ~3MB for raw video frame |

---

## 🚀 Quick Start

### Docker (recommended)

```bash
git clone https://github.com/RohitRathod0/GestureHub
cd GestureHub
cp backend/.env.example backend/.env
docker-compose up --build
```

- Frontend: http://localhost:5173  
- Backend API: http://localhost:8000  
- API Docs: http://localhost:8000/docs

### Manual Setup

**Backend:**
```bash
cd backend
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # macOS/Linux
pip install -r requirements.txt
cp .env.example .env
# Start Redis separately, then:
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

**Frontend:**
```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

---

## 🌐 Deployment

Deploy in under 15 minutes with all free-tier services:

| Service | Platform | Notes |
|---------|----------|-------|
| Frontend | [Vercel](https://vercel.com) | Connect GitHub repo, auto-deploys |
| Backend | [Render.com](https://render.com) | `render.yaml` in repo |
| Redis | [Redis Cloud](https://redis.io/cloud/) | Free 30MB tier |

Set env vars in Render dashboard matching `backend/.env.example`. WebSocket on Render uses `wss://` automatically.

---

## 🏛️ Design Decisions

### Why browser-side landmark extraction?
Sending raw video at 30fps = 3–10 MB/s per player. Impossible at scale. MediaPipe landmarks = 21 × 3 floats = **252 bytes/frame**, 1000× more bandwidth efficient. Client does the vision; server does the intelligence.

### Why WebSocket over REST for landmarks?
Each player generates ~60 landmark frames/second. REST's per-request overhead (HTTP headers, connection setup) is prohibitive. WebSocket gives persistent, multiplexed, bi-directional streaming at negligible overhead.

### Why rule-based gesture classifier?
100% explainable, zero training data, deterministic. Designed as a **drop-in replaceable component**: swap `GestureVocabulary.classify()` with a trained MLP without changing any other code. See `docs/decisions/ADR-003.md`.

---

## ⚠️ Known Limitations & Future Work

- **Gesture accuracy degrades in poor lighting** — add ambient light check via ImageBitmap luminosity
- **Single-hand only** — multi-hand tracking is supported by MediaPipe but not yet plumbed through  
- **Rule-based classifier** — replace with MLP trained on 63-dim landmark vectors for edge cases
- **Anti-cheat** — server-side gesture plausibility validation (`cv/anti_cheat.py`) not yet wired in
- **Calibration** — `/api/cv/calibrate` endpoint exists but frontend UI not yet built

---

## 📚 Resources

- [MediaPipe Hands Landmark Index](https://google.github.io/mediapipe/solutions/hands.html#hand-landmark-model)
- [FastAPI WebSocket Docs](https://fastapi.tiangolo.com/advanced/websockets/)
- [Temporal Smoothing in CV Systems](https://en.wikipedia.org/wiki/Exponential_smoothing)

---

**Made with ❤️ for AI Engineers** · Questions? Open an issue.
