import { useEffect, useRef } from 'react';
import { HandTrackingData } from '@/hooks/useHandTracking';

interface PictionaryProps {
    trackingData: HandTrackingData;
    playerId: string;
    gameState: any;
    onStateUpdate: (state: any) => void;
}

export const Pictionary: React.FC<PictionaryProps> = ({
    trackingData,
    playerId: _playerId,
    gameState: _gameState,
    onStateUpdate: _onStateUpdate,
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // TODO: Implement drawing with index finger
    // TODO: Implement word selection
    // TODO: Implement AI guess recognition
    // TODO: Implement turn rotation

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Track index finger for drawing
        if (trackingData.landmarks[0]) {
            const indexTip = trackingData.landmarks[0][8];
            const x = indexTip.x * canvas.width;
            const y = indexTip.y * canvas.height;

            // Simple drawing logic (placeholder)
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(x, y, 5, 0, Math.PI * 2);
            ctx.fill();
        }
    }, [trackingData]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
            <h2>Gesture Pictionary</h2>
            <canvas
                ref={canvasRef}
                width={800}
                height={600}
                style={{
                    border: '2px solid #333',
                    borderRadius: '10px',
                    backgroundColor: '#1a1a1a',
                }}
            />
            <p style={{ color: '#fff' }}>Draw in the air with your finger!</p>
        </div>
    );
};