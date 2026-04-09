import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { roomAPI } from '@/utils/api';
import { Navbar } from '@/components/ui/Navbar';
import { Footer } from '@/components/ui/Footer';
import { HeroSection } from '@/components/sections/HeroSection';
import { FeatureIconRow } from '@/components/sections/FeatureIconRow';
import { SplitFeatureSection } from '@/components/sections/SplitFeatureSection';
import { GamesGrid } from '@/components/sections/GamesGrid';
import { StatsRow } from '@/components/sections/StatsRow';
import { ParticleCanvas } from '@/components/ui/ParticleCanvas';

interface LobbyProps {
  appState: any;
  setAppState: React.Dispatch<React.SetStateAction<any>>;
}

// ── Preview cards for split sections ─────────────────────────────────────────

function ChessPreviewCard() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'center', alignItems: 'center', gap: 16 }}>
      <div style={{ fontSize: 72 }}>♟️</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 4 }}>
        {Array.from({ length: 16 }).map((_, i) => (
          <div key={i} style={{
            width: 28, height: 28, borderRadius: 4,
            background: i % 2 === (Math.floor(i / 4) % 2) ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.6)',
          }} />
        ))}
      </div>
      <p style={{ fontSize: 13, color: '#6b7280', fontWeight: 500 }}>Dwell 0.4s to select · Dwell to move</p>
    </div>
  );
}

function VirtualBgPreviewCard() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'center', alignItems: 'center', gap: 20 }}>
      <div style={{ fontSize: 64 }}>🎭</div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
        {['🌆 City', '🏔️ Mountain', '🌌 Space', '🌊 Ocean'].map(bg => (
          <span key={bg} style={{
            background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(4px)',
            border: '1px solid rgba(255,255,255,0.6)', borderRadius: 20,
            padding: '6px 14px', fontSize: 13, fontWeight: 500, color: '#374151',
          }}>
            {bg}
          </span>
        ))}
      </div>
      <p style={{ fontSize: 13, color: '#6b7280', fontWeight: 500 }}>Runs entirely in your browser · Zero upload</p>
    </div>
  );
}

function AICoachPreviewCard() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'center', gap: 12 }}>
      <div style={{ fontSize: 48 }}>🤖</div>
      {['Control center with Bc4', 'Knight fork on e5 incoming', 'Develop your queenside bishop'].map((tip, i) => (
        <div key={i} style={{
          background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(4px)',
          border: '1px solid rgba(255,255,255,0.6)', borderRadius: 12,
          padding: '10px 14px', fontSize: 13, color: '#111111', fontWeight: 500,
          animation: `fade-in-up 0.4s ease ${i * 100}ms both`,
        }}>
          💡 {tip}
        </div>
      ))}
    </div>
  );
}

// ── Room creation modal ───────────────────────────────────────────────────────

interface CreateRoomModalProps {
  onClose: () => void;
  setAppState: (s: any) => void;
}

