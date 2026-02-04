// Type declarations for @mediapipe/hands
declare module '@mediapipe/hands' {
    export interface NormalizedLandmark {
        x: number;
        y: number;
        z: number;
        visibility?: number;
    }

    export interface Handedness {
        index: number;
        score: number;
        label: 'Left' | 'Right';
        displayName?: string;
    }

    export interface Results {
        multiHandLandmarks?: NormalizedLandmark[][];
        multiHandedness?: Handedness[];
        multiHandWorldLandmarks?: NormalizedLandmark[][];
        image?: HTMLCanvasElement | HTMLImageElement | HTMLVideoElement;
    }

    export interface HandsConfig {
        locateFile: (file: string) => string;
    }

    export interface HandsOptions {
        selfieMode?: boolean;
        maxNumHands?: number;
        modelComplexity?: 0 | 1;
        minDetectionConfidence?: number;
        minTrackingConfidence?: number;
    }

    export class Hands {
        constructor(config: HandsConfig);
        setOptions(options: HandsOptions): void;
        onResults(callback: (results: Results) => void): void;
        send(inputs: { image: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement }): Promise<void>;
        initialize(): Promise<void>;
        reset(): void;
        close(): void;
    }

    export const HAND_CONNECTIONS: Array<[number, number]>;
    export const VERSION: string;
}

// Type declarations for @mediapipe/camera_utils
declare module '@mediapipe/camera_utils' {
    export interface CameraOptions {
        onFrame: () => Promise<void>;
        width?: number;
        height?: number;
        facingMode?: 'user' | 'environment';
    }

    export class Camera {
        constructor(videoElement: HTMLVideoElement, options: CameraOptions);
        start(): Promise<void>;
        stop(): void;
        h?: {
            pause(): void;
            resume(): void;
        };
    }
}

// Type declarations for @mediapipe/drawing_utils
declare module '@mediapipe/drawing_utils' {
    export interface DrawingOptions {
        color?: string;
        fillColor?: string;
        lineWidth?: number;
        radius?: number;
        visibilityMin?: number;
    }

    export class DrawingUtils {
        constructor(ctx: CanvasRenderingContext2D);
        drawConnectors(
            landmarks: Array<{ x: number; y: number; z?: number }>,
            connections: Array<[number, number]>,
            options?: DrawingOptions
        ): void;
        drawLandmarks(
            landmarks: Array<{ x: number; y: number; z?: number }>,
            options?: DrawingOptions
        ): void;
    }

    export function drawConnectors(
        ctx: CanvasRenderingContext2D,
        landmarks: Array<{ x: number; y: number; z?: number }>,
        connections: Array<[number, number]>,
        options?: DrawingOptions
    ): void;

    export function drawLandmarks(
        ctx: CanvasRenderingContext2D,
        landmarks: Array<{ x: number; y: number; z?: number }>,
        options?: DrawingOptions
    ): void;
}
