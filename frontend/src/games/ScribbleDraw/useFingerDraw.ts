import { useEffect, useRef, useState } from 'react';
import { HandTrackingData } from '@/hooks/useHandTracking';
import { getPinchDistance, landmarkToCanvas } from '@/games/Chess/GestureController';

export interface Point {
    x: number;
    y: number;
}

export interface StrokeData {
    points: Point[];
    color: string;
    brushSize: number;
    isEnd: boolean;
}

class KalmanFilter1D {
    private q: number; // Process noise
    private r: number; // Measurement noise
    private p: number; // Estimation error covariance
    private x: number; // State estimate

    constructor(q: number, r: number, p: number, initial_x: number) {
        this.q = q;
        this.r = r;
        this.p = p;
        this.x = initial_x;
    }

    update(measurement: number): number {
        if (isNaN(this.x)) {
            this.x = measurement;
        }
        
        // Prediction update
        this.p = this.p + this.q;

        // Measurement update
        const k = this.p / (this.p + this.r);
        this.x = this.x + k * (measurement - this.x);
        this.p = (1 - k) * this.p;

        return this.x;
    }

    reset(initial_x: number) {
        this.x = initial_x;
    }
}

// Configuration for drawing stabilization
const KALMAN_Q = 0.005; // Less reactive to sudden jumps (process noise)
const KALMAN_R = 0.05;   // Trust past predictions more (measurement noise)
const DEAD_ZONE_RADIUS = 2.5; // Pixels distance to ignore micro-movements

export const useFingerDraw = ({
    trackingData,
    trackingDataRef,
    canvasWidth,
    canvasHeight,
    enabled,
    color = '#000000',
    brushSize = 4,
    mirror = true,
    onEmitStroke
}: {
    trackingData: HandTrackingData;
    trackingDataRef?: React.MutableRefObject<HandTrackingData>;
    canvasWidth: number;
    canvasHeight: number;
    enabled: boolean;
    color?: string;
    brushSize?: number;
    mirror?: boolean;
    onEmitStroke: (data: StrokeData) => void;
}) => {
    const [isDrawing, setIsDrawing] = useState(false);
    const [currentPoint, setCurrentPoint] = useState<Point | null>(null);
    
    const bufferRef = useRef<Point[]>([]);
    const isDrawingRef = useRef(false);
    
    // Tracking stability state
    const kalmanX = useRef(new KalmanFilter1D(KALMAN_Q, KALMAN_R, 1, NaN));
    const kalmanY = useRef(new KalmanFilter1D(KALMAN_Q, KALMAN_R, 1, NaN));
    const lastPoint = useRef<Point | null>(null);

    useEffect(() => {
        if (!enabled) return;
        
        const emitBuffer = () => {
            if (bufferRef.current.length > 0) {
                onEmitStroke({
                    points: [...bufferRef.current],
                    color,
                    brushSize,
                    isEnd: false
                });
                bufferRef.current = [];
            }
        };

        const intervalId = setInterval(emitBuffer, 30);
        return () => {
            clearInterval(intervalId);
            emitBuffer(); // flush remaining
        };
    }, [enabled, color, brushSize, onEmitStroke]);

    useEffect(() => {
        let running = true;
        const rafId = { current: 0 };

        const loop = () => {
            if (!running) return;
            rafId.current = requestAnimationFrame(loop);

            if (!enabled) {
                if (isDrawingRef.current) {
                    isDrawingRef.current = false;
                    setIsDrawing(false);
                    setCurrentPoint(null);
                    lastPoint.current = null;
                }
                kalmanX.current.reset(NaN);
                kalmanY.current.reset(NaN);
                return;
            }

            const activeData = trackingDataRef?.current || trackingData;
            const landmarks = activeData.landmarks[0];
            
            if (!landmarks || landmarks.length < 21) {
                if (isDrawingRef.current) {
                    isDrawingRef.current = false;
                    setIsDrawing(false);
                    setCurrentPoint(null);
                    lastPoint.current = null;
                    onEmitStroke({ points: [], color, brushSize, isEnd: true });
                }
                kalmanX.current.reset(NaN);
                kalmanY.current.reset(NaN);
                return;
            }

            const pinchDist = getPinchDistance(landmarks);
            const isPinching = pinchDist < 0.05;

            const indexTip = landmarks[8];
            const rawPoint = landmarkToCanvas(indexTip, canvasWidth, canvasHeight, mirror);
            
            // Pass through Kalman Filter
            let kx = kalmanX.current.update(rawPoint.x);
            let ky = kalmanY.current.update(rawPoint.y);

            // Apply Dead Zone (Stability Filter)
            if (lastPoint.current) {
                const dx = kx - lastPoint.current.x;
                const dy = ky - lastPoint.current.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                // Normalize distance effectively checks threshold scaling logic
                if (dist < DEAD_ZONE_RADIUS) {
                    kx = lastPoint.current.x;
                    ky = lastPoint.current.y;
                }
            }

            const point = { x: Math.round(kx), y: Math.round(ky) }; // Clean, whole pixels
            lastPoint.current = point;

            // Only update state if significantly changed to avoid re-renders
            setCurrentPoint(prev => prev && prev.x === point.x && prev.y === point.y ? prev : point);

            if (isPinching) {
                if (!isDrawingRef.current) {
                    isDrawingRef.current = true;
                    setIsDrawing(true);
                }
                bufferRef.current.push(point);
                
            } else {
                if (isDrawingRef.current) {
                    isDrawingRef.current = false;
                    setIsDrawing(false);
                    
                    if (bufferRef.current.length > 0) {
                         onEmitStroke({
                             points: [...bufferRef.current],
                             color,
                             brushSize,
                             isEnd: false
                         });
                         bufferRef.current = [];
                    }
                    onEmitStroke({ points: [], color, brushSize, isEnd: true });
                }
            }
        };

        rafId.current = requestAnimationFrame(loop);
        
        return () => {
            running = false;
            cancelAnimationFrame(rafId.current);
        };
    }, [enabled, canvasWidth, canvasHeight, mirror, color, brushSize, trackingData, trackingDataRef, onEmitStroke]);

    return {
        isDrawing,
        currentPoint,
    };
};
