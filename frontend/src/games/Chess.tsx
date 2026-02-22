import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Hands, Results } from '@mediapipe/hands';
import { Camera } from '@mediapipe/camera_utils';
import { WS_BASE_URL } from '@/utils/constants';

// ─── Types ────────────────────────────────────────────────────────────────────
type PieceColor = 'white' | 'black';
type PieceType = 'king' | 'queen' | 'rook' | 'bishop' | 'knight' | 'pawn';
interface Piece { type: PieceType; color: PieceColor; }
type Square = Piece | null;
type Board = Square[][];
interface Position { row: number; col: number; }
interface HandLandmark { x: number; y: number; z: number; }
interface ChessProps { playerId: string; gameState?: any; onStateUpdate?: (s: any) => void; }

// ─── Pieces ───────────────────────────────────────────────────────────────────
const PIECE_UNICODE: Record<PieceColor, Record<PieceType, string>> = {
    white: { king: '♔', queen: '♕', rook: '♖', bishop: '♗', knight: '♘', pawn: '♙' },
    black: { king: '♚', queen: '♛', rook: '♜', bishop: '♝', knight: '♞', pawn: '♟' },
};

// ─── Board Init ───────────────────────────────────────────────────────────────
const createInitialBoard = (): Board => {
    const b: Board = Array(8).fill(null).map(() => Array(8).fill(null));
    const back: PieceType[] = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];
    back.forEach((t, c) => {
        b[0][c] = { type: t, color: 'black' };
        b[1][c] = { type: 'pawn', color: 'black' };
        b[7][c] = { type: t, color: 'white' };
        b[6][c] = { type: 'pawn', color: 'white' };
    });
    return b;
};

// ─── Move Logic ───────────────────────────────────────────────────────────────
const inBounds = (r: number, c: number) => r >= 0 && r < 8 && c >= 0 && c < 8;

const getRawMoves = (board: Board, pos: Position, ep: Position | null): Position[] => {
    const piece = board[pos.row][pos.col];
    if (!piece) return [];
    const { type, color } = piece;
    const opp = color === 'white' ? 'black' : 'white';
    const moves: Position[] = [];

    const slide = (dr: number, dc: number) => {
        let r = pos.row + dr, c = pos.col + dc;
        while (inBounds(r, c)) {
            const t = board[r][c];
            if (t) { if (t.color !== color) moves.push({ row: r, col: c }); break; }
            moves.push({ row: r, col: c });
            r += dr; c += dc;
        }
    };

    switch (type) {
        case 'pawn': {
            const dir = color === 'white' ? -1 : 1;
            const start = color === 'white' ? 6 : 1;
            if (inBounds(pos.row + dir, pos.col) && !board[pos.row + dir][pos.col]) {
                moves.push({ row: pos.row + dir, col: pos.col });
                if (pos.row === start && !board[pos.row + 2 * dir][pos.col])
                    moves.push({ row: pos.row + 2 * dir, col: pos.col });
            }
            [-1, 1].forEach(dc => {
                const r = pos.row + dir, c = pos.col + dc;
                if (inBounds(r, c)) {
                    if (board[r][c]?.color === opp) moves.push({ row: r, col: c });
                    if (ep?.row === r && ep?.col === c) moves.push({ row: r, col: c });
                }
            });
            break;
        }
        case 'knight':
            [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]].forEach(([dr, dc]) => {
                const r = pos.row + dr!, c = pos.col + dc!;
                if (inBounds(r, c) && board[r][c]?.color !== color) moves.push({ row: r, col: c });
            });
            break;
        case 'bishop': [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([dr, dc]) => slide(dr!, dc!)); break;
        case 'rook': [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(([dr, dc]) => slide(dr!, dc!)); break;
        case 'queen': [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]].forEach(([dr, dc]) => slide(dr!, dc!)); break;
        case 'king':
            [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]].forEach(([dr, dc]) => {
                const r = pos.row + dr!, c = pos.col + dc!;
                if (inBounds(r, c) && board[r][c]?.color !== color) moves.push({ row: r, col: c });
            });
            break;
    }
    return moves;
};

