import { Board, PieceColor, Position, PieceType, getLegalMoves, applyMove, getRawMoves } from './ChessLogic';

export interface VoiceMoveResult {
    from: Position;
    to: Position;
}

export const ChessVoiceHelper = {
    cleanText(text: string): string {
        let t = text.toLowerCase();
        const replacements: Record<string, string> = {
            ",": " ", ".": " ", "-": " ", " to ": " ", " takes ": " ", " capture ": " ", " captures ": " ", " move ": " ", " play ": " ",
            "see": "c", "sea": "c", "she": "c", "bee": "b", "be": "b", "me": "b", "we": "b",
            "dee": "d", "the": "d", "deep": "d", "if": "f", "eff": "f", "off": "f", "half": "f",
            "gee": "g", "je": "g", "age": "h", "edge": "h", "each": "h", "eight": "8", "one": "1", "two": "2", "too": "2", "three": "3",
            "four": "4", "for": "4", "five": "5", "six": "6", "seven": "7"
        };
        for (const [k, v] of Object.entries(replacements)) {
            t = t.split(k).join(v);
        }
        // fix spaced out coordinates like "c 2" -> "c2"
        t = t.replace(/\b([a-h])\s+([1-8])\b/g, "$1$2");
        return t;
    },

    parseCoord(coordStr: string): Position | null {
        const match = coordStr.match(/([a-h])([1-8])/);
        if (!match) return null;
        const col = match[1].charCodeAt(0) - 97; // 'a' -> 0
        const row = 8 - parseInt(match[2]);      // '8' -> 0, '1' -> 7
        return { row, col };
    },

    resolveVoiceCommand(rawText: string, board: Board, currentTurn: PieceColor, ep: Position | null): VoiceMoveResult | null {
        const text = this.cleanText(rawText);
        
        // 1. Two explicit coordinates: "move c2 to c3"
        const coordsMatch = text.match(/\b([a-h][1-8])\b/g);
        if (coordsMatch && coordsMatch.length >= 2) {
            return {
                from: this.parseCoord(coordsMatch[0])!,
                to: this.parseCoord(coordsMatch[1])!
            };
        }

        const piecesFound = text.match(/\b(pawn|knight|bishop|rook|queen|king)\b/g);
        const hasFork = text.includes("fork");

        // 2. Tactical command: "fork the rook and king using knight"
        if (hasFork) {
            const targetTypes = new Set<PieceType>();
            if (piecesFound) {
                piecesFound.forEach(p => targetTypes.add(p as PieceType));
            }

            for (let r = 0; r < 8; r++) {
                for (let c = 0; c < 8; c++) {
                    const piece = board[r][c];
                    if (piece && piece.color === currentTurn) {
                        const pos = { row: r, col: c };
                        const moves = getLegalMoves(board, pos, ep);
                        
                        for (const move of moves) {
                            const { board: nb } = applyMove(board, pos, move, ep);
                            const attackedSquares = getRawMoves(nb, move, null);
                            
                            const attackedPieces = attackedSquares
                                .map(sq => nb[sq.row][sq.col])
                                .filter(p => p !== null && p.color !== currentTurn)
                                .map(p => p!.type);
                            
                            if (attackedPieces.length >= 2) {
                                // If they specified what to fork, verify it
                                if (targetTypes.size > 0) {
                                    let matches = 0;
                                    const uniqueAttacked = new Set(attackedPieces);
                                    targetTypes.forEach(tt => {
                                        if (uniqueAttacked.has(tt)) matches++;
                                    });
                                    if (matches >= 2 || (targetTypes.size === 1 && matches >= 1)) {
                                        return { from: pos, to: move };
                                    }
                                } else {
                                    // Found a generic fork
                                    return { from: pos, to: move };
                                }
                            }
                        }
                    }
                }
            }
        }

        // 2.5 Piece captures piece: "knight takes bishop"
        if (piecesFound && piecesFound.length >= 2 && !hasFork && (!coordsMatch || coordsMatch.length === 0)) {
            const actorType = piecesFound[0] as PieceType;
            const targetType = piecesFound[1] as PieceType;
            
            const candidates: { from: Position, to: Position }[] = [];

            for (let r = 0; r < 8; r++) {
                for (let c = 0; c < 8; c++) {
                    const piece = board[r][c];
                    if (piece && piece.color === currentTurn && piece.type === actorType) {
                        const pos = { row: r, col: c };
                        const moves = getLegalMoves(board, pos, ep);
                        
                        for (const move of moves) {
                            let isCapture = false;
                            const targetPiece = board[move.row][move.col];
                            if (targetPiece && targetPiece.color !== currentTurn && targetPiece.type === targetType) {
                                isCapture = true;
                            } else if (actorType === 'pawn' && targetType === 'pawn' && ep && move.row === ep.row && move.col === ep.col) {
                                isCapture = true;
                            }

                            if (isCapture) {
                                candidates.push({ from: pos, to: move });
                            }
                        }
                    }
                }
            }

            if (candidates.length > 0) {
                return { from: candidates[0].from, to: candidates[0].to };
            }
        }

        // 3. Piece to coordinate: "move knight to c6"
        if (coordsMatch && coordsMatch.length === 1 && piecesFound && piecesFound.length > 0) {
            const dest = this.parseCoord(coordsMatch[0])!;
            const actorType = piecesFound[0] as PieceType; // take the first piece mentioned

            const candidates: { from: Position, dist: number }[] = [];

            for (let r = 0; r < 8; r++) {
                for (let c = 0; c < 8; c++) {
                    const piece = board[r][c];
                    if (piece && piece.color === currentTurn && piece.type === actorType) {
                        const pos = { row: r, col: c };
                        const moves = getLegalMoves(board, pos, ep);
                        if (moves.some(m => m.row === dest.row && m.col === dest.col)) {
                            const dist = Math.abs(pos.row - dest.row) + Math.abs(pos.col - dest.col);
                            candidates.push({ from: pos, dist });
                        }
                    }
                }
            }

            if (candidates.length > 0) {
                // Return closest
                candidates.sort((a, b) => a.dist - b.dist);
                return {
                    from: candidates[0].from,
                    to: dest
                };
            }
        }
        
        // 4. One coordinate only without piece, implicitly infer based on what can move there.
        // E.g. "move to c6"
        if (coordsMatch && coordsMatch.length === 1) {
            const dest = this.parseCoord(coordsMatch[0])!;
            const candidates: { from: Position, dist: number }[] = [];

            for (let r = 0; r < 8; r++) {
                for (let c = 0; c < 8; c++) {
                    const piece = board[r][c];
                    if (piece && piece.color === currentTurn) {
                        const pos = { row: r, col: c };
                        const moves = getLegalMoves(board, pos, ep);
                        if (moves.some(m => m.row === dest.row && m.col === dest.col)) {
                            const dist = Math.abs(pos.row - dest.row) + Math.abs(pos.col - dest.col);
                            candidates.push({ from: pos, dist });
                        }
                    }
                }
            }

            if (candidates.length === 1) {
                return { from: candidates[0].from, to: dest };
            } else if (candidates.length > 1) {
                candidates.sort((a, b) => a.dist - b.dist);
                return { from: candidates[0].from, to: dest };
            }
        }

        return null;
    }
};
