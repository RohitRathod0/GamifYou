import { FaceMesh } from '@mediapipe/face_mesh';
import { FaceDetectionResult, FaceMeshConfig, DEFAULT_FACE_MESH_CONFIG } from './types';

export class FaceDetectionService {
    private faceMesh: FaceMesh | null = null;
    private isInitialized = false;

    async initialize(config: FaceMeshConfig = DEFAULT_FACE_MESH_CONFIG): Promise<void> {
        if (this.isInitialized) return;

        this.faceMesh = new FaceMesh({
            locateFile: (file) => {
                return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
            },
        });

        this.faceMesh.setOptions({
            maxNumFaces: config.maxNumFaces,
            refineLandmarks: config.refineLandmarks,
            minDetectionConfidence: config.minDetectionConfidence,
            minTrackingConfidence: config.minTrackingConfidence,
        });

        this.isInitialized = true;
    }

    async detectFaces(
        videoElement: HTMLVideoElement,
        onResults: (results: any) => void
    ): Promise<void> {
        if (!this.faceMesh) {
            throw new Error('FaceDetectionService not initialized');
        }

        this.faceMesh.onResults(onResults);
        await this.faceMesh.send({ image: videoElement });
    }

    setOnResults(callback: (results: any) => void): void {
        if (!this.faceMesh) {
            throw new Error('FaceDetectionService not initialized');
        }
        this.faceMesh.onResults(callback);
    }

    dispose(): void {
        if (this.faceMesh) {
            this.faceMesh.close();
            this.faceMesh = null;
            this.isInitialized = false;
        }
    }

    isReady(): boolean {
        return this.isInitialized;
    }
}

// Singleton instance
let faceDetectionServiceInstance: FaceDetectionService | null = null;

export const getFaceDetectionService = (): FaceDetectionService => {
    if (!faceDetectionServiceInstance) {
        faceDetectionServiceInstance = new FaceDetectionService();
    }
    return faceDetectionServiceInstance;
};

// Helper function to draw landmarks on canvas
export const drawFaceLandmarks = (
    ctx: CanvasRenderingContext2D,
    landmarks: any[],
    color: string = '#00FF00',
    radius: number = 1
): void => {
    ctx.fillStyle = color;

    landmarks.forEach((landmark) => {
        const x = landmark.x * ctx.canvas.width;
        const y = landmark.y * ctx.canvas.height;

        ctx.beginPath();
        ctx.arc(x, y, radius, 0, 2 * Math.PI);
        ctx.fill();
    });
};

// Draw face mesh connections
export const drawFaceMeshConnections = (
    ctx: CanvasRenderingContext2D,
    landmarks: any[],
    connections: number[][],
    color: string = '#00FF00',
    lineWidth: number = 1
): void => {
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;

    connections.forEach(([start, end]) => {
        const startPoint = landmarks[start];
        const endPoint = landmarks[end];

        if (startPoint && endPoint) {
            const x1 = startPoint.x * ctx.canvas.width;
            const y1 = startPoint.y * ctx.canvas.height;
            const x2 = endPoint.x * ctx.canvas.width;
            const y2 = endPoint.y * ctx.canvas.height;

            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
        }
    });
};
