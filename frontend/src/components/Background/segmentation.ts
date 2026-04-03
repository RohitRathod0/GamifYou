/**
 * Legacy segmentation utilities – kept for compatibility.
 * VirtualBackground.tsx now handles segmentation inline.
 */

interface SegmentationConfig {
    modelSelection: 0 | 1;
    selfieMode: boolean;
}

interface SegmentationResult {
    mask: ImageData;
    width: number;
    height: number;
    timestamp: number;
}

export type { SegmentationConfig, SegmentationResult };

export const initializeSegmentation = async (_config?: SegmentationConfig) => {
    console.warn('initializeSegmentation is deprecated; use VirtualBackground component directly.');
};

export const segmentPerson = async (_video: HTMLVideoElement): Promise<SegmentationResult | null> => null;

export const cleanupSegmentation = () => { };
