import { BackgroundConfig } from './types';

/**
 * Background Effects - Blur, color, and image processing
 */

/**
 * Apply blur effect to background
 */
export const applyBlur = (
    canvas: HTMLCanvasElement,
    blurAmount: number = 10
): void => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Apply CSS blur filter
    ctx.filter = `blur(${blurAmount}px)`;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    ctx.putImageData(imageData, 0, 0);
    ctx.filter = 'none';
};

/**
 * Create solid color background
 */
export const createColorBackground = (
    width: number,
    height: number,
    color: string
): ImageData => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
        throw new Error('Failed to create canvas context');
    }

    ctx.fillStyle = color;
    ctx.fillRect(0, 0, width, height);

    return ctx.getImageData(0, 0, width, height);
};

/**
 * Load and resize background image
 */
export const loadBackgroundImage = async (
    imageUrl: string,
    width: number,
    height: number
): Promise<ImageData> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';

        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');

            if (!ctx) {
                reject(new Error('Failed to create canvas context'));
                return;
            }

            // Draw image scaled to canvas size
            ctx.drawImage(img, 0, 0, width, height);
            resolve(ctx.getImageData(0, 0, width, height));
        };

        img.onerror = () => {
            reject(new Error(`Failed to load image: ${imageUrl}`));
        };

        img.src = imageUrl;
    });
};

/**
 * Apply gradient background
 */
export const createGradientBackground = (
    width: number,
    height: number,
    colors: string[]
): ImageData => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
        throw new Error('Failed to create canvas context');
    }

    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    colors.forEach((color, index) => {
        gradient.addColorStop(index / (colors.length - 1), color);
    });

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    return ctx.getImageData(0, 0, width, height);
};

/**
 * Blur specific region of image
 */
export const blurRegion = (
    imageData: ImageData,
    mask: ImageData,
    blurAmount: number
): ImageData => {
    const canvas = document.createElement('canvas');
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
        throw new Error('Failed to create canvas context');
    }

    // Put original image
    ctx.putImageData(imageData, 0, 0);

    // Create blurred version
    const blurredCanvas = document.createElement('canvas');
    blurredCanvas.width = imageData.width;
    blurredCanvas.height = imageData.height;
    const blurCtx = blurredCanvas.getContext('2d');

    if (!blurCtx) {
        throw new Error('Failed to create blur canvas context');
    }

    blurCtx.filter = `blur(${blurAmount}px)`;
    blurCtx.putImageData(imageData, 0, 0);

    // Composite based on mask
    const result = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const blurred = blurCtx.getImageData(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < result.data.length; i += 4) {
        const maskValue = mask.data[i] / 255; // 0 = background, 1 = person

        if (maskValue < 0.5) {
            // Apply blur to background
            result.data[i] = blurred.data[i];
            result.data[i + 1] = blurred.data[i + 1];
            result.data[i + 2] = blurred.data[i + 2];
        }
    }

    return result;
};
