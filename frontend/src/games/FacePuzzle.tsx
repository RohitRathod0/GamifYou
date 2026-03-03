/**
 * FacePuzzle.tsx
 *
 * AR Face Puzzle — hand-gesture controlled sliding puzzle
 *
 * Phases:
 *   1. DRAWING   — user traces a square with index finger to capture face
 *   2. CAPTURED  — face sliced into 3×3 tiles, puzzle shown, waiting for first swipe
 *   3. PLAYING   — 15-second countdown, swipes slide tiles
 *   4. WON / LOST
 *
 * Rendering pipeline (single canvas):
 *   Camera feed → vignette → hand skeleton → game overlay → cursor
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Hands, Results } from '@mediapipe/hands';
import { Camera } from '@mediapipe/camera_utils';
import {
    classifyGesture,
    drawHandSkeleton,
    landmarkToCanvas,
    HandLandmark,
    GestureState,
} from './GestureController';

// ── Constants ─────────────────────────────────────────────────────────────────
const GRID = 3;               // 3×3
const TILE_COUNT = GRID * GRID; // 9 (index 8 = blank)
const GAME_TIME = 15;         // seconds
const SWIPE_THRESHOLD = 0.020; // normalized units/frame palm velocity
const SWIPE_COOLDOWN = 480;   // ms between swipes
const TRAIL_MAX = 40;         // max trail points for drawing phase
const SQUARE_MIN_SIZE = 0.18;  // min normalized size of drawn square

type Phase = 'drawing' | 'captured' | 'playing' | 'won' | 'lost';

// 8-puzzle: blank is represented by index 8 in flat array [0..8]
// Solved state: [0,1,2,3,4,5,6,7,8]

function isSolvable(tiles: number[]): boolean {
    let inversions = 0;
    const arr = tiles.filter(t => t !== 8);
    for (let i = 0; i < arr.length - 1; i++) {
        for (let j = i + 1; j < arr.length; j++) {
            if (arr[i] > arr[j]) inversions++;
        }
    }
    return inversions % 2 === 0;
}

function shuffle(arr: number[]): number[] {
    const a = [...arr];
    do {
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
    } while (!isSolvable(a) || isSolved(a));
    return a;
}

function isSolved(tiles: number[]): boolean {
    return tiles.every((t, i) => t === i);
}

// Returns new tiles after sliding in direction (blank moves opposite; adjacent tile moves into blank)
// direction: the direction the user swipes their hand
function applySwipe(tiles: number[], dir: 'left' | 'right' | 'up' | 'down'): number[] | null {
    const blank = tiles.indexOf(8);
    const row = Math.floor(blank / GRID);
    const col = blank % GRID;
    // The tile that swaps into the blank is opposite to swipe direction
    let tr = row, tc = col;
    if (dir === 'left') tc = col + 1; // tile to the RIGHT of blank slides left
    if (dir === 'right') tc = col - 1; // tile to the LEFT slides right
    if (dir === 'up') tr = row + 1; // tile BELOW slides up
    if (dir === 'down') tr = row - 1; // tile ABOVE slides down
    if (tr < 0 || tr >= GRID || tc < 0 || tc >= GRID) return null;
    const tileIdx = tr * GRID + tc;
    const next = [...tiles];
    [next[blank], next[tileIdx]] = [next[tileIdx], next[blank]];
    return next;
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface FacePuzzleProps {
    playerId?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────
export const FacePuzzle: React.FC<FacePuzzleProps> = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const handsRef = useRef<Hands | null>(null);
    const camRef = useRef<Camera | null>(null);
    const rafRef = useRef<number>(0);

    // ── Game state refs (avoid stale closures inside rAF) ─────────────────────
    const phaseRef = useRef<Phase>('drawing');
    const tilesRef = useRef<number[]>([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    const timerRef = useRef<number>(GAME_TIME);
    const timerStartRef = useRef<number>(0);
    const swipeCoolRef = useRef(false);
    const tileImagesRef = useRef<ImageBitmap[]>([]);
    const gestureRef = useRef<GestureState | null>(null);

    // Trail of index finger positions for square detection
    const trailRef = useRef<{ x: number; y: number }[]>([]);
    const lastPalmRef = useRef<{ x: number; y: number } | null>(null);

    // Slide animation
    const animRef = useRef<{ tile: number; dx: number; dy: number; progress: number } | null>(null);

    // ── React state (re-renders only for phase transitions) ───────────────────
    const [phase, setPhase] = useState<Phase>('drawing');
    const [handReady, setHandReady] = useState(false);
    const [camError, setCamError] = useState(false);

    // ── Capture face from video ───────────────────────────────────────────────
    const captureFace = useCallback(async () => {
        const video = videoRef.current;
        if (!video) return;

        // Draw video to offscreen canvas (mirrored to match display)
        const off = document.createElement('canvas');
        const vw = video.videoWidth || 640;
        const vh = video.videoHeight || 480;
        off.width = vw;
        off.height = vh;
        const octx = off.getContext('2d')!;
        // Mirror horizontally to match camera display
        octx.translate(vw, 0);
        octx.scale(-1, 1);
        octx.drawImage(video, 0, 0, vw, vh);

        // Crop centered square (80% of shorter dimension, face region)
        const size = Math.min(vw, vh) * 0.72;
        const sx = (vw - size) / 2;
        const sy = (vh - size) / 2 - vh * 0.04; // slight upward offset for face

        // Tile size
        const tileSize = Math.floor(size / GRID);

        const bitmaps: ImageBitmap[] = [];
        for (let i = 0; i < TILE_COUNT - 1; i++) {
            const tc = i % GRID;
            const tr = Math.floor(i / GRID);
            const bm = await createImageBitmap(off, sx + tc * tileSize, sy + tr * tileSize, tileSize, tileSize);
            bitmaps.push(bm);
        }
        // index 8 = blank (null placeholder — we push undefined but handle it in draw)
        tileImagesRef.current = bitmaps;

        // Shuffle tiles
        tilesRef.current = shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8]);
        phaseRef.current = 'captured';
        setPhase('captured');

        // Start timer after a short preview delay
        setTimeout(() => {
            phaseRef.current = 'playing';
            timerStartRef.current = Date.now();
            timerRef.current = GAME_TIME;
            setPhase('playing');
        }, 1800);
    }, []);

    // ── Swipe processing ──────────────────────────────────────────────────────
    const processSwipe = useCallback((palm: { x: number; y: number }) => {
        if (phaseRef.current !== 'playing') return;
        if (swipeCoolRef.current) return;

        const last = lastPalmRef.current;
        if (!last) {
            lastPalmRef.current = palm;
            return;
        }

        const dx = palm.x - last.x;
        const dy = palm.y - last.y;
        lastPalmRef.current = palm;

        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);

        if (Math.max(absDx, absDy) < SWIPE_THRESHOLD) return;

        let dir: 'left' | 'right' | 'up' | 'down' | null = null;
        // Note: video is mirrored, so left/right are swapped in landmark space
        if (absDx > absDy) {
            dir = dx > 0 ? 'left' : 'right'; // mirrored
        } else {
            dir = dy > 0 ? 'down' : 'up';
        }

        const next = applySwipe(tilesRef.current, dir);
        if (!next) return;

        // Start slide animation
        const blank = tilesRef.current.indexOf(8);
        const moved = next.indexOf(8); // position blank moved to
        const tileMoved = tilesRef.current[moved]; // tile that moved
        const bRow = Math.floor(blank / GRID);
        const bCol = blank % GRID;
        const mRow = Math.floor(moved / GRID);
        const mCol = moved % GRID;
        animRef.current = {
            tile: tileMoved,
            dx: (bCol - mCol),
            dy: (bRow - mRow),
            progress: 0,
        };

        tilesRef.current = next;
        swipeCoolRef.current = true;
        setTimeout(() => { swipeCoolRef.current = false; }, SWIPE_COOLDOWN);

        if (isSolved(next)) {
            setTimeout(() => {
                phaseRef.current = 'won';
                setPhase('won');
            }, 350);
        }
    }, []);

    // ── Square detection from finger trail ────────────────────────────────────
    const detectSquare = useCallback((trail: { x: number; y: number }[]): boolean => {
        if (trail.length < 8) return false;
        const xs = trail.map(p => p.x);
        const ys = trail.map(p => p.y);
        const minX = Math.min(...xs), maxX = Math.max(...xs);
        const minY = Math.min(...ys), maxY = Math.max(...ys);
        const w = maxX - minX;
        const h = maxY - minY;
        if (w < SQUARE_MIN_SIZE || h < SQUARE_MIN_SIZE) return false;
        const ratio = Math.min(w, h) / Math.max(w, h);
        return ratio > 0.55; // fairly square bounding box
    }, []);

    // ── Draw frame ────────────────────────────────────────────────────────────
    const drawFrame = useCallback(() => {
        const canvas = canvasRef.current;
        const video = videoRef.current;
        if (!canvas || !video) return;

        const W = canvas.width, H = canvas.height;
        const ctx = canvas.getContext('2d')!;

        // ── 1. Camera feed (mirrored) ─────────────────────────────────────────
        ctx.save();
        ctx.scale(-1, 1);
        ctx.drawImage(video, -W, 0, W, H);
        ctx.restore();

        // ── 2. Vignette ───────────────────────────────────────────────────────
        const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, H * 0.85);
        vg.addColorStop(0, 'rgba(0,0,0,0)');
        vg.addColorStop(1, 'rgba(0,0,0,0.50)');
        ctx.fillStyle = vg;
        ctx.fillRect(0, 0, W, H);

        const gs = gestureRef.current;

        // ── 3. Hand skeleton ──────────────────────────────────────────────────
        if (gs) {
            // We need raw landmarks — store them on gestureRef via onResults
            const rawLm = (gs as any)._rawLandmarks as HandLandmark[] | undefined;
            if (rawLm) {
                drawHandSkeleton(ctx, rawLm, W, H, gs.isPinching);
            }
        }

        const currentPhase = phaseRef.current;

        // ── 4. Phase-specific overlays ────────────────────────────────────────
        if (currentPhase === 'drawing') {
            drawDrawingPhase(ctx, W, H);
        } else if (currentPhase === 'captured' || currentPhase === 'playing') {
            drawPuzzle(ctx, W, H);
            if (currentPhase === 'playing') drawTimer(ctx, W, H);
        } else if (currentPhase === 'won') {
            drawPuzzle(ctx, W, H);
            drawEndScreen(ctx, W, H, true);
        } else if (currentPhase === 'lost') {
            drawPuzzle(ctx, W, H);
            drawEndScreen(ctx, W, H, false);
        }

        // ── 5. Cursor at index finger ─────────────────────────────────────────
        if (gs) {
            const { x: cx, y: cy } = landmarkToCanvas(gs.indexTip, W, H);
            ctx.save();
            ctx.shadowColor = '#00E5FF'; ctx.shadowBlur = 20;
            ctx.strokeStyle = '#00E5FF'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(cx, cy, 12, 0, Math.PI * 2); ctx.stroke();
            ctx.shadowBlur = 10;
            ctx.fillStyle = '#00E5FF';
            ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
        }

        // ── Check timer ───────────────────────────────────────────────────────
        if (currentPhase === 'playing') {
            const elapsed = (Date.now() - timerStartRef.current) / 1000;
            timerRef.current = Math.max(0, GAME_TIME - elapsed);
            if (timerRef.current <= 0) {
                phaseRef.current = 'lost';
                setPhase('lost');
            }
        }
    }, []);

    // ── Drawing phase overlay ─────────────────────────────────────────────────
    const drawDrawingPhase = useCallback((ctx: CanvasRenderingContext2D, W: number, H: number) => {
        const trail = trailRef.current;

        // Draw trail
        if (trail.length > 1) {
            ctx.save();
            ctx.strokeStyle = 'rgba(0, 229, 255, 0.8)';
            ctx.lineWidth = 3;
            ctx.shadowColor = '#00E5FF';
            ctx.shadowBlur = 12;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(trail[0].x * W, trail[0].y * H);
            for (let i = 1; i < trail.length; i++) {
                ctx.lineTo(trail[i].x * W, trail[i].y * H);
            }
            ctx.stroke();

            // Bounding rect of trail
            const xs = trail.map(p => p.x * W);
            const ys = trail.map(p => p.y * H);
            const rx = Math.min(...xs), ry = Math.min(...ys);
            const rw = Math.max(...xs) - rx, rh = Math.max(...ys) - ry;
            if (rw > SQUARE_MIN_SIZE * W && rh > SQUARE_MIN_SIZE * H) {
                const ratio = Math.min(rw, rh) / Math.max(rw, rh);
                const alpha = Math.min(1, ratio * 1.8);
                ctx.strokeStyle = `rgba(0, 255, 136, ${alpha})`;
                ctx.lineWidth = 3;
                ctx.shadowColor = '#00FF88';
                ctx.shadowBlur = 20;
                ctx.setLineDash([8, 6]);
                ctx.strokeRect(rx, ry, rw, rh);
                ctx.setLineDash([]);
            }
            ctx.restore();
        }

        // Instructions panel
        ctx.save();
        const panW = Math.min(W * 0.7, 480), panH = 120;
        const panX = (W - panW) / 2, panY = H - panH - 30;
        ctx.fillStyle = 'rgba(0,0,0,0.72)';
        ctx.beginPath();
        (ctx as any).roundRect(panX, panY, panW, panH, 16);
        ctx.fill();
        ctx.strokeStyle = '#00E5FF'; ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.textAlign = 'center';
        ctx.fillStyle = '#00E5FF';
        ctx.font = `bold ${Math.round(W * 0.025)}px "Segoe UI", sans-serif`;
        ctx.fillText('✋ Trace a square with your index finger!', W / 2, panY + 38);
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.font = `${Math.round(W * 0.018)}px "Segoe UI", sans-serif`;
        ctx.fillText('Move your finger in a □ shape to capture your face', W / 2, panY + 66);
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.font = `${Math.round(W * 0.015)}px "Segoe UI", sans-serif`;
        ctx.fillText('Keep your face centered in the frame', W / 2, panY + 94);
        ctx.restore();
    }, []);

    // ── Puzzle overlay ────────────────────────────────────────────────────────
    const drawPuzzle = useCallback((ctx: CanvasRenderingContext2D, W: number, H: number) => {
        const images = tileImagesRef.current;
        if (!images.length) return;

        const tiles = tilesRef.current;
        const anim = animRef.current;

        // Puzzle grid dimensions — centered on canvas
        const gridSize = Math.min(W, H) * 0.55;
        const tileSize = gridSize / GRID;
        const gap = 3;
        const originX = (W - gridSize) / 2;
        const originY = (H - gridSize) / 2;

        // Background panel
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.shadowColor = 'rgba(0,229,255,0.4)'; ctx.shadowBlur = 30;
        ctx.beginPath();
        (ctx as any).roundRect(originX - 12, originY - 12, gridSize + 24, gridSize + 24, 14);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(0,229,255,0.6)'; ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();

        // Advance animation
        if (anim) {
            anim.progress = Math.min(1, anim.progress + 0.14);
            if (anim.progress >= 1) animRef.current = null;
        }

        // Draw tiles
        for (let i = 0; i < TILE_COUNT; i++) {
            const tileVal = tiles[i];
            if (tileVal === 8) continue; // blank

            const col = i % GRID;
            const row = Math.floor(i / GRID);
            let tx = originX + col * tileSize + gap / 2;
            let ty = originY + row * tileSize + gap / 2;
            const tw = tileSize - gap;
            const th = tileSize - gap;

            // Animate sliding tile
            if (anim && tileVal === anim.tile) {
                const eased = 1 - Math.pow(1 - anim.progress, 3);
                tx += anim.dx * tileSize * (1 - eased);
                ty += anim.dy * tileSize * (1 - eased);
            }

            const img = images[tileVal];
            if (!img) continue;

            ctx.save();
            // Rounded clip for tile
            ctx.beginPath();
            (ctx as any).roundRect(tx, ty, tw, th, 6);
            ctx.clip();
            ctx.drawImage(img, tx, ty, tw, th);

            // Subtle border
            ctx.strokeStyle = 'rgba(0,229,255,0.4)';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.restore();

            // Tile number (subtle, bottom-right)
            ctx.save();
            ctx.font = `bold ${Math.round(tileSize * 0.15)}px "Segoe UI", monospace`;
            ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
            ctx.fillStyle = 'rgba(255,255,255,0.35)';
            ctx.fillText(`${tileVal + 1}`, tx + tw - 4, ty + th - 2);
            ctx.restore();
        }

        // Blank cell glow
        const blankIdx = tiles.indexOf(8);
        const blankCol = blankIdx % GRID;
        const blankRow = Math.floor(blankIdx / GRID);
        const bx = originX + blankCol * tileSize + gap / 2;
        const by = originY + blankRow * tileSize + gap / 2;
        ctx.save();
        ctx.fillStyle = 'rgba(0,229,255,0.08)';
        ctx.strokeStyle = 'rgba(0,229,255,0.25)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        (ctx as any).roundRect(bx, by, tileSize - gap, tileSize - gap, 6);
        ctx.fill(); ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
    }, []);

    // ── Timer overlay ─────────────────────────────────────────────────────────
    const drawTimer = useCallback((ctx: CanvasRenderingContext2D, W: number, H: number) => {
        const timeLeft = timerRef.current;
        const fraction = timeLeft / GAME_TIME;
        const urgent = timeLeft <= 5;

        const cx = W / 2;
        const cy = H * 0.08;
        const r = 28;

        // Background arc
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fill();

        // Progress arc
        ctx.strokeStyle = urgent ? '#FF4757' : '#00E5FF';
        ctx.lineWidth = 5;
        ctx.shadowColor = urgent ? '#FF4757' : '#00E5FF';
        ctx.shadowBlur = 14;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + fraction * 2 * Math.PI);
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Background ring
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();

        // Text
        ctx.fillStyle = urgent ? '#FF4757' : '#fff';
        ctx.font = `bold ${r * 0.85}px "Segoe UI", sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(Math.ceil(timeLeft).toString(), cx, cy);

        ctx.restore();

        // Swipe hint (bottom of puzzle)
        const gridSize = Math.min(W, H) * 0.55;
        const panY = (H - gridSize) / 2 + gridSize + 20;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.font = `${Math.round(W * 0.017)}px "Segoe UI", sans-serif`;
        ctx.fillText('👋 Swipe LEFT · RIGHT · UP · DOWN to slide tiles', W / 2, panY + 14);
        ctx.restore();
    }, []);

    // ── End screen ────────────────────────────────────────────────────────────
    const drawEndScreen = useCallback((ctx: CanvasRenderingContext2D, W: number, H: number, won: boolean) => {
        ctx.save();
        ctx.fillStyle = won ? 'rgba(0,20,0,0.72)' : 'rgba(20,0,0,0.72)';
        ctx.fillRect(0, 0, W, H);

        const emoji = won ? '🎉' : '⏰';
        const title = won ? 'PUZZLE SOLVED!' : 'TIME\'S UP!';
        const sub = won ? 'You reassembled your face in time!' : 'Better luck next time — try again!';
        const color = won ? '#00FF88' : '#FF4757';

        ctx.textAlign = 'center';

        // Emoji
        ctx.font = `${Math.round(W * 0.09)}px serif`;
        ctx.fillText(emoji, W / 2, H / 2 - 80);

        // Title
        ctx.shadowColor = color; ctx.shadowBlur = 40;
        ctx.fillStyle = color;
        ctx.font = `bold ${Math.round(W * 0.06)}px "Segoe UI", sans-serif`;
        ctx.fillText(title, W / 2, H / 2 - 10);
        ctx.shadowBlur = 0;

        // Sub
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.font = `${Math.round(W * 0.022)}px "Segoe UI", sans-serif`;
        ctx.fillText(sub, W / 2, H / 2 + 38);

        // Restart hint
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.font = `${Math.round(W * 0.018)}px "Segoe UI", sans-serif`;
        ctx.fillText('✌️ Show peace sign to play again', W / 2, H / 2 + 82);

        ctx.restore();
    }, []);

    // ── MediaPipe setup ───────────────────────────────────────────────────────
    useEffect(() => {
        const hands = new Hands({
            locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`,
        });
        hands.setOptions({
            maxNumHands: 1,
            modelComplexity: 1,
            minDetectionConfidence: 0.72,
            minTrackingConfidence: 0.55,
        });

        hands.onResults((results: Results) => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const W = canvas.width;

            if (!results.multiHandLandmarks?.length) {
                gestureRef.current = null;
                lastPalmRef.current = null;
                return;
            }

            const lm = results.multiHandLandmarks[0] as HandLandmark[];
            const gs = classifyGesture(lm);
            // Attach raw landmarks for skeleton draw
            (gs as any)._rawLandmarks = lm;
            gestureRef.current = gs;

            const phase = phaseRef.current;

            // ── Drawing phase: track index fingertip trail ────────────────────
            if (phase === 'drawing') {
                const tip = gs.indexTip;
                // Only track when index is reasonably extended (pointing-ish)
                const trail = trailRef.current;
                trail.push({ x: 1 - tip.x, y: tip.y }); // mirror x
                if (trail.length > TRAIL_MAX) trail.shift();

                if (detectSquare(trail)) {
                    trailRef.current = [];
                    captureFace();
                }
            }

            // ── Playing phase: detect palm swipes ─────────────────────────────
            if (phase === 'playing') {
                const palm = lm[9]; // landmark 9 = palm center
                processSwipe({ x: 1 - palm.x, y: palm.y });
            }

            // ── Peace sign = restart ──────────────────────────────────────────
            if ((phase === 'won' || phase === 'lost') && gs.gesture === 'peace') {
                phaseRef.current = 'drawing';
                trailRef.current = [];
                tilesRef.current = [0, 1, 2, 3, 4, 5, 6, 7, 8];
                tileImagesRef.current = [];
                timerRef.current = GAME_TIME;
                animRef.current = null;
                setPhase('drawing');
            }

            void W; // suppress unused warning
        });

        handsRef.current = hands;

        if (videoRef.current) {
            const cam = new Camera(videoRef.current, {
                onFrame: async () => {
                    if (videoRef.current && handsRef.current) {
                        await handsRef.current.send({ image: videoRef.current });
                    }
                },
                width: 1280,
                height: 720,
            });
            cam.start()
                .then(() => setHandReady(true))
                .catch(() => setCamError(true));
            camRef.current = cam;
        }

        return () => {
            hands.close();
            camRef.current?.stop();
        };
    }, [detectSquare, captureFace, processSwipe]);

    // ── Render loop ───────────────────────────────────────────────────────────
    useEffect(() => {
        let running = true;
        const loop = () => {
            if (!running) return;
            drawFrame();
            rafRef.current = requestAnimationFrame(loop);
        };
        loop();
        return () => {
            running = false;
            cancelAnimationFrame(rafRef.current);
        };
    }, [drawFrame]);

    // ── Canvas resize ─────────────────────────────────────────────────────────
    useEffect(() => {
        const resize = () => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };
        resize();
        window.addEventListener('resize', resize);
        return () => window.removeEventListener('resize', resize);
    }, []);

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div style={{ position: 'fixed', inset: 0, background: '#000', overflow: 'hidden' }}>
            {/* Hidden video */}
            <video
                ref={videoRef} autoPlay playsInline muted
                style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 1, height: 1 }}
            />

            {/* Single canvas — everything drawn here */}
            <canvas
                ref={canvasRef}
                style={{ display: 'block', width: '100%', height: '100%' }}
            />

            {/* Phase badge top-right */}
            {handReady && (
                <div style={{
                    position: 'absolute', top: 16, right: 20,
                    background: 'rgba(0,0,0,0.65)', border: '1.5px solid rgba(0,229,255,0.4)',
                    borderRadius: 10, padding: '6px 14px',
                    fontFamily: '"Segoe UI", sans-serif', fontSize: 13,
                    color: phase === 'won' ? '#00FF88' : phase === 'lost' ? '#FF4757' : '#00E5FF',
                    fontWeight: 'bold', letterSpacing: '0.05em',
                }}>
                    {phase === 'drawing' && '✋ Draw a Square'}
                    {phase === 'captured' && '📸 Face Captured!'}
                    {phase === 'playing' && '🧩 Solve the Puzzle!'}
                    {phase === 'won' && '🏆 You Won!'}
                    {phase === 'lost' && '💀 Time\'s Up!'}
                </div>
            )}

            {/* Loading overlay */}
            {!handReady && !camError && (
                <div style={{
                    position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(0,0,0,0.88)', color: '#fff',
                    fontFamily: '"Segoe UI", sans-serif', zIndex: 10,
                }}>
                    <div style={{
                        width: 56, height: 56, border: '4px solid #1a1a2e',
                        borderTop: '4px solid #00E5FF', borderRadius: '50%',
                        animation: 'spin 0.9s linear infinite', marginBottom: 24,
                    }} />
                    <h2 style={{ margin: '0 0 8px', color: '#00E5FF', fontSize: 24 }}>
                        🧩 Face Puzzle
                    </h2>
                    <p style={{ color: '#666', margin: 0, fontSize: 14 }}>
                        Initialising camera &amp; hand tracking…
                    </p>
                    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </div>
            )}

            {/* Camera error */}
            {camError && (
                <div style={{
                    position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(0,0,0,0.92)', color: '#FF4757',
                    fontFamily: '"Segoe UI", sans-serif', gap: 12, zIndex: 10,
                }}>
                    <span style={{ fontSize: 48 }}>📷</span>
                    <h2 style={{ margin: 0 }}>Camera Access Denied</h2>
                    <p style={{ color: '#888', margin: 0 }}>Please allow camera access and reload the page.</p>
                </div>
            )}
        </div>
    );
};
