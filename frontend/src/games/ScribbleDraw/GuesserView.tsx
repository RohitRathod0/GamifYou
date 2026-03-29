import React, { useRef, useEffect } from 'react';
import { ScribbleCanvas, ScribbleCanvasRef } from './ScribbleCanvas';
import { StrokeData } from './useFingerDraw';

interface GuesserViewProps {
    strokes: (StrokeData & { player_id: string })[];
    clearTrigger: number;
}

export const GuesserView: React.FC<GuesserViewProps> = ({ strokes, clearTrigger }) => {
    const canvasRef = useRef<ScribbleCanvasRef>(null);
    const lastRenderedIndex = useRef(-1);

    useEffect(() => {
        if (canvasRef.current) {
            canvasRef.current.clear();
            lastRenderedIndex.current = -1;
        }
    }, [clearTrigger]);

    useEffect(() => {
        if (!canvasRef.current) return;
        
        // Render only new strokes
        for (let i = lastRenderedIndex.current + 1; i < strokes.length; i++) {
            const seg = strokes[i];
            canvasRef.current.addStrokeSegment(seg.player_id, seg);
        }
        lastRenderedIndex.current = strokes.length - 1;
        
    }, [strokes]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <ScribbleCanvas ref={canvasRef} width={800} height={600} readonly={true} />
            <div style={{ marginTop: '10px', fontSize: '1.2rem', color: '#888' }}>
                ✏️ Watch closely and guess!
            </div>
        </div>
    );
};
