// GestureController.ts
// Detects hand gestures from MediaPipe 21-landmark data

export interface HandLandmark { x: number; y: number; z: number; }

export type GestureType = 'point' | 'pinch' | 'open_palm' | 'peace' | 'none';

export interface GestureState {
    gesture: GestureType;
    isPinching: boolean;
    pinchDistance: number;
    indexTip: HandLandmark;
    thumbTip: HandLandmark;
    wrist: HandLandmark;
}



function isFingerExtended(lm: HandLandmark[], tipIdx: number, pipIdx: number): boolean {
    if (tipIdx === 4) {
        // Thumb: compare x distance from wrist
        return Math.abs(lm[4].x - lm[0].x) > Math.abs(lm[3].x - lm[0].x);
    }
    return lm[tipIdx].y < lm[pipIdx].y; // tip above pip = extended
}

// ── Pinch distance (normalized 0-1) ──────────────────────────────────────────
export function getPinchDistance(lm: HandLandmark[]): number {
    const t = lm[4], i = lm[8];
    return Math.hypot(t.x - i.x, t.y - i.y);
}

// ── Main gesture classifier ───────────────────────────────────────────────────
export function classifyGesture(lm: HandLandmark[]): GestureState {
    const indexExt = isFingerExtended(lm, 8, 6);
    const middleExt = isFingerExtended(lm, 12, 10);
    const ringExt = isFingerExtended(lm, 16, 14);
    const pinkyExt = isFingerExtended(lm, 20, 18);

    const pinchDist = getPinchDistance(lm);
    const isPinching = pinchDist < 0.05;

    let gesture: GestureType = 'none';

    if (indexExt && middleExt && !ringExt && !pinkyExt) {
        gesture = 'peace';
    } else if (indexExt && !middleExt && !ringExt && !pinkyExt) {
        gesture = isPinching ? 'pinch' : 'point';
    } else if (isPinching) {
        gesture = 'pinch';
    } else if (indexExt && middleExt && ringExt && pinkyExt) {
        gesture = 'open_palm';
    }

    return {
        gesture,
        isPinching,
        pinchDistance: pinchDist,
        indexTip: lm[8],
        thumbTip: lm[4],
        wrist: lm[0],
    };
}

// ── Map normalized landmark to canvas pixel coords ────────────────────────────
export function landmarkToCanvas(
    lm: HandLandmark,
    canvasW: number,
    canvasH: number,
    mirror = true
): { x: number; y: number } {
    return {
        x: (mirror ? 1 - lm.x : lm.x) * canvasW,
        y: lm.y * canvasH,
    };
}

// ── Draw neon hand skeleton on canvas ────────────────────────────────────────
const CONNECTIONS = [
    [0, 1], [1, 2], [2, 3], [3, 4],
    [0, 5], [5, 6], [6, 7], [7, 8],
    [0, 9], [9, 10], [10, 11], [11, 12],
    [0, 13], [13, 14], [14, 15], [15, 16],
    [0, 17], [17, 18], [18, 19], [19, 20],
    [5, 9], [9, 13], [13, 17],
];

export function drawHandSkeleton(
    ctx: CanvasRenderingContext2D,
    lm: HandLandmark[],
    W: number,
    H: number,
    isPinching: boolean
) {
    const pts = lm.map(l => landmarkToCanvas(l, W, H));
    const lineColor = isPinching ? '#FF6B35' : '#00E5FF';
    const glowColor = isPinching ? 'rgba(255,107,53,0.4)' : 'rgba(0,229,255,0.35)';

    // Glow pass
    ctx.save();
    ctx.strokeStyle = glowColor;
    ctx.lineWidth = 8;
    ctx.shadowColor = lineColor;
    ctx.shadowBlur = 12;
    CONNECTIONS.forEach(([a, b]) => {
        ctx.beginPath();
        ctx.moveTo(pts[a].x, pts[a].y);
        ctx.lineTo(pts[b].x, pts[b].y);
        ctx.stroke();
    });

    // Sharp pass
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2;
    ctx.shadowBlur = 0;
    CONNECTIONS.forEach(([a, b]) => {
        ctx.beginPath();
        ctx.moveTo(pts[a].x, pts[a].y);
        ctx.lineTo(pts[b].x, pts[b].y);
        ctx.stroke();
    });

    // Landmark dots
    lm.forEach((_, i) => {
        const { x, y } = pts[i];
        const r = i === 8 ? 10 : i === 4 ? 8 : 4;
        const color = i === 8 ? '#FFD700' : i === 4 ? '#FF6B35' : '#00E5FF';
        ctx.beginPath(); ctx.arc(x, y, r + 4, 0, Math.PI * 2);
        ctx.fillStyle = color.replace(')', ',0.3)').replace('rgb', 'rgba').replace('#', 'rgba(').replace('rgba(', 'rgba(');
        // Simple glow ring
        ctx.shadowColor = color; ctx.shadowBlur = 14;
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
    });

    ctx.restore();
}

// ── Draw fingertip cursor ─────────────────────────────────────────────────────
export function drawCursor(
    ctx: CanvasRenderingContext2D,
    x: number, y: number,
    isPinching: boolean,
    dwellPct: number // 0-100
) {
    ctx.save();
    const color = isPinching ? '#FF6B35' : '#FFD700';
    const r = isPinching ? 18 : 12;

    // Outer glow
    ctx.shadowColor = color; ctx.shadowBlur = 24;
    ctx.beginPath(); ctx.arc(x, y, r + 6, 0, Math.PI * 2);
    ctx.fillStyle = color.replace('#', 'rgba(').replace('FFD700', '255,215,0,0.2)').replace('FF6B35', '255,107,53,0.2)');
    ctx.fill();

    // Core dot
    ctx.shadowBlur = 16;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    // Dwell ring
    if (dwellPct > 0) {
        ctx.beginPath();
        ctx.arc(x, y, r + 10, -Math.PI / 2, -Math.PI / 2 + (dwellPct / 100) * 2 * Math.PI);
        ctx.strokeStyle = '#FFD700';
        ctx.lineWidth = 3;
        ctx.shadowColor = '#FFD700'; ctx.shadowBlur = 10;
        ctx.stroke();
    }

    ctx.restore();
}
