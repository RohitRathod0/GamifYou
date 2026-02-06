import { NormalizedLandmarkList } from '@mediapipe/face_mesh';
import { HeadPose } from './types';

/**
 * Head Pose Estimator - Calculate head rotation from facial landmarks
 * Uses facial landmarks to estimate pitch, yaw, and roll
 */

// Key landmark indices for head pose estimation
const NOSE_TIP = 1;
const CHIN = 152;
const LEFT_EYE = 33;
const RIGHT_EYE = 263;
const LEFT_EAR = 234;
const RIGHT_EAR = 454;
const FOREHEAD = 10;

/**
 * Calculate head pose (pitch, yaw, roll) from facial landmarks
 */
export const estimateHeadPose = (landmarks: NormalizedLandmarkList): HeadPose => {
    if (!landmarks || landmarks.length < 468) {
        return { pitch: 0, yaw: 0, roll: 0 };
    }

    // Get key points
    const noseTip = landmarks[NOSE_TIP];
    const chin = landmarks[CHIN];
    const leftEye = landmarks[LEFT_EYE];
    const rightEye = landmarks[RIGHT_EYE];
    const leftEar = landmarks[LEFT_EAR];
    const rightEar = landmarks[RIGHT_EAR];
    const forehead = landmarks[FOREHEAD];

    // Calculate yaw (left-right rotation)
    // Based on the relative position of nose to face center
    const faceCenter = {
        x: (leftEye.x + rightEye.x) / 2,
        y: (leftEye.y + rightEye.y) / 2,
        z: (leftEye.z + rightEye.z) / 2,
    };

    const noseOffset = noseTip.x - faceCenter.x;
    const yaw = noseOffset * 3; // Increased sensitivity

    // Calculate pitch (up-down rotation)
    // Based on vertical distance between nose and chin vs forehead
    const faceHeight = Math.abs(forehead.y - chin.y);
    const noseToChindist = Math.abs(noseTip.y - chin.y);
    const noseToForeheadDist = Math.abs(forehead.y - noseTip.y);

    const pitchRatio = (noseToForeheadDist - noseToChindist) / faceHeight;
    const pitch = pitchRatio * 1.2; // Increased sensitivity

    // Calculate roll (tilt rotation)
    // Based on the angle between eyes
    const eyeDeltaY = rightEye.y - leftEye.y;
    const eyeDeltaX = rightEye.x - leftEye.x;
    const roll = Math.atan2(eyeDeltaY, eyeDeltaX);

    return {
        pitch: clamp(pitch, -0.8, 0.8), // Increased range
        yaw: clamp(yaw, -1.2, 1.2), // Increased range
        roll: clamp(roll, -0.6, 0.6), // Doubled range for better tilt
    };
};

/**
 * Calculate eye aspect ratio for blink detection
 */
export const calculateEyeAspectRatio = (
    landmarks: NormalizedLandmarkList,
    isLeftEye: boolean
): number => {
    // Left eye landmarks: 33, 160, 158, 133, 153, 144
    // Right eye landmarks: 263, 387, 385, 362, 380, 373
    const eyeIndices = isLeftEye
        ? [33, 160, 158, 133, 153, 144]
        : [263, 387, 385, 362, 380, 373];

    const points = eyeIndices.map((i) => landmarks[i]);

    // Calculate vertical distances
    const v1 = distance(points[1], points[5]);
    const v2 = distance(points[2], points[4]);

    // Calculate horizontal distance
    const h = distance(points[0], points[3]);

    // Eye aspect ratio
    const ear = (v1 + v2) / (2.0 * h);

    return ear;
};

/**
 * Detect if eyes are blinking
 */
export const detectBlink = (landmarks: NormalizedLandmarkList): {
    leftEyeClosed: boolean;
    rightEyeClosed: boolean;
    blinkAmount: number;
} => {
    const leftEAR = calculateEyeAspectRatio(landmarks, true);
    const rightEAR = calculateEyeAspectRatio(landmarks, false);

    const EAR_THRESHOLD = 0.2; // Threshold for blink detection

    return {
        leftEyeClosed: leftEAR < EAR_THRESHOLD,
        rightEyeClosed: rightEAR < EAR_THRESHOLD,
        blinkAmount: 1 - Math.min(leftEAR, rightEAR) / 0.3, // Normalized blink amount
    };
};

/**
 * Calculate mouth openness
 */
export const calculateMouthOpenness = (landmarks: NormalizedLandmarkList): number => {
    // Upper lip: 13, Lower lip: 14
    // Mouth corners: 61 (left), 291 (right)
    const upperLip = landmarks[13];
    const lowerLip = landmarks[14];
    const leftCorner = landmarks[61];
    const rightCorner = landmarks[291];

    const verticalDist = distance(upperLip, lowerLip);
    const horizontalDist = distance(leftCorner, rightCorner);

    // Normalize by face width
    const mouthOpenness = verticalDist / horizontalDist;

    return clamp(mouthOpenness * 3, 0, 1); // Scale and clamp
};

/**
 * Calculate eyebrow raise amount
 */
export const calculateEyebrowRaise = (
    landmarks: NormalizedLandmarkList
): { left: number; right: number } => {
    // Left eyebrow: 70, 63, 105, 66, 107
    // Right eyebrow: 300, 293, 334, 296, 336
    // Left eye top: 159
    // Right eye top: 386

    const leftBrowTop = landmarks[70];
    const rightBrowTop = landmarks[300];
    const leftEyeTop = landmarks[159];
    const rightEyeTop = landmarks[386];

    const leftDist = Math.abs(leftBrowTop.y - leftEyeTop.y);
    const rightDist = Math.abs(rightBrowTop.y - rightEyeTop.y);

    // Normalize (typical distance is around 0.03-0.05)
    const leftRaise = clamp((leftDist - 0.03) / 0.02, 0, 1);
    const rightRaise = clamp((rightDist - 0.03) / 0.02, 0, 1);

    return { left: leftRaise, right: rightRaise };
};

// Helper functions
function distance(p1: { x: number; y: number; z?: number }, p2: { x: number; y: number; z?: number }): number {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    const dz = (p1.z || 0) - (p2.z || 0);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}
