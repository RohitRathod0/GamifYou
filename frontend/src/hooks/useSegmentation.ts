import { useEffect, useRef, useState, useCallback } from 'react';
import { initializeSegmentation, segmentPerson, cleanupSegmentation } from '../features/background/segmentation';
import { SegmentationResult, SegmentationConfig } from '../features/background/types';

/**
 * React hook for real-time person segmentation
 */
export const useSegmentation = (
    videoRef: React.RefObject<HTMLVideoElement>,
    config?: SegmentationConfig
) => {
    const [isReady, setIsReady] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [segmentationMask, setSegmentationMask] = useState<SegmentationResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const animationFrameRef = useRef<number>();

    // Initialize segmentation model
    useEffect(() => {
        let mounted = true;

        const init = async () => {
            try {
                await initializeSegmentation(config);
                if (mounted) {
                    setIsReady(true);
                    console.log('✅ Segmentation hook ready');
                }
            } catch (err) {
                if (mounted) {
                    setError(err instanceof Error ? err.message : 'Failed to initialize segmentation');
                    console.error('❌ Segmentation initialization error:', err);
                }
            }
        };

        init();

        return () => {
            mounted = false;
            cleanupSegmentation();
        };
    }, [config]);

    // Process video frames
    const processFrame = useCallback(async () => {
        if (!videoRef.current || !isReady || isProcessing) {
            return;
        }

        setIsProcessing(true);

        try {
            const result = await segmentPerson(videoRef.current);
            if (result) {
                setSegmentationMask(result);
            }
        } catch (err) {
            console.error('Segmentation error:', err);
            setError(err instanceof Error ? err.message : 'Segmentation failed');
        } finally {
            setIsProcessing(false);
        }
    }, [videoRef, isReady, isProcessing]);

    // Start/stop segmentation
    const startSegmentation = useCallback(() => {
        const processLoop = async () => {
            await processFrame();
            animationFrameRef.current = requestAnimationFrame(processLoop);
        };

        processLoop();
    }, [processFrame]);

    const stopSegmentation = useCallback(() => {
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
        }
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            stopSegmentation();
        };
    }, [stopSegmentation]);

    return {
        isReady,
        segmentationMask,
        error,
        startSegmentation,
        stopSegmentation,
    };
};
