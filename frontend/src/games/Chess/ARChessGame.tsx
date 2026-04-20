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

const HOLD_SELECT_MS  = 400;  // dwell 400ms to SELECT or MOVE

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
    | 'IDLE'       // no piece selected, pointing around
    | 'SELECTED'   // piece selected, pointing at destination
    | 'COOLDOWN';  // brief pause after a move

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
    const gestureRef        = useRef<GestureState | null>(null);
    const cursorRef         = useRef<ScreenPoint | null>(null);
    const cursorHistRef     = useRef<ScreenPoint[]>([]);
    const phaseRef          = useRef<GesturePhase>('IDLE');
    // Dwell tracking (position-deadzone method — robust to finger jitter)
    const dwellStartRef     = useRef<number>(0);                // timestamp dwell began
    const dwellSquareRef    = useRef<Position | null>(null);    // board square captured at dwell-start
    const dwellProgressRef  = useRef<number>(0);                // 0–1 visual progress
    const aimedSquareRef    = useRef<Position | null>(null);    // legal destination cursor is over
    const holdProgressRef   = useRef<number>(0);                // alias kept for debug overlay compat

    // FIX 4: stable board layout for hit-testing (no float offset)
    const stableBoardRef = useRef({ x: 0, y: 0, sqSize: 0, totalSize: 0 });
    // draw-only offset (floatY applied only in drawFrame)
    const floatRef = useRef({ t: 0 });
    const [localMultiplayerState, setLocalMultiplayerState] = useState(false);
    const localMultiplayerRef = useRef(false);
    const setLocalMultiplayer = (val: boolean) => {
        setLocalMultiplayerState(val);
        localMultiplayerRef.current = val;
        window.dispatchEvent(new CustomEvent('set_voice_active', { detail: { active: val || myColorRef.current === currentTurnRef.current } }));
    };

    const [handReady, setHandReady] = useState(false);
    const [promotionPending, setPromotionPending] = useState<{ pos: Position; color: PieceColor } | null>(null);
    const [gameOverState, setGameOverState] = useState<{ winner: string; reason: string } | null>(null);
    const [customStatusMsg, setCustomStatusMsg] = useState<{ msg: string; type: 'error' | 'info' } | null>(null);
    const customStatusTimerRef = useRef<NodeJS.Timeout | null>(null);
    const showMessage = (msg: string, type: 'error' | 'info' = 'info') => {
        setCustomStatusMsg({ msg, type });
        if (customStatusTimerRef.current) clearTimeout(customStatusTimerRef.current);
        customStatusTimerRef.current = setTimeout(() => setCustomStatusMsg(null), 3500);
    };

    const [debugMode, setDebugMode] = useState(false);
    const [, setMyColor] = useState<PieceColor>('white');
    useEffect(() => {
        if (gameState?.my_color) {
            myColorRef.current = gameState.my_color as PieceColor;
            setMyColor(gameState.my_color as PieceColor);
            window.dispatchEvent(new CustomEvent('set_voice_active', { detail: { active: localMultiplayerRef.current || myColorRef.current === currentTurnRef.current } }));
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
        if (s.currentTurn) {
            currentTurnRef.current = s.currentTurn;
            window.dispatchEvent(new CustomEvent('set_voice_active', { detail: { active: localMultiplayerRef.current || myColorRef.current === s.currentTurn } }));
        }
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
        const w = hist.reduce((acc: { x: number; y: number; w: number }, p, i) => {
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
    const snapToLegal = useCallback((cursor: ScreenPoint, legal: Position[]): Position | null => {
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
        window.dispatchEvent(new CustomEvent('set_voice_active', { detail: { active: localMultiplayerRef.current || myColorRef.current === next } }));
        
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
        // Include playerId so RoomView knows this update came from US and
        // can skip applying it to our own board (prevents echo loop)
        sendWsMessage?.('game_state_update', { state: ns, player_id: playerId });
    }, [onStateUpdate, sendWsMessage, playerId]);

    // ── Voice Command Listener ────────────────────────────────────────────────
    useEffect(() => {
        const handleVoiceMove = (e: Event) => {
            const action = (e as CustomEvent).detail as { from: string; to: string };
            if (!action || !action.from || !action.to) return;
            
            // "b2" -> row: 6, col: 1
            const parseCoord = (coord: string) => {
                const col = coord.charCodeAt(0) - 97; // 'a' -> 0
                const row = 8 - parseInt(coord[1]);    // '1' -> 7, '8' -> 0
                return { row, col };
            };
            
            const fromPos = parseCoord(action.from);
            const toPos = parseCoord(action.to);
            
            // Validate before making move
            const board = boardRef.current;
            const piece = board[fromPos.row][fromPos.col];
            
            const isLocal = localMultiplayerRef.current;
            const canMove = isLocal ? piece && piece.color === currentTurnRef.current : (piece && piece.color === myColorRef.current && myColorRef.current === currentTurnRef.current);
            if (!canMove) {
                console.warn("[Voice] Move invalid: Not your piece or turn!");
                showMessage("❌ Not your piece or turn!", 'error');
                return;
            }
            
            const legalMoves = getLegalMoves(boardRef.current, fromPos, epRef.current);
            const isLegal = legalMoves.some(m => m.row === toPos.row && m.col === toPos.col);
            
            if (isLegal) {
                doMove(fromPos, toPos);
            } else {
                console.warn(`[Voice] Move ${action.from} -> ${action.to} is technically illegal on the board!`);
                showMessage(`❌ Illegal move: ${action.from} to ${action.to}`, 'error');
            }
        };

        window.addEventListener('chess_voice_move', handleVoiceMove);
        return () => window.removeEventListener('chess_voice_move', handleVoiceMove);
    }, [doMove]);

    // ── Gesture processor ─────────────────────────────────────────────────────
    // Pure point/dwell control — NO pinching needed:
    //   IDLE:     point at YOUR piece and hold still 0.4s → piece SELECTED
    //   SELECTED: point at a legal destination and hold still 0.4s → piece MOVES
    //   Re-dwell on selected piece → DESELECT
    // ─────────────────────────────────────────────────────────────────────────
    const processGestureRef = useRef<(gs: GestureState, W: number, H: number) => void>(() => { });

    useEffect(() => {
        processGestureRef.current = (gs: GestureState, W: number, H: number) => {
            if (gameOverRef.current) return;

            // ── CRITICAL FIX: ensure board layout is computed before any hit-testing ──
            // drawFrame runs on its own RAF loop. MediaPipe fires onResults from a
            // different RAF loop. If MediaPipe fires first, stableBoardRef is still
            // {x:0,y:0,sqSize:0} → screenToSquare always returns null → dwell never starts.
            computeStableLayout(W, H);

            // Mirror X to match the flipped camera feed drawn on canvas
            const rawCursor = { x: (1 - gs.indexTip.x) * W, y: gs.indexTip.y * H };
            const cursor = smoothCursor(rawCursor);
            cursorRef.current = cursor;

            const sq  = screenToSquare(cursor.x, cursor.y);
            const now = performance.now();

            // ── Dwell tracking ───────────────────────────────────────────────
            // If the finger has moved to a different board square, reset the
            // dwell timer. Same square = accumulate time toward 0.4s threshold.
            const prev   = dwellSquareRef.current;
            const sameSq = sq && prev && sq.row === prev.row && sq.col === prev.col;

            if (!sameSq) {
                // Moved to a new square (or off board) — restart timer
                dwellSquareRef.current   = sq;
                dwellStartRef.current    = sq ? now : 0;
                dwellProgressRef.current = 0;
            } else if (sq) {
                // Hovering same square — accumulate
                const elapsed = now - dwellStartRef.current;
                dwellProgressRef.current = Math.min(elapsed / HOLD_SELECT_MS, 1);
                holdProgressRef.current  = dwellProgressRef.current; // keep alias in sync
            }

            const dwellElapsed = (sq && sameSq) ? (now - dwellStartRef.current) : 0;

            // ── IDLE ─────────────────────────────────────────────────────────
            // CRITICAL: must be else-if chain — only one phase block runs per frame.
            // If IDLE fires and sets phaseRef='SELECTED', the SELECTED block must NOT
            // also fire in the same frame (dwellElapsed is still the old 400ms value
            // which would immediately trigger isSamePiece → deselect).
            if (phaseRef.current === 'IDLE') {
                aimedSquareRef.current = null;

                if (sq && dwellElapsed >= HOLD_SELECT_MS) {
                    const myColor = myColorRef.current;
                    const piece   = boardRef.current[sq.row]?.[sq.col];

                    const canControl = localMultiplayerRef.current ? (piece && piece.color === currentTurnRef.current) : (piece && piece.color === myColor && myColor === currentTurnRef.current);
                    if (canControl) {
                        // ✅ SELECT
                        selectedRef.current    = sq;
                        validMovesRef.current  = getLegalMoves(boardRef.current, sq, epRef.current);
                        aimedSquareRef.current = null;
                        phaseRef.current       = 'SELECTED';

                        // Reset dwell so destination timer starts fresh
                        dwellSquareRef.current   = null;
                        dwellStartRef.current    = 0;
                        dwellProgressRef.current = 0;
                        holdProgressRef.current  = 0;
                    }
                    // else: hovered over wrong piece / empty / opponent — ignore
                }

            // ── SELECTED ─────────────────────────────────────────────────────
            } else if (phaseRef.current === 'SELECTED') {
                const legal = validMovesRef.current;

                // Update aimed square continuously (blue snapping highlight follows cursor)
                const aimed = snapToLegal(cursor, legal);
                aimedSquareRef.current = aimed ?? null;

                if (sq && dwellElapsed >= HOLD_SELECT_MS) {
                    const isLegal = legal.some(m => m.row === sq.row && m.col === sq.col);
                    const isSamePiece = selectedRef.current &&
                        sq.row === selectedRef.current.row && sq.col === selectedRef.current.col;

                    if (isLegal) {
                        // ✅ MOVE — dwell completed on a legal destination
                        doMove(selectedRef.current!, sq);
                        dwellSquareRef.current   = null;
                        dwellStartRef.current    = 0;
                        dwellProgressRef.current = 0;
                        holdProgressRef.current  = 0;
                    } else if (isSamePiece) {
                        // Re-dwell on the selected piece → DESELECT
                        selectedRef.current    = null;
                        validMovesRef.current  = [];
                        aimedSquareRef.current = null;
                        phaseRef.current       = 'IDLE';
                        dwellSquareRef.current   = null;
                        dwellStartRef.current    = 0;
                        dwellProgressRef.current = 0;
                        holdProgressRef.current  = 0;
                    }
                    // else: dwell on empty / opponent square — stay SELECTED, let user aim elsewhere
                }

            // ── COOLDOWN ─────────────────────────────────────────────────────
            } else if (phaseRef.current === 'COOLDOWN') {
                aimedSquareRef.current   = null;
                dwellProgressRef.current = 0;
                holdProgressRef.current  = 0;
            }
        };
    }); // no deps — always captures latest refs/callbacks


    // ── Draw a single frame ───────────────────────────────────────────────────
    const drawFrame = useCallback(() => {
        const canvas = canvasRef.current;
        const video = videoRef.current;
        if (!canvas || !video) return;

        const W = canvas.width, H = canvas.height;
        const ctx = canvas.getContext('2d')!;

        // ── Layer 1: Background ───────────────────────────────────────────────
        // Fill with a deep elegant gradient instead of the camera feed
        const bgGrad = ctx.createLinearGradient(0, 0, W, H);
        bgGrad.addColorStop(0, '#1a1a2e');
        bgGrad.addColorStop(1, '#0f3460');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, W, H);

        // Vignette overlay for depth
        const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, H * 0.8);
        vg.addColorStop(0, 'rgba(0,0,0,0)');
        vg.addColorStop(1, 'rgba(0,0,0,0.6)');
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

                // Hover (yellow) — only in IDLE
                let isHovered = false;
                if (cursorPt && (phase === 'IDLE' || phase === 'SELECTED')) {
                    const hSq = screenToSquare(cursorPt.x, cursorPt.y);
                    if (hSq?.row === row && hSq?.col === col) {
                        isHovered = true;
                        if (phase === 'IDLE') fillColor = HOVER_SQ;
                    }
                }

                ctx.fillStyle = fillColor;
                ctx.fillRect(sx, sy, sqSize, sqSize);

                // Hover border + notation
                if (isHovered && phase === 'IDLE') {
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

        // ── Dwell progress ring ───────────────────────────────────────────────
        // Green ring = dwelling to SELECT a piece (IDLE phase)
        // Blue ring  = dwelling to CONFIRM a move  (SELECTED phase, on legal sq)
        const dwellProg = dwellProgressRef.current;
        const isDwellingOnLegal = phase === 'SELECTED' && aimed &&
            vm.some(m => m.row === aimed.row && m.col === aimed.col);
        const showDwellRing = cursorPt && dwellProg > 0.05 &&
            (phase === 'IDLE' || (phase === 'SELECTED' && isDwellingOnLegal));

        if (showDwellRing && cursorPt) {
            const isMove = phase === 'SELECTED';
            const prog   = dwellProg;
            ctx.save();
            ctx.strokeStyle = isMove
                ? `rgba(0,170,255,${0.4 + prog * 0.6})`
                : `rgba(0,255,136,${0.4 + prog * 0.6})`;
            ctx.lineWidth = 6;
            ctx.shadowColor = isMove ? '#00AAFF' : '#00FF88'; ctx.shadowBlur = 18;
            ctx.beginPath();
            ctx.arc(cursorPt.x, cursorPt.y, 32, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * prog);
            ctx.stroke();
            ctx.fillStyle = isMove
                ? `rgba(0,170,255,${0.35 + prog * 0.55})`
                : `rgba(0,255,136,${0.35 + prog * 0.55})`;
            ctx.shadowBlur = 12;
            ctx.beginPath(); ctx.arc(cursorPt.x, cursorPt.y, 7 + prog * 7, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
        }

        // ── Cursor ────────────────────────────────────────────────────────────
        if (gs && cursorPt) {
            const { x: cx, y: cy } = cursorPt;
            const color = phase === 'SELECTED'
                ? (aimed && vm.some(m => m.row === aimed.row && m.col === aimed.col) ? '#00AAFF' : '#FF6666')
                : '#00E5FF';

            ctx.save();
            ctx.shadowColor = color; ctx.shadowBlur = 22;
            ctx.strokeStyle = color; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(cx, cy, 12, 0, Math.PI * 2); ctx.stroke();
            ctx.shadowBlur = 12;
            ctx.fillStyle = color;
            ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2); ctx.fill();
            ctx.shadowBlur = 0;
            ctx.lineWidth = 1.5;
            const arm = 18;
            ctx.beginPath();
            ctx.moveTo(cx - arm, cy); ctx.lineTo(cx - 8, cy);
            ctx.moveTo(cx + 8, cy);   ctx.lineTo(cx + arm, cy);
            ctx.moveTo(cx, cy - arm); ctx.lineTo(cx, cy - 8);
            ctx.moveTo(cx, cy + 8);   ctx.lineTo(cx, cy + arm);
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
            ctx.fillText('Point at a blue dot → hold 0.4s to move', 28, 138);
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
                        ctx.fillText('Point & hold 0.4s to select → point at blue dot 0.4s to move', ttX + 12, ttY + 36);
                    }
                    ctx.restore();
                }
            }
        }

        // ── Status bar ────────────────────────────────────────────────────────
        const inChk = isInCheck(board, currentTurnRef.current);
        const myTurn = localMultiplayerRef.current || myColorRef.current === currentTurnRef.current;
        const phaseHint = phase === 'SELECTED'
            ? '👆 Point at a blue dot and hold 0.4s to move'
            : myTurn
                ? '👆 Your turn — point at your piece and hold 0.4s to select'
                : `⏳ ${currentTurnRef.current}'s turn`;

        const statusText = customStatusMsg 
            ? customStatusMsg.msg 
            : gameOverRef.current
                ? `${gameOverRef.current.winner === 'Draw' ? '🤝 Draw' : `🏆 ${gameOverRef.current.winner} wins`} — ${gameOverRef.current.reason}`
                : inChk ? `⚠️ CHECK! ${currentTurnRef.current} to move` : phaseHint;

        ctx.save();
        ctx.font = 'bold 17px "Segoe UI"'; ctx.textAlign = 'center';
        const tw = ctx.measureText(statusText).width;
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.beginPath(); ctx.roundRect(W / 2 - tw / 2 - 18, 12, tw + 36, 36, 18); ctx.fill();
        ctx.fillStyle = customStatusMsg?.type === 'error' ? '#FF4444' : inChk ? '#FF6B6B' : (phase === 'SELECTED' ? '#00AAFF' : myTurn ? '#00E5FF' : '#aaa');
        ctx.fillText(statusText, W / 2, 30);
        ctx.restore();

        // ── Turn indicators ───────────────────────────────────────────────────
        (['white', 'black'] as PieceColor[]).forEach((col, i) => {
            const tx = W / 2 + (i === 0 ? -92 : 10), ty = H - 44;
            const active = currentTurnRef.current === col;
            const isMe = localMultiplayerRef.current || myColorRef.current === col;
            ctx.save();
            ctx.fillStyle = active ? (col === 'white' ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.85)') : 'rgba(255,255,255,0.1)';
            ctx.beginPath(); ctx.roundRect(tx, ty, 80, 30, 15); ctx.fill();
            if (active) { ctx.strokeStyle = '#00E5FF'; ctx.lineWidth = 2; ctx.stroke(); }
            ctx.fillStyle = active ? (col === 'white' ? '#000' : '#fff') : 'rgba(255,255,255,0.35)';
            ctx.font = 'bold 13px "Segoe UI"'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText((col === 'white' ? '⬜ White' : '⬛ Black') + (isMe ? ' (you)' : ''), tx + 40, ty + 15);
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
        const hints = ['👆 Point at piece + hold 0.4s = SELECT', '👆 Point at blue dot + hold 0.4s = MOVE', '🎤 Say "E2 to E4" to move'];
        ctx.save();
        ctx.font = '12px "Segoe UI"'; ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(255,255,255,0.45)';
        hints.forEach((h, i) => ctx.fillText(h, W - 16, H - 70 + i * 18));
        ctx.restore();

        // ── Debug overlay ─────────────────────────────────────────────────────
        if (debugMode) {
            ctx.save();
            ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillRect(10, 10, 320, 160);
            ctx.fillStyle = 'cyan'; ctx.font = '13px monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
            ctx.fillText(`Phase: ${phase}`, 20, 20);
            ctx.fillText(`Gesture: ${gs?.gesture ?? 'none'}`, 20, 38);
            ctx.fillText(`Dwell progress: ${Math.round(dwellProgressRef.current * 100)}%`, 20, 56);
            ctx.fillText(`Board sqSize: ${stableBoardRef.current.sqSize}px`, 20, 74);
            if (cursorPt) {
                const hSq = screenToSquare(cursorPt.x, cursorPt.y);
                ctx.fillText(`Cursor: x=${Math.round(cursorPt.x)} y=${Math.round(cursorPt.y)}`, 20, 92);
                ctx.fillText(`Square: r=${hSq?.row ?? 'N/A'} c=${hSq?.col ?? 'N/A'}`, 20, 110);
            }
            if (sel) ctx.fillText(`Selected: r${sel.row} c${sel.col} (${validMovesRef.current.length} moves)`, 20, 128);
            if (aimed) ctx.fillText(`Aimed: r${aimed.row} c${aimed.col}`, 20, 146);
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
                // Mirror X for cursor position scoring (matches mirrored canvas)
                const cx = W - gs.indexTip.x * W;
                const cy = gs.indexTip.y * H;
                const sq = screenToSquare(cx, cy);
                // Dwell mode: prefer index-pointing hands that are over the board.
                // No pinch bonus — pinching is irrelevant in dwell mode.
                let score = 0;
                if (gs.gesture === 'point') score += 100;   // strongly prefer pointing
                else if (gs.gesture === 'peace') score += 40; // peace is also usable
                if (sq) score += 50;                         // bonus if over the board
                score -= Math.hypot(cx - bx, cy - by) / 20; // prefer hand near board
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
        sendWsMessage?.('game_state_update', { state: ns, player_id: playerId });
    };

    // ── JSX ───────────────────────────────────────────────────────────────────
    return (
        <div style={{ position: 'fixed', inset: 0, background: '#000', overflow: 'hidden' }}>
            <video ref={videoRef} autoPlay playsInline muted
                style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 1, height: 1 }} />
            <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />

            {/* Loading */}
            {!handReady && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.85)', color: '#fff', fontFamily: "'Segoe UI',sans-serif", zIndex: 10 }}>
                    <div style={{ width: 60, height: 60, border: '4px solid #333', borderTop: '4px solid #00E5FF', borderRadius: '50%', animation: 'spin 1s linear infinite', marginBottom: 24 }} />
                    <h2 style={{ margin: '0 0 8px', color: '#00E5FF' }}>Loading AR Chess</h2>
                    <p style={{ color: '#888', margin: 0 }}>Initializing camera & hand tracking...</p>
                    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
                </div>
            )}



            {/* Debug button */}
            <button onClick={() => setLocalMultiplayer(!localMultiplayerState)} style={{ position: 'absolute', top: 20, right: 120, zIndex: 100, padding: '8px 16px', borderRadius: '20px', border: 'none', cursor: 'pointer', background: localMultiplayerState ? '#4CAF50' : 'rgba(255,255,255,0.15)', color: '#fff', fontSize: '13px', fontWeight: 700, backdropFilter: 'blur(4px)' }}>
                👥 Pass & Play {localMultiplayerState ? 'ON' : 'OFF'}
            </button>
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
                            phaseRef.current = 'IDLE';
                            dwellSquareRef.current = null; dwellStartRef.current = 0;
                            dwellProgressRef.current = 0; holdProgressRef.current = 0;
                            cursorHistRef.current = [];
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