// Face detection types for MediaPipe Face Mesh
export interface FaceLandmark {
    x: number;
    y: number;
    z: number;
}

export interface FaceDetectionResult {
    landmarks: FaceLandmark[];
    boundingBox: {
        xMin: number;
        yMin: number;
        width: number;
        height: number;
    };
    confidence: number;
}

export interface MultiFaceResults {
    faces: FaceDetectionResult[];
    timestamp: number;
}

export interface FaceMeshConfig {
    maxNumFaces: number;
    refineLandmarks: boolean;
    minDetectionConfidence: number;
    minTrackingConfidence: number;
}

export const DEFAULT_FACE_MESH_CONFIG: FaceMeshConfig = {
    maxNumFaces: 2, // Support 2 faces for multiplayer
    refineLandmarks: true, // Get all 468 landmarks
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
};