function CreateRoomModal({ onClose, setAppState }: CreateRoomModalProps) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<'create' | 'join'>('create');
  const [username, setUsername] = useState(() => sessionStorage.getItem('gesturehub_username') ?? '');
  const [roomCode, setRoomCode] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { sessionStorage.setItem('gesturehub_username', username); }, [username]);

  const handleCreate = async () => {
    if (!username.trim()) { setError('Enter your name'); return; }
    setLoading(true); setError('');
    try {
      const room = await roomAPI.createRoom(username, 6, isPublic);
      setAppState({ username, roomCode: room.room_code, playerId: room.host_id, currentGame: null });
      navigate('/room');
    } catch { setError('Failed to create room.'); }
    finally { setLoading(false); }
  };

  const handleJoin = async () => {
    if (!username.trim() || !roomCode.trim()) { setError('Enter name and room code'); return; }
    setLoading(true); setError('');
    try {
      const room = await roomAPI.joinRoom(roomCode, username);
      const player = room.players.find(p => p.username === username);
      setAppState({ username, roomCode: room.room_code, playerId: player?.player_id ?? '', currentGame: room.current_game });
      navigate('/room');
    } catch { setError('Room not found or is full.'); }
    finally { setLoading(false); }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', height: 48, borderRadius: 12, border: '1px solid rgba(0,0,0,0.12)',
    padding: '0 16px', fontSize: 15, color: '#111111', outline: 'none',
    boxSizing: 'border-box', background: '#fff', transition: 'border-color 0.2s, box-shadow 0.2s',
    fontFamily: 'inherit',
  };

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', zIndex: 200, animation: 'fade-in-up 0.2s ease' }} />
      {/* Card */}
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        zIndex: 201, width: 480, maxWidth: 'calc(100vw - 32px)',
        background: '#fff', borderRadius: 24, padding: 48,
        boxShadow: '0 24px 80px rgba(0,0,0,0.12)',
        animation: 'scale-in 0.2s ease',
      }}>
        {/* Close */}
        <button onClick={onClose} style={{ position: 'absolute', top: 16, right: 16, background: '#f3f4f6', border: 'none', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', fontSize: 16 }}>✕</button>

        <h2 style={{ fontSize: 26, fontWeight: 800, color: '#111111', textAlign: 'center', marginBottom: 8 }}>Jump in</h2>
        <p style={{ fontSize: 15, color: '#6b7280', textAlign: 'center', marginBottom: 28 }}>Create or join a room to start playing</p>

        {/* Tabs */}
        <div style={{ display: 'flex', background: '#f3f4f6', borderRadius: 100, padding: 4, marginBottom: 28 }}>
          {(['create', 'join'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              flex: 1, textAlign: 'center', padding: '10px', borderRadius: 100,
              fontSize: 14, fontWeight: 500, cursor: 'pointer', transition: 'all 0.2s', border: 'none',
              background: tab === t ? '#fff' : 'transparent',
              color: tab === t ? '#111111' : '#6b7280',
              boxShadow: tab === t ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
            }}>
              {t === 'create' ? '✨ Create Room' : '🚀 Join by Code'}
            </button>
          ))}
        </div>

        {error && <p style={{ color: '#dc2626', fontSize: 13, textAlign: 'center', marginBottom: 16, background: '#fef2f2', padding: '10px', borderRadius: 8 }}>{error}</p>}

        {/* Username */}
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Your name</label>
        <input id="modal-username" value={username} onChange={e => setUsername(e.target.value)} placeholder="Enter your name" style={inputStyle}
          onFocus={e => { e.target.style.borderColor = '#06b6d4'; e.target.style.boxShadow = '0 0 0 3px rgba(6,182,212,0.12)'; }}
          onBlur={e => { e.target.style.borderColor = 'rgba(0,0,0,0.12)'; e.target.style.boxShadow = 'none'; }}
        />

        {tab === 'join' ? (
          <div style={{ marginTop: 20 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Room code</label>
            <input id="modal-room-code" value={roomCode} onChange={e => setRoomCode(e.target.value.toUpperCase())} placeholder="e.g. A3K9BX" style={{ ...inputStyle, letterSpacing: '0.1em', fontFamily: 'monospace', fontSize: '1rem' }} onKeyDown={e => e.key === 'Enter' && handleJoin()}
              onFocus={e => { e.target.style.borderColor = '#06b6d4'; e.target.style.boxShadow = '0 0 0 3px rgba(6,182,212,0.12)'; }}
              onBlur={e => { e.target.style.borderColor = 'rgba(0,0,0,0.12)'; e.target.style.boxShadow = 'none'; }}
            />
          </div>
        ) : (
          <div style={{ marginTop: 20 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8 }}>Visibility</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {[{ v: false, label: '🔒 Private' }, { v: true, label: '🌐 Public' }].map(({ v, label }) => (
                <button key={String(v)} onClick={() => setIsPublic(v)} style={{
                  flex: 1, padding: '11px', borderRadius: 12, cursor: 'pointer',
                  border: `1px solid ${isPublic === v ? '#111111' : 'rgba(0,0,0,0.1)'}`,
                  background: isPublic === v ? '#111111' : 'transparent',
                  color: isPublic === v ? '#fff' : '#6b7280',
                  fontSize: 13, fontWeight: 500, transition: 'all 0.2s',
                }}>{label}</button>
              ))}
            </div>
            <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 8, textAlign: 'center' }}>
              {isPublic ? '🌐 Appears in the public lobby' : '🔒 Share code to invite friends'}
            </p>
          </div>
        )}

        <button
          id="modal-submit-btn"
          onClick={tab === 'create' ? handleCreate : handleJoin}
          disabled={loading}
          style={{
            width: '100%', height: 52, background: loading ? '#e5e7eb' : '#111111',
            color: loading ? '#9ca3af' : '#fff', borderRadius: 100, fontSize: 16,
            fontWeight: 600, border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
            marginTop: 24, transition: 'all 0.2s',
          }}
          onMouseEnter={e => { if (!loading) e.currentTarget.style.background = '#374151'; }}
          onMouseLeave={e => { if (!loading) e.currentTarget.style.background = '#111111'; }}
        >
          {loading ? '⏳ Please wait…' : tab === 'create' ? '✨ Create & Enter' : '🚀 Join Room'}
        </button>

        <div style={{ textAlign: 'center', marginTop: 20, fontSize: 14, color: '#6b7280' }}>
          Or{' '}
          <button onClick={() => { onClose(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#06b6d4', fontWeight: 600, fontSize: 14 }}
            onClickCapture={() => setTimeout(() => window.location.href = '/public-rooms', 100)}>
            browse public rooms
          </button>
        </div>
      </div>
    </>
  );
}

// ── Main Landing page ─────────────────────────────────────────────────────────

export const Lobby: React.FC<LobbyProps> = ({ setAppState }) => {
  const [showModal, setShowModal] = useState(false);

  return (
    <div style={{ background: '#ffffff', color: '#111111', minHeight: '100vh' }}>
      <Navbar />
      <HeroSection onOpenModal={() => setShowModal(true)} />
      <FeatureIconRow />

      <SplitFeatureSection
        id="chess-section"
        eyebrow="Hand gesture control"
        headline="Play chess with just your hands."
        body="MediaPipe tracks 21 landmarks on your hand at 60fps. Hold a pinch for 0.4s to select a piece, aim at any valid square, and dwell again to confirm the move."
        cardContent={<ChessPreviewCard />}
        cardGradient="linear-gradient(135deg, #dbeafe, #e0e7ff, #fce7f3)"
      />

      <StatsRow />

      <SplitFeatureSection
        id="vbg-section"
        eyebrow="Privacy-first AI"
        headline="Your room, your background."
        body="AI-powered background removal runs entirely in your browser using MediaPipe Selfie Segmentation — no data ever leaves your device."
        cardContent={<VirtualBgPreviewCard />}
        cardGradient="linear-gradient(135deg, #d1fae5, #a7f3d0, #6ee7b7)"
        reversed
      />
      <GamesGrid onSelectGame={() => setShowModal(true)} />

      <SplitFeatureSection
        id="ai-coach-section"
        eyebrow="Built-in AI tutor"
        headline="AI Chess Coach — real-time analysis after every move."
        body="After each move, an LLM analyzes the board state and gives you a one-line strategic insight. Built on FEN serialization with structured JSON output and SSE streaming."
        cardContent={<AICoachPreviewCard />}
        cardGradient="linear-gradient(135deg, #fef3c7, #fde68a, #fbbf24)"
      />

      <Footer />

      {/* Floating CTA — visible on scroll */}
      <button
        id="floating-create-room"
        onClick={() => setShowModal(true)}
        style={{
          position: 'fixed', bottom: 32, right: 32, zIndex: 50,
          background: '#111111', color: '#fff',
          borderRadius: 100, padding: '14px 28px',
          fontSize: 15, fontWeight: 600, border: 'none', cursor: 'pointer',
          boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          display: 'flex', alignItems: 'center', gap: 8,
          transition: 'all 0.2s',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = '#374151'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = '#111111'; e.currentTarget.style.transform = 'translateY(0)'; }}
      >
        <ParticleCanvas density="low" style={{ borderRadius: 100, opacity: 0.3 }} />
        ✨ Create Room
      </button>

      {showModal && <CreateRoomModal onClose={() => setShowModal(false)} setAppState={setAppState} />}
    </div>
  );
};
