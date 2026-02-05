import { useEffect, useRef, useState, useCallback } from 'react';
import { getFaceDetectionService } from '../features/faceswap/faceDetection';
import { FaceMeshConfig, DEFAULT_FACE_MESH_CONFIG } from '../features/faceswap/types';

interface UseFaceMeshOptions {
    config?: FaceMeshConfig;
    enabled?: boolean;
}

interface UseFaceMeshReturn {
    isReady: boolean;
    error: string | null;
    results: any | null;
    faceCount: number;
}

export const useFaceMesh = (
    videoRef: React.RefObject<HTMLVideoElement>,
    options: UseFaceMeshOptions = {}
): UseFaceMeshReturn => {
    const { config = DEFAULT_FACE_MESH_CONFIG, enabled = true } = options;

    const [isReady, setIsReady] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [results, setResults] = useState<any | null>(null);
    const [faceCount, setFaceCount] = useState(0);

    const faceDetectionService = useRef(getFaceDetectionService());
    const animationFrameId = useRef<number | null>(null);

    const onResults = useCallback((detectionResults: any) => {
        setResults(detectionResults);
        setFaceCount(detectionResults.multiFaceLandmarks?.length || 0);
    }, []);

    useEffect(() => {
        if (!enabled) return;

        const initializeFaceMesh = async () => {
            try {
                await faceDetectionService.current.initialize(config);
                faceDetectionService.current.setOnResults(onResults);
                setIsReady(true);
                setError(null);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to initialize face mesh');
                setIsReady(false);
            }
        };

        initializeFaceMesh();

        return () => {
            if (animationFrameId.current) {
                cancelAnimationFrame(animationFrameId.current);
            }
        };
    }, [enabled, config, onResults]);

    useEffect(() => {
        if (!isReady || !enabled || !videoRef.current) return;

        const detectFaces = async () => {
            if (videoRef.current && videoRef.current.readyState === 4) {
                try {
                    await faceDetectionService.current.detectFaces(
                        videoRef.current,
                        onResults
                    );
                } catch (err) {
                    console.error('Face detection error:', err);
                }
            }

            animationFrameId.current = requestAnimationFrame(detectFaces);
        };

        detectFaces();

        return () => {
            if (animationFrameId.current) {
                cancelAnimationFrame(animationFrameId.current);
            }
        };
    }, [isReady, enabled, videoRef, onResults]);

    return {
        isReady,
        error,
        results,
        faceCount,
    };
};
