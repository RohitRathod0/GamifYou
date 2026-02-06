import { AvatarExpression, BlendShapes } from './types';
import { NormalizedLandmarkList } from '@mediapipe/face_mesh';
import {
    detectBlink,
    calculateMouthOpenness,
    calculateEyebrowRaise,
} from './headPoseEstimator';

/**
 * Blend Shape Mapper - Map facial expressions and landmarks to avatar blend shapes
 */

/**
 * Map detected expressions to blend shapes
 */
export const mapExpressionToBlendShapes = (
    expression: AvatarExpression,
    landmarks?: NormalizedLandmarkList
): BlendShapes => {
    const blendShapes: BlendShapes = {
        // Initialize all blend shapes
        eyeBlinkLeft: 0,
        eyeBlinkRight: 0,
        eyeWideLeft: 0,
        eyeWideRight: 0,
        browInnerUp: 0,
        browOuterUpLeft: 0,
        browOuterUpRight: 0,
        mouthSmileLeft: 0,
        mouthSmileRight: 0,
        mouthFrownLeft: 0,
        mouthFrownRight: 0,
        mouthOpen: 0,
        jawOpen: 0,
        cheekPuff: 0,
    };

    // Map expressions to blend shapes
    if (expression.happy > 0.3) { // Lowered threshold for better detection
        blendShapes.mouthSmileLeft = expression.happy * 1.5; // Amplified
        blendShapes.mouthSmileRight = expression.happy * 1.5;
        blendShapes.eyeWideLeft = expression.happy * 0.2;
        blendShapes.eyeWideRight = expression.happy * 0.2;
    }

    if (expression.sad > 0.3) {
        blendShapes.mouthFrownLeft = expression.sad * 1.2;
        blendShapes.mouthFrownRight = expression.sad * 1.2;
        blendShapes.browInnerUp = expression.sad * 0.8;
    }

    if (expression.surprised > 0.3) {
        blendShapes.eyeWideLeft = expression.surprised * 1.2;
        blendShapes.eyeWideRight = expression.surprised * 1.2;
        blendShapes.browInnerUp = expression.surprised * 1.1;
        blendShapes.browOuterUpLeft = expression.surprised * 1.1;
        blendShapes.browOuterUpRight = expression.surprised * 1.1;
        blendShapes.mouthOpen = expression.surprised;
        blendShapes.jawOpen = expression.surprised * 0.7;
    }

    if (expression.angry > 0.5) {
        blendShapes.browInnerUp = -expression.angry * 0.5; // Frown
        blendShapes.mouthFrownLeft = expression.angry * 0.3;
        blendShapes.mouthFrownRight = expression.angry * 0.3;
    }

    if (expression.fearful > 0.5) {
        blendShapes.eyeWideLeft = expression.fearful * 0.8;
        blendShapes.eyeWideRight = expression.fearful * 0.8;
        blendShapes.browInnerUp = expression.fearful * 0.6;
        blendShapes.mouthOpen = expression.fearful * 0.4;
    }

    if (expression.disgusted > 0.5) {
        blendShapes.mouthFrownLeft = expression.disgusted * 0.6;
        blendShapes.mouthFrownRight = expression.disgusted * 0.6;
        blendShapes.browInnerUp = -expression.disgusted * 0.3;
    }

    // If we have landmarks, use them for more precise control
    if (landmarks) {
        const blink = detectBlink(landmarks);
        const mouthOpen = calculateMouthOpenness(landmarks);
        const eyebrowRaise = calculateEyebrowRaise(landmarks);

        // Override with landmark-based values (more accurate)
        blendShapes.eyeBlinkLeft = blink.leftEyeClosed ? 1 : 0;
        blendShapes.eyeBlinkRight = blink.rightEyeClosed ? 1 : 0;
        blendShapes.mouthOpen = Math.max(blendShapes.mouthOpen, mouthOpen);
        blendShapes.jawOpen = mouthOpen * 0.8;
        blendShapes.browOuterUpLeft = Math.max(blendShapes.browOuterUpLeft, eyebrowRaise.left);
        blendShapes.browOuterUpRight = Math.max(blendShapes.browOuterUpRight, eyebrowRaise.right);
    }

    return blendShapes;
};

/**
 * Interpolate between current and target blend shapes for smooth transitions
 */
export const interpolateBlendShapes = (
    current: BlendShapes,
    target: BlendShapes,
    alpha: number = 0.3
): BlendShapes => {
    const result: BlendShapes = {} as BlendShapes;

    (Object.keys(current) as Array<keyof BlendShapes>).forEach((key) => {
        result[key] = current[key] + (target[key] - current[key]) * alpha;
    });

    return result;
};

/**
 * Create default blend shapes (neutral expression)
 */
export const createNeutralBlendShapes = (): BlendShapes => {
    return {
        eyeBlinkLeft: 0,
        eyeBlinkRight: 0,
        eyeWideLeft: 0,
        eyeWideRight: 0,
        browInnerUp: 0,
        browOuterUpLeft: 0,
        browOuterUpRight: 0,
        mouthSmileLeft: 0,
        mouthSmileRight: 0,
        mouthFrownLeft: 0,
        mouthFrownRight: 0,
        mouthOpen: 0,
        jawOpen: 0,
        cheekPuff: 0,
    };
};
