import { useRef, useEffect, useState } from 'react';
import { useHandTracking } from '@/hooks/useHandTracking';
import { BackgroundConfig } from '@/features/background/types';
import { STYLE_FILTERS, BACKGROUND_IMAGES } from '@/features/background/backgroundData';
import { getSegmentation } from '@/features/background/segmentationSingleton';


interface VideoFeedProps {
    localStream?: MediaStream | null;
    onTrackingData?: (data: any, dataRef?: React.MutableRefObject<any>) => void;
}

const QUICK_BG: { label: string; emoji: string; config: BackgroundConfig }[] = [
    { label: 'Off', emoji: '🚫', config: { type: 'none' } },
    { label: 'Blur', emoji: '🌫️', config: { type: 'blur', blurAmount: 14 } },
    { label: 'Gradient', emoji: '🌈', config: { type: 'gradient', gradientColors: ['#0f0c29', '#302b63', '#24243e'], gradientAngle: 135 } },
    { label: 'Neon', emoji: '💜', config: { type: 'style', styleFilter: 'neon' } },
    { label: 'Space', emoji: '🚀', config: { type: 'image', imageUrl: BACKGROUND_IMAGES.find(b => b.id === 'space')?.url ?? '' } },
    { label: 'Beach', emoji: '🏖️', config: { type: 'image', imageUrl: BACKGROUND_IMAGES.find(b => b.id === 'beach')?.url ?? '' } },
    { label: 'Office', emoji: '🏢', config: { type: 'image', imageUrl: BACKGROUND_IMAGES.find(b => b.id === 'office')?.url ?? '' } },
    { label: 'Sepia', emoji: '📷', config: { type: 'style', styleFilter: 'vintage' } },
];

