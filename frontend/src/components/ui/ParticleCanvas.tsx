import { useEffect, useRef } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ParticleCanvasProps {
  className?: string;
  density?: 'low' | 'medium' | 'high';
  style?: React.CSSProperties;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  opacity: number;
  isRect: boolean;
  /** For rect: half-width */
  w: number;
  /** For rect: half-height */
  h: number;
  /** For circle: radius */
  r: number;
  rotation: number;
}

// ── Color distribution matching Google Antigravity exactly ───────────────────
const COLORS_WEIGHTED: string[] = [
  ...Array(35).fill('#4285f4'),  // blue 35%
  ...Array(15).fill('#ea4335'),  // red 15%
  ...Array(15).fill('#fbbc04'),  // yellow 15%
  ...Array(15).fill('#9333ea'),  // purple 15%
  ...Array(10).fill('#1a73e8'),  // dark blue 10%
  ...Array(10).fill('#06b6d4'),  // cyan 10%
];

const DENSITY_MAP = { low: 60, medium: 120, high: 200 } as const;

function rand(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function createParticle(w: number, h: number): Particle {
  const isRect = Math.random() < 0.7;
  return {
    x: rand(0, w),
    y: rand(0, h),
    vx: rand(-0.12, 0.12),
    vy: rand(-0.12, 0.12),
    color: COLORS_WEIGHTED[Math.floor(Math.random() * COLORS_WEIGHTED.length)],
    opacity: rand(0.35, 0.85),
    isRect,
    w: isRect ? rand(1.5, 2.5) : 0,
    h: isRect ? rand(3, 5) : 0,
    r: isRect ? 0 : rand(1.5, 3),
    rotation: rand(0, Math.PI * 2),
  };
}

// ── Component ──────────────────────────────────────────────────────────────────

export function ParticleCanvas({ className, density = 'medium', style }: ParticleCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const count = DENSITY_MAP[density];

    const resize = () => {
      const parent = canvas.parentElement;
      const pw = parent?.clientWidth ?? window.innerWidth;
      const ph = parent?.clientHeight ?? window.innerHeight;
      canvas.width = pw;
      canvas.height = ph;
      // Re-scatter particles proportionally on resize
      particlesRef.current = Array.from({ length: count }, () => createParticle(pw, ph));
    };

    resize();

    const ro = new ResizeObserver(resize);
    if (canvas.parentElement) ro.observe(canvas.parentElement);

    const draw = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      for (const p of particlesRef.current) {
        ctx.save();
        ctx.globalAlpha = p.opacity;
        ctx.fillStyle = p.color;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);

        if (p.isRect) {
          ctx.fillRect(-p.h / 2, -p.w / 2, p.h, p.w);
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, p.r, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();

        // Update position
        p.x += p.vx;
        p.y += p.vy;

        // Wrap around edges
        if (p.x < 0) p.x = w;
        if (p.x > w) p.x = 0;
        if (p.y < 0) p.y = h;
        if (p.y > h) p.y = 0;
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [density]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 0,
        ...style,
      }}
    />
  );
}
