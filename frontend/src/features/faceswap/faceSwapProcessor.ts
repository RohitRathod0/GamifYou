// Face swap processor - swap faces between two people

import { calculateBoundingBox, extractFaceRegion } from './faceExtraction';

export interface SwapResult {
    swappedCanvas: HTMLCanvasElement;
    success: boolean;
}

/**
 * Create a mask for seamless blending
 */
const createFaceMask = (
    width: number,
    height: number,
    landmarks: any[],
    canvasWidth: number,
    canvasHeight: number
): HTMLCanvasElement => {
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = width;
    maskCanvas.height = height;

    const ctx = maskCanvas.getContext('2d');
    if (!ctx) return maskCanvas;

    // Create elliptical mask based on face landmarks
    const boundingBox = calculateBoundingBox(landmarks, canvasWidth, canvasHeight, 0.1);

    const centerX = boundingBox.x + boundingBox.width / 2;
    const centerY = boundingBox.y + boundingBox.height / 2;
    const radiusX = boundingBox.width / 2;
    const radiusY = boundingBox.height / 2;

    // Create radial gradient for smooth edges
    const gradient = ctx.createRadialGradient(
        centerX, centerY, 0,
        centerX, centerY, Math.max(radiusX, radiusY)
    );

    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.7, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.95, 'rgba(255, 255, 255, 0.5)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    return maskCanvas;
};

/**
 * Match skin tone between source and target
 */
const matchSkinTone = (
    sourceImageData: ImageData,
    targetImageData: ImageData
): ImageData => {
    const result = new ImageData(
        new Uint8ClampedArray(sourceImageData.data),
        sourceImageData.width,
        sourceImageData.height
    );

    // Calculate average color of both images (simple color correction)
    let srcR = 0, srcG = 0, srcB = 0;
    let tgtR = 0, tgtG = 0, tgtB = 0;
    let count = 0;

    // Sample center region for skin tone
    const sampleSize = Math.min(sourceImageData.width, sourceImageData.height) / 4;
    const startX = (sourceImageData.width - sampleSize) / 2;
    const startY = (sourceImageData.height - sampleSize) / 2;

    for (let y = startY; y < startY + sampleSize; y++) {
        for (let x = startX; x < startX + sampleSize; x++) {
            const idx = (Math.floor(y) * sourceImageData.width + Math.floor(x)) * 4;

            if (idx < sourceImageData.data.length - 3) {
                srcR += sourceImageData.data[idx];
                srcG += sourceImageData.data[idx + 1];
                srcB += sourceImageData.data[idx + 2];

                tgtR += targetImageData.data[idx];
                tgtG += targetImageData.data[idx + 1];
                tgtB += targetImageData.data[idx + 2];

                count++;
            }
        }
    }

    if (count === 0) return result;

    srcR /= count;
    srcG /= count;
    srcB /= count;
    tgtR /= count;
    tgtG /= count;
    tgtB /= count;

    // Apply color correction
    const rRatio = tgtR / (srcR || 1);
    const gRatio = tgtG / (srcG || 1);
    const bRatio = tgtB / (srcB || 1);

    for (let i = 0; i < result.data.length; i += 4) {
        result.data[i] = Math.min(255, result.data[i] * rRatio * 0.7 + result.data[i] * 0.3);
        result.data[i + 1] = Math.min(255, result.data[i + 1] * gRatio * 0.7 + result.data[i + 1] * 0.3);
        result.data[i + 2] = Math.min(255, result.data[i + 2] * bRatio * 0.7 + result.data[i + 2] * 0.3);
    }

    return result;
};

/**
 * Blend two faces with seamless edges
 */
const blendFaces = (
    ctx: CanvasRenderingContext2D,
    sourceFace: ImageData,
    targetBoundingBox: { x: number; y: number; width: number; height: number },
    mask: HTMLCanvasElement
): void => {
    // Create temporary canvas for blending
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = targetBoundingBox.width;
    tempCanvas.height = targetBoundingBox.height;

    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return;

    // Draw source face
    tempCtx.putImageData(sourceFace, 0, 0);

    // Apply mask for smooth blending
    tempCtx.globalCompositeOperation = 'destination-in';
    tempCtx.drawImage(mask, 0, 0, tempCanvas.width, tempCanvas.height);

    // Draw blended face onto main canvas
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(
        tempCanvas,
        targetBoundingBox.x,
        targetBoundingBox.y,
        targetBoundingBox.width,
        targetBoundingBox.height
    );
};

/**
 * Swap two faces in a video frame
 */
