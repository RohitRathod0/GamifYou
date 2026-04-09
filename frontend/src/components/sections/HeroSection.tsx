import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ParticleCanvas } from '@/components/ui/ParticleCanvas';

export interface HeroSectionProps {
  onOpenModal?: () => void;
}

export function HeroSection({ onOpenModal }: HeroSectionProps) {
  const navigate = useNavigate();
  const [hoveredPrimary, setHoveredPrimary] = useState(false);
  const [hoveredSecondary, setHoveredSecondary] = useState(false);
  const [hoveredTertiary, setHoveredTertiary] = useState(false);

  return (
    <section style={{
      position: 'relative',
      minHeight: '100vh',
      background: '#ffffff',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    }}>
      {/* Particle background */}
      <ParticleCanvas density="high" />

      {/* Content */}
      <div style={{
        position: 'relative',
        zIndex: 1,
        textAlign: 'center',
        maxWidth: 900,
        padding: '0 24px',
        animation: 'fade-in-up 0.7s ease forwards',
      }}>
        {/* Eyebrow */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontSize: 14, fontWeight: 500, color: '#6b7280',
          background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.08)',
          borderRadius: 100, padding: '6px 14px', marginBottom: 36,
          letterSpacing: '0.02em',
        }}>
          🎮 GamifYou — Gesture-Powered Gaming
        </div>

        {/* Headline */}
        <h1 style={{
          fontSize: 'clamp(52px, 8vw, 96px)',
          fontWeight: 900,
          color: '#111111',
          lineHeight: 1.02,
          letterSpacing: '-0.04em',
          margin: '0 0 28px',
        }}>
          Play games with
          <br />
          <span style={{
            color: 'transparent',
            background: 'linear-gradient(135deg, #111111 0%, #6b7280 100%)',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
          }}>
            your hands.
          </span>
        </h1>

        {/* Subheadline */}
        <p style={{
          fontSize: 'clamp(16px, 2vw, 20px)',
          color: '#6b7280',
          lineHeight: 1.65,
          maxWidth: 560,
          margin: '0 auto 52px',
        }}>
          Real-time multiplayer gaming powered by computer vision. Control games
          with hand gestures — chess, hockey, and more. No controllers needed.
        </p>

        {/* CTA row */}
        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            id="hero-browse-rooms"
            onClick={() => navigate('/public-rooms')}
            onMouseEnter={() => setHoveredPrimary(true)}
            onMouseLeave={() => setHoveredPrimary(false)}
            style={{
              background: '#111111', color: '#ffffff',
              borderRadius: 100, padding: '16px 32px',
              fontSize: 16, fontWeight: 600, border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 8,
              transition: 'all 0.2s',
              transform: hoveredPrimary ? 'translateY(-2px)' : 'translateY(0)',
              boxShadow: hoveredPrimary ? '0 8px 24px rgba(0,0,0,0.2)' : 'none',
            }}
          >
            Browse Public Rooms <span>→</span>
          </button>
          <button
            id="hero-create-room"
            onClick={() => onOpenModal?.()}
            onMouseEnter={() => setHoveredSecondary(true)}
            onMouseLeave={() => setHoveredSecondary(false)}
            style={{
              background: hoveredSecondary ? 'rgba(0,0,0,0.08)' : 'rgba(0,0,0,0.04)',
              color: '#374151',
              borderRadius: 100, padding: '16px 32px',
              fontSize: 16, fontWeight: 600, border: '1px solid rgba(0,0,0,0.1)', cursor: 'pointer',
              transition: 'all 0.2s',
              transform: hoveredSecondary ? 'translateY(-2px)' : 'translateY(0)',
            }}
          >
            ✨ Create Room
          </button>
          <button
            id="hero-join-code"
            onClick={() => onOpenModal?.()}
            onMouseEnter={() => setHoveredTertiary(true)}
            onMouseLeave={() => setHoveredTertiary(false)}
            style={{
              background: 'transparent',
              color: '#374151',
              borderRadius: 100, padding: '16px 32px',
              fontSize: 16, fontWeight: 600, border: '1px solid rgba(0,0,0,0.12)', cursor: 'pointer',
              transition: 'all 0.2s',
              transform: hoveredTertiary ? 'translateY(-2px)' : 'translateY(0)',
            }}
          >
            🚀 Join via Code
          </button>
        </div>
      </div>

      {/* Scroll indicator */}
      <div style={{
        position: 'absolute', bottom: 32, left: '50%', transform: 'translateX(-50%)',
        color: '#9ca3af', animation: 'bounce 2s infinite', fontSize: 20,
        zIndex: 1,
      }}>
        ↓
      </div>
    </section>
  );
}
