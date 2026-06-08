// ChessLogic.ts — Pure chess rules, no React

export type PieceColor = 'white' | 'black';
export type PieceType = 'king' | 'queen' | 'rook' | 'bishop' | 'knight' | 'pawn';

export interface Piece { type: PieceType; color: PieceColor; }
export type Square = Piece | null;
export type Board = Square[][];
export interface Position { row: number; col: number; }
export interface Move { from: Position; to: Position; promotion?: PieceType; }
export interface MoveRecord { move: Move; captured: Piece | null; board: Board; }

export const PIECE_UNICODE: Record<PieceColor, Record<PieceType, string>> = {
    white: { king: '♔', queen: '♕', rook: '♖', bishop: '♗', knight: '♘', pawn: '♙' },
    black: { king: '♚', queen: '♛', rook: '♜', bishop: '♝', knight: '♞', pawn: '♟' },
};

// ── Initial board ─────────────────────────────────────────────────────────────
export function createInitialBoard(): Board {
    const b: Board = Array(8).fill(null).map(() => Array(8).fill(null));
    const back: PieceType[] = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];
    back.forEach((t, c) => {
        b[0][c] = { type: t, color: 'black' };
        b[1][c] = { type: 'pawn', color: 'black' };
        b[7][c] = { type: t, color: 'white' };
        b[6][c] = { type: 'pawn', color: 'white' };
    });
    return b;
}

export function cloneBoard(b: Board): Board { return b.map(r => [...r]); }

const inBounds = (r: number, c: number) => r >= 0 && r < 8 && c >= 0 && c < 8;

// ── Raw moves (no check filtering) ───────────────────────────────────────────
export function getRawMoves(board: Board, pos: Position, ep: Position | null): Position[] {
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
}

export function isInCheck(board: Board, color: PieceColor): boolean {
    let kp: Position | null = null;
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++)
        if (board[r][c]?.type === 'king' && board[r][c]?.color === color) kp = { row: r, col: c };
    if (!kp) return false;
    const opp = color === 'white' ? 'black' : 'white';
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++)
        if (board[r][c]?.color === opp)
            if (getRawMoves(board, { row: r, col: c }, null).some(m => m.row === kp!.row && m.col === kp!.col))
                return true;
    return false;
}

export function getLegalMoves(board: Board, pos: Position, ep: Position | null): Position[] {
    return getRawMoves(board, pos, ep).filter(move => {
        const nb = cloneBoard(board);
        nb[move.row][move.col] = nb[pos.row][pos.col];
        nb[pos.row][pos.col] = null;
        return !isInCheck(nb, board[pos.row][pos.col]!.color);
    });
}

export function hasAnyLegalMoves(board: Board, color: PieceColor, ep: Position | null): boolean {
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++)
        if (board[r][c]?.color === color && getLegalMoves(board, { row: r, col: c }, ep).length > 0)
            return true;
    return false;
}

// ── Apply a move, returns new board + new en passant target ──────────────────
export function applyMove(board: Board, from: Position, to: Position, ep: Position | null): {
    board: Board;
    newEp: Position | null;
    captured: Piece | null;
    isPromotion: boolean;
} {
    const nb = cloneBoard(board);
    const mp = nb[from.row][from.col]!;
    let captured = nb[to.row][to.col];

    // En passant capture
    if (mp.type === 'pawn' && ep?.row === to.row && ep?.col === to.col) {
        const captureRow = mp.color === 'white' ? to.row + 1 : to.row - 1;
        captured = nb[captureRow][to.col];
        nb[captureRow][to.col] = null;
    }

    nb[to.row][to.col] = mp;
    nb[from.row][from.col] = null;

    const newEp = mp.type === 'pawn' && Math.abs(to.row - from.row) === 2
        ? { row: (to.row + from.row) / 2, col: to.col } : null;

    const isPromotion = mp.type === 'pawn' && (to.row === 0 || to.row === 7);

    return { board: nb, newEp, captured, isPromotion };
}

// ── Check game end ────────────────────────────────────────────────────────────
export function getGameResult(board: Board, currentTurn: PieceColor, ep: Position | null): {
    over: boolean; winner: string; reason: string;
} | null {
    if (!hasAnyLegalMoves(board, currentTurn, ep)) {
        if (isInCheck(board, currentTurn)) {
            const winner = currentTurn === 'white' ? 'Black' : 'White';
            return { over: true, winner, reason: 'Checkmate' };
        }
        return { over: true, winner: 'Draw', reason: 'Stalemate' };
    }
    return null;
}
