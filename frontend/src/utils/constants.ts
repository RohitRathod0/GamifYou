// API Configuration
export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
export const WS_BASE_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000';

// Game Configuration
export const GAMES = {
    AIR_HOCKEY: 'air_hockey',
    PICTIONARY: 'pictionary',
    LASER_DODGER: 'laser_dodger',
    BALLOON_POP: 'balloon_pop',
} as const;

export const GAME_NAMES = {
    [GAMES.AIR_HOCKEY]: 'Air Hockey',
    [GAMES.PICTIONARY]: 'Gesture Pictionary',
    [GAMES.LASER_DODGER]: 'Laser Dodger',
    [GAMES.BALLOON_POP]: 'Balloon Pop',
};

// MediaPipe Configuration
export const MEDIAPIPE_CONFIG = {
    maxNumHands: 2,
    modelComplexity: 1 as 0 | 1,
    minDetectionConfidence: 0.7,
    minTrackingConfidence: 0.5,
};

// WebRTC Configuration
export const WEBRTC_CONFIG = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
    ],
};