export const VideoFeed: React.FC<VideoFeedProps> = ({ localStream = undefined, onTrackingData }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const segRef = useRef<any>(null);
    const animRef = useRef<number>(0);
    const bgImageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
    const gradCacheRef = useRef<HTMLCanvasElement | null>(null);
    const blurCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const bgConfigRef = useRef<BackgroundConfig>({ type: 'none' });
    const fpsRef = useRef({ frames: 0, last: Date.now() });
    const isProcessingRef = useRef(false);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const [bgConfig, setBgConfig] = useState<BackgroundConfig>({ type: 'none' });
    const [isActive, setIsActive] = useState(false);
    const [modelReady, setModelReady] = useState(false);
    const [showPanel, setShowPanel] = useState(false);
    const [fps, setFps] = useState(0);

    useEffect(() => { bgConfigRef.current = bgConfig; }, [bgConfig]);

    // ── Hand tracking ─────────────────────────────────────────────────────────
    const { isReady: trackingReady, trackingData, trackingDataRef } = useHandTracking(videoRef, localStream);
    useEffect(() => {
        if (onTrackingData && trackingData) onTrackingData(trackingData, trackingDataRef);
    }, [trackingData, trackingDataRef, onTrackingData]);

    // ── Pre-blur helper ───────────────────────────────────────────────────────
    const getBlurredBg = (video: HTMLVideoElement, W: number, H: number, px: number) => {
        let bc = blurCanvasRef.current;
        if (!bc || bc.width !== W || bc.height !== H) {
            bc = document.createElement('canvas');
            bc.width = W; bc.height = H;
            blurCanvasRef.current = bc;
        }
        const ctx = bc.getContext('2d')!;
        ctx.filter = `blur(${px}px)`;
        ctx.drawImage(video, 0, 0, W, H);
        ctx.filter = 'none';
        return bc;
    };

    // ── MediaPipe init — shared singleton (StrictMode-safe) ──────────────────
    useEffect(() => {
        let mounted = true;
        const init = async () => {
            try {
                const seg = await getSegmentation();

                // onResults is just a callback — safe to reassign on the existing singleton
                seg.onResults((results: any) => {
                    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
                    isProcessingRef.current = false;

                    const video = videoRef.current;
                    const canvas = canvasRef.current;
                    if (!video || !canvas || !results.segmentationMask) return;

                    const W = video.videoWidth || 320;
                    const H = video.videoHeight || 240;
                    if (canvas.width !== W) canvas.width = W;
                    if (canvas.height !== H) canvas.height = H;

                    const ctx = canvas.getContext('2d')!;
                    const cfg = bgConfigRef.current;

                    ctx.save();
                    ctx.clearRect(0, 0, W, H);

                    ctx.globalCompositeOperation = 'source-over';
                    ctx.drawImage(video, 0, 0, W, H);

                    ctx.globalCompositeOperation = 'destination-in';
                    ctx.drawImage(results.segmentationMask, 0, 0, W, H);

                    ctx.globalCompositeOperation = 'destination-over';

                    if (cfg.type === 'blur') {
                        ctx.drawImage(getBlurredBg(video, W, H, cfg.blurAmount ?? 14), 0, 0, W, H);

                    } else if (cfg.type === 'color') {
                        ctx.fillStyle = cfg.color ?? '#003366';
                        ctx.fillRect(0, 0, W, H);

                    } else if (cfg.type === 'image' && cfg.imageUrl) {
                        const cached = bgImageCacheRef.current.get(cfg.imageUrl);
                        if (cached) {
                            ctx.drawImage(cached, 0, 0, W, H);
                        } else {
                            const img = new Image();
                            img.crossOrigin = 'anonymous';
                            img.onload = () => bgImageCacheRef.current.set(cfg.imageUrl!, img);
                            img.src = cfg.imageUrl;
                            ctx.drawImage(getBlurredBg(video, W, H, 12), 0, 0, W, H);
                        }

                    } else if (cfg.type === 'gradient' && cfg.gradientColors?.length) {
                        if (!gradCacheRef.current ||
                            gradCacheRef.current.width !== W ||
                            gradCacheRef.current.height !== H) {
                            const gc = document.createElement('canvas');
                            gc.width = W; gc.height = H;
                            const gCtx = gc.getContext('2d')!;
                            const rad = (cfg.gradientAngle ?? 135) * Math.PI / 180;
                            const grad = gCtx.createLinearGradient(
                                W / 2 - Math.cos(rad) * W / 2, H / 2 - Math.sin(rad) * H / 2,
                                W / 2 + Math.cos(rad) * W / 2, H / 2 + Math.sin(rad) * H / 2
                            );
                            cfg.gradientColors.forEach((c, i) =>
                                grad.addColorStop(i / Math.max(cfg.gradientColors!.length - 1, 1), c));
                            gCtx.fillStyle = grad;
                            gCtx.fillRect(0, 0, W, H);
                            gradCacheRef.current = gc;
                        }
                        ctx.drawImage(gradCacheRef.current!, 0, 0, W, H);

                    } else if (cfg.type === 'style' && cfg.styleFilter) {
                        const fDef = STYLE_FILTERS.find(f => f.id === cfg.styleFilter);
                        const sc = document.createElement('canvas');
                        sc.width = W; sc.height = H;
                        const sCtx = sc.getContext('2d')!;
                        sCtx.filter = fDef?.cssFilter ?? 'none';
                        sCtx.drawImage(video, 0, 0, W, H);
                        sCtx.filter = 'none';
                        ctx.drawImage(sc, 0, 0, W, H);
                    }

                    ctx.globalCompositeOperation = 'source-over';
                    ctx.restore();

                    fpsRef.current.frames++;
                    const now = Date.now();
                    if (now - fpsRef.current.last >= 1000) {
                        setFps(fpsRef.current.frames);
                        fpsRef.current.frames = 0;
                        fpsRef.current.last = now;
                    }
                });

                segRef.current = seg;
                if (mounted) setModelReady(true);
            } catch (err) {
                console.warn('VideoFeed segmentation load failed:', err);
            }
        };
        init();
        return () => { mounted = false; };
    }, []);

    useEffect(() => {
        if (bgConfig.type === 'gradient') gradCacheRef.current = null;
        if (bgConfig.type === 'blur') blurCanvasRef.current = null;
    }, [bgConfig]);

    // ── Animation loop ────────────────────────────────────────────────────────
    useEffect(() => {
        cancelAnimationFrame(animRef.current);
        if (!isActive || !modelReady) return;

        let running = true;

        const loop = () => {
            if (!running) return;

            const video = videoRef.current;
            const canvas = canvasRef.current;
            const seg = segRef.current;
            const cfg = bgConfigRef.current;

            if (video && canvas && seg && video.readyState >= 2) {
                const W = video.videoWidth || 320;
                const H = video.videoHeight || 240;
                if (canvas.width !== W) canvas.width = W;
                if (canvas.height !== H) canvas.height = H;

                if (cfg.type === 'none') {
                    const ctx = canvas.getContext('2d')!;
                    ctx.drawImage(video, 0, 0, W, H);
                } else if (!isProcessingRef.current) {
                    isProcessingRef.current = true;
                    timeoutRef.current = setTimeout(() => {
                        isProcessingRef.current = false;
                        timeoutRef.current = null;
                    }, 1000);
                    seg.send({ image: video });
                }
            }

            animRef.current = requestAnimationFrame(loop);
        };

        loop();
        return () => {
            running = false;
            cancelAnimationFrame(animRef.current);
            if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
        };
    }, [isActive, modelReady]);

    const selectBg = (cfg: BackgroundConfig) => {
        setBgConfig(cfg);
        setIsActive(cfg.type !== 'none');
    };

    return (
        <div style={{
            position: 'fixed', top: '16px', right: '16px', zIndex: 1000,
            display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px',
        }}>
            <div style={{
                position: 'relative', borderRadius: '12px', overflow: 'hidden',
                border: '2px solid #333', boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                width: '240px', height: '180px', background: '#000',
            }}>
                <video ref={videoRef} autoPlay playsInline muted style={{
                    position: 'absolute', inset: 0, width: '100%', height: '100%',
                    objectFit: 'cover', transform: 'scaleX(-1)',
                    display: isActive ? 'none' : 'block',
                }} />

                <canvas ref={canvasRef} style={{
                    position: 'absolute', inset: 0, width: '100%', height: '100%',
                    objectFit: 'cover', transform: 'scaleX(-1)',
                    display: isActive ? 'block' : 'none',
                }} />

                {isActive && (
                    <div style={{
                        position: 'absolute', bottom: '6px', left: '6px',
                        background: 'rgba(0,0,0,0.6)', padding: '2px 7px',
                        borderRadius: '8px', fontSize: '10px',
                        color: fps >= 10 ? '#4ade80' : '#fb923c',
                    }}>{fps} FPS</div>
                )}

                {trackingReady && (
                    <div style={{
                        position: 'absolute', top: '6px', left: '6px',
                        background: 'rgba(0,200,0,0.8)', padding: '2px 7px',
                        borderRadius: '6px', fontSize: '10px', color: '#000', fontWeight: 700,
                    }}>✓ Tracking</div>
                )}

                {isActive && bgConfig.type !== 'none' && (
                    <div style={{
                        position: 'absolute', top: '6px', right: '6px',
                        background: 'linear-gradient(135deg,rgba(124,58,237,.8),rgba(6,182,212,.8))',
                        padding: '2px 7px', borderRadius: '6px', fontSize: '10px', color: '#fff',
                    }}>🎭 BG</div>
                )}

                <button onClick={() => setShowPanel(v => !v)} style={{
                    position: 'absolute', bottom: '6px', right: '6px',
                    background: showPanel ? 'linear-gradient(135deg,#7c3aed,#06b6d4)' : 'rgba(0,0,0,0.6)',
                    border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: '6px', padding: '3px 7px',
                    color: '#fff', fontSize: '14px', cursor: 'pointer', lineHeight: 1,
                }}>🎨</button>
            </div>

            {showPanel && (
                <div style={{
                    background: 'linear-gradient(160deg,#1e1e2e,#16161d)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '12px', padding: '12px', width: '240px',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                    color: '#fff', fontFamily: "'Segoe UI', sans-serif",
                }}>
                    <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: '8px', color: '#06b6d4' }}>
                        🎭 Virtual Background
                        {!modelReady && <span style={{ color: '#fb923c', marginLeft: '8px', fontSize: '10px' }}>⏳ Loading AI…</span>}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '6px' }}>
                        {QUICK_BG.map(p => {
                            const sel = bgConfig.type === p.config.type &&
                                (p.config.type !== 'image' || bgConfig.imageUrl === p.config.imageUrl) &&
                                (p.config.type !== 'style' || bgConfig.styleFilter === p.config.styleFilter);
                            return (
                                <div key={p.label} onClick={() => modelReady && selectBg(p.config)} title={p.label}
                                    style={{
                                        padding: '7px 4px',
                                        background: sel ? 'linear-gradient(135deg,rgba(124,58,237,.4),rgba(6,182,212,.4))' : 'rgba(255,255,255,0.05)',
                                        border: sel ? '1px solid rgba(6,182,212,.6)' : '1px solid rgba(255,255,255,0.08)',
                                        borderRadius: '8px', textAlign: 'center',
                                        cursor: modelReady ? 'pointer' : 'not-allowed',
                                        opacity: modelReady ? 1 : 0.4, transition: 'all 0.2s',
                                    }}>
                                    <div style={{ fontSize: '18px' }}>{p.emoji}</div>
                                    <div style={{ fontSize: '9px', color: '#aaa', marginTop: '2px' }}>{p.label}</div>
                                </div>
                            );
                        })}
                    </div>

                    {bgConfig.type === 'blur' && (
                        <div style={{ marginTop: '10px' }}>
                            <label style={{ fontSize: '11px', color: '#888' }}>
                                Blur: <strong style={{ color: '#06b6d4' }}>{bgConfig.blurAmount ?? 14}px</strong>
                            </label>
                            <input type="range" min={4} max={30} value={bgConfig.blurAmount ?? 14}
                                onChange={e => selectBg({ type: 'blur', blurAmount: +e.target.value })}
                                style={{ width: '100%', marginTop: '4px', accentColor: '#06b6d4' }}
                            />
                        </div>
                    )}

                    <a href="/virtual-background" target="_blank" rel="noreferrer"
                        style={{
                            display: 'block', marginTop: '10px', textAlign: 'center',
                            fontSize: '11px', color: '#06b6d4', textDecoration: 'none',
                            padding: '5px', borderRadius: '6px',
                            background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.2)',
                        }}>↗ Full settings &amp; more backgrounds</a>
                </div>
            )}

            {trackingData.handedness.length > 0 && (
                <div style={{
                    background: 'rgba(0,0,0,0.7)', color: '#fff',
                    padding: '4px 10px', borderRadius: '6px', fontSize: '11px',
                }}>Hands: {trackingData.handedness.join(', ')}</div>
            )}
        </div>
    );
};
