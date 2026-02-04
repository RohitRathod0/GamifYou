import { useEffect, useRef, useCallback } from 'react';
import { WEBRTC_CONFIG } from '@/utils/constants';

interface UseWebRTCProps {
    localStream: MediaStream | null;
    sendSignal: (type: string, data: any) => void;
    onRemoteStream: (peerId: string, stream: MediaStream) => void;
}

export const useWebRTC = ({ localStream, sendSignal, onRemoteStream }: UseWebRTCProps) => {
    const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());

    const createPeerConnection = useCallback((peerId: string) => {
        if (peerConnections.current.has(peerId)) {
            return peerConnections.current.get(peerId)!;
        }

        const pc = new RTCPeerConnection(WEBRTC_CONFIG);

        // Add local stream tracks
        if (localStream) {
            localStream.getTracks().forEach((track) => {
                pc.addTrack(track, localStream);
            });
        }

        // Handle remote stream
        pc.ontrack = (event) => {
            if (event.streams && event.streams[0]) {
                onRemoteStream(peerId, event.streams[0]);
            }
        };

        // Handle ICE candidates
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                sendSignal('webrtc_ice_candidate', {
                    target_player_id: peerId,
                    candidate: event.candidate,
                });
            }
        };

        pc.onconnectionstatechange = () => {
            console.log(`Peer ${peerId} connection state:`, pc.connectionState);
        };

        peerConnections.current.set(peerId, pc);
        return pc;
    }, [localStream, sendSignal, onRemoteStream]);

    const createOffer = useCallback(async (peerId: string) => {
        const pc = createPeerConnection(peerId);

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        sendSignal('webrtc_offer', {
            target_player_id: peerId,
            offer,
        });
    }, [createPeerConnection, sendSignal]);

    const handleOffer = useCallback(async (peerId: string, offer: RTCSessionDescriptionInit) => {
        const pc = createPeerConnection(peerId);

        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        sendSignal('webrtc_answer', {
            target_player_id: peerId,
            answer,
        });
    }, [createPeerConnection, sendSignal]);

    const handleAnswer = useCallback(async (peerId: string, answer: RTCSessionDescriptionInit) => {
        const pc = peerConnections.current.get(peerId);
        if (pc) {
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
        }
    }, []);

    const handleIceCandidate = useCallback(async (peerId: string, candidate: RTCIceCandidateInit) => {
        const pc = peerConnections.current.get(peerId);
        if (pc) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
    }, []);

    const closePeerConnection = useCallback((peerId: string) => {
        const pc = peerConnections.current.get(peerId);
        if (pc) {
            pc.close();
            peerConnections.current.delete(peerId);
        }
    }, []);

    const closeAllConnections = useCallback(() => {
        peerConnections.current.forEach((pc) => pc.close());
        peerConnections.current.clear();
    }, []);

    useEffect(() => {
        return () => {
            closeAllConnections();
        };
    }, [closeAllConnections]);

    return {
        createOffer,
        handleOffer,
        handleAnswer,
        handleIceCandidate,
        closePeerConnection,
        closeAllConnections,
    };
};