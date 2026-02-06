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
        // Create a temporary canvas to sample pixels
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        canvas.width = videoElement.videoWidth;
        canvas.height = videoElement.videoHeight;
        ctx.drawImage(videoElement, 0, 0);

        // Sample multiple points on the face (cheeks, forehead)
        const samplePoints = [
            234, // Left cheek
            454, // Right cheek
            10,  // Forehead center
            123, // Left forehead
            352, // Right forehead
        ];

        let totalR = 0;
        let totalG = 0;
        let totalB = 0;
        let validSamples = 0;

        samplePoints.forEach((index) => {
            const landmark = landmarks[index];
            const x = Math.floor(landmark.x * canvas.width);
            const y = Math.floor(landmark.y * canvas.height);

            // Sample a small area around the point
            const imageData = ctx.getImageData(x - 2, y - 2, 5, 5);
            const pixels = imageData.data;

            // Average the pixels in this area
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

        // Sample points above the forehead (hair area)
        const forehead = landmarks[10];
        const x = Math.floor(forehead.x * canvas.width);
        const y = Math.floor(forehead.y * canvas.height);

        // Sample above forehead
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
