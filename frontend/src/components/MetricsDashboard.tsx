/**
 * MetricsDashboard — Post-game CV performance summary screen.
 *
 * Fetches session metrics from GET /api/cv/metrics/{player_id}
 * and displays gesture distribution, average latency, FPS, and
 * classification rate after a game ends.
 */
import React, { useEffect, useState } from 'react';

interface SessionMetrics {
    total_frames: number;
    classified_frames: number;
    stable_gestures_emitted: number;
    classification_rate: number;
    avg_processing_time_ms: number;
    frames_per_second: number;
    gesture_distribution: Record<string, number>;
    uptime_seconds: number;
}

export interface MetricsDashboardProps {
    playerId: string;
    roomCode: string;
    apiBaseUrl?: string;
    onClose?: () => void;
}

const GESTURE_COLORS: Record<string, string> = {
    OPEN_PALM: '#3b82f6',
    CLOSED_FIST: '#ef4444',
    POINTING: '#f59e0b',
    PEACE_SIGN: '#22c55e',
    THUMBS_UP: '#8b5cf6',
    PINCH: '#ec4899',
    UNKNOWN: '#6b7280',
};

function formatGesture(label: string): string {
    return label.split('_').map((w) => w.charAt(0) + w.slice(1).toLowerCase()).join(' ');
}

export const MetricsDashboard: React.FC<MetricsDashboardProps> = ({
    playerId,
    roomCode,
    apiBaseUrl = 'http://localhost:8000',
    onClose,
}) => {
    const [metrics, setMetrics] = useState<SessionMetrics | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchMetrics = async (): Promise<void> => {
            try {
                const res = await fetch(
                    `${apiBaseUrl}/api/cv/metrics/${playerId}?room_code=${roomCode}`
                );
                if (!res.ok) {
                    setError(`Could not load metrics (${res.status})`);
                    return;
                }
                const data: SessionMetrics = await res.json();
                setMetrics(data);
            } catch (err) {
                setError('Failed to connect to API');
            } finally {
                setLoading(false);
            }
        };
        fetchMetrics();
    }, [playerId, roomCode, apiBaseUrl]);

    if (loading) {
        return (
            <div style={styles.container}>
                <div style={styles.loading}>Loading your session metrics…</div>
            </div>
        );
    }

    if (error || !metrics) {
        return (
            <div style={styles.container}>
                <div style={styles.error}>{error ?? 'No metrics available'}</div>
                {onClose && (
                    <button style={styles.closeBtn} onClick={onClose}>
                        Continue
                    </button>
                )}
            </div>
        );
    }

    const totalGestures = Object.values(metrics.gesture_distribution).reduce(
        (a, b) => a + b,
        0
    );

    return (
        <div style={styles.container}>
            <div style={styles.card}>
                {/* Header */}
                <div style={styles.header}>
                    <h2 style={styles.title}>📊 Session Report</h2>
                    <span style={styles.uptime}>
                        {Math.round(metrics.uptime_seconds)}s session
                    </span>
                </div>

                {/* Key stats grid */}
                <div style={styles.statsGrid}>
                    <StatBox label="FPS" value={metrics.frames_per_second.toFixed(1)} unit="fps" />
                    <StatBox label="Latency" value={metrics.avg_processing_time_ms.toFixed(2)} unit="ms" />
                    <StatBox label="Frames" value={metrics.total_frames.toString()} />
                    <StatBox
                        label="Accuracy"
                        value={`${(metrics.classification_rate * 100).toFixed(0)}%`}
                    />
                </div>

                {/* Gesture distribution */}
                {totalGestures > 0 && (
                    <div style={styles.section}>
                        <h3 style={styles.sectionTitle}>Gesture Distribution</h3>
                        {Object.entries(metrics.gesture_distribution)
                            .sort(([, a], [, b]) => b - a)
                            .map(([label, count]) => {
                                const pct = Math.round((count / totalGestures) * 100);
                                const color = GESTURE_COLORS[label] ?? '#6b7280';
                                return (
                                    <div key={label} style={styles.barRow}>
                                        <span style={styles.barLabel}>{formatGesture(label)}</span>
                                        <div style={styles.barTrack}>
                                            <div
                                                style={{
                                                    ...styles.barFill,
                                                    width: `${pct}%`,
                                                    background: color,
                                                }}
                                            />
                                        </div>
                                        <span style={{ ...styles.barPct, color }}>{pct}%</span>
                                    </div>
                                );
                            })}
                    </div>
                )}

                {/* Stable gestures emitted */}
                <div style={styles.footer}>
                    <span style={styles.footerStat}>
                        {metrics.stable_gestures_emitted} confirmed gestures emitted
                    </span>
                </div>

                {onClose && (
                    <button style={styles.closeBtn} onClick={onClose}>
                        Back to Lobby
                    </button>
                )}
            </div>
        </div>
    );
};

const StatBox: React.FC<{ label: string; value: string; unit?: string }> = ({
    label,
    value,
    unit,
}) => (
    <div style={styles.statBox}>
        <span style={styles.statValue}>
            {value}
            {unit && <span style={styles.statUnit}> {unit}</span>}
        </span>
        <span style={styles.statLabel}>{label}</span>
    </div>
);

// ── Styles ────────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
    container: {
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(8px)',
        zIndex: 200,
        padding: 16,
    },
    card: {
        background: '#111827',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 20,
        padding: 28,
        width: '100%',
        maxWidth: 480,
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
        fontFamily: 'Inter, system-ui, sans-serif',
        color: '#e5e7eb',
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    title: {
        margin: 0,
        fontSize: 22,
        fontWeight: 700,
    },
    uptime: { color: '#6b7280', fontSize: 13 },
    statsGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 10,
    },
    statBox: {
        background: '#1f2937',
        borderRadius: 12,
        padding: '14px 10px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
    },
    statValue: { fontSize: 22, fontWeight: 700, color: '#f9fafb' },
    statUnit: { fontSize: 12, fontWeight: 400, color: '#9ca3af' },
    statLabel: { fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' },
    section: { display: 'flex', flexDirection: 'column', gap: 10 },
    sectionTitle: { margin: 0, fontSize: 14, fontWeight: 600, color: '#9ca3af' },
    barRow: { display: 'flex', alignItems: 'center', gap: 10 },
    barLabel: { fontSize: 13, minWidth: 100, color: '#d1d5db' },
    barTrack: {
        flex: 1,
        height: 8,
        background: '#374151',
        borderRadius: 99,
        overflow: 'hidden',
    },
    barFill: {
        height: '100%',
        borderRadius: 99,
        transition: 'width 0.4s ease',
    },
    barPct: { fontSize: 12, fontWeight: 600, minWidth: 32, textAlign: 'right' },
    footer: {
        borderTop: '1px solid rgba(255,255,255,0.08)',
        paddingTop: 12,
        textAlign: 'center',
    },
    footerStat: { color: '#6b7280', fontSize: 13 },
    closeBtn: {
        background: '#3b82f6',
        color: '#fff',
        border: 'none',
        borderRadius: 10,
        padding: '12px 24px',
        fontSize: 15,
        fontWeight: 600,
        cursor: 'pointer',
        width: '100%',
    },
    loading: { color: '#9ca3af', fontSize: 16, padding: 40 },
    error: { color: '#ef4444', padding: 24, textAlign: 'center' },
};

export default MetricsDashboard;
