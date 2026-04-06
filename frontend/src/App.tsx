import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Lobby } from '@/components/Lobby';
import { RoomView } from '@/components/RoomView';
import { AIAvatar } from '@/components/Avatar/AIAvatar';
import { VirtualBackground } from '@/components/Background/VirtualBackground';

export interface AppState {
    username: string;
    roomCode: string;
    playerId: string;
    currentGame: string | null;
}

const SESSION_KEY = 'gesturehub_session';

/** Read persisted session — currentGame is always cleared on reload
 *  (camera + WS need to reinitialize; user lands on game picker instead). */
function loadSession(): AppState {
    try {
        const raw = sessionStorage.getItem(SESSION_KEY);
        if (raw) {
            const saved = JSON.parse(raw) as AppState;
            return { ...saved, currentGame: null }; // never restore mid-game state
        }
    } catch { /* ignore corrupt data */ }
    return { username: '', roomCode: '', playerId: '', currentGame: null };
}

function App() {
    const [appState, setAppState] = useState<AppState>(loadSession);

    // Persist session on every state change
    useEffect(() => {
        if (appState.roomCode) {
            sessionStorage.setItem(SESSION_KEY, JSON.stringify(appState));
        } else {
            // Cleared room (e.g. left lobby) — remove saved session
            sessionStorage.removeItem(SESSION_KEY);
        }
    }, [appState]);

    return (
        <Router>
            <div className="app" style={{ minHeight: '100vh', backgroundColor: '#0a0a0a', color: '#fff' }}>
                <Routes>
                    <Route path="/" element={<Navigate to="/lobby" replace />} />
                    <Route
                        path="/lobby"
                        element={
                            <Lobby
                                appState={appState}
                                setAppState={setAppState}
                            />
                        }
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