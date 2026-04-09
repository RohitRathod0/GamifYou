import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useWebRTC } from '@/hooks/useWebRTC';
import { VideoFeed } from '@/components/VideoFeed';
import { GameSelector } from '@/components/GameSelector';
import { BackgroundConfig } from '@/components/Background/types';
import { VirtualBgPanel } from '@/components/VirtualBgPanel';
import { GamesGrid } from '@/components/sections/GamesGrid';
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

    const showNotification = useCallback((msg: string) => {
        const id = notifCounter.current++;
        setNotifications(prev => [...prev, { id, msg }]);
        setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 4000);
    }, []);

    const pendingOffersRef = useRef<string[]>([]);

    // ── Back-button interception ───────────────────────────────────────────────
    useEffect(() => {
        if (currentGame) {
            window.history.pushState({ inGame: true, game: currentGame }, '');
        }
    }, [currentGame]);

    useEffect(() => {
        const handlePopState = (e: PopStateEvent) => {
            if (e.state?.inGame) {
                setAppState((prev: any) => ({ ...prev, currentGame: null }));
            }
        };
        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, [setAppState]);

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

    const handleLeaveGame = useCallback(() => {
        setAppState((prev: any) => ({ ...prev, currentGame: null }));
        setIsListening(false);
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

    const { isListening, setIsListening, isTalking, toggleListening } = useVoiceCommand(handleVoiceIntent);

    useEffect(() => {
        const handler = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            setIsListening(detail.active);
            if (detail.active) showNotification('🎙️ Voice active (Your Turn)');
            else showNotification('🔇 Voice inactive');
        };
        window.addEventListener('set_voice_active', handler);
        return () => window.removeEventListener('set_voice_active', handler);
    }, [setIsListening, showNotification]);

    // ── RENDER ────────────────────────────────────────────────────────────────

    return (
        <div style={{ minHeight: '100vh', background: currentGame ? '#0a0a0a' : '#ffffff', display: 'flex', flexDirection: 'column' }}>

            {/* ── Toast Notifications ───────────────────────────────────────────── */}
            <div style={{ position: 'fixed', top: 80, left: '50%', transform: 'translateX(-50%)', zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
                {notifications.map(n => (
                    <div key={n.id} style={{
                        background: '#111111', color: '#ffffff',
                        padding: '14px 20px', borderRadius: 12,
                        fontSize: 14, fontWeight: 500,
                        boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                        display: 'flex', alignItems: 'center', gap: 10,
                        animation: 'fadeInOut 4s forwards',
                        whiteSpace: 'nowrap',
                    }}>
                        {n.msg}
                    </div>
                ))}
            </div>

            {/* ── Pre-game sticky header ────────────────────────────────────────── */}
            {!currentGame && (
                <div style={{
                    background: '#ffffff',
                    borderBottom: '1px solid rgba(0,0,0,0.06)',
                    padding: '16px clamp(16px,4vw,48px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    flexWrap: 'wrap', gap: 12,
                    position: 'sticky', top: 0, zIndex: 50,
                }}>
                    {/* Room info */}
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ fontFamily: 'monospace', fontSize: 22, fontWeight: 800, color: '#111111', letterSpacing: '0.04em' }}>
                                {roomCode}
                            </span>
                            {myChessColor && (
                                <span style={myChessColor === 'white'
                                    ? { background: '#f3f4f6', color: '#374151', borderRadius: 100, padding: '4px 12px', fontSize: 12, fontWeight: 600, border: '1px solid rgba(0,0,0,0.1)' }
                                    : { background: '#111111', color: '#ffffff', borderRadius: 100, padding: '4px 12px', fontSize: 12, fontWeight: 600 }
                                }>
                                    {myChessColor === 'white' ? '⬜ White' : '⬛ Black'}
                                </span>
                            )}
                        </div>
                        <p style={{ fontSize: 14, color: '#6b7280', marginTop: 2 }}>
                            Playing as <strong style={{ color: '#374151' }}>{username}</strong>
                        </p>
                    </div>

                    {/* Control pills (Meet style) */}
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                        {/* Mic */}
                        <button onClick={toggleMic} title={isMicMuted ? "Turn on microphone" : "Turn off microphone"}
                            style={{
                                width: 44, height: 44, borderRadius: '50%', border: 'none', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                background: isMicMuted ? '#ea4335' : '#3c4043', color: '#fff',
                                transition: 'all 0.2s',
                            }}>
                            {isMicMuted ? (
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="2" x2="22" y1="2" y2="22"/><path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2"/><path d="M5 10v2a7 7 0 0 0 12 5"/><path d="M15 9.34V5a3 3 0 0 0-5.68-1.33"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
                            ) : (
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
                            )}
                        </button>

                        {/* Camera */}
                        <button onClick={() => setVideoEnabled(v => !v)} title={!videoEnabled ? "Turn on camera" : "Turn off camera"}
                            style={{
                                width: 44, height: 44, borderRadius: '50%', border: 'none', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                background: !videoEnabled ? '#ea4335' : '#3c4043', color: '#fff',
                                transition: 'all 0.2s',
                            }}>
                            {!videoEnabled ? (
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="2" x2="22" y1="2" y2="22"/><path d="M7 5H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 1.71-1.03"/><path d="M22 17.5V7a2 2 0 0 0-2-2h-8.5"/><path d="M16 12l7-5v10l-3.32-2.37"/></svg>
                            ) : (
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect width="15" height="14" x="1" y="5" rx="2" ry="2"/></svg>
                            )}
                        </button>

                        {/* Voice Command (Sparkles) */}
                        <button onClick={toggleListening} title={isListening ? "Turn off continuous voice recognition" : "Turn on continuous voice recognition"}
                            style={{
                                width: 44, height: 44, borderRadius: '50%', border: 'none', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                background: isListening ? (isTalking ? '#ea4335' : '#0369a1') : '#3c4043', color: '#fff',
                                transition: 'all 0.2s',
                            }}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/></svg>
                        </button>

                        {/* More Options / 3 dots (Virtual BG) */}
                        <button onClick={() => setShowBgPanel(p => !p)} title="Virtual Background & Options"
                            style={{
                                width: 44, height: 44, borderRadius: '50%', border: 'none', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                background: bgConfig.type !== 'none' ? '#0369a1' : '#3c4043', color: '#fff',
                                transition: 'all 0.2s',
                            }}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>
                        </button>
                    </div>
                </div>
            )}

            {/* ── Virtual BG Panel ──────────────────────────────────────────────── */}
            {showBgPanel && (
                <>
                    <div onClick={() => setShowBgPanel(false)} style={{ position: 'fixed', inset: 0, zIndex: 499, background: 'transparent' }} />
                    <VirtualBgPanel bgConfig={bgConfig} onChange={setBgConfig} onClose={() => setShowBgPanel(false)} modelReady={bgModelReady} />
                </>
            )}

            {/* ── Local Video Feed — always visible top-right ───────────────────── */}
            <VideoFeed localStream={localStream} externalBgConfig={bgConfig} onBgConfigChange={setBgConfig} onModelReady={setBgModelReady} />

            {/* ── Remote video PiP ──────────────────────────────────────────────── */}
            {remoteStreams.size > 0 && (
                <div style={{
                    position: 'fixed', bottom: 20, left: 20, zIndex: 1000,
                    width: 320, height: 240, borderRadius: 16, overflow: 'hidden',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.15)', border: '1px solid rgba(0,0,0,0.1)', background: '#000',
                }}>
                    <video ref={remoteVideoRef} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <div style={{ position: 'absolute', bottom: 0, left: 0, background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 12, padding: '4px 10px', borderRadius: '0 0 0 16px' }}>Opponent</div>
                    <button onClick={toggleMic} style={{ position: 'absolute', top: 8, right: 8, background: isMicMuted ? 'rgba(239,68,68,0.85)' : 'rgba(59,130,246,0.85)', border: 'none', borderRadius: 8, padding: '4px 10px', color: '#fff', fontSize: 13, cursor: 'pointer' }}>
                        {isMicMuted ? '🔇' : '🎤'}
                    </button>
                </div>
            )}

            {/* ── Game area ─────────────────────────────────────────────────────── */}
            {currentGame ? (
                <div style={{ flex: 1, position: 'relative' }}>
                    {/* ← Games overlay button */}
                    <button onClick={handleLeaveGame} style={{
                        position: 'fixed', top: 16, left: 16, zIndex: 500,
                        padding: '8px 18px', borderRadius: 20, border: 'none',
                        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
                        color: '#fff', fontSize: 14, fontWeight: 700,
                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                        boxShadow: '0 2px 12px rgba(0,0,0,0.5)', letterSpacing: '0.02em',
                    }}>
                        ← Games
                    </button>

                    {/* Voice overlay button (in-game) */}
                    <button onClick={toggleListening} title="Toggle continuous voice recognition" style={{
                        position: 'fixed', top: 16, left: 120, zIndex: 500,
                        padding: '8px 18px', borderRadius: 20, border: 'none',
                        background: isListening ? (isTalking ? '#ef4444' : '#f59e0b') : '#8b5cf6',
                        color: '#fff', fontSize: 14, fontWeight: 700,
                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                        boxShadow: isListening ? '0 0 12px #ef4444' : '0 2px 12px rgba(0,0,0,0.5)',
                        backdropFilter: 'blur(8px)', transition: 'all 0.2s', letterSpacing: '0.02em',
                    }}>
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
                /* ── Game picker ── */
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <GamesGrid onSelectGame={(type) => {
                        sendMessage('game_selected', { game_type: type });
                        setAppState((prev: any) => ({ ...prev, currentGame: type }));
                    }} />
                </div>
            )}

            <style>{`@keyframes fadeInOut { 0%{opacity:0;transform:translateY(-16px)} 10%{opacity:1;transform:translateY(0)} 90%{opacity:1;transform:translateY(0)} 100%{opacity:0;transform:translateY(-16px)} }`}</style>
        </div>
    );
};