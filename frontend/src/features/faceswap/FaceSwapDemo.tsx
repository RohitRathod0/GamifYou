import React, { useRef, useEffect, useState } from 'react';
import { useFaceMesh } from '../../hooks/useFaceMesh';
import { drawFaceLandmarks } from './faceDetection';
import { swapFacesAdvanced } from './advancedSwap';
import './FaceSwapDemo.css';

export const FaceSwapDemo: React.FC = () => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isVideoReady, setIsVideoReady] = useState(false);
    const [showLandmarks, setShowLandmarks] = useState(true);
    const [enableSwap, setEnableSwap] = useState(false); // NEW: Face swap toggle
    const [fps, setFps] = useState(30); // Start with 30 as default

    const lastFrameTime = useRef(Date.now());
    const frameCount = useRef(0);
    const animationFrameId = useRef<number | null>(null);
    const latestResults = useRef<any>(null);

    // Initialize face mesh detection
    const { isReady, error, results, faceCount } = useFaceMesh(videoRef, {
        enabled: isVideoReady,
        config: {
            maxNumFaces: 2,
            refineLandmarks: true,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5,
        },
    });

    // Store latest results
    useEffect(() => {
        if (results) {
            latestResults.current = results;
        }
    }, [results]);

    // Setup webcam
    useEffect(() => {
        const setupCamera = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        width: { ideal: 1280 },
                        height: { ideal: 720 },
                        facingMode: 'user',
                        frameRate: { ideal: 60, max: 60 } // Request 60 FPS
                    },
                });

                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    videoRef.current.onloadedmetadata = () => {
                        videoRef.current?.play();
                        setIsVideoReady(true);
                    };
                }
            } catch (err) {
                console.error('Error accessing webcam:', err);
            }
        };

        setupCamera();

        return () => {
            if (videoRef.current?.srcObject) {
                const stream = videoRef.current.srcObject as MediaStream;
                stream.getTracks().forEach((track) => track.stop());
            }
            if (animationFrameId.current) {
                cancelAnimationFrame(animationFrameId.current);
            }
        };
    }, []);

    // Continuous rendering loop
    useEffect(() => {
        if (!isVideoReady || !canvasRef.current || !videoRef.current) return;

        const canvas = canvasRef.current;
        const video = videoRef.current;

        const render = () => {
            const ctx = canvas.getContext('2d');
            if (!ctx || !video.videoWidth || !video.videoHeight) {
                animationFrameId.current = requestAnimationFrame(render);
                return;
            }

            // Set canvas size to match video (only if changed)
            if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
            }

            // Clear canvas
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Draw video frame
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            // Apply face swap if enabled and we have 2 faces
            if (enableSwap && latestResults.current?.multiFaceLandmarks?.length === 2) {
                const face1 = latestResults.current.multiFaceLandmarks[0];
                const face2 = latestResults.current.multiFaceLandmarks[1];

                // Perform advanced face swap with expression tracking
                const swapResult = swapFacesAdvanced(canvas, face1, face2);

                if (swapResult.success) {
                    // Draw swapped result
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(swapResult.swappedCanvas, 0, 0);
                }
            }

            // Draw face landmarks if available and enabled
            if (latestResults.current?.multiFaceLandmarks && showLandmarks) {
                latestResults.current.multiFaceLandmarks.forEach((landmarks: any, index: number) => {
                    // Different colors for different faces
                    const colors = ['#00FF00', '#FF00FF'];
                    const color = colors[index % colors.length];

                    drawFaceLandmarks(ctx, landmarks, color, 1.5);
                });

                // Draw face count indicator
                ctx.fillStyle = '#FFFFFF';
                ctx.font = 'bold 24px Arial';
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 3;
                ctx.strokeText(`Faces Detected: ${faceCount}`, 20, 40);
                ctx.fillText(`Faces Detected: ${faceCount}`, 20, 40);

                // Draw swap status
                if (enableSwap) {
                    ctx.strokeText('SWAP: ON', 20, 75);
                    ctx.fillText('SWAP: ON', 20, 75);
                }
            }

            // Calculate FPS
            frameCount.current++;
            const now = Date.now();
            const elapsed = now - lastFrameTime.current;

            if (elapsed >= 1000) {
                const currentFps = Math.round((frameCount.current * 1000) / elapsed);
                setFps(currentFps);
                frameCount.current = 0;
                lastFrameTime.current = now;
            }

            animationFrameId.current = requestAnimationFrame(render);
        };

        render();

        return () => {
            if (animationFrameId.current) {
                cancelAnimationFrame(animationFrameId.current);
            }
        };
    }, [isVideoReady, showLandmarks, faceCount, enableSwap]);

    return (
        <div className="face-swap-demo">
            <div className="demo-header">
                <h1>🎭 Real-Time Face Swap - Day 1</h1>
                <p className="subtitle">MediaPipe Face Mesh Detection (468 Landmarks)</p>
            </div>

            <div className="video-container">
                <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    style={{ display: 'none' }}
                />
                <canvas ref={canvasRef} className="output-canvas" />

                <div className="stats-overlay">
                    <div className="stat-item">
                        <span className="stat-label">FPS:</span>
                        <span className="stat-value">{fps}</span>
                    </div>
                    <div className="stat-item">
                        <span className="stat-label">Faces:</span>
                        <span className="stat-value">{faceCount}</span>
                    </div>
                    <div className="stat-item">
                        <span className="stat-label">Status:</span>
                        <span className={`stat-value ${isReady ? 'ready' : 'loading'}`}>
                            {isReady ? '✓ Ready' : '⏳ Loading...'}
                        </span>
                    </div>
                </div>
            </div>


            <div className="controls">
                <button
                    className={`toggle-btn ${showLandmarks ? 'active' : ''}`}
                    onClick={() => setShowLandmarks(!showLandmarks)}
                >
                    {showLandmarks ? '👁️ Hide Landmarks' : '👁️ Show Landmarks'}
                </button>

                <button
                    className={`toggle-btn ${enableSwap ? 'active' : ''}`}
                    onClick={() => setEnableSwap(!enableSwap)}
                    disabled={faceCount !== 2}
                    style={{ opacity: faceCount !== 2 ? 0.5 : 1 }}
                >
                    {enableSwap ? '🔄 Disable Swap' : '🔄 Enable Swap'}
                </button>

                {faceCount !== 2 && (
                    <p style={{ color: '#ffaa00', fontSize: '0.9rem', margin: '10px 0 0 0' }}>
                        ⚠️ Need 2 faces to enable swap
                    </p>
                )}
            </div>

            {error && (
                <div className="error-message">
                    ⚠️ Error: {error}
                </div>
            )}

            <div className="info-panel">
                <h3>📋 Features (Days 1-3):</h3>
                <ul>
                    <li>✅ MediaPipe Face Mesh integration (Day 1)</li>
                    <li>✅ Detect faces in real-time (up to 2 faces)</li>
                    <li>✅ Draw 468 facial landmarks per face</li>
                    <li>✅ Performance monitoring (FPS counter)</li>
                    <li>✅ Face extraction and alignment (Day 2)</li>
                    <li>✅ <strong>REAL-TIME FACE SWAP (Day 3)</strong></li>
                    <li>✅ Skin tone matching</li>
                    <li>✅ Seamless blending</li>
                </ul>

                <h3>🎯 How to Test Face Swap:</h3>
                <ol>
                    <li><strong>Get 2 People:</strong> You and a friend in front of camera</li>
                    <li><strong>Wait for Detection:</strong> Both faces should show green/purple dots</li>
                    <li><strong>Enable Swap:</strong> Click "🔄 Enable Swap" button</li>
                    <li><strong>See the Magic:</strong> Your faces are now swapped in real-time!</li>
                    <li><strong>Toggle Landmarks:</strong> Hide dots to see clean swap</li>
                </ol>

                <div className="tech-info">
                    <p><strong>Technical Details:</strong></p>
                    <p>• Model: MediaPipe Face Mesh</p>
                    <p>• Landmarks: 468 points per face</p>
                    <p>• Max Faces: 2 simultaneous</p>
                    <p>• Target FPS: 30-60</p>
                    <p>• Swap Algorithm: Real-time with blending</p>
                </div>
            </div>
        </div>
    );
};
