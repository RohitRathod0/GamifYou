import { useEffect, useRef, useState } from 'react';
import { HandTrackingData } from '@/hooks/useHandTracking';
import { getPinchDistance, landmarkToCanvas } from '@/games/GestureController';

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

export const useFingerDraw = ({
    trackingData,
    canvasWidth,
    canvasHeight,
    enabled,
    color = '#000000',
    brushSize = 4,
    mirror = true,
    onEmitStroke
}: {
    trackingData: HandTrackingData;
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
        if (!enabled) {
            if (isDrawingRef.current) {
                isDrawingRef.current = false;
                setIsDrawing(false);
                setCurrentPoint(null);
            }
            return;
        }

        const landmarks = trackingData.landmarks[0];
        if (!landmarks || landmarks.length < 21) {
            if (isDrawingRef.current) {
                isDrawingRef.current = false;
                setIsDrawing(false);
                setCurrentPoint(null);
                onEmitStroke({ points: [], color, brushSize, isEnd: true });
            }
            return;
        }

        const pinchDist = getPinchDistance(landmarks);
        const isPinching = pinchDist < 0.05;

        const indexTip = landmarks[8];
        const point = landmarkToCanvas(indexTip, canvasWidth, canvasHeight, mirror);

        setCurrentPoint(point);

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
    }, [trackingData, enabled, canvasWidth, canvasHeight, mirror, color, brushSize, onEmitStroke]);

    return {
        isDrawing,
        currentPoint,
    };
};
