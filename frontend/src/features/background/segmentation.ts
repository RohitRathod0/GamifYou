import { SelfieSegmentation, Results } from '@mediapipe/selfie_segmentation';
import { SegmentationResult, SegmentationConfig } from './types';

/**
 * Person Segmentation using MediaPipe Selfie Segmentation
 * Separates person (foreground) from background in real-time
 */

let segmentationModel: SelfieSegmentation | null = null;
let isModelLoaded = false;

/**
 * Initialize MediaPipe Selfie Segmentation model
 */
export const initializeSegmentation = async (
    config: SegmentationConfig = { modelSelection: 1, selfieMode: true }
): Promise<void> => {
    if (isModelLoaded && segmentationModel) {
        console.log('✅ Segmentation model already loaded');
        return;
    }

    try {
        console.log('🔄 Loading MediaPipe Selfie Segmentation...');

        segmentationModel = new SelfieSegmentation({
            locateFile: (file) => {
                return `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`;
            },
        });

        segmentationModel.setOptions({
            modelSelection: config.modelSelection,
            selfieMode: config.selfieMode,
        });

        isModelLoaded = true;
        console.log('✅ Segmentation model loaded successfully');
    } catch (error) {
        console.error('❌ Failed to load segmentation model:', error);
        throw error;
    }
};

/**
 * Process video frame and generate segmentation mask
 */
export const segmentPerson = async (
    videoElement: HTMLVideoElement
): Promise<SegmentationResult | null> => {
    if (!segmentationModel || !isModelLoaded) {
        console.warn('Segmentation model not loaded');
        return null;
    }

    return new Promise((resolve) => {
        segmentationModel!.onResults((results: Results) => {
            if (!results.segmentationMask) {
                resolve(null);
                return;
            }

            // Convert segmentation mask to ImageData
            const canvas = document.createElement('canvas');
            canvas.width = results.segmentationMask.width;
            canvas.height = results.segmentationMask.height;
            const ctx = canvas.getContext('2d');

            if (!ctx) {
                resolve(null);
                return;
            }

            ctx.drawImage(results.segmentationMask, 0, 0);
            const maskData = ctx.getImageData(0, 0, canvas.width, canvas.height);

            resolve({
                mask: maskData,
                width: canvas.width,
                height: canvas.height,
                timestamp: Date.now(),
            });
        });

        segmentationModel!.send({ image: videoElement });
    });
};

/**
 * Apply smoothing to segmentation mask edges
 */
export const smoothMaskEdges = (
    maskData: ImageData,
    smoothingAmount: number = 0.5
): ImageData => {
    const smoothed = new ImageData(maskData.width, maskData.height);
    const data = maskData.data;
    const result = smoothed.data;

    const kernelSize = Math.max(1, Math.floor(smoothingAmount * 5));

    for (let y = 0; y < maskData.height; y++) {
        for (let x = 0; x < maskData.width; x++) {
            let sum = 0;
            let count = 0;

            // Average neighboring pixels
            for (let ky = -kernelSize; ky <= kernelSize; ky++) {
                for (let kx = -kernelSize; kx <= kernelSize; kx++) {
                    const nx = x + kx;
                    const ny = y + ky;

                    if (nx >= 0 && nx < maskData.width && ny >= 0 && ny < maskData.height) {
                        const idx = (ny * maskData.width + nx) * 4;
                        sum += data[idx];
                        count++;
                    }
                }
            }

            const idx = (y * maskData.width + x) * 4;
            const avgValue = sum / count;

            result[idx] = avgValue;
            result[idx + 1] = avgValue;
            result[idx + 2] = avgValue;
            result[idx + 3] = 255;
        }
    }

    return smoothed;
};

/**
 * Extract person (foreground) from video using mask
 */
export const extractPerson = (
    videoElement: HTMLVideoElement,
    mask: ImageData
): ImageData => {
    const canvas = document.createElement('canvas');
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
        throw new Error('Failed to get canvas context');
    }

    // Draw video frame
    ctx.drawImage(videoElement, 0, 0);
    const frameData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    // Apply mask
    for (let i = 0; i < frameData.data.length; i += 4) {
        const maskValue = mask.data[i] / 255; // Normalize to 0-1
        frameData.data[i + 3] = Math.floor(maskValue * 255); // Set alpha channel
    }

    return frameData;
};

/**
 * Cleanup segmentation resources
 */
export const cleanupSegmentation = () => {
    if (segmentationModel) {
        segmentationModel.close();
        segmentationModel = null;
        isModelLoaded = false;
        console.log('🧹 Segmentation model cleaned up');
    }
};
