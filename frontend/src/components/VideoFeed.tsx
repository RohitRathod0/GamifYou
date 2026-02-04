import { useRef, useEffect } from 'react';
import { useHandTracking } from '@/hooks/useHandTracking';

interface VideoFeedProps {
    onTrackingData?: (data: any) => void;
}

export const VideoFeed: React.FC<VideoFeedProps> = ({ onTrackingData }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const { isReady, trackingData } = useHandTracking(videoRef);

    // Pass tracking data to parent component (in useEffect to avoid setState during render)
    useEffect(() => {
        if (onTrackingData && trackingData) {
            onTrackingData(trackingData);
        }
    }, [trackingData, onTrackingData]);

    return (
        <div style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            zIndex: 1000,
            border: '2px solid #333',
            borderRadius: '10px',
            overflow: 'hidden'
        }}>
            <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={{
                    width: '320px',
                    height: '240px',
                    transform: 'scaleX(-1)', // Mirror the video
                    backgroundColor: '#000'
                }}
            />
            {isReady && (
                <div style={{
                    position: 'absolute',
                    top: '10px',
                    left: '10px',
                    backgroundColor: 'rgba(0, 255, 0, 0.8)',
                    color: '#000',
                    padding: '5px 10px',
                    borderRadius: '5px',
                    fontSize: '12px',
                    fontWeight: 'bold'
                }}>
                    ✓ Tracking Active
                </div>
            )}
            {trackingData.handedness.length > 0 && (
                <div style={{
                    position: 'absolute',
                    bottom: '10px',
                    left: '10px',
                    backgroundColor: 'rgba(0, 0, 0, 0.7)',
                    color: '#fff',
                    padding: '5px 10px',
                    borderRadius: '5px',
                    fontSize: '12px'
                }}>
                    Hands: {trackingData.handedness.join(', ')}
                </div>
            )}
        </div>
    );
};
