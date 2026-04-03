import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useWebRTC } from '@/hooks/useWebRTC';
import { VideoFeed } from '@/components/VideoFeed';
import { GameSelector } from '@/components/GameSelector';
import { HandTrackingData } from '@/hooks/useHandTracking';

interface RoomViewProps {
    appState: any;
    setAppState: React.Dispatch<React.SetStateAction<any>>;
}

export const RoomView: React.FC<RoomViewProps> = ({ appState, setAppState }) => {
    const { roomCode, username, playerId, currentGame } = appState;

    // Remote peer streams
    const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
    const remoteVideoRef = useRef<HTMLVideoElement>(null);

    // ── FIX 1: Track chess color from server, NOT hardcoded ──────────────────
    const [myChessColor, setMyChessColor] = useState<'white' | 'black' | null>(null);
    // player1_id = the white player's id — used by ARChessGame for color logic
    const [whitePlayerId, setWhitePlayerId] = useState<string | null>(null);

    // Audio/Video controls
    const [audioEnabled, setAudioEnabled] = useState(true);
    const [videoEnabled, setVideoEnabled] = useState(true);
    const [isMicMuted, setIsMicMuted] = useState(false);

    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [externalTrackingData, setExternalTrackingData] = useState<HandTrackingData>(
        { landmarks: [], handedness: [] }
    );
    const externalTrackingDataRef = useRef<React.MutableRefObject<HandTrackingData> | undefined>(undefined);

    // Notifications
    const [notifications, setNotifications] = useState<{ id: number; msg: string }[]>([]);
    const notifCounter = useRef(0);

    const showNotification = useCallback((msg: string) => {
        const id = notifCounter.current++;
        setNotifications((prev) => [...prev, { id, msg }]);
        setTimeout(() => {
            setNotifications((prev) => prev.filter((n) => n.id !== id));
        }, 4000);
    }, []);

    // Get camera + mic on mount
    useEffect(() => {
        let mounted = true;
        navigator.mediaDevices
            .getUserMedia({ video: { width: 640, height: 480 }, audio: true })
            .then((stream) => {
                if (mounted) setLocalStream(stream);
                else stream.getTracks().forEach((t) => t.stop());
            })
            .catch((err) => console.error('❌ Camera/mic error:', err));
        return () => { mounted = false; };
    }, []);

    // ── Stable refs for WebRTC functions — avoids calling hooks out of order —
    // useWebSocket's onMessage callback captures these refs, and useWebRTC
    // populates them after. This breaks the circular dependency without
    // changing hook call order.
    const createOfferRef = useRef<((peerId: string) => void) | null>(null);
    const closePeerRef = useRef<((peerId: string) => void) | null>(null);

    // Handle WebSocket signaling
    const { sendMessage } = useWebSocket({
        roomCode,
        playerId,
        shouldConnect: true,
        onMessage: (message) => {
            const { type, data } = message;

            switch (type) {
                case 'player_joined': {
                    const joiningPlayer = data.username || 'A player';
                    showNotification(`${joiningPlayer} joined the room!`);
                    // Person already in the room initiates the WebRTC offer
                    createOffer(data.player_id);
                    break;
                }

                case 'player_left': {
                    setRemoteStreams((prev) => {
                        const next = new Map(prev);
                        next.delete(data.player_id);
                        return next;
                    });
                    closePeerConnection(data.player_id);
                    break;
                }

                // ── FIX 1: Handle color assignment from backend ───────────────
                case 'chess_color_assign': {
                    const color = data.color as 'white' | 'black';
                    setMyChessColor(color);
                    if (color === 'white') {
                        setWhitePlayerId(playerId);
                    }
                    showNotification(`You are playing as ${color === 'white' ? '⬜ White' : '⬛ Black'}`);
                    break;
                }

                case 'webrtc_offer':
                    handleOffer(data.from_player_id, data.offer);
                    break;
                case 'webrtc_answer':
                    handleAnswer(data.from_player_id, data.answer);
                    break;
                case 'webrtc_ice_candidate':
                    handleIceCandidate(data.from_player_id, data.candidate);
                    break;
            }
        },
        onScribbleMessage: () => { },
    });

    const {
        createOffer,
        handleOffer,
        handleAnswer,
        handleIceCandidate,
        closePeerConnection,
        setMicEnabled,
    } = useWebRTC({
        localStream,
        sendSignal: sendMessage,
        onRemoteStream: (peerId, stream) => {
            setRemoteStreams((prev) => new Map(prev).set(peerId, stream));
        },
    });

    // ── FIX 2: Remote video — set srcObject safely after mount ───────────────
    useEffect(() => {
        if (remoteStreams.size === 0 || !remoteVideoRef.current) return;
        const firstStream = Array.from(remoteStreams.values())[0];
        const videoEl = remoteVideoRef.current;
        if (videoEl.srcObject === firstStream) return; // already set
        videoEl.srcObject = firstStream;
        // play() needs user gesture on some browsers — catch silently,
        // the video will play once the user interacts
        videoEl.play().catch(() => {
            // On autoplay block: add a click-to-play fallback
            const onInteraction = () => {
                videoEl.play().catch(console.error);
                document.removeEventListener('click', onInteraction);
            };
            document.addEventListener('click', onInteraction);
        });
    }, [remoteStreams]);

    // Local stream audio/video track toggles
    useEffect(() => {
        if (!localStream) return;
        localStream.getAudioTracks().forEach((t) => { t.enabled = audioEnabled; });
        localStream.getVideoTracks().forEach((t) => { t.enabled = videoEnabled; });
    }, [localStream, audioEnabled, videoEnabled]);

    // Mic mute toggle — also mutes the WebRTC outgoing audio track
    const toggleMic = useCallback(() => {
        const next = !isMicMuted;
        setIsMicMuted(next);
        setMicEnabled(!next); // setMicEnabled(true) = unmuted
        if (localStream) {
            localStream.getAudioTracks().forEach((t) => { t.enabled = !next; });
        }
    }, [isMicMuted, setMicEnabled, localStream]);

    return (
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', height: '100%' }}>

            {/* Toast Notifications */}
            <div style={{
                position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)',
                zIndex: 9999, display: 'flex', flexDirection: 'column', gap: '10px',
            }}>
                {notifications.map((n) => (
                    <div key={n.id} style={{
                        background: 'rgba(76,175,80,0.9)', color: 'white',
                        padding: '12px 24px', borderRadius: '8px',
                        boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
                        animation: 'fadeInOut 4s forwards', fontWeight: 'bold',
                    }}>
                        {n.msg}
                    </div>
                ))}
            </div>

            {/* Header */}
            <div style={{ marginBottom: '20px', textAlign: 'center' }}>
                <h2>Room: {roomCode}</h2>
                <div style={{
                    display: 'flex', justifyContent: 'center', gap: '8px',
                    fontSize: '0.9rem', color: '#aaa', margin: '4px 0',
                }}>
                    <span>Player ID: {playerId}</span>
                    <span>•</span>
                    <span>Username: {username}</span>
                    {/* ── FIX 1: Show chess color ── */}
                    {myChessColor && (
                        <>
                            <span>•</span>
                            <span style={{ color: myChessColor === 'white' ? '#fff' : '#aaa', fontWeight: 700 }}>
                                Chess: {myChessColor === 'white' ? '⬜ White' : '⬛ Black'}
                            </span>
                        </>
                    )}
                </div>

                {/* Controls */}
                <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginTop: '10px' }}>
                    {/* ── FIX 3: Mic button now uses toggleMic which mutes WebRTC too ── */}
                    <button
                        onClick={toggleMic}
                        style={{
                            padding: '8px 16px', borderRadius: '20px', border: 'none',
                            background: isMicMuted ? '#ef4444' : '#3b82f6',
                            color: 'white', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '5px',
                        }}
                    >
                        {isMicMuted ? '🔇 Mic Off' : '🎤 Mic On'}
                    </button>
                    <button
                        onClick={() => setVideoEnabled((v) => !v)}
                        style={{
                            padding: '8px 16px', borderRadius: '20px', border: 'none',
                            background: videoEnabled ? '#3b82f6' : '#ef4444',
                            color: 'white', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '5px',
                        }}
                    >
                        {videoEnabled ? '📷 Cam On' : '🚫 Cam Off'}
                    </button>
                </div>
            </div>

            {/* Local video feed + hand tracking */}
            <VideoFeed
                localStream={localStream}
                onTrackingData={(data, dataRef) => {
                    setExternalTrackingData(data);
                    externalTrackingDataRef.current = dataRef;
                }}
            />

            {/* ── FIX 2: Remote video PiP ──────────────────────────────────── */}
            {remoteStreams.size > 0 && (
                <div style={{
                    position: 'fixed', bottom: '20px', left: '20px', zIndex: 1000,
                    width: '320px', height: '240px', borderRadius: '12px',
                    overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                    border: '2px solid #3b82f6', background: '#000',
                }}>
                    <video
                        ref={remoteVideoRef}
                        autoPlay
                        playsInline
                        // Do NOT mute — we want to hear the opponent
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                    {/* ── FIX 3: Mic status indicator on remote feed ────────── */}
                    <div style={{
                        position: 'absolute', bottom: '5px', left: '5px',
                        background: 'rgba(0,0,0,0.7)', padding: '4px 10px',
                        borderRadius: '4px', fontSize: '12px', color: '#fff',
                        display: 'flex', alignItems: 'center', gap: '6px',
                    }}>
                        <span>Opponent</span>
                    </div>
                    {/* Mic toggle visible during game so user doesn't lose it */}
                    <button
                        onClick={toggleMic}
                        style={{
                            position: 'absolute', top: '6px', right: '6px',
                            background: isMicMuted ? 'rgba(239,68,68,0.85)' : 'rgba(59,130,246,0.85)',
                            border: 'none', borderRadius: '8px',
                            padding: '4px 10px', color: '#fff', fontSize: '13px',
                            cursor: 'pointer', backdropFilter: 'blur(4px)',
                        }}
                    >
                        {isMicMuted ? '🔇' : '🎤'}
                    </button>
                </div>
            )}

            {/* Game area */}
            {currentGame ? (
                <div style={{ flex: 1, position: 'relative' }}>
                    <GameSelector
                        game={currentGame}
                        trackingData={externalTrackingData}
                        trackingDataRef={externalTrackingDataRef.current}
                        playerId={playerId}
                        gameState={{
                            // ── FIX 1: pass the actual white player's id ──────
                            player1_id: whitePlayerId ?? playerId,
                            my_color: myChessColor ?? 'white',
                        }}
                        onStateUpdate={() => { }}
                        sendMessage={sendMessage}
                    />
                </div>
            ) : (
                <div style={{ textAlign: 'center', marginTop: '40px' }}>
                    <p style={{ fontSize: '1.2rem', marginBottom: '20px' }}>
                        Select a game to start playing!
                    </p>
                    <div style={{ display: 'flex', gap: '20px', justifyContent: 'center', flexWrap: 'wrap' }}>
                        {[
                            { type: 'air_hockey', label: '🏒 Air Hockey', color: '#4CAF50' },
                            { type: 'balloon_pop', label: '🎈 Balloon Pop', color: '#2196F3' },
                            { type: 'chess', label: '♟️ Chess', color: '#00BCD4' },
                            { type: 'scribble', label: '✏️ Scribble Draw', color: '#F59E0B' },
                            { type: 'face_puzzle', label: '🧩 Face Puzzle', color: '#9C27B0' },
                        ].map(({ type, label, color }) => (
                            <button
                                key={type}
                                onClick={() => {
                                    sendMessage('game_selected', { game_type: type });
                                    setAppState({ ...appState, currentGame: type });
                                }}
                                style={{
                                    padding: '20px 40px', fontSize: '1.1rem',
                                    backgroundColor: color, color: 'white',
                                    border: 'none', borderRadius: '8px',
                                    cursor: 'pointer', fontWeight: 'bold',
                                }}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <style>{`
                @keyframes fadeInOut {
                    0%   { opacity: 0; transform: translateY(-20px); }
                    10%  { opacity: 1; transform: translateY(0); }
                    90%  { opacity: 1; transform: translateY(0); }
                    100% { opacity: 0; transform: translateY(-20px); }
                }
            `}</style>
        </div>
    );
};