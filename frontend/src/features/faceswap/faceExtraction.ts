// Face extraction utilities - extract face regions from video frames

export interface FaceRegion {
    imageData: ImageData;
    boundingBox: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    landmarks: any[];
}

/**
 * Calculate bounding box from facial landmarks
 */
export const calculateBoundingBox = (
    landmarks: any[],
    width: number,
    height: number,
    padding: number = 0.3
): { x: number; y: number; width: number; height: number } => {
    if (!landmarks || landmarks.length === 0) {
        return { x: 0, y: 0, width: 0, height: 0 };
    }

    // Find min/max coordinates
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    landmarks.forEach((landmark) => {
        const x = landmark.x * width;
        const y = landmark.y * height;

        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
    });

    // Calculate dimensions
    const faceWidth = maxX - minX;
    const faceHeight = maxY - minY;

    // Add padding
    const paddingX = faceWidth * padding;
    const paddingY = faceHeight * padding;

    return {
        x: Math.max(0, minX - paddingX),
        y: Math.max(0, minY - paddingY),
        width: Math.min(width - (minX - paddingX), faceWidth + 2 * paddingX),
        height: Math.min(height - (minY - paddingY), faceHeight + 2 * paddingY),
    };
};

/**
 * Extract face region from canvas
 */
export const extractFaceRegion = (
    canvas: HTMLCanvasElement,
    landmarks: any[],
    padding: number = 0.3
): FaceRegion | null => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const boundingBox = calculateBoundingBox(
        landmarks,
        canvas.width,
        canvas.height,
        padding
    );

    if (boundingBox.width === 0 || boundingBox.height === 0) {
        return null;
    }

    // Extract image data
    const imageData = ctx.getImageData(
        boundingBox.x,
        boundingBox.y,
        boundingBox.width,
        boundingBox.height
    );

    return {
        imageData,
        boundingBox,
        landmarks,
    };
};

/**
 * Get key facial landmarks for alignment
 */
export const getKeyLandmarks = (landmarks: any[]) => {
    // MediaPipe Face Mesh key landmark indices
    const LEFT_EYE_INDEX = 33;
    const RIGHT_EYE_INDEX = 263;
    const NOSE_TIP_INDEX = 1;
    const MOUTH_CENTER_INDEX = 13;
    const CHIN_INDEX = 152;

    return {
        leftEye: landmarks[LEFT_EYE_INDEX],
        rightEye: landmarks[RIGHT_EYE_INDEX],
        noseTip: landmarks[NOSE_TIP_INDEX],
        mouthCenter: landmarks[MOUTH_CENTER_INDEX],
        chin: landmarks[CHIN_INDEX],
    };
};

/**
 * Calculate face center point
 */
export const calculateFaceCenter = (landmarks: any[], width: number, height: number) => {
    const keyLandmarks = getKeyLandmarks(landmarks);

    const centerX = ((keyLandmarks.leftEye.x + keyLandmarks.rightEye.x) / 2) * width;
    const centerY = ((keyLandmarks.leftEye.y + keyLandmarks.rightEye.y) / 2) * height;

    return { x: centerX, y: centerY };
};

/**
 * Calculate face rotation angle
 */
export const calculateFaceAngle = (landmarks: any[]) => {
    const keyLandmarks = getKeyLandmarks(landmarks);

    const dx = keyLandmarks.rightEye.x - keyLandmarks.leftEye.x;
    const dy = keyLandmarks.rightEye.y - keyLandmarks.leftEye.y;

    return Math.atan2(dy, dx);
};
