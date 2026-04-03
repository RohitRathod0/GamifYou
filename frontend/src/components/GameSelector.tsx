import React from 'react';
import { AirHockey } from '@/games/AirHockey';
import { BalloonPop } from '@/games/BalloonPop';
import { ARChessGame } from '@/games/Chess/ARChessGame';
import { FacePuzzle } from '@/games/FacePuzzle';
import { ScribbleDraw } from '@/games/ScribbleDraw';
import { GAMES } from '@/utils/constants';
import { HandTrackingData } from '@/hooks/useHandTracking';

import { GameState } from '@/types';

interface GameSelectorProps {
    game: string;
    trackingData?: HandTrackingData;
    trackingDataRef?: React.MutableRefObject<HandTrackingData>;
    playerId?: string;
    gameState?: GameState;
    onStateUpdate?: (state: Partial<GameState>) => void;
    sendMessage?: (type: string, data: Record<string, unknown>) => void;
}

export const GameSelector: React.FC<GameSelectorProps> = ({
    game,
    trackingData = { landmarks: [], handedness: [] },
    trackingDataRef,
    playerId = '',
    gameState = {},
    onStateUpdate = () => { },
    sendMessage = () => { }
}) => {
    switch (game) {
        case GAMES.AIR_HOCKEY:
            return (
                <AirHockey
                    trackingData={trackingData}
                    trackingDataRef={trackingDataRef}
                />
            );
        case GAMES.BALLOON_POP:
            return (
                <BalloonPop
                    trackingData={trackingData}
                    trackingDataRef={trackingDataRef}
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
                />
            );
        case GAMES.FACE_PUZZLE:
            return (
                <FacePuzzle
                    trackingData={trackingData}
                    trackingDataRef={trackingDataRef}
                    playerId={playerId}
                />
            );
        case 'scribble':
            return (
                <ScribbleDraw
                    trackingData={trackingData}
                    trackingDataRef={trackingDataRef}
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
