/**
 * ARChessGame.tsx — Fixed Version
 *
 * Bugs fixed:
 *  1. processGesture removed from MediaPipe useEffect deps → pipeline never restarts
 *  2. Hold-pinch 1s to SELECT, quick-pinch to CONFIRM — proper state machine
 *  3. landmarkToCanvas now mirrors X to match the flipped camera feed
 *  4. boardLayoutRef stores STABLE y (no floatY) for hit-testing; floatY only used for drawing
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Hands, Results } from '@mediapipe/hands';
import {
    classifyGesture, drawHandSkeleton,
    GestureState, HandLandmark,
} from './GestureController';
import {
    createInitialBoard, getLegalMoves, applyMove, getGameResult,
    isInCheck, cloneBoard, PIECE_UNICODE,
    Board, Piece, PieceColor, PieceType, Position,
} from './ChessLogic';

// ── Config ────────────────────────────────────────────────────────────────────
const BOARD_COLS = 8;
const CURSOR_HISTORY_SIZE = 5;
const CURSOR_DEADZONE_PX = 3;
const CURSOR_SLOW_ALPHA = 0.18;
const CURSOR_FAST_ALPHA = 0.42;
const CURSOR_FAST_THRESHOLD_PX = 28;
const SNAP_HYSTERESIS_PX = 24;

// Hold-pinch timing
const HOLD_SELECT_MS = 400;    // hold pinch 400ms → SELECT piece (feels natural)
const QUICK_PINCH_MAX_MS = 600; // pinch released in <600ms → CONFIRM move (forgiving window)

// Board colors
const LIGHT_SQ = 'rgba(232, 244, 252, 0.72)';
const DARK_SQ = 'rgba(0, 150, 180, 0.72)';
const SEL_SQ = 'rgba(80, 220, 80, 0.88)';
const HOVER_SQ = 'rgba(255, 220, 50, 0.65)';
const VALID_SQ = 'rgba(80, 220, 80, 0.45)';
const AIM_SQ = 'rgba(0, 160, 255, 0.75)';   // blue = valid target aimed at
const INVALID_SQ = 'rgba(255, 60, 60, 0.35)';   // red tint = invalid target
const LASTMV_SQ = 'rgba(255, 240, 80, 0.55)';
const BOARD_BORDER = 'rgba(0, 220, 255, 0.9)';

// Gesture phase
type GesturePhase =
    | 'IDLE'       // no piece selected, hovering
    | 'HOLDING'    // pinch held, timer counting toward SELECT
    | 'SELECTED'   // piece selected, showing valid moves, aiming
    | 'COOLDOWN';  // brief cooldown after a move

interface ARChessGameProps {
    playerId: string;
    gameState?: any;
    onStateUpdate?: (s: any) => void;
    /** Shared stream from RoomView — camera + mic already initialised */
    localStream?: MediaStream | null;
    /** Shared sendMessage from RoomView's useWebSocket — no second WS opened */
    sendMessage?: (type: string, data: any) => void;
}

interface ScreenPoint { x: number; y: number; }

