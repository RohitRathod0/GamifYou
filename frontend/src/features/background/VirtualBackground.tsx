import React, { useRef, useEffect, useState, useCallback } from 'react';
import { BackgroundConfig } from './types';
import { BackgroundGallery } from './BackgroundGallery';
import { STYLE_FILTERS } from './backgroundData';
import { getSegmentation } from './segmentationSingleton';

// ─── Preloaded image cache (module-level, across mounts) ───────────────────────
const imgCache = new Map<string, HTMLImageElement>();

export const VirtualBackground: React.FC = () => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const segRef = useRef<any>(null);
    const rafRef = useRef<number>(0);
    const bgCfgRef = useRef<BackgroundConfig>({ type: 'none' });
    const lastMaskRef = useRef<CanvasImageSource | null>(null);
    const lastSendMs = useRef(0);
    const fpsRef = useRef({ frames: 0, last: Date.now() });

    const [bgConfig, setBgConfig] = useState<BackgroundConfig>({ type: 'none' });
    const [fps, setFps] = useState(0);
    const [isReady, setIsReady] = useState(false);
    const [cameraReady, setCameraReady] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loadStatus, setLoadStatus] = useState('Loading AI model…');

    // Keep ref in sync with state so render loop always reads latest without restarting
    useEffect(() => { bgCfgRef.current = bgConfig; }, [bgConfig]);

    // ── Camera ────────────────────────────────────────────────────────────────
    useEffect(() => {
        let stream: MediaStream | null = null;
        navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        })
            .then(s => {
                stream = s;
                if (videoRef.current) {
                    videoRef.current.srcObject = s;
                    videoRef.current.onloadedmetadata = () => setCameraReady(true);
                }
            })
            .catch(() => setError('Camera access denied. Please allow camera and refresh.'));
        return () => stream?.getTracks().forEach(t => t.stop());
    }, []);

    // ── MediaPipe init ────────────────────────────────────────────────────────
    useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                setLoadStatus('Loading MediaPipe from CDN…');
                const seg = await getSegmentation();
                // onResults: just store the mask — never block the render loop
                seg.onResults((r: any) => {
                    if (r?.segmentationMask) lastMaskRef.current = r.segmentationMask;
                });
                segRef.current = seg;
                if (mounted) { setIsReady(true); setLoadStatus(''); }
            } catch (e) {
                if (mounted) setError(`AI model failed to load: ${e}. Refresh the page.`);
            }
        })();
        return () => { mounted = false; };
    }, []);

    // ─────────────────────────────────────────────────────────────────────────
    // ONE render loop — starts once when ready, NEVER restarts.
    // Effect changes are picked up every tick via bgCfgRef.
    // ─────────────────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!isReady || !cameraReady) return;

        cancelAnimationFrame(rafRef.current);
        let alive = true;

        const tick = (now: DOMHighResTimeStamp) => {
            if (!alive) return;
            rafRef.current = requestAnimationFrame(tick);

            const video = videoRef.current;
            const canvas = canvasRef.current;
            const seg = segRef.current;
            if (!video || !canvas || !seg || video.readyState < 2) return;

            const W = video.videoWidth || 640;
            const H = video.videoHeight || 480;
            if (canvas.width !== W) canvas.width = W;
            if (canvas.height !== H) canvas.height = H;

            const ctx = canvas.getContext('2d')!;
            const cfg = bgCfgRef.current;

            // ── No effect: direct passthrough ──────────────────────────────
            if (cfg.type === 'none') {
                ctx.drawImage(video, 0, 0, W, H);
                countFps();
                return;
            }

            // ── Send a frame to MediaPipe at ~30 fps (fire-and-forget) ─────
            if (now - lastSendMs.current >= 33) {
                lastSendMs.current = now;
                try { seg.send({ image: video }); } catch { /* ignore */ }
            }

            const mask = lastMaskRef.current;

            if (!mask) {
                // Mask not yet arrived — show live video as fallback (no freeze)
                ctx.drawImage(video, 0, 0, W, H);
                countFps();
                return;
            }

            // ── Composite: person over chosen background ───────────────────
            ctx.save();
            ctx.clearRect(0, 0, W, H);

            // 1. Draw live video
            ctx.globalCompositeOperation = 'source-over';
            ctx.drawImage(video, 0, 0, W, H);

            // 2. Keep ONLY person pixels (cut with mask)
            ctx.globalCompositeOperation = 'destination-in';
            ctx.drawImage(mask, 0, 0, W, H);

            // 3. Paint background BEHIND person
            ctx.globalCompositeOperation = 'destination-over';
            applyBackground(ctx, video, cfg, W, H);

            ctx.globalCompositeOperation = 'source-over';
            ctx.restore();

            countFps();
        };

        rafRef.current = requestAnimationFrame(tick);
        return () => {
            alive = false;
            cancelAnimationFrame(rafRef.current);
        };
    }, [isReady, cameraReady]); // ← only camera/model ready; NOT bgConfig

    // ── Background painter ────────────────────────────────────────────────────
    const applyBackground = (
        ctx: CanvasRenderingContext2D,
        video: HTMLVideoElement,
        cfg: BackgroundConfig,
        W: number, H: number
    ) => {
        if (cfg.type === 'blur') {
            // Inline blur using ctx.filter (no extra canvas needed)
            ctx.filter = `blur(${cfg.blurAmount ?? 15}px)`;
            ctx.drawImage(video, 0, 0, W, H);
            ctx.filter = 'none';

        } else if (cfg.type === 'color') {
            ctx.fillStyle = cfg.color ?? '#003366';
            ctx.fillRect(0, 0, W, H);

        } else if (cfg.type === 'image' && cfg.imageUrl) {
            const cached = imgCache.get(cfg.imageUrl);
            if (cached) {
                ctx.drawImage(cached, 0, 0, W, H);
            } else {
                // Fallback blur while image loads
                ctx.filter = 'blur(12px)';
                ctx.drawImage(video, 0, 0, W, H);
                ctx.filter = 'none';
                // Pre-load image into cache
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => imgCache.set(cfg.imageUrl!, img);
                img.src = cfg.imageUrl;
            }

        } else if (cfg.type === 'gradient' && cfg.gradientColors?.length) {
            const rad = ((cfg.gradientAngle ?? 135) * Math.PI) / 180;
            const grad = ctx.createLinearGradient(
                W / 2 - Math.cos(rad) * W / 2, H / 2 - Math.sin(rad) * H / 2,
                W / 2 + Math.cos(rad) * W / 2, H / 2 + Math.sin(rad) * H / 2
            );
            cfg.gradientColors.forEach((c, i) =>
                grad.addColorStop(i / Math.max(cfg.gradientColors!.length - 1, 1), c)
            );
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, W, H);

        } else if (cfg.type === 'style' && cfg.styleFilter) {
            const filterDef = STYLE_FILTERS.find(f => f.id === cfg.styleFilter);
            ctx.filter = filterDef?.cssFilter ?? 'none';
            ctx.drawImage(video, 0, 0, W, H);
            ctx.filter = 'none';
        }
    };

    // ── FPS counter ───────────────────────────────────────────────────────────
    const countFps = useCallback(() => {
        fpsRef.current.frames++;
        const now = Date.now();
        if (now - fpsRef.current.last >= 1000) {
            setFps(fpsRef.current.frames);
            fpsRef.current.frames = 0;
            fpsRef.current.last = now;
        }
    }, []);

    // ── Background selection ──────────────────────────────────────────────────
    const handleSelectBackground = (cfg: BackgroundConfig) => {
        lastMaskRef.current = null; // clear stale mask when switching
        setBgConfig(cfg);
    };

    const modeLabel = () => {
        switch (bgConfig.type) {
            case 'blur': return `Blur ${bgConfig.blurAmount ?? 15}px`;
            case 'image': return 'Image';
            case 'color': return 'Color';
            case 'gradient': return 'Gradient';
            case 'style': return STYLE_FILTERS.find(f => f.id === bgConfig.styleFilter)?.name ?? 'Filter';
            default: return 'Off';
        }
    };

    const isActive = bgConfig.type !== 'none' && isReady && cameraReady;

    return (
        <div style={{
            minHeight: '100vh',
            background: 'linear-gradient(160deg,#0a0a12 0%,#0f0f1e 100%)',
            padding: '24px', boxSizing: 'border-box',
            fontFamily: "'Segoe UI', sans-serif", color: '#fff',
        }}>
            <div style={{ marginBottom: '20px' }}>
                <h1 style={{ margin: 0, fontSize: '1.7rem', fontWeight: 700 }}>🎭 Virtual Background</h1>
                <p style={{ color: '#666', margin: '4px 0 0', fontSize: '13px' }}>
                    Real-time AI background replacement · MediaPipe Selfie Segmentation
                </p>
            </div>

            {error && (
                <div style={{
                    padding: '10px 16px', marginBottom: '18px',
                    background: 'rgba(239,68,68,.12)', border: '1px solid rgba(239,68,68,.3)',
                    borderRadius: '8px', color: '#fca5a5', fontSize: '13px',
                }}>⚠️ {error}</div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '22px', alignItems: 'start' }}>
                <div>
                    <div style={{
                        position: 'relative', borderRadius: '16px', overflow: 'hidden',
                        background: '#111', aspectRatio: '16/9',
                        boxShadow: '0 16px 48px rgba(0,0,0,.6)',
                        border: '1px solid rgba(255,255,255,.07)',
                    }}>
                        {/* Video must NOT be display:none — Chrome stops decoding frames for hidden elements.
                             Keep it in the layout but invisible via opacity+absolute so drawImage() works. */}
                        <video ref={videoRef} autoPlay playsInline muted style={{
                            position: 'absolute', inset: 0,
                            width: '100%', height: '100%',
                            opacity: 0, pointerEvents: 'none',
                        }} />

                        {/* Canvas is ALWAYS the display — no switching */}
                        <canvas ref={canvasRef} style={{
                            width: '100%', height: '100%',
                            objectFit: 'cover', transform: 'scaleX(-1)',
                            display: 'block',
                        }} />

                        {/* Overlays */}
                        {isReady && cameraReady && (
                            <div style={{
                                position: 'absolute', top: '10px', right: '10px',
                                background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(6px)',
                                padding: '2px 10px', borderRadius: '10px',
                                fontSize: '12px', color: fps >= 10 ? '#4ade80' : '#fb923c',
                            }}>{fps} FPS</div>
                        )}
                        {isActive && (
                            <div style={{
                                position: 'absolute', top: '10px', left: '10px',
                                background: 'linear-gradient(135deg,rgba(124,58,237,.7),rgba(6,182,212,.7))',
                                padding: '2px 10px', borderRadius: '10px', fontSize: '12px', color: '#fff',
                            }}>{modeLabel()}</div>
                        )}

                        {/* Loading overlay */}
                        {!isReady && (
                            <div style={{
                                position: 'absolute', inset: 0,
                                display: 'flex', flexDirection: 'column',
                                alignItems: 'center', justifyContent: 'center',
                                background: 'rgba(0,0,0,.8)',
                            }}>
                                <div style={{
                                    width: '40px', height: '40px',
                                    border: '3px solid rgba(255,255,255,.1)',
                                    borderTop: '3px solid #06b6d4', borderRadius: '50%',
                                    marginBottom: '12px', animation: 'spin .9s linear infinite',
                                }} />
                                <p style={{ color: '#aaa', fontSize: '13px', margin: 0 }}>{loadStatus}</p>
                                <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
                            </div>
                        )}
                    </div>

                    {/* Status badges */}
                    <div style={{ marginTop: '16px', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <span style={{
                            padding: '5px 12px', borderRadius: '18px', fontSize: '12px',
                            background: isReady ? 'rgba(74,222,128,.12)' : 'rgba(251,146,60,.12)',
                            color: isReady ? '#4ade80' : '#fb923c',
                        }}>{isReady ? '✅ Model Ready' : '⏳ Loading…'}</span>
                        <span style={{
                            padding: '5px 12px', borderRadius: '18px', fontSize: '12px',
                            background: cameraReady ? 'rgba(74,222,128,.12)' : 'rgba(255,255,255,.05)',
                            color: cameraReady ? '#4ade80' : '#666',
                        }}>{cameraReady ? '📷 Camera On' : '📷 Camera…'}</span>
                        <span style={{
                            padding: '5px 12px', borderRadius: '18px', fontSize: '12px',
                            background: isActive ? 'rgba(239,68,68,.12)' : 'rgba(255,255,255,.05)',
                            color: isActive ? '#f87171' : '#555',
                        }}>{isActive ? '🔴 Live' : '⚫ No Effect'}</span>
                    </div>
                </div>

                <div style={{ position: 'sticky', top: '24px' }}>
                    <BackgroundGallery
                        onSelectBackground={handleSelectBackground}
                        currentConfig={bgConfig}
                    />
                </div>
            </div>
        </div>
    );
};
