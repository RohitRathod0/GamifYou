# 🎮 GestureHub - Computer Vision Gaming Platform

A real-time multiplayer gaming platform powered by computer vision, where players use hand gestures and body movements to play interactive games.

## 🌟 Features

- **4 Gesture-Based Games:**
  - 🏒 **Air Hockey** - Control paddles with hand movements
  - 🎨 **Gesture Pictionary** - Draw in the air with finger tracking
  - ⚡ **Laser Dodger** - Dodge lasers using body movements
  - 🎈 **Balloon Pop** - Pop balloons by moving your hands

- **Real-Time Multiplayer:**
  - WebSocket-based game state synchronization
  - WebRTC peer-to-peer video streaming
  - Low-latency hand tracking (60 FPS)

- **Computer Vision:**
  - MediaPipe Hands for accurate hand tracking
  - Runs entirely in the browser (no backend CV processing)
  - Support for multiple players simultaneously

## 🏗️ Architecture

```
Frontend (React + TypeScript)
├── MediaPipe Hands (browser-based CV)
├── WebRTC (P2P video)
└── WebSocket (game state)

Backend (FastAPI + Python)
├── WebSocket server
├── Room management
└── Redis (state storage)
```

## 📋 Prerequisites

- **Docker & Docker Compose** (recommended)
- OR:
  - Python 3.11+
  - Node.js 20+
  - Redis

## 🚀 Quick Start with Docker

1. **Clone the repository:**
```bash
git clone <your-repo-url>
cd gesturehub
```

2. **Start all services:**
```bash
docker-compose up --build
```

3. **Access the application:**
- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs

## 🛠️ Manual Setup (Without Docker)

### Backend Setup

1. **Navigate to backend directory:**
```bash
cd backend
```

2. **Create virtual environment:**
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. **Install dependencies:**
```bash
pip install -r requirements.txt
```

4. **Start Redis:**
```bash
# macOS (with Homebrew)
brew services start redis

# Linux
sudo systemctl start redis

# Windows (with WSL or Redis for Windows)
redis-server
```

5. **Run the backend:**
```bash
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend Setup

1. **Navigate to frontend directory:**
```bash
cd frontend
```

2. **Install dependencies:**
```bash
npm install
```

3. **Run the development server:**
```bash
npm run dev
```

4. **Access:** http://localhost:5173

## 🎮 How to Play

1. **Create or Join a Room:**
   - Enter your username
   - Click "Create Room" to host or enter a room code to join

2. **Wait in Lobby:**
   - See other players join
   - Host selects a game

3. **Allow Camera Access:**
   - Browser will request camera permission
   - This is needed for hand tracking

4. **Play:**
   - Follow on-screen instructions for each game
   - Move your hands/body to control the game

## 🎯 Game Controls

### Air Hockey
- Move your hand to control your paddle
- First to 7 points wins

### Balloon Pop
- Move your hands over balloons to pop them
- Different colors = different points
- Highest score in 60 seconds wins

### Gesture Pictionary
- Draw in the air with your index finger
- Others guess what you're drawing
- Take turns drawing

### Laser Dodger
- Move your body to dodge lasers
- Touch a laser = lose health
- Last player standing wins

## 🔧 Configuration

### Backend (.env)
```env
DEBUG=True
REDIS_HOST=localhost
REDIS_PORT=6379
FRONTEND_URL=http://localhost:5173
MAX_PLAYERS_PER_ROOM=6
```

### Frontend (environment)
Update `vite.config.ts` or create `.env.local`:
```env
VITE_API_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000
```

## 📡 API Endpoints

### REST API
- `POST /api/rooms/create` - Create a new room
- `POST /api/rooms/join` - Join existing room
- `GET /api/rooms/{room_code}` - Get room details
- `GET /api/rooms/` - List active rooms

### WebSocket
- `ws://localhost:8000/ws/{room_code}/{player_id}` - Real-time connection

## 🐛 Troubleshooting

### CORS Errors
✅ **Already fixed!** The project is configured to avoid CORS issues:
- Backend: Proper CORS middleware configured
- Frontend: Vite proxy setup for API and WebSocket

### Camera Not Working
- Ensure HTTPS is used in production (getUserMedia requires secure context)
- Check browser permissions
- Try a different browser (Chrome/Edge recommended)

### Redis Connection Failed
```bash
# Check if Redis is running
redis-cli ping
# Should return: PONG

# If not running, start it:
docker-compose up redis
# OR
redis-server
```

### WebSocket Connection Failed
- Check firewall settings
- Ensure backend is running on correct port
- Verify WebSocket URL in frontend config

## 🚀 Deployment

### Production Deployment (Docker)

1. **Update environment variables:**
```env
# backend/.env
DEBUG=False
FRONTEND_URL=https://your-domain.com
```

2. **Build and deploy:**
```bash
docker-compose -f docker-compose.prod.yml up -d
```

### Deploy to Cloud

**Recommended Stack:**
- **Frontend:** Vercel / Netlify
- **Backend:** Railway / Render / AWS ECS
- **Redis:** Redis Cloud / AWS ElastiCache

## 📊 Performance Optimization

- Hand tracking runs at 60 FPS
- WebSocket updates every 50ms
- WebRTC for P2P video (no server load)
- Redis for fast state management

## 🤝 Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📝 License

MIT License - feel free to use this project for learning or building your own games!

## 🎓 Learning Resources

- [MediaPipe Hands Documentation](https://google.github.io/mediapipe/solutions/hands.html)
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [WebRTC Guide](https://webrtc.org/getting-started/overview)

## 🙏 Acknowledgments

- MediaPipe by Google for hand tracking
- FastAPI for the excellent Python web framework
- React and Vite for frontend tooling

---

**Made with ❤️ for AI Engineers**

Questions? Open an issue or reach out!