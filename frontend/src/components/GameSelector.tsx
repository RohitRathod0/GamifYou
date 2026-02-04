
import { AirHockey } from '@/games/AirHockey';
import { BalloonPop } from '@/games/BaloonPop';
import { LaserDodger } from '@/games/LaserDodger';
import { Pictionary } from '@/games/Pictionary';
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
                    playerId={playerId}
                    gameState={gameState}
                    onStateUpdate={onStateUpdate}
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
        case GAMES.LASER_DODGER:
            return (
                <LaserDodger
                    trackingData={trackingData}
                    playerId={playerId}
                    gameState={gameState}
                    onStateUpdate={onStateUpdate}
                />
            );
        case GAMES.PICTIONARY:
            return (
                <Pictionary
                    trackingData={trackingData}
                    playerId={playerId}
                    gameState={gameState}
                    onStateUpdate={onStateUpdate}
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
