import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useHandTracking } from '@/hooks/useHandTracking';

interface BalloonPopProps {
    localStream?: MediaStream | null;
    playerId: string;
    gameState: any;
    onStateUpdate: (state: any) => void;
    sendMessage?: (type: string, data: any) => void;
}

interface Balloon {
    id: string;
    x: number;
    y: number;
    speed: number;
    color: string;
    radius: number;
}

interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    color: string;
}

export const BalloonPop: React.FC<BalloonPopProps> = ({
    localStream,
    playerId,
    gameState,
    sendMessage,
}) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const { trackingData, trackingDataRef } = useHandTracking(videoRef, localStream);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    
    // Game State
    const [score, setScore] = useState(0);
    const [remoteScores, setRemoteScores] = useState<Record<string, number>>({});
    const [timeLeft, setTimeLeft] = useState(60);
    const [isPlaying, setIsPlaying] = useState(false);
    
    // Refs for animation loop to access latest state without re-rendering loop
    const stateRef = useRef({
        balloons: [] as Balloon[],
        particles: [] as Particle[],
        lastSpawn: 0,
        score: 0,
        isPlaying: false,
    });
    
    const isMultiplayer = !!gameState?.my_color;
    const lastPinchRef = useRef<boolean>(false);
    const animationRef = useRef<number>();
    
    // Remote updates
    useEffect(() => {
        if (!gameState?.incomingState) return;
        const msg = gameState.incomingState;
        if (msg.type === 'score_update' && msg.playerId !== playerId) {
            setRemoteScores(prev => ({
                ...prev,
                [msg.playerId]: msg.score
            }));
        }
    }, [gameState?.incomingState, playerId]);

    const startGame = () => {
        setScore(0);
        setTimeLeft(60);
        setIsPlaying(true);
        stateRef.current.score = 0;
        stateRef.current.balloons = [];
        stateRef.current.particles = [];
        stateRef.current.isPlaying = true;
    };

    const endGame = useCallback(() => {
        setIsPlaying(false);
        stateRef.current.isPlaying = false;
    }, []);

    // Timer
    useEffect(() => {
        if (!isPlaying) return;
        const timer = setInterval(() => {
            setTimeLeft((t) => {
                if (t <= 1) {
                    clearInterval(timer);
                    endGame();
                    return 0;
                }
                return t - 1;
            });
        }, 1000);
        return () => clearInterval(timer);
    }, [isPlaying, endGame]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const colors = ['#f44336', '#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#2196f3', '#03a9f4', '#00bcd4', '#009688', '#4caf50', '#8bc34a', '#cddc39', '#ffeb3b', '#ffc107', '#ff9800', '#ff5722'];

        const createExplosion = (x: number, y: number, color: string) => {
            for (let i = 0; i < 20; i++) {
                const angle = Math.random() * Math.PI * 2;
                const speed = Math.random() * 5 + 2;
                stateRef.current.particles.push({
                    x, y,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    life: 1.0,
                    color
                });
            }
        };

        const popBalloon = (b: Balloon) => {
            createExplosion(b.x, b.y, b.color);
            stateRef.current.score += 10;
            setScore(stateRef.current.score);
            
            if (isMultiplayer && sendMessage) {
                sendMessage('game_state_update', { 
                    state: { 
                        type: 'score_update', 
                        playerId, 
                        score: stateRef.current.score 
                    } 
                });
            }
        };

        const gameLoop = (timestamp: number) => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Draw background gradient
            const bgGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
            bgGradient.addColorStop(0, '#1a1a2e');
            bgGradient.addColorStop(1, '#16213e');
            ctx.fillStyle = bgGradient;
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Update & Draw Balloons
            if (stateRef.current.isPlaying) {
                // Spawning
                if (timestamp - stateRef.current.lastSpawn > 1000) {
                    if (Math.random() > 0.3) {
                        stateRef.current.balloons.push({
                            id: Math.random().toString(),
                            x: Math.random() * (canvas.width - 100) + 50,
                            y: canvas.height + 60,
                            speed: Math.random() * 2 + 1.5,
                            color: colors[Math.floor(Math.random() * colors.length)],
                            radius: Math.random() * 15 + 35
                        });
                    }
                    stateRef.current.lastSpawn = timestamp;
                }

                for (let i = stateRef.current.balloons.length - 1; i >= 0; i--) {
                    const b = stateRef.current.balloons[i];
                    b.y -= b.speed;
                    // Draw balloon
                    ctx.beginPath();
                    ctx.fillStyle = b.color;
                    // Make it look like a balloon (slightly oval)
                    ctx.ellipse(b.x, b.y, b.radius, b.radius * 1.2, 0, 0, Math.PI * 2);
                    ctx.fill();
                    
                    // Balloon highlight
                    ctx.beginPath();
                    ctx.fillStyle = 'rgba(255,255,255,0.3)';
                    ctx.ellipse(b.x - b.radius * 0.3, b.y - b.radius * 0.4, b.radius * 0.2, b.radius * 0.4, Math.PI/4, 0, Math.PI * 2);
                    ctx.fill();

                    // String
                    ctx.beginPath();
                    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
                    ctx.lineWidth = 1;
                    ctx.moveTo(b.x, b.y + b.radius * 1.2);
                    // simple wave effect based on y position
                    ctx.quadraticCurveTo(b.x + Math.sin(b.y*0.05)*10, b.y + b.radius * 1.2 + 20, b.x, b.y + b.radius * 1.2 + 40);
                    ctx.stroke();

                    if (b.y < -b.radius * 2) {
                        stateRef.current.balloons.splice(i, 1);
                    }
                }
            }

            // Update & Draw Particles
            for (let i = stateRef.current.particles.length - 1; i >= 0; i--) {
                const p = stateRef.current.particles[i];
                p.x += p.vx;
                p.y += p.vy;
                p.vy += 0.1; // gravity
                p.life -= 0.02;
                if (p.life <= 0) {
                    stateRef.current.particles.splice(i, 1);
                    continue;
                }
                ctx.globalAlpha = p.life;
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(p.x, p.y, Math.max(0.1, p.life * 4), 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.globalAlpha = 1.0;

            // Hand Tracking & Pinch Detection
            const currentData = trackingDataRef.current;
            let currentPinch = false;
            let pinchX = 0;
            let pinchY = 0;

            if (currentData?.landmarks?.length > 0) {
                // Support multiple hands locally
                for (const hand of currentData.landmarks) {
                    const thumb = hand[4];
                    const index = hand[8];
                    
                    if (thumb && index) {
                        const rawX = (1 - ((thumb.x + index.x) / 2)) * canvas.width;
                        const rawY = ((thumb.y + index.y) / 2) * canvas.height;
                        
                        // Distance heuristic for pinch (Mediapipe coords are normalized 0-1)
                        const dx = thumb.x - index.x;
                        const dy = thumb.y - index.y;
                        const distance = Math.sqrt(dx*dx + dy*dy);
                        
                        const isPinching = distance < 0.05;

                        // Draw reticle
                        ctx.beginPath();
                        ctx.strokeStyle = isPinching ? '#ff0000' : '#ffffff';
                        ctx.lineWidth = isPinching ? 4 : 2;
                        ctx.arc(rawX, rawY, isPinching ? 15 : 25, 0, Math.PI * 2);
                        ctx.stroke();

                        if (isPinching) {
                            currentPinch = true;
                            pinchX = rawX;
                            pinchY = rawY;
                            
                            // Check pops on trigger (edge detection: wasn't pinching, now is)
                            if (stateRef.current.isPlaying && !lastPinchRef.current) {
                                for (let i = stateRef.current.balloons.length - 1; i >= 0; i--) {
                                    const b = stateRef.current.balloons[i];
                                    const bdx = b.x - pinchX;
                                    const bdy = b.y - pinchY;
                                    const bdist = Math.sqrt(bdx*bdx + bdy*bdy);
                                    if (bdist <= b.radius * 1.5) { // generous hitbox
                                        popBalloon(b);
                                        stateRef.current.balloons.splice(i, 1);
                                        break; // pop one at a time per hand
                                    }
                                }
                            }
                        }
                    }
                }
            }
            lastPinchRef.current = currentPinch;

            // UI Overlays
            if (!stateRef.current.isPlaying) {
                ctx.fillStyle = 'rgba(0,0,0,0.6)';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.fillStyle = '#ffffff';
                ctx.textAlign = 'center';
                ctx.font = 'bold 36px Arial';
                if (stateRef.current.score > 0) {
                    ctx.fillText('Game Over!', canvas.width / 2, canvas.height / 2 - 40);
                    ctx.font = '24px Arial';
                    ctx.fillText(`Final Score: ${stateRef.current.score}`, canvas.width / 2, canvas.height / 2 + 10);
                } else {
                    ctx.fillText('Balloon Pop', canvas.width / 2, canvas.height / 2 - 40);
                    ctx.font = '24px Arial';
                    ctx.fillText('Pinch Index + Thumb to pop balloons!', canvas.width / 2, canvas.height / 2 + 10);
                }
            }

            animationRef.current = requestAnimationFrame(gameLoop);
        };

        animationRef.current = requestAnimationFrame(gameLoop);

        return () => {
            if (animationRef.current) cancelAnimationFrame(animationRef.current);
        };
    }, [isMultiplayer, playerId, sendMessage]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px', width: '100%' }}>
            <video ref={videoRef} autoPlay playsInline muted style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 1, height: 1 }} />
            
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '800px', padding: '0 20px' }}>
                <div style={{ background: '#222', padding: '10px 20px', borderRadius: '12px', color: '#fff' }}>
                    <div style={{ fontSize: '12px', color: '#aaa', textTransform: 'uppercase', fontWeight: 800 }}>Score</div>
                    <div style={{ fontSize: '32px', fontWeight: 900, color: '#fca5a5' }}>{score}</div>
                </div>

                {!isPlaying ? (
                    <button onClick={startGame} style={{
                        background: '#10b981', color: 'white', border: 'none', borderRadius: '12px',
                        padding: '10px 30px', fontSize: '20px', fontWeight: 800, cursor: 'pointer',
                        boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)'
                    }}>
                        START GAME
                    </button>
                ) : (
                    <div style={{ background: '#222', padding: '10px 20px', borderRadius: '12px', color: '#fff', textAlign: 'center' }}>
                        <div style={{ fontSize: '12px', color: '#aaa', textTransform: 'uppercase', fontWeight: 800 }}>Time Left</div>
                        <div style={{ fontSize: '32px', fontWeight: 900, color: timeLeft <= 10 ? '#ef4444' : '#fff' }}>{timeLeft}s</div>
                    </div>
                )}

                {isMultiplayer && (
                    <div style={{ background: '#222', padding: '10px 20px', borderRadius: '12px', color: '#fff', textAlign: 'right', minWidth: '100px' }}>
                        <div style={{ fontSize: '12px', color: '#aaa', textTransform: 'uppercase', fontWeight: 800 }}>Opponents</div>
                        {Object.entries(remoteScores).map(([pid, s]) => (
                            <div key={pid} style={{ fontSize: '18px', fontWeight: 700, color: '#93c5fd' }}>
                                P{pid.slice(0,4)}: {s}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div style={{
                padding: '10px',
                background: '#111',
                borderRadius: '16px',
                boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
                border: '1px solid rgba(255,255,255,0.1)'
            }}>
                <canvas
                    ref={canvasRef}
                    width={800}
                    height={600}
                    style={{
                        borderRadius: '8px',
                        display: 'block',
                        cursor: isPlaying ? 'crosshair' : 'default'
                    }}
                />
            </div>
        </div>
    );
};