import { NormalizedLandmarkList } from '@mediapipe/face_mesh';

/**
 * Extract skin color from facial landmarks
 */
export const extractSkinColor = (
    videoElement: HTMLVideoElement,
    landmarks: NormalizedLandmarkList
): { r: number; g: number; b: number } | null => {
    if (!landmarks || landmarks.length < 468) {
        return null;
    }

    try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        canvas.width = videoElement.videoWidth;
        canvas.height = videoElement.videoHeight;
        ctx.drawImage(videoElement, 0, 0);

        // Sample multiple points on the face
        const samplePoints = [234, 454, 10, 123, 352];

        let totalR = 0;
        let totalG = 0;
        let totalB = 0;
        let validSamples = 0;

        samplePoints.forEach((index) => {
            const landmark = landmarks[index];
            const x = Math.floor(landmark.x * canvas.width);
            const y = Math.floor(landmark.y * canvas.height);

            const imageData = ctx.getImageData(x - 2, y - 2, 5, 5);
            const pixels = imageData.data;

            for (let i = 0; i < pixels.length; i += 4) {
                totalR += pixels[i];
                totalG += pixels[i + 1];
                totalB += pixels[i + 2];
                validSamples++;
            }
        });

        if (validSamples === 0) return null;

        return {
            r: Math.floor(totalR / validSamples),
            g: Math.floor(totalG / validSamples),
            b: Math.floor(totalB / validSamples),
        };
    } catch (error) {
        console.error('Error extracting skin color:', error);
        return null;
    }
};

/**
 * Detect if user has dark or light hair
 */
export const detectHairColor = (
    videoElement: HTMLVideoElement,
    landmarks: NormalizedLandmarkList
): 'dark' | 'light' | null => {
    if (!landmarks || landmarks.length < 468) {
        return null;
    }

    try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        canvas.width = videoElement.videoWidth;
        canvas.height = videoElement.videoHeight;
        ctx.drawImage(videoElement, 0, 0);

        const forehead = landmarks[10];
        const x = Math.floor(forehead.x * canvas.width);
        const y = Math.floor(forehead.y * canvas.height);

        const hairY = Math.max(0, y - 40);
        const imageData = ctx.getImageData(x - 10, hairY, 20, 20);
        const pixels = imageData.data;

        let totalBrightness = 0;
        let count = 0;

        for (let i = 0; i < pixels.length; i += 4) {
            const r = pixels[i];
            const g = pixels[i + 1];
            const b = pixels[i + 2];
            const brightness = (r + g + b) / 3;
            totalBrightness += brightness;
            count++;
        }

        const avgBrightness = totalBrightness / count;
        return avgBrightness > 100 ? 'light' : 'dark';
    } catch (error) {
        console.error('Error detecting hair color:', error);
        return null;
    }
};

/**
 * Calculate face shape proportions
 */
export const calculateFaceShape = (
    landmarks: NormalizedLandmarkList
): { width: number; height: number } => {
    if (!landmarks || landmarks.length < 468) {
        return { width: 1, height: 1 };
    }

    try {
        const leftCheek = landmarks[234];
        const rightCheek = landmarks[454];
        const forehead = landmarks[10];
        const chin = landmarks[152];

        const faceWidth = Math.abs(rightCheek.x - leftCheek.x);
        const faceHeight = Math.abs(forehead.y - chin.y);

        const typicalRatio = 0.75;
        const actualRatio = faceWidth / faceHeight;

        const widthScale = Math.max(0.8, Math.min(1.2, actualRatio / typicalRatio));
        const heightScale = Math.max(0.8, Math.min(1.2, typicalRatio / actualRatio));

        return { width: widthScale, height: heightScale };
    } catch (error) {
        console.error('Error calculating face shape:', error);
        return { width: 1, height: 1 };
    }
};
