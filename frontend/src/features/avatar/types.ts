// Avatar feature type definitions

export interface AvatarExpression {
    happy: number;
    sad: number;
    angry: number;
    surprised: number;
    neutral: number;
    fearful: number;
    disgusted: number;
}

export interface HeadPose {
    pitch: number; // Rotation around X axis (nodding)
    yaw: number;   // Rotation around Y axis (shaking head)
    roll: number;  // Rotation around Z axis (tilting head)
}

export interface BlendShapes {
    // Eye controls
    eyeBlinkLeft: number;
    eyeBlinkRight: number;
    eyeWideLeft: number;
    eyeWideRight: number;

    // Eyebrow controls
    browInnerUp: number;
    browOuterUpLeft: number;
    browOuterUpRight: number;

    // Mouth controls
    mouthSmileLeft: number;
    mouthSmileRight: number;
    mouthFrownLeft: number;
    mouthFrownRight: number;
    mouthOpen: number;
    jawOpen: number;

    // Cheek controls
    cheekPuff: number;
}

export interface AvatarState {
    expression: AvatarExpression;
    headPose: HeadPose;
    blendShapes: BlendShapes;
    isTracking: boolean;
}

export interface AvatarModel {
    url: string;
    name: string;
    thumbnail?: string;
    scale?: number;
    position?: [number, number, number];
}

export const DEFAULT_AVATAR_MODELS: AvatarModel[] = [
    {
        name: 'Robot',
        url: '/models/robot.glb',
        scale: 1.0,
        position: [0, -1, 0]
    },
    {
        name: 'Character',
        url: '/models/character.glb',
        scale: 1.0,
        position: [0, -1.5, 0]
    }
];
