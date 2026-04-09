import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { Lobby } from '@/components/Lobby';
import { RoomView } from '@/components/RoomView';
import { PublicLobby } from '@/components/PublicLobby';
import { AIAvatar } from '@/components/Avatar/AIAvatar';
import { VirtualBackground } from '@/components/Background/VirtualBackground';
import { roomAPI } from '@/utils/api';

export interface AppState {
    username: string;
    roomCode: string;
    playerId: string;
    currentGame: string | null;
}

const SESSION_KEY = 'gesturehub_session';

/** Read persisted session — currentGame is always cleared on reload */
function loadSession(): AppState {
    try {
        const raw = sessionStorage.getItem(SESSION_KEY);
        if (raw) {
            const saved = JSON.parse(raw) as AppState;
            return { ...saved, currentGame: null };
        }
    } catch { /* ignore corrupt data */ }
    return { username: '', roomCode: '', playerId: '', currentGame: null };
}

// ── Public Lobby page wrapper (needs navigate, so lives inside <Router>) ──────

interface PublicLobbyPageProps {
    appState: AppState;
    setAppState: React.Dispatch<React.SetStateAction<AppState>>;
}

function PublicLobbyPage({ setAppState }: PublicLobbyPageProps) {
    const navigate = useNavigate();

    const handleJoinRoom = (roomCode: string, username: string, playerId: string) => {
        setAppState({ username, roomCode, playerId, currentGame: null });
        navigate('/room');
    };

    const handleCreateRoom = async (isPublic: boolean) => {
        // Read username from sessionStorage (set by Lobby / PublicLobby input)
        const username = sessionStorage.getItem('gesturehub_username') ?? '';
        if (!username.trim()) {
            // If no username, send them to the main lobby to fill it in
            navigate('/lobby');
            return;
        }
        try {
            const room = await roomAPI.createRoom(username, 6, isPublic);
            setAppState({ username, roomCode: room.room_code, playerId: room.host_id, currentGame: null });
            navigate('/room');
        } catch {
            navigate('/lobby');
        }
    };

    return (
        <PublicLobby
            onJoinRoom={handleJoinRoom}
            onCreateRoom={handleCreateRoom}
            onBack={() => navigate('/lobby')}
        />
    );
}

// ── Root App ──────────────────────────────────────────────────────────────────

function App() {
    const [appState, setAppState] = useState<AppState>(loadSession);

    // Persist session on every state change
    useEffect(() => {
        if (appState.roomCode) {
            sessionStorage.setItem(SESSION_KEY, JSON.stringify(appState));
        } else {
            sessionStorage.removeItem(SESSION_KEY);
        }
    }, [appState]);

    return (
        <Router>
            <div className="app" style={{ minHeight: '100vh' }}>
                <Routes>
                    <Route path="/" element={<Navigate to="/lobby" replace />} />
                    <Route
                        path="/lobby"
                        element={<Lobby appState={appState} setAppState={setAppState} />}
                    />
                    <Route
                        path="/public-rooms"
                        element={<PublicLobbyPage appState={appState} setAppState={setAppState} />}
                    />
                    <Route
                        path="/ai-avatar"
                        element={<AIAvatar />}
                    />
                    <Route
                        path="/virtual-background"
                        element={<VirtualBackground />}
                    />
                    <Route
                        path="/room"
                        element={
                            appState.roomCode ? (
                                <RoomView appState={appState} setAppState={setAppState} />
                            ) : (
                                <Navigate to="/lobby" replace />
                            )
                        }
                    />
                </Routes>
            </div>
        </Router>
    );
}

export default App;