import { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Lobby } from '@/components/Lobby';
import { GameSelector } from '@/components/GameSelector';
import { VideoFeed } from '@/components/VideoFeed';
import { HandTrackingData } from '@/hooks/useHandTracking';

interface AppState {
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

    const [trackingData, setTrackingData] = useState<HandTrackingData>({
        landmarks: [],
        handedness: []
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
                        path="/room"
                        element={
                            appState.roomCode ? (
                                <div style={{ padding: '20px' }}>
                                    <div style={{ marginBottom: '20px', textAlign: 'center' }}>
                                        <h2>Room: {appState.roomCode}</h2>
                                        <p>Player: {appState.username}</p>
                                        <p style={{ fontSize: '0.9rem', color: '#888' }}>
                                            Share this room code with friends to play together!
                                        </p>
                                    </div>

                                    {/* VideoFeed now passes tracking data up */}
                                    <VideoFeed onTrackingData={setTrackingData} />

                                    {appState.currentGame && (
                                        <GameSelector
                                            game={appState.currentGame}
                                            trackingData={trackingData}
                                            playerId={appState.playerId}
                                            gameState={{ player1_id: appState.playerId }}
                                            onStateUpdate={() => {
                                                // Game state updates handled by game component
                                                // Could send to WebSocket here for multiplayer
                                            }}
                                        />
                                    )}

                                    {!appState.currentGame && (
                                        <div style={{ textAlign: 'center', marginTop: '40px' }}>
                                            <p style={{ fontSize: '1.2rem', marginBottom: '20px' }}>
                                                Select a game to start playing!
                                            </p>
                                            <div style={{ display: 'flex', gap: '20px', justifyContent: 'center', flexWrap: 'wrap' }}>
                                                <button
                                                    onClick={() => setAppState({ ...appState, currentGame: 'air_hockey' })}
                                                    style={{
                                                        padding: '20px 40px',
                                                        fontSize: '1.1rem',
                                                        backgroundColor: '#4CAF50',
                                                        color: 'white',
                                                        border: 'none',
                                                        borderRadius: '8px',
                                                        cursor: 'pointer',
                                                        fontWeight: 'bold'
                                                    }}
                                                >
                                                    🏒 Air Hockey
                                                </button>
                                                <button
                                                    onClick={() => setAppState({ ...appState, currentGame: 'balloon_pop' })}
                                                    style={{
                                                        padding: '20px 40px',
                                                        fontSize: '1.1rem',
                                                        backgroundColor: '#2196F3',
                                                        color: 'white',
                                                        border: 'none',
                                                        borderRadius: '8px',
                                                        cursor: 'pointer',
                                                        fontWeight: 'bold'
                                                    }}
                                                >
                                                    🎈 Balloon Pop
                                                </button>
                                                <button
                                                    onClick={() => setAppState({ ...appState, currentGame: 'laser_dodger' })}
                                                    style={{
                                                        padding: '20px 40px',
                                                        fontSize: '1.1rem',
                                                        backgroundColor: '#FF9800',
                                                        color: 'white',
                                                        border: 'none',
                                                        borderRadius: '8px',
                                                        cursor: 'pointer',
                                                        fontWeight: 'bold'
                                                    }}
                                                >
                                                    ⚡ Laser Dodger
                                                </button>
                                                <button
                                                    onClick={() => setAppState({ ...appState, currentGame: 'pictionary' })}
                                                    style={{
                                                        padding: '20px 40px',
                                                        fontSize: '1.1rem',
                                                        backgroundColor: '#9C27B0',
                                                        color: 'white',
                                                        border: 'none',
                                                        borderRadius: '8px',
                                                        cursor: 'pointer',
                                                        fontWeight: 'bold'
                                                    }}
                                                >
                                                    🎨 Pictionary
                                                </button>
                                            </div>

                                            {/* Debug info */}
                                            <div style={{ marginTop: '40px', fontSize: '0.8rem', color: '#666' }}>
                                                <p>Hand Tracking Status: {trackingData.landmarks.length > 0 ? '✓ Active' : '○ Waiting...'}</p>
                                                {trackingData.landmarks.length > 0 && (
                                                    <>
                                                        <p>Detected hands: {trackingData.handedness.join(', ')}</p>
                                                        <p style={{ color: '#4CAF50', marginTop: '10px' }}>
                                                            {trackingData.landmarks.length === 2
                                                                ? '🎮 Two hands detected! Ready for local multiplayer!'
                                                                : '👋 Show both hands for 2-player mode'}
                                                        </p>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
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