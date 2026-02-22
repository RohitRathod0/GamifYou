import { useEffect, useRef, useState, useCallback } from 'react';
import { Hands, Results } from '@mediapipe/hands';
import { Camera } from '@mediapipe/camera_utils';
import { MEDIAPIPE_CONFIG } from '@/utils/constants';

export interface HandLandmark {
    x: number;
    y: number;
    z: number;
}

export interface HandTrackingData {
    landmarks: HandLandmark[][];
    handedness: string[];
}

// Module-level singleton to prevent multiple MediaPipe instances
let globalHandsInstance: Hands | null = null;
let globalCameraInstance: Camera | null = null;
let initializationPromise: Promise<void> | null = null;

export const useHandTracking = (videoRef: React.RefObject<HTMLVideoElement>) => {
    const [isReady, setIsReady] = useState(false);
    const [trackingData, setTrackingData] = useState<HandTrackingData>({
        landmarks: [],
        handedness: [],
    });
    const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);

    const handsRef = useRef<Hands | null>(null);
    const cameraRef = useRef<Camera | null>(null);

    const onResults = useCallback((results: Results) => {
        if (results.multiHandLandmarks && results.multiHandedness) {
            const newData = {
                landmarks: results.multiHandLandmarks,
                handedness: results.multiHandedness.map((h) => h.label),
            };

            // Log only when hands are first detected (not every frame)
            setTrackingData((prev) => {
                if (prev.landmarks.length === 0 && newData.landmarks.length > 0) {
                    console.log('✋ Hand detected!', newData.handedness);
                }
                return newData;
            });
        } else {
            setTrackingData({
                landmarks: [],
                handedness: [],
            });
        }
    }, []);

    useEffect(() => {
        if (!videoRef.current) return;

        const initializeMediaPipe = async () => {
            // Reuse existing instance if available
            if (globalHandsInstance && globalCameraInstance) {
                console.log('📹 Reusing existing MediaPipe instance');
                handsRef.current = globalHandsInstance;
                cameraRef.current = globalCameraInstance;
                globalHandsInstance.onResults(onResults);
                setIsReady(true);
                return;
            }

            // Wait if initialization is in progress
            if (initializationPromise) {
                console.log('⏳ Waiting for MediaPipe initialization...');
                await initializationPromise;
                if (globalHandsInstance && globalCameraInstance) {
                    handsRef.current = globalHandsInstance;
                    cameraRef.current = globalCameraInstance;
                    globalHandsInstance.onResults(onResults);
                    setIsReady(true);
                }
                return;
            }

            // Create new instance
            console.log('📹 Initializing MediaPipe Hands...');

            initializationPromise = (async () => {
                const hands = new Hands({
                    locateFile: (file) => {
                        return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
                    },
                });

                hands.setOptions({
                    maxNumHands: MEDIAPIPE_CONFIG.maxNumHands,
                    modelComplexity: MEDIAPIPE_CONFIG.modelComplexity,
                    minDetectionConfidence: MEDIAPIPE_CONFIG.minDetectionConfidence,
                    minTrackingConfidence: MEDIAPIPE_CONFIG.minTrackingConfidence,
                });

                hands.onResults(onResults);

                // Get media stream explicitly so we capture audio as well
                try {
                    const stream = await navigator.mediaDevices.getUserMedia({
                        video: { width: 640, height: 480 },
                        audio: true, // Request microphone access for WebRTC
                    });

                    if (videoRef.current) {
                        videoRef.current.srcObject = stream;
                        await videoRef.current.play();
                    }

                    setMediaStream(stream);

                    const camera = new Camera(videoRef.current!, {
                        onFrame: async () => {
                            if (videoRef.current && globalHandsInstance) {
                                await globalHandsInstance.send({ image: videoRef.current });
                            }
                        },
                        width: 640,
                        height: 480,
                    });

                    // We don't call camera.start() because that internally calls getUserMedia again 
                    // without audio. Calling it repeatedly can cause issues. MediaPipe can still 
                    // process frames via requestAnimationFrame.
                    // Instead of camera.start(), we just implement our own frame loop
                    const frameLoop = async () => {
                        if (videoRef.current && globalHandsInstance && !videoRef.current.paused) {
                            await globalHandsInstance.send({ image: videoRef.current });
                        }
                        requestAnimationFrame(frameLoop);
                    };
                    frameLoop();

                    globalHandsInstance = hands;
                    globalCameraInstance = camera;
                    handsRef.current = hands;
                    cameraRef.current = camera;
                } catch (err) {
                    console.error("Error accessing user media:", err);
                }

                console.log('✅ MediaPipe Hands initialized successfully!');
            })();

            await initializationPromise;
            initializationPromise = null;
            setIsReady(true);
        };

        initializeMediaPipe();

        // Cleanup: Don't destroy global instance, just remove our reference
        return () => {
            console.log('🔄 Component unmounting, keeping MediaPipe instance alive');
            // Don't stop camera or close hands - keep them running for reuse
        };
    }, [videoRef, onResults]);

    const getIndexFingerTip = useCallback((handIndex: number = 0): HandLandmark | null => {
        if (trackingData.landmarks[handIndex] && trackingData.landmarks[handIndex][8]) {
            return trackingData.landmarks[handIndex][8];
        }
        return null;
    }, [trackingData]);

    const getPalmCenter = useCallback((handIndex: number = 0): HandLandmark | null => {
        if (trackingData.landmarks[handIndex] && trackingData.landmarks[handIndex][9]) {
            return trackingData.landmarks[handIndex][9];
        }
        return null;
    }, [trackingData]);

    return {
        isReady,
        trackingData,
        getIndexFingerTip,
        getPalmCenter,
        mediaStream,
    };
};