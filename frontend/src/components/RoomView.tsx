import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useWebRTC } from '@/hooks/useWebRTC';
import { VideoFeed } from '@/components/VideoFeed';
import { GameSelector } from '@/components/GameSelector';
import { BackgroundConfig } from '@/components/Background/types';
import { VirtualBgPanel } from '@/components/VirtualBgPanel';
import { useVoiceCommand } from '@/hooks/useVoiceCommand';
// removed HandTrackingData import

interface RoomViewProps {
    appState: any;
    setAppState: React.Dispatch<React.SetStateAction<any>>;
}

export const RoomView: React.FC<RoomViewProps> = ({ appState, setAppState }) => {
    const { roomCode, username, playerId, currentGame } = appState;

    const remoteVideoRef = useRef<HTMLVideoElement>(null);
    const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());

    const [myChessColor, setMyChessColor] = useState<'white' | 'black' | null>(null);
    const [whitePlayerId, setWhitePlayerId] = useState<string | null>(null);
    const [incomingChessState, setIncomingChessState] = useState<any>(null);

    const [isMicMuted, setIsMicMuted] = useState(false);
    const [videoEnabled, setVideoEnabled] = useState(true);
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);

    const [bgConfig, setBgConfig] = useState<BackgroundConfig>({ type: 'none' });
    const [showBgPanel, setShowBgPanel] = useState(false);
    const [bgModelReady, setBgModelReady] = useState(false);

    const [notifications, setNotifications] = useState<{ id: number; msg: string }[]>([]);
    const notifCounter = useRef(0);

    // Wait to define hook until callback is defined to avoid dependency issues

    const showNotification = useCallback((msg: string) => {
        const id = notifCounter.current++;
        setNotifications(prev => [...prev, { id, msg }]);
        setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 4000);
    }, []);

    const pendingOffersRef = useRef<string[]>([]);

    // ── Back-button interception ───────────────────────────────────────────────
    // When a game starts, push a dummy history entry. Browser "Back" fires
    // popstate — we intercept it and clear currentGame (stay in /room) instead
    // of letting the router navigate away to /lobby.
    useEffect(() => {
        if (currentGame) {
            window.history.pushState({ inGame: true, game: currentGame }, '');
        }
    }, [currentGame]);

    useEffect(() => {
        const handlePopState = (e: PopStateEvent) => {
            if (e.state?.inGame) {
                // Stay in /room — just clear the active game
                setAppState((prev: any) => ({ ...prev, currentGame: null }));
            }
        };
        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, [setAppState]);
    // ──────────────────────────────────────────────────────────────────────────

    // Get camera + mic ONCE, share everywhere
    useEffect(() => {
        let mounted = true;
        navigator.mediaDevices
            .getUserMedia({ video: { width: 640, height: 480 }, audio: true })
            .then(stream => {
                if (!mounted) { stream.getTracks().forEach(t => t.stop()); return; }
                setLocalStream(stream);
            })
            .catch(err => console.error('❌ Camera/mic error:', err));
        return () => { mounted = false; };
    }, []);

    useEffect(() => {
        if (!localStream || pendingOffersRef.current.length === 0) return;
        const pending = [...pendingOffersRef.current];
        pendingOffersRef.current = [];
        pending.forEach(peerId => {
            console.log('[WebRTC] Retrying offer for', peerId, '— stream now ready');
            createOffer(peerId);
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [localStream]);

    useEffect(() => {
        if (!localStream) return;
        localStream.getVideoTracks().forEach(t => { t.enabled = videoEnabled; });
    }, [localStream, videoEnabled]);

    const { sendMessage } = useWebSocket({
        roomCode,
        playerId,
        shouldConnect: true,
        onMessage: (message) => {
            const { type, data } = message;
            switch (type) {
                case 'player_joined':
                    showNotification(`${data.username || 'A player'} joined!`);
                    if (localStream) {
                        createOffer(data.player_id);
                    } else {
                        pendingOffersRef.current.push(data.player_id);
                    }
                    break;
                case 'player_left':
                    setRemoteStreams(prev => { const m = new Map(prev); m.delete(data.player_id); return m; });
                    closePeerConnection(data.player_id);
                    break;

                // Only fires after chess is selected (not on connect)
                case 'chess_color_assign':
                    setMyChessColor(data.color);
                    if (data.color === 'white') setWhitePlayerId(playerId);
                    showNotification(`You are ${data.color === 'white' ? '⬜ White' : '⬛ Black'}`);
                    window.dispatchEvent(new CustomEvent('chess_color_assign', { detail: { color: data.color } }));
                    break;

                case 'chess_color_clear':
                    setMyChessColor(null);
                    break;

                case 'game_state_update':
                    setIncomingChessState({ ...data.state, _ts: Date.now() });
                    break;

                case 'webrtc_offer': handleOffer(data.from_player_id, data.offer); break;
                case 'webrtc_answer': handleAnswer(data.from_player_id, data.answer); break;
                case 'webrtc_ice_candidate': handleIceCandidate(data.from_player_id, data.candidate); break;
            }
        },
        onScribbleMessage: () => { },
    });

    const { createOffer, handleOffer, handleAnswer, handleIceCandidate, closePeerConnection, setMicEnabled } =
        useWebRTC({
            localStream, sendSignal: sendMessage, onRemoteStream: (peerId, stream) => {
                setRemoteStreams(prev => new Map(prev).set(peerId, stream));
            }
        });

    useEffect(() => {
        if (remoteStreams.size === 0 || !remoteVideoRef.current) return;
        const stream = Array.from(remoteStreams.values())[0];
        const el = remoteVideoRef.current;
        if (el.srcObject === stream) return;
        el.srcObject = stream;
        el.play().catch(() => {
            const resume = () => { el.play().catch(console.error); document.removeEventListener('click', resume); };
            document.addEventListener('click', resume);
        });
    }, [remoteStreams]);

    const toggleMic = useCallback(() => {
        const next = !isMicMuted;
        setIsMicMuted(next);
        setMicEnabled(!next);
        localStream?.getAudioTracks().forEach(t => { t.enabled = !next; });
    }, [isMicMuted, setMicEnabled, localStream]);

    // Leave active game → return to game picker (stay in /room)
    const handleLeaveGame = useCallback(() => {
        setAppState((prev: any) => ({ ...prev, currentGame: null }));
    }, [setAppState]);

    const handleVoiceIntent = useCallback((result: any) => {
        if (result && result.intent) {
            switch (result.intent) {
                case 'START_GAME':
                    sendMessage('game_selected', { game_type: result.action.game_type });
                    setAppState((prev: any) => ({ ...prev, currentGame: result.action.game_type }));
                    showNotification(`Voice: Starting game!`);
                    break;
                case 'CHANGE_BG':
                    setBgConfig(result.action.bgConfig);
                    showNotification('Voice: Changing background...');
                    break;
                case 'MUTE_MIC':
                    if (!isMicMuted) toggleMic();
                    showNotification('Voice: Microphone muted.');
                    break;
                case 'UNMUTE_MIC':
                    if (isMicMuted) toggleMic();
                    showNotification('Voice: Microphone unmuted.');
                    break;
                case 'LEAVE_GAME':
                    handleLeaveGame();
                    showNotification('Voice: Leaving game.');
                    break;
                case 'CHESS_MOVE':
                    if (currentGame === 'chess') {
                        window.dispatchEvent(new CustomEvent('chess_voice_move', { detail: result.action }));
                        showNotification(`Voice: ♟️ ${result.action.from} → ${result.action.to}`);
                    }
                    break;
                default:
                    if (currentGame) {
                        window.dispatchEvent(new CustomEvent('voice_command_raw', { detail: result }));
                        showNotification(`🎧 "${result.text}"`);
                    } else {
                        showNotification(`Voice: Could not process "${result.text}"`);
                    }
            }
        }
    }, [setAppState, sendMessage, showNotification, isMicMuted, toggleMic, handleLeaveGame, currentGame]);

    const { isListening, isTalking, toggleListening } = useVoiceCommand(handleVoiceIntent);

    return (
        <div style={{ padding: currentGame ? 0 : '20px', display: 'flex', flexDirection: 'column', height: '100%' }}>

            {/* Toasts */}
            <div style={{ position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {notifications.map(n => (
                    <div key={n.id} style={{ background: 'rgba(76,175,80,0.9)', color: '#fff', padding: '12px 24px', borderRadius: 8, boxShadow: '0 4px 6px rgba(0,0,0,0.3)', animation: 'fadeInOut 4s forwards', fontWeight: 'bold' }}>
                        {n.msg}
                    </div>
                ))}
            </div>

            {/* Header — unmounted while a game is active */}
            {!currentGame && (
                <div style={{ marginBottom: 20, textAlign: 'center' }}>
                    <h2>Room: {roomCode}</h2>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 8, fontSize: '0.9rem', color: '#aaa', margin: '4px 0' }}>
                        <span>{username}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 10, position: 'relative' }}>
                        <button onClick={toggleMic} style={{ padding: '8px 16px', borderRadius: 20, border: 'none', background: isMicMuted ? '#ef4444' : '#3b82f6', color: '#fff', cursor: 'pointer' }}>
                            {isMicMuted ? '🔇 Mic Off' : '🎤 Mic On'}
                        </button>
                        <button onClick={() => setVideoEnabled(v => !v)} style={{ padding: '8px 16px', borderRadius: 20, border: 'none', background: videoEnabled ? '#3b82f6' : '#ef4444', color: '#fff', cursor: 'pointer' }}>
                            {videoEnabled ? '📷 Cam On' : '🚫 Cam Off'}
                        </button>
                        
                        {/* Virtual BG Button */}
                        <button 
                            onClick={() => setShowBgPanel(p => !p)} 
                            style={{ 
                                padding: '8px 16px', 
                                borderRadius: 20, 
                                border: 'none', 
                                background: bgConfig.type !== 'none' ? '#06b6d4' : 'rgba(255,255,255,0.15)', 
                                color: '#fff', 
                                cursor: 'pointer' 
                            }}
                        >
                            {bgConfig.type !== 'none' ? '🎭 BG: ON' : '🎭 Virtual BG'}
                        </button>

                        {/* Voice Command Button */}
                        <button 
                            onClick={toggleListening}
                            style={{ 
                                padding: '8px 16px', 
                                borderRadius: 20, 
                                border: 'none', 
                                background: isListening ? (isTalking ? '#ef4444' : '#f59e0b') : '#8b5cf6', 
                                color: '#fff', 
                                cursor: 'pointer',
                                boxShadow: isListening ? '0 0 12px #ef4444' : 'none',
                                transition: 'all 0.2s',
                                fontWeight: 'bold'
                            }}
                            title="Toggle continuous voice recognition"
                        >
                            {isListening ? (isTalking ? '🗣️ Hearing...' : '🎙️ Active') : '🤖 Voice Action'}
                        </button>
                    </div>
                </div>
            )}

            {showBgPanel && (
                <>
                    <div 
                        onClick={() => setShowBgPanel(false)} 
                        style={{ position: 'fixed', inset: 0, zIndex: 499, background: 'transparent' }} 
                    />
                    <VirtualBgPanel 
                        bgConfig={bgConfig} 
                        onChange={setBgConfig} 
                        onClose={() => setShowBgPanel(false)} 
                        modelReady={bgModelReady} 
                    />
                </>
            )}

            {/* Local Video Feed — Always visible in top right */}
            <VideoFeed 
                localStream={localStream} 
                externalBgConfig={bgConfig} 
                onBgConfigChange={setBgConfig} 
                onModelReady={setBgModelReady} 
            />

            {/* Remote video PiP — shown during games too */}
            {remoteStreams.size > 0 && (
                <div style={{ position: 'fixed', bottom: 20, left: 20, zIndex: 1000, width: 320, height: 240, borderRadius: 12, overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', border: '2px solid #3b82f6', background: '#000' }}>
                    <video ref={remoteVideoRef} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <div style={{ position: 'absolute', bottom: 5, left: 5, background: 'rgba(0,0,0,0.7)', padding: '4px 10px', borderRadius: 4, fontSize: 12, color: '#fff' }}>Opponent</div>
                    <button onClick={toggleMic} style={{ position: 'absolute', top: 6, right: 6, background: isMicMuted ? 'rgba(239,68,68,0.85)' : 'rgba(59,130,246,0.85)', border: 'none', borderRadius: 8, padding: '4px 10px', color: '#fff', fontSize: 13, cursor: 'pointer' }}>
                        {isMicMuted ? '🔇' : '🎤'}
                    </button>
                </div>
            )}

            {/* Game area */}
            {currentGame ? (
                <div style={{ flex: 1, position: 'relative' }}>
                    {/* ← Games button — fixed overlay so it's always reachable */}
                    <button
                        onClick={handleLeaveGame}
                        style={{
                            position: 'fixed', top: 16, left: 16, zIndex: 500,
                            padding: '8px 18px', borderRadius: 20, border: 'none',
                            background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
                            color: '#fff', fontSize: 14, fontWeight: 700,
                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                            boxShadow: '0 2px 12px rgba(0,0,0,0.5)',
                            letterSpacing: '0.02em',
                        }}
                    >
                        ← Games
                    </button>
                    
                    {/* Voice Command Button (In-Game) */}
                    <button 
                        onClick={toggleListening}
                        style={{ 
                            position: 'fixed', top: 16, left: 120, zIndex: 500,
                            padding: '8px 18px', borderRadius: 20, border: 'none', 
                            background: isListening ? (isTalking ? '#ef4444' : '#f59e0b') : '#8b5cf6', 
                            color: '#fff', fontSize: 14, fontWeight: 700,
                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                            boxShadow: isListening ? '0 0 12px #ef4444' : '0 2px 12px rgba(0,0,0,0.5)',
                            backdropFilter: 'blur(8px)',
                            transition: 'all 0.2s',
                            letterSpacing: '0.02em',
                        }}
                        title="Toggle continuous voice recognition"
                    >
                        {isListening ? (isTalking ? '🗣️ Hearing...' : '🎙️ VAD Active') : '🤖 Voice Cmd'}
                    </button>

                    <GameSelector
                        game={currentGame}
                        playerId={playerId}
                        gameState={{
                            player1_id: whitePlayerId ?? playerId,
                            my_color: myChessColor ?? 'white',
                            room_code: roomCode,
                            incomingState: incomingChessState,
                        }}
                        localStream={localStream}
                        onStateUpdate={() => { }}
                        sendMessage={sendMessage}
                    />
                </div>
            ) : (
                <div style={{ textAlign: 'center', marginTop: 40, width: '100%', maxWidth: '1200px', margin: '40px auto 0' }}>
                    <p style={{ fontSize: '2rem', marginBottom: 40, color: '#ffffff', fontWeight: '800', textShadow: '0 4px 12px rgba(0,0,0,0.3)', letterSpacing: '0.05em' }}>Select a Game</p>
                    <div style={{ 
                        display: 'grid', 
                        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', 
                        gap: '24px', 
                        padding: '0 20px',
                        justifyContent: 'center',
                        alignItems: 'stretch'
                    }}>
                        {[
                            { type: 'air_hockey', label: 'Air Hockey', color: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)', image: '/game-assets/air_hockey.png' },
                            { type: 'chess', label: 'Chess', color: 'linear-gradient(135deg, #2c3e50 0%, #3498db 100%)', image: '/game-assets/chess.jpg' },
                            { type: 'scribble', label: 'Scribble Draw', color: 'linear-gradient(135deg, #f2994a 0%, #f2c94c 100%)', image: '/game-assets/scribble.jpg' },
                            { type: 'face_puzzle', label: 'Face Puzzle', color: 'linear-gradient(135deg, #8E2DE2 0%, #4A00E0 100%)', image: '/game-assets/puzzle.jpg' },
                            { type: 'balloon_pop', label: 'Balloon Pop', color: 'linear-gradient(135deg, #FF416C 0%, #FF4B2B 100%)', image: '/game-assets/balloon.png' },
                        ].map(({ type, label, color, image }) => (
                            <button key={type}
                                onClick={() => {
                                    sendMessage('game_selected', { game_type: type });
                                    setAppState({ ...appState, currentGame: type });
                                }}
                                style={{
                                    position: 'relative',
                                    height: '220px',
                                    background: color,
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: '24px',
                                    cursor: 'pointer',
                                    overflow: 'hidden',
                                    boxShadow: '0 10px 30px rgba(0,0,0,0.2), inset 0 0 0 1px rgba(255,255,255,0.2)',
                                    transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'flex-end',
                                    padding: '0',
                                    transform: 'scale(1)',
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.transform = 'scale(1.05) translateY(-8px)';
                                    e.currentTarget.style.boxShadow = '0 20px 40px rgba(0,0,0,0.4), inset 0 0 0 2px rgba(255,255,255,0.4)';
                                    const img = e.currentTarget.querySelector('img');
                                    if(img) img.style.transform = 'scale(1.15)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.transform = 'scale(1) translateY(0)';
                                    e.currentTarget.style.boxShadow = '0 10px 30px rgba(0,0,0,0.2), inset 0 0 0 1px rgba(255,255,255,0.2)';
                                    const img = e.currentTarget.querySelector('img');
                                    if(img) img.style.transform = 'scale(1)';
                                }}
                            >
                                {image ? (
                                    <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'hidden' }}>
                                        <img src={image} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.85, mixBlendMode: 'normal', transition: 'transform 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275)' }} />
                                        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: 'linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.8) 100%)' }} />
                                    </div>
                                ) : (
                                    <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '5rem', opacity: 0.4 }}>
                                        🎈
                                    </div>
                                )}
                                <div style={{
                                    width: '100%',
                                    padding: '24px',
                                    zIndex: 1,
                                    display: 'flex',
                                    justifyContent: 'center',
                                    background: 'transparent'
                                }}>
                                    <span style={{ fontSize: '1.4rem', fontWeight: '800', letterSpacing: '1.5px', textTransform: 'uppercase', textShadow: '0 2px 10px rgba(0,0,0,0.9)' }}>
                                        {label}
                                    </span>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <style>{`@keyframes fadeInOut { 0%{opacity:0;transform:translateY(-20px)} 10%{opacity:1;transform:translateY(0)} 90%{opacity:1;transform:translateY(0)} 100%{opacity:0;transform:translateY(-20px)} }`}</style>
        </div>
    );
};