export const swapFaces = (
    canvas: HTMLCanvasElement,
    face1Landmarks: any[],
    face2Landmarks: any[]
): SwapResult => {
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        return { swappedCanvas: canvas, success: false };
    }

    // Extract both faces
    const face1Region = extractFaceRegion(canvas, face1Landmarks, 0.3);
    const face2Region = extractFaceRegion(canvas, face2Landmarks, 0.3);

    if (!face1Region || !face2Region) {
        return { swappedCanvas: canvas, success: false };
    }

    // Create result canvas
    const resultCanvas = document.createElement('canvas');
    resultCanvas.width = canvas.width;
    resultCanvas.height = canvas.height;

    const resultCtx = resultCanvas.getContext('2d');
    if (!resultCtx) {
        return { swappedCanvas: canvas, success: false };
    }

    // Draw original frame
    resultCtx.drawImage(canvas, 0, 0);

    // Match skin tones
    const face1Corrected = matchSkinTone(face1Region.imageData, face2Region.imageData);
    const face2Corrected = matchSkinTone(face2Region.imageData, face1Region.imageData);

    // Resize faces to match target bounding boxes
    const face1Canvas = document.createElement('canvas');
    face1Canvas.width = face2Region.boundingBox.width;
    face1Canvas.height = face2Region.boundingBox.height;
    const face1Ctx = face1Canvas.getContext('2d');

    const face2Canvas = document.createElement('canvas');
    face2Canvas.width = face1Region.boundingBox.width;
    face2Canvas.height = face1Region.boundingBox.height;
    const face2Ctx = face2Canvas.getContext('2d');

    if (!face1Ctx || !face2Ctx) {
        return { swappedCanvas: canvas, success: false };
    }

    // Put corrected image data
    const tempCanvas1 = document.createElement('canvas');
    tempCanvas1.width = face1Corrected.width;
    tempCanvas1.height = face1Corrected.height;
    const tempCtx1 = tempCanvas1.getContext('2d');

    const tempCanvas2 = document.createElement('canvas');
    tempCanvas2.width = face2Corrected.width;
    tempCanvas2.height = face2Corrected.height;
    const tempCtx2 = tempCanvas2.getContext('2d');

    if (!tempCtx1 || !tempCtx2) {
        return { swappedCanvas: canvas, success: false };
    }

    tempCtx1.putImageData(face1Corrected, 0, 0);
    tempCtx2.putImageData(face2Corrected, 0, 0);

    // Scale to target size
    face1Ctx.drawImage(tempCanvas1, 0, 0, face2Region.boundingBox.width, face2Region.boundingBox.height);
    face2Ctx.drawImage(tempCanvas2, 0, 0, face1Region.boundingBox.width, face1Region.boundingBox.height);

    // Create masks for blending
    const mask1 = createFaceMask(
        face2Region.boundingBox.width,
        face2Region.boundingBox.height,
        face1Landmarks,
        canvas.width,
        canvas.height
    );

    const mask2 = createFaceMask(
        face1Region.boundingBox.width,
        face1Region.boundingBox.height,
        face2Landmarks,
        canvas.width,
        canvas.height
    );

    // Blend faces
    const face1ImageData = face1Ctx.getImageData(0, 0, face1Canvas.width, face1Canvas.height);
    const face2ImageData = face2Ctx.getImageData(0, 0, face2Canvas.width, face2Canvas.height);

    blendFaces(resultCtx, face1ImageData, face2Region.boundingBox, mask1);
    blendFaces(resultCtx, face2ImageData, face1Region.boundingBox, mask2);

    return {
        swappedCanvas: resultCanvas,
        success: true,
    };
};

/**
 * Simple face swap without complex blending (faster, for real-time)
 */
export const swapFacesSimple = (
    canvas: HTMLCanvasElement,
    face1Landmarks: any[],
    face2Landmarks: any[]
): SwapResult => {
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        return { swappedCanvas: canvas, success: false };
    }

    // Get bounding boxes
    const box1 = calculateBoundingBox(face1Landmarks, canvas.width, canvas.height, 0.2);
    const box2 = calculateBoundingBox(face2Landmarks, canvas.width, canvas.height, 0.2);

    // Create result canvas
    const resultCanvas = document.createElement('canvas');
    resultCanvas.width = canvas.width;
    resultCanvas.height = canvas.height;

    const resultCtx = resultCanvas.getContext('2d');
    if (!resultCtx) {
        return { swappedCanvas: canvas, success: false };
    }

    // Draw original frame
    resultCtx.drawImage(canvas, 0, 0);

    // Extract face regions
    const face1Data = ctx.getImageData(box1.x, box1.y, box1.width, box1.height);
    const face2Data = ctx.getImageData(box2.x, box2.y, box2.width, box2.height);

    // Create temporary canvases
    const temp1 = document.createElement('canvas');
    temp1.width = box2.width;
    temp1.height = box2.height;
    const tempCtx1 = temp1.getContext('2d');

    const temp2 = document.createElement('canvas');
    temp2.width = box1.width;
    temp2.height = box1.height;
    const tempCtx2 = temp2.getContext('2d');

    if (!tempCtx1 || !tempCtx2) {
        return { swappedCanvas: canvas, success: false };
    }

    // Put face data
    const face1Canvas = document.createElement('canvas');
    face1Canvas.width = face1Data.width;
    face1Canvas.height = face1Data.height;
    const face1Ctx = face1Canvas.getContext('2d');

    const face2Canvas = document.createElement('canvas');
    face2Canvas.width = face2Data.width;
    face2Canvas.height = face2Data.height;
    const face2Ctx = face2Canvas.getContext('2d');

    if (!face1Ctx || !face2Ctx) {
        return { swappedCanvas: canvas, success: false };
    }

    face1Ctx.putImageData(face1Data, 0, 0);
    face2Ctx.putImageData(face2Data, 0, 0);

    // Scale and draw swapped faces
    tempCtx1.drawImage(face1Canvas, 0, 0, box2.width, box2.height);
    tempCtx2.drawImage(face2Canvas, 0, 0, box1.width, box1.height);

    // Apply with some transparency for blending
    resultCtx.globalAlpha = 0.85;
    resultCtx.drawImage(temp1, box2.x, box2.y);
    resultCtx.drawImage(temp2, box1.x, box1.y);
    resultCtx.globalAlpha = 1.0;

    return {
        swappedCanvas: resultCanvas,
        success: true,
    };
};