const isInCheck = (board: Board, color: PieceColor): boolean => {
    let kp: Position | null = null;
    for (let r = 0; r < 8; r++)
        for (let c = 0; c < 8; c++)
            if (board[r][c]?.type === 'king' && board[r][c]?.color === color)
                kp = { row: r, col: c };
    if (!kp) return false;
    const opp = color === 'white' ? 'black' : 'white';
    for (let r = 0; r < 8; r++)
        for (let c = 0; c < 8; c++)
            if (board[r][c]?.color === opp)
                if (getRawMoves(board, { row: r, col: c }, null).some(m => m.row === kp!.row && m.col === kp!.col))
                    return true;
    return false;
};

const getLegalMoves = (board: Board, pos: Position, ep: Position | null): Position[] =>
    getRawMoves(board, pos, ep).filter(move => {
        const nb = board.map(r => [...r]);
        nb[move.row][move.col] = nb[pos.row][pos.col];
        nb[pos.row][pos.col] = null;
        return !isInCheck(nb, board[pos.row][pos.col]!.color);
    });

const hasAnyLegal = (board: Board, color: PieceColor, ep: Position | null): boolean => {
    for (let r = 0; r < 8; r++)
        for (let c = 0; c < 8; c++)
            if (board[r][c]?.color === color && getLegalMoves(board, { row: r, col: c }, ep).length > 0)
                return true;
    return false;
};

// ─── Gesture helpers ──────────────────────────────────────────────────────────
const isPinching = (landmarks: HandLandmark[]): boolean => {
    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    const distance = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y);
    return distance < 0.05; // tune between 0.04-0.07
};

