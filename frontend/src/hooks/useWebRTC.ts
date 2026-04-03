import { useEffect, useRef, useCallback } from 'react';
import { WEBRTC_CONFIG } from '@/utils/constants';

interface UseWebRTCProps {
    localStream: MediaStream | null;
    sendSignal: (type: string, data: any) => void;
    onRemoteStream: (peerId: string, stream: MediaStream) => void;
}

export const useWebRTC = ({ localStream, sendSignal, onRemoteStream }: UseWebRTCProps) => {
    const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());

    // ── FIX: When localStream arrives late, add its tracks to ALL existing PCs ─
    useEffect(() => {
        if (!localStream) return;
        peerConnections.current.forEach((pc) => {
            // Only add tracks if this PC has none yet
            const existingSenders = pc.getSenders();
            if (existingSenders.length === 0) {
                localStream.getTracks().forEach((track) => {
                    pc.addTrack(track, localStream);
                });
            } else {
                // Replace existing tracks (handles stream swap / camera switch)
                localStream.getTracks().forEach((track) => {
                    const sender = existingSenders.find(
                        (s) => s.track?.kind === track.kind
                    );
                    if (sender) {
                        sender.replaceTrack(track).catch(console.error);
                    } else {
                        pc.addTrack(track, localStream);
                    }
                });
            }
        });
    }, [localStream]);

    const createPeerConnection = useCallback((peerId: string): RTCPeerConnection => {
        // Return existing connection if present
        const existing = peerConnections.current.get(peerId);
        if (existing && existing.connectionState !== 'closed') {
            return existing;
        }

        const pc = new RTCPeerConnection(WEBRTC_CONFIG);

        // ── FIX: Add tracks immediately if stream is already available ────────
        // If stream arrives later, the useEffect above will add them
        if (localStream) {
            localStream.getTracks().forEach((track) => {
                pc.addTrack(track, localStream);
            });
        }

        // Handle incoming remote stream — includes audio + video
        pc.ontrack = (event) => {
            if (event.streams?.[0]) {
                onRemoteStream(peerId, event.streams[0]);
            }
        };

        // ICE candidate exchange
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                sendSignal('webrtc_ice_candidate', {
                    target_player_id: peerId,
                    candidate: event.candidate,
                });
            }
        };

        pc.onconnectionstatechange = () => {
            console.log(`[WebRTC] Peer ${peerId} state: ${pc.connectionState}`);
            if (pc.connectionState === 'failed') {
                // Attempt ICE restart on failure
                pc.restartIce();
            }
        };

        pc.oniceconnectionstatechange = () => {
            console.log(`[WebRTC] ICE ${peerId}: ${pc.iceConnectionState}`);
        };

        peerConnections.current.set(peerId, pc);
        return pc;
    }, [localStream, sendSignal, onRemoteStream]);

    const createOffer = useCallback(async (peerId: string): Promise<void> => {
        const pc = createPeerConnection(peerId);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendSignal('webrtc_offer', { target_player_id: peerId, offer });
    }, [createPeerConnection, sendSignal]);

    const handleOffer = useCallback(async (
        peerId: string,
        offer: RTCSessionDescriptionInit
    ): Promise<void> => {
        const pc = createPeerConnection(peerId);
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendSignal('webrtc_answer', { target_player_id: peerId, answer });
    }, [createPeerConnection, sendSignal]);

    const handleAnswer = useCallback(async (
        peerId: string,
        answer: RTCSessionDescriptionInit
    ): Promise<void> => {
        const pc = peerConnections.current.get(peerId);
        if (pc) {
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
        }
    }, []);

    const handleIceCandidate = useCallback(async (
        peerId: string,
        candidate: RTCIceCandidateInit
    ): Promise<void> => {
        const pc = peerConnections.current.get(peerId);
        if (pc) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
    }, []);

    const closePeerConnection = useCallback((peerId: string): void => {
        const pc = peerConnections.current.get(peerId);
        if (pc) {
            pc.close();
            peerConnections.current.delete(peerId);
        }
    }, []);

    const closeAllConnections = useCallback((): void => {
        peerConnections.current.forEach((pc) => pc.close());
        peerConnections.current.clear();
    }, []);

    // ── Mic mute/unmute — operates on localStream audio tracks ───────────────
    const setMicEnabled = useCallback((enabled: boolean): void => {
        if (!localStream) return;
        localStream.getAudioTracks().forEach((track) => {
            track.enabled = enabled;
        });
    }, [localStream]);

    useEffect(() => {
        return () => { closeAllConnections(); };
    }, [closeAllConnections]);

    return {
        createOffer,
        handleOffer,
        handleAnswer,
        handleIceCandidate,
        closePeerConnection,
        closeAllConnections,
        setMicEnabled,
    };
};