/**
 * Types for Virtual Background and Style Transfer features
 */

export type BackgroundType = 'none' | 'blur' | 'image' | 'color' | 'gradient' | 'style';

export interface BackgroundConfig {
    type: BackgroundType;
    blurAmount?: number;       // 0–20, for blur type
    imageUrl?: string;         // for image type (preset or uploaded data URL)
    color?: string;            // for color type (hex)
    gradientColors?: string[]; // for gradient type
    gradientAngle?: number;    // 0–360 degrees
    styleFilter?: StyleFilter; // for style type
}

export type StyleFilter =
    | 'grayscale'
    | 'sepia'
    | 'invert'
    | 'neon'
    | 'vintage'
    | 'cool'
    | 'warm'
    | 'hue-rotate'
    | 'pixelate';

export interface StyleFilterDef {
    id: StyleFilter;
    name: string;
    emoji: string;
    cssFilter: string;
}

export interface BackgroundImage {
    id: string;
    name: string;
    url: string;
    thumbnail: string;
    category: 'nature' | 'office' | 'abstract' | 'space' | 'city';
}

export interface GradientPreset {
    name: string;
    colors: string[];
    angle: number;
}

export interface SegmentationResult {
    mask: ImageData;
}

