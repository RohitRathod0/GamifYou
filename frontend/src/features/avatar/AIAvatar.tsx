import { useState, useEffect, useRef, useCallback } from 'react';
import { useFaceMesh } from '@/hooks/useFaceMesh';
import { AvatarScene } from './AvatarScene';
import { loadExpressionModels, detectExpressions, ExpressionSmoother } from './expressionDetector';
import { estimateHeadPose } from './headPoseEstimator';
import { mapExpressionToBlendShapes, interpolateBlendShapes, createNeutralBlendShapes } from './blendShapeMapper';
import { AvatarExpression, HeadPose, BlendShapes } from './types';

/**
 * AI Avatar Demo Component
 * Combines face tracking, expression detection, and 3D avatar rendering
 */
export function AIAvatar() {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const { isReady, results } = useFaceMesh(videoRef);

    const [modelsLoaded, setModelsLoaded] = useState(false);
    const [headPose, setHeadPose] = useState<HeadPose>({ pitch: 0, yaw: 0, roll: 0 });
    const [blendShapes, setBlendShapes] = useState<BlendShapes>(createNeutralBlendShapes());
    const [expression, setExpression] = useState<AvatarExpression | null>(null);
    const [showVideo, setShowVideo] = useState(true);
    const [showLandmarks, setShowLandmarks] = useState(false);

    const expressionSmootherRef = useRef(new ExpressionSmoother(5));
    const currentBlendShapesRef = useRef<BlendShapes>(createNeutralBlendShapes());

    // Load expression detection models
    useEffect(() => {
        loadExpressionModels()
            .then(() => {
                setModelsLoaded(true);
                console.log('✅ Expression models loaded');
            })
            .catch((error) => {
                console.error('Failed to load expression models:', error);
            });
    }, []);

    // Initialize camera
    useEffect(() => {
        const initCamera = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        width: { ideal: 640 },
                        height: { ideal: 480 },
                        facingMode: 'user'
                    }
                });

                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    console.log('✅ Camera initialized');
                }
            } catch (error) {
                console.error('Failed to initialize camera:', error);
            }
        };

        initCamera();

        return () => {
            if (videoRef.current?.srcObject) {
                const stream = videoRef.current.srcObject as MediaStream;
                stream.getTracks().forEach(track => track.stop());
            }
        };
    }, []);

    // Process face tracking data
    useEffect(() => {
        if (!results?.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
            return;
        }

        const landmarks = results.multiFaceLandmarks[0];

        // Update head pose
        const pose = estimateHeadPose(landmarks);
        setHeadPose(pose);

        // Detect expressions if models are loaded
        if (modelsLoaded && videoRef.current) {
            detectExpressions(videoRef.current).then((detectedExpression) => {
                if (detectedExpression) {
                    const smoothed = expressionSmootherRef.current.smooth(detectedExpression);
                    setExpression(smoothed);

                    // Map to blend shapes
                    const targetBlendShapes = mapExpressionToBlendShapes(smoothed, landmarks);

                    // Interpolate for smooth transitions
                    const interpolated = interpolateBlendShapes(
                        currentBlendShapesRef.current,
                        targetBlendShapes,
                        0.3
                    );

                    currentBlendShapesRef.current = interpolated;
                    setBlendShapes(interpolated);
                }
            });
        }
    }, [results, modelsLoaded]);

    // Draw landmarks on canvas
    const drawLandmarks = useCallback(() => {
        if (!canvasRef.current || !videoRef.current || !results?.multiFaceLandmarks) {
            return;
        }

        const canvas = canvasRef.current;
        const video = videoRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (showVideo) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        }

        if (showLandmarks && results.multiFaceLandmarks[0]) {
            const landmarks = results.multiFaceLandmarks[0];

            ctx.fillStyle = '#00ff00';
            landmarks.forEach((landmark) => {
                const x = landmark.x * canvas.width;
                const y = landmark.y * canvas.height;
                ctx.beginPath();
                ctx.arc(x, y, 1, 0, 2 * Math.PI);
                ctx.fill();
            });
        }
    }, [results, showVideo, showLandmarks]);

    useEffect(() => {
        drawLandmarks();
    }, [drawLandmarks]);

    return (
        <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
            <h1 style={{ textAlign: 'center', marginBottom: '10px' }}>
                🤖 AI Avatar with Expression Mapping
            </h1>
            <p style={{ textAlign: 'center', color: '#888', marginBottom: '30px' }}>
                Your facial expressions control the 3D avatar in real-time
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                {/* Left: Video Feed */}
                <div>
                    <h3>📹 Face Tracking</h3>
                    <div style={{ position: 'relative', backgroundColor: '#000', borderRadius: '8px', overflow: 'hidden' }}>
                        <video
                            ref={videoRef}
                            autoPlay
                            playsInline
                            muted
                            style={{
                                width: '100%',
                                transform: 'scaleX(-1)',
                                display: showVideo ? 'block' : 'none',
                            }}
                        />
                        <canvas
                            ref={canvasRef}
                            style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                width: '100%',
                                height: '100%',
                                transform: 'scaleX(-1)',
                            }}
                        />
                        {!isReady && (
                            <div style={{
                                position: 'absolute',
                                top: '50%',
                                left: '50%',
                                transform: 'translate(-50%, -50%)',
                                color: '#fff',
                                fontSize: '1.2rem',
                            }}>
                                Initializing camera...
                            </div>
                        )}
                    </div>

                    {/* Controls */}
                    <div style={{ marginTop: '15px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        <button
                            onClick={() => setShowVideo(!showVideo)}
                            style={{
                                padding: '8px 16px',
                                backgroundColor: showVideo ? '#4CAF50' : '#666',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                            }}
                        >
                            {showVideo ? '📹 Hide Video' : '📹 Show Video'}
                        </button>
                        <button
                            onClick={() => setShowLandmarks(!showLandmarks)}
                            style={{
                                padding: '8px 16px',
                                backgroundColor: showLandmarks ? '#4CAF50' : '#666',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                            }}
                        >
                            {showLandmarks ? '🔴 Hide Landmarks' : '🔴 Show Landmarks'}
                        </button>
                    </div>

                    {/* Expression Info */}
                    {expression && (
                        <div style={{ marginTop: '15px', padding: '15px', backgroundColor: '#1a1a1a', borderRadius: '8px' }}>
                            <h4 style={{ marginTop: 0 }}>Detected Expression:</h4>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '0.9rem' }}>
                                {Object.entries(expression).map(([name, value]) => (
                                    <div key={name} style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span>{name}:</span>
                                        <span style={{ color: value > 0.5 ? '#4CAF50' : '#666' }}>
                                            {(value * 100).toFixed(0)}%
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Right: 3D Avatar */}
                <div>
                    <h3>🎭 3D Avatar</h3>
                    <div style={{ backgroundColor: '#1a1a1a', borderRadius: '8px', overflow: 'hidden', height: '500px' }}>
                        <AvatarScene
                            headPose={headPose}
                            blendShapes={blendShapes}
                        />
                    </div>

                    {/* Head Pose Info */}
                    <div style={{ marginTop: '15px', padding: '15px', backgroundColor: '#1a1a1a', borderRadius: '8px' }}>
                        <h4 style={{ marginTop: 0 }}>Head Pose:</h4>
                        <div style={{ fontSize: '0.9rem' }}>
                            <div>Pitch (up/down): {headPose.pitch.toFixed(2)}</div>
                            <div>Yaw (left/right): {headPose.yaw.toFixed(2)}</div>
                            <div>Roll (tilt): {headPose.roll.toFixed(2)}</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Instructions */}
            <div style={{ marginTop: '30px', padding: '20px', backgroundColor: '#1a1a1a', borderRadius: '8px' }}>
                <h3>📋 How It Works</h3>
                <ul style={{ lineHeight: '1.8' }}>
                    <li><strong>Face Tracking:</strong> MediaPipe Face Mesh detects 468 facial landmarks</li>
                    <li><strong>Expression Detection:</strong> Face-api.js classifies 7 emotions (happy, sad, angry, surprised, neutral, fearful, disgusted)</li>
                    <li><strong>Head Pose:</strong> Calculated from landmark positions (pitch, yaw, roll)</li>
                    <li><strong>Blend Shapes:</strong> Expressions mapped to avatar facial controls</li>
                    <li><strong>Real-time Animation:</strong> 3D avatar mirrors your expressions at 30 FPS</li>
                </ul>
                <p style={{ color: '#888', marginTop: '15px' }}>
                    <strong>Try it:</strong> Smile, frown, raise eyebrows, open mouth, tilt head - watch the avatar follow!
                </p>
            </div>
        </div>
    );
}
