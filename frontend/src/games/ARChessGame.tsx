/**
 * ARChessGame.tsx
 *
 * True AR chess: everything rendered on a SINGLE HTML5 canvas.
 * Rendering pipeline (per frame):
 *   1. Camera feed (full canvas)
 *   2. Hand skeleton (neon glow)
 *   3. Floating chess board (semi-transparent, perspective tilt)
 *   4. Chess pieces (glow on hover/select, drag follows finger)
 *   5. Cursor at index fingertip
 *   6. UI overlays (status, captured pieces, move history)
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Hands, Results } from '@mediapipe/hands';
import { Camera } from '@mediapipe/camera_utils';
import {
    classifyGesture, drawHandSkeleton,
    landmarkToCanvas, GestureState, HandLandmark,
} from './GestureController';
import {
    createInitialBoard, getLegalMoves, applyMove, getGameResult,
    isInCheck, cloneBoard, PIECE_UNICODE,
    Board, Piece, PieceColor, PieceType, Position,
} from './ChessLogic';
import { WS_BASE_URL } from '@/utils/constants';

// ── Config ────────────────────────────────────────────────────────────────────
const BOARD_COLS = 8;
const DRAG_START_RATIO = 0.35;
const CURSOR_HISTORY_SIZE = 4;
const CURSOR_DEADZONE_PX = 3;
const CURSOR_SLOW_ALPHA = 0.2;
const CURSOR_FAST_ALPHA = 0.4;
const CURSOR_FAST_THRESHOLD_PX = 28;
const SNAP_HYSTERESIS_PX = 24;

// Board colors (semi-transparent for AR)
const LIGHT_SQ = 'rgba(232, 244, 252, 0.72)';
const DARK_SQ = 'rgba(0, 150, 180, 0.72)';
const SEL_SQ = 'rgba(80, 220, 80, 0.85)';
const HOVER_SQ = 'rgba(255, 220, 50, 0.65)';
const VALID_SQ = 'rgba(80, 220, 80, 0.45)';
const LASTMV_SQ = 'rgba(255, 240, 80, 0.55)';
const BOARD_BORDER = 'rgba(0, 220, 255, 0.9)';

interface ARChessGameProps {
    playerId: string;
    gameState?: any;
    onStateUpdate?: (s: any) => void;
}

interface DragState {
    piece: Piece;
    from: Position;
    screenX: number;
    screenY: number;
    previewSquare: Position | null;
}

interface ScreenPoint {
    x: number;
    y: number;
}

export const ARChessGame: React.FC<ARChessGameProps> = ({ playerId, gameState, onStateUpdate }) => {
    // ── Refs ──────────────────────────────────────────────────────────────────
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const handsRef = useRef<Hands | null>(null);
    const camRef = useRef<Camera | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const rafRef = useRef<number>(0);

    // Game state refs (used inside rAF loop — avoid stale closures)
    const boardRef = useRef<Board>(createInitialBoard());
    const selectedRef = useRef<Position | null>(null);
    const validMovesRef = useRef<Position[]>([]);
    const currentTurnRef = useRef<PieceColor>('white');
    const myColorRef = useRef<PieceColor>('white');
    const epRef = useRef<Position | null>(null);
    const lastMoveRef = useRef<{ from: Position; to: Position } | null>(null);
    const gameOverRef = useRef<{ winner: string; reason: string } | null>(null);
    const dragRef = useRef<DragState | null>(null);
    const capturedRef = useRef<{ white: Piece[]; black: Piece[] }>({ white: [], black: [] });
    const moveHistRef = useRef<string[]>([]);

    // Gesture refs
    const gestureRef = useRef<GestureState | null>(null);
    const pinchCoolRef = useRef(false);
    const prevPinchingRef = useRef(false);
    const pinchStartSquareRef = useRef<Position | null>(null);
    const pinchStartPointRef = useRef<ScreenPoint | null>(null);
    const cursorRef = useRef<ScreenPoint | null>(null);
    const cursorHistoryRef = useRef<ScreenPoint[]>([]);

    // Board layout (computed each frame from canvas size)
    const boardLayoutRef = useRef({ x: 0, y: 0, sqSize: 0, totalSize: 0 });

    // Floating animation
    const floatRef = useRef({ t: 0 }); // time for sine wave

    // ── React state (only for UI that needs re-render) ─────────────────────
    const [handReady, setHandReady] = useState(false);
    const [camError, setCamError] = useState(false);
    const [promotionPending, setPromotionPending] = useState<{ pos: Position; color: PieceColor } | null>(null);
    const [gameOverState, setGameOverState] = useState<{ winner: string; reason: string } | null>(null);
    const [debugMode, setDebugMode] = useState(false);
    // myColor tracked via myColorRef for rAF loop; setMyColor used for WS updates
    const [, setMyColor] = useState<PieceColor>('white');

    const roomCode = gameState?.room_code || 'chess_room';

    // ── WebSocket ─────────────────────────────────────────────────────────────
    useEffect(() => {
        const ws = new WebSocket(`${WS_BASE_URL}/ws/${roomCode}/${playerId}`);
        wsRef.current = ws;
        ws.onmessage = (e) => {
            try {
                const msg = JSON.parse(e.data);
                if (msg.type === 'game_state_update') {
                    const s = msg.data?.state;
                    if (s?.chessBoard) boardRef.current = s.chessBoard;
                    if (s?.currentTurn) currentTurnRef.current = s.currentTurn;
                    if (s?.enPassantTarget !== undefined) epRef.current = s.enPassantTarget;
                    if (s?.lastMove !== undefined) lastMoveRef.current = s.lastMove;
                    if (s?.gameOver) { gameOverRef.current = s.gameOver; setGameOverState(s.gameOver); }
                }
                if (msg.type === 'chess_color_assign') {
                    myColorRef.current = msg.data.color;
                    setMyColor(msg.data.color);
                }
            } catch { }
        };
        ws.onerror = () => {
            const isFirst = gameState?.player1_id === playerId;
            const col: PieceColor = isFirst ? 'white' : 'black';
            myColorRef.current = col;
            setMyColor(col);
        };
        return () => ws.close();
    }, [roomCode, playerId, gameState]);

    // ── Board layout helper ───────────────────────────────────────────────────
    const computeBoardLayout = useCallback((canvasW: number, canvasH: number) => {
        const maxSize = Math.min(canvasW * 0.72, canvasH * 0.78);
        const sqSize = Math.floor(maxSize / BOARD_COLS);
        const totalSize = sqSize * BOARD_COLS;
        const x = Math.floor((canvasW - totalSize) / 2);
        const y = Math.floor((canvasH - totalSize) / 2) + 20;
        boardLayoutRef.current = { x, y, sqSize, totalSize };
        return { x, y, sqSize, total: totalSize };
    }, []);

    // ── Map screen coords → board square ──────────────────────────────────────
    const screenToSquare = useCallback((sx: number, sy: number): Position | null => {
        const { x, y, sqSize, totalSize } = boardLayoutRef.current;
        const rx = sx - x, ry = sy - y;
        if (rx < 0 || rx > totalSize || ry < 0 || ry > totalSize) return null;
        let col = Math.floor(rx / sqSize);
        let row = Math.floor(ry / sqSize);
        if (col < 0 || col > 7 || row < 0 || row > 7) return null;
        if (myColorRef.current === 'black') { row = 7 - row; col = 7 - col; }
        return { row, col };
    }, []);

    const squareToScreenCenter = useCallback((pos: Position): ScreenPoint => {
        const { x, y, sqSize } = boardLayoutRef.current;
        const displayRow = myColorRef.current === 'black' ? 7 - pos.row : pos.row;
        const displayCol = myColorRef.current === 'black' ? 7 - pos.col : pos.col;
        return {
            x: x + displayCol * sqSize + sqSize / 2,
            y: y + displayRow * sqSize + sqSize / 2,
        };
    }, []);

    const smoothCursor = useCallback((raw: ScreenPoint): ScreenPoint => {
        const history = cursorHistoryRef.current;
        history.push(raw);
        if (history.length > CURSOR_HISTORY_SIZE) history.shift();

        const weighted = history.reduce<{ x: number; y: number; weight: number }>(
            (acc, point, index) => {
                const weight = index + 1;
                acc.x += point.x * weight;
                acc.y += point.y * weight;
                acc.weight += weight;
                return acc;
            },
            { x: 0, y: 0, weight: 0 }
        );

        const averaged = {
            x: weighted.x / weighted.weight,
            y: weighted.y / weighted.weight,
        };

        const prev = cursorRef.current;
        if (!prev) return averaged;

        const delta = Math.hypot(averaged.x - prev.x, averaged.y - prev.y);
        if (delta < CURSOR_DEADZONE_PX) return prev;

        const alpha = delta > CURSOR_FAST_THRESHOLD_PX ? CURSOR_FAST_ALPHA : CURSOR_SLOW_ALPHA;
        return {
            x: prev.x + (averaged.x - prev.x) * alpha,
            y: prev.y + (averaged.y - prev.y) * alpha,
        };
    }, []);

    const getSnappedLegalTarget = useCallback((cursor: ScreenPoint, from: Position, legalMoves: Position[]): Position => {
        const candidates = [from, ...legalMoves];
        let best = from;
        let bestDistance = Number.POSITIVE_INFINITY;

        for (const candidate of candidates) {
            const center = squareToScreenCenter(candidate);
            const distance = Math.hypot(cursor.x - center.x, cursor.y - center.y);
            if (distance < bestDistance) {
                best = candidate;
                bestDistance = distance;
            }
        }

        const previous = dragRef.current?.previewSquare;
        if (previous) {
            const previousCenter = squareToScreenCenter(previous);
            const previousDistance = Math.hypot(cursor.x - previousCenter.x, cursor.y - previousCenter.y);
            if (previousDistance <= bestDistance + SNAP_HYSTERESIS_PX) {
                return previous;
            }
        }

        return best;
    }, [squareToScreenCenter]);



    // ── Execute move ──────────────────────────────────────────────────────────
    const doMove = useCallback((from: Position, to: Position) => {
        const board = boardRef.current;
        const ep = epRef.current;
        const piece = board[from.row][from.col];
        if (!piece) return;

        const { board: nb, newEp, captured: capturedPiece, isPromotion } = applyMove(board, from, to, ep);

        if (capturedPiece) {
            if (capturedPiece.color === 'white') capturedRef.current.white.push(capturedPiece);
            else capturedRef.current.black.push(capturedPiece);
        }

        // Move notation
        const cols = 'abcdefgh';
        const rows = '87654321';
        moveHistRef.current.push(`${cols[from.col]}${rows[from.row]}→${cols[to.col]}${rows[to.row]}`);

        if (isPromotion) {
            boardRef.current = nb;
            selectedRef.current = null;
            validMovesRef.current = [];
            dragRef.current = null;
            setPromotionPending({ pos: to, color: piece.color });
            return;
        }

        const nextTurn: PieceColor = currentTurnRef.current === 'white' ? 'black' : 'white';
        boardRef.current = nb;
        currentTurnRef.current = nextTurn;
        epRef.current = newEp;
        lastMoveRef.current = { from, to };
        selectedRef.current = null;
        validMovesRef.current = [];
        dragRef.current = null;

        const result = getGameResult(nb, nextTurn, newEp);
        if (result) {
            gameOverRef.current = result;
            setGameOverState(result);
        }

        const ns = { chessBoard: nb, currentTurn: nextTurn, enPassantTarget: newEp, lastMove: { from, to } };
        onStateUpdate?.(ns);
        wsRef.current?.send(JSON.stringify({ type: 'game_state_update', data: { state: ns } }));

    }, [onStateUpdate]);

    // ── Interact with square (select / move) ──────────────────────────────────
    const lockPiece = useCallback((row: number, col: number): boolean => {
        if (gameOverRef.current) return false;
        if (myColorRef.current !== currentTurnRef.current) return false;

        const piece = boardRef.current[row][col];
        if (!piece || piece.color !== myColorRef.current) return false;

        selectedRef.current = { row, col };
        validMovesRef.current = getLegalMoves(boardRef.current, { row, col }, epRef.current);
        dragRef.current = null;
        return true;
    }, []);

    // ── Process gesture each frame ────────────────────────────────────────────
    const processGesture = useCallback((gs: GestureState, canvasW: number, canvasH: number) => {
        const { indexTip, isPinching } = gs;
        const rawCursor = landmarkToCanvas(indexTip, canvasW, canvasH);
        const smoothedCursor = smoothCursor(rawCursor);
        cursorRef.current = smoothedCursor;
        const { x: sx, y: sy } = smoothedCursor;
        const sq = screenToSquare(sx, sy);
        const wasPinching = prevPinchingRef.current;
        const pinchStarted = isPinching && !wasPinching;
        const pinchEnded = !isPinching && wasPinching;
        const selected = selectedRef.current;

        if (pinchStarted) {
            pinchStartSquareRef.current = sq;
            pinchStartPointRef.current = { x: sx, y: sy };

            if (sq && selected && validMovesRef.current.some(m => m.row === sq.row && m.col === sq.col)) {
                doMove(selected, sq);
            } else if (sq) {
                lockPiece(sq.row, sq.col);
            }
        }

        if (isPinching && selectedRef.current) {
            const piece = boardRef.current[selectedRef.current.row][selectedRef.current.col];
            const pinchStartPoint = pinchStartPointRef.current;
            const movedEnough = pinchStartPoint
                ? Math.hypot(sx - pinchStartPoint.x, sy - pinchStartPoint.y) >= boardLayoutRef.current.sqSize * DRAG_START_RATIO
                : false;
            const movedToDifferentSquare = !!sq && (sq.row !== selectedRef.current.row || sq.col !== selectedRef.current.col);

            if (!dragRef.current && piece?.color === myColorRef.current && (movedEnough || movedToDifferentSquare)) {
                const previewSquare = getSnappedLegalTarget({ x: sx, y: sy }, selectedRef.current, validMovesRef.current);
                const previewCenter = squareToScreenCenter(previewSquare);
                dragRef.current = {
                    piece,
                    from: selectedRef.current,
                    screenX: previewCenter.x,
                    screenY: previewCenter.y,
                    previewSquare,
                };
            }
        }

        if (dragRef.current && isPinching) {
            const previewSquare = getSnappedLegalTarget({ x: sx, y: sy }, dragRef.current.from, validMovesRef.current);
            const previewCenter = squareToScreenCenter(previewSquare);
            dragRef.current.previewSquare = previewSquare;
            dragRef.current.screenX = previewCenter.x;
            dragRef.current.screenY = previewCenter.y;
        }

        if (pinchEnded) {
            if (
                dragRef.current &&
                dragRef.current.previewSquare &&
                validMovesRef.current.some(
                    m => m.row === dragRef.current!.previewSquare!.row && m.col === dragRef.current!.previewSquare!.col
                )
            ) {
                doMove(dragRef.current.from, dragRef.current.previewSquare);
            }
            dragRef.current = null;
            pinchStartSquareRef.current = null;
            pinchStartPointRef.current = null;
        }

        // Open palm = undo
        if (!isPinching && gs.gesture === 'open_palm' && !pinchCoolRef.current) {
            pinchCoolRef.current = true;
            // Undo: restore previous board (simple: just deselect for now)
            selectedRef.current = null; validMovesRef.current = [];
            setTimeout(() => { pinchCoolRef.current = false; }, 1200);
        }

        // Peace sign = reset
        if (!isPinching && gs.gesture === 'peace' && !pinchCoolRef.current) {
            pinchCoolRef.current = true;
            boardRef.current = createInitialBoard();
            selectedRef.current = null;
            validMovesRef.current = [];
            currentTurnRef.current = 'white';
            epRef.current = null;
            lastMoveRef.current = null;
            gameOverRef.current = null;
            dragRef.current = null;
            capturedRef.current = { white: [], black: [] };
            moveHistRef.current = [];
            setGameOverState(null);
            setTimeout(() => { pinchCoolRef.current = false; }, 1500);
        }

        prevPinchingRef.current = isPinching;
    }, [screenToSquare, doMove, lockPiece, smoothCursor, getSnappedLegalTarget, squareToScreenCenter]);

    // ── Canvas draw ───────────────────────────────────────────────────────────
    const drawFrame = useCallback(() => {
        const canvas = canvasRef.current;
        const video = videoRef.current;
        if (!canvas || !video) return;

        const W = canvas.width, H = canvas.height;
        const ctx = canvas.getContext('2d')!;

        // ── Layer 1: Camera feed ──────────────────────────────────────────────
        ctx.save();
        ctx.scale(-1, 1); // mirror
        ctx.drawImage(video, -W, 0, W, H);
        ctx.restore();

        // ── Layer 2: Vignette for depth ───────────────────────────────────────
        const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, H * 0.8);
        vg.addColorStop(0, 'rgba(0,0,0,0)');
        vg.addColorStop(1, 'rgba(0,0,0,0.45)');
        ctx.fillStyle = vg;
        ctx.fillRect(0, 0, W, H);

        // ── Floating animation offset ─────────────────────────────────────────
        floatRef.current.t += 0.018;
        const floatY = Math.sin(floatRef.current.t) * 5;

        // ── Compute board layout ──────────────────────────────────────────────
        const { x: bx, y: by, sqSize, totalSize } = (() => {
            const { x, y, sqSize, total } = computeBoardLayout(W, H);
            return { x, y: y + floatY, sqSize, totalSize: total };
        })();
        boardLayoutRef.current = { x: bx, y: by, sqSize, totalSize };

        // ── Layer 3: Floating board ───────────────────────────────────────────
        ctx.save();

        // Board glow / shadow
        ctx.shadowColor = 'rgba(0,220,255,0.6)';
        ctx.shadowBlur = 30;
        ctx.strokeStyle = BOARD_BORDER;
        ctx.lineWidth = 3;
        ctx.strokeRect(bx - 1, by - 1, totalSize + 2, totalSize + 2);
        ctx.shadowBlur = 0;

        const board = boardRef.current;
        const sel = selectedRef.current;
        const vm = validMovesRef.current;
        const lm = lastMoveRef.current;
        const drag = dragRef.current;
        const myCol = myColorRef.current;
        const selectedPiece = sel ? board[sel.row][sel.col] : null;

        for (let dr = 0; dr < 8; dr++) {
            for (let dc = 0; dc < 8; dc++) {
                const row = myCol === 'black' ? 7 - dr : dr;
                const col = myCol === 'black' ? 7 - dc : dc;
                const sx = bx + dc * sqSize;
                const sy = by + dr * sqSize;
                const isLight = (row + col) % 2 === 0;

                // Base square color
                let fillColor = isLight ? LIGHT_SQ : DARK_SQ;
                if (lm && ((lm.from.row === row && lm.from.col === col) || (lm.to.row === row && lm.to.col === col)))
                    fillColor = LASTMV_SQ;
                if (sel?.row === row && sel?.col === col) fillColor = SEL_SQ;

                // Hover from gesture — compute once per square
                const gsCur = gestureRef.current;
                let isHoveredSq = false;
                const cursorPoint = cursorRef.current;
                if (gsCur && cursorPoint) {
                    const hSq = screenToSquare(cursorPoint.x, cursorPoint.y);
                    if (hSq?.row === row && hSq?.col === col) {
                        isHoveredSq = true;
                        if (!drag) fillColor = HOVER_SQ;
                    }
                }

                ctx.fillStyle = fillColor;
                ctx.fillRect(sx, sy, sqSize, sqSize);

                // ── ENHANCED: Bright yellow square highlight with notation ────
                if (isHoveredSq && !drag) {
                    // Bright border
                    ctx.save();
                    ctx.strokeStyle = '#FFFF00';
                    ctx.lineWidth = 4;
                    ctx.shadowColor = '#FFFF00';
                    ctx.shadowBlur = 14;
                    ctx.strokeRect(sx + 2, sy + 2, sqSize - 4, sqSize - 4);
                    ctx.shadowBlur = 0;
                    // Chess notation label in top-left of square
                    const files = 'abcdefgh';
                    const fileChar = files[myCol === 'black' ? 7 - col : col];
                    const rankNum = myCol === 'black' ? row + 1 : 8 - row;
                    const notation = fileChar + rankNum;
                    ctx.font = `bold ${Math.max(11, sqSize * 0.22)}px "Segoe UI", sans-serif`;
                    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
                    ctx.fillStyle = '#FFFF00';
                    ctx.fillText(notation, sx + 5, sy + 4);
                    ctx.restore();
                }

                // Valid move highlight
                if (vm.some(m => m.row === row && m.col === col)) {
                    const piece = board[row][col];
                    if (piece && piece.color !== myCol) {
                        // Capture ring
                        ctx.strokeStyle = 'rgba(80,220,80,0.7)';
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

                // ── Layer 4: Chess pieces ─────────────────────────────────────
                const piece = board[row][col];
                if (piece && !(drag && drag.from.row === row && drag.from.col === col)) {
                    const isSel = sel?.row === row && sel?.col === col;

                    ctx.save();
                    // Enhanced glow: selected = bright green, hovered = bright gold
                    if (isSel) {
                        ctx.shadowColor = '#00FF44';
                        ctx.shadowBlur = 32;
                    } else if (isHoveredSq) {
                        ctx.shadowColor = '#FFD700';
                        ctx.shadowBlur = 28;
                    }

                    const fontSize = sqSize * 0.72;
                    ctx.font = `${fontSize}px serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';

                    // Piece drop-shadow for depth
                    ctx.fillStyle = piece.color === 'white' ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.15)';
                    ctx.fillText(PIECE_UNICODE[piece.color][piece.type], sx + sqSize / 2 + 2, sy + sqSize / 2 + 2);

                    ctx.fillStyle = piece.color === 'white' ? '#FFFFFF' : '#1a1a2e';
                    ctx.fillText(PIECE_UNICODE[piece.color][piece.type], sx + sqSize / 2, sy + sqSize / 2);
                    ctx.restore();
                }

                // Coordinates
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
                    const colLabel = 'abcdefgh'[myCol === 'black' ? 7 - col : col];
                    ctx.fillText(colLabel, sx + sqSize - 3, sy + sqSize - 3);
                }
            }
        }
        ctx.restore();

        ctx.restore(); // end board save

        // ── Dragged piece follows finger ──────────────────────────────────────
        if (drag) {
            ctx.save();
            ctx.shadowColor = '#FFD700'; ctx.shadowBlur = 32;
            const fontSize = sqSize * 0.85;
            ctx.font = `${fontSize}px serif`;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.globalAlpha = 0.92;
            ctx.fillStyle = drag.piece.color === 'white' ? '#FFFFFF' : '#1a1a2e';
            ctx.fillText(PIECE_UNICODE[drag.piece.color][drag.piece.type], drag.screenX, drag.screenY);
            ctx.restore();
        }

        // ── VISUAL FEEDBACK: Hovered piece tooltip + info panel ───────────────
        const gsFeedback = gestureRef.current;
        const cursorPoint = cursorRef.current;
        if (gsFeedback && cursorPoint && !drag) {
            const { x: curX, y: curY } = cursorPoint;
            const hovSq = screenToSquare(curX, curY);

            if (hovSq) {
                const hovPiece = board[hovSq.row][hovSq.col];

                if (hovPiece) {
                    // ── Floating tooltip near cursor ──────────────────────────
                    const pieceNames: Record<string, string> = {
                        king: 'King', queen: 'Queen', rook: 'Rook',
                        bishop: 'Bishop', knight: 'Knight', pawn: 'Pawn',
                    };
                    const colorLabel = hovPiece.color === 'white' ? '⬜' : '⬛';
                    const files = 'abcdefgh';
                    const fileChar = files[myCol === 'black' ? 7 - hovSq.col : hovSq.col];
                    const rankNum = myCol === 'black' ? hovSq.row + 1 : 8 - hovSq.row;
                    const sqNotation = fileChar + rankNum;
                    const tooltipText = `${colorLabel} ${pieceNames[hovPiece.type]} · ${sqNotation}`;

                    ctx.save();
                    ctx.font = 'bold 15px "Segoe UI", sans-serif';
                    const ttW = ctx.measureText(tooltipText).width + 24;
                    const ttH = 32;
                    // Position tooltip above-right of cursor, keep on screen
                    let ttX = curX + 18;
                    let ttY = curY - ttH - 12;
                    if (ttX + ttW > W - 8) ttX = curX - ttW - 18;
                    if (ttY < 8) ttY = curY + 18;

                    ctx.fillStyle = 'rgba(0,0,0,0.82)';
                    ctx.beginPath();
                    ctx.roundRect(ttX, ttY, ttW, ttH, 8);
                    ctx.fill();
                    ctx.strokeStyle = '#FFD700';
                    ctx.lineWidth = 1.5;
                    ctx.stroke();

                    ctx.fillStyle = '#FFD700';
                    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
                    ctx.fillText(tooltipText, ttX + 12, ttY + ttH / 2);
                    ctx.restore();

                    // ── Info panel (top-left corner) ──────────────────────────
                    const px = 16, py = 60;
                    const pw = 210, ph = 96;
                    ctx.save();
                    ctx.fillStyle = 'rgba(0,0,0,0.82)';
                    ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 12); ctx.fill();
                    ctx.strokeStyle = '#00FF88'; ctx.lineWidth = 2;
                    ctx.stroke();

                    // Title
                    ctx.fillStyle = '#00FF88';
                    ctx.font = 'bold 12px "Segoe UI", sans-serif';
                    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
                    ctx.fillText('👆 HOVERING', px + 12, py + 10);

                    // Piece emoji + name
                    ctx.font = 'bold 22px serif';
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillText(PIECE_UNICODE[hovPiece.color][hovPiece.type], px + 12, py + 30);
                    ctx.font = 'bold 16px "Segoe UI", sans-serif';
                    ctx.fillText(
                        `${hovPiece.color.charAt(0).toUpperCase() + hovPiece.color.slice(1)} ${pieceNames[hovPiece.type]}`,
                        px + 42, py + 36
                    );

                    // Position
                    ctx.font = '13px "Segoe UI", sans-serif';
                    ctx.fillStyle = '#aaa';
                    ctx.fillText(`Position: ${sqNotation}`, px + 12, py + 66);

                    // Pinch hint
                    ctx.fillStyle = '#00E5FF';
                    ctx.font = '11px "Segoe UI", sans-serif';
                    ctx.fillText('🤌 Pinch to select', px + 12, py + 82);
                    ctx.restore();
                }
            }
        }

        if (selectedPiece && sel) {
            const files = 'abcdefgh';
            const selectedNotation = `${files[sel.col]}${8 - sel.row}`;
            const moveList = vm
                .slice(0, 6)
                .map(m => `${files[m.col]}${8 - m.row}`)
                .join(', ');

            ctx.save();
            ctx.fillStyle = 'rgba(0,0,0,0.84)';
            ctx.beginPath(); ctx.roundRect(16, 164, 260, 92, 12); ctx.fill();
            ctx.strokeStyle = '#00FF88';
            ctx.lineWidth = 2;
            ctx.stroke();

            ctx.fillStyle = '#00FF88';
            ctx.font = 'bold 12px "Segoe UI", sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillText('LOCKED PIECE', 28, 176);

            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold 16px "Segoe UI", sans-serif';
            ctx.fillText(
                `${selectedPiece.color.charAt(0).toUpperCase() + selectedPiece.color.slice(1)} ${selectedPiece.type} at ${selectedNotation}`,
                28,
                198
            );

            ctx.fillStyle = '#00E5FF';
            ctx.font = '12px "Segoe UI", sans-serif';
            ctx.fillText(`Moves: ${moveList || 'none'}`, 28, 224);

            ctx.fillStyle = 'rgba(255,255,255,0.72)';
            ctx.fillText('Hold pinch and move your hand, then release to drop.', 28, 240);
            ctx.restore();
        }

        // ── Layer 5: Status overlay (top center) ──────────────────────────────
        const inChk = isInCheck(board, currentTurnRef.current);
        const statusText = gameOverRef.current
            ? `${gameOverRef.current.winner === 'Draw' ? '🤝 Draw' : `🏆 ${gameOverRef.current.winner} wins`} — ${gameOverRef.current.reason}`
            : inChk ? `⚠️ CHECK! ${currentTurnRef.current} to move`
                : myColorRef.current === currentTurnRef.current ? '👆 Your turn — point & pinch'
                    : `⏳ ${currentTurnRef.current}'s turn`;

        ctx.save();
        ctx.font = 'bold 18px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        const tw = ctx.measureText(statusText).width;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.beginPath();
        ctx.roundRect(W / 2 - tw / 2 - 16, 14, tw + 32, 36, 18);
        ctx.fill();
        ctx.fillStyle = inChk ? '#FF6B6B' : (myColorRef.current === currentTurnRef.current ? '#00E5FF' : '#aaa');
        ctx.fillText(statusText, W / 2, 32);
        ctx.restore();

        // ── Turn indicators (bottom) ──────────────────────────────────────────
        const turnLabels: [PieceColor, string][] = [['white', '⬜ White'], ['black', '⬛ Black']];
        turnLabels.forEach(([col, label], i) => {
            const tx = W / 2 + (i === 0 ? -90 : 10);
            const ty = H - 44;
            const active = currentTurnRef.current === col;
            ctx.save();
            ctx.fillStyle = active ? (col === 'white' ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.85)') : 'rgba(255,255,255,0.1)';
            ctx.beginPath(); ctx.roundRect(tx, ty, 80, 30, 15); ctx.fill();
            if (active) { ctx.strokeStyle = '#00E5FF'; ctx.lineWidth = 2; ctx.stroke(); }
            ctx.fillStyle = active ? (col === 'white' ? '#000' : '#fff') : 'rgba(255,255,255,0.35)';
            ctx.font = 'bold 13px "Segoe UI"'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(label + (myColorRef.current === col ? ' (you)' : ''), tx + 40, ty + 15);
            ctx.restore();
        });

        // ── Gesture hint (bottom right) ───────────────────────────────────────
        const hints = ['🤌 Pinch piece = lock', 'Move while pinching, release = drop', '✌️ Peace = reset'];
        ctx.save();
        ctx.font = '12px "Segoe UI"'; ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(255,255,255,0.5)';
        hints.forEach((h, i) => ctx.fillText(h, W - 16, H - 70 + i * 18));
        ctx.restore();

        // ── Captured pieces sidebar ───────────────────────────────────────────
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

        // ── Move history (right side) ─────────────────────────────────────────
        const hist = moveHistRef.current.slice(-10);
        if (hist.length) {
            ctx.save();
            ctx.fillStyle = 'rgba(0,0,0,0.45)';
            ctx.beginPath(); ctx.roundRect(W - 90, 60, 82, hist.length * 20 + 16, 8); ctx.fill();
            ctx.font = '11px monospace'; ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(255,255,255,0.7)';
            hist.forEach((m, i) => ctx.fillText(m, W - 12, 70 + i * 20));
            ctx.restore();
        }

        // ── Layer 6: Cursor (always on top) ──────────────────────────────────
        const gsCursor = gestureRef.current;
        if (gsCursor && cursorRef.current) {
            const { x: cx, y: cy } = cursorRef.current;
            const isPinch = gsCursor.isPinching;

            ctx.save();

            // Outer glow ring
            ctx.shadowColor = isPinch ? '#00FF88' : '#00CCFF';
            ctx.shadowBlur = 22;
            ctx.strokeStyle = isPinch ? '#00FF88' : '#00CCFF';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(cx, cy, isPinch ? 16 : 12, 0, Math.PI * 2);
            ctx.stroke();

            // Filled dot
            ctx.shadowBlur = 12;
            ctx.fillStyle = isPinch ? '#00FF88' : '#00CCFF';
            ctx.beginPath();
            ctx.arc(cx, cy, isPinch ? 7 : 5, 0, Math.PI * 2);
            ctx.fill();

            // Crosshair lines
            ctx.shadowBlur = 0;
            ctx.strokeStyle = isPinch ? 'rgba(0,255,136,0.7)' : 'rgba(0,204,255,0.7)';
            ctx.lineWidth = 1.5;
            const arm = 18;
            ctx.beginPath();
            ctx.moveTo(cx - arm, cy); ctx.lineTo(cx - 6, cy);
            ctx.moveTo(cx + 6, cy); ctx.lineTo(cx + arm, cy);
            ctx.moveTo(cx, cy - arm); ctx.lineTo(cx, cy - 6);
            ctx.moveTo(cx, cy + 6); ctx.lineTo(cx, cy + arm);
            ctx.stroke();

            ctx.restore();
        }

        // ── Layer 7: Debug Overlay ───────────────────────────────────────────
        if (debugMode) {
            ctx.save();
            ctx.fillStyle = 'rgba(0,0,0,0.7)';
            ctx.fillRect(10, 10, 300, 120);
            ctx.fillStyle = 'cyan';
            ctx.font = '14px monospace';
            ctx.textAlign = 'left'; ctx.textBaseline = 'top';
            const gsDbg = gestureRef.current;
            ctx.fillText(`Pinching: ${gsDbg ? gsDbg.isPinching : false}`, 20, 20);
            if (gsDbg && cursorRef.current) {
                const { x: fx, y: fy } = cursorRef.current;
                const hSq = screenToSquare(fx, fy);
                ctx.fillText(`Raw Canvas X: ${Math.round(fx)} Y: ${Math.round(fy)}`, 20, 45);
                ctx.fillText(`Map Row: ${hSq?.row ?? 'N/A'} Col: ${hSq?.col ?? 'N/A'}`, 20, 70);
            }
            if (dragRef.current) {
                ctx.fillText(`Dragging: r${dragRef.current.from.row} c${dragRef.current.from.col}`, 20, 95);
            }
            ctx.restore();
        }

    }, [computeBoardLayout, screenToSquare, debugMode]);

    // ── MediaPipe setup ───────────────────────────────────────────────────────
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
                cursorHistoryRef.current = [];
                return;
            }

            // Draw skeleton for ALL detected hands
            results.multiHandLandmarks.forEach((lm) => {
                const gs = classifyGesture(lm as HandLandmark[]);
                drawHandSkeleton(ctx, lm as HandLandmark[], W, H, gs.isPinching);
            });

            const boardCenterX = boardLayoutRef.current.totalSize > 0
                ? boardLayoutRef.current.x + boardLayoutRef.current.totalSize / 2
                : W / 2;
            const boardCenterY = boardLayoutRef.current.totalSize > 0
                ? boardLayoutRef.current.y + boardLayoutRef.current.totalSize / 2
                : H / 2;

            const candidates = results.multiHandLandmarks.map((lm) => {
                const landmarks = lm as HandLandmark[];
                const gs = classifyGesture(landmarks);
                const cursor = landmarkToCanvas(gs.indexTip, W, H);
                const hoveredSquare = screenToSquare(cursor.x, cursor.y);
                const distanceToBoardCenter = Math.hypot(cursor.x - boardCenterX, cursor.y - boardCenterY);

                let score = 0;
                if (gs.isPinching) score += 120;
                if (gs.gesture === 'point') score += 70;
                if (gs.gesture === 'pinch') score += 50;
                if (hoveredSquare) score += 35;
                score -= distanceToBoardCenter / 25;

                return { gs, score };
            });

            const bestCandidate = candidates.reduce((best, candidate) =>
                !best || candidate.score > best.score ? candidate : best,
                null as { gs: GestureState; score: number } | null
            );

            if (!bestCandidate) {
                gestureRef.current = null;
                return;
            }

            gestureRef.current = bestCandidate.gs;
            processGesture(bestCandidate.gs, W, H);
        });

        handsRef.current = hands;

        if (videoRef.current) {
            const cam = new Camera(videoRef.current, {
                onFrame: async () => {
                    if (videoRef.current && handsRef.current)
                        await handsRef.current.send({ image: videoRef.current });
                },
                width: 1280, height: 720,
            });
            cam.start()
                .then(() => { setHandReady(true); })
                .catch(() => setCamError(true));
            camRef.current = cam;
        }

        return () => { hands.close(); camRef.current?.stop(); };
    }, [processGesture]);

    // ── Render loop ───────────────────────────────────────────────────────────
    useEffect(() => {
        let running = true;
        const loop = () => {
            if (!running) return;
            drawFrame();
            rafRef.current = requestAnimationFrame(loop);
        };
        loop();
        return () => { running = false; cancelAnimationFrame(rafRef.current); };
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

    // ── Promotion handler ─────────────────────────────────────────────────────
    const handlePromotion = (pt: PieceType) => {
        if (!promotionPending) return;
        const nb = cloneBoard(boardRef.current);
        nb[promotionPending.pos.row][promotionPending.pos.col] = { type: pt, color: promotionPending.color };
        const next: PieceColor = currentTurnRef.current === 'white' ? 'black' : 'white';
        boardRef.current = nb; currentTurnRef.current = next;
        setPromotionPending(null);
        const ns = { chessBoard: nb, currentTurn: next, enPassantTarget: null, lastMove: lastMoveRef.current };
        onStateUpdate?.(ns);
        wsRef.current?.send(JSON.stringify({ type: 'game_state_update', data: { state: ns } }));
    };

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div style={{ position: 'fixed', inset: 0, background: '#000', overflow: 'hidden' }}>
            {/* Hidden video element — camera feed drawn to canvas by rAF loop */}
            <video ref={videoRef} autoPlay playsInline muted
                style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 1, height: 1 }} />

            {/* THE SINGLE CANVAS — everything is drawn here */}
            <canvas ref={canvasRef}
                style={{ display: 'block', width: '100%', height: '100%' }} />

            {/* Loading overlay */}
            {!handReady && !camError && (
                <div style={{
                    position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(0,0,0,0.85)', color: '#fff', fontFamily: "'Segoe UI', sans-serif",
                    zIndex: 10,
                }}>
                    <div style={{
                        width: 60, height: 60, border: '4px solid #333', borderTop: '4px solid #00E5FF',
                        borderRadius: '50%', animation: 'spin 1s linear infinite', marginBottom: 24,
                    }} />
                    <h2 style={{ margin: '0 0 8px', color: '#00E5FF' }}>Loading AR Chess</h2>
                    <p style={{ color: '#888', margin: 0 }}>Initializing camera & hand tracking...</p>
                    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </div>
            )}

            {/* Camera error */}
            {camError && (
                <div style={{
                    position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(0,0,0,0.9)', color: '#fff', fontFamily: "'Segoe UI', sans-serif",
                    zIndex: 10,
                }}>
                    <div style={{ fontSize: 64, marginBottom: 16 }}>📷</div>
                    <h2 style={{ color: '#f44336', margin: '0 0 8px' }}>Camera Required</h2>
                    <p style={{ color: '#aaa' }}>Allow camera access and refresh the page.</p>
                </div>
            )}

            {/* ── DEBUG BUTTON ── */}
            <button
                onClick={() => setDebugMode(d => !d)}
                style={{
                    position: 'absolute', top: 20, right: 20, zIndex: 100,
                    padding: '8px 16px', borderRadius: '20px', border: 'none', cursor: 'pointer',
                    background: debugMode ? '#F44336' : 'rgba(255,255,255,0.15)',
                    color: '#fff', fontSize: '13px', fontWeight: 700,
                    backdropFilter: 'blur(4px)',
                }}
            >
                🐛 Debug
            </button>

            {/* Promotion modal — HTML overlay on top of canvas */}
            {promotionPending && (
                <div style={{
                    position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(0,0,0,0.75)', zIndex: 20,
                }}>
                    <div style={{
                        background: 'rgba(10,20,35,0.97)', borderRadius: 20, padding: '32px 40px',
                        border: '2px solid #00E5FF', textAlign: 'center',
                        boxShadow: '0 0 60px rgba(0,229,255,0.4)', color: '#fff',
                        fontFamily: "'Segoe UI', sans-serif",
                    }}>
                        <h3 style={{ margin: '0 0 8px' }}>Promote Pawn</h3>
                        <p style={{ color: '#aaa', fontSize: 13, margin: '0 0 20px' }}>Pinch or click to choose</p>
                        <div style={{ display: 'flex', gap: 16 }}>
                            {(['queen', 'rook', 'bishop', 'knight'] as PieceType[]).map(pt => (
                                <button key={pt} onClick={() => handlePromotion(pt)} style={{
                                    fontSize: 52, background: 'rgba(0,229,255,0.12)',
                                    border: '2px solid #00E5FF', borderRadius: 12,
                                    padding: '12px 16px', cursor: 'pointer', color: '#fff',
                                    transition: 'transform 0.15s, background 0.15s',
                                }}
                                    onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.12)'; e.currentTarget.style.background = 'rgba(0,229,255,0.3)'; }}
                                    onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.background = 'rgba(0,229,255,0.12)'; }}>
                                    {PIECE_UNICODE[promotionPending.color][pt]}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Game over modal */}
            {gameOverState && (
                <div style={{
                    position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(0,0,0,0.75)', zIndex: 20,
                }}>
                    <div style={{
                        background: 'rgba(10,20,35,0.97)', borderRadius: 24, padding: '52px 72px',
                        border: '2px solid #00E5FF', textAlign: 'center',
                        boxShadow: '0 0 80px rgba(0,229,255,0.5)', color: '#fff',
                        fontFamily: "'Segoe UI', sans-serif",
                    }}>
                        <div style={{ fontSize: 72, marginBottom: 16 }}>{gameOverState.winner === 'Draw' ? '🤝' : '🏆'}</div>
                        <h2 style={{ margin: '0 0 8px', fontSize: '2.2rem' }}>
                            {gameOverState.winner === 'Draw' ? 'Draw!' : `${gameOverState.winner} Wins!`}
                        </h2>
                        <p style={{ color: '#aaa', margin: '0 0 36px', fontSize: 16 }}>{gameOverState.reason}</p>
                        <button onClick={() => {
                            boardRef.current = createInitialBoard();
                            currentTurnRef.current = 'white';
                            selectedRef.current = null; validMovesRef.current = [];
                            gameOverRef.current = null; epRef.current = null;
                            lastMoveRef.current = null; dragRef.current = null;
                            capturedRef.current = { white: [], black: [] };
                            moveHistRef.current = [];
                            setGameOverState(null);
                        }} style={{
                            padding: '14px 40px', fontSize: '1.1rem',
                            background: 'linear-gradient(135deg, #00BCD4, #0097A7)',
                            color: '#000', border: 'none', borderRadius: 30,
                            cursor: 'pointer', fontWeight: 800,
                            boxShadow: '0 4px 20px rgba(0,188,212,0.4)',
                        }}>
                            ▶ Play Again
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
