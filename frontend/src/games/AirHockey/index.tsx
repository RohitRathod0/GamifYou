import { useEffect, useRef, useState } from 'react';
import { useHandTracking } from '@/hooks/useHandTracking';

interface AirHockeyProps {
    localStream?: MediaStream | null;
    playerId?: string;
    gameState?: any;
    onStateUpdate?: (state: any) => void;
    sendMessage?: (type: string, data: any) => void;
}

interface Paddle {
    rawX: number;
    rawY: number;
    smoothX: number;
    smoothY: number;
    vx: number;
    vy: number;
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
    localStream,
    playerId,
    gameState,
    onStateUpdate,
    sendMessage,
}) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const { trackingData, trackingDataRef } = useHandTracking(videoRef, localStream);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // Hand-to-paddle assignment tracking (locks hands to specific paddles)
    const handAssignmentsRef = useRef<{ red: number | null; blue: number | null }>({
        red: null,
        blue: null,
    });
    const lastSeenHandsRef = useRef<number>(0);

    const isMultiplayer = !!gameState?.my_color;
    const isHost = gameState?.my_color === 'white';
    const myRole = isMultiplayer ? (isHost ? 'blue' : 'red') : 'local'; // Host = Blue (Bottom), Guest = Red (Top)
    const lastSendRef = useRef<number>(0);

    // Local 2-player mode: track BOTH paddles
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
    const paddle1Ref = useRef<Paddle>({ 
        rawX: 400, rawY: 100, smoothX: 400, smoothY: 100, vx: 0, vy: 0, radius: 30 
    });
    const paddle2Ref = useRef<Paddle>({ 
        rawX: 400, rawY: 500, smoothX: 400, smoothY: 500, vx: 0, vy: 0, radius: 30 
    });

    // Update refs when state changes
    useEffect(() => {
        // Only update local ref if not host in multiplayer, so we don't clobber the shared reference
        if (!isMultiplayer || isHost) {
            puckRef.current = puck;
        }
    }, [puck, isMultiplayer, isHost]);

    // Receive incoming state from opponent
    useEffect(() => {
        if (!gameState?.incomingState) return;
        const msg = gameState.incomingState;
        
        if (myRole === 'blue') {
            // I am host (blue), receive guest (red) paddle
            if (msg.paddle === 'red') {
                paddle1Ref.current.rawX = msg.x;
                paddle1Ref.current.rawY = msg.y;
                paddle1Ref.current.vx = msg.vx;
                paddle1Ref.current.vy = msg.vy;
            }
        } else if (myRole === 'red') {
            // I am guest (red), receive host (blue) paddle, puck, and scores
            if (msg.paddle === 'blue') {
                paddle2Ref.current.rawX = msg.x;
                paddle2Ref.current.rawY = msg.y;
                paddle2Ref.current.vx = msg.vx;
                paddle2Ref.current.vy = msg.vy;
            }
            if (msg.puck) {
                puckRef.current = msg.puck;
                setPuck(msg.puck);
            }
            if (msg.scores) {
                setScore1(msg.scores.score1);
                setScore2(msg.scores.score2);
            }
        }
    }, [gameState?.incomingState, myRole]);

    // Game logic for paddles moved entirely inside game loop

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

            // --- Tracking Update ---
            const currentData = trackingDataRef.current || trackingData;
            if (currentData.landmarks && currentData.landmarks.length > 0) {
                const currentHandCount = currentData.landmarks.length;

                const updatePaddleRef = (paddleRef: React.MutableRefObject<Paddle>, palmCenter: any) => {
                    const rawPointX = (1 - palmCenter.x) * canvas.width;
                    const rawPointY = palmCenter.y * canvas.height;
                    
                    const clampedX = Math.max(30, Math.min(rawPointX, canvas.width - 30));
                    const clampedY = Math.max(30, Math.min(rawPointY, canvas.height - 30));

                    const dt = 1; 
                    paddleRef.current.vx = (clampedX - paddleRef.current.rawX) / dt;
                    paddleRef.current.vy = (clampedY - paddleRef.current.rawY) / dt;
                    
                    paddleRef.current.rawX = clampedX;
                    paddleRef.current.rawY = clampedY;
                };

                if (isMultiplayer) {
                    if (currentHandCount > 0) {
                        const palmCenter = currentData.landmarks[0][9];
                        if (palmCenter) {
                            if (myRole === 'blue') {
                                updatePaddleRef(paddle2Ref, palmCenter);
                            } else {
                                updatePaddleRef(paddle1Ref, palmCenter);
                            }
                        }
                    }
                } else {
                    if (lastSeenHandsRef.current === 0 && currentHandCount > 0) {
                        handAssignmentsRef.current = { red: null, blue: null };
                    }
                    lastSeenHandsRef.current = currentHandCount;

                    if (handAssignmentsRef.current.red === null && handAssignmentsRef.current.blue === null && currentHandCount > 0) {
                        if (currentHandCount === 1) {
                            handAssignmentsRef.current = { red: 0, blue: null };
                        } else if (currentHandCount === 2) {
                            const hand0Y = currentData.landmarks[0][9]?.y || 0;
                            const hand1Y = currentData.landmarks[1][9]?.y || 0;
                            if (hand0Y < hand1Y) {
                                handAssignmentsRef.current = { red: 0, blue: 1 };
                            } else {
                                handAssignmentsRef.current = { red: 1, blue: 0 };
                            }
                        }
                    } else if (handAssignmentsRef.current.red === null && handAssignmentsRef.current.blue !== null && currentHandCount === 2) {
                        handAssignmentsRef.current.red = handAssignmentsRef.current.blue === 0 ? 1 : 0;
                    } else if (handAssignmentsRef.current.blue === null && handAssignmentsRef.current.red !== null && currentHandCount === 2) {
                        handAssignmentsRef.current.blue = handAssignmentsRef.current.red === 0 ? 1 : 0;
                    }

                    if (handAssignmentsRef.current.red !== null && currentData.landmarks[handAssignmentsRef.current.red]) {
                        const palmCenter = currentData.landmarks[handAssignmentsRef.current.red][9];
                        if (palmCenter) updatePaddleRef(paddle1Ref, palmCenter);
                    }

                    if (handAssignmentsRef.current.blue !== null && currentData.landmarks[handAssignmentsRef.current.blue]) {
                        const palmCenter = currentData.landmarks[handAssignmentsRef.current.blue][9];
                        if (palmCenter) updatePaddleRef(paddle2Ref, palmCenter);
                    }
                }
            } else if (currentData.landmarks.length === 0) {
                lastSeenHandsRef.current = 0;
            }
            // --- End Tracking Update ---

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

            // Apply Adaptive Smoothing to Paddles
            const applyAdaptiveSmoothing = (paddle: Paddle) => {
                const speed = Math.sqrt(paddle.vx ** 2 + paddle.vy ** 2);
                const alpha = speed > 20 ? 0.8 : 0.2; // fast catch up for fast moves, stable for small moves
                
                paddle.smoothX = alpha * paddle.rawX + (1 - alpha) * paddle.smoothX;
                paddle.smoothY = alpha * paddle.rawY + (1 - alpha) * paddle.smoothY;
            };
            
            applyAdaptiveSmoothing(paddle1Ref.current);
            applyAdaptiveSmoothing(paddle2Ref.current);

            // Draw paddles using smoothed physical positions
            ctx.fillStyle = '#ff0000';
            ctx.beginPath();
            ctx.arc(paddle1Ref.current.smoothX, paddle1Ref.current.smoothY, paddle1Ref.current.radius, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#0000ff';
            ctx.beginPath();
            ctx.arc(paddle2Ref.current.smoothX, paddle2Ref.current.smoothY, paddle2Ref.current.radius, 0, Math.PI * 2);
            ctx.fill();

            // Update puck physics (use ref to avoid setState in loop)
            let newPuck = { ...puckRef.current };

            // Paddle collisions (Using Prediction + Radius Buffer logic)
            const checkPaddleCollision = (paddle: Paddle) => {
                // ... paddle collision code
                const predX = paddle.rawX + paddle.vx * 0.5;
                const predY = paddle.rawY + paddle.vy * 0.5;
                const collisionRadius = paddle.radius + 5; // Extra buffer

                const dx = newPuck.x - predX;
                const dy = newPuck.y - predY;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance < newPuck.radius + collisionRadius) {
                    // Bounce off predicted path
                    const angle = Math.atan2(dy, dx);
                    
                    const puckSpeed = Math.sqrt(newPuck.vx ** 2 + newPuck.vy ** 2);
                    const paddleSpeed = Math.sqrt(paddle.vx ** 2 + paddle.vy ** 2);
                    
                    // Add paddle velocity to the hit (creates hard spikes / slams!)
                    const newSpeed = Math.min((puckSpeed + (paddleSpeed * 0.15)) * 1.1, 15);

                    newPuck.vx = Math.cos(angle) * newSpeed;
                    newPuck.vy = Math.sin(angle) * newSpeed;

                    // Move puck outside predicted bounce zone
                    const overlap = newPuck.radius + collisionRadius - distance;
                    newPuck.x += Math.cos(angle) * overlap;
                    newPuck.y += Math.sin(angle) * overlap;
                }
            };

            // Only compute puck physics if local or host
            if (!isMultiplayer || isHost) {
                // Move puck
                newPuck.x += newPuck.vx * deltaTime;
                newPuck.y += newPuck.vy * deltaTime;

                // Wall collisions (left/right)
                if (newPuck.x - newPuck.radius < 0 || newPuck.x + newPuck.radius > canvas.width) {
                    newPuck.vx *= -0.95; // Slight dampening
                    newPuck.x = Math.max(newPuck.radius, Math.min(canvas.width - newPuck.radius, newPuck.x));
                }

                // Goal detection
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

                checkPaddleCollision(paddle1Ref.current);
                checkPaddleCollision(paddle2Ref.current);

                // Update puck ref
                puckRef.current = newPuck;
                setPuck(newPuck); 
            } else {
                newPuck = puckRef.current;
            }

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

            // Broadcast state if multiplayer
            if (isMultiplayer && sendMessage) {
                if (currentTime - lastSendRef.current > 33) { // ~30 fps
                    lastSendRef.current = currentTime;
                    if (myRole === 'blue') {
                        // Host sends its paddle, puck, and scores
                        sendMessage('game_state_update', {
                            state: {
                                paddle: 'blue',
                                x: paddle2Ref.current.rawX,
                                y: paddle2Ref.current.rawY,
                                vx: paddle2Ref.current.vx,
                                vy: paddle2Ref.current.vy,
                                puck: puckRef.current,
                                scores: { score1, score2 }
                            }
                        });
                    } else if (myRole === 'red') {
                        // Guest sends its paddle
                        sendMessage('game_state_update', {
                            state: {
                                paddle: 'red',
                                x: paddle1Ref.current.rawX,
                                y: paddle1Ref.current.rawY,
                                vx: paddle1Ref.current.vx,
                                vy: paddle1Ref.current.vy,
                            }
                        });
                    }
                }
            }

            animationRef.current = requestAnimationFrame(gameLoop);
        };

        gameLoop();

        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
        };
    }, [score1, score2, trackingData, trackingDataRef]); // Removed paddle1, paddle2, puck from dependencies

    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
            <video ref={videoRef} autoPlay playsInline muted style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 1, height: 1 }} />
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
                    {isMultiplayer
                        ? `🌐 Multiplayer: You are controlling the ${myRole === 'blue' ? '🔵 Blue (Bottom)' : '🔴 Red (Top)'} paddle`
                        : trackingData?.landmarks?.length === 2
                            ? '✅ Both paddles active! Play together!'
                            : trackingData?.landmarks?.length === 1
                                ? '👋 Show second hand to activate blue paddle'
                                : '⏳ Show hands to start playing'}
                </p>
            </div>
        </div>
    );
};