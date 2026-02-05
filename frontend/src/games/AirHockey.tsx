import { useEffect, useRef, useState } from 'react';
import { HandTrackingData } from '@/hooks/useHandTracking';

interface AirHockeyProps {
    trackingData: HandTrackingData;
    playerId: string;
    gameState: any;
    onStateUpdate: (state: any) => void;
}

interface Paddle {
    x: number;
    y: number;
    radius: number;
}

interface Puck {
    x: number;
    y: number;
    vx: number;
    vy: number;
    radius: number;
}

export const AirHockey: React.FC<AirHockeyProps> = ({
    trackingData,
    playerId,
    gameState,
    onStateUpdate,
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // Hand-to-paddle assignment tracking (locks hands to specific paddles)
    const [handAssignments, setHandAssignments] = useState<{ red: number | null; blue: number | null }>({
        red: null,
        blue: null,
    });
    const lastSeenHandsRef = useRef<number>(0);

    // Local 2-player mode: track BOTH paddles
    const [paddle1, setPaddle1] = useState<Paddle>({ x: 400, y: 100, radius: 30 });
    const [paddle2, setPaddle2] = useState<Paddle>({ x: 400, y: 500, radius: 30 });

    const [puck, setPuck] = useState<Puck>({
        x: 400,
        y: 300,
        vx: 3,
        vy: 2,
        radius: 15,
    });

    const [score1, setScore1] = useState(0);
    const [score2, setScore2] = useState(0);

    const animationRef = useRef<number>();
    const puckRef = useRef<Puck>(puck);
    const paddle1Ref = useRef<Paddle>(paddle1);
    const paddle2Ref = useRef<Paddle>(paddle2);

    // Update refs when state changes
    useEffect(() => {
        puckRef.current = puck;
    }, [puck]);

    useEffect(() => {
        paddle1Ref.current = paddle1;
    }, [paddle1]);

    useEffect(() => {
        paddle2Ref.current = paddle2;
    }, [paddle2]);

    // Update BOTH paddles from hand tracking with hand-locking system
    useEffect(() => {
        if (trackingData.landmarks && trackingData.landmarks.length > 0 && canvasRef.current) {
            const canvas = canvasRef.current;
            const currentHandCount = trackingData.landmarks.length;

            // Reset assignments if both hands were lost
            if (lastSeenHandsRef.current === 0 && currentHandCount > 0) {
                setHandAssignments({ red: null, blue: null });
            }
            lastSeenHandsRef.current = currentHandCount;

            // Assign hands to paddles on first detection
            if (handAssignments.red === null && handAssignments.blue === null && currentHandCount > 0) {
                if (currentHandCount === 1) {
                    // First hand detected -> assign to red paddle
                    setHandAssignments({ red: 0, blue: null });
                } else if (currentHandCount === 2) {
                    // Two hands detected -> assign based on Y position
                    const hand0Y = trackingData.landmarks[0][9]?.y || 0;
                    const hand1Y = trackingData.landmarks[1][9]?.y || 0;

                    if (hand0Y < hand1Y) {
                        // Hand 0 is higher (top) -> red, Hand 1 is lower (bottom) -> blue
                        setHandAssignments({ red: 0, blue: 1 });
                    } else {
                        // Hand 1 is higher (top) -> red, Hand 0 is lower (bottom) -> blue
                        setHandAssignments({ red: 1, blue: 0 });
                    }
                }
            } else if (handAssignments.red === null && handAssignments.blue !== null && currentHandCount === 2) {
                // Blue is assigned, now assign red to the other hand
                setHandAssignments(prev => ({ ...prev, red: prev.blue === 0 ? 1 : 0 }));
            } else if (handAssignments.blue === null && handAssignments.red !== null && currentHandCount === 2) {
                // Red is assigned, now assign blue to the other hand
                setHandAssignments(prev => ({ ...prev, blue: prev.red === 0 ? 1 : 0 }));
            }

            // Update red paddle position (if assigned)
            if (handAssignments.red !== null && trackingData.landmarks[handAssignments.red]) {
                const palmCenter = trackingData.landmarks[handAssignments.red][9];
                if (palmCenter) {
                    const newX = (1 - palmCenter.x) * canvas.width;
                    const newY = palmCenter.y * canvas.height;

                    setPaddle1({
                        x: Math.max(30, Math.min(newX, canvas.width - 30)), // Keep within canvas bounds
                        y: Math.max(30, Math.min(newY, canvas.height - 30)), // Allow full movement
                        radius: 30,
                    });
                }
            }

            // Update blue paddle position (if assigned)
            if (handAssignments.blue !== null && trackingData.landmarks[handAssignments.blue]) {
                const palmCenter = trackingData.landmarks[handAssignments.blue][9];
                if (palmCenter) {
                    const newX = (1 - palmCenter.x) * canvas.width;
                    const newY = palmCenter.y * canvas.height;

                    setPaddle2({
                        x: Math.max(30, Math.min(newX, canvas.width - 30)), // Keep within canvas bounds
                        y: Math.max(30, Math.min(newY, canvas.height - 30)), // Allow full movement
                        radius: 30,
                    });
                }
            }
        } else if (trackingData.landmarks.length === 0) {
            // No hands detected
            lastSeenHandsRef.current = 0;
        }
    }, [trackingData, handAssignments]);

    // Game loop with physics
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let lastTime = Date.now();

        const gameLoop = () => {
            const currentTime = Date.now();
            const deltaTime = (currentTime - lastTime) / 16; // Normalize to 60fps
            lastTime = currentTime;

            // Clear canvas
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Draw center line
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.setLineDash([10, 10]);
            ctx.beginPath();
            ctx.moveTo(0, canvas.height / 2);
            ctx.lineTo(canvas.width, canvas.height / 2);
            ctx.stroke();
            ctx.setLineDash([]);

            // Draw goals
            ctx.fillStyle = 'rgba(255, 0, 0, 0.2)';
            ctx.fillRect(canvas.width / 2 - 100, 0, 200, 20);
            ctx.fillStyle = 'rgba(0, 0, 255, 0.2)';
            ctx.fillRect(canvas.width / 2 - 100, canvas.height - 20, 200, 20);

            // Draw paddles
            ctx.fillStyle = '#ff0000';
            ctx.beginPath();
            ctx.arc(paddle1Ref.current.x, paddle1Ref.current.y, paddle1Ref.current.radius, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#0000ff';
            ctx.beginPath();
            ctx.arc(paddle2Ref.current.x, paddle2Ref.current.y, paddle2Ref.current.radius, 0, Math.PI * 2);
            ctx.fill();

            // Update puck physics (use ref to avoid setState in loop)
            let newPuck = { ...puckRef.current };

            // Move puck
            newPuck.x += newPuck.vx * deltaTime;
            newPuck.y += newPuck.vy * deltaTime;

            // Wall collisions (left/right)
            if (newPuck.x - newPuck.radius < 0 || newPuck.x + newPuck.radius > canvas.width) {
                newPuck.vx *= -0.95; // Slight dampening
                newPuck.x = Math.max(newPuck.radius, Math.min(canvas.width - newPuck.radius, newPuck.x));
            }

            // Goal detection - only score when puck CENTER enters goal area AND is within goal width
            const goalWidth = 200; // Goal is 200px wide
            const goalLeft = canvas.width / 2 - goalWidth / 2;
            const goalRight = canvas.width / 2 + goalWidth / 2;

            if (newPuck.y < 20 && newPuck.x > goalLeft && newPuck.x < goalRight) {
                // Player 2 (blue) scores - puck entered top goal
                setScore2(s => s + 1);
                newPuck = { x: 400, y: 300, vx: 3, vy: 2, radius: 15 };
            } else if (newPuck.y > canvas.height - 20 && newPuck.x > goalLeft && newPuck.x < goalRight) {
                // Player 1 (red) scores - puck entered bottom goal
                setScore1(s => s + 1);
                newPuck = { x: 400, y: 300, vx: 3, vy: -2, radius: 15 };
            }

            // Paddle collisions
            const checkPaddleCollision = (paddle: Paddle) => {
                const dx = newPuck.x - paddle.x;
                const dy = newPuck.y - paddle.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance < newPuck.radius + paddle.radius) {
                    // Bounce off paddle
                    const angle = Math.atan2(dy, dx);
                    const speed = Math.sqrt(newPuck.vx * newPuck.vx + newPuck.vy * newPuck.vy);
                    const newSpeed = Math.min(speed * 1.1, 8); // Speed up slightly, cap at 8

                    newPuck.vx = Math.cos(angle) * newSpeed;
                    newPuck.vy = Math.sin(angle) * newSpeed;

                    // Move puck outside paddle to prevent sticking
                    const overlap = newPuck.radius + paddle.radius - distance;
                    newPuck.x += Math.cos(angle) * overlap;
                    newPuck.y += Math.sin(angle) * overlap;
                }
            };

            checkPaddleCollision(paddle1Ref.current);
            checkPaddleCollision(paddle2Ref.current);

            // Update puck ref
            puckRef.current = newPuck;
            setPuck(newPuck); // Update state for React (but won't trigger re-render loop)

            // Draw puck
            ctx.fillStyle = '#ffff00';
            ctx.beginPath();
            ctx.arc(newPuck.x, newPuck.y, newPuck.radius, 0, Math.PI * 2);
            ctx.fill();

            // Draw scores
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 48px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(score1.toString(), canvas.width / 2, 60);
            ctx.fillText(score2.toString(), canvas.width / 2, canvas.height - 30);

            animationRef.current = requestAnimationFrame(gameLoop);
        };

        gameLoop();

        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
        };
    }, [score1, score2]); // Removed paddle1, paddle2, puck from dependencies

    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
            <div style={{
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                padding: '20px',
                borderRadius: '12px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.3)'
            }}>
                <canvas
                    ref={canvasRef}
                    width={800}
                    height={600}
                    style={{
                        border: '3px solid #fff',
                        borderRadius: '8px',
                        background: '#000',
                        display: 'block',
                    }}
                />
            </div>

            <div style={{
                textAlign: 'center',
                color: '#fff',
                fontSize: '0.9rem',
                maxWidth: '600px'
            }}>
                <p style={{ marginBottom: '10px' }}>
                    <strong>🎮 Controls:</strong>
                </p>
                <p style={{ color: '#ff6b6b' }}>
                    🔴 Red Paddle (Top): First hand detected
                </p>
                <p style={{ color: '#4dabf7' }}>
                    🔵 Blue Paddle (Bottom): Second hand detected
                </p>
                <p style={{ marginTop: '10px', fontSize: '0.8rem', color: '#aaa' }}>
                    {trackingData.landmarks.length === 2
                        ? '✅ Both paddles active! Play together!'
                        : trackingData.landmarks.length === 1
                            ? '👋 Show second hand to activate blue paddle'
                            : '⏳ Show hands to start playing'}
                </p>
            </div>
        </div>
    );
};