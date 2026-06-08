import { Board, PieceColor, Position, getLegalMoves, applyMove, getGameResult, PieceType } from './ChessLogic';

const PIECE_VALUES: Record<PieceType, number> = {
    pawn: 10,
    knight: 30,
    bishop: 30,
    rook: 50,
    queen: 90,
    king: 900
};

// Evaluate the board from the perspective of the given color
export function evaluateBoard(board: Board, color: PieceColor): number {
    let score = 0;

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const piece = board[r][c];
            if (piece) {
                const value = PIECE_VALUES[piece.type];
                if (piece.color === color) {
                    score += value;
                    // Simple positional bonus for controlling center
                    if (r >= 3 && r <= 4 && c >= 3 && c <= 4) score += 1; 
                } else {
                    score -= value;
                    if (r >= 3 && r <= 4 && c >= 3 && c <= 4) score -= 1;
                }
            }
        }
    }
    return score;
}

export function getBestMove(board: Board, color: PieceColor, ep: Position | null, depth: number = 3): { from: Position, to: Position } | null {
    let bestScore = -Infinity;
    let bestMove: { from: Position, to: Position } | null = null;
    
    // Get all our legal moves
    const allMoves: { from: Position, to: Position }[] = [];
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const piece = board[r][c];
            if (piece && piece.color === color) {
                const pos = { row: r, col: c };
                const moves = getLegalMoves(board, pos, ep);
                for (const to of moves) {
                    allMoves.push({ from: pos, to });
                }
            }
        }
    }

    if (allMoves.length === 0) return null;

    // Shuffle moves slightly to add variety when scores are equal
    allMoves.sort(() => Math.random() - 0.5);

    for (const move of allMoves) {
        const { board: nextBoard, newEp } = applyMove(board, move.from, move.to, ep);
        const opponentColor = color === 'white' ? 'black' : 'white';
        const score = minimax(nextBoard, depth - 1, -Infinity, Infinity, false, color, opponentColor, newEp);
        
        if (score > bestScore) {
            bestScore = score;
            bestMove = move;
        }
    }

    // Fallback if somehow no move gets a positive score or it gets mated
    if (!bestMove) bestMove = allMoves[0];

    return bestMove;
}

function minimax(
    board: Board, 
    depth: number, 
    alpha: number, 
    beta: number, 
    isMaximizing: boolean, 
    aiColor: PieceColor, 
    opponentColor: PieceColor,
    ep: Position | null
): number {
    const currentTurn = isMaximizing ? aiColor : opponentColor;
    const result = getGameResult(board, currentTurn, ep);
    
    // Base cases
    if (result) {
        if (result.winner === 'Draw') return 0;
        if (result.winner.toLowerCase() === aiColor) return 9999 + depth; // prefer faster mate
        else return -9999 - depth;
    }
    
    if (depth === 0) {
        return evaluateBoard(board, aiColor);
    }

    const allMoves: { from: Position, to: Position }[] = [];
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const piece = board[r][c];
            if (piece && piece.color === currentTurn) {
                const pos = { row: r, col: c };
                const moves = getLegalMoves(board, pos, ep);
                for (const to of moves) {
                    allMoves.push({ from: pos, to });
                }
            }
        }
    }

    if (isMaximizing) {
        let maxScore = -Infinity;
        for (const move of allMoves) {
            const { board: nextBoard, newEp } = applyMove(board, move.from, move.to, ep);
            const score = minimax(nextBoard, depth - 1, alpha, beta, false, aiColor, opponentColor, newEp);
            maxScore = Math.max(maxScore, score);
            alpha = Math.max(alpha, score);
            if (beta <= alpha) break; // Beta cutoff
        }
        return maxScore;
    } else {
        let minScore = Infinity;
        for (const move of allMoves) {
            const { board: nextBoard, newEp } = applyMove(board, move.from, move.to, ep);
            const score = minimax(nextBoard, depth - 1, alpha, beta, true, aiColor, opponentColor, newEp);
            minScore = Math.min(minScore, score);
            beta = Math.min(beta, score);
            if (beta <= alpha) break; // Alpha cutoff
        }
        return minScore;
    }
}
