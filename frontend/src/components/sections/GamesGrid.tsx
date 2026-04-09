import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ParticleCanvas } from '@/components/ui/ParticleCanvas';

interface GameCardData {
  type: string;
  label: string;
  description: string;
  emoji: string;
  gradient: string;
  players: string;
}

const GAMES: GameCardData[] = [
  { type: 'chess', label: 'Chess', description: 'Dwell-based gesture control', emoji: '♟️', gradient: 'linear-gradient(135deg,#1a1a2e,#16213e,#0f3460)', players: '2 players' },
  { type: 'air_hockey', label: 'Air Hockey', description: 'Real-time hand tracking', emoji: '🏒', gradient: 'linear-gradient(135deg,#1a1a2e,#0d2137,#1a3a5c)', players: '2 players' },
  { type: 'scribble', label: 'Scribble Draw', description: 'Draw & guess with friends', emoji: '✏️', gradient: 'linear-gradient(135deg,#1a2010,#0d2010,#0a1a05)', players: '2–6 players' },
  { type: 'balloon_pop', label: 'Balloon Pop', description: 'Pinch to pop!', emoji: '🎈', gradient: 'linear-gradient(135deg,#2d1b2e,#3d1a3d,#1a0a2e)', players: '1–4 players' },
  { type: 'face_puzzle', label: 'Face Puzzle', description: 'Facial landmark challenge', emoji: '🧩', gradient: 'linear-gradient(135deg,#2a1a0a,#3d2010,#1a0d05)', players: '1–2 players' },
];

function GameCard({ game, index, onClick }: { game: GameCardData; index: number; onClick?: (type: string) => void }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={() => onClick?.(game.type)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: '#111111',
        borderRadius: 20,
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'all 0.25s ease',
        transform: hovered ? 'translateY(-6px)' : 'translateY(0)',
        boxShadow: hovered ? '0 20px 60px rgba(0,0,0,0.3)' : '0 4px 16px rgba(0,0,0,0.15)',
        animation: `scale-in 0.3s ease ${index * 60}ms both`,
      }}
    >
      {/* Thumbnail */}
      <div style={{
        height: 220, position: 'relative', background: game.gradient, overflow: 'hidden',
      }}>
        <ParticleCanvas density="low" />
        <div style={{
          position: 'absolute', inset: 0, zIndex: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 64,
          textShadow: '0 0 40px rgba(255,255,255,0.3)',
          transition: 'transform 0.3s ease',
          transform: hovered ? 'scale(1.15)' : 'scale(1)',
        }}>
          {game.emoji}
        </div>
      </div>

      {/* Card body */}
      <div style={{ padding: '16px 20px 20px', background: '#111111' }}>
        <h3 style={{ fontSize: 18, fontWeight: 700, color: '#ffffff', marginBottom: 4 }}>
          {game.label}
        </h3>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginBottom: 16 }}>
          {game.description}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', display: 'flex', alignItems: 'center', gap: 4 }}>
            👥 {game.players}
          </span>
          <span style={{ fontSize: 13, color: '#06b6d4', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
            Play now →
          </span>
        </div>
      </div>
    </div>
  );
}

export function GamesGrid({ onSelectGame }: { onSelectGame?: (type: string) => void }) {
  const navigate = useNavigate();

  return (
    <section style={{ padding: 'clamp(72px,8vw,120px) 0', background: '#ffffff', flex: 1 }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 clamp(16px,4vw,48px)' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 40, flexWrap: 'wrap', gap: 16 }}>
          <h2 style={{
            fontSize: 'clamp(28px,4vw,40px)', fontWeight: 800, color: '#111111', letterSpacing: '-0.03em',
          }}>
            Pick a game
          </h2>
          <button
            onClick={() => navigate('/public-rooms')}
            style={{
              fontSize: 15, color: '#6b7280', background: 'none',
              border: '1px solid rgba(0,0,0,0.1)', borderRadius: 100, padding: '10px 20px', cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.2)'; e.currentTarget.style.color = '#111'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.1)'; e.currentTarget.style.color = '#6b7280'; }}
          >
            Browse all rooms →
          </button>
        </div>

        {/* Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(min(280px,100%), 1fr))',
          gap: 24,
        }}>
          {GAMES.map((g, i) => <GameCard key={g.type} game={g} index={i} onClick={onSelectGame} />)}
        </div>
      </div>
    </section>
  );
}
