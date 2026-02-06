import * as faceapi from '@vladmandic/face-api';
import { AvatarExpression } from './types';

/**
 * Expression Detector - Detect facial expressions using face-api.js
 * Detects 7 basic emotions: happy, sad, angry, surprised, neutral, fearful, disgusted
 */

let modelsLoaded = false;
const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model';

/**
 * Load face-api models for expression detection
 */
export const loadExpressionModels = async (): Promise<void> => {
    if (modelsLoaded) {
        console.log('Expression models already loaded');
        return;
    }

    try {
        console.log('Loading expression detection models...');

        await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
            faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
        ]);

        modelsLoaded = true;
        console.log('✅ Expression models loaded successfully');
    } catch (error) {
        console.error('Failed to load expression models:', error);
        throw error;
    }
};

/**
 * Detect expressions from video element or canvas
 */
export const detectExpressions = async (
    input: HTMLVideoElement | HTMLCanvasElement
): Promise<AvatarExpression | null> => {
    if (!modelsLoaded) {
        console.warn('Expression models not loaded yet');
        return null;
    }

    try {
        const detection = await faceapi
            .detectSingleFace(input, new faceapi.TinyFaceDetectorOptions())
            .withFaceExpressions();

        if (!detection) {
            return null;
        }

        const expressions = detection.expressions;

        return {
            happy: expressions.happy,
            sad: expressions.sad,
            angry: expressions.angry,
            surprised: expressions.surprised,
            neutral: expressions.neutral,
            fearful: expressions.fearful,
            disgusted: expressions.disgusted,
        };
    } catch (error) {
        console.error('Expression detection error:', error);
        return null;
    }
};

/**
 * Get dominant expression
 */
export const getDominantExpression = (
    expression: AvatarExpression
): { name: string; confidence: number } => {
    const entries = Object.entries(expression);
    const [name, confidence] = entries.reduce((max, entry) =>
        entry[1] > max[1] ? entry : max
    );

    return { name, confidence };
};

/**
 * Smooth expressions over time to avoid jitter
 */
export class ExpressionSmoother {
    private history: AvatarExpression[] = [];
    private readonly historySize: number;

    constructor(historySize: number = 5) {
        this.historySize = historySize;
    }

    smooth(expression: AvatarExpression): AvatarExpression {
        this.history.push(expression);

        if (this.history.length > this.historySize) {
            this.history.shift();
        }

        // Average all expressions in history
        const smoothed: AvatarExpression = {
            happy: 0,
            sad: 0,
            angry: 0,
            surprised: 0,
            neutral: 0,
            fearful: 0,
            disgusted: 0,
        };

        this.history.forEach((exp) => {
            smoothed.happy += exp.happy;
            smoothed.sad += exp.sad;
            smoothed.angry += exp.angry;
            surprised += exp.surprised;
            smoothed.neutral += exp.neutral;
            smoothed.fearful += exp.fearful;
            smoothed.disgusted += exp.disgusted;
        });

        const count = this.history.length;
        smoothed.happy /= count;
        smoothed.sad /= count;
        smoothed.angry /= count;
        smoothed.surprised /= count;
        smoothed.neutral /= count;
        smoothed.fearful /= count;
        smoothed.disgusted /= count;

        return smoothed;
    }

    reset() {
        this.history = [];
    }
}
