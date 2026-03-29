import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { Point, StrokeData } from './useFingerDraw';

export interface ScribbleCanvasRef {
    addStrokeSegment: (playerId: string, segment: StrokeData) => void;
    clear: () => void;
    redrawAll: (segments: (StrokeData & { player_id?: string })[]) => void;
    drawCursor: (point: Point | null, isPinching: boolean, color: string) => void;
}

interface ScribbleCanvasProps {
    width?: number;
    height?: number;
    readonly?: boolean;
}

export const ScribbleCanvas = forwardRef<ScribbleCanvasRef, ScribbleCanvasProps>(({
    width = 800, height = 600, readonly = false
}, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const cursorCanvasRef = useRef<HTMLCanvasElement>(null);
    
    // Track ongoing strokes per player to connect the lines
    const ongoingStrokes = useRef<Map<string, Point[]>>(new Map());

    const drawLine = (ctx: CanvasRenderingContext2D, points: Point[], color: string, size: number) => {
        if (points.length < 2) return;
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = size;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.stroke();
    };

    useImperativeHandle(ref, () => ({
        addStrokeSegment: (playerId: string, segment: StrokeData) => {
            const ctx = canvasRef.current?.getContext('2d');
            if (!ctx) return;

            let currentPoints = ongoingStrokes.current.get(playerId) || [];
            
            if (segment.points.length > 0) {
                // Add the last point to the new segment to ensure continuity
                let pointsToDraw = [...segment.points];
                if (currentPoints.length > 0) {
                    pointsToDraw = [currentPoints[currentPoints.length - 1], ...pointsToDraw];
                }
                
                drawLine(ctx, pointsToDraw, segment.color, segment.brushSize);
                currentPoints = [...currentPoints, ...segment.points];
                ongoingStrokes.current.set(playerId, currentPoints);
            }
            
            if (segment.isEnd) {
                ongoingStrokes.current.delete(playerId);
            }
        },
        clear: () => {
            const canvas = canvasRef.current;
            const ctx = canvas?.getContext('2d');
            if (canvas && ctx) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }
            ongoingStrokes.current.clear();
        },
        redrawAll: (segments: (StrokeData & {player_id?: string})[]) => {
             const canvas = canvasRef.current;
             const ctx = canvas?.getContext('2d');
             if (canvas && ctx) {
                 ctx.clearRect(0, 0, canvas.width, canvas.height);
                 ctx.fillStyle = '#ffffff';
                 ctx.fillRect(0, 0, canvas.width, canvas.height);
                 ongoingStrokes.current.clear();
                 
                 for (const seg of segments) {
                     const pid = seg.player_id || 'unknown';
                     let cur = ongoingStrokes.current.get(pid) || [];
                     if (seg.points.length > 0) {
                         let pts = [...seg.points];
                         if (cur.length > 0) {
                             pts = [cur[cur.length - 1], ...pts];
                         }
                         drawLine(ctx, pts, seg.color, seg.brushSize);
                         cur = [...cur, ...seg.points];
                         ongoingStrokes.current.set(pid, cur);
                     }
                     if (seg.isEnd) {
                         ongoingStrokes.current.delete(pid);
                     }
                 }
             }
        },
        drawCursor: (point: Point | null, isPinching: boolean, color: string) => {
             if (readonly) return;
             const canvas = cursorCanvasRef.current;
             const ctx = canvas?.getContext('2d');
             if (canvas && ctx) {
                 ctx.clearRect(0, 0, canvas.width, canvas.height);
                 if (point) {
                     ctx.beginPath();
                     ctx.arc(point.x, point.y, isPinching ? 8 : 4, 0, Math.PI * 2);
                     ctx.fillStyle = isPinching ? color : 'rgba(0,0,0,0.5)';
                     ctx.fill();
                     
                     if (!isPinching) {
                         ctx.beginPath();
                         ctx.arc(point.x, point.y, 8, 0, Math.PI * 2);
                         ctx.strokeStyle = color;
                         ctx.lineWidth = 2;
                         ctx.stroke();
                     }
                 }
             }
        }
    }));

    useEffect(() => {
        // Initial setup
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (canvas && ctx) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, width, height);
        }
    }, [width, height]);

    return (
        <div style={{ position: 'relative', width, height, borderRadius: '8px', overflow: 'hidden', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
            <canvas
                ref={canvasRef}
                width={width}
                height={height}
                style={{ position: 'absolute', top: 0, left: 0 }}
            />
            {!readonly && (
                <canvas
                    ref={cursorCanvasRef}
                    width={width}
                    height={height}
                    style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', zIndex: 10 }}
                />
            )}
        </div>
    );
});
