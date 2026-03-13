/**
 * FacePuzzle.tsx — AR Face Sliding Puzzle v4
 *
 * DRAW phase (NEW):
 *   - Index fingertip silently builds a bounding box (no messy trail)
 *   - Only a clean dashed rectangle + fingertip dot are drawn
 *   - ✌️ Peace sign held 10 frames → captures that bbox region → SOLVE phase
 *
 * SOLVE phase:
 *   - Index finger hover identifies tile
 *   - Swipe > 50px (canvas pixels) slides that specific tile if blank is adjacent
 *   - ✌️ Peace sign → restart
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { HandTrackingData } from '@/hooks/useHandTracking';
import { drawHandSkeleton, landmarkToCanvas, HandLandmark } from './GestureController';

// ── Constants ─────────────────────────────────────────────────────────────────
const GRID = 3;
const TILE_COUNT = GRID * GRID;
const GAME_TIME = 15;             // seconds

const PEACE_HOLD = 10;            // consecutive frames holding peace sign
const SWIPE_THR_PX = 50;            // canvas-pixel distance to fire swipe
const ANIM_MS = 200;           // tile slide duration
const INDEX_TIP = 8;
const MIDDLE_TIP = 12;
const RING_TIP = 16;
const PINKY_TIP = 20;
const INDEX_PIP = 6;
const MIDDLE_PIP = 10;
const RING_PIP = 14;
const PINKY_PIP = 18;

type Phase = 'draw' | 'capturing' | 'solve' | 'won' | 'lost';

// Direction map: [dr, dc] = offset from SOURCE TILE to BLANK
const DIR_MAP: Record<string, [number, number]> = {
    R: [0, +1], L: [0, -1], D: [+1, 0], U: [-1, 0],
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function isPeaceSign(lm: HandLandmark[]): boolean {
    const ext = (tip: number, pip: number) => lm[tip].y < lm[pip].y;
    const cur = (tip: number, pip: number) => lm[tip].y > lm[pip].y;
    return ext(INDEX_TIP, INDEX_PIP) && ext(MIDDLE_TIP, MIDDLE_PIP)
        && cur(RING_TIP, RING_PIP) && cur(PINKY_TIP, PINKY_PIP);
}

function isSolvable(t: number[]): boolean {
    let inv = 0;
    const a = t.filter(x => x !== 8);
    for (let i = 0; i < a.length - 1; i++)
        for (let j = i + 1; j < a.length; j++)
            if (a[i] > a[j]) inv++;
    return inv % 2 === 0;
}
function isSolved(t: number[]) { return t.every((v, i) => v === i); }
function makeShuffle(): number[] {
    const a = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    do {
        for (let i = 8; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
    } while (!isSolvable(a) || isSolved(a));
    return a;
}
function slideTile(tiles: number[], tr: number, tc: number): number[] | null {
    const bi = tiles.indexOf(8);
    const br = Math.floor(bi / GRID), bc = bi % GRID;
    if (Math.abs(br - tr) + Math.abs(bc - tc) !== 1) return null;
    const n = [...tiles];[n[bi], n[tr * GRID + tc]] = [n[tr * GRID + tc], n[bi]]; return n;
}

// ── Props / types ─────────────────────────────────────────────────────────────
interface FacePuzzleProps { trackingData: HandTrackingData; playerId?: string; }
interface SwipeOrigin { x: number; y: number; row: number; col: number; }
interface Anim { tile: number; fromI: number; toI: number; start: number; }
interface BBox { minX: number; minY: number; maxX: number; maxY: number; }

// ── Component ─────────────────────────────────────────────────────────────────
export const FacePuzzle: React.FC<FacePuzzleProps> = ({ trackingData }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const rafRef = useRef<number>(0);
    const streamRef = useRef<MediaStream | null>(null);

    // ── Game state refs ───────────────────────────────────────────────────────
    const phaseRef = useRef<Phase>('draw');
    const tilesRef = useRef<number[]>([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    const tileImgsRef = useRef<ImageBitmap[]>([]);
    const timerStartRef = useRef<number>(0);
    const timerRef = useRef<number>(GAME_TIME);

    // DRAW phase state
    const bboxRef = useRef<BBox | null>(null);     // canvas-pixel bbox
    const peaceCountRef = useRef<number>(0);             // consecutive peace frames
    const tooSmallRef = useRef<boolean>(false);        // show "too small" msg
    const captureFlashRef = useRef<number>(0);            // timestamp for flash

    // SOLVE phase state
    const swipeRef = useRef<SwipeOrigin | null>(null);
    const animRef = useRef<Anim | null>(null);
    const flashTileRef = useRef<number>(-1);            // tile index flashing green
    const flashTileTs = useRef<number>(0);

    // Shared
    const trackingRef = useRef(trackingData);

    // React state (for DOM only)
    const [phase, setPhase] = useState<Phase>('draw');
    const [videoReady, setVideoReady] = useState(false);

    useEffect(() => { trackingRef.current = trackingData; }, [trackingData]);

    // ── Camera stream (display + capture — no MediaPipe) ──────────────────────
    useEffect(() => {
        let cancelled = false;
        navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: false })
            .then(stream => {
                if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
                streamRef.current = stream;
                const v = videoRef.current;
                if (v) {
                    v.srcObject = stream;
                    v.onloadedmetadata = () => v.play().then(() => setVideoReady(true));
                }
            })
            .catch(e => console.error('FacePuzzle cam:', e));
        return () => { cancelled = true; streamRef.current?.getTracks().forEach(t => t.stop()); };
    }, []);

    // ── Face capture from bbox ────────────────────────────────────────────────
    const captureFace = useCallback(async (W: number, H: number) => {
        const video = videoRef.current;
        const bb = bboxRef.current;
        if (!video || video.readyState < 2 || !bb) return;

        let { minX, minY, maxX, maxY } = bb;

        // Clamp to canvas
        minX = Math.max(0, minX); minY = Math.max(0, minY);
        maxX = Math.min(W, maxX); maxY = Math.min(H, maxY);
        let cW = maxX - minX, cH = maxY - minY;

        // Make square
        const sq = Math.max(cW, cH);
        const cX = minX - (sq - cW) / 2;
        const cY = minY - (sq - cH) / 2;
        cW = cH = sq;

        // Draw mirrored video to offscreen canvas at display resolution
        const off = document.createElement('canvas');
        off.width = W; off.height = H;
        const oc = off.getContext('2d')!;
        oc.translate(W, 0); oc.scale(-1, 1);
        oc.drawImage(video, 0, 0, W, H);

        const ts = Math.max(1, Math.floor(sq / GRID));
        const bitmaps: ImageBitmap[] = [];
        for (let i = 0; i < TILE_COUNT - 1; i++) {
            const tc2 = i % GRID, tr2 = Math.floor(i / GRID);
            const sx = Math.max(0, cX + tc2 * ts);
            const sy = Math.max(0, cY + tr2 * ts);
            const sw = Math.min(ts, W - sx);
            const sh = Math.min(ts, H - sy);
            try {
                bitmaps.push(await createImageBitmap(off, sx, sy, Math.max(1, sw), Math.max(1, sh)));
            } catch {
                const fb = document.createElement('canvas'); fb.width = fb.height = ts;
                bitmaps.push(await createImageBitmap(fb));
            }
        }

        tileImgsRef.current = bitmaps;
        tilesRef.current = makeShuffle();
        swipeRef.current = null;
        animRef.current = null;
        phaseRef.current = 'solve';
        timerStartRef.current = Date.now();
        timerRef.current = GAME_TIME;
        setPhase('solve');
    }, []);

    // ── Main rAF render + logic ───────────────────────────────────────────────
    const drawFrame = useCallback(() => {
        const canvas = canvasRef.current;
        const video = videoRef.current;
        if (!canvas || !video) return;
        const W = canvas.width, H = canvas.height;
        const ctx = canvas.getContext('2d')!;

        // ── Camera feed (mirrored) ────────────────────────────────────────────
        if (video.readyState >= 2) {
            ctx.save(); ctx.scale(-1, 1); ctx.drawImage(video, -W, 0, W, H); ctx.restore();
        } else {
            ctx.fillStyle = '#111'; ctx.fillRect(0, 0, W, H);
        }

        // ── Vignette ─────────────────────────────────────────────────────────
        const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.15, W / 2, H / 2, H * 0.82);
        vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.50)');
        ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);

        // ── All hand skeletons ────────────────────────────────────────────────
        const td = trackingRef.current;
        td.landmarks.forEach(lm => {
            const hlm = lm as HandLandmark[];
            // Simple pinch check inline
            const pinchDist = Math.hypot(hlm[4].x - hlm[8].x, hlm[4].y - hlm[8].y);
            drawHandSkeleton(ctx, hlm, W, H, pinchDist < 0.05);
        });

        const p = phaseRef.current;
        const lm0 = td.landmarks.length ? td.landmarks[0] as HandLandmark[] : null;

        // ═══════════════════════════════════════════════════════════════════════
        // DRAW PHASE
        // ═══════════════════════════════════════════════════════════════════════
        if (p === 'draw' || p === 'capturing') {

            if (p === 'draw' && lm0) {
                // Mirror fingertip to canvas coords
                const ftx = (1 - lm0[INDEX_TIP].x) * W;
                const fty = lm0[INDEX_TIP].y * H;

                // Expand bounding box
                const bb = bboxRef.current;
                if (!bb) {
                    bboxRef.current = { minX: ftx, minY: fty, maxX: ftx, maxY: fty };
                } else {
                    bb.minX = Math.min(bb.minX, ftx);
                    bb.minY = Math.min(bb.minY, fty);
                    bb.maxX = Math.max(bb.maxX, ftx);
                    bb.maxY = Math.max(bb.maxY, fty);
                }

                // Peace sign detection for capture trigger
                if (isPeaceSign(lm0)) {
                    peaceCountRef.current++;
                    if (peaceCountRef.current >= PEACE_HOLD && bboxRef.current) {
                        tooSmallRef.current = false;
                        phaseRef.current = 'capturing';
                        setPhase('capturing');
                        captureFlashRef.current = Date.now();
                        captureFace(W, H);
                    }
                } else {
                    peaceCountRef.current = 0;
                }
            }

            // ── Draw bbox preview ─────────────────────────────────────────────
            const bb = bboxRef.current;
            if (bb) {
                const bw = bb.maxX - bb.minX, bh = bb.maxY - bb.minY;
                ctx.save();
                ctx.strokeStyle = 'rgba(0,255,136,0.9)';
                ctx.lineWidth = 3;
                ctx.shadowColor = '#00FF88';
                ctx.shadowBlur = 18;
                ctx.setLineDash([12, 8]);
                ctx.strokeRect(bb.minX, bb.minY, bw, bh);
                ctx.setLineDash([]);
                // Corner accents
                const cs = 16;
                ctx.shadowBlur = 0;
                [[bb.minX, bb.minY], [bb.maxX, bb.minY], [bb.maxX, bb.maxY], [bb.minX, bb.maxY]]
                    .forEach(([cx2, cy2]) => {
                        ctx.fillStyle = 'rgba(0,255,136,0.9)';
                        ctx.beginPath(); ctx.arc(cx2, cy2, cs / 2, 0, Math.PI * 2); ctx.fill();
                    });
                ctx.restore();

                // Size label inside box
                ctx.save();
                ctx.font = `bold ${Math.round(Math.min(bw, bh) * 0.08)}px "Segoe UI", sans-serif`;
                ctx.fillStyle = 'rgba(255,255,255,0.55)';
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText(`${Math.round(bw)}×${Math.round(bh)}`, bb.minX + bw / 2, bb.minY + bh / 2);
                ctx.restore();
            }

            // ── Fingertip dot ─────────────────────────────────────────────────
            if (lm0) {
                const ftx2 = (1 - lm0[INDEX_TIP].x) * W;
                const fty2 = lm0[INDEX_TIP].y * H;
                ctx.save();
                ctx.fillStyle = '#00FF88'; ctx.shadowColor = '#00FF88'; ctx.shadowBlur = 14;
                ctx.beginPath(); ctx.arc(ftx2, fty2, 10, 0, Math.PI * 2); ctx.fill();
                ctx.restore();
            }

            // ── Peace progress arc ─────────────────────────────────────────────
            if (lm0 && peaceCountRef.current > 0) {
                const prog = peaceCountRef.current / PEACE_HOLD;
                const pcx = W / 2, pcy = H - 60, pr = 22;
                ctx.save();
                ctx.strokeStyle = '#00FF88'; ctx.lineWidth = 5;
                ctx.shadowColor = '#00FF88'; ctx.shadowBlur = 14;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.arc(pcx, pcy, pr, -Math.PI / 2, -Math.PI / 2 + prog * 2 * Math.PI);
                ctx.stroke();
                ctx.fillStyle = '#00FF88';
                ctx.font = `bold ${Math.round(pr * 0.7)}px "Segoe UI", sans-serif`;
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText('✌️', pcx, pcy);
                ctx.restore();
            }

            // ── CAPTURING flash ────────────────────────────────────────────────
            if (captureFlashRef.current) {
                const fe = Date.now() - captureFlashRef.current;
                if (fe < 600) {
                    const fa = 1 - fe / 600;
                    ctx.save();
                    ctx.fillStyle = `rgba(0,255,136,${fa * 0.38})`;
                    ctx.fillRect(0, 0, W, H);
                    ctx.fillStyle = `rgba(0,255,136,${fa})`;
                    ctx.font = `bold ${Math.round(W * 0.055)}px "Segoe UI", sans-serif`;
                    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                    ctx.shadowColor = '#00FF88'; ctx.shadowBlur = 30;
                    ctx.fillText('📸  CAPTURING…', W / 2, H / 2);
                    ctx.restore();
                }
            }

            // ── Instruction text (top-center) ─────────────────────────────────
            ctx.save();
            const instr = tooSmallRef.current
                ? '⚠️  Area too small — move finger wider, then ✌️ Peace'
                : 'Move finger to define area, then ✌️ Peace sign to capture';
            ctx.font = `${Math.round(W * 0.019)}px "Segoe UI", sans-serif`;
            const iw = ctx.measureText(instr).width;
            ctx.fillStyle = 'rgba(0,0,0,0.60)';
            (ctx as any).roundRect(W / 2 - iw / 2 - 14, 14, iw + 28, 30, 8);
            ctx.fill();
            ctx.fillStyle = tooSmallRef.current ? '#FF4757' : '#00E5FF';
            ctx.textAlign = 'center'; ctx.textBaseline = 'top';
            ctx.fillText(instr, W / 2, 21);
            ctx.restore();

            // Reset button (click/tap to reset bbox)
            if (bb) {
                ctx.save();
                ctx.font = `${Math.round(W * 0.016)}px "Segoe UI", sans-serif`;
                ctx.fillStyle = 'rgba(255,255,255,0.35)';
                ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
                ctx.fillText('Move finger far to expand  |  Reload to reset', W / 2, H - 12);
                ctx.restore();
            }
        }

        // ═══════════════════════════════════════════════════════════════════════
        // SOLVE PHASE
        // ═══════════════════════════════════════════════════════════════════════
        if (p === 'solve' || p === 'won' || p === 'lost') {
            const imgs = tileImgsRef.current;
            const tiles = tilesRef.current;

            // Grid geometry
            const gridPx = Math.min(W, H) * 0.58;
            const tileW = gridPx / GRID;
            const tileH = tileW;
            const gridL = (W - gridPx) / 2;
            const gridT = (H - gridPx) / 2;
            const gap = 4;

            // ── Swipe input ───────────────────────────────────────────────────
            if (p === 'solve' && lm0 && !animRef.current) {
                const ftx = (1 - lm0[INDEX_TIP].x) * W;
                const fty = lm0[INDEX_TIP].y * H;
                const gc = Math.floor((ftx - gridL) / tileW);
                const gr = Math.floor((fty - gridT) / tileH);
                const inG = gc >= 0 && gc < GRID && gr >= 0 && gr < GRID;

                if (!inG) {
                    swipeRef.current = null;
                } else {
                    const tv = tiles[gr * GRID + gc];
                    const ss = swipeRef.current;

                    if (!ss && tv !== 8) {
                        // Lock swipe origin on non-blank tile entered
                        swipeRef.current = { x: ftx, y: fty, row: gr, col: gc };
                    } else if (ss) {
                        // Re-anchor if finger moved to a different non-blank tile
                        if ((ss.row !== gr || ss.col !== gc) && tv !== 8) {
                            swipeRef.current = { x: ftx, y: fty, row: gr, col: gc };
                        } else {
                            const dx = ftx - ss.x;
                            const dy = fty - ss.y;
                            const dist = Math.hypot(dx, dy);
                            if (dist >= SWIPE_THR_PX) {
                                const dir = Math.abs(dx) > Math.abs(dy)
                                    ? (dx > 0 ? 'R' : 'L')
                                    : (dy > 0 ? 'D' : 'U');
                                const [dr2, dc2] = DIR_MAP[dir];
                                const bi = tiles.indexOf(8);
                                const br = Math.floor(bi / GRID), bc = bi % GRID;

                                if (br === ss.row + dr2 && bc === ss.col + dc2) {
                                    // Valid move — apply
                                    const next = slideTile(tiles, ss.row, ss.col);
                                    if (next) {
                                        const fromI = ss.row * GRID + ss.col;
                                        animRef.current = { tile: tiles[fromI], fromI, toI: bi, start: Date.now() };
                                        tilesRef.current = next;
                                        flashTileRef.current = tiles[fromI];
                                        flashTileTs.current = Date.now();
                                        swipeRef.current = null;
                                        if (isSolved(next)) {
                                            setTimeout(() => { phaseRef.current = 'won'; setPhase('won'); }, ANIM_MS + 80);
                                        }
                                    }
                                } else {
                                    swipeRef.current = null;
                                }
                            }
                        }
                    }
                }

                // Peace sign → restart (in solve phase)
                if (isPeaceSign(lm0)) {
                    peaceCountRef.current++;
                    if (peaceCountRef.current >= PEACE_HOLD) {
                        phaseRef.current = 'draw';
                        bboxRef.current = null;
                        tileImgsRef.current = [];
                        tilesRef.current = [0, 1, 2, 3, 4, 5, 6, 7, 8];
                        swipeRef.current = null;
                        animRef.current = null;
                        flashTileRef.current = -1;
                        peaceCountRef.current = 0;
                        tooSmallRef.current = false;
                        captureFlashRef.current = 0;
                        setPhase('draw');
                    }
                } else {
                    peaceCountRef.current = 0;
                }
            }

            // Won/lost peace restart
            if ((p === 'won' || p === 'lost') && lm0 && isPeaceSign(lm0)) {
                peaceCountRef.current++;
                if (peaceCountRef.current >= PEACE_HOLD) {
                    phaseRef.current = 'draw';
                    bboxRef.current = null;
                    tileImgsRef.current = [];
                    tilesRef.current = [0, 1, 2, 3, 4, 5, 6, 7, 8];
                    swipeRef.current = null;
                    animRef.current = null;
                    peaceCountRef.current = 0;
                    tooSmallRef.current = false;
                    captureFlashRef.current = 0;
                    setPhase('draw');
                }
            } else if (!lm0) {
                peaceCountRef.current = 0;
            }

            // Advance animation
            if (animRef.current) {
                if (Date.now() - animRef.current.start >= ANIM_MS) animRef.current = null;
            }

            // ── Panel background ──────────────────────────────────────────────
            ctx.save();
            ctx.fillStyle = 'rgba(0,0,0,0.42)';
            ctx.shadowColor = 'rgba(0,229,255,0.35)'; ctx.shadowBlur = 28;
            (ctx as any).roundRect(gridL - 14, gridT - 14, gridPx + 28, gridPx + 28, 16);
            ctx.fill(); ctx.shadowBlur = 0;
            ctx.strokeStyle = 'rgba(0,229,255,0.55)'; ctx.lineWidth = 2; ctx.stroke();
            ctx.restore();

            // ── Hover detection ───────────────────────────────────────────────
            let hRow = -1, hCol = -1;
            if (lm0 && p === 'solve') {
                const { x: hfx, y: hfy } = landmarkToCanvas(lm0[INDEX_TIP], W, H);
                const hc = Math.floor((hfx - gridL) / tileW);
                const hr = Math.floor((hfy - gridT) / tileH);
                if (hc >= 0 && hc < GRID && hr >= 0 && hr < GRID) { hRow = hr; hCol = hc; }
            }

            // ── Tiles ─────────────────────────────────────────────────────────
            if (imgs.length) {
                for (let i = 0; i < TILE_COUNT; i++) {
                    const v = tiles[i];
                    if (v === 8) continue;

                    const c0 = i % GRID, r0 = Math.floor(i / GRID);
                    let tx = gridL + c0 * tileW + gap / 2;
                    let ty = gridT + r0 * tileH + gap / 2;
                    const tw2 = tileW - gap, th2 = tileH - gap;

                    // Slide animation: interpolate from fromI to toI
                    if (animRef.current && v === animRef.current.tile) {
                        const ad = animRef.current;
                        const prog = Math.min(1, (Date.now() - ad.start) / ANIM_MS);
                        const eased = 1 - Math.pow(1 - prog, 3);
                        const fc2 = ad.fromI % GRID, fr2 = Math.floor(ad.fromI / GRID);
                        const tc2 = ad.toI % GRID, tr2 = Math.floor(ad.toI / GRID);
                        tx = gridL + (fc2 + (tc2 - fc2) * eased) * tileW + gap / 2;
                        ty = gridT + (fr2 + (tr2 - fr2) * eased) * tileH + gap / 2;
                    }

                    const img = imgs[v];
                    if (!img) continue;

                    ctx.save();
                    ctx.beginPath();
                    (ctx as any).roundRect(tx, ty, tw2, th2, 5);
                    ctx.clip();

                    // Green flash on recently slid tile
                    const isFlashing = v === flashTileRef.current && (Date.now() - flashTileTs.current) < 300;
                    if (isFlashing) {
                        ctx.drawImage(img, tx, ty, tw2, th2);
                        ctx.fillStyle = 'rgba(0,255,136,0.35)'; ctx.fillRect(tx, ty, tw2, th2);
                    } else {
                        ctx.drawImage(img, tx, ty, tw2, th2);
                    }

                    // Borders
                    if (r0 === hRow && c0 === hCol) {
                        ctx.strokeStyle = 'rgba(0,255,255,0.85)'; ctx.lineWidth = 3;
                        ctx.shadowColor = 'rgba(0,255,255,0.8)'; ctx.shadowBlur = 12;
                    } else {
                        ctx.strokeStyle = 'rgba(0,229,255,0.22)'; ctx.lineWidth = 1;
                        ctx.shadowBlur = 0;
                    }
                    ctx.stroke();
                    ctx.restore();
                }
            }

            // ── Blank cell ────────────────────────────────────────────────────
            const bi2 = tiles.indexOf(8);
            const bx2 = gridL + (bi2 % GRID) * tileW + gap / 2;
            const by2 = gridT + Math.floor(bi2 / GRID) * tileH + gap / 2;
            ctx.save();
            ctx.fillStyle = 'rgba(0,229,255,0.06)';
            ctx.strokeStyle = 'rgba(0,229,255,0.18)'; ctx.lineWidth = 1.5;
            ctx.setLineDash([6, 5]);
            (ctx as any).roundRect(bx2, by2, tileW - gap, tileH - gap, 5);
            ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
            ctx.restore();

            // ── Directional arrow on hovered tile ─────────────────────────────
            if (hRow >= 0 && hCol >= 0 && p === 'solve' && tiles[hRow * GRID + hCol] !== 8) {
                const bi3 = tiles.indexOf(8);
                const dr3 = Math.floor(bi3 / GRID) - hRow, dc3 = (bi3 % GRID) - hCol;
                if (Math.abs(dr3) + Math.abs(dc3) === 1) {
                    const cx3 = gridL + hCol * tileW + tileW / 2;
                    const cy3 = gridT + hRow * tileH + tileH / 2;
                    const ex3 = cx3 + dc3 * tileW * 0.36;
                    const ey3 = cy3 + dr3 * tileH * 0.36;
                    ctx.save();
                    ctx.strokeStyle = 'rgba(255,215,0,0.85)'; ctx.lineWidth = 3;
                    ctx.shadowColor = '#FFD700'; ctx.shadowBlur = 10;
                    ctx.beginPath(); ctx.moveTo(cx3, cy3); ctx.lineTo(ex3, ey3); ctx.stroke();
                    const ang3 = Math.atan2(ey3 - cy3, ex3 - cx3), as3 = 11;
                    ctx.beginPath(); ctx.moveTo(ex3, ey3);
                    ctx.lineTo(ex3 - as3 * Math.cos(ang3 - 0.4), ey3 - as3 * Math.sin(ang3 - 0.4));
                    ctx.lineTo(ex3 - as3 * Math.cos(ang3 + 0.4), ey3 - as3 * Math.sin(ang3 + 0.4));
                    ctx.closePath(); ctx.fillStyle = 'rgba(255,215,0,0.85)'; ctx.fill();
                    ctx.restore();
                }
            }

            // ── Swipe progress arrow ──────────────────────────────────────────
            if (swipeRef.current && lm0 && p === 'solve') {
                const ss = swipeRef.current;
                const ftx3 = (1 - lm0[INDEX_TIP].x) * W;
                const fty3 = lm0[INDEX_TIP].y * H;
                const prog3 = Math.min(1, Math.hypot(ftx3 - ss.x, fty3 - ss.y) / SWIPE_THR_PX);
                ctx.save();
                ctx.strokeStyle = `rgba(255,255,255,${0.3 + prog3 * 0.5})`;
                ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
                ctx.beginPath(); ctx.moveTo(ss.x, ss.y); ctx.lineTo(ftx3, fty3); ctx.stroke();
                ctx.setLineDash([]);
                ctx.restore();
            }

            // ── Timer ─────────────────────────────────────────────────────────
            if (p === 'solve') {
                const elapsed = (Date.now() - timerStartRef.current) / 1000;
                timerRef.current = Math.max(0, GAME_TIME - elapsed);
                if (timerRef.current <= 0) { phaseRef.current = 'lost'; setPhase('lost'); }

                const t2 = timerRef.current, f2 = t2 / GAME_TIME, ug2 = t2 <= 5;
                const tcx = W / 2, tcy = H * 0.07, r2 = 26;
                ctx.save();
                ctx.beginPath(); ctx.arc(tcx, tcy, r2 + 6, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fill();
                ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 5;
                ctx.beginPath(); ctx.arc(tcx, tcy, r2, 0, Math.PI * 2); ctx.stroke();
                ctx.strokeStyle = ug2 ? '#FF4757' : '#00E5FF'; ctx.lineWidth = 5;
                ctx.lineCap = 'round'; ctx.shadowColor = ug2 ? '#FF4757' : '#00E5FF'; ctx.shadowBlur = 16;
                ctx.beginPath(); ctx.arc(tcx, tcy, r2, -Math.PI / 2, -Math.PI / 2 + f2 * 2 * Math.PI); ctx.stroke();
                ctx.shadowBlur = 0; ctx.fillStyle = ug2 ? '#FF4757' : '#fff';
                ctx.font = `bold ${Math.round(r2 * 0.88)}px "Segoe UI", sans-serif`;
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText(Math.ceil(t2).toString(), tcx, tcy);
                ctx.restore();

                // Tip
                ctx.save();
                ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.font = `${Math.round(W * 0.016)}px "Segoe UI", sans-serif`;
                ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
                ctx.fillText('👆 Hover tile · swipe to slide   |   ✌️ ×10 frames to restart', W / 2, H - 10);
                ctx.restore();
            }

            // ── Win / Lose overlay ────────────────────────────────────────────
            if (p === 'won' || p === 'lost') {
                const won = p === 'won';
                ctx.save();
                ctx.fillStyle = won ? 'rgba(0,30,0,0.76)' : 'rgba(30,0,0,0.76)';
                ctx.fillRect(0, 0, W, H);
                ctx.textAlign = 'center';
                ctx.font = `${Math.round(W * 0.09)}px serif`;
                ctx.fillText(won ? '🎉' : '⏰', W / 2, H / 2 - 82);
                const col = won ? '#00FF88' : '#FF4757';
                ctx.shadowColor = col; ctx.shadowBlur = 40; ctx.fillStyle = col;
                ctx.font = `bold ${Math.round(W * 0.062)}px "Segoe UI", sans-serif`;
                ctx.fillText(won ? 'PUZZLE SOLVED!' : "TIME'S UP!", W / 2, H / 2 - 8);
                ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(255,255,255,0.72)';
                ctx.font = `${Math.round(W * 0.02)}px "Segoe UI", sans-serif`;
                ctx.fillText(won ? 'You reassembled your face!' : 'Better luck next time', W / 2, H / 2 + 38);
                ctx.fillStyle = 'rgba(255,255,255,0.38)';
                ctx.font = `${Math.round(W * 0.016)}px "Segoe UI", sans-serif`;
                ctx.fillText('✌️  Hold peace sign to play again', W / 2, H / 2 + 76);
                ctx.restore();
            }
        }

        // ── Index-finger cursor (always on top) ───────────────────────────────
        if (lm0) {
            const { x: cx, y: cy } = landmarkToCanvas(lm0[INDEX_TIP], W, H);
            ctx.save();
            ctx.shadowColor = '#FFD700'; ctx.shadowBlur = 16;
            ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(cx, cy, 10, 0, Math.PI * 2); ctx.stroke();
            ctx.fillStyle = '#FFD700';
            ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
        }
    }, [captureFace]);

    // ── rAF loop ──────────────────────────────────────────────────────────────
    useEffect(() => {
        let running = true;
        const loop = () => { if (!running) return; drawFrame(); rafRef.current = requestAnimationFrame(loop); };
        loop();
        return () => { running = false; cancelAnimationFrame(rafRef.current); };
    }, [drawFrame]);

    // ── Canvas resize ─────────────────────────────────────────────────────────
    useEffect(() => {
        const resize = () => {
            const c = canvasRef.current; if (!c) return;
            c.width = window.innerWidth; c.height = window.innerHeight;
        };
        resize();
        window.addEventListener('resize', resize);
        return () => window.removeEventListener('resize', resize);
    }, []);

    // ── DOM ───────────────────────────────────────────────────────────────────
    return (
        <div style={{ position: 'fixed', inset: 0, background: '#000', overflow: 'hidden' }}>
            <video ref={videoRef} autoPlay playsInline muted
                style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 1, height: 1 }} />
            <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />

            {/* Phase badge */}
            {videoReady && (
                <div style={{
                    position: 'absolute', top: 14, right: 18,
                    background: 'rgba(0,0,0,0.62)', border: '1.5px solid rgba(0,229,255,0.35)',
                    borderRadius: 9, padding: '5px 14px',
                    fontFamily: '"Segoe UI", sans-serif', fontSize: 13, fontWeight: 700,
                    color: phase === 'won' ? '#00FF88' : phase === 'lost' ? '#FF4757' : '#00E5FF',
                }}>
                    {phase === 'draw' && '✋ Define Area → ✌️ Capture'}
                    {phase === 'capturing' && '📸 Capturing…'}
                    {phase === 'solve' && '🧩 Solve the Puzzle!'}
                    {phase === 'won' && '🏆 You Won!'}
                    {phase === 'lost' && "💀 Time's Up!"}
                </div>
            )}

            {/* Loading */}
            {!videoReady && (
                <div style={{
                    position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(0,0,0,0.9)', fontFamily: '"Segoe UI", sans-serif', zIndex: 10,
                }}>
                    <div style={{ width: 52, height: 52, borderRadius: '50%', border: '4px solid #1a1a2e', borderTop: '4px solid #00E5FF', animation: 'spin .85s linear infinite', marginBottom: 20 }} />
                    <h2 style={{ margin: '0 0 6px', color: '#00E5FF', fontSize: 22 }}>🧩 Face Puzzle</h2>
                    <p style={{ color: '#555', margin: 0, fontSize: 13 }}>Accessing camera…</p>
                    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
                </div>
            )}
        </div>
    );
};
