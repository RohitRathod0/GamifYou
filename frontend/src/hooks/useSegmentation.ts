/**
 * Legacy useSegmentation hook – kept for compatibility.
 * VirtualBackground.tsx now handles segmentation inline.
 */

export const useSegmentation = (_videoRef: React.RefObject<HTMLVideoElement>, _config?: any) => {
    return {
        isReady: false,
        segmentationMask: null,
        error: null,
        startSegmentation: () => { },
        stopSegmentation: () => { },
    };
};