export const ARChessGame: React.FC<ARChessGameProps> = ({
    playerId, gameState, onStateUpdate, localStream, sendMessage: sendWsMessage,
}) => {
    // ── Refs ──────────────────────────────────────────────────────────────────
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const handsRef = useRef<Hands | null>(null);
    const rafRef = useRef<number>(0);

    // Game state refs
    const boardRef = useRef<Board>(createInitialBoard());
    const selectedRef = useRef<Position | null>(null);
    const validMovesRef = useRef<Position[]>([]);
    const currentTurnRef = useRef<PieceColor>('white');
    const myColorRef = useRef<PieceColor>('white');
    const epRef = useRef<Position | null>(null);
    const lastMoveRef = useRef<{ from: Position; to: Position } | null>(null);
    const gameOverRef = useRef<{ winner: string; reason: string } | null>(null);
    const capturedRef = useRef<{ white: Piece[]; black: Piece[] }>({ white: [], black: [] });
    const moveHistRef = useRef<string[]>([]);

    // Gesture / interaction refs
    const gestureRef = useRef<GestureState | null>(null);
    const cursorRef = useRef<ScreenPoint | null>(null);
    const cursorHistRef = useRef<ScreenPoint[]>([]);
    const phaseRef = useRef<GesturePhase>('IDLE');
    const prevPinchRef = useRef(false);
    const pinchStartTimeRef = useRef<number>(0);   // when pinch began
    const holdProgressRef = useRef<number>(0);     // 0–1 progress toward 1s
    const aimedSquareRef = useRef<Position | null>(null); // square being aimed at while SELECTED

    // FIX 4: stable board layout for hit-testing (no float offset)
    const stableBoardRef = useRef({ x: 0, y: 0, sqSize: 0, totalSize: 0 });
    // draw-only offset (floatY applied only in drawFrame)
    const floatRef = useRef({ t: 0 });

    const [handReady, setHandReady] = useState(false);
    const [camError, setCamError] = useState(false);
    const [promotionPending, setPromotionPending] = useState<{ pos: Position; color: PieceColor } | null>(null);
    const [gameOverState, setGameOverState] = useState<{ winner: string; reason: string } | null>(null);
    const [debugMode, setDebugMode] = useState(false);
    const [, setMyColor] = useState<PieceColor>('white');

    const roomCode = gameState?.room_code || 'chess_room';

    // ── Apply color from gameState prop (set by RoomView from server) ──────────
    useEffect(() => {
        if (gameState?.my_color) {
            myColorRef.current = gameState.my_color as PieceColor;
            setMyColor(gameState.my_color as PieceColor);
        }
    }, [gameState?.my_color]);

    // ── Also listen for synchronous CustomEvent from RoomView ─────────────────
    // This fires BEFORE React re-renders so myColorRef is always fresh
    // in the gesture processor. Fixes the stale 'white' bug on Device 2.
    useEffect(() => {
        const handler = (e: Event) => {
            const color = (e as CustomEvent).detail?.color as PieceColor;
            if (color) {
                myColorRef.current = color;
                setMyColor(color);
            }
        };
        window.addEventListener('chess_color_assign', handler);
        return () => window.removeEventListener('chess_color_assign', handler);
    }, []);

    // ── FIX 1: React to incoming opponent moves via gameState.incomingState ──
    // RoomView sets incomingState whenever it receives game_state_update from WS.
    // We watch it here and apply to our board refs — no second WebSocket needed.
    useEffect(() => {
        const s = gameState?.incomingState;
        if (!s) return;
        if (s.chessBoard) boardRef.current = s.chessBoard;
        if (s.currentTurn) currentTurnRef.current = s.currentTurn;
        if (s.enPassantTarget !== undefined) epRef.current = s.enPassantTarget;
        if (s.lastMove !== undefined) lastMoveRef.current = s.lastMove;
        if (s.gameOver) { gameOverRef.current = s.gameOver; setGameOverState(s.gameOver); }
        // Reset selection when opponent's move arrives
        selectedRef.current = null;
        validMovesRef.current = [];
        aimedSquareRef.current = null;
        phaseRef.current = 'IDLE';
    }, [gameState?.incomingState]);

    // ── FIX 2: Attach shared localStream to video element for camera feed ────
    useEffect(() => {
        if (!localStream || !videoRef.current) return;
        if (videoRef.current.srcObject !== localStream) {
            videoRef.current.srcObject = localStream;
            videoRef.current.play().catch(console.error);
        }
    }, [localStream]);

    // ── Board layout helpers ──────────────────────────────────────────────────
    /** Compute stable layout (no float) — used for hit-testing */
    const computeStableLayout = useCallback((W: number, H: number) => {
        const maxSize = Math.min(W * 0.72, H * 0.78);
        const sqSize = Math.floor(maxSize / BOARD_COLS);
        const total = sqSize * BOARD_COLS;
        const x = Math.floor((W - total) / 2);
        const y = Math.floor((H - total) / 2) + 20;
        stableBoardRef.current = { x, y, sqSize, totalSize: total };
        return { x, y, sqSize, total };
    }, []);

    // FIX 3 + FIX 4: mirror X, use stable board (no floatY drift)
    const screenToSquare = useCallback((sx: number, sy: number): Position | null => {
        const { x, y, sqSize, totalSize } = stableBoardRef.current;
        const rx = sx - x, ry = sy - y;
        if (rx < 0 || rx > totalSize || ry < 0 || ry > totalSize) return null;
        let col = Math.floor(rx / sqSize);
        let row = Math.floor(ry / sqSize);
        if (col < 0 || col > 7 || row < 0 || row > 7) return null;
        if (myColorRef.current === 'black') { row = 7 - row; col = 7 - col; }
        return { row, col };
    }, []);

    const squareCenter = useCallback((pos: Position): ScreenPoint => {
        const { x, y, sqSize } = stableBoardRef.current;
        const dr = myColorRef.current === 'black' ? 7 - pos.row : pos.row;
        const dc = myColorRef.current === 'black' ? 7 - pos.col : pos.col;
        return { x: x + dc * sqSize + sqSize / 2, y: y + dr * sqSize + sqSize / 2 };
    }, []);

    // ── Cursor smoothing — velocity-aware exponential smoothing ─────────────
    // Quadratic weights on history so recent frames dominate.
    // Alpha scales continuously with velocity so fast flicks feel snappy
    // while slow deliberate positioning stays rock-solid on squares.
    const smoothCursor = useCallback((raw: ScreenPoint): ScreenPoint => {
        const hist = cursorHistRef.current;
        hist.push(raw);
        if (hist.length > CURSOR_HISTORY_SIZE) hist.shift();

        // Quadratic recency weighting
        const w = hist.reduce((acc, p, i) => {
            const wt = (i + 1) * (i + 1);
            acc.x += p.x * wt; acc.y += p.y * wt; acc.w += wt;
            return acc;
        }, { x: 0, y: 0, w: 0 });
        const avg = { x: w.x / w.w, y: w.y / w.w };

        const prev = cursorRef.current;
        if (!prev) return avg;
        const d = Math.hypot(avg.x - prev.x, avg.y - prev.y);

        // Deadzone — kills micro-jitter when hand is still
        if (d < CURSOR_DEADZONE_PX) return prev;

        // Continuous velocity → alpha mapping (quadratic ease-in)
        const t = Math.min(d / CURSOR_FAST_THRESHOLD_PX, 1.5);
        const alpha = Math.min(CURSOR_SLOW_ALPHA + (CURSOR_FAST_ALPHA - CURSOR_SLOW_ALPHA) * t * t, 0.85);

        return {
            x: prev.x + (avg.x - prev.x) * alpha,
            y: prev.y + (avg.y - prev.y) * alpha,
        };
    }, []);

    /** Snap to nearest legal destination with hysteresis.
     *  Only considers actual valid move squares — never the origin.
     *  This fixes distant pieces (rook, queen, bishop, knight) where
     *  the origin was always closest and snap never reached a destination.
     */
    const snapToLegal = useCallback((cursor: ScreenPoint, from: Position, legal: Position[]): Position | null => {
        if (!legal.length) return null;

        // ONLY snap to actual destinations — never back to the from-square
        let best = legal[0];
        let bestD = Infinity;
        for (const c of legal) {
            const center = squareCenter(c);
            const d = Math.hypot(cursor.x - center.x, cursor.y - center.y);
            if (d < bestD) { best = c; bestD = d; }
        }

        // Hysteresis: prefer previous aimed square if still close enough
        const prev = aimedSquareRef.current;
        if (prev && legal.some(m => m.row === prev.row && m.col === prev.col)) {
            const prevD = Math.hypot(cursor.x - squareCenter(prev).x, cursor.y - squareCenter(prev).y);
            if (prevD <= bestD + SNAP_HYSTERESIS_PX) return prev;
        }
        return best;
    }, [squareCenter]);

    // ── Execute a chess move ──────────────────────────────────────────────────
    const doMove = useCallback((from: Position, to: Position) => {
        const board = boardRef.current;
        const piece = board[from.row][from.col];
        if (!piece) return;

        const { board: nb, newEp, captured: cap, isPromotion } = applyMove(board, from, to, epRef.current);
        if (cap) {
            if (cap.color === 'white') capturedRef.current.white.push(cap);
            else capturedRef.current.black.push(cap);
        }
        const cols = 'abcdefgh', rows = '87654321';
        moveHistRef.current.push(`${cols[from.col]}${rows[from.row]}→${cols[to.col]}${rows[to.row]}`);

        if (isPromotion) {
            boardRef.current = nb;
            selectedRef.current = null; validMovesRef.current = [];
            phaseRef.current = 'COOLDOWN';
            setPromotionPending({ pos: to, color: piece.color });
            setTimeout(() => { phaseRef.current = 'IDLE'; }, 600);
            return;
        }

        const next: PieceColor = currentTurnRef.current === 'white' ? 'black' : 'white';
        boardRef.current = nb;
        currentTurnRef.current = next;
        epRef.current = newEp;
        lastMoveRef.current = { from, to };
        selectedRef.current = null;
        validMovesRef.current = [];
        aimedSquareRef.current = null;
        phaseRef.current = 'COOLDOWN';
        setTimeout(() => { phaseRef.current = 'IDLE'; }, 600);

        const result = getGameResult(nb, next, newEp);
        if (result) { gameOverRef.current = result; setGameOverState(result); }

        const ns = { chessBoard: nb, currentTurn: next, enPassantTarget: newEp, lastMove: { from, to } };
        onStateUpdate?.(ns);
        sendWsMessage?.('game_state_update', { state: ns });
    }, [onStateUpdate, sendWsMessage]);

    // ── FIX 1 & 2: Gesture processor — called from MediaPipe onResults
    //   Uses refs only — no stale closures, never recreated ──────────────────
    const processGestureRef = useRef<(gs: GestureState, W: number, H: number) => void>(() => { });

    useEffect(() => {
        processGestureRef.current = (gs: GestureState, W: number, H: number) => {
            if (gameOverRef.current) return;

            // Use landmarkToCanvas for consistent mirroring with the skeleton
            // landmarkToCanvas(mirror=true) = (1 - lm.x) * W, same as what skeleton uses
            const rawCursor = {
                x: (1 - gs.indexTip.x) * W,
                y: gs.indexTip.y * H,
            };

            const cursor = smoothCursor(rawCursor);
            cursorRef.current = cursor;
            const sq = screenToSquare(cursor.x, cursor.y);
            const now = performance.now();
            const isPinching = gs.isPinching;
            const wasPinching = prevPinchRef.current;
            const pinchStarted = isPinching && !wasPinching;
            const pinchEnded = !isPinching && wasPinching;
            const phase = phaseRef.current;

            // ── IDLE phase ────────────────────────────────────────────────────
            if (phase === 'IDLE' || phase === 'COOLDOWN') {
                aimedSquareRef.current = null;

                if (pinchStarted && phase === 'IDLE') {
                    // Start hold timer
                    pinchStartTimeRef.current = now;
                    holdProgressRef.current = 0;
                    phaseRef.current = 'HOLDING';
                }
            }

            // ── HOLDING phase — counting toward 0.4s select ─────────────────
            if (phase === 'HOLDING') {
                if (!isPinching) {
                    phaseRef.current = 'IDLE';
                    holdProgressRef.current = 0;
                    pinchStartTimeRef.current = 0;
                } else {
                    const elapsed = now - pinchStartTimeRef.current;
                    holdProgressRef.current = Math.min(elapsed / HOLD_SELECT_MS, 1);

                    if (elapsed >= HOLD_SELECT_MS) {
                        // Read myColor fresh — prop may have arrived after gesture loop started
                        // FIX: never rely on stale 'white' default — read from board piece color
                        const myColor = myColorRef.current;
                        const piece = sq ? boardRef.current[sq.row]?.[sq.col] : null;

                        // ✅ Allow selection if:
                        //   a) it's my turn AND the piece is mine, OR
                        //   b) debug: piece exists and is same color as current turn (handles stale myColor)
                        const isMyPiece = piece && (
                            piece.color === myColor ||
                            piece.color === currentTurnRef.current  // fallback if myColor is stale
                        );
                        const isMyTurn = myColor === currentTurnRef.current;

                        if (sq && isMyPiece && isMyTurn) {
                            selectedRef.current = sq;
                            validMovesRef.current = getLegalMoves(boardRef.current, sq, epRef.current);
                            aimedSquareRef.current = null;
                            phaseRef.current = 'SELECTED';
                        } else {
                            phaseRef.current = 'IDLE';
                        }
                        holdProgressRef.current = 0;
                        pinchStartTimeRef.current = 0;
                    }
                }
            }

            // ── SELECTED phase — piece chosen, aiming at destination ──────────
            if (phase === 'SELECTED') {
                // Update aimed square continuously
                const legal = validMovesRef.current;
                const aimed = snapToLegal(cursor, selectedRef.current!, legal);
                aimedSquareRef.current = aimed ?? null;

                if (pinchStarted) {
                    // Always reset timer on a fresh pinch edge
                    pinchStartTimeRef.current = now;
                }

                // Guard: if phase entered while already pinching, timer would be 0 — fix it
                if (isPinching && pinchStartTimeRef.current === 0) {
                    pinchStartTimeRef.current = now;
                }

                if (pinchEnded) {
                    // If timer was never set treat as instant quick-pinch (0ms held)
                    const heldMs = pinchStartTimeRef.current > 0
                        ? now - pinchStartTimeRef.current
                        : 0;

                    const isQuickPinch = heldMs < QUICK_PINCH_MAX_MS;
                    const isLongHold = heldMs >= HOLD_SELECT_MS;

                    if (isQuickPinch) {
                        // ✅ Quick-pinch: CONFIRM move
                        // Prefer snapped aimed square, fall back to sq directly under cursor
                        const target = (aimed && legal.some(m => m.row === aimed.row && m.col === aimed.col))
                            ? aimed
                            : (sq && legal.some(m => m.row === sq.row && m.col === sq.col))
                                ? sq
                                : null;

                        if (target) {
                            doMove(selectedRef.current!, target);
                        } else {
                            // Pinched on invalid square → deselect
                            selectedRef.current = null;
                            validMovesRef.current = [];
                            aimedSquareRef.current = null;
                            phaseRef.current = 'IDLE';
                        }
                    } else if (isLongHold) {
                        // Long hold while selected → CANCEL selection
                        selectedRef.current = null;
                        validMovesRef.current = [];
                        aimedSquareRef.current = null;
                        phaseRef.current = 'IDLE';
                    }
                    // Gray zone (400–600ms): do nothing, stay in SELECTED
                    pinchStartTimeRef.current = 0;
                }
            }

            prevPinchRef.current = isPinching;
        };
    }); // no deps — always uses latest refs

    // ── Draw a single frame ───────────────────────────────────────────────────
    const drawFrame = useCallback(() => {
        const canvas = canvasRef.current;
        const video = videoRef.current;
        if (!canvas || !video) return;

        const W = canvas.width, H = canvas.height;
        const ctx = canvas.getContext('2d')!;

        // ── Layer 1: Camera feed (mirrored) ───────────────────────────────────
        ctx.save();
        ctx.scale(-1, 1);
        ctx.drawImage(video, -W, 0, W, H);
        ctx.restore();

        // Vignette
        const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, H * 0.8);
        vg.addColorStop(0, 'rgba(0,0,0,0)');
        vg.addColorStop(1, 'rgba(0,0,0,0.45)');
        ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);

        // ── FIX 4: Compute stable layout first (used for hit-testing) ─────────
        const { x: bxStable, y: byStable, sqSize, total: totalSize } = computeStableLayout(W, H);

        // Float is draw-only — never stored in stableBoardRef
        floatRef.current.t += 0.018;
        const floatY = Math.sin(floatRef.current.t) * 5;
        const bx = bxStable;
        const by = byStable + floatY; // ONLY used for drawing, not hit-testing

        const board = boardRef.current;
        const sel = selectedRef.current;
        const vm = validMovesRef.current;
        const lm = lastMoveRef.current;
        const myCol = myColorRef.current;
        const phase = phaseRef.current;
        const aimed = aimedSquareRef.current;
        const cursorPt = cursorRef.current;
        const gs = gestureRef.current;
        const selectedPiece = sel ? board[sel.row][sel.col] : null;

        // ── Layer 2: Board + squares ──────────────────────────────────────────
        ctx.save();
        // Board glow border
        ctx.shadowColor = 'rgba(0,220,255,0.6)'; ctx.shadowBlur = 30;
        ctx.strokeStyle = BOARD_BORDER; ctx.lineWidth = 3;
        ctx.strokeRect(bx - 1, by - 1, totalSize + 2, totalSize + 2);
        ctx.shadowBlur = 0;

        for (let dr = 0; dr < 8; dr++) {
            for (let dc = 0; dc < 8; dc++) {
                const row = myCol === 'black' ? 7 - dr : dr;
                const col = myCol === 'black' ? 7 - dc : dc;
                const sx = bx + dc * sqSize;
                const sy = by + dr * sqSize;
                const isLight = (row + col) % 2 === 0;

                // Base color
                let fillColor = isLight ? LIGHT_SQ : DARK_SQ;
                if (lm && ((lm.from.row === row && lm.from.col === col) || (lm.to.row === row && lm.to.col === col)))
                    fillColor = LASTMV_SQ;
                if (sel?.row === row && sel?.col === col)
                    fillColor = SEL_SQ;

                // Aimed (blue target)
                if (aimed?.row === row && aimed?.col === col && phase === 'SELECTED')
                    fillColor = AIM_SQ;

                // Hover (yellow) — only in IDLE/HOLDING
                let isHovered = false;
                if (cursorPt && (phase === 'IDLE' || phase === 'HOLDING' || phase === 'SELECTED')) {
                    const hSq = screenToSquare(cursorPt.x, cursorPt.y);
                    if (hSq?.row === row && hSq?.col === col) {
                        isHovered = true;
                        if (phase === 'IDLE' || phase === 'HOLDING') fillColor = HOVER_SQ;
                    }
                }

                ctx.fillStyle = fillColor;
                ctx.fillRect(sx, sy, sqSize, sqSize);

                // Hover border + notation
                if (isHovered && (phase === 'IDLE' || phase === 'HOLDING')) {
                    ctx.save();
                    ctx.strokeStyle = '#FFFF00'; ctx.lineWidth = 4;
                    ctx.shadowColor = '#FFFF00'; ctx.shadowBlur = 14;
                    ctx.strokeRect(sx + 2, sy + 2, sqSize - 4, sqSize - 4);
                    ctx.shadowBlur = 0;
                    const fileChar = 'abcdefgh'[myCol === 'black' ? 7 - col : col];
                    const rankNum = myCol === 'black' ? row + 1 : 8 - row;
                    ctx.font = `bold ${Math.max(11, sqSize * 0.22)}px "Segoe UI"`;
                    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
                    ctx.fillStyle = '#FFFF00';
                    ctx.fillText(`${fileChar}${rankNum}`, sx + 5, sy + 4);
                    ctx.restore();
                }

                // Valid move highlights
                if (vm.some(m => m.row === row && m.col === col)) {
                    const target = board[row][col];
                    if (target && target.color !== myCol) {
                        // Capture ring
                        ctx.strokeStyle = 'rgba(80,220,80,0.75)';
                        ctx.lineWidth = sqSize * 0.1;
                        ctx.strokeRect(sx + sqSize * 0.05, sy + sqSize * 0.05, sqSize * 0.9, sqSize * 0.9);
                    } else {
                        // Move dot
                        ctx.fillStyle = VALID_SQ;
                        ctx.beginPath();
                        ctx.arc(sx + sqSize / 2, sy + sqSize / 2, sqSize * 0.18, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }

                // Invalid target indicator (cursor on non-legal square while piece selected)
                if (phase === 'SELECTED' && sel && isHovered && !vm.some(m => m.row === row && m.col === col) && !(sel.row === row && sel.col === col)) {
                    ctx.fillStyle = INVALID_SQ;
                    ctx.fillRect(sx, sy, sqSize, sqSize);
                }

                // ── Pieces ────────────────────────────────────────────────────
                const piece = board[row][col];
                if (piece) {
                    ctx.save();
                    const isSel = sel?.row === row && sel?.col === col;
                    if (isSel) { ctx.shadowColor = '#00FF44'; ctx.shadowBlur = 32; }
                    else if (isHovered) { ctx.shadowColor = '#FFD700'; ctx.shadowBlur = 28; }
                    const fs = sqSize * 0.72;
                    ctx.font = `${fs}px serif`;
                    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                    // Shadow
                    ctx.fillStyle = piece.color === 'white' ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.15)';
                    ctx.fillText(PIECE_UNICODE[piece.color][piece.type], sx + sqSize / 2 + 2, sy + sqSize / 2 + 2);
                    ctx.fillStyle = piece.color === 'white' ? '#FFFFFF' : '#1a1a2e';
                    ctx.fillText(PIECE_UNICODE[piece.color][piece.type], sx + sqSize / 2, sy + sqSize / 2);
                    ctx.restore();
                }

                // Board coordinates
                if (dc === 0) {
                    ctx.fillStyle = isLight ? 'rgba(0,100,120,0.8)' : 'rgba(200,240,255,0.8)';
                    ctx.font = `bold ${sqSize * 0.2}px sans-serif`;
                    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
                    ctx.fillText(myCol === 'black' ? String(row + 1) : String(8 - row), sx + 3, sy + 3);
                }
                if (dr === 7) {
                    ctx.fillStyle = isLight ? 'rgba(0,100,120,0.8)' : 'rgba(200,240,255,0.8)';
                    ctx.font = `bold ${sqSize * 0.2}px sans-serif`;
                    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
                    ctx.fillText('abcdefgh'[myCol === 'black' ? 7 - col : col], sx + sqSize - 3, sy + sqSize - 3);
                }
            }
        }
        ctx.restore();

        // ── Hold-pinch progress ring (HOLDING phase) ──────────────────────────
        if (phase === 'HOLDING' && cursorPt) {
            const prog = holdProgressRef.current;
            ctx.save();
            ctx.strokeStyle = `rgba(0, 255, 136, ${0.4 + prog * 0.6})`;
            ctx.lineWidth = 5;
            ctx.shadowColor = '#00FF88'; ctx.shadowBlur = 16;
            ctx.beginPath();
            ctx.arc(cursorPt.x, cursorPt.y, 28, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * prog);
            ctx.stroke();
            // Inner pulsing dot
            ctx.fillStyle = `rgba(0,255,136,${0.3 + prog * 0.5})`;
            ctx.beginPath(); ctx.arc(cursorPt.x, cursorPt.y, 8 + prog * 6, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
        }

        // ── Cursor ────────────────────────────────────────────────────────────
        if (gs && cursorPt) {
            const { x: cx, y: cy } = cursorPt;
            const isPinch = gs.isPinching;
            const color = phase === 'SELECTED'
                ? (aimed && vm.some(m => m.row === aimed.row && m.col === aimed.col) ? '#00AAFF' : '#FF4444')
                : (isPinch ? '#00FF88' : '#00CCFF');

            ctx.save();
            ctx.shadowColor = color; ctx.shadowBlur = 22;
            ctx.strokeStyle = color; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(cx, cy, isPinch ? 16 : 12, 0, Math.PI * 2); ctx.stroke();
            ctx.shadowBlur = 12;
            ctx.fillStyle = color;
            ctx.beginPath(); ctx.arc(cx, cy, isPinch ? 7 : 5, 0, Math.PI * 2); ctx.fill();
            // Crosshair
            ctx.shadowBlur = 0;
            ctx.strokeStyle = color.replace(')', ', 0.7)').replace('rgb', 'rgba');
            ctx.lineWidth = 1.5;
            const arm = 18;
            ctx.beginPath();
            ctx.moveTo(cx - arm, cy); ctx.lineTo(cx - 7, cy);
            ctx.moveTo(cx + 7, cy); ctx.lineTo(cx + arm, cy);
            ctx.moveTo(cx, cy - arm); ctx.lineTo(cx, cy - 7);
            ctx.moveTo(cx, cy + 7); ctx.lineTo(cx, cy + arm);
            ctx.stroke();
            ctx.restore();
        }

        // ── Selected piece info panel ─────────────────────────────────────────
        if (selectedPiece && sel && phase === 'SELECTED') {
            const files = 'abcdefgh';
            const selNotation = `${files[sel.col]}${8 - sel.row}`;
            const moveList = vm.slice(0, 6).map(m => `${files[m.col]}${8 - m.row}`).join(', ');
            ctx.save();
            ctx.fillStyle = 'rgba(0,0,0,0.84)';
            ctx.beginPath(); ctx.roundRect(16, 60, 260, 100, 12); ctx.fill();
            ctx.strokeStyle = '#00FF88'; ctx.lineWidth = 2; ctx.stroke();
            ctx.fillStyle = '#00FF88';
            ctx.font = 'bold 12px "Segoe UI"'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
            ctx.fillText('✅ PIECE SELECTED', 28, 72);
            ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 16px "Segoe UI"';
            ctx.fillText(`${selectedPiece.color} ${selectedPiece.type} @ ${selNotation}`, 28, 94);
            ctx.fillStyle = '#00E5FF'; ctx.font = '12px "Segoe UI"';
            ctx.fillText(`Moves: ${moveList || 'none'}`, 28, 118);
            ctx.fillStyle = 'rgba(255,255,255,0.65)'; ctx.font = '11px "Segoe UI"';
            ctx.fillText('Aim at a move dot, then quick-pinch to confirm', 28, 138);
            ctx.restore();
        }

        // ── Hover tooltip ─────────────────────────────────────────────────────
        if (gs && cursorPt && phase !== 'SELECTED') {
            const hovSq = screenToSquare(cursorPt.x, cursorPt.y);
            if (hovSq) {
                const hovPiece = board[hovSq.row][hovSq.col];
                if (hovPiece) {
                    const names: Record<string, string> = { king: 'King', queen: 'Queen', rook: 'Rook', bishop: 'Bishop', knight: 'Knight', pawn: 'Pawn' };
                    const fileChar = 'abcdefgh'[myCol === 'black' ? 7 - hovSq.col : hovSq.col];
                    const rankNum = myCol === 'black' ? hovSq.row + 1 : 8 - hovSq.row;
                    const label = `${hovPiece.color === 'white' ? '⬜' : '⬛'} ${names[hovPiece.type]} · ${fileChar}${rankNum}`;
                    ctx.save();
                    ctx.font = 'bold 15px "Segoe UI"';
                    const ttW = ctx.measureText(label).width + 24;
                    let ttX = cursorPt.x + 18, ttY = cursorPt.y - 44;
                    if (ttX + ttW > W - 8) ttX = cursorPt.x - ttW - 18;
                    if (ttY < 8) ttY = cursorPt.y + 18;
                    ctx.fillStyle = 'rgba(0,0,0,0.82)';
                    ctx.beginPath(); ctx.roundRect(ttX, ttY, ttW, 32, 8); ctx.fill();
                    ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 1.5; ctx.stroke();
                    ctx.fillStyle = '#FFD700'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
                    ctx.fillText(label, ttX + 12, ttY + 16);
                    // Hint if it's player's piece and their turn
                    if (hovPiece.color === myCol && myCol === currentTurnRef.current) {
                        ctx.fillStyle = '#00E5FF'; ctx.font = '11px "Segoe UI"'; ctx.textBaseline = 'top';
                        ctx.fillText('Hold pinch 1s to select', ttX + 12, ttY + 36);
                    }
                    ctx.restore();
                }
            }
        }

        // ── Status bar ────────────────────────────────────────────────────────
        const inChk = isInCheck(board, currentTurnRef.current);
        const phaseHint = phase === 'HOLDING'
            ? `🤌 Hold… (${Math.round(holdProgressRef.current * 100)}%)`
            : phase === 'SELECTED'
                ? '👆 Move finger to dot → quick pinch to confirm'
                : myColorRef.current === currentTurnRef.current
                    ? '👆 Your turn — hover a piece & hold pinch (0.4s)'
                    : `⏳ ${currentTurnRef.current}'s turn`;

        const statusText = gameOverRef.current
            ? `${gameOverRef.current.winner === 'Draw' ? '🤝 Draw' : `🏆 ${gameOverRef.current.winner} wins`} — ${gameOverRef.current.reason}`
            : inChk ? `⚠️ CHECK! ${currentTurnRef.current} to move` : phaseHint;

        ctx.save();
        ctx.font = 'bold 17px "Segoe UI"'; ctx.textAlign = 'center';
        const tw = ctx.measureText(statusText).width;
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.beginPath(); ctx.roundRect(W / 2 - tw / 2 - 18, 12, tw + 36, 36, 18); ctx.fill();
        ctx.fillStyle = inChk ? '#FF6B6B' : (phase === 'SELECTED' ? '#00AAFF' : phase === 'HOLDING' ? '#00FF88' : myColorRef.current === currentTurnRef.current ? '#00E5FF' : '#aaa');
        ctx.fillText(statusText, W / 2, 30);
        ctx.restore();

        // ── Turn indicators ───────────────────────────────────────────────────
        (['white', 'black'] as PieceColor[]).forEach((col, i) => {
            const tx = W / 2 + (i === 0 ? -92 : 10), ty = H - 44;
            const active = currentTurnRef.current === col;
            ctx.save();
            ctx.fillStyle = active ? (col === 'white' ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.85)') : 'rgba(255,255,255,0.1)';
            ctx.beginPath(); ctx.roundRect(tx, ty, 80, 30, 15); ctx.fill();
            if (active) { ctx.strokeStyle = '#00E5FF'; ctx.lineWidth = 2; ctx.stroke(); }
            ctx.fillStyle = active ? (col === 'white' ? '#000' : '#fff') : 'rgba(255,255,255,0.35)';
            ctx.font = 'bold 13px "Segoe UI"'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText((col === 'white' ? '⬜ White' : '⬛ Black') + (myColorRef.current === col ? ' (you)' : ''), tx + 40, ty + 15);
            ctx.restore();
        });

        // ── Captured pieces ───────────────────────────────────────────────────
        const cap = capturedRef.current;
        if (cap.white.length || cap.black.length) {
            ctx.save();
            ctx.font = '18px serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.beginPath(); ctx.roundRect(8, 60, 44, H - 120, 8); ctx.fill();
            cap.white.forEach((p, i) => ctx.fillText(PIECE_UNICODE[p.color][p.type], 12, 68 + i * 22));
            cap.black.forEach((p, i) => ctx.fillText(PIECE_UNICODE[p.color][p.type], 12, 68 + (cap.white.length + i) * 22));
            ctx.restore();
        }

        // ── Move history ──────────────────────────────────────────────────────
        const hist = moveHistRef.current.slice(-10);
        if (hist.length) {
            ctx.save();
            ctx.fillStyle = 'rgba(0,0,0,0.45)';
            ctx.beginPath(); ctx.roundRect(W - 90, 60, 82, hist.length * 20 + 16, 8); ctx.fill();
            ctx.font = '11px monospace'; ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(255,255,255,0.7)';
            hist.forEach((m, i) => ctx.fillText(m, W - 12, 70 + i * 20));
            ctx.restore();
        }

        // ── Gesture hints ─────────────────────────────────────────────────────
        const hints = ['🖐 Hold pinch 0.4s = select piece', '🤌 Quick pinch on green dot = move', '✌️ Peace sign = reset'];
        ctx.save();
        ctx.font = '12px "Segoe UI"'; ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(255,255,255,0.45)';
        hints.forEach((h, i) => ctx.fillText(h, W - 16, H - 70 + i * 18));
        ctx.restore();

        // ── Debug overlay ─────────────────────────────────────────────────────
        if (debugMode) {
            ctx.save();
            ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillRect(10, 10, 320, 140);
            ctx.fillStyle = 'cyan'; ctx.font = '13px monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
            ctx.fillText(`Phase: ${phase}`, 20, 20);
            ctx.fillText(`Pinching: ${gs?.isPinching ?? false}`, 20, 38);
            ctx.fillText(`Hold progress: ${Math.round((holdProgressRef.current ?? 0) * 100)}%`, 20, 56);
            if (cursorPt) {
                const hSq = screenToSquare(cursorPt.x, cursorPt.y);
                ctx.fillText(`Cursor: x=${Math.round(cursorPt.x)} y=${Math.round(cursorPt.y)}`, 20, 74);
                ctx.fillText(`Square: r=${hSq?.row ?? 'N/A'} c=${hSq?.col ?? 'N/A'}`, 20, 92);
            }
            if (sel) ctx.fillText(`Selected: r${sel.row} c${sel.col} (${validMovesRef.current.length} moves)`, 20, 110);
            if (aimed) ctx.fillText(`Aimed: r${aimed.row} c${aimed.col}`, 20, 128);
            ctx.restore();
        }
    }, [computeStableLayout, screenToSquare, debugMode]);

    // ── FIX 1: MediaPipe setup — NO processGesture in deps ───────────────────
    useEffect(() => {
        const hands = new Hands({
            locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`,
        });
        hands.setOptions({ maxNumHands: 2, modelComplexity: 1, minDetectionConfidence: 0.7, minTrackingConfidence: 0.5 });

        hands.onResults((results: Results) => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const W = canvas.width, H = canvas.height;
            const ctx = canvas.getContext('2d')!;

            if (!results.multiHandLandmarks?.length) {
                gestureRef.current = null;
                cursorRef.current = null;
                cursorHistRef.current = [];
                return;
            }

            // Draw skeleton for all hands (mirrored)
            results.multiHandLandmarks.forEach(lm => {
                const gs = classifyGesture(lm as HandLandmark[]);
                drawHandSkeleton(ctx, lm as HandLandmark[], W, H, gs.isPinching);
            });

            // Pick best hand (closest to board center, bonus for pinching)
            const bx = stableBoardRef.current.x + stableBoardRef.current.totalSize / 2 || W / 2;
            const by = stableBoardRef.current.y + stableBoardRef.current.totalSize / 2 || H / 2;

            let best: { gs: GestureState; score: number } | null = null;
            for (const lm of results.multiHandLandmarks) {
                const gs = classifyGesture(lm as HandLandmark[]);
                // FIX 3: mirror X for cursor position scoring
                const cx = W - gs.indexTip.x * W;
                const cy = gs.indexTip.y * H;
                const sq = screenToSquare(cx, cy);
                let score = 0;
                if (gs.isPinching) score += 120;
                if (gs.gesture === 'point') score += 70;
                if (sq) score += 35;
                score -= Math.hypot(cx - bx, cy - by) / 25;
                if (!best || score > best.score) best = { gs, score };
            }

            if (best) {
                gestureRef.current = best.gs;
                // Call processGesture via ref — always latest, never causes re-init
                processGestureRef.current(best.gs, W, H);
            } else {
                gestureRef.current = null;
            }
        });

        handsRef.current = hands;

        // FIX 2+3: Do NOT call cam.start() — that calls getUserMedia internally
        // and would create a second stream without audio.
        // Instead run our own rAF loop against the videoRef that already has
        // the shared localStream attached (via the localStream useEffect above).
        let frameLoopRunning = true;
        const frameLoop = async () => {
            if (!frameLoopRunning) return;
            const video = videoRef.current;
            if (video && handsRef.current && video.readyState >= 2 && !video.paused) {
                await handsRef.current.send({ image: video });
            }
            requestAnimationFrame(frameLoop);
        };
        // Wait for video to be ready before starting loop
        const startLoop = () => {
            setHandReady(true);
            frameLoop();
        };
        if (videoRef.current && videoRef.current.readyState >= 2) {
            startLoop();
        } else if (videoRef.current) {
            videoRef.current.addEventListener('loadeddata', startLoop, { once: true });
        }

        return () => {
            frameLoopRunning = false;
            hands.close();
        };
    }, []); // ✅ Empty deps — MediaPipe never restarts

    // ── Render loop ───────────────────────────────────────────────────────────
    useEffect(() => {
        let running = true;
        const loop = () => { if (!running) return; drawFrame(); rafRef.current = requestAnimationFrame(loop); };
        loop();
        return () => { running = false; cancelAnimationFrame(rafRef.current); };
    }, [drawFrame]);

    // ── Canvas resize ─────────────────────────────────────────────────────────
    useEffect(() => {
        const resize = () => {
            if (!canvasRef.current) return;
            canvasRef.current.width = window.innerWidth;
            canvasRef.current.height = window.innerHeight;
        };
        resize();
        window.addEventListener('resize', resize);
        return () => window.removeEventListener('resize', resize);
    }, []);

    // ── Promotion handler ─────────────────────────────────────────────────────
    const handlePromotion = (pt: PieceType) => {
        if (!promotionPending) return;
        const nb = cloneBoard(boardRef.current);
        nb[promotionPending.pos.row][promotionPending.pos.col] = { type: pt, color: promotionPending.color };
        const next: PieceColor = currentTurnRef.current === 'white' ? 'black' : 'white';
        boardRef.current = nb; currentTurnRef.current = next;
        setPromotionPending(null);
        phaseRef.current = 'IDLE';
        const ns = { chessBoard: nb, currentTurn: next, enPassantTarget: null, lastMove: lastMoveRef.current };
        onStateUpdate?.(ns);
        sendWsMessage?.('game_state_update', { state: ns });
    };

    // ── JSX ───────────────────────────────────────────────────────────────────
    return (
        <div style={{ position: 'fixed', inset: 0, background: '#000', overflow: 'hidden' }}>
            <video ref={videoRef} autoPlay playsInline muted
                style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 1, height: 1 }} />
            <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />

            {/* Loading */}
            {!handReady && !camError && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.85)', color: '#fff', fontFamily: "'Segoe UI',sans-serif", zIndex: 10 }}>
                    <div style={{ width: 60, height: 60, border: '4px solid #333', borderTop: '4px solid #00E5FF', borderRadius: '50%', animation: 'spin 1s linear infinite', marginBottom: 24 }} />
                    <h2 style={{ margin: '0 0 8px', color: '#00E5FF' }}>Loading AR Chess</h2>
                    <p style={{ color: '#888', margin: 0 }}>Initializing camera & hand tracking...</p>
                    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
                </div>
            )}

            {/* Camera error */}
            {camError && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.9)', color: '#fff', zIndex: 10 }}>
                    <div style={{ fontSize: 64, marginBottom: 16 }}>📷</div>
                    <h2 style={{ color: '#f44336', margin: '0 0 8px' }}>Camera Required</h2>
                    <p style={{ color: '#aaa' }}>Allow camera access and refresh.</p>
                </div>
            )}

            {/* Debug button */}
            <button onClick={() => setDebugMode(d => !d)} style={{ position: 'absolute', top: 20, right: 20, zIndex: 100, padding: '8px 16px', borderRadius: '20px', border: 'none', cursor: 'pointer', background: debugMode ? '#F44336' : 'rgba(255,255,255,0.15)', color: '#fff', fontSize: '13px', fontWeight: 700, backdropFilter: 'blur(4px)' }}>
                🐛 Debug
            </button>

            {/* Promotion modal */}
            {promotionPending && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.75)', zIndex: 20 }}>
                    <div style={{ background: 'rgba(10,20,35,0.97)', borderRadius: 20, padding: '32px 40px', border: '2px solid #00E5FF', textAlign: 'center', boxShadow: '0 0 60px rgba(0,229,255,0.4)', color: '#fff', fontFamily: "'Segoe UI',sans-serif" }}>
                        <h3 style={{ margin: '0 0 8px' }}>Promote Pawn</h3>
                        <p style={{ color: '#aaa', fontSize: 13, margin: '0 0 20px' }}>Click to choose</p>
                        <div style={{ display: 'flex', gap: 16 }}>
                            {(['queen', 'rook', 'bishop', 'knight'] as PieceType[]).map(pt => (
                                <button key={pt} onClick={() => handlePromotion(pt)} style={{ fontSize: 52, background: 'rgba(0,229,255,0.12)', border: '2px solid #00E5FF', borderRadius: 12, padding: '12px 16px', cursor: 'pointer', color: '#fff' }}>
                                    {PIECE_UNICODE[promotionPending.color][pt]}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Game over modal */}
            {gameOverState && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.75)', zIndex: 20 }}>
                    <div style={{ background: 'rgba(10,20,35,0.97)', borderRadius: 24, padding: '52px 72px', border: '2px solid #00E5FF', textAlign: 'center', boxShadow: '0 0 80px rgba(0,229,255,0.5)', color: '#fff', fontFamily: "'Segoe UI',sans-serif" }}>
                        <div style={{ fontSize: 72, marginBottom: 16 }}>{gameOverState.winner === 'Draw' ? '🤝' : '🏆'}</div>
                        <h2 style={{ margin: '0 0 8px', fontSize: '2.2rem' }}>{gameOverState.winner === 'Draw' ? 'Draw!' : `${gameOverState.winner} Wins!`}</h2>
                        <p style={{ color: '#aaa', margin: '0 0 36px', fontSize: 16 }}>{gameOverState.reason}</p>
                        <button onClick={() => {
                            boardRef.current = createInitialBoard();
                            currentTurnRef.current = 'white';
                            selectedRef.current = null; validMovesRef.current = [];
                            gameOverRef.current = null; epRef.current = null;
                            lastMoveRef.current = null; capturedRef.current = { white: [], black: [] };
                            moveHistRef.current = []; aimedSquareRef.current = null;
                            phaseRef.current = 'IDLE'; holdProgressRef.current = 0;
                            setGameOverState(null);
                        }} style={{ padding: '14px 40px', fontSize: '1.1rem', background: 'linear-gradient(135deg,#00BCD4,#0097A7)', color: '#000', border: 'none', borderRadius: 30, cursor: 'pointer', fontWeight: 800, boxShadow: '0 4px 20px rgba(0,188,212,0.4)' }}>
                            ▶ Play Again
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};