// ─── Component ────────────────────────────────────────────────────────────────
export const Chess: React.FC<ChessProps> = ({ playerId, gameState, onStateUpdate }) => {
    // Game state
    const [board, setBoard] = useState<Board>(createInitialBoard());
    const [selected, setSelected] = useState<Position | null>(null);
    const [validMoves, setValidMoves] = useState<Position[]>([]);
    const [currentTurn, setCurrentTurn] = useState<PieceColor>('white');
    const [myColor, setMyColor] = useState<PieceColor>('white');
    const [ep, setEp] = useState<Position | null>(null);
    const [lastMove, setLastMove] = useState<{ from: Position; to: Position } | null>(null);
    const [gameOver, setGameOver] = useState<{ winner: string; reason: string } | null>(null);
    const [promotion, setPromotion] = useState<{ pos: Position; color: PieceColor } | null>(null);
    const [status, setStatus] = useState('');

    // Gesture state
    const [handReady, setHandReady] = useState(false);
    const [hovered, setHovered] = useState<Position | null>(null);
    const [pinching, setPinching] = useState(false);
    const [fingerScreen, setFingerScreen] = useState<{ x: number; y: number } | null>(null);
    const [gestureMode, setGestureMode] = useState(true);
    const [camError, setCamError] = useState(false);
    const [debugMode, setDebugMode] = useState(false);

    // Refs
    const previewVideoRef = useRef<HTMLVideoElement>(null);
    const hiddenVideoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null); // hand skeleton overlay
    const boardRef = useRef<HTMLDivElement>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const handsRef = useRef<Hands | null>(null);
    const camRef = useRef<Camera | null>(null);
    const wasPinchingRef = useRef(false);
    const pinchCoolRef = useRef(false);
    const stateRef = useRef({ board, selected, validMoves, currentTurn, myColor, ep, gameOver });

    useEffect(() => { stateRef.current = { board, selected, validMoves, currentTurn, myColor, ep, gameOver }; },
        [board, selected, validMoves, currentTurn, myColor, ep, gameOver]);

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
                    if (s?.chessBoard) setBoard(s.chessBoard);
                    if (s?.currentTurn) setCurrentTurn(s.currentTurn);
                    if (s?.enPassantTarget !== undefined) setEp(s.enPassantTarget);
                    if (s?.lastMove !== undefined) setLastMove(s.lastMove);
                    if (s?.gameOver) setGameOver(s.gameOver);
                }
                if (msg.type === 'chess_color_assign') setMyColor(msg.data.color);
            } catch { }
        };
        ws.onerror = () => setMyColor(gameState?.player1_id === playerId ? 'white' : 'black');
        return () => ws.close();
    }, [roomCode, playerId, gameState]);

    // ── Status ────────────────────────────────────────────────────────────────
    useEffect(() => {
        if (gameOver) return;
        const inChk = isInCheck(board, currentTurn);
        if (!hasAnyLegal(board, currentTurn, ep)) {
            const w = inChk ? (currentTurn === 'white' ? 'Black' : 'White') : 'Draw';
            setGameOver({ winner: w, reason: inChk ? 'Checkmate' : 'Stalemate' });
            return;
        }
        if (myColor === currentTurn)
            setStatus(inChk ? `⚠️ CHECK! Your turn` : `Your turn — point & pinch`);
        else
            setStatus(`Opponent's turn...`);
    }, [board, currentTurn, myColor, ep, gameOver]);

    // ── Execute Move ──────────────────────────────────────────────────────────
    const doMove = useCallback((from: Position, to: Position) => {
        const { board, ep, currentTurn } = stateRef.current;
        const nb = board.map(r => [...r]);
        const mp = nb[from.row][from.col]!;

        if (mp.type === 'pawn' && ep?.row === to.row && ep?.col === to.col)
            nb[currentTurn === 'white' ? to.row + 1 : to.row - 1][to.col] = null;

        nb[to.row][to.col] = mp;
        nb[from.row][from.col] = null;

        if (mp.type === 'pawn' && (to.row === 0 || to.row === 7)) {
            setBoard(nb); setSelected(null); setValidMoves([]);
            setPromotion({ pos: to, color: mp.color }); return;
        }

        const newEp = mp.type === 'pawn' && Math.abs(to.row - from.row) === 2
            ? { row: (to.row + from.row) / 2, col: to.col } : null;
        const next: PieceColor = currentTurn === 'white' ? 'black' : 'white';
        const mv = { from, to };

        setBoard(nb); setCurrentTurn(next); setEp(newEp); setLastMove(mv);
        setSelected(null); setValidMoves([]);

        const ns = { chessBoard: nb, currentTurn: next, enPassantTarget: newEp, lastMove: mv };
        onStateUpdate?.(ns);
        wsRef.current?.send(JSON.stringify({ type: 'game_state_update', data: { state: ns } }));
    }, [onStateUpdate]);

    // ── Square Interaction ────────────────────────────────────────────────────
    const interact = useCallback((row: number, col: number) => {
        const { board, selected, validMoves, currentTurn, myColor, ep, gameOver } = stateRef.current;
        if (gameOver || myColor !== currentTurn) return;
        const piece = board[row][col];

        if (selected) {
            if (validMoves.some(m => m.row === row && m.col === col)) {
                doMove(selected, { row, col }); return;
            }
            if (piece?.color === myColor) {
                setSelected({ row, col });
                setValidMoves(getLegalMoves(board, { row, col }, ep)); return;
            }
            setSelected(null); setValidMoves([]); return;
        }
        if (piece?.color === myColor) {
            setSelected({ row, col });
            setValidMoves(getLegalMoves(board, { row, col }, ep));
        }
    }, [doMove]);

    // ── Finger → Board Square ─────────────────────────────────────────────────
    const landmarkToBoardSquare = useCallback((landmark: { x: number, y: number }, videoEl: HTMLVideoElement, boardRect: DOMRect): Position | null => {
        // Mirror the X coordinate because the user is facing the camera, 
        // and usually we want the right hand going right to map to the right side
        const screenX = (1 - landmark.x) * videoEl.videoWidth;
        const screenY = landmark.y * videoEl.videoHeight;

        const squareW = boardRect.width / 8;
        const squareH = boardRect.height / 8;

        const rawCol = Math.floor((screenX - boardRect.left) / squareW);
        const rawRow = Math.floor((screenY - boardRect.top) / squareH);

        // Return null if completely outside board bounds with some margin
        if (rawCol < -2 || rawCol > 9 || rawRow < -2 || rawRow > 9) return null;

        const col = Math.max(0, Math.min(7, rawCol));
        const row = Math.max(0, Math.min(7, rawRow));

        const { myColor } = stateRef.current;
        return {
            row: myColor === 'black' ? 7 - row : row,
            col: myColor === 'black' ? 7 - col : col
        };
    }, []);

    // ── Draw Hand on Canvas ───────────────────────────────────────────────────
    const drawHand = (ctx: CanvasRenderingContext2D, lm: HandLandmark[], W: number, H: number, pinch: boolean) => {
        const CONNECTIONS = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [0, 9], [9, 10], [10, 11], [11, 12],
        [0, 13], [13, 14], [14, 15], [15, 16], [0, 17], [17, 18], [18, 19], [19, 20], [5, 9], [9, 13], [13, 17]];
        ctx.globalAlpha = 0.85;
        ctx.strokeStyle = pinch ? '#FF6B35' : '#00E5FF';
        ctx.lineWidth = 2.5;
        CONNECTIONS.forEach(([a, b]) => {
            const la = lm[a], lb = lm[b];
            ctx.beginPath();
            ctx.moveTo((1 - la.x) * W, la.y * H);
            ctx.lineTo((1 - lb.x) * W, lb.y * H);
            ctx.stroke();
        });
        lm.forEach((l, i) => {
            const x = (1 - l.x) * W, y = l.y * H;
            const r = i === 8 ? 12 : i === 4 ? 10 : 5;
            ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fillStyle = i === 8 ? '#FFD700' : i === 4 ? '#FF6B35' : '#00E5FF';
            ctx.globalAlpha = 0.95; ctx.fill();
        });
        ctx.globalAlpha = 1;
    };

    // ── MediaPipe Setup ───────────────────────────────────────────────────────
    useEffect(() => {
        if (!gestureMode) return;

        const hands = new Hands({
            locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`,
        });
        hands.setOptions({ maxNumHands: 2, modelComplexity: 1, minDetectionConfidence: 0.7, minTrackingConfidence: 0.5 });

        hands.onResults((results: Results) => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            if (!results.multiHandLandmarks?.length) {
                setFingerScreen(null); setHovered(null); setPinching(false);
                return;
            }

            const ctx = canvas.getContext('2d')!;
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Use first hand for control
            const lm = results.multiHandLandmarks[0];
            const tip = lm[8]; // index finger tip
            const pinch = isPinching(lm);

            const videoEl = hiddenVideoRef.current;
            const el = boardRef.current;

            let sq: Position | null = null;
            let sx = 0; let sy = 0;

            if (videoEl && el) {
                const boardRect = el.getBoundingClientRect();
                sq = landmarkToBoardSquare(tip, videoEl, boardRect);
                sx = (1 - tip.x) * videoEl.videoWidth;
                sy = tip.y * videoEl.videoHeight;
                setFingerScreen({ x: sx, y: sy });
            }

            setHovered(sq);
            setPinching(pinch);

            drawHand(ctx, lm, canvas.width, canvas.height, pinch);

            // State machine for picking up and moving pieces
            const wasPinching = wasPinchingRef.current;

            if (pinch && !wasPinching && sq) {
                if (!pinchCoolRef.current) {
                    interact(sq.row, sq.col);
                    pinchCoolRef.current = true;
                    setTimeout(() => pinchCoolRef.current = false, 500);
                }
            }

            wasPinchingRef.current = pinch;
        });

        handsRef.current = hands;

        if (hiddenVideoRef.current) {
            const cam = new Camera(hiddenVideoRef.current, {
                onFrame: async () => {
                    if (hiddenVideoRef.current && handsRef.current)
                        await handsRef.current.send({ image: hiddenVideoRef.current });
                },
                width: 1280, height: 720,
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
    }, [gestureMode, landmarkToBoardSquare, interact]);

    // ── Promotion ─────────────────────────────────────────────────────────────
    const handlePromotion = (pt: PieceType) => {
        if (!promotion) return;
        const nb = board.map(r => [...r]);
        nb[promotion.pos.row][promotion.pos.col] = { type: pt, color: promotion.color };
        const next: PieceColor = currentTurn === 'white' ? 'black' : 'white';
        setBoard(nb); setCurrentTurn(next); setPromotion(null);
        const ns = { chessBoard: nb, currentTurn: next, enPassantTarget: null, lastMove };
        onStateUpdate?.(ns);
        wsRef.current?.send(JSON.stringify({ type: 'game_state_update', data: { state: ns } }));
    };

    // ── Render helpers ────────────────────────────────────────────────────────
    const rows = myColor === 'black' ? [...Array(8).keys()].reverse() : [...Array(8).keys()];
    const cols = myColor === 'black' ? [...Array(8).keys()].reverse() : [...Array(8).keys()];
    const colLabels = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const rowLabels = ['8', '7', '6', '5', '4', '3', '2', '1'];

    const isHov = (r: number, c: number) => hovered?.row === r && hovered?.col === c;
    const isSel = (r: number, c: number) => selected?.row === r && selected?.col === c;
    const isVM = (r: number, c: number) => validMoves.some(m => m.row === r && m.col === c);
    // Sync the hidden stream to the preview element
    useEffect(() => {
        if (hiddenVideoRef.current && previewVideoRef.current && !previewVideoRef.current.srcObject) {
            const syncInterval = setInterval(() => {
                if (hiddenVideoRef.current?.srcObject) {
                    previewVideoRef.current!.srcObject = hiddenVideoRef.current.srcObject;
                    clearInterval(syncInterval);
                }
            }, 500);
        }
    }, []);

    const isLM = (r: number, c: number) => lastMove && ((lastMove.from.row === r && lastMove.from.col === c) || (lastMove.to.row === r && lastMove.to.col === c));

    // Square size: fill viewport height minus header (~100px), keep 8 squares
    const sqSize = Math.floor((Math.min(window.innerHeight - 120, window.innerWidth - 60)) / 8);

    return (
        <div style={{
            position: 'fixed', inset: 0,
            background: '#0a0a0a',
            overflow: 'hidden',
            fontFamily: "'Segoe UI', sans-serif",
        }}>
            {/* ── HIDDEN RAW VIDEO FEED for MediaPipe Processing ── */}
            <video
                ref={hiddenVideoRef}
                autoPlay playsInline muted
                style={{ display: 'none' }}
            />

            {/* ── PREVIEW VIDEO FEED — small and styled PIP ── */}
            <video
                ref={previewVideoRef}
                autoPlay playsInline muted
                style={{
                    position: 'absolute', top: 70, right: 20,
                    width: '320px', height: '180px',
                    objectFit: 'cover',
                    transform: 'scaleX(-1)', // mirror
                    opacity: gestureMode ? 1 : 0,
                    border: '2px solid rgba(0, 188, 212, 0.5)',
                    borderRadius: '12px',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                    transition: 'opacity 0.5s',
                    zIndex: 2,
                }}
            />

            {/* ── HAND SKELETON OVERLAY ── */}
            <canvas
                ref={canvasRef}
                width={1280} height={720}
                style={{
                    position: 'absolute', top: 70, right: 20,
                    width: '320px', height: '180px',
                    pointerEvents: 'none',
                    zIndex: 3,
                    display: gestureMode ? 'block' : 'none',
                }}
            />

            {/* ── DARK VIGNETTE so board is readable ── */}
            {gestureMode && (
                <div style={{
                    position: 'absolute', inset: 0,
                    background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.55) 100%)',
                    zIndex: 3, pointerEvents: 'none',
                }} />
            )}

            {/* ── HEADER BAR ── */}
            <div style={{
                position: 'absolute', top: 0, left: 0, right: 0,
                zIndex: 10,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 20px',
                background: 'rgba(0,0,0,0.55)',
                backdropFilter: 'blur(12px)',
                borderBottom: '1px solid rgba(0,188,212,0.3)',
            }}>
                {/* Left: title + color */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <span style={{ fontSize: '1.5rem', fontWeight: 800, color: '#fff', letterSpacing: 2 }}>♟ AR Chess</span>
                    <span style={{
                        padding: '3px 12px', borderRadius: '20px', fontSize: '13px', fontWeight: 600,
                        background: myColor === 'white' ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.8)',
                        color: myColor === 'white' ? '#000' : '#fff',
                        border: '1px solid rgba(255,255,255,0.3)',
                    }}>
                        {myColor === 'white' ? '⬜' : '⬛'} You ({myColor})
                    </span>
                </div>

                {/* Center: status */}
                <div style={{
                    padding: '6px 18px', borderRadius: '20px', fontSize: '14px', fontWeight: 700,
                    background: currentTurn === myColor ? 'rgba(0,188,212,0.3)' : 'rgba(255,255,255,0.08)',
                    border: `1.5px solid ${currentTurn === myColor ? '#00BCD4' : 'rgba(255,255,255,0.15)'}`,
                    color: '#fff', backdropFilter: 'blur(8px)',
                }}>
                    {!handReady && gestureMode ? '⏳ Loading camera...' : status}
                </div>

                {/* Right: mode toggle + hints */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {gestureMode && handReady && (
                        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', textAlign: 'right', lineHeight: 1.6 }}>
                            🟡 Finger = cursor &nbsp;|&nbsp; 🤌 Pinch = select &nbsp;|&nbsp; ⏱ Hover = auto
                        </div>
                    )}
                    <button
                        onClick={() => setDebugMode(d => !d)}
                        style={{
                            padding: '6px 14px', borderRadius: '20px', border: 'none', cursor: 'pointer',
                            background: debugMode ? '#F44336' : 'rgba(255,255,255,0.15)',
                            color: '#fff', fontSize: '13px', fontWeight: 700, marginRight: 8
                        }}
                    >
                        🐛 Debug
                    </button>
                    <button
                        onClick={() => setGestureMode(g => !g)}
                        style={{
                            padding: '6px 14px', borderRadius: '20px', border: 'none', cursor: 'pointer',
                            background: gestureMode ? '#00BCD4' : 'rgba(255,255,255,0.15)',
                            color: '#fff', fontSize: '13px', fontWeight: 700,
                        }}
                    >
                        {gestureMode ? '👆 Gesture ON' : '🖱 Click Mode'}
                    </button>
                </div>
            </div>

            {/* ── CHESS BOARD — centered, overlaid on camera ── */}
            <div style={{
                position: 'absolute',
                top: '50%', left: '50%',
                transform: 'translate(-50%, -50%) translateY(30px)', // slight down to clear header
                zIndex: 5,
            }}>
                {/* Col labels top */}
                <div style={{ display: 'flex', marginLeft: `${sqSize * 0.4}px`, marginBottom: '2px' }}>
                    {cols.map(c => (
                        <div key={c} style={{ width: sqSize, textAlign: 'center', fontSize: '11px', color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>
                            {colLabels[c]}
                        </div>
                    ))}
                </div>

                <div style={{ display: 'flex' }}>
                    {/* Row labels left */}
                    <div style={{ display: 'flex', flexDirection: 'column', marginRight: '2px' }}>
                        {rows.map(r => (
                            <div key={r} style={{ height: sqSize, width: sqSize * 0.35, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>
                                {rowLabels[r]}
                            </div>
                        ))}
                    </div>

                    {/* THE BOARD */}
                    <div
                        ref={boardRef}
                        style={{
                            display: 'grid',
                            gridTemplateColumns: `repeat(8, ${sqSize}px)`,
                            gridTemplateRows: `repeat(8, ${sqSize}px)`,
                            border: '3px solid rgba(0,188,212,0.8)',
                            borderRadius: '6px',
                            boxShadow: '0 0 60px rgba(0,188,212,0.4), 0 0 120px rgba(0,0,0,0.8)',
                            overflow: 'hidden',
                        }}
                    >
                        {rows.map(r =>
                            cols.map(c => {
                                const light = (r + c) % 2 === 0;
                                const piece = board[r][c];
                                const hov = isHov(r, c);
                                const sel = isSel(r, c);
                                const vm = isVM(r, c);
                                const lm = isLM(r, c);
                                const capture = vm && piece && piece.color !== myColor;

                                // Square color
                                let bg = light
                                    ? 'rgba(232,244,248,0.82)'
                                    : 'rgba(0,188,212,0.75)';
                                if (lm) bg = light ? 'rgba(246,246,105,0.85)' : 'rgba(186,202,43,0.85)';
                                if (sel) bg = 'rgba(100,220,100,0.85)';
                                if (hov && !sel) bg = light ? 'rgba(255,230,100,0.7)' : 'rgba(255,200,50,0.7)';

                                return (
                                    <div
                                        key={`${r}-${c}`}
                                        onClick={!gestureMode ? () => interact(r, c) : undefined}
                                        style={{
                                            width: sqSize, height: sqSize,
                                            background: bg,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            position: 'relative',
                                            cursor: !gestureMode ? 'pointer' : 'default',
                                            transition: 'background 0.1s',
                                        }}
                                    >
                                        {/* Interaction Hover Glow */}
                                        {hov && gestureMode && (
                                            <div style={{
                                                position: 'absolute', inset: 0,
                                                boxShadow: 'inset 0 0 20px rgba(0, 255, 255, 0.7)',
                                                pointerEvents: 'none',
                                            }} />
                                        )}

                                        {/* Valid move dot */}
                                        {vm && !capture && (
                                            <div style={{
                                                position: 'absolute',
                                                width: sqSize * 0.32, height: sqSize * 0.32,
                                                borderRadius: '50%',
                                                background: 'rgba(0,0,0,0.28)',
                                                pointerEvents: 'none',
                                            }} />
                                        )}

                                        {/* Capture ring */}
                                        {capture && (
                                            <div style={{
                                                position: 'absolute', inset: 0,
                                                border: `${sqSize * 0.07}px solid rgba(0,0,0,0.3)`,
                                                borderRadius: '50%', pointerEvents: 'none',
                                            }} />
                                        )}

                                        {/* Hover glow */}
                                        {hov && gestureMode && (
                                            <div style={{
                                                position: 'absolute', inset: 0,
                                                boxShadow: 'inset 0 0 20px rgba(255,215,0,0.7)',
                                                pointerEvents: 'none',
                                            }} />
                                        )}

                                        {/* Piece */}
                                        {piece && (
                                            <span style={{
                                                fontSize: sqSize * 0.68,
                                                lineHeight: 1,
                                                color: piece.color === 'white' ? '#fff' : '#111',
                                                textShadow: piece.color === 'white'
                                                    ? '0 2px 6px rgba(0,0,0,1), 0 0 12px rgba(0,0,0,0.8)'
                                                    : '0 1px 4px rgba(255,255,255,0.4)',
                                                filter: sel ? 'drop-shadow(0 0 12px #4CAF50) drop-shadow(0 0 6px #4CAF50)'
                                                    : hov ? 'drop-shadow(0 0 10px #FFD700)' : 'none',
                                                transition: 'filter 0.15s',
                                                userSelect: 'none',
                                                zIndex: 1,
                                            }}>
                                                {PIECE_UNICODE[piece.color][piece.type]}
                                            </span>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>

                    {/* Row labels right */}
                    <div style={{ display: 'flex', flexDirection: 'column', marginLeft: '2px' }}>
                        {rows.map(r => (
                            <div key={r} style={{ height: sqSize, width: sqSize * 0.35, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>
                                {rowLabels[r]}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Col labels bottom */}
                <div style={{ display: 'flex', marginLeft: `${sqSize * 0.4}px`, marginTop: '2px' }}>
                    {cols.map(c => (
                        <div key={c} style={{ width: sqSize, textAlign: 'center', fontSize: '11px', color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>
                            {colLabels[c]}
                        </div>
                    ))}
                </div>
            </div>

            {/* ── DEBUG OVERLAY ── */}
            {debugMode && hovered && boardRef.current && (
                <div style={{
                    position: 'absolute',
                    top: boardRef.current.getBoundingClientRect().top + (myColor === 'black' ? 7 - hovered.row : hovered.row) * sqSize,
                    left: boardRef.current.getBoundingClientRect().left + (myColor === 'black' ? 7 - hovered.col : hovered.col) * sqSize,
                    width: sqSize, height: sqSize,
                    border: '4px solid cyan',
                    pointerEvents: 'none',
                    zIndex: 100,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
                }}>
                    <div style={{ background: 'rgba(0,0,0,0.8)', color: 'cyan', padding: '2px 6px', borderRadius: 4, fontWeight: 'bold' }}>
                        Row: {hovered.row} Col: {hovered.col}
                    </div>
                    <div style={{ background: 'rgba(0,0,0,0.8)', color: pinching ? 'lime' : 'orange', padding: '2px 6px', borderRadius: 4, fontWeight: 'bold', marginTop: 4 }}>
                        {pinching ? 'PINCHING' : 'OPEN'}
                    </div>
                </div>
            )}

            {/* ── TURN INDICATORS (bottom) ── */}
            <div style={{
                position: 'absolute', bottom: '16px', left: '50%', transform: 'translateX(-50%)',
                zIndex: 10, display: 'flex', gap: '12px',
            }}>
                {(['white', 'black'] as PieceColor[]).map(col => (
                    <div key={col} style={{
                        padding: '6px 18px', borderRadius: '20px', fontWeight: 700, fontSize: '13px',
                        background: currentTurn === col
                            ? (col === 'white' ? 'rgba(255,255,255,0.92)' : 'rgba(0,0,0,0.85)')
                            : 'rgba(255,255,255,0.08)',
                        color: currentTurn === col ? (col === 'white' ? '#000' : '#fff') : 'rgba(255,255,255,0.35)',
                        border: `2px solid ${currentTurn === col ? (col === 'white' ? '#fff' : '#00BCD4') : 'rgba(255,255,255,0.1)'}`,
                        backdropFilter: 'blur(8px)',
                        transition: 'all 0.3s',
                    }}>
                        {col === 'white' ? '⬜' : '⬛'} {col.charAt(0).toUpperCase() + col.slice(1)}
                        {myColor === col && <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.6 }}>(you)</span>}
                    </div>
                ))}
            </div>

            {/* ── FINGER CURSOR DOT ── */}
            {gestureMode && fingerScreen && (
                <div style={{
                    position: 'fixed',
                    left: fingerScreen.x - 14, top: fingerScreen.y - 14,
                    width: 28, height: 28, borderRadius: '50%',
                    background: pinching ? '#FF6B35' : '#FFD700',
                    boxShadow: pinching
                        ? '0 0 0 4px rgba(255,107,53,0.4), 0 0 24px #FF6B35'
                        : '0 0 0 4px rgba(255,215,0,0.4), 0 0 20px #FFD700',
                    pointerEvents: 'none',
                    zIndex: 20,
                    transform: pinching ? 'scale(1.6)' : 'scale(1)',
                    transition: 'transform 0.1s, background 0.1s, box-shadow 0.1s',
                }} />
            )}

            {/* ── CAM ERROR ── */}
            {camError && (
                <div style={{
                    position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
                    zIndex: 30, background: 'rgba(0,0,0,0.85)', borderRadius: 16, padding: '32px 48px',
                    border: '2px solid #f44336', textAlign: 'center', color: '#fff',
                }}>
                    <div style={{ fontSize: 48 }}>📷</div>
                    <h3>Camera Access Required</h3>
                    <p style={{ color: '#aaa' }}>Please allow camera access and refresh the page.</p>
                    <button onClick={() => setGestureMode(false)} style={{
                        padding: '10px 24px', background: '#00BCD4', border: 'none', borderRadius: 20,
                        color: '#000', fontWeight: 700, cursor: 'pointer', marginTop: 8,
                    }}>Use Click Mode Instead</button>
                </div>
            )}

            {/* ── PROMOTION MODAL ── */}
            {promotion && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
                }}>
                    <div style={{
                        background: 'rgba(20,30,45,0.97)', borderRadius: 20, padding: '32px 40px',
                        border: '2px solid #00BCD4', textAlign: 'center',
                        boxShadow: '0 0 60px rgba(0,188,212,0.4)',
                    }}>
                        <h3 style={{ margin: '0 0 8px', color: '#fff' }}>Promote Pawn</h3>
                        <p style={{ color: '#aaa', fontSize: 13, margin: '0 0 20px' }}>Pinch or click to choose</p>
                        <div style={{ display: 'flex', gap: 16 }}>
                            {(['queen', 'rook', 'bishop', 'knight'] as PieceType[]).map(pt => (
                                <button key={pt} onClick={() => handlePromotion(pt)} style={{
                                    fontSize: 52, background: 'rgba(0,188,212,0.15)',
                                    border: '2px solid #00BCD4', borderRadius: 12,
                                    padding: '12px 16px', cursor: 'pointer', color: '#fff',
                                    transition: 'transform 0.15s, background 0.15s',
                                }}
                                    onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.12)'; e.currentTarget.style.background = 'rgba(0,188,212,0.35)'; }}
                                    onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.background = 'rgba(0,188,212,0.15)'; }}>
                                    {PIECE_UNICODE[promotion.color][pt]}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* ── GAME OVER MODAL ── */}
            {gameOver && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
                }}>
                    <div style={{
                        background: 'linear-gradient(135deg,rgba(20,30,50,0.98),rgba(10,20,35,0.98))',
                        borderRadius: 24, padding: '52px 72px',
                        border: '2px solid #00BCD4', textAlign: 'center',
                        boxShadow: '0 0 80px rgba(0,188,212,0.5)',
                        color: '#fff',
                    }}>
                        <div style={{ fontSize: 72, marginBottom: 16 }}>{gameOver.winner === 'Draw' ? '🤝' : '🏆'}</div>
                        <h2 style={{ margin: '0 0 8px', fontSize: '2.2rem' }}>
                            {gameOver.winner === 'Draw' ? 'Draw!' : `${gameOver.winner} Wins!`}
                        </h2>
                        <p style={{ color: '#aaa', margin: '0 0 36px', fontSize: 16 }}>{gameOver.reason}</p>
                        <button onClick={() => {
                            setBoard(createInitialBoard()); setCurrentTurn('white');
                            setSelected(null); setValidMoves([]); setGameOver(null);
                            setEp(null); setLastMove(null);
                        }} style={{
                            padding: '14px 40px', fontSize: '1.1rem',
                            background: 'linear-gradient(135deg,#00BCD4,#0097A7)',
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
