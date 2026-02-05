// Face alignment utilities - align and normalize faces

/**
 * Create affine transformation matrix for face alignment
 */
export const createAlignmentMatrix = (
    srcPoints: { x: number; y: number }[],
    dstPoints: { x: number; y: number }[]
): number[][] => {
    // Simple 2D affine transformation
    // This is a simplified version - for production, use a proper matrix library

    if (srcPoints.length < 3 || dstPoints.length < 3) {
        return [[1, 0, 0], [0, 1, 0], [0, 0, 1]]; // Identity matrix
    }

    // Calculate transformation based on eye positions
    const srcEyeCenter = {
        x: (srcPoints[0].x + srcPoints[1].x) / 2,
        y: (srcPoints[0].y + srcPoints[1].y) / 2,
    };

    const dstEyeCenter = {
        x: (dstPoints[0].x + dstPoints[1].x) / 2,
        y: (dstPoints[0].y + dstPoints[1].y) / 2,
    };

    // Calculate scale
    const srcEyeDist = Math.sqrt(
        Math.pow(srcPoints[1].x - srcPoints[0].x, 2) +
        Math.pow(srcPoints[1].y - srcPoints[0].y, 2)
    );

    const dstEyeDist = Math.sqrt(
        Math.pow(dstPoints[1].x - dstPoints[0].x, 2) +
        Math.pow(dstPoints[1].y - dstPoints[0].y, 2)
    );

    const scale = dstEyeDist / srcEyeDist;

    // Calculate rotation
    const srcAngle = Math.atan2(
        srcPoints[1].y - srcPoints[0].y,
        srcPoints[1].x - srcPoints[0].x
    );

    const dstAngle = Math.atan2(
        dstPoints[1].y - dstPoints[0].y,
        dstPoints[1].x - dstPoints[0].x
    );

    const rotation = dstAngle - srcAngle;

    // Build transformation matrix
    const cos = Math.cos(rotation) * scale;
    const sin = Math.sin(rotation) * scale;

    const tx = dstEyeCenter.x - (srcEyeCenter.x * cos - srcEyeCenter.y * sin);
    const ty = dstEyeCenter.y - (srcEyeCenter.x * sin + srcEyeCenter.y * cos);

    return [
        [cos, -sin, tx],
        [sin, cos, ty],
        [0, 0, 1],
    ];
};

/**
 * Apply affine transformation to align face
 */
export const alignFace = (
    sourceCanvas: HTMLCanvasElement,
    landmarks: any[],
    targetWidth: number,
    targetHeight: number
): HTMLCanvasElement => {
    const alignedCanvas = document.createElement('canvas');
    alignedCanvas.width = targetWidth;
    alignedCanvas.height = targetHeight;

    const ctx = alignedCanvas.getContext('2d');
    if (!ctx) return alignedCanvas;

    // Get key landmarks (eyes, nose)
    const LEFT_EYE = 33;
    const RIGHT_EYE = 263;
    const NOSE = 1;

    const leftEye = landmarks[LEFT_EYE];
    const rightEye = landmarks[RIGHT_EYE];
    const nose = landmarks[NOSE];

    // Source points (from detected face)
    const srcPoints = [
        { x: leftEye.x * sourceCanvas.width, y: leftEye.y * sourceCanvas.height },
        { x: rightEye.x * sourceCanvas.width, y: rightEye.y * sourceCanvas.height },
        { x: nose.x * sourceCanvas.width, y: nose.y * sourceCanvas.height },
    ];

    // Destination points (standard face position)
    const dstPoints = [
        { x: targetWidth * 0.35, y: targetHeight * 0.35 },
        { x: targetWidth * 0.65, y: targetHeight * 0.35 },
        { x: targetWidth * 0.5, y: targetHeight * 0.55 },
    ];

    // Calculate transformation
    const matrix = createAlignmentMatrix(srcPoints, dstPoints);

    // Apply transformation
    ctx.setTransform(
        matrix[0][0], matrix[1][0],
        matrix[0][1], matrix[1][1],
        matrix[0][2], matrix[1][2]
    );

    ctx.drawImage(sourceCanvas, 0, 0);

    // Reset transformation
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    return alignedCanvas;
};

/**
 * Normalize face size to standard dimensions
 */
export const normalizeFaceSize = (
    faceCanvas: HTMLCanvasElement,
    targetSize: number = 256
): HTMLCanvasElement => {
    const normalizedCanvas = document.createElement('canvas');
    normalizedCanvas.width = targetSize;
    normalizedCanvas.height = targetSize;

    const ctx = normalizedCanvas.getContext('2d');
    if (!ctx) return normalizedCanvas;

    // Draw scaled face
    ctx.drawImage(faceCanvas, 0, 0, targetSize, targetSize);

    return normalizedCanvas;
};

/**
 * Calculate face scale factor
 */
export const calculateFaceScale = (
    landmarks: any[],
    width: number,
    height: number
): number => {
    const LEFT_EYE = 33;
    const RIGHT_EYE = 263;

    const leftEye = landmarks[LEFT_EYE];
    const rightEye = landmarks[RIGHT_EYE];

    const eyeDistance = Math.sqrt(
        Math.pow((rightEye.x - leftEye.x) * width, 2) +
        Math.pow((rightEye.y - leftEye.y) * height, 2)
    );

    // Standard eye distance is about 64 pixels in a 256x256 face
    const standardEyeDistance = 64;

    return standardEyeDistance / eyeDistance;
};
