import React, { useRef, useEffect, useState } from 'react';
import { useSegmentation } from '../../hooks/useSegmentation';
import { BackgroundProcessor } from './backgroundProcessor';
import { BackgroundConfig } from './types';
import { BackgroundGallery } from './BackgroundGallery';

/**
 * Virtual Background Component
 * Combines person segmentation with background replacement
 */

export const VirtualBackground: React.FC = () => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const processorRef = useRef<BackgroundProcessor | null>(null);

    const [isActive, setIsActive] = useState(false);
    const [backgroundConfig, setBackgroundConfig] = useState<BackgroundConfig>({ type: 'none' });

    const { isReady, segmentationMask, startSegmentation, stopSegmentation } = useSegmentation(videoRef);

    // Initialize camera
    useEffect(() => {
        const initCamera = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        width: { ideal: 1280 },
                        height: { ideal: 720 },
                        facingMode: 'user',
                    },
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
                stream.getTracks().forEach((track) => track.stop());
            }
        };
    }, []);

    // Initialize background processor
    useEffect(() => {
        if (canvasRef.current && !processorRef.current) {
            processorRef.current = new BackgroundProcessor(1280, 720);
        }
    }, []);

    // Start/stop segmentation
    useEffect(() => {
        if (isActive && isReady) {
            startSegmentation();
        } else {
            stopSegmentation();
        }
    }, [isActive, isReady, startSegmentation, stopSegmentation]);

    // Process frames
    useEffect(() => {
        if (!isActive || !segmentationMask || !videoRef.current || !canvasRef.current || !processorRef.current) {
            return;
        }

        const processFrame = async () => {
            try {
                const result = await processorRef.current!.processFrame(
                    videoRef.current!,
                    segmentationMask,
                    backgroundConfig
                );

                const ctx = canvasRef.current!.getContext('2d');
                if (ctx) {
                    ctx.putImageData(result, 0, 0);
                }
            } catch (error) {
                console.error('Frame processing error:', error);
            }
        };

        processFrame();
    }, [isActive, segmentationMask, backgroundConfig]);

    return (
        <div style={{
            padding: '20px',
            maxWidth: '1400px',
            margin: '0 auto',
            color: '#fff',
        }}>
            <h1>🎭 Virtual Background Demo</h1>

            <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '20px',
                marginTop: '20px',
            }}>
                {/* Video Display */}
                <div>
                    <h3>Camera Feed</h3>
                    <div style={{ position: 'relative' }}>
                        <video
                            ref={videoRef}
                            autoPlay
                            playsInline
                            muted
                            style={{
                                width: '100%',
                                borderRadius: '12px',
                                display: isActive ? 'none' : 'block',
                            }}
                        />
                        <canvas
                            ref={canvasRef}
                            width={1280}
                            height={720}
                            style={{
                                width: '100%',
                                borderRadius: '12px',
                                display: isActive ? 'block' : 'none',
                            }}
                        />
                    </div>

                    {/* Controls */}
                    <div style={{ marginTop: '20px' }}>
                        <button
                            onClick={() => setIsActive(!isActive)}
                            disabled={!isReady}
                            style={{
                                padding: '12px 24px',
                                backgroundColor: isActive ? '#f44336' : '#4CAF50',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '8px',
                                fontSize: '16px',
                                cursor: isReady ? 'pointer' : 'not-allowed',
                                opacity: isReady ? 1 : 0.5,
                            }}
                        >
                            {isActive ? '⏸️ Stop' : '▶️ Start'} Virtual Background
                        </button>

                        {!isReady && (
                            <p style={{ marginTop: '10px', color: '#ffa726' }}>
                                Loading segmentation model...
                            </p>
                        )}
                    </div>

                    {/* Stats */}
                    <div style={{
                        marginTop: '20px',
                        padding: '15px',
                        backgroundColor: '#2a2a2a',
                        borderRadius: '8px',
                    }}>
                        <h4 style={{ marginTop: 0 }}>Status</h4>
                        <div style={{ fontSize: '14px' }}>
                            <div>Model Ready: {isReady ? '✅' : '⏳'}</div>
                            <div>Active: {isActive ? '✅' : '❌'}</div>
                            <div>Background Type: {backgroundConfig.type}</div>
                        </div>
                    </div>
                </div>

                {/* Background Selection */}
                <div>
                    <BackgroundGallery
                        onSelectBackground={setBackgroundConfig}
                        currentConfig={backgroundConfig}
                    />
                </div>
            </div>
        </div>
    );
};
