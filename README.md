# GamifYou 🎮

> A real-time multiplayer gaming platform controlled entirely through in-air hand gestures — no controllers, just your webcam.

## ✨ Demo
[ GIF or screenshot placeholder — add note: "Replace with actual demo.gif" ]

## 🧠 How It Works
GamifYou extracts skeletal hand data directly in the browser via WebAssembly to ensure strict privacy and low-latency client-side tracking. This landmark data streams over WebSockets to a high-performance Python FastAPI engine which analyzes hand gestures locally. The server applies statistical smoothing, emits gesture commands, and maintains deterministic state across a multiplayer session using Redis Pub/Sub, resulting in <5ms tracking loops.

```text
Browser (Player 1)          Browser (Player 2)
┌─────────────────┐         ┌─────────────────┐
│ MediaPipe Hands │         │ MediaPipe Hands │
│ (60fps, WASM)   │         │ (60fps, WASM)   │
└────────┬────────┘         └────────┬────────┘
         │ WebRTC (P2P video)        │
         └──────────┬────────────────┘
                    │ WebSocket (game state)
             ┌──────┴──────┐
             │  FastAPI    │
             │  + Redis    │
             └─────────────┘
```

## 🎮 Games
| Game | Description | Gesture Controls |
|------|-------------|-----------------|
| ♟️ **AR Chess** | True AR chess rendered right on top of your live webcam feed with floating boards. | 🤌 Hold pinch 1s = select, Quick pinch = move |
| 🏒 **Air Hockey** | Competitive table hockey using physical boundary collisions. | ✋ Open palm = paddle |
| 🎨 **Scribble Draw** | A multiplayer drawing and guessing game focused on speed. | ☝️ Index finger = draw |
| 🎈 **Balloon Pop** | An arcade mode prioritizing fast movements across a grid. | 💥 Hand collision = pop |

## 🛠️ Tech Stack
- **React (TS) + Vite:** Used to build a dynamic single-page dashboard allowing for isolated rendering loops per gesture framework.
- **MediaPipe Hands (WASM):** Selected because it extracts 21 key points offline locally, keeping payload size microscopic (hundreds of bytes vs. megabytes per raw frame).
- **FastAPI (Python):** Chosen to handle 60fps asynchronous WebSocket data effectively using python-agnostic asynchronous routines instead of traditional HTTP calls.
- **Redis:** Operates as a critical pub/sub bus to immediately reconcile game room states in clustered deployments seamlessly.
- **WebRTC:** Integrated for optional low-latency peer-to-peer video streaming alongside data states.

## 🚀 Getting Started

### Prerequisites
- Node.js v18+
- Python 3.11+
- Redis Server (local or instance)

### Installation
1. Clone the repository.
   ```bash
   git clone https://github.com/RohitRathod0/GamifYou
   cd GamifYou
   ```
2. Setup the backend.
   ```bash
   cd backend
   python -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   cp .env.example .env
   ```
3. Setup the frontend.
   ```bash
   cd frontend
   npm install
   cp .env.example .env.local
   ```

### Running locally
**Using Docker:**
```bash
docker-compose up --build
```
*Frontend will map to `localhost:5173` and backend to API `localhost:8000`.*

**Without Docker:**
Open two terminals.
Terminal 1 (Backend): `uvicorn app.main:app --reload`
Terminal 2 (Frontend): `npm run dev`

### Environment variables table

| Variable | Scope | Description |
|----------|-------|-------------|
| `REDIS_URL` | Backend | URL of the Redis instance. |
| `API_KEY` | Backend | Internal API secret protection. |
| `VITE_WS_URL` | Frontend | Target address to websocket layer. |

## 📁 Project Structure
```text
GamifYou/
├── backend/            # FastAPI, Redis integration, server-side room tracking
├── docs/               # System architecture records
└── frontend/           # React dashboard UI
    └── src/
        ├── components/ # Reusable UI components only
        ├── context/    # React context providers
        ├── games/      # One folder per game (AirHockey/, Chess/, etc.)
        ├── hooks/      # All custom hooks (useHandTracking, useWebSocket, etc.)
        ├── types/      # All shared TypeScript interfaces and types
        └── utils/      # Pure helper functions and constants
```

## 🔧 Key Technical Decisions
- **Why MediaPipe runs in the browser:** Extracting points locally avoids streaming heavy 1080p feeds server-side. This decouples bandwidth from load and protects end-user privacy.
- **Why refs over state for real-time data:** Tying DOM element updates continuously to a 60fps gesture tracker causes garbage-collection stutters. All tracking elements mutate raw `useRef` logic rendered cleanly inside optimized `requestAnimationFrame` wrappers.
- **Why a single canvas over DOM elements:** True AR experiences inherently require overlaying multiple composited elements. Doing this with HTML `div` blocks causes CSS recalculation jank; canvas simply computes pixels per frame natively.

## 🐛 Known Issues & Roadmap
1. Gesture stabilization fluctuates dramatically in poorly lit rooms. **Fix:** Implemented a new luminance detector to halt pipeline ingestion un-usable data.
2. We currently only track a single dominant hand efficiently. **Fix:** Full multi-hand concurrent logic is scheduled.

## 🤝 Contributing
Read the [.github/CONTRIBUTING.md](./.github/CONTRIBUTING.md) to understand how to format patches, follow the `feat/` and `fix/` methodology, and establish standardized PR layouts.

## 📄 License
MIT
