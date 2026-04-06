import React from 'react';
import { AirHockey } from '@/games/AirHockey';
import { BalloonPop } from '@/games/BalloonPop';
import { ARChessGame } from '@/games/Chess/ARChessGame';
import { FacePuzzle } from '@/games/FacePuzzle';
import { ScribbleDraw } from '@/games/ScribbleDraw';
import { GAMES } from '@/utils/constants';
import { GameState } from '@/types';

interface GameSelectorProps {
    game: string;
    playerId?: string;
    gameState?: GameState;
    onStateUpdate?: (state: Partial<GameState>) => void;
    /** Shared WebSocket sender — passed through to whichever game needs it */
    sendMessage?: (type: string, data: any) => void;
    /** Shared camera+mic stream — forwarded to games so they never
     *  call getUserMedia a second time (fixes camera-black + mic-silent bugs) */
    localStream?: MediaStream | null;
}

export const GameSelector: React.FC<GameSelectorProps> = ({
    game,
    playerId = '',
    gameState = {},
    onStateUpdate = () => { },
    sendMessage = () => { },
    localStream,
}) => {
    switch (game) {
        case GAMES.AIR_HOCKEY:
            return (
                <AirHockey localStream={localStream} />
            );
        case GAMES.BALLOON_POP:
            return (
                <BalloonPop
                    localStream={localStream}
                    playerId={playerId}
                    gameState={gameState}
                    onStateUpdate={onStateUpdate}
                />
            );
        case GAMES.CHESS:
            return (
                <ARChessGame
                    playerId={playerId}
                    gameState={gameState}
                    onStateUpdate={onStateUpdate}
                    sendMessage={sendMessage}
                    localStream={localStream}
                />
            );
        case GAMES.FACE_PUZZLE:
            return (
                <FacePuzzle
                    localStream={localStream}
                    playerId={playerId}
                />
            );
        case 'scribble':
            return (
                <ScribbleDraw
                    localStream={localStream}
                    playerId={playerId}
                    sendMessage={sendMessage}
                />
            );
        default:
            return (
                <div style={{ padding: '40px', textAlign: 'center' }}>
                    <h2>Game not found</h2>
                    <p>The selected game "{game}" is not available.</p>
                </div>
            );
    }
};
