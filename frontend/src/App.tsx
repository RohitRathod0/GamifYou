import { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Lobby } from '@/components/Lobby';
import { RoomView } from '@/components/RoomView';
import { AIAvatar } from '@/features/avatar/AIAvatar';
import { VirtualBackground } from '@/features/background/VirtualBackground';

export interface AppState {
    username: string;
    roomCode: string;
    playerId: string;
    currentGame: string | null;
}

function App() {
    const [appState, setAppState] = useState<AppState>({
        username: '',
        roomCode: '',
        playerId: '',
        currentGame: null,
    });

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