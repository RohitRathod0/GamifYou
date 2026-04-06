import { useEffect, useRef } from 'react';
import { useHandTracking } from '@/hooks/useHandTracking';

interface BalloonPopProps {
    localStream?: MediaStream | null;
    playerId: string;
    gameState: any;
    onStateUpdate: (state: any) => void;
}


export const BalloonPop: React.FC<BalloonPopProps> = ({
    localStream,
    playerId: _playerId,
    gameState: _gameState,
    onStateUpdate: _onStateUpdate,
}) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const { trackingData, trackingDataRef } = useHandTracking(videoRef, localStream);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animationRef = useRef<number>();

    // TODO: Implement balloon spawning logic
    // TODO: Implement collision detection with hand
    // TODO: Implement scoring system
    // TODO: Implement timer

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let running = true;
        const gameLoop = () => {
            if (!running) return;
            
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Draw hand tracking position
            const currentData = trackingDataRef.current || trackingData;
            if (currentData?.landmarks?.[0]) {
                const palm = currentData.landmarks[0][9];
                ctx.fillStyle = '#00ff00';
                ctx.beginPath();
                ctx.arc(palm.x * canvas.width, palm.y * canvas.height, 20, 0, Math.PI * 2);
                ctx.fill();
            }

            // Draw placeholder text
            ctx.fillStyle = '#ffffff';
            ctx.font = '24px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('Balloon Pop Game', canvas.width / 2, canvas.height / 2);
            ctx.fillText('Move your hands to pop balloons!', canvas.width / 2, canvas.height / 2 + 40);
            ctx.fillText('Score: 0', canvas.width / 2, 50);
            ctx.fillText('Time: 60s', canvas.width / 2, 80);

            animationRef.current = requestAnimationFrame(gameLoop);
        };

        gameLoop();

        return () => {
            running = false;
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
        };
    }, [trackingData, trackingDataRef]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
            <video ref={videoRef} autoPlay playsInline muted style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 1, height: 1 }} />
            <h2>Balloon Pop</h2>
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
        </div>
    );
};