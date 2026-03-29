import React, { useRef, useState, useEffect } from 'react';
import { HandTrackingData } from '@/hooks/useHandTracking';
import { ScribbleCanvas, ScribbleCanvasRef } from './ScribbleCanvas';
import { useFingerDraw, StrokeData } from './useFingerDraw';

interface DrawerViewProps {
    trackingData: HandTrackingData;
    playerId: string;
    onEmitStroke: (data: StrokeData) => void;
    onEmitClear: () => void;
}

const COLORS = ['#000000', '#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#ec4899', '#ffffff'];
const SIZES = [2, 4, 8, 12, 16];

export const DrawerView: React.FC<DrawerViewProps> = ({ trackingData, playerId, onEmitStroke, onEmitClear }) => {
    const canvasRef = useRef<ScribbleCanvasRef>(null);
    const [color, setColor] = useState('#000000');
    const [brushSize, setBrushSize] = useState(4);

    const handleEmitStroke = (data: StrokeData) => {
        // Optimistically draw on local canvas
        canvasRef.current?.addStrokeSegment(playerId, data);
        // Relay to server
        onEmitStroke(data);
    };

    const { isDrawing, currentPoint } = useFingerDraw({
        trackingData,
        canvasWidth: 800,
        canvasHeight: 600,
        enabled: true,
        color,
        brushSize,
        mirror: true, // Local tracking is mirrored
        onEmitStroke: handleEmitStroke,
    });

    // Update cursor
    useEffect(() => {
        if (canvasRef.current) {
            canvasRef.current.drawCursor(currentPoint, isDrawing, color === '#ffffff' ? '#aaaaaa' : color);
        }
    }, [currentPoint, isDrawing, color]);

    const handleClear = () => {
        canvasRef.current?.clear();
        onEmitClear();
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
            <ScribbleCanvas ref={canvasRef} width={800} height={600} readonly={false} />
            
            <div style={{ display: 'flex', gap: '20px', padding: '15px', background: '#333', borderRadius: '12px' }}>
                {/* Colors */}
                <div style={{ display: 'flex', gap: '10px' }}>
                    {COLORS.map(c => (
                        <button
                            key={c}
                            onClick={() => setColor(c)}
                            title={c === '#ffffff' ? 'Eraser' : c}
                            style={{
                                width: '30px', height: '30px', borderRadius: '50%', background: c,
                                border: color === c ? '3px solid #60a5fa' : '1px solid #555',
                                cursor: 'pointer'
                            }}
                        />
                    ))}
                </div>
                
                {/* Sizes */}
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', borderLeft: '1px solid #555', paddingLeft: '20px' }}>
                    {SIZES.map(s => (
                        <button
                            key={s}
                            onClick={() => setBrushSize(s)}
                            style={{
                                width: '30px', height: '30px', borderRadius: '4px',
                                background: brushSize === s ? '#555' : 'transparent',
                                border: 'none', color: '#fff', cursor: 'pointer',
                                display: 'flex', justifyContent: 'center', alignItems: 'center'
                            }}
                        >
                            <div style={{ width: s, height: s, borderRadius: '50%', background: '#fff' }} />
                        </button>
                    ))}
                </div>

                <div style={{ borderLeft: '1px solid #555', paddingLeft: '20px' }}>
                    <button
                        onClick={handleClear}
                        style={{ padding: '8px 16px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
                    >
                        🗑️ Clear
                    </button>
                </div>
            </div>
        </div>
    );
};
