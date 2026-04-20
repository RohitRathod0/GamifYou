import { useEffect, useRef, useState, useCallback } from 'react';
import { Hands, Results } from '@mediapipe/hands';
import { MEDIAPIPE_CONFIG } from '@/utils/constants';

export interface HandLandmark { x: number; y: number; z: number; }
export interface HandTrackingData { landmarks: HandLandmark[][]; handedness: string[]; }

// Singleton state
let globalHands: Hands | null = null;
let globalStream: MediaStream | null = null;
let isInitializing = false;
let globalCallbacks: Set<(results: Results) => void> = new Set();
let globalFrameLoopRunning = false;

export const useHandTracking = (
    videoRef: React.RefObject<HTMLVideoElement>,
    providedStream?: MediaStream | null
) => {
    const [isReady, setIsReady] = useState(false);
    const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);

    // ✅ KEY FIX: trackingData lives in a REF, not state — no re-renders
    const trackingDataRef = useRef<HandTrackingData>({ landmarks: [], handedness: [] });

    // Still expose a state version, but only update it at low frequency if needed
    const [trackingData, setTrackingData] = useState<HandTrackingData>({ landmarks: [], handedness: [] });

    const onResults = useCallback((results: Results) => {
        const newData: HandTrackingData = results.multiHandLandmarks?.length
            ? {
                landmarks: results.multiHandLandmarks,
                handedness: results.multiHandedness?.map(h => h.label) ?? [],
            }
            : { landmarks: [], handedness: [] };

        // ✅ Update ref immediately (no re-render, used by game loop)
        trackingDataRef.current = newData;

        // ✅ Update state ONLY when detection status changes or hand moves significantly
        setTrackingData(prev => {
            const wasEmpty = prev.landmarks.length === 0;
            const isEmpty = newData.landmarks.length === 0;
            if (wasEmpty !== isEmpty) return newData; // status changed → update
            
            if (!isEmpty) {
                // Euclidean diff to prevent micro-jitter re-renders
                let moved = false;
                const HAND_COUNT = Math.max(prev.landmarks.length, newData.landmarks.length);
                
                for (let i = 0; i < HAND_COUNT; i++) {
                    const pHand = prev.landmarks[i];
                    const nHand = newData.landmarks[i];
                    
                    if (!pHand || !nHand) {
                        moved = true; 
                        break;
                    }
                    
                    // Check Palm (9) and Index Tip (8)
                    const pCenter = pHand[9];
                    const nCenter = nHand[9];
                    const pTip = pHand[8];
                    const nTip = nHand[8];
                    
                    if (!pCenter || !nCenter || !pTip || !nTip) {
                        moved = true;
                        break;
                    }
                    
                    const distCenter = Math.hypot(pCenter.x - nCenter.x, pCenter.y - nCenter.y);
                    const distTip = Math.hypot(pTip.x - nTip.x, pTip.y - nTip.y);
                    
                    // 0.005 normalized distance is roughly 3-4 pixels on a 640x480 screen
                    if (distCenter > 0.005 || distTip > 0.005) {
                        moved = true;
                        break;
                    }
                }
                
                if (moved) return newData;
            }
            return prev; // No significant change → skip re-render
        });
    }, []);

    // Register/unregister callback
    useEffect(() => {
        globalCallbacks.add(onResults);
        return () => {
            globalCallbacks.delete(onResults);
        };
    }, [onResults]);

    useEffect(() => {
        if (!videoRef.current || providedStream === null) return;
        if (isInitializing) return;

        const init = async () => {
            // Reuse existing instance
            if (globalHands) {
                if (globalStream) {
                    setMediaStream(globalStream);
                    if (videoRef.current && videoRef.current.srcObject !== globalStream) {
                        videoRef.current.srcObject = globalStream;
                        videoRef.current.play().catch(console.warn);
                    }
                }
                setIsReady(true);
                return;
            }

            isInitializing = true;

            try {
                const hands = new Hands({
                    locateFile: file => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
                });

                hands.setOptions({
                    maxNumHands: MEDIAPIPE_CONFIG.maxNumHands,
                    modelComplexity: MEDIAPIPE_CONFIG.modelComplexity,
                    minDetectionConfidence: MEDIAPIPE_CONFIG.minDetectionConfidence,
                    minTrackingConfidence: MEDIAPIPE_CONFIG.minTrackingConfidence,
                });

                // Dispatch to all registered callbacks
                hands.onResults((res) => {
                    globalCallbacks.forEach(cb => cb(res));
                });

                // ✅ Initialize the model BEFORE starting the frame loop
                await hands.initialize();

                const stream = providedStream !== undefined
                    ? providedStream
                    : await navigator.mediaDevices.getUserMedia({
                        video: { width: 640, height: 480 },
                        audio: true,
                    });

                if (stream && videoRef.current) {
                    videoRef.current.srcObject = stream;
                    await videoRef.current.play();
                    globalStream = stream;
                    setMediaStream(stream);
                }

                // ✅ Set global BEFORE starting frame loop
                globalHands = hands;

                // ✅ Single frame loop, only starts once
                if (!globalFrameLoopRunning) {
                    globalFrameLoopRunning = true;
                    const frameLoop = async () => {
                        if (videoRef.current && globalHands && !videoRef.current.paused) {
                            await globalHands.send({ image: videoRef.current });
                        }
                        requestAnimationFrame(frameLoop);
                    };
                    requestAnimationFrame(frameLoop);
                }

                setIsReady(true);
            } catch (err) {
                console.error('MediaPipe init error:', err);
            } finally {
                isInitializing = false;
            }
        };

        init();
    }, [videoRef, onResults, providedStream]);

    // ✅ These read from ref — always fresh, no stale closure issues
    const getIndexFingerTip = useCallback((handIndex = 0): HandLandmark | null =>
        trackingDataRef.current.landmarks[handIndex]?.[8] ?? null, []);

    const getPalmCenter = useCallback((handIndex = 0): HandLandmark | null =>
        trackingDataRef.current.landmarks[handIndex]?.[9] ?? null, []);

    return { isReady, trackingData, trackingDataRef, getIndexFingerTip, getPalmCenter, mediaStream };
};