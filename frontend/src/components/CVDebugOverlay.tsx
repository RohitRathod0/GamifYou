/**
 * CVDebugOverlay — Real-time Computer Vision debug display.
 *
 * Renders over the video feed showing:
 *   - Current classified gesture (with colour-coded confidence)
 *   - Confidence progress bar
 *   - Per-finger extension state (5 circles)
 *   - Pipeline processing latency
 *   - Frames-per-second counter
 *
 * Toggle with keyboard shortcut: D
 */
import React, { useEffect, useState } from 'react';

export interface CVDebugOverlayProps {
    /** Whether the overlay is visible */
    enabled: boolean;
    /** Raw gesture label from the current frame (e.g. "OPEN_PALM") */
    gesture: string;
    /** Classifier confidence 0.0 – 1.0 */
    confidence: number;
    /** Frames per second from MediaPipe */
    fps: number;
    /** Per-finger extension state */
    fingerStates: Record<string, boolean>;
    /** CV pipeline latency in milliseconds */
    processingTimeMs: number;
    /** Stable gesture confirmed by the smoothing buffer (or null) */
    stableGesture?: string | null;
}

const FINGER_LABELS = ['thumb', 'index', 'middle', 'ring', 'pinky'];

/** Returns a CSS colour based on confidence value. */
function confidenceColor(confidence: number): string {
    if (confidence >= 0.9) return '#22c55e';  // green-500
    if (confidence >= 0.75) return '#f59e0b'; // amber-500
    return '#ef4444';                          // red-500
}

/** Formats a gesture label for display (OPEN_PALM → Open Palm). */
function formatLabel(label: string): string {
    return label
        .split('_')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
}

export const CVDebugOverlay: React.FC<CVDebugOverlayProps> = ({
    enabled,
    gesture,
    confidence,
    fps,
    fingerStates,
    processingTimeMs,
    stableGesture,
}) => {
    const [visible, setVisible] = useState<boolean>(enabled);

    // Toggle overlay with keyboard shortcut D
    useEffect(() => {
        const handleKey = (e: KeyboardEvent): void => {
            if (e.key === 'd' || e.key === 'D') {
                setVisible((v) => !v);
            }
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, []);

    // Sync with prop changes
    useEffect(() => {
        setVisible(enabled);
    }, [enabled]);

    if (!visible) return null;

    const color = confidenceColor(confidence);
    const confidencePct = Math.round(confidence * 100);

    return (
        <div style={styles.overlay}>
            {/* Header */}
            <div style={styles.header}>
                <span style={styles.badge}>CV DEBUG</span>
                <span style={styles.fpsLabel}>{fps.toFixed(1)} fps</span>
            </div>

            {/* Gesture label */}
            <div style={{ ...styles.gestureLabel, color }}>
                {gesture ? formatLabel(gesture) : 'No Gesture'}
            </div>

            {/* Stable gesture badge */}
            {stableGesture && stableGesture !== gesture && (
                <div style={styles.stableBadge}>
                    ✅ Stable: {formatLabel(stableGesture)}
                </div>
            )}

            {/* Confidence bar */}
            <div style={styles.confidenceRow}>
                <span style={styles.metricLabel}>Confidence</span>
                <div style={styles.barTrack}>
                    <div
                        style={{
                            ...styles.barFill,
                            width: `${confidencePct}%`,
                            background: color,
                        }}
                    />
                </div>
                <span style={{ ...styles.metricValue, color }}>{confidencePct}%</span>
            </div>

            {/* Finger state indicators */}
            <div style={styles.fingerRow}>
                {FINGER_LABELS.map((finger) => (
                    <div key={finger} style={styles.fingerItem}>
                        <div
                            style={{
                                ...styles.fingerDot,
                                background: fingerStates[finger] ? '#22c55e' : '#374151',
                                border: fingerStates[finger]
                                    ? '2px solid #4ade80'
                                    : '2px solid #6b7280',
                            }}
                        />
                        <span style={styles.fingerLabel}>{finger[0].toUpperCase()}</span>
                    </div>
                ))}
            </div>

            {/* Processing latency */}
            <div style={styles.latencyRow}>
                <span style={styles.metricLabel}>Pipeline latency</span>
                <span style={styles.metricValue}>{processingTimeMs.toFixed(2)} ms</span>
            </div>

            {/* Shortcut hint */}
            <div style={styles.hint}>Press D to toggle</div>
        </div>
    );
};

// ── Inline Styles ─────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
    overlay: {
        position: 'absolute',
        top: 12,
        left: 12,
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(6px)',
        border: '1px solid rgba(255,255,255,0.15)',
        borderRadius: 12,
        padding: '12px 16px',
        minWidth: 220,
        zIndex: 100,
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        fontSize: 12,
        color: '#e5e7eb',
        userSelect: 'none',
        pointerEvents: 'none',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
    },
    header: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    badge: {
        background: '#3b82f6',
        color: '#fff',
        borderRadius: 4,
        padding: '2px 6px',
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.05em',
    },
    fpsLabel: {
        color: '#9ca3af',
        fontSize: 11,
    },
    gestureLabel: {
        fontSize: 22,
        fontWeight: 700,
        lineHeight: 1.2,
        letterSpacing: '-0.01em',
    },
    stableBadge: {
        fontSize: 11,
        color: '#4ade80',
        background: 'rgba(34,197,94,0.12)',
        borderRadius: 4,
        padding: '2px 8px',
    },
    confidenceRow: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
    },
    barTrack: {
        flex: 1,
        height: 6,
        background: '#374151',
        borderRadius: 99,
        overflow: 'hidden',
    },
    barFill: {
        height: '100%',
        borderRadius: 99,
        transition: 'width 0.1s ease, background 0.2s ease',
    },
    metricLabel: {
        color: '#9ca3af',
        whiteSpace: 'nowrap',
        fontSize: 11,
    },
    metricValue: {
        fontWeight: 600,
        whiteSpace: 'nowrap',
    },
    fingerRow: {
        display: 'flex',
        gap: 8,
        alignItems: 'center',
    },
    fingerItem: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
    },
    fingerDot: {
        width: 14,
        height: 14,
        borderRadius: '50%',
        transition: 'background 0.12s ease',
    },
    fingerLabel: {
        fontSize: 10,
        color: '#6b7280',
    },
    latencyRow: {
        display: 'flex',
        justifyContent: 'space-between',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        paddingTop: 6,
    },
    hint: {
        color: '#4b5563',
        fontSize: 10,
        textAlign: 'center',
    },
};

export default CVDebugOverlay;
