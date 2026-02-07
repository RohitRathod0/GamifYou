import { BackgroundConfig, SegmentationResult } from './types';
import {
    applyBlur,
    createColorBackground,
    loadBackgroundImage,
    createGradientBackground,
    blurRegion,
} from './effects';

/**
 * Background Processor - Combines person segmentation with background replacement
 */

export class BackgroundProcessor {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private backgroundCache: Map<string, ImageData> = new Map();

    constructor(width: number, height: number) {
        this.canvas = document.createElement('canvas');
        this.canvas.width = width;
        this.canvas.height = height;

        const ctx = this.canvas.getContext('2d');
        if (!ctx) {
            throw new Error('Failed to create canvas context');
        }
        this.ctx = ctx;
    }

    /**
     * Process video frame with virtual background
     */
    async processFrame(
        videoElement: HTMLVideoElement,
        segmentationMask: SegmentationResult,
        config: BackgroundConfig
    ): Promise<ImageData> {
        // Draw original video frame
        this.ctx.drawImage(videoElement, 0, 0, this.canvas.width, this.canvas.height);
        const originalFrame = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);

        // Get or create background
        let background: ImageData;

        switch (config.type) {
            case 'blur':
                return blurRegion(originalFrame, segmentationMask.mask, config.blurAmount || 10);

            case 'color':
                background = createColorBackground(
                    this.canvas.width,
                    this.canvas.height,
                    config.color || '#00ff00'
                );
                break;

            case 'image':
                if (!config.imageUrl) {
                    return originalFrame;
                }

                // Check cache
                if (this.backgroundCache.has(config.imageUrl)) {
                    background = this.backgroundCache.get(config.imageUrl)!;
                } else {
                    background = await loadBackgroundImage(
                        config.imageUrl,
                        this.canvas.width,
                        this.canvas.height
                    );
                    this.backgroundCache.set(config.imageUrl, background);
                }
                break;

            case 'none':
            default:
                return originalFrame;
        }

        // Composite person over background
        return this.compositeLayers(originalFrame, background, segmentationMask.mask);
    }

    /**
     * Composite person (foreground) over background using mask
     */
    private compositeLayers(
        foreground: ImageData,
        background: ImageData,
        mask: ImageData
    ): ImageData {
        const result = new ImageData(this.canvas.width, this.canvas.height);

        for (let i = 0; i < result.data.length; i += 4) {
            const maskValue = mask.data[i] / 255; // 0 = background, 1 = person

            if (maskValue > 0.5) {
                // Person - use foreground
                result.data[i] = foreground.data[i];
                result.data[i + 1] = foreground.data[i + 1];
                result.data[i + 2] = foreground.data[i + 2];
                result.data[i + 3] = 255;
            } else {
                // Background - use replacement
                result.data[i] = background.data[i];
                result.data[i + 1] = background.data[i + 1];
                result.data[i + 2] = background.data[i + 2];
                result.data[i + 3] = 255;
            }
        }

        return result;
    }

    /**
     * Apply edge smoothing to reduce artifacts
     */
    applyEdgeSmoothing(imageData: ImageData, amount: number = 0.5): ImageData {
        if (amount === 0) return imageData;

        const smoothed = new ImageData(imageData.width, imageData.height);
        const kernelSize = Math.max(1, Math.floor(amount * 3));

        for (let y = 0; y < imageData.height; y++) {
            for (let x = 0; x < imageData.width; x++) {
                let r = 0, g = 0, b = 0, count = 0;

                for (let ky = -kernelSize; ky <= kernelSize; ky++) {
                    for (let kx = -kernelSize; kx <= kernelSize; kx++) {
                        const nx = x + kx;
                        const ny = y + ky;

                        if (nx >= 0 && nx < imageData.width && ny >= 0 && ny < imageData.height) {
                            const idx = (ny * imageData.width + nx) * 4;
                            r += imageData.data[idx];
                            g += imageData.data[idx + 1];
                            b += imageData.data[idx + 2];
                            count++;
                        }
                    }
                }

                const idx = (y * imageData.width + x) * 4;
                smoothed.data[idx] = r / count;
                smoothed.data[idx + 1] = g / count;
                smoothed.data[idx + 2] = b / count;
                smoothed.data[idx + 3] = 255;
            }
        }

        return smoothed;
    }

    /**
     * Clear background cache
     */
    clearCache(): void {
        this.backgroundCache.clear();
    }

    /**
     * Get canvas for rendering
     */
    getCanvas(): HTMLCanvasElement {
        return this.canvas;
    }

    /**
     * Resize processor
     */
    resize(width: number, height: number): void {
        this.canvas.width = width;
        this.canvas.height = height;
        this.clearCache();
    }
}
