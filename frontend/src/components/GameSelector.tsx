import React from 'react';
import { AirHockey } from '@/games/AirHockey';
import { BalloonPop } from '@/games/BaloonPop';
import { ARChessGame } from '@/games/ARChessGame';
import { FacePuzzle } from '@/games/FacePuzzle';
import { GAMES } from '@/utils/constants';
import { HandTrackingData } from '@/hooks/useHandTracking';

interface GameSelectorProps {
    game: string;
    trackingData?: HandTrackingData;
    playerId?: string;
    gameState?: any;
    onStateUpdate?: (state: any) => void;
}

export const GameSelector: React.FC<GameSelectorProps> = ({
    game,
    trackingData = { landmarks: [], handedness: [] },
    playerId = '',
    gameState = {},
    onStateUpdate = () => { }
}) => {
    switch (game) {
        case GAMES.AIR_HOCKEY:
            return (
                <AirHockey
                    trackingData={trackingData}
                />
            );
        case GAMES.BALLOON_POP:
            return (
                <BalloonPop
                    trackingData={trackingData}
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
                    playerId={playerId}
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
