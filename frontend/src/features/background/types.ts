/**
 * Types for Virtual Background and Style Transfer features
 */

export type BackgroundType = 'none' | 'blur' | 'image' | 'color' | 'style';

export interface SegmentationResult {
    mask: ImageData;
    width: number;
    height: number;
    timestamp: number;
}

export interface BackgroundConfig {
    type: BackgroundType;
    blurAmount?: number; // 0-20, for blur type
    imageUrl?: string; // for image type
    color?: string; // for color type (hex or rgb)
    styleModel?: string; // for style transfer
}

export interface VirtualBackgroundOptions {
    enabled: boolean;
    config: BackgroundConfig;
    quality: 'low' | 'medium' | 'high';
    edgeSmoothing: number; // 0-1
}

export interface BackgroundImage {
    id: string;
    name: string;
    url: string;
    thumbnail: string;
    category: 'nature' | 'office' | 'abstract' | 'space' | 'city';
}

export interface StyleTransferModel {
    id: string;
    name: string;
    description: string;
    modelUrl: string;
    thumbnail: string;
    artist?: string;
}

export interface SegmentationConfig {
    modelSelection: 0 | 1; // 0 = general, 1 = landscape
    selfieMode: boolean;
}
