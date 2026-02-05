// Advanced face swap with expression tracking using triangulation

import { warpFaceWithTriangulation, createConvexHullMask } from './faceWarping';

export interface AdvancedSwapResult {
    swappedCanvas: HTMLCanvasElement;
    success: boolean;
}

/**
 * Color correction between source and target faces
 */
const colorCorrect = (
    srcImageData: ImageData,
    tgtImageData: ImageData
): ImageData => {
    const result = new ImageData(
        new Uint8ClampedArray(srcImageData.data),
        srcImageData.width,
        srcImageData.height
    );

    // Calculate mean color of both images
    let srcR = 0, srcG = 0, srcB = 0;
    let tgtR = 0, tgtG = 0, tgtB = 0;
    const pixelCount = srcImageData.width * srcImageData.height;

    for (let i = 0; i < srcImageData.data.length; i += 4) {
        srcR += srcImageData.data[i];
        srcG += srcImageData.data[i + 1];
        srcB += srcImageData.data[i + 2];

        tgtR += tgtImageData.data[i];
        tgtG += tgtImageData.data[i + 1];
        tgtB += tgtImageData.data[i + 2];
    }

    srcR /= pixelCount;
    srcG /= pixelCount;
    srcB /= pixelCount;
    tgtR /= pixelCount;
    tgtG /= pixelCount;
    tgtB /= pixelCount;

    // Apply color correction
    const rRatio = tgtR / (srcR || 1);
    const gRatio = tgtG / (srcG || 1);
    const bRatio = tgtB / (srcB || 1);

    for (let i = 0; i < result.data.length; i += 4) {
        // Blend 60% correction with 40% original
        result.data[i] = Math.min(255, result.data[i] * rRatio * 0.6 + result.data[i] * 0.4);
        result.data[i + 1] = Math.min(255, result.data[i + 1] * gRatio * 0.6 + result.data[i + 1] * 0.4);
        result.data[i + 2] = Math.min(255, result.data[i + 2] * bRatio * 0.6 + result.data[i + 2] * 0.4);
    }

    return result;
};

/**
 * Advanced face swap using triangulation-based warping
 * This warps the face to match the target's expression
 */
export const swapFacesAdvanced = (
    canvas: HTMLCanvasElement,
    face1Landmarks: any[],
    face2Landmarks: any[]
): AdvancedSwapResult => {
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        return { swappedCanvas: canvas, success: false };
    }

    try {
        // Create result canvas
        const resultCanvas = document.createElement('canvas');
        resultCanvas.width = canvas.width;
        resultCanvas.height = canvas.height;

        const resultCtx = resultCanvas.getContext('2d');
        if (!resultCtx) {
            return { swappedCanvas: canvas, success: false };
        }

        // Draw original frame as base
        resultCtx.drawImage(canvas, 0, 0);

        // Create temporary canvases for warped faces
        const warpedFace1 = document.createElement('canvas');
        warpedFace1.width = canvas.width;
        warpedFace1.height = canvas.height;

        const warpedFace2 = document.createElement('canvas');
        warpedFace2.width = canvas.width;
        warpedFace2.height = canvas.height;

        // Warp face 1 to match face 2's expression
        warpFaceWithTriangulation(
            canvas,
            face1Landmarks,
            warpedFace1,
            face2Landmarks,
            canvas.width,
            canvas.height
        );

        // Warp face 2 to match face 1's expression
        warpFaceWithTriangulation(
            canvas,
            face2Landmarks,
            warpedFace2,
            face1Landmarks,
            canvas.width,
            canvas.height
        );

        // Create masks for seamless blending
        const mask1 = createConvexHullMask(face2Landmarks, canvas.width, canvas.height);
        const mask2 = createConvexHullMask(face1Landmarks, canvas.width, canvas.height);

        // Apply color correction
        const warpedCtx1 = warpedFace1.getContext('2d');
        const warpedCtx2 = warpedFace2.getContext('2d');

        if (warpedCtx1 && warpedCtx2) {
            const warpedData1 = warpedCtx1.getImageData(0, 0, canvas.width, canvas.height);
            const warpedData2 = warpedCtx2.getImageData(0, 0, canvas.width, canvas.height);
            const originalData = ctx.getImageData(0, 0, canvas.width, canvas.height);

            // Color correct warped faces
            const corrected1 = colorCorrect(warpedData1, originalData);
            const corrected2 = colorCorrect(warpedData2, originalData);

            warpedCtx1.putImageData(corrected1, 0, 0);
            warpedCtx2.putImageData(corrected2, 0, 0);
        }

        // Blend warped face 1 onto result using mask
        resultCtx.save();
        resultCtx.globalCompositeOperation = 'source-over';
        resultCtx.globalAlpha = 0.95;

        // Apply mask
        resultCtx.globalCompositeOperation = 'destination-in';
        resultCtx.drawImage(mask1, 0, 0);
        resultCtx.globalCompositeOperation = 'source-over';

        resultCtx.drawImage(warpedFace1, 0, 0);
        resultCtx.restore();

        // Blend warped face 2 onto result using mask
        resultCtx.save();
        resultCtx.globalAlpha = 0.95;

        resultCtx.globalCompositeOperation = 'destination-in';
        resultCtx.drawImage(mask2, 0, 0);
        resultCtx.globalCompositeOperation = 'source-over';

        resultCtx.drawImage(warpedFace2, 0, 0);
        resultCtx.restore();

        return {
            swappedCanvas: resultCanvas,
            success: true,
        };
    } catch (error) {
        console.error('Face swap error:', error);
        return { swappedCanvas: canvas, success: false };
    }
};

/**
 * Seamless clone for better blending (Poisson blending approximation)
 */
const seamlessClone = (
    src: HTMLCanvasElement,
    dst: HTMLCanvasElement,
    mask: HTMLCanvasElement
): void => {
    const dstCtx = dst.getContext('2d');
    if (!dstCtx) return;

    // Simple approach: use mask with feathered edges
    dstCtx.save();

    // Create clipping mask
    dstCtx.globalCompositeOperation = 'destination-in';
    dstCtx.drawImage(mask, 0, 0);

    // Draw source
    dstCtx.globalCompositeOperation = 'source-over';
    dstCtx.globalAlpha = 0.95;
    dstCtx.drawImage(src, 0, 0);

    dstCtx.restore();
};
