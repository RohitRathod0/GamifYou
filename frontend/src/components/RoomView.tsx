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

    const remoteVideoRef = useRef<HTMLVideoElement>(null);
    const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());

    // FIX 1: chess color from server, not hardcoded
    const [myChessColor, setMyChessColor] = useState<'white' | 'black' | null>(null);
    const [whitePlayerId, setWhitePlayerId] = useState<string | null>(null);

    // FIX 1: incoming opponent move state — passed down to ARChessGame
    const [incomingChessState, setIncomingChessState] = useState<any>(null);

    const [isMicMuted, setIsMicMuted] = useState(false);
    const [videoEnabled, setVideoEnabled] = useState(true);

    // FIX 2+3: ONE shared stream — feeds VideoFeed, WebRTC, and ARChessGame camera
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);

    const [externalTrackingData, setExternalTrackingData] = useState<HandTrackingData>(
        { landmarks: [], handedness: [] }
    );
    const externalTrackingDataRef = useRef<React.MutableRefObject<HandTrackingData> | undefined>(undefined);

    const [notifications, setNotifications] = useState<{ id: number; msg: string }[]>([]);
    const notifCounter = useRef(0);

    const showNotification = useCallback((msg: string) => {
        const id = notifCounter.current++;
        setNotifications(prev => [...prev, { id, msg }]);
        setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 4000);
    }, []);

    // Track peer IDs that arrived before our stream was ready
    const pendingOffersRef = useRef<string[]>([]);

    // FIX 2+3: get camera + mic ONCE here, share to everything
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

    // FIX 4 (one-way video): once stream arrives, retry any offers that were
    // queued before the stream was ready — this is the race condition that
    // causes Device 1 camera to never reach Device 2.
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

    // Single WebSocket for signaling + game state
    const { sendMessage } = useWebSocket({
        roomCode,
        playerId,
        shouldConnect: true,
        onMessage: (message) => {
            const { type, data } = message;
            switch (type) {
                case 'player_joined':
                    showNotification(`${data.username || 'A player'} joined!`);
                    // FIX 4 (one-way video): if our stream isn't ready yet,
                    // queue the offer — the useEffect above retries it once ready
                    if (localStream) {
                        createOffer(data.player_id);
                    } else {
                        pendingOffersRef.current.push(data.player_id);
                        console.log('[WebRTC] Stream not ready, queuing offer for', data.player_id);
                    }
                    break;
                case 'player_left':
                    setRemoteStreams(prev => { const m = new Map(prev); m.delete(data.player_id); return m; });
                    closePeerConnection(data.player_id);
                    break;

                // FIX 1: color assigned by server on connect
                case 'chess_color_assign':
                    setMyChessColor(data.color);
                    if (data.color === 'white') setWhitePlayerId(playerId);
                    showNotification(`You are ${data.color === 'white' ? '⬜ White' : '⬛ Black'}`);
                    // Dispatch synchronous DOM event so ARChessGame can update
                    // myColorRef immediately — before next React render cycle
                    window.dispatchEvent(new CustomEvent('chess_color_assign', { detail: { color: data.color } }));
                    break;

                // FIX 1: opponent move — forward to ARChessGame via prop
                case 'game_state_update':
                    if (data.player_id !== playerId) {
                        setIncomingChessState({ ...data.state, _ts: Date.now() });
                    }
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

    // FIX 2: set remote video srcObject safely after mount
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

    // FIX 3: mic toggle mutes BOTH local track and WebRTC sender
    const toggleMic = useCallback(() => {
        const next = !isMicMuted;
        setIsMicMuted(next);
        setMicEnabled(!next);
        localStream?.getAudioTracks().forEach(t => { t.enabled = !next; });
    }, [isMicMuted, setMicEnabled, localStream]);

    return (
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', height: '100%' }}>

            {/* Toasts */}
            <div style={{ position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {notifications.map(n => (
                    <div key={n.id} style={{ background: 'rgba(76,175,80,0.9)', color: '#fff', padding: '12px 24px', borderRadius: 8, boxShadow: '0 4px 6px rgba(0,0,0,0.3)', animation: 'fadeInOut 4s forwards', fontWeight: 'bold' }}>
                        {n.msg}
                    </div>
                ))}
            </div>

            {/* Header */}
            <div style={{ marginBottom: 20, textAlign: 'center' }}>
                <h2>Room: {roomCode}</h2>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 8, fontSize: '0.9rem', color: '#aaa', margin: '4px 0' }}>
                    <span>{username}</span>
                    {myChessColor && (<><span>•</span><span style={{ color: myChessColor === 'white' ? '#fff' : '#aaa', fontWeight: 700 }}>{myChessColor === 'white' ? '⬜ White' : '⬛ Black'}</span></>)}
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 10 }}>
                    <button onClick={toggleMic} style={{ padding: '8px 16px', borderRadius: 20, border: 'none', background: isMicMuted ? '#ef4444' : '#3b82f6', color: '#fff', cursor: 'pointer' }}>
                        {isMicMuted ? '🔇 Mic Off' : '🎤 Mic On'}
                    </button>
                    <button onClick={() => setVideoEnabled(v => !v)} style={{ padding: '8px 16px', borderRadius: 20, border: 'none', background: videoEnabled ? '#3b82f6' : '#ef4444', color: '#fff', cursor: 'pointer' }}>
                        {videoEnabled ? '📷 Cam On' : '🚫 Cam Off'}
                    </button>
                </div>
            </div>

            {/* FIX 2: VideoFeed uses shared localStream */}
            <VideoFeed localStream={localStream} onTrackingData={(data, dataRef) => {
                setExternalTrackingData(data);
                externalTrackingDataRef.current = dataRef;
            }} />

            {/* Remote video PiP */}
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
                    <GameSelector
                        game={currentGame}
                        trackingData={externalTrackingData}
                        trackingDataRef={externalTrackingDataRef.current}
                        playerId={playerId}
                        gameState={{
                            player1_id: whitePlayerId ?? playerId,
                            my_color: myChessColor ?? 'white',
                            room_code: roomCode,                // FIX 4: correct room
                            incomingState: incomingChessState,  // FIX 1: opponent moves
                        }}
                        localStream={localStream}               // FIX 2: shared camera
                        onStateUpdate={() => { }}
                        sendMessage={sendMessage}               // FIX 1: shared WS
                    />
                </div>
            ) : (
                <div style={{ textAlign: 'center', marginTop: 40 }}>
                    <p style={{ fontSize: '1.2rem', marginBottom: 20 }}>Select a game to start playing!</p>
                    <div style={{ display: 'flex', gap: 20, justifyContent: 'center', flexWrap: 'wrap' }}>
                        {[
                            { type: 'air_hockey', label: '🏒 Air Hockey', color: '#4CAF50' },
                            { type: 'balloon_pop', label: '🎈 Balloon Pop', color: '#2196F3' },
                            { type: 'chess', label: '♟️ Chess', color: '#00BCD4' },
                            { type: 'scribble', label: '✏️ Scribble Draw', color: '#F59E0B' },
                            { type: 'face_puzzle', label: '🧩 Face Puzzle', color: '#9C27B0' },
                        ].map(({ type, label, color }) => (
                            <button key={type} onClick={() => { sendMessage('game_selected', { game_type: type }); setAppState({ ...appState, currentGame: type }); }}
                                style={{ padding: '20px 40px', fontSize: '1.1rem', backgroundColor: color, color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold' }}>
                                {label}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <style>{`@keyframes fadeInOut { 0%{opacity:0;transform:translateY(-20px)} 10%{opacity:1;transform:translateY(0)} 90%{opacity:1;transform:translateY(0)} 100%{opacity:0;transform:translateY(-20px)} }`}</style>
        </div>
    );
};