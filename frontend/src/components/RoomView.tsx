import React, { useEffect, useState, useRef } from 'react';
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

    // Remote Peer state
    const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
    const remoteVideoRef = useRef<HTMLVideoElement>(null);

    // Audio/Video controls
    const [audioEnabled, setAudioEnabled] = useState(true);
    const [videoEnabled, setVideoEnabled] = useState(true);

    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [externalTrackingData, setExternalTrackingData] = useState<HandTrackingData>({ landmarks: [], handedness: [] });
    const externalTrackingDataRef = useRef<React.MutableRefObject<HandTrackingData> | undefined>(undefined);

    // Fetch camera immediately
    useEffect(() => {
        let mounted = true;
        console.log('1. Starting room join... getting camera');
        navigator.mediaDevices.getUserMedia({
            video: { width: 640, height: 480 },
            audio: true
        }).then(stream => {
            if (mounted) {
                console.log('3. Local stream obtained:', stream.id);
                setLocalStream(stream);
            } else {
                stream.getTracks().forEach(t => t.stop());
            }
        }).catch(err => console.error('❌ Camera error:', err));
        return () => { mounted = false; };
    }, []);

    // Handle WebSocket Signaling
    const { sendMessage } = useWebSocket({
        roomCode,
        playerId,
        shouldConnect: true, // Allow users without camera to join as guessers!
        onMessage: (message) => {
            const { type, data } = message;

            console.log("WebSocket Message Received:", type, data);

            switch (type) {
                case 'player_joined': {
                    // Another player joined, we should announce it
                    // Simple toast/alert for now
                    const joiningPlayer = data.username || "A player";
                    showNotification(`${joiningPlayer} joined the room!`);

                    // As the person already in the room, we initiate the WebRTC offer
                    createOffer(data.player_id);
                    break;
                }
                case 'player_left': {
                    setRemoteStreams(prev => {
                        const newStreams = new Map(prev);
                        newStreams.delete(data.player_id);
                        return newStreams;
                    });

                    closePeerConnection(data.player_id);
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
        onScribbleMessage: () => {
             // Dispatching is now handled securely in useWebSocket via CustomEvent
             // to prevent React state batching race conditions.
        }
    });

    const { createOffer, handleOffer, handleAnswer, handleIceCandidate, closePeerConnection } = useWebRTC({
        localStream: localStream,
        sendSignal: sendMessage,
        onRemoteStream: (peerId, stream) => {
            console.log("Received remote stream from", peerId, stream);
            setRemoteStreams(prev => new Map(prev).set(peerId, stream));

            // Auto play the latest remote stream in our ref if needed
            if (remoteVideoRef.current) {
                remoteVideoRef.current.srcObject = stream;
                remoteVideoRef.current.play().catch(console.error);
            }
        }
    });

    // Handle Mic/Camera Toggles
    useEffect(() => {
        if (localStream) {
            localStream.getAudioTracks().forEach(track => {
                track.enabled = audioEnabled;
            });
            localStream.getVideoTracks().forEach(track => {
                track.enabled = videoEnabled;
            });
        }
    }, [localStream, audioEnabled, videoEnabled]);

    // Simple toast notification implementation
    const [notifications, setNotifications] = useState<{ id: number, msg: string }[]>([]);
    const notifCounter = useRef(0);

    const showNotification = (msg: string) => {
        const id = notifCounter.current++;
        setNotifications(prev => [...prev, { id, msg }]);
        setTimeout(() => {
            setNotifications(prev => prev.filter(n => n.id !== id));
        }, 4000);
    };

    // Keep the remote video up to date with the latest stream (hacky for 1-1, but works)
    useEffect(() => {
        if (remoteStreams.size > 0 && remoteVideoRef.current) {
            const firstStream = Array.from(remoteStreams.values())[0];
            if (remoteVideoRef.current.srcObject !== firstStream) {
                remoteVideoRef.current.srcObject = firstStream;
                remoteVideoRef.current.play().catch(console.error);
            }
        }
    }, [remoteStreams]);

    return (
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Toast Notifications */}
            <div style={{ position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 9999, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {notifications.map(n => (
                    <div key={n.id} style={{
                        background: 'rgba(76, 175, 80, 0.9)', color: 'white', padding: '12px 24px',
                        borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
                        animation: 'fadeInOut 4s forwards', fontWeight: 'bold'
                    }}>
                        {n.msg}
                    </div>
                ))}
            </div>

            <div style={{ marginBottom: '20px', textAlign: 'center' }}>
                <h2>Room: {roomCode}</h2>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', fontSize: '0.9rem', color: '#aaa', margin: '4px 0' }}>
                    <span>Player ID: {playerId}</span>
                    <span>•</span>
                    <span>Username: {username}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginTop: '10px' }}>
                    <button
                        onClick={() => setAudioEnabled(!audioEnabled)}
                        style={{ padding: '8px 16px', borderRadius: '20px', border: 'none', background: audioEnabled ? '#3b82f6' : '#ef4444', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}
                    >
                        {audioEnabled ? '🎤 Mic On' : '🔇 Mic Off'}
                    </button>
                    <button
                        onClick={() => setVideoEnabled(!videoEnabled)}
                        style={{ padding: '8px 16px', borderRadius: '20px', border: 'none', background: videoEnabled ? '#3b82f6' : '#ef4444', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}
                    >
                        {videoEnabled ? '📷 Cam On' : '🚫 Cam Off'}
                    </button>
                </div>
            </div>

            {/* Existing VideoFeed gives us background swap. We pass its tracking data up */}
            <VideoFeed localStream={localStream} onTrackingData={(data, dataRef) => {
                setExternalTrackingData(data);
                externalTrackingDataRef.current = dataRef;
            }} />

            {/* Remote Video Picture-in-Picture Style */}
            {remoteStreams.size > 0 && (
                <div style={{
                    position: 'fixed', bottom: '20px', left: '20px', zIndex: 1000,
                    width: '320px', height: '240px', borderRadius: '12px', overflow: 'hidden',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.5)', border: '2px solid #3b82f6',
                    background: '#000'
                }}>
                    <video
                        ref={remoteVideoRef}
                        autoPlay
                        playsInline
                        // Do NOT mute remote video, so we can hear them!
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                    <div style={{ position: 'absolute', bottom: '5px', left: '5px', background: 'rgba(0,0,0,0.6)', padding: '2px 8px', borderRadius: '4px', fontSize: '12px' }}>
                        Remote Player
                    </div>
                </div>
            )}

            {currentGame ? (
                <div style={{ flex: 1, position: 'relative' }}>
                    <GameSelector
                        game={currentGame}
                        trackingData={externalTrackingData}
                        trackingDataRef={externalTrackingDataRef.current}
                        playerId={playerId}
                        gameState={{ player1_id: playerId }}
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
                        <button
                            onClick={() => {
                                sendMessage('game_selected', { game_type: 'air_hockey' });
                                setAppState({ ...appState, currentGame: 'air_hockey' });
                            }}
                            style={{ padding: '20px 40px', fontSize: '1.1rem', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
                        >
                            🏒 Air Hockey
                        </button>
                        <button
                            onClick={() => {
                                sendMessage('game_selected', { game_type: 'balloon_pop' });
                                setAppState({ ...appState, currentGame: 'balloon_pop' });
                            }}
                            style={{ padding: '20px 40px', fontSize: '1.1rem', backgroundColor: '#2196F3', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
                        >
                            🎈 Balloon Pop
                        </button>
                        <button
                            onClick={() => {
                                sendMessage('game_selected', { game_type: 'chess' });
                                setAppState({ ...appState, currentGame: 'chess' });
                            }}
                            style={{ padding: '20px 40px', fontSize: '1.1rem', backgroundColor: '#00BCD4', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
                        >
                            ♟️ Chess
                        </button>
                        <button
                            onClick={() => {
                                sendMessage('game_selected', { game_type: 'scribble' });
                                setAppState({ ...appState, currentGame: 'scribble' });
                            }}
                            style={{ padding: '20px 40px', fontSize: '1.1rem', backgroundColor: '#F59E0B', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
                        >
                            ✏️ Scribble Draw
                        </button>
                        <button
                            onClick={() => {
                                sendMessage('game_selected', { game_type: 'face_puzzle' });
                                setAppState({ ...appState, currentGame: 'face_puzzle' });
                            }}
                            style={{ padding: '20px 40px', fontSize: '1.1rem', backgroundColor: '#9C27B0', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
                        >
                            🧩 Face Puzzle
                        </button>
                    </div>
                </div>
            )}

            <style>
                {`
                    @keyframes fadeInOut {
                        0% { opacity: 0; transform: translateY(-20px); }
                        10% { opacity: 1; transform: translateY(0); }
                        90% { opacity: 1; transform: translateY(0); }
                        100% { opacity: 0; transform: translateY(-20px); }
                    }
                `}
            </style>
        </div>
    );
};
