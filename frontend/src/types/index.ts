/**
 * src/types/index.ts
 * Global shared types for the GamifYou application
 */

// Basic tracking data structure returned from hooks
export interface HandLandmark {
    x: number;
    y: number;
    z: number;
}

export interface HandTrackingData {
    landmarks: HandLandmark[][];
    handedness: { categoryName: string; score: number }[];
}

// Websocket and Game state types
export interface AppState {
    status: 'connecting' | 'connected' | 'error' | 'lobby' | 'in_room';
    error?: string;
    roomCode?: string | null;
    playerId?: string | null;
    players?: Player[];
    gameState?: GameState;
}

export interface Player {
    id: string;
    name: string;
    isHost?: boolean;
    score?: number;
    // other fields as needed
}

export interface GameState {
    status?: string;
    players?: Record<string, Player>;
    board?: any; // To be refined in specific games
    room_code?: string;
    player1_id?: string;
    [key: string]: unknown; // allow generic expansion but avoid any
}

// MediaPipe generic result
export interface MediaPipeResults {
    multiHandLandmarks?: HandLandmark[][];
    multiHandedness?: any[];
    faceLandmarks?: any;
    segmentationMask?: any;
    image?: HTMLCanvasElement | HTMLImageElement | HTMLVideoElement;
}
